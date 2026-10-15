'use client'

import { Users } from 'lucide-react'
import { Vacio } from '@/componentes/estado/Estados'
import type { FilaDeLive } from '@/datos/live'
import type { Yo } from '@/datos/tipos'
import { cn } from '@/lib/clases'
import { repartirTablero } from './presentacion'
import { FilaEnVivo } from './FilaEnVivo'
import { SinJornada } from './SinJornada'
import { TITULO_POR_ALCANCE } from './titulos'
import { useTableroEnVivo } from './useTableroEnVivo'
import type { AlcanceDeLive } from '@/dominio/live'
import type { OpcionFiltro } from '@/definiciones/tipos'

interface PropsPanelEquipo {
  inicial: FilaDeLive[]
  operador: Pick<Yo, 'id' | 'is_admin' | 'is_superadmin'>
  /** Mensaje si el servidor no pudo leer el tablero al pintar. */
  errorInicial?: string | null
  /** Cada cuantos segundos se vuelve a preguntar. Lo resuelve el servidor (`intervaloDeLive()`). */
  segundos: number
  /** Hasta donde ve quien mira. Solo cambia el titulo: la API ya filtro las filas. */
  alcance: AlcanceDeLive
  /**
   * `task_statuses` de `GET /lookups`, para el estado de la Tarea que cada quien esta midiendo.
   *
   * Baja del servidor como prop y **no entra en el latido de 30 segundos**: el catalogo no cambia
   * entre dos consultas del tablero, y volver a pedirlo en cada tic convertiria un dato estable en
   * trafico permanente. Vacio —el valor por defecto— no pinta insignias.
   */
  estados?: OpcionFiltro[]
}

/**
 * El equipo, ahora mismo: una tarjeta por persona, con lo que esta trabajando colgando de ella.
 *
 * === POR QUE UNA LISTA PLANA Y NO GRUPOS POR ESPACIO ===
 *
 * Porque la raiz de la jerarquia es la persona. Un encabezado de Espacio sobre un grupo repetiria el
 * mismo Proyecto que ya dice cada tarjeta —el mismo dato dos veces, uno encima del otro— y de paso
 * partiria en dos listas a la gente que no esta midiendo. Lo que queda es el ORDEN
 * (`ordenarPorActividad`): quien mide arriba, quien solo tiene jornada despues, el resto al final.
 *
 * === POR QUE SE REFRESCA SOLO Y NO CON `router.refresh()` ===
 *
 * Por lo mismo que `auditoria/PanelEnVivo`: `router.refresh()` re-ejecuta la pagina entera, y en
 * `/live` eso reiniciaria el control de jornada que esta al lado —incluido el Espacio que la persona
 * acaba de elegir en el combo— cada vez que el tablero late. El panel pide su endpoint y se repinta
 * el solo.
 *
 * === POR QUE NO SSE ===
 *
 * Porque el dato cambia cuando alguien aprieta un boton, no continuamente. Sostener un stream abierto
 * por persona a traves del BFF —que ademas tendria que mantener vivo el token de cada una— es
 * infraestructura permanente para un evento que ocurre unas pocas veces por hora.
 *
 * === POR QUE NO REUSA EL ARBOL DE PRESENCIA ===
 *
 * `arbolDePresencia` y `PersonaActiva` estan tipados contra `PersonaConectada` y viven de `activity`,
 * `location` y `route`, que aca no existen. Y su arbol se pliega en tres niveles; el de LIVE no se
 * pliega: persona, Espacio y Tarea caben enteros en la tarjeta, que es el punto. Lo que si se
 * comparte es lo que de verdad es comun: `Avatar`, `Insignia`, `Vacio`, `haceCuanto()` y
 * `formatearDuracion()`.
 */
export function PanelEquipo ({
  inicial,
  errorInicial = null,
  segundos,
  alcance,
  operador,
  estados = []
}: PropsPanelEquipo) {
  // El sondeo, los avisos del bus y el contador de segundos viven en `useTableroEnVivo`, que
  // comparten la lista y las tarjetas: dos formas de repreguntar lo mismo terminarian dando
  // numeros distintos sobre el mismo tablero.
  const { filas, transcurrido, error } = useTableroEnVivo({ inicial, errorInicial, segundos })

  const { activos, enReposo } = repartirTablero(filas)
  const midiendo = filas.filter((fila) => fila.medidor !== null).length

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-texto text-titulo text-balance font-semibold">
            {TITULO_POR_ALCANCE[alcance]}
          </h2>
          <p className="text-texto-tenue text-pretty text-xs">
            Cada persona, con lo que está midiendo ahora
          </p>
        </div>

        <span className="border-linea bg-superficie-elevada text-texto rounded-control flex items-center gap-2 border px-3 py-1.5 text-sm font-medium tabular-nums">
          <span
            aria-hidden="true"
            className={cn('size-2 rounded-full', error !== null
              ? 'bg-texto-peligro'
              : midiendo > 0 ? 'bg-texto-exito' : 'bg-texto-sutil')}
          />
          <Users size={14} strokeWidth={2} aria-hidden="true" />
          {midiendo} {midiendo === 1 ? 'persona midiendo' : 'personas midiendo'}
        </span>
      </div>

      {error !== null && (
        <p role="status" className="text-texto-peligro text-pretty text-sm">{error}</p>
      )}

      {activos.length === 0
        ? (
          <Vacio
            titulo="Nadie con jornada abierta"
            descripcion="Aquí aparece quien abra su jornada y arranque un medidor. Se actualiza solo."
            className="border-linea bg-superficie-hundida rounded-tarjeta border"
          />
          )
        : (
          <ul className="flex flex-col gap-2">
            {activos.map((fila) => (
              <FilaEnVivo
                key={`${fila.staff.id}:${fila.medidor?.id ?? 'sin-medidor'}`}
                fila={fila}
                transcurrido={transcurrido}
                puedeDetener={operador.is_admin || operador.is_superadmin || operador.id === fila.staff.id}
                estados={estados}
              />
            ))}
          </ul>
          )}

      {enReposo.length > 0 && <SinJornada filas={enReposo} />}
    </section>
  )
}
