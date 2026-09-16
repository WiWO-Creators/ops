'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { CLASES_CASILLA, Entrada } from '@/componentes/formularios/Entrada'
import {
  CeldaEncabezado,
  CeldaTabla,
  CuerpoTabla,
  EncabezadoTabla,
  FilaTabla,
  Tabla
} from '@/componentes/datos/Tabla'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Cargando, ErrorEstado, SinPermiso, Vacio } from '@/componentes/estado/Estados'
import { EnlacePanelClasico } from '@/componentes/presentadores/EnlacePanelClasico'
import { GLOSARIO } from '@/dominio/glosario'
import { SIN_DATO } from '@/lib/sla'
import type { ConfiguracionTiposEspacio, TipoDeProcesoDelEspacio } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import { useRecurso } from './carga'

/**
 * Configuracion del Espacio: que ve el cliente, los tipos de Proceso que ofrece, su ETA y la
 * aprobacion por defecto.
 *
 * Es la pantalla del head del Espacio. Lo que se edita aca alimenta todo el mecanismo de plazo: el
 * ETA de una Tarea sale del tipo que tenga, con los dias que este panel le fija, y el reloj arranca
 * cuando el cliente da el visto bueno desde el portal.
 *
 * **Se guarda entero con un PUT**, no fila por fila: el contrato define ese endpoint como reemplazo
 * completo —lo que no viaja, se va— y guardar por celda mandaria la mitad de la tabla en cada blur,
 * con la otra mitad borrandose sola.
 *
 * El permiso ya se resolvio en el server component; aca no se vuelve a decidir. La compuerta real es
 * la API, que responde 403 igual: esconder el panel es cosmetica.
 *
 * El bloque "Que ve el cliente" no comparte ni el endpoint ni el boton de guardar con el resto: son
 * los trece interruptores del portal, que se guardan enteros con un PUT propio al tocar cualquiera de
 * ellos. Por eso se carga aparte —que falle no puede dejar en blanco la pantalla entera— y se guarda
 * al tocarlo, que es lo que hace un interruptor. Va arriba de todo y no debajo del boton "Guardar
 * configuracion", que no es suyo.
 */

interface PropsPanel {
  proyectoId: number
  /**
   * Capacidades sobre `projects`, de `permissions` de `/me`.
   *
   * Solo gobiernan los interruptores del portal, que es lo unico de esta pantalla cuya escritura
   * cuelga de una capability: `PUT /projects/{id}/portal-settings` exige `projects.edit`, mientras
   * que la tabla de tipos se rige por `puedeConfigurar`. Sin `edit` los interruptores se ven —hay que
   * poder leer que esta encendido— y no se pueden tocar.
   */
  capacidades?: Capacidad[]
  /**
   * Segunda capa del permiso: la resuelve el server component y viaja como booleano.
   *
   * Es redundante con no agregar la pestaña, y esta a proposito: si mañana alguien monta el panel sin
   * la condicion, la pantalla sigue diciendo que no. La compuerta que de verdad protege es el 403 de
   * la API — esconder el panel es cosmetica.
   */
  puedeConfigurar: boolean
}

/** Una fila en edicion. El `id` ausente es un tipo nuevo, que el backend crea por nombre. */
interface FilaTipo {
  id: number | null
  name: string
  eta_dias: number | null
}

export function PanelConfiguracionEspacio ({
  proyectoId,
  puedeConfigurar,
  capacidades = []
}: PropsPanel): ReactElement {
  const ruta = `projects/${encodeURIComponent(String(proyectoId))}/task-types`
  const { estado, recargar } = useRecurso<ConfiguracionTiposEspacio>(
    ruta,
    'No se pudo cargar la configuración.'
  )

  if (!puedeConfigurar) return <SinPermiso className="mt-10" />

  return (
    <div className="flex flex-col gap-4">
      <VisibilidadDelPortal proyectoId={proyectoId} puedeEscribir={capacidades.includes('edit')} />

      {estado.fase === 'cargando' && <Cargando alto="min-h-40" mensaje="Cargando la configuración…" />}
      {estado.fase === 'error' && <ErrorEstado detalle={estado.mensaje} onReintentar={recargar} />}
      {/* La clave remonta el editor cuando la carga trae datos nuevos: el estado local es una copia
          de trabajo, y conservarla despues de un guardado mostraria lo que se mando y no lo que
          quedo. */}
      {estado.fase === 'listo' && (
        <Editor
          key={JSON.stringify(estado.datos)}
          proyectoId={proyectoId}
          ruta={ruta}
          inicial={estado.datos}
          onGuardado={recargar}
        />
      )}
    </div>
  )
}

