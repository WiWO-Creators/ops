'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ControlesTabla, PaginacionTabla } from '@/componentes/datos/ControlesTabla'
import { clavesVisiblesPorDefecto } from '@/componentes/datos/tabla'
import { TablaEspacios } from '@/componentes/datos/vistas'
import { Vacio } from '@/componentes/estado/Estados'
import { TarjetaProyecto } from './TarjetaProyecto'
import { construirConsulta, leerConsulta } from '@/datos/consulta'
import type { Capacidad } from '@/datos/tipos'
import type { Espacio } from '@/datos/recursos'
import { ESPACIOS } from '@/definiciones/espacios'
import type { EstadoConsulta, OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'
import { cn } from '@/lib/clases'

/**
 * Listado de Proyectos en tarjetas, y el alternador que lo intercambia con la tabla.
 *
 * Nada de esto reimplementa el motor: la consulta se lee y se arma con `leerConsulta` /
 * `construirConsulta`, los controles son los de `ControlesTabla` y el paginador es
 * `PaginacionTabla`. Lo unico propio es como se pinta cada fila.
 *
 * A diferencia de `TablaRecurso`, la vista de tarjetas no pide la pagina desde el navegador: al
 * escribir la consulta en la URL, Next vuelve a ejecutar la pagina de servidor y baja las filas ya
 * resueltas. Duplicar aca el `fetch` al BFF seria una segunda copia de la misma logica —y una
 * peticion de mas— para obtener exactamente lo mismo.
 */

export type Vista = 'tarjetas' | 'tabla'

const VISTAS: Array<{ clave: Vista, etiqueta: string }> = [
  { clave: 'tarjetas', etiqueta: 'Tarjetas' },
  { clave: 'tabla', etiqueta: 'Tabla' }
]

/**
 * Query de la URL con la vista anexada, conservando filtros, orden y pagina.
 *
 * @param params parametros vigentes
 * @param vista presentacion elegida
 * @returns la query lista para `router.replace`, con `?` inicial
 */
function conVista (params: URLSearchParams, vista: Vista): string {
  const query = new URLSearchParams(params.toString())
  query.set('vista', vista)

  return `?${query.toString()}`
}

interface PropsVistaEspacios {
  /** Pagina ya resuelta en el servidor para la consulta que dice la URL. */
  inicial: ResultadoLista<Espacio>
  capacidades?: Capacidad[]
  opcionesDeFiltro?: Record<string, OpcionFiltro[]>
  /** Vista que pedia la URL al entrar. Por defecto, tarjetas. */
  vistaInicial: Vista
}

/**
 * Listado de Proyectos con alternador de presentacion.
 *
 * La vista vive en la URL (`?vista=`) y en ningun otro lado: asi un enlace la conserva. El motor de
 * tabla preserva los parametros que no son suyos al filtrar, de modo que filtrar dentro de la tabla
 * ya no devuelve a las tarjetas.
 */
export function VistaEspacios ({ inicial, capacidades, opcionesDeFiltro, vistaInicial }: PropsVistaEspacios) {
  const router = useRouter()
  const params = useSearchParams()
  const vista: Vista = params.get('vista') === 'tabla' ? 'tabla' : vistaInicial

  function cambiarVista (elegida: Vista) {
    router.replace(conVista(params, elegida), { scroll: false })
  }

  return (
    <div className="flex flex-col gap-3">
      <AlternadorVista vista={vista} onCambiar={cambiarVista} />

      {vista === 'tabla'
        ? <TablaEspacios inicial={inicial} capacidades={capacidades} opcionesDeFiltro={opcionesDeFiltro} />
        : <TarjetasProyectos resultado={inicial} opcionesDeFiltro={opcionesDeFiltro} />}
    </div>
  )
}

/**
 * Alternador de presentacion del listado.
 *
 * Botones y no enlaces: son dos formas de ver lo mismo, no dos destinos. `aria-pressed` dice cual
 * esta activa sin depender del color de fondo.
 */
function AlternadorVista ({ vista, onCambiar }: { vista: Vista, onCambiar: (vista: Vista) => void }) {
  return (
    <div
      role="group"
      aria-label="Presentación del listado"
      className="border-linea bg-superficie-acentuada rounded-control inline-flex w-fit gap-0.5 border p-0.5"
    >
      {VISTAS.map((opcion) => {
        const activa = opcion.clave === vista

        return (
          <button
            key={opcion.clave}
            type="button"
            aria-pressed={activa}
            onClick={() => { onCambiar(opcion.clave) }}
            className={cn(
              'rounded-control ease-neo h-7 px-3 text-xs font-semibold',
              'transition-[background-color,color] duration-150',
              activa
                ? 'bg-superficie-elevada text-texto shadow-1'
                : 'text-texto-tenue hover:bg-hover hover:text-texto'
            )}
          >
            {opcion.etiqueta}
          </button>
        )
      })}
    </div>
  )
}

interface PropsTarjetasProyectos {
  /** Pagina vigente, resuelta en el servidor para la consulta que dice la URL. */
  resultado: ResultadoLista<Espacio>
  opcionesDeFiltro?: Record<string, OpcionFiltro[]>
}

/**
 * Grilla de tarjetas de Proyecto, con los mismos controles y paginador que la tabla.
 *
 * @param resultado filas y paginacion de la pagina vigente
 * @param opcionesDeFiltro catalogos de `/lookups`, para los filtros y para el color del estado
 */
export function TarjetasProyectos ({ resultado, opcionesDeFiltro }: PropsTarjetasProyectos) {
  const router = useRouter()
  const params = useSearchParams()
  const [pendiente, iniciarTransicion] = useTransition()

  // `ControlesTabla` incluye el selector de columnas, que en tarjetas no cambia nada. Se le pasa el
  // estado igual porque el control es del motor y no se toca desde aca.
  const [visibles, setVisibles] = useState(() => clavesVisiblesPorDefecto(ESPACIOS.columnas))

  const estado = useMemo(
    () => leerConsulta(new URLSearchParams(params.toString()), ESPACIOS),
    [params]
  )

  /**
   * Aplica un cambio parcial de la consulta escribiendolo en la URL, igual que el motor de tabla.
   *
   * `replace` y no `push`: cada filtro seria una entrada del historial. La transicion mantiene la
   * grilla anterior en pantalla mientras el servidor resuelve la nueva pagina, en vez de vaciarla.
   */
  function cambiar (parcial: Partial<EstadoConsulta>) {
    const query = new URLSearchParams(construirConsulta({ ...estado, ...parcial }, ESPACIOS))
    query.set('vista', 'tarjetas')

    iniciarTransicion(() => { router.replace(`?${query.toString()}`, { scroll: false }) })
  }

  return (
    <div className="flex flex-col gap-3">
      <ControlesTabla
        definicion={ESPACIOS}
        estado={estado}
        visibles={visibles}
        opcionesDeFiltro={opcionesDeFiltro}
        onCambiar={cambiar}
        onVisibles={setVisibles}
        sinColumnas
      />

      {resultado.filas.length === 0
        ? (
          <Vacio
            titulo={`No hay ${ESPACIOS.titulo.plural.toLowerCase()}`}
            descripcion="Probá quitando filtros o buscando otra cosa."
          />
          )
        : (
          <ul
            aria-busy={pendiente}
            className={cn(
              'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3',
              pendiente && 'opacity-60 transition-opacity'
            )}
          >
            {resultado.filas.map((espacio) => (
              <li key={espacio.id} className="flex">
                <TarjetaProyecto
                  espacio={espacio}
                  estados={opcionesDeFiltro?.project_statuses}
                  className="w-full"
                />
              </li>
            ))}
          </ul>
          )}

      <PaginacionTabla paginacion={resultado.paginacion} onCambiar={cambiar} />
    </div>
  )
}
