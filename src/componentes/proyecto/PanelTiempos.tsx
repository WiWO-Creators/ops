'use client'

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation'
import { ControlesTabla, PaginacionTabla } from '@/componentes/datos/ControlesTabla'
import { hayFiltrosPuestos, urlConParametro } from '@/componentes/datos/tabla'
import {
  CeldaEncabezado,
  CeldaTabla,
  CuerpoTabla,
  EncabezadoTabla,
  FilaTabla,
  Tabla
} from '@/componentes/datos/Tabla'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { CargandoConOrbe } from '@/componentes/estado/Orbe'
import { Boton } from '@/componentes/formularios/Boton'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Etiquetas } from '@/componentes/presentadores/Etiqueta'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { avisarCambioDeMedidor } from '@/componentes/live/medidor'
import { pedirSobre } from '@/datos/cliente'
import { construirConsulta, leerConsulta } from '@/datos/consulta'
import { leerError } from '@/datos/errores'
import type { Etiqueta, PersonaConTiempo } from '@/datos/recursos'
import type { Capacidad, Paginacion } from '@/datos/tipos'
import { LOOKUP_PERSONAS_CON_TIEMPO, definicionDeTiempos } from '@/definiciones/tiempos'
import type { EstadoConsulta, OpcionFiltro } from '@/definiciones/tipos'
import { conConsulta, type FuenteDeProyecto } from '@/dominio/fuente-proyecto'
import { useRecurso } from './carga'
import { segundosAHoraMinuto } from './formatos'
import { FormularioTimesheet } from './FormularioTimesheet'
import { horasEstimadasDelResumen, type ResumenDeProyecto } from './overview'
import { Metrica, formatearNumero } from './ResumenProyecto'
import { duracionMostrada, hayRegistroCorriendo } from './timesheet'

/**
 * Registro de horas de un proyecto.
 *
 * **El mismo lo abren el equipo y el cliente.** Lo unico que cambia es de donde bajan los datos
 * —`fuente`— y que columnas, filtros y lecturas declara cada contrato, que resuelve
 * `definicionDeTiempos` en la capa de definiciones: acá no hay ninguna rama por sujeto. Las acciones
 * por fila ya dependian del backend (`puede_editar`, `puede_borrar`, `puede_detener`), asi que el
 * contrato que no las manda no las ofrece.
 *
 * **Los permisos por fila los decide el backend** y llegan en `puede_editar`, `puede_borrar` y
 * `puede_detener`. El frontend no los recalcula: las reglas del panel mezclan cuatro permisos, el
 * estado de la tarea, si esta facturada y si la persona sigue asignada, y una segunda copia de eso
 * en el navegador se desincroniza el dia que cambie una.
 *
 * Lo mismo con las duraciones: `duration_hm` y `duration_decimal` vienen calculados. Lo unico que se
 * calcula aca es el conteo en vivo de un registro corriendo, porque ese numero envejece en pantalla.
 *
 * **Los totales de arriba no se suman en el navegador.** Salen de `GET /projects/{id}/overview`, el
 * mismo recurso que pinta la pestaña Descripcion: sumar `duration_seconds` de la pagina visible daria
 * el total de veinticinco filas y lo llamaria el total del proyecto, que es mentira apenas hay una
 * pagina siguiente. Que sea el mismo endpoint tambien garantiza que las dos pestañas informen la
 * misma cifra.
 *
 * **El estado de la vista vive en la URL**, no en `useState`: filtros, orden, pagina y busqueda se
 * leen con `leerConsulta` y se escriben con `construirConsulta`, igual que el resto del producto. Asi
 * una vista filtrada se comparte con un enlace, el boton "atras" hace lo que se espera, y un preset
 * guardado se aplica escribiendo la URL en vez de sincronizar dos copias del mismo estado.
 */

