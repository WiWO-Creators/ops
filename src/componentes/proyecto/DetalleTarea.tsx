'use client'

import { useCallback, useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { ArbolDrive } from '@/componentes/archivos/ArbolDrive'
import { useUbicacionTarea } from '@/componentes/auditoria/accion'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { EnlacePanelClasico } from '@/componentes/presentadores/EnlacePanelClasico'
import { GrupoAvatares } from '@/componentes/presentadores/Avatar'
import { Etiquetas } from '@/componentes/presentadores/Etiqueta'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { listaDe, nombreDe } from '@/datos/catalogos'
import { camposLegibles } from '@/dominio/campos-personalizados'
import { GLOSARIO } from '@/dominio/glosario'
import { aTextoPlano } from '@/componentes/proyecto/formatos'
import { cn } from '@/lib/clases'
import type { CampoLegible } from '@/dominio/campos-personalizados'
import type { EstadoLookup, Lookups, Proceso } from '@/datos/recursos'
import type { Sobre } from '@/datos/tipos'
import { conId, type FuenteDeTarea } from '@/dominio/fuente-proyecto'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { instanteDeCierre } from '@/dominio/cierre-tarea'
import { hoyLocal } from '@/lib/fechas'
import { BloqueSla } from './BloqueSla'
import { BloqueoDeProceso } from './BloqueoDeProceso'
import { CabeceraFichaTarea } from './CabeceraFichaTarea'
import { TarjetaDeComentario } from './TarjetaDeComentario'
import { ESTADO_COMPLETO, comentarioParaMostrar, type ProcesoDeFicha } from './tareas'
import { CompartirTarea } from './CompartirTarea'
import { BotonDuplicarTarea } from './DuplicarTarea'
import { EstadoDeTarea } from './EstadoDeTarea'
import { MenuEstadoTarea } from './MenuEstadoTarea'
import { MenuHitoTarea } from './MenuHitoTarea'
import { Cronometros } from './Cronometros'
import { EdicionTarea } from './EdicionTarea'
import { ListaChecklist } from './ListaChecklist'
import { ListaIteraciones } from './ListaIteraciones'
import { PanelAdjuntos } from './PanelArchivos'
import { mensajeDeRespuesta, pedirRespuesta } from '@/datos/cliente'

/**
 * Detalle de una Tarea, para el modal que lo muestra (`ModalTarea`).
 *
 * Pide dos cosas, las dos por `fuente`: la tarea y los catalogos. Los catalogos no son adorno:
 * `status` y `priority` llegan como numeros, y sin la lista un "2" en pantalla no dice nada. Van en
 * la misma tanda porque mostrar el detalle sin ellos es mostrarlo a medias.
 *
 * **Es la misma ficha para los dos sujetos**, y no tiene ni una rama por sujeto. Lo que la adapta
 * son dos cosas y nada mas:
 *
 *  - **La clave ausente no se dibuja.** El tipo que consume es `ProcesoDeFicha`, donde todo lo
 *    podable es opcional: si el contrato no manda asignados, etiquetas, contadores o campos
 *    personalizados, esas filas y esas secciones no existen. `undefined` es "no corresponde", no
 *    "vacio".
 *  - **`fuente.subrecursosDeTarea` en `null`** apaga los bloques que se piden aparte —cronometros,
 *    lista de control, iteraciones, Drive, adjuntos, el enlace publico y el enlace al panel viejo—,
 *    porque son rutas que ese sujeto no tiene. Lo que el contrato si manda adentro de la ficha
 *    (comentarios, checklist, adjuntos, tiempo registrado) se lee igual, de solo lectura.
 *
 * Lo que **escribe** no depende de ninguna de las dos: entra por `puedeEditar`, `puedeBorrar` y
 * `puedeCrear`, que en el portal llegan en `false`.
 *
 * El 404 se separa del error a proposito: un id que no existe —un enlace viejo, una tarea borrada—
 * no tiene nada que reintentar, y ofrecer un boton que va a fallar igual es mentir.
 *
 * Las iteraciones y los cronometros piden lo suyo aparte: los dos se recargan solos al escribir, y
 * hacerlo desde aca obligaria a volver a traer la tarea entera y los catalogos por cada alta.
 */

interface PropsDetalleTarea {
  procesoId: number
  /** De donde baja la ficha. Ver `FuenteDeTarea`: aporta las dos rutas y apaga los subrecursos. */
  fuente: FuenteDeTarea
  /** `true` si quien mira tiene `edit` sobre tareas. Solo decide si se ofrece pedir la aprobacion. */
  puedeEditar?: boolean
  /** `true` si quien mira tiene `delete` sobre tareas. La API lo vuelve a exigir igual. */
  puedeBorrar?: boolean
  /**
   * `true` si quien mira tiene `create` sobre tareas. Solo decide si se ofrece duplicar: la copia
   * es un alta, y la API vuelve a exigir la capacidad.
   */
  puedeCrear?: boolean
  /** Se llama con la tarea ya borrada, para que quien monte el detalle lo cierre y recargue. */
  onBorrada?: () => void
  /** Se llama con la copia ya creada, para que el listado de atras vuelva a pedir sus datos. */
  onDuplicada?: () => void
  /**
   * Se llama despues de cada escritura sobre la tarea —estado, edicion, hito, SLA, bloqueo—, para
   * que el listado de atras deje de mostrar los datos viejos.
   */
  onCambiada?: () => void
  className?: string
}

/** Estado de la carga. El error es un texto ya listo para mostrar, no un envelope. */
type Carga =
  | { fase: 'cargando' }
  | { fase: 'listo', tarea: ProcesoDeFicha, lookups: Lookups }
  | { fase: 'noEncontrada' }
  | { fase: 'error', mensaje: string }

export function DetalleTarea (
  {
    procesoId,
    fuente,
    puedeEditar = false,
    puedeBorrar = false,
    puedeCrear = false,
    onBorrada,
    onDuplicada,
    onCambiada,
    className
  }: PropsDetalleTarea
): ReactElement {
  useUbicacionTarea(procesoId)
  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' })
  const [intento, setIntento] = useState(0)
  const [editando, setEditando] = useState(false)
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null)

  /**
   * Borra la tarea.
   *
   * Va por `POST /tasks/bulk` con un solo id porque es el unico borrado que la API expone para
   * Procesos: no hay `DELETE /tasks/{id}`. Mandar uno por la via de muchos no es un atajo, es la
   * misma ruta que ya exige `tasks.delete` y que ya deja la fila en el registro de actividad.
   *
   * El borrado es fisico y se lleva por delante asignados, seguidores, comentarios, checklist,
   * cronometros y etiquetas. Por eso confirma en dos pasos y lo dice antes, no despues.
   */
  async function borrar (): Promise<void> {
    setBorrando(true)
    setErrorBorrado(null)

    const resultado = await escribirEnBff<{ aplicados: number }>(
      'tasks/bulk', 'POST', { accion: 'delete', ids: [procesoId] }
    )

    setBorrando(false)

    if (!resultado.ok) {
      setErrorBorrado(resultado.mensaje)
      return
    }

    // `aplicados: 0` es el caso en que la API acepto el pedido pero no borro nada —la tarea dejo de
    // ser visible entre medio—. Cerrar como si hubiera funcionado dejaria la tarea en la lista.
    if (resultado.datos?.aplicados !== 1) {
      setErrorBorrado('No se pudo borrar: puede que ya no tengas acceso a esta tarea.')
      return
    }

    setConfirmandoBorrado(false)
    onBorrada?.()
  }

  // Vuelve a la fase de carga antes de pedir: si no, el reintento deja el cartel viejo en pantalla
  // mientras la peticion nueva viaja.
  const reintentar = useCallback(() => {
    setCarga({ fase: 'cargando' })
    setIntento((n) => n + 1)
  }, [])

  // Tras escribir, la ficha se vuelve a pedir y quien la monta se entera: sin el aviso, una tarea
  // recien completada sigue "En curso" en el listado que quedo debajo del modal.
  const alCambiar = useCallback(() => {
    reintentar()
    onCambiada?.()
  }, [reintentar, onCambiada])

  useEffect(() => {
    const control = new AbortController()

    void cargar(fuente, procesoId, control.signal).then((resultado) => {
      if (!control.signal.aborted) setCarga(resultado)
    })

    return () => { control.abort() }
  }, [fuente, procesoId, intento])

  if (carga.fase === 'cargando') return <Cargando mensaje="Cargando la tarea…" className={className} />

  if (carga.fase === 'noEncontrada') {
    return (
      <Vacio
        titulo={`No encontramos esta ${GLOSARIO.proceso.singular.toLowerCase()}`}
        descripcion="Puede que la hayan borrado o que el enlace apunte a otra cosa."
        className={className}
      />
    )
  }

  if (carga.fase === 'error') {
    return <ErrorEstado detalle={carga.mensaje} onReintentar={reintentar} className={className} />
  }

  const { tarea, lookups } = carga
  const prioridad = valorDeCatalogo(listaDe(lookups, 'task_priorities'), tarea.priority)
  // Los subrecursos —cronometros, lista de control, iteraciones, Drive, adjuntos, enlace publico—
  // cuelgan de rutas que solo el equipo tiene. Con la raiz en `null` no se montan: es lo que deja la
  // ficha del cliente sin una sola peticion que vaya a devolver 404.
  const subrecursos = fuente.subrecursosDeTarea
  // Si la fila del Hito ofrece el menu para cambiarlo. Sin Espacio no hay catalogo de hitos que
  // ofrecer, y sin `puedeEditar` —el portal— no hay nada que elegir.
  const menuDeHito = puedeEditar && tarea.project !== undefined && tarea.project !== null
  const camposPersonalizados = tarea.custom_fields
  const enlaces = camposLegibles((camposPersonalizados ?? []).filter((campo) => campo.type === 'link'))

  return (
    <div className={cn('flex flex-col gap-5', className)}>
        <header className="border-linea bg-superficie-acentuada rounded-tarjeta flex flex-col gap-2 border p-4">
          {/* `nivel={3}`: el dialogo que monta esta ficha ya aporta el `h2` que la nombra, asi que el
              titulo de la Tarea cuelga de el. El tamaño es el mismo que en la vista compartida. */}
          <CabeceraFichaTarea
            titulo={tarea.name}
            marca={tarea.project?.name ?? null}
            codigo={tarea.patente ?? `#${tarea.id}`}
            nivel={3}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {/* La insignia de estado es ademas un menu cuando se puede editar: es el gesto mas
                repetido de la ficha, y hasta ahora obligaba a abrir el formulario entero y guardarlo
                para mover un estado. Es el mismo control que ya usa el kanban de Hitos. */}
            {puedeEditar
              ? (
                  <MenuEstadoTarea
                    tareaId={tarea.id}
                    nombreTarea={tarea.name}
                    estado={tarea.status}
                    catalogo={listaDe(lookups, 'task_statuses')}
                    onCambiado={alCambiar}
                  />
                )
              : <EstadoDeTarea status={tarea.status} catalogo={listaDe(lookups, 'task_statuses')} />}
            <Insignia tamano="chico" color={prioridad.color}>{prioridad.nombre}</Insignia>
            {/* Al final de la fila de insignias y no arriba del titulo: compartir es una salida
                lateral, no lo que la persona vino a hacer al detalle.

                Solo con los subrecursos del equipo: el enlace publico vive en `tasks/{id}/share`,
                que un contacto no tiene, y de todos modos compartir hacia afuera lo que ya se le
                compartio a el no es una accion del portal. */}
            {subrecursos !== null && <CompartirTarea procesoId={procesoId} />}

            {/* Duplicar vive al lado de compartir y no entre "Editar" y "Eliminar": las dos son
                salidas laterales sobre la tarea que se esta mirando, y las de la derecha son las que
                la cambian. La copia arranca del nombre del original, que es justo lo que se lee
                arriba. */}
            {puedeCrear && (
              <BotonDuplicarTarea
                tareaId={tarea.id}
                nombreTarea={tarea.name}
                onDuplicada={() => onDuplicada?.()}
              />
            )}

            {/* El alta pide solo lo indispensable, asi que este boton es la unica via para completar
                el resto: sin el, una tarea creada al vuelo se queda sin asignados para siempre. */}
            {puedeEditar && (
              <Boton
                variante="secundario"
                tamano="chico"
                className="ml-auto"
                onClick={() => setEditando(true)}
              >
                Editar
              </Boton>
            )}

            {/* Borrar vive en el detalle y no en la fila del listado: es irreversible, y la decision
                se toma mirando la tarea, no un renglon de una tabla. Sin `puedeEditar` toma el
                `ml-auto` para quedar igual de alineado. */}
            {puedeBorrar && !confirmandoBorrado && (
              <Boton
                variante="sutil"
                tamano="chico"
                className={puedeEditar ? undefined : 'ml-auto'}
                onClick={() => { setConfirmandoBorrado(true); setErrorBorrado(null) }}
              >
                Eliminar
              </Boton>
            )}
          </div>

          {/* Completar vive en la ficha porque es donde se mira la tarea para decidir que ya esta.
              El listado ya tiene su propia accion; esta ademas deja elegir con que fecha cierra. */}
          {puedeEditar && tarea.status !== ESTADO_COMPLETO && (
            <CompletarTarea tarea={tarea} onCompletada={alCambiar} />
          )}

          {/* Confirmacion en la misma ficha y no en otro dialogo: este detalle YA vive dentro de un
              modal, y un `Dialog` sobre otro deja los dos peleando por el foco. */}
          {puedeBorrar && confirmandoBorrado && (
            <div className="border-linea flex flex-col gap-2 border-t pt-2">
              <p className="text-texto-sutil text-xs">
                Se elimina esta {GLOSARIO.proceso.singular.toLowerCase()} y con ella sus comentarios,
                checklist, tiempo registrado, asignados y seguidores. No se puede deshacer.
              </p>

              {errorBorrado !== null && (
                <p role="alert" className="text-texto-peligro text-xs">{errorBorrado}</p>
              )}

              <div className="flex justify-end gap-2">
                <Boton variante="sutil" tamano="chico" onClick={() => setConfirmandoBorrado(false)}>
                  Cancelar
                </Boton>
                <Boton
                  variante="peligro"
                  tamano="chico"
                  cargando={borrando}
                  onClick={() => { void borrar() }}
                >
                  Eliminar
                </Boton>
              </div>
            </div>
          )}
        </header>

        {/* La descripcion va inmediatamente debajo de la cabecera y no al final: es lo que cuenta de
            que se trata la Tarea, y leerla despues de los contadores y los enlaces obliga a bajar
            hasta el fondo para entender la ficha que se acaba de abrir. */}
        <section className="flex flex-col gap-2">
          <h4 className="text-texto-tenue text-sm font-semibold">Descripción</h4>
          <Descripcion html={tarea.description} />
        </section>

        {/* Montado solo mientras se edita: asi el formulario arranca siempre en los valores que se
            acaban de traer, y cerrar descarta lo que no se guardo. */}
        {puedeEditar && editando && (
          <EdicionTarea
            // El formulario necesita la Tarea entera —facturacion, seguidores, recurrencia— y solo
            // se monta con `puedeEditar`, que es una capacidad del panel: alli la ficha llego por
            // `GET /tasks/{id}` y trae todo. En el portal `puedeEditar` es `false` y esto no existe.
            tarea={tarea as Proceso}
            lookups={lookups}
            descripcion={typeof tarea.description === 'string' ? aTextoPlano(tarea.description) : ''}
            onCerrar={() => setEditando(false)}
            onGuardada={alCambiar}
          />
        )}

        {/* Cada fila existe solo si el contrato mando su clave. `undefined` es "no corresponde" y no
            "vacio": una fila "Asignados —" en el portal insinuaria que la Tarea no tiene a nadie. */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          {tarea.project !== undefined && (
            <Dato etiqueta={GLOSARIO.espacio.singular}>{tarea.project?.name ?? SIN_DATO}</Dato>
          )}
          {/* El Hito se cambia desde acá y no solo arrastrando la tarjeta en el kanban: la ficha
              es donde se mira la tarea para decidir a que semana pertenece. Sin Espacio no hay
              catalogo de hitos que ofrecer, asi que ahi queda el nombre suelto.

              Sin hito y sin menu que ofrecer, la fila **no se dibuja**: es la misma regla que ya
              gobierna "Asignados" tres lineas mas arriba, y un "Hito —" es una declaracion de
              ausencia que no le sirve a quien no puede ponerle uno. */}
          {tarea.milestone !== undefined && (menuDeHito || tarea.milestone !== null) && (
            <Dato etiqueta={GLOSARIO.hito.singular}>
              {menuDeHito && tarea.project !== undefined && tarea.project !== null
                ? (
                    <MenuHitoTarea
                      tareaId={tarea.id}
                      nombreTarea={tarea.name}
                      espacioId={tarea.project.id}
                      hito={tarea.milestone}
                      onCambiado={alCambiar}
                    />
                  )
                : tarea.milestone?.name ?? SIN_DATO}
            </Dato>
          )}
          <Dato etiqueta="Inicio"><Fecha valor={tarea.start_date} /></Dato>
          <Dato etiqueta="Entrega"><Fecha valor={tarea.due_date} comoVencimiento /></Dato>
          {tarea.assignees !== undefined && (
            <Dato etiqueta="Asignados">
              <GrupoAvatares personas={tarea.assignees} tamano="chico" />
            </Dato>
          )}
          {tarea.tags !== undefined && (
            <Dato etiqueta="Etiquetas">
              {tarea.tags.length === 0 ? SIN_DATO : <Etiquetas etiquetas={tarea.tags} maximo={4} />}
            </Dato>
          )}

          {/* Los campos personalizados van al final y solo los que tienen algo cargado: son 29
              definiciones, y una fila con un guion por cada una taparia la ficha entera. */}
          {camposLegibles((camposPersonalizados ?? []).filter((campo) => campo.type !== 'link')).map((campo) => (
            <Dato key={campo.id} etiqueta={campo.nombre}>
              <ValorPersonalizado campo={campo} />
            </Dato>
          ))}
        </dl>

        {/* Detras del titulo y la ficha de datos, y no al final de todo: poner tiempo es a lo que
            se viene al abrir una Tarea, y enterrado bajo checklist y archivos obligaba a bajar cada
            vez. Tampoco va antes de los datos: primero se reconoce la Tarea, despues se le cuenta
            el tiempo. */}
        {subrecursos !== null && <Cronometros procesoId={procesoId} />}

        {/* Sin los cronometros —el cliente no marca horas— queda el total, y solo si el Proyecto lo
            comparte (`view_task_total_logged_time`). */}
        <TiempoRegistrado segundos={tarea.total_logged_seconds} legible={tarea.duration_hm} />

        {/* La seccion entera desaparece cuando el contrato no manda campos personalizados: el
            "Sin enlaces guardados" es informacion para quien puede agregarlos, no para quien no. */}
        {camposPersonalizados !== undefined && (
          <section className="flex flex-col gap-2">
            <h4 className="text-texto-tenue text-sm font-semibold">Enlaces</h4>
            {enlaces.length === 0
              ? <p className="text-texto-sutil text-sm">Sin enlaces guardados.{puedeEditar ? ' Puedes agregarlos al editar la tarea.' : ''}</p>
              : <dl className="grid gap-3 sm:grid-cols-2">
                  {enlaces.map((campo) => (
                    <Dato key={campo.id} etiqueta={campo.nombre}><ValorPersonalizado campo={campo} /></Dato>
                  ))}
                </dl>}
          </section>
        )}

        <BloqueSla tarea={tarea} puedeEditar={puedeEditar} onCambiado={alCambiar} />
        <BloqueoDeProceso tarea={tarea} puedeEditar={puedeEditar} onCambiado={alCambiar} />

        <Contadores counts={tarea.counts} />

        {/* La lista de control se escribe desde su propio panel, que se recarga solo al tildar. Donde
            no hay esa ruta, lo que llego adentro de la ficha se lee y no se toca. */}
        {subrecursos !== null
          ? <ListaChecklist procesoId={procesoId} />
          : <ChecklistDeLectura items={tarea.checklist} />}

        {subrecursos !== null && <ListaIteraciones procesoId={procesoId} />}

        {/* Drive y los adjuntos del panel son dos almacenes con escritura propia. El cliente ve los
            adjuntos que el contrato le manda, y solo si el Proyecto los comparte. */}
        {subrecursos !== null
          ? (
            <section className="flex flex-col gap-2">
              <h4 className="text-texto-tenue text-sm font-semibold">Archivos</h4>
              <ArbolDrive raiz="tasks" id={procesoId} />
              <PanelAdjuntos raiz="tasks" id={procesoId} />
            </section>
            )
          : <AdjuntosDeLectura adjuntos={tarea.attachments} />}

        <Comentarios comentarios={tarea.comments} />

        {subrecursos !== null && (
          <EnlacePanelClasico entidad="proceso" id={procesoId} className="self-start" />
        )}
    </div>
  )
}

/**
 * El tiempo registrado en la Tarea, como una sola linea.
 *
 * Es lo que queda del bloque de cronometros cuando quien mira no marca horas: el total, ya sumado
 * por el backend. No se dibuja si el contrato no lo manda —el Proyecto puede no compartirlo— ni se
 * calcula acá: un total propio y uno del servidor discutiendo es como se llega a dos numeros.
 *
 * @param segundos Total en segundos, o `undefined` si no corresponde mostrarlo.
 * @param legible El mismo total ya formateado por el backend, si vino.
 * @returns La linea, o nada.
 */
function TiempoRegistrado (
  { segundos, legible }: { segundos: number | undefined, legible: string | undefined }
): ReactElement | null {
  if (segundos === undefined) return null

  return (
    <section className="border-linea bg-superficie-elevada rounded-tarjeta flex items-baseline justify-between gap-3 border p-3">
      <h4 className="text-texto-sutil text-xs font-medium tracking-[0.08em] uppercase">
        Tiempo registrado
      </h4>
      <span data-numerico className="text-texto text-sm font-semibold tabular-nums">
        {legible ?? `${Math.round(segundos / 3600)} h`}
      </span>
    </section>
  )
}

/**
 * La lista de control, de solo lectura.
 *
 * El avance de cada punto se dice con una **marca tipografica** y con el texto tachado, no con un
 * `<input type="checkbox" disabled>`: en una pantalla sin escritura una casilla apagada se lee como
 * un control roto —algo que deberia poder pulsarse y no responde— en vez de como un dato. El conteo
 * va en el titulo, igual que en el panel que si escribe.
 *
 * @param items Los items, o `undefined` si el contrato no los manda.
 * @returns La lista, o nada.
 */
function ChecklistDeLectura (
  { items }: { items: ProcesoDeFicha['checklist'] }
): ReactElement | null {
  if (items === undefined) return null

  const hechos = items.filter((item) => item.finished).length

  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-texto-tenue text-sm font-semibold">
        Lista de control {items.length > 0 && <span className="text-texto-sutil font-normal">{hechos}/{items.length}</span>}
      </h4>

      {items.length === 0
        ? <p className="text-texto-sutil text-sm">Esta {GLOSARIO.proceso.singular.toLowerCase()} no tiene lista de control.</p>
        : (
          <ul className="flex flex-col gap-1">
            {items.map((item) => (
              <li key={item.id} className="flex items-baseline gap-2 text-sm">
                {/* `aria-hidden` en la marca y el estado en texto al final: un lector de pantalla
                    que anuncia "✓" no dice nada, y sin la casilla hace falta decirlo con palabras. */}
                <span
                  aria-hidden
                  className={`w-3 shrink-0 text-center ${item.finished ? 'text-texto-exito' : 'text-texto-sutil'}`}
                >
                  {item.finished ? '✓' : '·'}
                </span>
                <span className={item.finished ? 'text-texto-tenue line-through' : 'text-texto'}>
                  {aTextoPlano(item.description)}
                </span>
                <span className="sr-only">{item.finished ? '(hecho)' : '(pendiente)'}</span>
              </li>
            ))}
          </ul>
          )}
    </section>
  )
}

