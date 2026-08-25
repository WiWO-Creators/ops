'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { CeldaEncabezado, CeldaTabla, CuerpoTabla, EncabezadoTabla, FilaTabla, Tabla } from '@/componentes/datos/Tabla'
import { BarraProgreso } from '@/componentes/proyecto/CabeceraProyecto'
import { Metrica } from '@/componentes/proyecto/ResumenProyecto'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { pedirSobre } from '@/datos/cliente'
import { GLOSARIO } from '@/dominio/glosario'
import type { EstadoLookup, Espacio } from '@/datos/recursos'
import type { Paginacion } from '@/datos/tipos'

/**
 * Cuantos Proyectos se traen de una vez.
 *
 * Es el maximo que acepta la API (`POR_PAGINA_MAXIMO` del backend). Un cliente con mas que esto es
 * un caso que esta pantalla no pagina: manda a la lista completa de Proyectos, que si la pagina.
 */
const POR_PAGINA = 100

/** Lo que hace falta para pintar la pestaña. El error es un texto listo, no un envelope. */
type Carga =
  | { fase: 'cargando' }
  | { fase: 'error', mensaje: string }
  | { fase: 'listo', proyectos: Espacio[], paginacion: Paginacion | undefined }

interface Props {
  clienteId: number
  /** `project_statuses` de `GET /lookups`, resueltos en el servidor para no pedirlos de nuevo. */
  estados: EstadoLookup[]
}

/**
 * Pestaña Proyectos de un Cliente.
 *
 * Pide desde el navegador y no desde el servidor a proposito: son datos de una pestaña que puede no
 * abrirse nunca, y bajarlos en cada visita al cliente costaria una peticion mas por visita.
 *
 * No usa `TablaRecurso`: ese motor toma la consulta entera de la URL y no admite un filtro fijo, asi
 * que la persona podria cambiar `filter[clientid]` desde el detalle de otro cliente y ver Proyectos
 * ajenos bajo el encabezado equivocado. Lo que se necesita aca es una lista acotada; la vista con
 * filtros, orden y paginacion completa ya existe en `/espacios` y esta enlazada.
 *
 * @param clienteId Cliente que se esta mirando.
 * @param estados Catalogo de estados de Proyecto, para resolver nombre y color.
 * @returns Las metricas, la lista y el enlace a la vista completa.
 */
export function PanelProyectosCliente ({ clienteId, estados }: Props) {
  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' })
  const [intento, setIntento] = useState(0)

  const reintentar = useCallback(() => {
    setCarga({ fase: 'cargando' })
    setIntento((n) => n + 1)
  }, [])

  useEffect(() => {
    const control = new AbortController()
    const ruta = `projects?filter[clientid]=${clienteId}&per_page=${POR_PAGINA}&sort=deadline`

    void pedirSobre<Espacio[]>(ruta, control.signal)
      .then((sobre) => {
        if (control.signal.aborted) return

        setCarga({ fase: 'listo', proyectos: sobre.data, paginacion: sobre.meta?.pagination })
      })
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return

        setCarga({
          fase: 'error',
          mensaje: fallo instanceof Error
            ? fallo.message
            : `No se pudieron cargar los ${GLOSARIO.espacio.plural.toLowerCase()}.`
        })
      })

    return () => { control.abort() }
  }, [clienteId, intento])

  if (carga.fase === 'cargando') return <Cargando filas={5} />
  if (carga.fase === 'error') return <ErrorEstado detalle={carga.mensaje} onReintentar={reintentar} />

  const { proyectos, paginacion } = carga
  const enLaLista = `/espacios?filter[clientid]=${clienteId}`

  if (proyectos.length === 0) {
    return (
      <Vacio
        titulo={`Este cliente no tiene ${GLOSARIO.espacio.plural.toLowerCase()}`}
        descripcion={`Cuando se le abra el primero va a aparecer acá, con su avance y su fecha de entrega.`}
        accion={
          <Link href="/espacios" className="text-acento text-sm font-semibold underline underline-offset-4">
            Ir a {GLOSARIO.espacio.plural}
          </Link>
        }
      />
    )
  }

  const total = paginacion?.total ?? proyectos.length
  const completos = proyectos.length === total

  return (
    <div className="flex flex-col gap-4">
      <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
        <Metrica etiqueta={GLOSARIO.espacio.plural} valor={String(total)} />
        {/* Los conteos suman lo que hay en mano: con mas de una pagina serian un subtotal disfrazado
            de total, asi que solo se muestran cuando llego la lista entera. */}
        {completos && (
          <>
            <Metrica
              etiqueta={`${GLOSARIO.proceso.plural} abiertas`}
              valor={String(sumar(proyectos, (p) => p.counts.tasks_open))}
            />
            <Metrica
              etiqueta={`${GLOSARIO.proceso.plural} totales`}
              valor={String(sumar(proyectos, (p) => p.counts.tasks))}
            />
          </>
        )}
      </div>

      <Tabla>
        <EncabezadoTabla>
          <tr>
            <CeldaEncabezado>Nombre</CeldaEncabezado>
            <CeldaEncabezado>Estado</CeldaEncabezado>
            <CeldaEncabezado className="w-40">Avance</CeldaEncabezado>
            <CeldaEncabezado>Entrega</CeldaEncabezado>
            <CeldaEncabezado numerica>{GLOSARIO.proceso.plural} abiertas</CeldaEncabezado>
          </tr>
        </EncabezadoTabla>

        <CuerpoTabla>
          {proyectos.map((proyecto) => {
            const estado = estados.find((e) => e.id === proyecto.status)

            return (
              <FilaTabla key={proyecto.id}>
                <CeldaTabla>
                  <Link
                    href={`/espacios/${proyecto.id}`}
                    className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
                  >
                    {proyecto.name}
                  </Link>
                </CeldaTabla>

                <CeldaTabla>
                  <Insignia color={estado?.color ?? null}>{estado?.name ?? `#${proyecto.status}`}</Insignia>
                </CeldaTabla>

                <CeldaTabla>
                  <span className="flex items-center gap-2">
                    <BarraProgreso porcentaje={proyecto.progress} className="min-w-16" />
                    <span className="text-texto-tenue w-9 shrink-0 text-right text-xs tabular-nums">
                      {proyecto.progress}%
                    </span>
                  </span>
                </CeldaTabla>

                <CeldaTabla>
                  {/* Solo se marca en rojo lo que sigue abierto: un Proyecto terminado con fecha
                      pasada no esta vencido, y pintarlo asi convierte la alarma en ruido. */}
                  <Fecha valor={proyecto.deadline} comoVencimiento={proyecto.progress < 100} />
                </CeldaTabla>

                <CeldaTabla numerica className="text-texto-tenue">
                  {proyecto.counts.tasks_open}
                </CeldaTabla>
              </FilaTabla>
            )
          })}
        </CuerpoTabla>
      </Tabla>

      <p className="text-texto-tenue text-xs">
        {completos
          ? `Se muestran los ${total} de este cliente.`
          : `Se muestran ${proyectos.length} de ${total}.`}{' '}
        <Link href={enLaLista} className="text-acento underline underline-offset-4">
          Verlos en {GLOSARIO.espacio.plural} con filtros y orden
        </Link>
      </p>
    </div>
  )
}

/**
 * Suma un contador sobre la lista.
 *
 * @param proyectos Los proyectos en mano.
 * @param de Que contador se suma de cada uno.
 * @returns El total.
 */
function sumar (proyectos: Espacio[], de: (proyecto: Espacio) => number): number {
  return proyectos.reduce((acumulado, proyecto) => acumulado + de(proyecto), 0)
}