/**
 * Lo que devuelve `GET|PUT /projects/{id}/portal-settings`: los trece interruptores.
 *
 * Se declara acá y no en `datos/recursos.ts` por lo mismo que `PanelActividad` declara su fila: es
 * una forma de una sola pantalla. El orden de las claves es el orden en que la API las devuelve y el
 * que el panel dibuja — el maestro primero, después el detalle.
 *
 * El backend acepta exactamente estas trece y ninguna más (`Escritura\AjustesDelPortal::CLAVES` y
 * `::COLUMNAS`). Los otros `view_*` de Perfex —crear, editar, comentar, subir archivos desde el
 * portal— no se ofrecen porque esta API no los honra: el portal es de solo lectura, y una casilla
 * que no hace nada es peor que no tenerla.
 */
interface AjustesDelPortal {
  /** El interruptor maestro: si el cliente ve este Espacio en su portal. */
  visible_para_cliente: boolean
  view_tasks: boolean
  view_milestones: boolean
  view_gantt: boolean
  view_timesheets: boolean
  view_activity_log: boolean
  /** Si el cliente ve la pestaña Meeting Paper de este Espacio en su portal. */
  wiwo_portal_actas: boolean
  view_finance_overview: boolean
  view_team_members: boolean
  view_task_total_logged_time: boolean
  view_task_comments: boolean
  view_task_checklist_items: boolean
  view_task_attachments: boolean
}

/** Las claves del bloque, para recorrerlas sin perder el tipado. */
type ClavePortal = keyof AjustesDelPortal

/** Un interruptor del bloque: su clave, su etiqueta y la letra chica que explica qué destapa. */
interface DefinicionInterruptor {
  clave: ClavePortal
  etiqueta: string
  ayuda?: string
}

/** Un grupo de interruptores con su título. */
interface GrupoDeInterruptores {
  titulo: string
  descripcion: string
  interruptores: DefinicionInterruptor[]
}

/**
 * Los tres grupos del detalle, en el orden en que los devuelve la API.
 *
 * Es una función y no una constante porque las etiquetas salen del `GLOSARIO`, que renombra
 * Proyecto/Tarea/Meeting Paper: congelarlas en un módulo dejaría el panel diciendo "Proceso" el día
 * que el glosario cambie.
 */
function gruposDelPortal (): GrupoDeInterruptores[] {
  const espacio = GLOSARIO.espacio.singular.toLowerCase()
  const proceso = GLOSARIO.proceso.singular.toLowerCase()
  const procesos = GLOSARIO.proceso.plural.toLowerCase()

  return [
    {
      titulo: 'Pestañas del portal',
      descripcion: `Qué secciones de este ${espacio} puede abrir el cliente.`,
      interruptores: [
        { clave: 'view_tasks', etiqueta: `${GLOSARIO.proceso.plural} y su calendario`, ayuda: `El calendario es la misma tabla de ${procesos} dibujada de otra forma: se encienden y se apagan juntos.` },
        { clave: 'view_milestones', etiqueta: GLOSARIO.hito.plural },
        { clave: 'view_gantt', etiqueta: 'Gantt' },
        { clave: 'view_timesheets', etiqueta: 'Horas registradas' },
        { clave: 'view_activity_log', etiqueta: 'Actividad' },
        { clave: 'wiwo_portal_actas', etiqueta: GLOSARIO.acta.plural, ayuda: `Nace apagado a propósito: un ${GLOSARIO.acta.singular} puede tener conversación interna. Se lee entero y no se puede corregir, comentar ni borrar desde el portal.` }
      ]
    },
    {
      titulo: `Datos del ${espacio}`,
      descripcion: 'Bloques de la ficha. Apagados no viajan al portal: no van en blanco, no van.',
      interruptores: [
        { clave: 'view_finance_overview', etiqueta: 'Importes (costo, tarifa por hora y horas estimadas)' },
        { clave: 'view_team_members', etiqueta: 'Equipo asignado' }
      ]
    },
    {
      titulo: `Datos de cada ${proceso}`,
      descripcion: `Bloques de la ficha de un ${proceso} dentro del portal.`,
      interruptores: [
        { clave: 'view_task_total_logged_time', etiqueta: 'Horas registradas' },
        { clave: 'view_task_comments', etiqueta: 'Comentarios' },
        { clave: 'view_task_checklist_items', etiqueta: 'Checklist' },
        { clave: 'view_task_attachments', etiqueta: 'Adjuntos' }
      ]
    }
  ]
}