/**
 * Los adjuntos de la Tarea, de solo lectura.
 *
 * Un adjunto sin `url` se muestra igual, como texto: el nombre dice que el archivo existe, y
 * esconderlo haria pensar que no hay ninguno.
 *
 * @param adjuntos Los adjuntos, o `undefined` si el contrato no los manda.
 * @returns La lista, o nada.
 */
function AdjuntosDeLectura (
  { adjuntos }: { adjuntos: ProcesoDeFicha['attachments'] }
): ReactElement | null {
  if (adjuntos === undefined) return null

  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-texto-tenue text-sm font-semibold">Archivos</h4>

      {adjuntos.length === 0
        ? <p className="text-texto-sutil text-sm">Sin archivos adjuntos.</p>
        : (
          <ul className="flex flex-col gap-2">
            {adjuntos.map((adjunto) => {
              const nombre = adjunto.subject ?? adjunto.file_name

              return (
                <li key={adjunto.id} className="rounded-chico border-linea border p-3 text-sm">
                  {adjunto.url === null
                    ? <span className="text-texto">{nombre}</span>
                    : (
                      <a
                        href={adjunto.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-acento break-all underline underline-offset-4"
                      >
                        {nombre}
                      </a>
                      )}
                </li>
              )
            })}
          </ul>
          )}
    </section>
  )
}