/**
 * Lo minimo que la tabla pinta de un registro.
 *
 * Se declara lo que se usa y no `RegistroTiempo`: el contrato del contacto no manda etiquetas,
 * facturacion, duracion decimal, cronometro abierto ni permisos por fila. Clave ausente = celda o
 * boton que no se dibuja; que columnas existen para cada sujeto lo dice `definicionDeTiempos`.
 */
interface RegistroDeHoras {
  id: number
  /** `null` cuando el registro quedo sin persona; el contrato del contacto lo admite. */
  staff: { id: number, full_name: string, profile_image_url?: string | null, sigue_asignado?: boolean } | null
  task: { id: number, name: string, billable?: boolean, billed?: boolean }
  tags?: Etiqueta[]
  start_time: string
  end_time: string | null
  note: string | null
  duration_seconds: number
  duration_hm: string
  duration_decimal?: number
  corriendo?: boolean
  puede_editar?: boolean
  puede_borrar?: boolean
  puede_detener?: boolean
}

interface PropsPanelTiempos {
  proyectoId: number
  /** De donde bajan las horas de este Proyecto. Ver `dominio/fuente-proyecto.ts`. */
  fuente: FuenteDeProyecto
  capacidades: Capacidad[]
}

type Carga =
  | { fase: 'cargando' }
  | { fase: 'error', mensaje: string }
  | { fase: 'listo', registros: RegistroDeHoras[], paginacion: Paginacion | undefined }

/** El menu de columnas esta oculto, pero `ControlesTabla` exige el callback. Estable entre renders. */
function noOp (): void {}

/**
 * Combina la consulta nueva con los parametros de la URL que no son de esta pestaña.
 *
 * El detalle del Proyecto guarda en la misma URL la pestaña activa (`?tab=`) y la tarea abierta en el
 * cajon (`?tarea=`), y son de otro dueño: reescribir la query entera al filtrar cerraria la pestaña
 * de golpe. Se borran solo las claves que produce la consulta vigente —las que escribio este panel—
 * y todo lo demas se conserva tal cual.
 *
 * @param params Los parametros actuales de la URL.
 * @param consultaVigente La consulta que este panel tiene puesta, para saber que claves le pertenecen.
 * @param consultaNueva La consulta que se quiere dejar, ya serializada.
 * @returns La URL relativa lista para `router.replace`, siempre con `?` aunque quede vacia.
 */
function urlConservandoAjenos (
  params: ReadonlyURLSearchParams,
  consultaVigente: string,
  consultaNueva: string
): string {
  const ajenos = new URLSearchParams(params.toString())

  for (const clave of new URLSearchParams(consultaVigente).keys()) {
    ajenos.delete(clave)
  }

  const combinada = [consultaNueva, ajenos.toString()].filter((parte) => parte !== '').join('&')

  return combinada === '' ? '?' : `?${combinada}`
}

export function PanelTiempos (props: PropsPanelTiempos): ReactElement {
  // Leer `useSearchParams` exige un limite de Suspense: sin el, el build de cualquier pagina que
  // monte este panel falla, y esas paginas las escribe otra persona.
  return (
    <Suspense fallback={<Cargando alto="min-h-60" mensaje="Cargando las horas…" />}>
      <TiemposDelProyecto {...props} />
    </Suspense>
  )
}

