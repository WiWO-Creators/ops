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
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { instanteDeCierre } from '@/dominio/cierre-tarea'
import { hoyLocal } from '@/lib/fechas'
import { BloqueSla } from './BloqueSla'
import { ESTADO_COMPLETO } from './tareas'
import { CompartirTarea } from './CompartirTarea'
import { Cronometros } from './Cronometros'
import { EdicionTarea } from './EdicionTarea'
import { ListaChecklist } from './ListaChecklist'
import { ListaIteraciones } from './ListaIteraciones'
import { PanelAdjuntos } from './PanelArchivos'
import { mensajeDeRespuesta, pedirRespuesta } from '@/datos/cliente'

/**
 * Detalle de una Tarea, para el modal que lo muestra (`ModalTarea`).
 *
 * Pide dos cosas: la tarea (`/tasks/{id}`, que ya trae `description`) y los catalogos (`/lookups`).
 * La tarea se pide con `?include=custom_fields`: sin ese include la clave no viene, y el "Área de la
 * compañía" y el "Link de Drive" solo se podrian ver entrando a editar.
 * Los catalogos no son adorno: `status` y `priority` llegan como numeros, y sin la lista un "2" en
 * pantalla no dice nada. Van en la misma tanda porque mostrar el detalle sin ellos es mostrarlo a
 * medias.
 *
 * El 404 se separa del error a proposito: un id que no existe —un enlace viejo, una tarea borrada—
 * no tiene nada que reintentar, y ofrecer un boton que va a fallar igual es mentir.
 *
 * Las iteraciones y los cronometros piden lo suyo aparte: los dos se recargan solos al escribir, y
 * hacerlo desde aca obligaria a volver a traer la tarea entera y los catalogos por cada alta.
 */

interface PropsDetalleTarea {
  procesoId: number
  /** `true` si quien mira tiene `edit` sobre tareas. Solo decide si se ofrece pedir la aprobacion. */
  puedeEditar?: boolean
  /** `true` si quien mira tiene `delete` sobre tareas. La API lo vuelve a exigir igual. */
  puedeBorrar?: boolean
  /** Se llama con la tarea ya borrada, para que quien monte el detalle lo cierre y recargue. */
  onBorrada?: () => void
  className?: string
}

/** Estado de la carga. El error es un texto ya listo para mostrar, no un envelope. */
type Carga =
  | { fase: 'cargando' }
  | { fase: 'listo', tarea: Proceso, lookups: Lookups }
  | { fase: 'noEncontrada' }
  | { fase: 'error', mensaje: string }