/**
 * La conversacion de la Tarea, de solo lectura.
 *
 * Usa la **misma tarjeta** (`TarjetaDeComentario`) en la ficha del equipo y en la del cliente: dos
 * tarjetas distintas es como la del cliente termino sin avatar y sin la insignia de quien es del
 * cliente.
 *
 * @param comentarios Los comentarios, o `undefined` si el contrato no los manda.
 * @returns El hilo, o nada.
 */
function Comentarios (
  { comentarios }: { comentarios: ProcesoDeFicha['comments'] }
): ReactElement | null {
  if (comentarios === undefined) return null

  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-texto-tenue text-sm font-semibold">Comentarios</h4>

      {comentarios.length === 0
        ? <p className="text-texto-sutil text-sm">Todavía no hay comentarios.</p>
        : (
          <ul className="flex flex-col gap-2">
            {comentarios.map((comentario) => (
              <TarjetaDeComentario
                key={comentario.id}
                comentario={comentarioParaMostrar(comentario)}
              />
            ))}
          </ul>
          )}
    </section>
  )
}

const SIN_DATO = '—'

/**
 * Marca la Tarea como completada, eligiendo con que fecha cierra.
 *
 * El caso normal —se termino hoy— es **un solo clic**: la fecha ya viene en hoy y, si no se toca,
 * solo sale el `mark-complete` de siempre, que sella el cierre con la hora de ahora. El campo esta
 * ahi para el otro caso, el que rompia la desviacion: la tarea que se termino el lunes y se marca el
 * jueves quedaba cerrada el jueves. Elegir otra fecha agrega un segundo paso explicito,
 * `PATCH /tasks/{id}` con `completed_at`, que es lo unico que el contrato acepta.
 *
 * Los dos pasos se muestran como uno solo, pero no son atomicos: si el `mark-complete` funciono y el
 * parche no, la tarea **queda completada**. Por eso el fallo lo dice con esas palabras y el boton
 * pasa a reintentar solo la fecha, en vez de volver a completar algo ya completado.
 */
