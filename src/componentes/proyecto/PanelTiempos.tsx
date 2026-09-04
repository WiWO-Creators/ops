'use client'

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation'
import { ControlesTabla, PaginacionTabla } from '@/componentes/datos/ControlesTabla'
import { PresetsFiltro } from '@/componentes/datos/PresetsFiltro'
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
import { pedirSobre } from '@/datos/cliente'
import { construirConsulta, leerConsulta } from '@/datos/consulta'
import { leerError } from '@/datos/errores'
import type { PersonaConTiempo, RegistroTiempo, ResumenEspacio } from '@/datos/recursos'
import type { Capacidad, Paginacion } from '@/datos/tipos'
import { LOOKUP_PERSONAS_CON_TIEMPO, TIEMPOS } from '@/definiciones/tiempos'
import type { EstadoConsulta, OpcionFiltro } from '@/definiciones/tipos'
import { useRecurso } from './carga'
import { segundosAHoraMinuto } from './formatos'
import { FormularioTimesheet } from './FormularioTimesheet'
import { Metrica, formatearNumero } from './ResumenProyecto'
import { duracionMostrada, hayRegistroCorriendo } from './timesheet'

/**
 * Registro de horas de un proyecto.
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

interface PropsPanelTiempos {
  proyectoId: number
  capacidades: Capacidad[]
}

type Carga =
  | { fase: 'cargando' }
  | { fase: 'error', mensaje: string }
  | { fase: 'listo', registros: RegistroTiempo[], paginacion: Paginacion | undefined }

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

export function PanelTiempos ({ proyectoId, capacidades }: PropsPanelTiempos): ReactElement {
  // Leer `useSearchParams` exige un limite de Suspense: sin el, el build de cualquier pagina que
  // monte este panel falla, y esas paginas las escribe otra persona.
  return (
    <Suspense fallback={<Cargando alto="min-h-60" mensaje="Cargando las horas…" />}>
      <TiemposDelProyecto proyectoId={proyectoId} capacidades={capacidades} />
    </Suspense>
  )
}

function TiemposDelProyecto ({ proyectoId, capacidades }: PropsPanelTiempos): ReactElement {
  const router = useRouter()
  const params = useSearchParams()

  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' })
  const [personas, setPersonas] = useState<PersonaConTiempo[]>([])
  const [intento, setIntento] = useState(0)
  const [ahora, setAhora] = useState(() => new Date())
  const [formulario, setFormulario] = useState<{ abierto: boolean, registro: RegistroTiempo | null }>(
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

  /** Lo que la persona eligio, leido de la URL. Lo desconocido se descarta: un `?page=abc` no viaja. */
  const estado = useMemo(
    () => leerConsulta(new URLSearchParams(params.toString()), TIEMPOS),
    [params]
  )

  /** La misma consulta, ya podada contra la whitelist del backend. Sin `?` inicial. */
  const consulta = useMemo(() => construirConsulta(estado, TIEMPOS), [estado])

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
  const { estado: resumen, recargar: recargarResumen } = useRecurso<ResumenEspacio>(
    `projects/${proyectoId}/overview`,
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
    const siguiente = construirConsulta({ ...estado, ...parcial }, TIEMPOS)

    router.replace(urlConservandoAjenos(params, consulta, siguiente), { scroll: false })
  }, [estado, consulta, params, router])

  /** Identifica la consulta vigente. Cambia con la URL y con cada recarga manual. */
  const clave = `${consulta}|${intento}`
  const refrescando = clavePintada !== null && clavePintada !== clave

  useEffect(() => {
    const control = new AbortController()
    const ruta = `projects/${proyectoId}/timesheets${consulta === '' ? '' : `?${consulta}`}`

    // Sin volver a 'cargando' al refrescar: la tabla se queda con las filas anteriores hasta que
    // llegan las nuevas, en vez de parpadear a un bloque de carga cada vez que se cambia de pagina.
    // Que no parpadee no quiere decir que no avise: mientras la clave pintada no sea la vigente,
    // el chip dice que hay algo en curso.
    void pedirSobre<RegistroTiempo[]>(ruta, control.signal)
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
  }, [proyectoId, consulta, clave])

  useEffect(() => {
    const control = new AbortController()

    void pedirSobre<PersonaConTiempo[]>(`projects/${proyectoId}/timesheets/staff`, control.signal)
      .then((sobre) => setPersonas(sobre.data))
      .catch(() => {
        // El filtro por persona es accesorio: sin el, la tabla se ve igual. No se convierte en error.
      })

    return () => { control.abort() }
  }, [proyectoId, intento])

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
  async function detener (registro: RegistroTiempo): Promise<void> {
    setAviso(null)

    try {
      const respuesta = await fetch(`/api/bff/tasks/${registro.task.id}/timer`, { method: 'DELETE' })

      if (!respuesta.ok) {
        setAviso((await leerError(respuesta)).message)
        return
      }

      recargar()
    } catch {
      setAviso('No se pudo detener: revisá la conexión.')
    }
  }

  /** Borra un registro. Pregunta antes: no hay deshacer del otro lado. */
  async function borrar (registro: RegistroTiempo): Promise<void> {
    if (!window.confirm(`¿Eliminar el registro de ${registro.staff.full_name} (${registro.duration_hm})?`)) return

    setAviso(null)

    try {
      const respuesta = await fetch(`/api/bff/projects/${proyectoId}/timesheets/${registro.id}`, {
        method: 'DELETE'
      })

      if (!respuesta.ok) {
        setAviso((await leerError(respuesta)).message)
        return
      }

      recargar()
    } catch {
      setAviso('No se pudo eliminar: revisá la conexión.')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {resumen.fase === 'listo' && <TotalesDelProyecto resumen={resumen.datos} />}

      <div className="flex flex-wrap items-start justify-between gap-2">
        <ControlesTabla
          definicion={TIEMPOS}
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
          <PresetsFiltro
            board="timesheets"
            filtrosActuales={estado.filtros}
            onAplicar={(filtros) => { cambiar({ filtros, pagina: 1 }) }}
          />

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
            ? 'Probá quitando filtros o buscando otra cosa.'
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
              <CeldaEncabezado>Etiquetas</CeldaEncabezado>
              <CeldaEncabezado>Hora de inicio</CeldaEncabezado>
              <CeldaEncabezado>Hora de finalización</CeldaEncabezado>
              <CeldaEncabezado>Nota</CeldaEncabezado>
              <CeldaEncabezado numerica>Hora (h)</CeldaEncabezado>
              <CeldaEncabezado numerica>Hora (decimal)</CeldaEncabezado>
              <CeldaEncabezado>
                <span className="sr-only">Opciones</span>
              </CeldaEncabezado>
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
                        nombre={registro.staff.full_name}
                        imagen={registro.staff.profile_image_url}
                        tamano="chico"
                      />
                      <span className="text-texto">{registro.staff.full_name}</span>
                      {!registro.staff.sigue_asignado && (
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
                      {registro.task.billed
                        ? <Insignia tono="exito" tamano="chico">Facturada</Insignia>
                        : registro.task.billable && <Insignia tono="aviso" tamano="chico">No facturada</Insignia>}
                    </span>
                  </CeldaTabla>

                  <CeldaTabla><Etiquetas etiquetas={registro.tags} /></CeldaTabla>
                  <CeldaTabla><Fecha valor={registro.start_time} conHora /></CeldaTabla>
                  <CeldaTabla>
                    {registro.end_time === null
                      ? <Insignia tono="acento" tamano="chico">En curso</Insignia>
                      : <Fecha valor={registro.end_time} conHora />}
                  </CeldaTabla>
                  <CeldaTabla className="max-w-64 truncate">{registro.note ?? ''}</CeldaTabla>
                  <CeldaTabla numerica>{duracion.hm}</CeldaTabla>
                  <CeldaTabla numerica>{duracion.decimal.toFixed(2)}</CeldaTabla>

                  <CeldaTabla>
                    <span className="flex items-center gap-1">
                      {registro.puede_editar && (
                        <Boton
                          variante="sutil"
                          tamano="chico"
                          onClick={() => setFormulario({ abierto: true, registro })}
                        >
                          Editar
                        </Boton>
                      )}
                      {registro.puede_detener && (
                        <Boton variante="secundario" tamano="chico" onClick={() => { void detener(registro) }}>
                          Detener
                        </Boton>
                      )}
                      {registro.puede_borrar && (
                        <Boton variante="peligro" tamano="chico" onClick={() => { void borrar(registro) }}>
                          Eliminar
                        </Boton>
                      )}
                    </span>
                  </CeldaTabla>
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
 * Los cinco numeros salen de `logged_time` de `GET /projects/{id}/overview`, ya calculados por el
 * backend. **Son del proyecto entero**, no de la pagina ni del filtro por persona: por eso las
 * etiquetas dicen "en total" y no "registrado", que se leeria como el total de lo que se ve.
 *
 * Los tres de facturacion solo aparecen con `muestra_finanzas`. Cuando el backend lo apaga —sin
 * `create projects`, o con un proyecto que no factura por horas— esos campos vienen en cero, y un
 * "00:00" que nadie conto es peor que la ausencia del numero.
 *
 * @param resumen la respuesta de `/overview`, tal como llego
 * @returns la fila de metricas
 */
function TotalesDelProyecto ({ resumen }: { resumen: ResumenEspacio }): ReactElement {
  const tiempo = resumen.logged_time

  return (
    // Cinco columnas SIEMPRE, se pinten dos tarjetas o cinco: con `grid-cols-2` a dos tarjetas, cada
    // una ocuparia media pantalla para decir "00:00", que es la tarjeta-heroe que el sistema no usa en
    // ningun otro lado. Dejar columnas vacias a la derecha mantiene el ancho de tarjeta del resto del
    // producto.
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <Metrica etiqueta="Registrado en total" valor={segundosAHoraMinuto(tiempo.total_seconds)} />
      <Metrica etiqueta="Horas estimadas" valor={formatearNumero(resumen.estimated_hours, ' h')} />

      {tiempo.muestra_finanzas && (
        <>
          <Metrica etiqueta="Facturable" valor={segundosAHoraMinuto(tiempo.billable_seconds)} />
          <Metrica etiqueta="Facturado" valor={segundosAHoraMinuto(tiempo.billed_seconds)} />
          <Metrica etiqueta="Sin facturar" valor={segundosAHoraMinuto(tiempo.unbilled_seconds)} />
        </>
      )}
    </div>
  )
}
