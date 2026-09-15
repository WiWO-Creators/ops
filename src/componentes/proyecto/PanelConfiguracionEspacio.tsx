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
 * interruptores del portal y viven en `tblproject_settings`, no en las columnas del Espacio. Por eso
 * se carga aparte —que falle no puede dejar en blanco la pantalla entera— y se guarda al tocarlo,
 * que es lo que hace un interruptor. Va arriba de todo y no debajo del boton "Guardar configuracion",
 * que no es suyo.
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
 * Lo que devuelve `GET /projects/{id}/portal-settings`.
 *
 * Se declara acá y no en `datos/recursos.ts` por lo mismo que `PanelActividad` declara su fila: es
 * una forma de una sola pantalla. Hoy trae una clave; el dia que traiga dos, es una linea mas.
 */
interface AjustesDelPortal {
  /** Si el cliente ve la pestaña Meeting Paper de este Espacio en su portal. */
  wiwo_portal_actas: boolean
}

/**
 * Que ve el cliente de este Espacio en su portal.
 *
 * === POR QUE NACE APAGADO Y SE ENCIENDE A MANO ===
 *
 * Un Meeting Paper puede tener conversacion interna adentro —lo escribe un modelo a partir de lo que
 * se dijo en la reunion, y ahi se dice de todo—. Por eso la migracion `0570` dejo el flag en '0' para
 * los 279 Espacios y nadie lo enciende por nosotros: es la misma regla que los efectos externos, que
 * se mergean apagados. Encenderlo queda anotado en la actividad con nombre y fecha, porque es una
 * decision de mostrarle a un tercero algo que hasta ese momento era interno.
 *
 * === POR QUE GUARDA AL TOCARLO Y CON UN PUT ===
 *
 * Es un interruptor: esperar un boton "Guardar" para una casilla sola deja la pantalla diciendo algo
 * que todavia no es cierto. El verbo es `PUT` porque el endpoint reemplaza el bloque entero —una
 * clave que falta es 422, no "dejala como estaba"—, asi que se manda el estado de todas.
 *
 * El cambio es optimista y se revierte si la API lo rechaza, igual que el interruptor de visibilidad
 * de la Actividad.
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
        <InterruptorDelPortal
          // Remonta el interruptor cuando la carga trae otro valor: su estado local es una copia.
          key={String(estado.datos.wiwo_portal_actas)}
          ruta={ruta}
          inicial={estado.datos.wiwo_portal_actas}
          puedeEscribir={puedeEscribir}
        />
      )}
    </section>
  )
}

/**
 * El interruptor de la pestaña Meeting Paper del portal.
 *
 * Nunca lanza: el 403 y el 422 del contrato son valores que quien configura tiene que poder leer, no
 * excepciones que tumben el panel.
 */
function InterruptorDelPortal ({
  ruta,
  inicial,
  puedeEscribir
}: {
  ruta: string
  inicial: boolean
  puedeEscribir: boolean
}): ReactElement {
  const [encendido, setEncendido] = useState(inicial)
  const [guardando, setGuardando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  /** Escribe el bloque entero. El fallo devuelve la casilla a su valor anterior. */
  async function cambiar (siguiente: boolean): Promise<void> {
    const previo = encendido

    setEncendido(siguiente)
    setGuardando(true)
    setFallo(null)

    const resultado = await escribirEnBff<AjustesDelPortal>(ruta, 'PUT', { wiwo_portal_actas: siguiente })

    setGuardando(false)

    if (!resultado.ok) {
      setEncendido(previo)
      setFallo(resultado.mensaje)

      return
    }

    // Lo que quedo guardado, no lo que se mando: si la API normalizo el valor, manda el suyo.
    setEncendido(resultado.datos.wiwo_portal_actas)
  }

  const espacio = GLOSARIO.espacio.singular.toLowerCase()

  return (
    <div className="flex flex-col gap-2" aria-busy={guardando}>
      <label htmlFor="portal-actas" className="text-texto flex items-center gap-2 text-sm">
        <input
          id="portal-actas"
          type="checkbox"
          checked={encendido}
          disabled={!puedeEscribir || guardando}
          onChange={(evento) => { void cambiar(evento.target.checked) }}
          className={CLASES_CASILLA}
        />
        El cliente ve los {GLOSARIO.acta.plural} de este {espacio} en su portal
      </label>

      <p className="text-texto-tenue text-sm">
        Nace apagado a propósito: un {GLOSARIO.acta.singular} puede tener conversación interna. Se lee
        entero y no se puede corregir, comentar ni borrar desde el portal.
      </p>

      {!puedeEscribir && (
        <p className="text-texto-sutil text-sm">
          Solo se puede leer: cambiarlo pide permiso de edición sobre {GLOSARIO.espacio.plural.toLowerCase()}.
        </p>
      )}

      {fallo !== null && <p role="alert" className="text-texto-peligro text-sm">{fallo}</p>}
    </div>
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