function CompletarTarea (
  { tarea, onCompletada }: { tarea: ProcesoDeFicha, onCompletada: () => void }
): ReactElement {
  const [fecha, setFecha] = useState(() => hoyLocal())
  const [yaCompletada, setYaCompletada] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  /** Completa y, si la fecha no es hoy, la corrige. Nunca lanza: el error se lee bajo el campo. */
  async function completar (): Promise<void> {
    setGuardando(true)
    setFallo(null)

    if (!yaCompletada) {
      const cierre = await escribirEnBff<Proceso>(`tasks/${tarea.id}/actions/mark-complete`, 'POST')

      if (!cierre.ok) {
        setGuardando(false)
        setFallo(cierre.mensaje)
        return
      }

      setYaCompletada(true)
    }

    // Hoy ya es lo que sello `mark-complete`: un parche identico solo agregaria una peticion y una
    // linea mas en el registro de actividad.
    if (fecha === hoyLocal()) {
      setGuardando(false)
      onCompletada()
      return
    }

    const instante = instanteDeCierre(fecha)

    if (instante === null) {
      setGuardando(false)
      setFallo('Elegí una fecha válida.')
      return
    }

    const parche = await escribirEnBff<Proceso>(`tasks/${tarea.id}`, 'PATCH', { completed_at: instante })

    setGuardando(false)

    if (!parche.ok) {
      setFallo(`La tarea quedó completada, pero la fecha no se pudo guardar. ${parche.mensaje}`)
      return
    }

    onCompletada()
  }

  return (
    <div className="border-linea flex flex-wrap items-end gap-2 border-t pt-2">
      <Campo
        etiqueta="Fecha de completado"
        error={fallo ?? undefined}
        className="min-w-44 flex-1"
      >
        {(props) => (
          <Entrada
            {...props}
            type="date"
            value={fecha}
            min={tarea.start_date ?? undefined}
            max={hoyLocal()}
            onChange={(evento) => setFecha(evento.target.value)}
          />
        )}
      </Campo>

      <Boton
        variante="secundario"
        tamano="chico"
        cargando={guardando}
        onClick={() => { void completar() }}
      >
        {yaCompletada ? 'Guardar la fecha' : 'Marcar completada'}
      </Boton>
    </div>
  )
}