/**
 * Que ve el cliente de este Espacio en su portal.
 *
 * === EL INTERRUPTOR MAESTRO ===
 *
 * `visible_para_cliente` está por encima de los otros doce: apagado, el Espacio no existe para el
 * portal —no aparece en el listado, su id escrito a mano da 404 y ninguna subsección se abre—. Por
 * eso va arriba y separado, y por eso el resto del bloque se muestra atenuado cuando está apagado:
 * siguen editándose, para poder dejar la configuración lista, pero mientras el maestro esté en cero
 * no hay nada que mostrar.
 *
 * Nace ENCENDIDO (`DEFAULT 1` en la migración `0640`) para no cambiar lo que ve ningún cliente el
 * día del despliegue. Si el negocio decide que un Espacio nuevo nazca oculto, se invierte en una
 * migración y esta pantalla no cambia.
 *
 * === POR QUE GUARDA AL TOCARLO Y CON UN PUT ===
 *
 * Son interruptores: esperar un botón "Guardar" para una casilla sola deja la pantalla diciendo algo
 * que todavía no es cierto. El verbo es `PUT` porque el endpoint reemplaza el bloque entero —una
 * clave que falta es 422, no "dejala como estaba"—, así que cada cambio manda el estado de las
 * trece. El cambio es optimista y se revierte si la API lo rechaza.
 *
 * Encender o apagar cualquiera de las trece queda anotado en la actividad con nombre y fecha: es una
 * decisión de mostrarle a un tercero algo que hasta ese momento era interno.
 */
function VisibilidadDelPortal ({
  proyectoId,
  puedeEscribir
}: {
  proyectoId: number
  puedeEscribir: boolean
}): ReactElement {
  const ruta = `projects/${encodeURIComponent(String(proyectoId))}/portal-settings`
  const { estado, recargar } = useRecurso<AjustesDelPortal>(ruta, 'No se pudo leer qué ve el cliente.')

  return (
    <section className="rounded-tarjeta border-linea bg-superficie-elevada shadow-1 border p-5">
      <h2 className="font-titular text-texto border-linea-suave mb-4 border-b pb-2 text-sm font-semibold">
        Qué ve el cliente
      </h2>

      {estado.fase === 'cargando' && <Cargando alto="min-h-20" mensaje="Cargando los interruptores…" />}
      {estado.fase === 'error' && <ErrorEstado detalle={estado.mensaje} onReintentar={recargar} />}
      {estado.fase === 'listo' && (
        <InterruptoresDelPortal
          // Remonta el bloque cuando la carga trae otros valores: su estado local es una copia.
          key={JSON.stringify(estado.datos)}
          ruta={ruta}
          inicial={estado.datos}
          puedeEscribir={puedeEscribir}
        />
      )}
    </section>
  )
}

/**
 * Los trece interruptores del portal.
 *
 * Nunca lanza: el 403 y el 422 del contrato son valores que quien configura tiene que poder leer, no
 * excepciones que tumben el panel.
 */