function TiemposDelProyecto ({ proyectoId, fuente, capacidades }: PropsPanelTiempos): ReactElement {
  const router = useRouter()
  const params = useSearchParams()

  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' })
  const [personas, setPersonas] = useState<PersonaConTiempo[]>([])
  const [intento, setIntento] = useState(0)
  const [ahora, setAhora] = useState(() => new Date())
  const [formulario, setFormulario] = useState<{ abierto: boolean, registro: RegistroDeHoras | null }>(
    { abierto: false, registro: null }
  )
  const [aviso, setAviso] = useState<string | null>(null)
  /**
   * Que combinacion de consulta e intento corresponde a lo que hay pintado.
   *
   * Se compara con la vigente para saber si hay una peticion en vuelo. Es derivado y no un
   * `useState` que el efecto prende: prender un estado dentro del efecto encadena renders, y el
   * lint del proyecto lo rechaza.
   */
  const [clavePintada, setClavePintada] = useState<string | null>(null)

  const { definicion, columnas, conFiltroDePersonas } = useMemo(
    () => definicionDeTiempos(fuente, proyectoId),
    [fuente, proyectoId]
  )

  /** Lo que la persona eligio, leido de la URL. Lo desconocido se descarta: un `?page=abc` no viaja. */
  const estado = useMemo(
    () => leerConsulta(new URLSearchParams(params.toString()), definicion),
    [params, definicion]
  )

  /** La misma consulta, ya podada contra la whitelist del backend. Sin `?` inicial. */
  const consulta = useMemo(() => construirConsulta(estado, definicion), [estado, definicion])

  /**
   * Opciones del filtro por persona.
   *
   * Salen de la lista que el panel ya pide, no de `/lookups`. Si esa peticion falla la lista queda
   * vacia y `ControlesTabla` no dibuja el filtro: un desplegable sin opciones no filtra nada.
   */
  const opcionesDeFiltro = useMemo<Record<string, OpcionFiltro[]>>(
    () => ({
      [LOOKUP_PERSONAS_CON_TIEMPO]: personas.map(
        (persona) => ({ valor: String(persona.id), etiqueta: persona.full_name })
      )
    }),
    [personas]
  )

  // Accesorio, como el filtro por persona: si falla, la tabla se ve igual y no se muestra ningun
  // error. Lo que no se hace es pintar ceros donde no llego el dato.
  const { estado: resumen, recargar: recargarResumen } = useRecurso<ResumenDeProyecto>(
    fuente.resumen,
    'No se pudo cargar el total de horas.'
  )

  // Recargar el listado recarga tambien los totales: guardar, detener o borrar un registro cambia las
  // dos cosas, y dejar el total viejo arriba de la tabla nueva es peor que no mostrarlo.
  const recargar = useCallback(() => {
    setIntento((n) => n + 1)
    recargarResumen()
  }, [recargarResumen])

  /**
   * Escribe un cambio parcial de la consulta en la URL, que es la unica dueña del estado.
   *
   * `replace` y no `push`: cada filtro seria una entrada del historial y volver atras costaria
   * quince clics.
   */
  const cambiar = useCallback((parcial: Partial<EstadoConsulta>): void => {
    const siguiente = construirConsulta({ ...estado, ...parcial }, definicion)

    router.replace(urlConservandoAjenos(params, consulta, siguiente), { scroll: false })
  }, [estado, consulta, definicion, params, router])

  /** Identifica la consulta vigente. Cambia con la URL y con cada recarga manual. */
  const clave = `${consulta}|${intento}`
  const refrescando = clavePintada !== null && clavePintada !== clave

  useEffect(() => {
    const control = new AbortController()
    const ruta = conConsulta(fuente.tiempos, consulta)

    // Sin volver a 'cargando' al refrescar: la tabla se queda con las filas anteriores hasta que
    // llegan las nuevas, en vez de parpadear a un bloque de carga cada vez que se cambia de pagina.
    // Que no parpadee no quiere decir que no avise: mientras la clave pintada no sea la vigente,
    // el chip dice que hay algo en curso.
    void pedirSobre<RegistroDeHoras[]>(ruta, control.signal)
      .then((sobre) => {
        if (control.signal.aborted) return

        setCarga({ fase: 'listo', registros: sobre.data, paginacion: sobre.meta?.pagination })
        setClavePintada(clave)
      })
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return

        setCarga({
          fase: 'error',
          mensaje: fallo instanceof Error ? fallo.message : 'No se pudo cargar el registro de horas.'
        })
        setClavePintada(clave)
      })

    return () => { control.abort() }
  }, [fuente, consulta, clave])

  useEffect(() => {
    // El contrato del contacto no tiene ese subrecurso: pedirlo seria un 404 garantizado por pantalla.
    if (!conFiltroDePersonas) return

    const control = new AbortController()

    void pedirSobre<PersonaConTiempo[]>(`${fuente.tiempos}/staff`, control.signal)
      .then((sobre) => setPersonas(sobre.data))
      .catch(() => {
        // El filtro por persona es accesorio: sin el, la tabla se ve igual. No se convierte en error.
      })

    return () => { control.abort() }
  }, [fuente, conFiltroDePersonas, intento])

  const registros = carga.fase === 'listo' ? carga.registros : []
  const corriendo = hayRegistroCorriendo(registros)

  // El intervalo solo existe mientras haya algo corriendo: un `setInterval` permanente redibuja la
  // tabla entera una vez por segundo aunque no cambie nada.
  useEffect(() => {
    if (!corriendo) return

    const id = setInterval(() => setAhora(new Date()), 1000)

    return () => { clearInterval(id) }
  }, [corriendo])

  /** Detiene el cronometro abierto de una fila. Es el cronometro de la tarea, no un recurso aparte. */
  async function detener (registro: RegistroDeHoras): Promise<void> {
    setAviso(null)

    try {
      const respuesta = await fetch(`/api/bff/tasks/${registro.task.id}/timer`, { method: 'DELETE' })

      if (!respuesta.ok) {
        setAviso((await leerError(respuesta)).message)
        return
      }

      // El control de jornada de la cabecera mira el mismo cronometro.
      avisarCambioDeMedidor()
      recargar()
    } catch {
      setAviso('No se pudo detener: revisa la conexión.')
    }
  }

  /** Borra un registro. Pregunta antes: no hay deshacer del otro lado. */
  async function borrar (registro: RegistroDeHoras): Promise<void> {
    const quien = registro.staff?.full_name ?? 'sin persona'

    if (!window.confirm(`¿Eliminar el registro de ${quien} (${registro.duration_hm})?`)) return

    setAviso(null)

    try {
      const respuesta = await fetch(`/api/bff/${fuente.tiempos}/${registro.id}`, {
        method: 'DELETE'
      })

      if (!respuesta.ok) {
        setAviso((await leerError(respuesta)).message)
        return
      }

      recargar()
    } catch {
      setAviso('No se pudo eliminar: revisa la conexión.')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {resumen.fase === 'listo' && <TotalesDelProyecto resumen={resumen.datos} />}

      <div className="flex flex-wrap items-start justify-between gap-2">
        <ControlesTabla
          definicion={definicion}
          estado={estado}
          // La tabla de abajo es a medida y no se arma desde la definicion: no hay columnas que
          // encender ni apagar, asi que el menu se oculta y estas dos props quedan inertes.
          visibles={[]}
          onVisibles={noOp}
          sinColumnas
          opcionesDeFiltro={opcionesDeFiltro}
          onCambiar={cambiar}
        />

        <div className="flex flex-wrap items-center gap-2">

          {capacidades.includes('create') && (
            <Boton
              variante="primario"
              tamano="chico"
              onClick={() => setFormulario({ abierto: true, registro: null })}
            >
              Registro de horas
            </Boton>
          )}
        </div>
      </div>

      {aviso !== null && (
        <p
          role="alert"
          className="border-linea bg-superficie-peligro text-texto-peligro rounded-tarjeta border px-3 py-2 text-sm"
        >
          {aviso}
        </p>
      )}

      {carga.fase === 'cargando' && <Cargando alto="min-h-60" mensaje="Cargando las horas…" />}

      {carga.fase === 'error' && (
        <ErrorEstado detalle={carga.mensaje} onReintentar={recargar} />
      )}

      {/* Con filtros puestos, "cuando alguien anote tiempo aparece acá" es falso: puede haber horas
          de sobra y ninguna que cumpla lo pedido. */}
      {carga.fase === 'listo' && registros.length === 0 && (
        <Vacio
          titulo="No hay horas registradas"
          descripcion={hayFiltrosPuestos(estado)
            ? 'Prueba quitando filtros o buscando otra cosa.'
            : 'Cuando alguien anote tiempo en una tarea de este proyecto, aparece acá.'}
        />
      )}

      {carga.fase === 'listo' && registros.length > 0 && (
        <div className="relative" aria-busy={refrescando}>
          {/* Cambiar de pagina o de filtro no vacia la tabla, asi que el aviso va en un chip sobre la
              esquina: sin el, la unica señal de que hay algo en curso era que los datos cambiaban solos. */}
          {refrescando && <CargandoConOrbe mensaje="Actualizando…" className="absolute right-2 top-2 z-10" />}
          <div className={refrescando ? 'opacity-60 transition-opacity' : undefined}>
        <Tabla>
          <EncabezadoTabla>
            <tr>
              <CeldaEncabezado>Miembro</CeldaEncabezado>
              <CeldaEncabezado>Tarea</CeldaEncabezado>
              {columnas.includes('tags') && <CeldaEncabezado>Etiquetas</CeldaEncabezado>}
              <CeldaEncabezado>Hora de inicio</CeldaEncabezado>
              <CeldaEncabezado>Hora de finalización</CeldaEncabezado>
              <CeldaEncabezado>Nota</CeldaEncabezado>
              <CeldaEncabezado numerica>Hora (h)</CeldaEncabezado>
              {columnas.includes('decimal') && <CeldaEncabezado numerica>Hora (decimal)</CeldaEncabezado>}
              {columnas.includes('acciones') && (
                <CeldaEncabezado>
                  <span className="sr-only">Opciones</span>
                </CeldaEncabezado>
              )}
            </tr>
          </EncabezadoTabla>

          <CuerpoTabla>
            {registros.map((registro) => {
              const duracion = duracionMostrada(registro, ahora)

              return (
                <FilaTabla key={registro.id}>
                  <CeldaTabla>
                    <span className="flex items-center gap-2">
                      <Avatar
                        nombre={registro.staff?.full_name ?? ''}
                        imagen={registro.staff?.profile_image_url ?? null}
                        tamano="chico"
                      />
                      <span className="text-texto">{registro.staff?.full_name ?? ''}</span>
                      {registro.staff?.sigue_asignado === false && (
                        <span
                          className="text-texto-aviso"
                          title="Ya no está asignado a esta tarea"
                          aria-label="Ya no está asignado a esta tarea"
                        >
                          !
                        </span>
                      )}
                    </span>
                  </CeldaTabla>

                  <CeldaTabla>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {/* Conserva el resto de la URL: con `?tarea=12` a secas, abrir una tarea
                          desde acá se llevaba puestos los filtros y la pestaña activa. */}
                      <Link
                        href={urlConParametro(new URLSearchParams(params.toString()), 'tarea', String(registro.task.id))}
                        scroll={false}
                        className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
                      >
                        {registro.task.name}
                      </Link>
                      {registro.task.billed === true
                        ? <Insignia tono="exito" tamano="chico">Facturada</Insignia>
                        : registro.task.billable === true && <Insignia tono="aviso" tamano="chico">No facturada</Insignia>}
                    </span>
                  </CeldaTabla>

                  {columnas.includes('tags') && (
                    <CeldaTabla><Etiquetas etiquetas={registro.tags ?? []} /></CeldaTabla>
                  )}

                  <CeldaTabla><Fecha valor={registro.start_time} conHora /></CeldaTabla>
                  <CeldaTabla>
                    {registro.end_time === null
                      ? <Insignia tono="acento" tamano="chico">En curso</Insignia>
                      : <Fecha valor={registro.end_time} conHora />}
                  </CeldaTabla>
                  <CeldaTabla className="max-w-64 truncate">{registro.note ?? ''}</CeldaTabla>
                  <CeldaTabla numerica>{duracion.hm}</CeldaTabla>

                  {columnas.includes('decimal') && (
                    <CeldaTabla numerica>{duracion.decimal?.toFixed(2) ?? ''}</CeldaTabla>
                  )}

                  {columnas.includes('acciones') && (
                    <CeldaTabla>
                      <span className="flex items-center gap-1">
                        {registro.puede_editar === true && (
                          <Boton
                            variante="sutil"
                            tamano="chico"
                            onClick={() => setFormulario({ abierto: true, registro })}
                          >
                            Editar
                          </Boton>
                        )}
                        {registro.puede_detener === true && (
                          <Boton variante="secundario" tamano="chico" onClick={() => { void detener(registro) }}>
                            Detener
                          </Boton>
                        )}
                        {registro.puede_borrar === true && (
                          <Boton variante="peligro" tamano="chico" onClick={() => { void borrar(registro) }}>
                            Eliminar
                          </Boton>
                        )}
                      </span>
                    </CeldaTabla>
                  )}
                </FilaTabla>
              )
            })}
          </CuerpoTabla>
        </Tabla>
          </div>
        </div>
      )}

      <PaginacionTabla
        paginacion={carga.fase === 'listo' ? carga.paginacion : undefined}
        onCambiar={cambiar}
      />

      <FormularioTimesheet
        key={`${formulario.registro?.id ?? 'nuevo'}-${String(formulario.abierto)}`}
        proyectoId={proyectoId}
        abierto={formulario.abierto}
        registro={formulario.registro}
        onOpenChange={(abierto) => setFormulario((actual) => ({ ...actual, abierto }))}
        onGuardado={recargar}
      />
    </div>
  )
}