/**
 * El valor de un campo personalizado en la ficha.
 *
 * Un `link` se pinta como enlace abrible y no como texto: es lo unico que hace que un "Link de
 * Drive" sirva de algo desde el panel. `camposLegibles()` ya decidio si la URL se puede abrir, asi
 * que aca no se vuelve a mirar el `type`.
 *
 * `rel="noreferrer"` acompaña a `target="_blank"`: sin el, la pestaña nueva recibe el `Referer` del
 * panel y, en navegadores viejos, un `window.opener` que puede navegar esta.
 */
function ValorPersonalizado ({ campo }: { campo: CampoLegible }): ReactElement {
  if (campo.enlace === null) return <>{campo.texto}</>

  return (
    <a
      href={campo.enlace}
      target="_blank"
      rel="noreferrer"
      className="text-acento break-all underline underline-offset-4"
    >
      {campo.texto}
    </a>
  )
}

/** Un par etiqueta/valor de la ficha. La etiqueta va en versalita, como en `ResumenProyecto`. */
function Dato ({ etiqueta, children }: { etiqueta: string, children: ReactNode }): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-texto-sutil text-xs font-medium tracking-[0.08em] uppercase">
        {etiqueta}
      </dt>
      <dd className="text-texto min-w-0 text-sm">{children}</dd>
    </div>
  )
}