function InterruptoresDelPortal ({
  ruta,
  inicial,
  puedeEscribir
}: {
  ruta: string
  inicial: AjustesDelPortal
  puedeEscribir: boolean
}): ReactElement {
  const [ajustes, setAjustes] = useState<AjustesDelPortal>(inicial)
  const [guardando, setGuardando] = useState<ClavePortal | null>(null)
  const [fallo, setFallo] = useState<string | null>(null)

  /**
   * Escribe el bloque entero con una casilla cambiada.
   *
   * El fallo devuelve el bloque a su valor anterior: mostrar la casilla encendida después de un 403
   * diría que el cliente ya ve algo que no ve.
   */
  async function cambiar (clave: ClavePortal, siguiente: boolean): Promise<void> {
    const previo = ajustes
    const enviado = { ...ajustes, [clave]: siguiente }

    setAjustes(enviado)
    setGuardando(clave)
    setFallo(null)

    const resultado = await escribirEnBff<AjustesDelPortal>(ruta, 'PUT', enviado)

    setGuardando(null)

    if (!resultado.ok) {
      setAjustes(previo)
      setFallo(resultado.mensaje)

      return
    }

    // Lo que quedó guardado, no lo que se mandó: si la API normalizó algún valor, manda el suyo.
    setAjustes(resultado.datos)
  }

  const espacio = GLOSARIO.espacio.singular.toLowerCase()
  const oculto = !ajustes.visible_para_cliente

  return (
    <div className="flex flex-col gap-5" aria-busy={guardando !== null}>
      <div className="flex flex-col gap-2">
        <Interruptor
          clave="visible_para_cliente"
          etiqueta={`El cliente ve este ${espacio} en su portal`}
          valor={ajustes.visible_para_cliente}
          puedeEscribir={puedeEscribir}
          guardando={guardando === 'visible_para_cliente'}
          onCambiar={cambiar}
        />

        <p className="text-texto-tenue text-sm">
          Apagado, el {espacio} no existe para el portal: no aparece en el listado del cliente, ni se
          abre escribiendo su dirección, ni se descarga ninguno de sus archivos.
        </p>

        {oculto && (
          <p role="status" className="text-texto-sutil text-sm">
            Mientras esté apagado, los interruptores de abajo no cambian nada de lo que ve el cliente:
            quedan listos para cuando se abra el {espacio}.
          </p>
        )}
      </div>

      {gruposDelPortal().map((grupo) => (
        <fieldset key={grupo.titulo} className={`flex flex-col gap-2 ${oculto ? 'opacity-60' : ''}`}>
          <legend className="font-titular text-texto text-sm font-semibold">{grupo.titulo}</legend>
          <p className="text-texto-tenue text-sm">{grupo.descripcion}</p>

          {grupo.interruptores.map((definicion) => (
            <div key={definicion.clave} className="flex flex-col gap-1">
              <Interruptor
                clave={definicion.clave}
                etiqueta={definicion.etiqueta}
                valor={ajustes[definicion.clave]}
                puedeEscribir={puedeEscribir}
                guardando={guardando === definicion.clave}
                onCambiar={cambiar}
              />
              {definicion.ayuda !== undefined && (
                <p className="text-texto-sutil ml-6 text-sm">{definicion.ayuda}</p>
              )}
            </div>
          ))}
        </fieldset>
      ))}

      {!puedeEscribir && (
        <p className="text-texto-sutil text-sm">
          Solo se puede leer: cambiarlo pide permiso de edición sobre {GLOSARIO.espacio.plural.toLowerCase()}.
        </p>
      )}

      {fallo !== null && <p role="alert" className="text-texto-peligro text-sm">{fallo}</p>}
    </div>
  )
}

