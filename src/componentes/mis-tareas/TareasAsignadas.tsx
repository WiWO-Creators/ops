'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { CeldaEncabezado, CeldaTabla, CuerpoTabla, EncabezadoTabla, FilaTabla, Tabla } from '@/componentes/datos/Tabla'
import { PARAMETRO_TAREA } from '@/componentes/datos/tabla'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia, type TonoInsignia } from '@/componentes/presentadores/Insignia'
import { EstadoDeTarea } from '@/componentes/proyecto/EstadoDeTarea'
import { pedirSobre } from '@/datos/cliente'
import { GLOSARIO } from '@/dominio/glosario'
import { origenDeTarea, type ClaseDeOrigen } from '@/dominio/mis-tareas'
import type { EstadoLookup, Proceso } from '@/datos/recursos'
import type { Paginacion } from '@/datos/tipos'

/**
 * Cuantas filas trae cada pagina.
 *
 * Es el mismo tamaño por defecto de la API. A diferencia del tope que habia antes —50 filas y un
 * "se muestran las primeras 50"—, esto SI pagina: quien tiene cientos de asignaciones las alcanza
 * todas sin salir de la hoja.
 */
const POR_PAGINA = 25

/** Con que tono se pinta cada origen. La Licitacion resalta porque es lo que todavia no se gano. */
const TONO_ORIGEN: Record<ClaseDeOrigen, TonoInsignia> = {
  licitacion: 'acento',
  espacio: 'neutro',
  privada: 'contorno',
  otro: 'contorno'
}

export type Carga<T> =
  | { fase: 'cargando' }
  | { fase: 'error', mensaje: string }
  | { fase: 'listo', filas: T[], paginacion: Paginacion | undefined }

/**
 * Trae una pagina de la API y la mantiene cancelable.
 *
 * Pide desde el navegador y no desde el servidor por la misma razon de siempre: la lista depende de
 * la persona y de la pagina que esta mirando, no de la ruta, y resolverla en el render inicial
 * obligaria a un viaje de servidor por cada clic en "Siguiente".
 *
 * @param ruta Ruta relativa ya armada, con su filtro y su pagina.
 * @param queSon Como nombrar a lo que fallo, para el mensaje de error.
 * @param version Cambiar este numero vuelve a pedir la misma ruta. Es como se entera la lista de que
 *        se acaba de crear una Tarea: sin esto, la fila nueva no aparece hasta recargar.
 * @returns El estado de carga y la funcion para reintentar.
 */
export function useListaPaginada<T> (ruta: string, queSon: string, version = 0): [Carga<T>, () => void] {
  const [intento, setIntento] = useState(0)
  const clave = `${ruta}|${intento}|${version}`

  // Lo guardado lleva la clave de la peticion que lo trajo, y "cargando" se DERIVA de que esa clave
  // ya no sea la vigente. Marcarlo con un `setCarga({ fase: 'cargando' })' al entrar al efecto
  // encadenaba un render de mas en cada cambio de pagina, y ademas dejaba una ventana en la que la
  // pagina nueva se pintaba con las filas de la anterior.
  const [guardado, setGuardado] = useState<{ clave: string, carga: Carga<T> } | null>(null)

  const reintentar = useCallback(() => { setIntento((n) => n + 1) }, [])

  useEffect(() => {
    const control = new AbortController()

    void pedirSobre<T[]>(ruta, control.signal)
      .then((sobre) => {
        if (control.signal.aborted) return

        setGuardado({ clave, carga: { fase: 'listo', filas: sobre.data, paginacion: sobre.meta?.pagination } })
      })
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return

        setGuardado({
          clave,
          carga: {
            fase: 'error',
            mensaje: fallo instanceof Error ? fallo.message : `No se pudieron cargar ${queSon}.`
          }
        })
      })

    return () => { control.abort() }
  }, [clave, ruta, queSon])

  const carga: Carga<T> = guardado?.clave === clave ? guardado.carga : { fase: 'cargando' }

  return [carga, reintentar]
}

/**
 * Pie de una lista paginada: cuantas hay y como pasar de pagina.
 *
 * Con una sola pagina no dibuja botones, solo el total: dos controles muertos bajo cada tabla son
 * ruido en el caso mas comun, que es el de quien tiene menos de una pagina de trabajo.
 *
 * @param paginacion `meta.pagination` de la respuesta; ausente cuando el recurso no la manda.
 * @param cuantas Filas de la pagina actual, para poder decir el total cuando no hay paginacion.
 * @param onPagina Que hacer al elegir otra pagina.
 */
export function Paginador (
  { paginacion, cuantas, onPagina }:
  { paginacion: Paginacion | undefined, cuantas: number, onPagina: (pagina: number) => void }
) {
  const total = paginacion?.total ?? cuantas
  const paginas = paginacion?.total_pages ?? 1
  const pagina = paginacion?.page ?? 1

  if (paginas <= 1) return <p className="text-texto-tenue text-xs">{total} en total.</p>

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-texto-tenue text-xs">Página {pagina} de {paginas} · {total} en total.</p>

      <div className="flex items-center gap-2">
        <Boton
          tamano="chico"
          disabled={pagina <= 1}
          onClick={() => { onPagina(pagina - 1) }}
        >
          Anterior
        </Boton>
        <Boton
          tamano="chico"
          disabled={pagina >= paginas}
          onClick={() => { onPagina(pagina + 1) }}
        >
          Siguiente
        </Boton>
      </div>
    </div>
  )
}