/**
 * Los contadores que la API ya resuelve.
 *
 * La lista de control **no** esta aca aunque `counts` la traiga: su panel se recarga solo al tildar
 * un item, y este bloque viene del `GET /tasks/{id}` que se pidio al abrir. Los dos numeros a la
 * vez serian el viejo y el nuevo discutiendo sobre trabajo dado por hecho, asi que el conteo vive
 * en el encabezado de `ListaChecklist`, que es el que siempre esta al dia.
 */
function Contadores ({ counts }: { counts: ProcesoDeFicha['counts'] }): ReactElement | null {
  if (counts === undefined) return null
  // Los dos en cero no informan nada: las secciones de Archivos y Comentarios, unas lineas mas
  // abajo, ya dicen "Sin archivos adjuntos" y "Todavia no hay comentarios". Dos ceros arriba de esas
  // dos frases son la misma ausencia contada dos veces en la misma pantalla.
  if (counts.comments === 0 && counts.attachments === 0) return null

  return (
    <ul className="border-linea bg-superficie-elevada rounded-tarjeta grid grid-cols-2 gap-2 border p-3">
      <Contador etiqueta="Comentarios" valor={String(counts.comments)} />
      <Contador etiqueta="Adjuntos" valor={String(counts.attachments)} />
    </ul>
  )
}