export function DetalleTarea (
  { procesoId, puedeEditar = false, puedeBorrar = false, onBorrada, className }: PropsDetalleTarea
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

  useEffect(() => {
    const control = new AbortController()

    void cargar(procesoId, control.signal).then((resultado) => {
      if (!control.signal.aborted) setCarga(resultado)
    })

    return () => { control.abort() }
  }, [procesoId, intento])

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
  const estado = valorDeCatalogo(listaDe(lookups, 'task_statuses'), tarea.status)
  const prioridad = valorDeCatalogo(listaDe(lookups, 'task_priorities'), tarea.priority)
  const enlaces = camposLegibles((tarea.custom_fields ?? []).filter((campo) => campo.type === 'link'))

  return (
    <div className={cn('flex flex-col gap-5', className)}>
        <header className="border-linea bg-superficie-acentuada rounded-tarjeta flex flex-col gap-2 border p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-titular text-texto text-base leading-snug font-extrabold">{tarea.name}</h3>
            <span className="text-texto-tenue shrink-0 font-mono text-xs tracking-wide">{tarea.patente || `#${tarea.id}`}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Insignia tamano="chico" color={estado.color}>{estado.nombre}</Insignia>
            <Insignia tamano="chico" color={prioridad.color}>{prioridad.nombre}</Insignia>
            {/* Al final de la fila de insignias y no arriba del titulo: compartir es una salida
                lateral, no lo que la persona vino a hacer al detalle. */}
            <CompartirTarea procesoId={procesoId} />

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
            <CompletarTarea tarea={tarea} onCompletada={reintentar} />
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

        {/* Montado solo mientras se edita: asi el formulario arranca siempre en los valores que se
            acaban de traer, y cerrar descarta lo que no se guardo. */}
        {puedeEditar && editando && (
          <EdicionTarea
            tarea={tarea}
            lookups={lookups}
            descripcion={typeof tarea.description === 'string' ? aTextoPlano(tarea.description) : ''}
            onCerrar={() => setEditando(false)}
            onGuardada={reintentar}
          />
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Dato etiqueta={GLOSARIO.espacio.singular}>{tarea.project?.name ?? SIN_DATO}</Dato>
          <Dato etiqueta={GLOSARIO.hito.singular}>{tarea.milestone?.name ?? SIN_DATO}</Dato>
          <Dato etiqueta="Inicio"><Fecha valor={tarea.start_date} /></Dato>
          <Dato etiqueta="Entrega"><Fecha valor={tarea.due_date} comoVencimiento /></Dato>
          <Dato etiqueta="Asignados">
            <GrupoAvatares personas={tarea.assignees} tamano="chico" />
          </Dato>
          <Dato etiqueta="Etiquetas">
            {tarea.tags.length === 0 ? SIN_DATO : <Etiquetas etiquetas={tarea.tags} maximo={4} />}
          </Dato>

          {/* Los campos personalizados van al final y solo los que tienen algo cargado: son 29
              definiciones, y una fila con un guion por cada una taparia la ficha entera. */}
          {camposLegibles((tarea.custom_fields ?? []).filter((campo) => campo.type !== 'link')).map((campo) => (
            <Dato key={campo.id} etiqueta={campo.nombre}>
              <ValorPersonalizado campo={campo} />
            </Dato>
          ))}
        </dl>

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

        <BloqueSla tarea={tarea} puedeEditar={puedeEditar} onCambiado={reintentar} />

        <Contadores counts={tarea.counts} />

        <section className="flex flex-col gap-2">
          <h4 className="text-texto-tenue text-sm font-semibold">Descripción</h4>
          <Descripcion html={tarea.description} />
        </section>

        <ListaChecklist procesoId={procesoId} />

        <ListaIteraciones procesoId={procesoId} />

        <section className="flex flex-col gap-2">
          <h4 className="text-texto-tenue text-sm font-semibold">Archivos</h4>
          <ArbolDrive raiz="tasks" id={procesoId} />
          <PanelAdjuntos raiz="tasks" id={procesoId} />
        </section>

        <Cronometros procesoId={procesoId} />

        <EnlacePanelClasico entidad="proceso" id={procesoId} className="self-start" />
    </div>
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
  { tarea, onCompletada }: { tarea: Proceso, onCompletada: () => void }
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
function Contadores ({ counts }: { counts: Proceso['counts'] }): ReactElement {
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
function Descripcion ({ html }: { html: string | undefined }): ReactElement {
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
 * @param procesoId la tarea
 * @param senal aborta las dos peticiones si el componente se desmonta
 * @returns el estado de carga resuelto — `listo`, `noEncontrada` o `error`
 */
async function cargar (procesoId: number, senal: AbortSignal): Promise<Carga> {
  try {
    const [tarea, lookups] = await Promise.all([
      pedirRespuesta(`tasks/${procesoId}?include=custom_fields`, senal),
      pedirRespuesta('lookups', senal)
    ])

    if (tarea.status === 404) return { fase: 'noEncontrada' }

    if (!tarea.ok) return { fase: 'error', mensaje: await mensajeDeRespuesta(tarea) }
    if (!lookups.ok) return { fase: 'error', mensaje: await mensajeDeRespuesta(lookups) }

    const sobreTarea = await tarea.json() as Sobre<Proceso>
    const sobreLookups = await lookups.json() as Sobre<Lookups>

    return { fase: 'listo', tarea: sobreTarea.data, lookups: sobreLookups.data }
  } catch (fallo) {
    if (senal.aborted) return { fase: 'cargando' }

    return { fase: 'error', mensaje: fallo instanceof Error ? fallo.message : 'No se pudo cargar la tarea.' }
  }
}