interface PropsTareasAsignadas {
  /** De quien son las Tareas. Toda la lista va filtrada por esto. */
  personaId: number
  /** Encabezado de la seccion. */
  titulo: string
  /** `task_statuses` de `GET /lookups`, resueltos en el servidor para no pedirlos de nuevo. */
  estados: EstadoLookup[]
  /**
   * Fragmento extra de la consulta, sin el `&` inicial. Es lo que separa las dos mitades de la hoja
   * (`SOLO_CON_ESPACIO` / `SOLO_SIN_ESPACIO`) y lo que deja acotar a los estados abiertos.
   */
  consultaExtra?: string
  /** Que decir cuando no hay ni una fila. */
  vacio: { titulo: string, descripcion: string }
  /** Ids de Espacio que son Licitaciones. Sin la lista, todo Espacio se lee como Proyecto. */
  licitaciones?: number[]
  /**
   * Pantalla donde vive el detalle de una Tarea. El modal se abre con `?tarea={id}` sobre ella, asi
   * que una hoja que monta su propio `ModalTarea` pasa su propia ruta y el detalle se abre sin salir.
   */
  rutaDetalle?: string
  /** Controles del encabezado —un alta, por ejemplo—. Se dibujan tambien con la lista vacia. */
  accion?: ReactNode
  /** Ver `useListaPaginada`: cambiarlo vuelve a pedir la pagina. */
  version?: number
}

/**
 * Las Tareas que una persona tiene asignadas, paginadas y con su origen a la vista.
 *
 * No usa `TablaRecurso`: ese motor toma la consulta de la URL y no admite un filtro fijo, asi que el
 * filtro por persona se podria cambiar a mano y la hoja mostraria trabajo ajeno bajo el titulo "Mis
 * Tareas". Lo que hace falta aca es una lista acotada a una persona; la vista con filtros y orden ya
 * existe y es `/procesos`.
 *
 * @returns La seccion con su encabezado, su tabla y su paginador.
 */
export function TareasAsignadas ({
  personaId, titulo, estados, consultaExtra, vacio, licitaciones,
  rutaDetalle = '/procesos', accion, version = 0
}: PropsTareasAsignadas) {
  const [pagina, setPagina] = useState(1)
  const plural = GLOSARIO.proceso.plural.toLowerCase()
  const deLicitacion = useMemo(() => new Set(licitaciones ?? []), [licitaciones])

  const ruta = `tasks?assignee=${personaId}&per_page=${POR_PAGINA}&page=${pagina}&sort=due_date`
    + (consultaExtra === undefined ? '' : `&${consultaExtra}`)

  const [carga, reintentar] = useListaPaginada<Proceso>(ruta, plural, version)

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-texto text-sm font-semibold">{titulo}</h2>
        {accion}
      </div>

      {carga.fase === 'cargando' && <Cargando alto="min-h-40" mensaje={`Cargando ${plural}…`} />}
      {carga.fase === 'error' && <ErrorEstado detalle={carga.mensaje} onReintentar={reintentar} />}

      {carga.fase === 'listo' && carga.filas.length === 0 && (
        <Vacio titulo={vacio.titulo} descripcion={vacio.descripcion} />
      )}

      {carga.fase === 'listo' && carga.filas.length > 0 && (
        <>
          <Tabla>
            <EncabezadoTabla>
              <tr>
                <CeldaEncabezado sinCortar>ID</CeldaEncabezado>
                <CeldaEncabezado>Nombre</CeldaEncabezado>
                <CeldaEncabezado>Estado</CeldaEncabezado>
                <CeldaEncabezado>Origen</CeldaEncabezado>
                <CeldaEncabezado>Vence</CeldaEncabezado>
              </tr>
            </EncabezadoTabla>

            <CuerpoTabla>
              {carga.filas.map((tarea) => {
                const origen = origenDeTarea(tarea, deLicitacion)

                return (
                  <FilaTabla key={tarea.id}>
                    <CeldaTabla sinCortar className="text-texto-tenue">
                      {tarea.patente ?? `#${tarea.id}`}
                    </CeldaTabla>

                    <CeldaTabla>
                      <Link
                        href={`${rutaDetalle}?${PARAMETRO_TAREA}=${tarea.id}`}
                        className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
                      >
                        {tarea.name}
                      </Link>
                    </CeldaTabla>

                    <CeldaTabla>
                      <EstadoDeTarea status={tarea.status} catalogo={estados} tamano="medio" />
                    </CeldaTabla>

                    <CeldaTabla>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Insignia tono={TONO_ORIGEN[origen.clase]} tamano="chico">{origen.tipo}</Insignia>

                        {origen.nombre !== null && (origen.href === null
                          ? <span className="text-texto-tenue">{origen.nombre}</span>
                          : (
                            <Link
                              href={origen.href}
                              className="text-texto-tenue hover:text-acento underline-offset-4 hover:underline"
                            >
                              {origen.nombre}
                            </Link>
                            ))}
                      </span>
                    </CeldaTabla>

                    <CeldaTabla>
                      <Fecha valor={tarea.due_date} comoVencimiento />
                    </CeldaTabla>
                  </FilaTabla>
                )
              })}
            </CuerpoTabla>
          </Tabla>

          <Paginador
            paginacion={carga.paginacion}
            cuantas={carga.filas.length}
            onPagina={setPagina}
          />
        </>
      )}
    </section>
  )
}