/** Un contador suelto: el numero grande arriba, el nombre debajo. */
function Contador ({ etiqueta, valor }: { etiqueta: string, valor: string }): ReactElement {
  return (
    <li className="flex flex-col items-center gap-0.5">
      <span data-numerico className="text-texto text-lg leading-none font-semibold tabular-nums">{valor}</span>
      <span className="text-texto-sutil text-xs font-medium tracking-[0.08em] uppercase">
        {etiqueta}
      </span>
    </li>
  )
}

/**
 * La descripcion de la tarea, como texto.
 *
 * **Nunca con `dangerouslySetInnerHTML`.** El HTML lo escriben personas en el editor de Perfex y
 * llega tal cual: inyectarlo seria ejecutar en nuestra sesion lo que cualquiera haya guardado ahi
 * —un `<script>`, un `onerror=` en una imagen rota—, o sea un XSS con la cookie de sesion adentro.
 * Se muestra el texto plano, que React escapa solo, y los saltos de linea se conservan con CSS.
 */
function Descripcion ({ html }: { html: string | null | undefined }): ReactElement {
  const texto = typeof html === 'string' ? aTextoPlano(html) : ''

  if (texto === '') {
    return <p className="text-texto-sutil text-sm">Esta {GLOSARIO.proceso.singular.toLowerCase()} no tiene descripción.</p>
  }

  return <p className="text-texto-tenue max-w-prose text-sm whitespace-pre-line">{texto}</p>
}