/** Una casilla del bloque. El `id` sale de la clave, que es única en la pantalla. */
function Interruptor ({
  clave,
  etiqueta,
  valor,
  puedeEscribir,
  guardando,
  onCambiar
}: {
  clave: ClavePortal
  etiqueta: string
  valor: boolean
  puedeEscribir: boolean
  guardando: boolean
  onCambiar: (clave: ClavePortal, siguiente: boolean) => Promise<void>
}): ReactElement {
  return (
    <label htmlFor={`portal-${clave}`} className="text-texto flex items-center gap-2 text-sm">
      <input
        id={`portal-${clave}`}
        type="checkbox"
        checked={valor}
        disabled={!puedeEscribir || guardando}
        onChange={(evento) => { void onCambiar(clave, evento.target.checked) }}
        className={CLASES_CASILLA}
      />
      {etiqueta}
    </label>
  )
}

interface PropsEditor {
  proyectoId: number
  ruta: string
  inicial: ConfiguracionTiposEspacio
  onGuardado: () => void
}

function Editor ({ proyectoId, ruta, inicial, onGuardado }: PropsEditor): ReactElement {
  const [filas, setFilas] = useState<FilaTipo[]>(() => aFilas(inicial.task_types))
  const [aprobacion, setAprobacion] = useState(inicial.aprobacion_requerida_por_defecto)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  const espacio = GLOSARIO.espacio.singular.toLowerCase()
  const procesos = GLOSARIO.proceso.plural.toLowerCase()
  const sinCambios =
    aprobacion === inicial.aprobacion_requerida_por_defecto &&
    JSON.stringify(filas) === JSON.stringify(aFilas(inicial.task_types))

  /** Agrega un tipo nuevo a la copia de trabajo. No escribe: el alta viaja con el PUT. */
  function agregar (): void {
    const nombre = nombreNuevo.trim()

    if (nombre === '') return

    setFilas((previas) => [...previas, { id: null, name: nombre, eta_dias: null }])
    setNombreNuevo('')
  }

  /**
   * Manda la tabla entera.
   *
   * Nunca lanza: el 422 del contrato es un valor que quien edita tiene que poder leer, no una
   * excepcion que tumbe el panel.
   */
  async function guardar (): Promise<void> {
    setGuardando(true)
    setFallo(null)

    const resultado = await escribirEnBff<ConfiguracionTiposEspacio>(ruta, 'PUT', {
      aprobacion_requerida_por_defecto: aprobacion,
      task_types: filas.map((fila) => ({
        ...(fila.id === null ? { name: fila.name } : { id: fila.id }),
        eta_dias: fila.eta_dias
      }))
    })

    setGuardando(false)

    if (!resultado.ok) {
      setFallo(resultado.mensaje)
      return
    }

    onGuardado()
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-tarjeta border-linea bg-superficie-elevada shadow-1 border p-5">
        <div className="border-linea-suave mb-4 flex flex-wrap items-center justify-between gap-2 border-b pb-2">
          <h2 className="font-titular text-texto text-sm font-semibold">
            Tipos de {GLOSARIO.proceso.singular.toLowerCase()} y su ETA
          </h2>
          <p className="text-texto-tenue text-sm">
            Los días hábiles que compromete cada tipo en este {espacio}.
          </p>
        </div>

        {filas.length === 0
          ? (
            <Vacio
              titulo={`Este ${espacio} todavía no tiene tipos de ${GLOSARIO.proceso.singular.toLowerCase()}`}
              descripcion="Sin tipos no hay ETA que calcular: agrega el primero acá abajo."
            />
            )
          : (
            <Tabla>
              <EncabezadoTabla>
                <FilaTabla>
                  <CeldaEncabezado>Tipo</CeldaEncabezado>
                  <CeldaEncabezado numerica>ETA (días)</CeldaEncabezado>
                  <CeldaEncabezado>Origen</CeldaEncabezado>
                  <CeldaEncabezado><span className="sr-only">Quitar</span></CeldaEncabezado>
                </FilaTabla>
              </EncabezadoTabla>
              <CuerpoTabla>
                {filas.map((fila, indice) => (
                  <FilaTabla key={fila.id ?? `nuevo-${indice}`}>
                    <CeldaTabla className="min-w-0">
                      <span className="block truncate" title={fila.name}>{fila.name}</span>
                    </CeldaTabla>
                    <CeldaTabla numerica>
                      <Entrada
                        type="number"
                        min={0}
                        max={260}
                        value={fila.eta_dias === null ? '' : String(fila.eta_dias)}
                        aria-label={`ETA en días de «${fila.name}»`}
                        placeholder={SIN_DATO}
                        className="ml-auto w-24 text-right tabular-nums"
                        onChange={(evento) => {
                          const crudo = evento.target.value
                          setFilas((previas) => previas.map((otra, i) => (
                            i === indice ? { ...otra, eta_dias: crudo === '' ? null : Number(crudo) } : otra
                          )))
                        }}
                      />
                    </CeldaTabla>
                    <CeldaTabla>
                      <span className="text-texto-sutil text-xs">
                        {fila.id === null ? 'Nuevo' : 'Del catálogo'}
                      </span>
                    </CeldaTabla>
                    <CeldaTabla>
                      <Boton
                        variante="sutil"
                        tamano="chico"
                        soloIcono
                        aria-label={`Quitar «${fila.name}» de este ${espacio}`}
                        onClick={() => { setFilas((previas) => previas.filter((_, i) => i !== indice)) }}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </Boton>
                    </CeldaTabla>
                  </FilaTabla>
                ))}
              </CuerpoTabla>
            </Tabla>
            )}

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <Entrada
            value={nombreNuevo}
            maxLength={50}
            aria-label={`Nombre del tipo de ${GLOSARIO.proceso.singular.toLowerCase()} nuevo`}
            placeholder={`Nombre del tipo nuevo. Ej: “Revisión legal”`}
            className="w-64"
            onChange={(evento) => { setNombreNuevo(evento.target.value) }}
            onKeyDown={(evento) => {
              if (evento.key === 'Enter') {
                evento.preventDefault()
                agregar()
              }
            }}
          />
          <Boton variante="secundario" tamano="chico" disabled={nombreNuevo.trim() === ''} onClick={agregar}>
            <Plus size={14} aria-hidden="true" />
            Agregar tipo
          </Boton>
        </div>

        {/* Quitar un tipo no borra el dato de las Tareas que ya lo tenian: `tasks.task_type` apunta al
            catalogo y no a esta relacion. Se les cae la oferta, no el tipo. */}
        <p className="text-texto-tenue mt-2 text-sm">
          Quitar un tipo deja de ofrecerlo en este {espacio}; las {procesos} que ya lo tienen no lo pierden.
        </p>
      </section>

      <section className="rounded-tarjeta border-linea bg-superficie-elevada shadow-1 border p-5">
        <h2 className="font-titular text-texto border-linea-suave mb-4 border-b pb-2 text-sm font-semibold">
          Aprobación del cliente
        </h2>

        <label htmlFor="aprobacion-por-defecto" className="text-texto flex items-center gap-2 text-sm">
          <input
            id="aprobacion-por-defecto"
            type="checkbox"
            checked={aprobacion}
            onChange={(evento) => { setAprobacion(evento.target.checked) }}
            className={CLASES_CASILLA}
          />
          Las {procesos} nuevas esperan el visto bueno del cliente
        </label>

        <p className="text-texto-tenue mt-2 text-sm">
          El reloj del ETA empieza recién cuando el cliente lo da desde su portal. Cambiar esto no
          toca las {procesos} que ya existen.
        </p>
      </section>

      {fallo !== null && <p role="alert" className="text-texto-peligro text-sm">{fallo}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <EnlacePanelClasico entidad="espacio" id={proyectoId} />
        <Boton
          variante="primario"
          cargando={guardando}
          disabled={sinCambios}
          onClick={() => { void guardar() }}
        >
          Guardar configuración
        </Boton>
      </div>
    </div>
  )
}

/** Pasa la respuesta de la API a la copia de trabajo, quedandose solo con lo que este panel edita. */
function aFilas (tipos: TipoDeProcesoDelEspacio[]): FilaTipo[] {
  return tipos.map((tipo) => ({ id: tipo.id, name: tipo.name, eta_dias: tipo.eta_dias }))
}