/**
 * Totales del proyecto, arriba del listado.
 *
 * Los numeros salen de `logged_time` de `{fuente.resumen}`, ya calculados por el backend. **Son del
 * proyecto entero**, no de la pagina ni del filtro por persona: por eso las etiquetas dicen "en
 * total" y no "registrado", que se leeria como el total de lo que se ve.
 *
 * Cada tarjeta depende de que su clave haya llegado, y eso vale para los dos contratos: el del
 * equipo no manda `logged_time` a quien no puede verlo, el del contacto tampoco, y los tres de
 * facturacion viajan solo con `muestra_finanzas`. Un "00:00" que nadie conto es peor que la
 * ausencia del numero, y por eso sin ninguna cifra la fila entera no se dibuja.
 *
 * @param resumen la respuesta de `/overview`, tal como llego
 * @returns la fila de metricas, o `null` si ese contrato no mando ninguna
 */
function TotalesDelProyecto ({ resumen }: { resumen: ResumenDeProyecto }): ReactElement | null {
  const tiempo = resumen.logged_time
  const estimadas = horasEstimadasDelResumen(resumen)

  if (tiempo === undefined && estimadas === null) return null

  return (
    // Cinco columnas SIEMPRE, se pinten dos tarjetas o cinco: con `grid-cols-2` a dos tarjetas, cada
    // una ocuparia media pantalla para decir "00:00", que es la tarjeta-heroe que el sistema no usa en
    // ningun otro lado. Dejar columnas vacias a la derecha mantiene el ancho de tarjeta del resto del
    // producto.
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {tiempo !== undefined && (
        <Metrica etiqueta="Registrado en total" valor={segundosAHoraMinuto(tiempo.total_seconds)} />
      )}
      {estimadas !== null && (
        <Metrica etiqueta="Horas estimadas" valor={formatearNumero(estimadas, ' h')} />
      )}

      {tiempo?.muestra_finanzas === true && (
        <>
          <Metrica etiqueta="Facturable" valor={segundosAHoraMinuto(tiempo.billable_seconds ?? 0)} />
          <Metrica etiqueta="Facturado" valor={segundosAHoraMinuto(tiempo.billed_seconds ?? 0)} />
          <Metrica etiqueta="Sin facturar" valor={segundosAHoraMinuto(tiempo.unbilled_seconds ?? 0)} />
        </>
      )}
    </div>
  )
}