/** Nombre y color de un valor de catalogo, listos para una insignia. */
function valorDeCatalogo (lista: EstadoLookup[], id: number): { nombre: string, color: string | null } {
  return { nombre: nombreDe(lista, id), color: lista.find((item) => item.id === id)?.color ?? null }
}


/**
 * Trae la tarea y los catalogos.
 *
 * Nunca lanza: el error del contrato es un valor mas y el cajon tiene que poder mostrarlo.
 *
 * @param fuente de donde baja la ficha: aporta las dos rutas y con ellas el sujeto
 * @param procesoId la tarea
 * @param senal aborta las dos peticiones si el componente se desmonta
 * @returns el estado de carga resuelto — `listo`, `noEncontrada` o `error`
 */
async function cargar (fuente: FuenteDeTarea, procesoId: number, senal: AbortSignal): Promise<Carga> {
  try {
    const [tarea, lookups] = await Promise.all([
      pedirRespuesta(conId(fuente.tarea, procesoId), senal),
      pedirRespuesta(fuente.lookups, senal)
    ])

    if (tarea.status === 404) return { fase: 'noEncontrada' }

    if (!tarea.ok) return { fase: 'error', mensaje: await mensajeDeRespuesta(tarea) }
    if (!lookups.ok) return { fase: 'error', mensaje: await mensajeDeRespuesta(lookups) }

    const sobreTarea = await tarea.json() as Sobre<ProcesoDeFicha>
    const sobreLookups = await lookups.json() as Sobre<Lookups>

    return { fase: 'listo', tarea: sobreTarea.data, lookups: sobreLookups.data }
  } catch (fallo) {
    if (senal.aborted) return { fase: 'cargando' }

    return { fase: 'error', mensaje: fallo instanceof Error ? fallo.message : 'No se pudo cargar la tarea.' }
  }
}
