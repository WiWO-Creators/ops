'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight, Users } from 'lucide-react'
import { Vacio } from '@/componentes/estado/Estados'
import { Avatar } from '@/componentes/presentadores/Avatar'
import type { AlcanceDeLive } from '@/dominio/live'
import type { FilaDeLive } from '@/datos/live'
import type { Yo } from '@/datos/tipos'
import { escucharMedidor } from './medidor'
import { cn } from '@/lib/clases'
import { cargoYArea, repartirTablero } from './presentacion'
import { FilaEnVivo } from './FilaEnVivo'

interface PropsPanelEquipo {
  inicial: FilaDeLive[]
  operador: Pick<Yo, 'id' | 'is_admin' | 'is_superadmin'>
  /** Mensaje si el servidor no pudo leer el tablero al pintar. */
  errorInicial?: string | null
  /** Cada cuantos segundos se vuelve a preguntar. Lo resuelve el servidor (`intervaloDeLive()`). */
  segundos: number
  /** Hasta donde ve quien mira. Solo cambia el titulo: la API ya filtro las filas. */
  alcance: AlcanceDeLive
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
export function PanelEquipo ({ inicial, errorInicial = null, segundos, alcance, operador }: PropsPanelEquipo) {
  const [filas, setFilas] = useState(inicial)
  const [transcurrido, setTranscurrido] = useState(0)
  const [error, setError] = useState<string | null>(errorInicial)

  /** Cuando se leyeron las filas. Los contadores cuentan desde aca, no desde `start_time`. */
  const leidoEn = useRef(0)

  // `Date.now()` no se puede leer durante el render —regla de pureza de React— y tampoco haria falta:
  // el contador arranca en cero para no romper la hidratacion, asi que la marca se sella al montar,
  // que es justo cuando empieza a correr.
  useEffect(() => { leidoEn.current = Date.now() }, [])

  const refrescar = useCallback(async (senal: AbortSignal): Promise<void> => {
    const respuesta = await fetch('/api/bff/live', { signal: senal })

    if (!respuesta.ok) throw new Error('La API no respondió a la consulta del tablero.')

    const sobre = await respuesta.json() as { data: FilaDeLive[] }

    leidoEn.current = Date.now()
    setFilas(sobre.data)
    setTranscurrido(0)
    setError(null)
  }, [])

  useEffect(() => {
    const control = new AbortController()

    function tic (): void {
      // Con la pestaña oculta no se pregunta: nadie esta mirando, y el tablero se pone al dia solo
      // en cuanto vuelve al frente.
      if (document.hidden) return

      refrescar(control.signal).catch((fallo: unknown) => {
        if (control.signal.aborted) return

        setError(fallo instanceof Error ? fallo.message : 'No se pudo actualizar el tablero.')
      })
    }

    const dejarDeEscuchar = escucharMedidor(tic)
    const intervalo = globalThis.setInterval(tic, segundos * 1000)
    document.addEventListener('visibilitychange', tic)

    return () => {
      dejarDeEscuchar()
      globalThis.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', tic)
      control.abort()
    }
  }, [refrescar, segundos])

  const hayMedidores = filas.some((fila) => fila.medidor !== null || fila.jornada !== null)

  // El tic de un segundo es uno solo y solo existe mientras haya algo corriendo: cincuenta filas con
  // su propio intervalo repintarian el tablero entero cincuenta veces por segundo.
  useEffect(() => {
    if (!hayMedidores) return

    const id = globalThis.setInterval(() => {
      setTranscurrido((Date.now() - leidoEn.current) / 1000)
    }, 1000)

    return () => { globalThis.clearInterval(id) }
  }, [hayMedidores])

  const { activos, enReposo } = repartirTablero(filas)
  const midiendo = filas.filter((fila) => fila.medidor !== null).length

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-texto text-titulo text-balance font-semibold">
            {alcance === 'area' ? 'Mi área, ahora' : 'El equipo, ahora'}
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
              />
            ))}
          </ul>
          )}

      {enReposo.length > 0 && <SinJornada filas={enReposo} />}
    </section>
  )
}

/**
 * Quien todavia no abrio su jornada, plegado.
 *
 * `<details>` nativo y no un `useState`: es exactamente lo que el elemento hace, lo hace con su
 * propia accesibilidad —`aria-expanded`, teclado, buscar en la pagina lo abre solo— y no repinta el
 * tablero al abrirlo. Empieza cerrado porque son la mayoria de las filas y ninguna contesta la
 * pregunta de la pantalla.
 *
 * Sin contador de tiempo: no hay ninguno que contar, y por eso tampoco se monta `FilaEnVivo`, que
 * existe para colgar la jerarquia de un medidor que aca no existe.
 */
function SinJornada ({ filas }: { filas: FilaDeLive[] }) {
  return (
    <details className="border-linea bg-superficie-hundida rounded-tarjeta group border">
      <summary className="text-texto-tenue hover:text-texto flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium">
        <ChevronRight
          size={14}
          strokeWidth={2}
          aria-hidden="true"
          className="shrink-0 transition-transform duration-150 group-open:rotate-90"
        />
        Sin jornada abierta
        <span className="text-texto-sutil tabular-nums">({filas.length})</span>
      </summary>

      <ul className="flex flex-wrap gap-x-4 gap-y-2 px-3 pb-3 pt-1">
        {filas.map((fila) => (
          <li key={fila.staff.id} className="flex min-w-0 items-center gap-2">
            <Avatar nombre={fila.staff.name} imagen={fila.staff.avatar} tamano="chico" />
            <span className="text-texto-tenue truncate text-sm" title={cargoYArea(fila.staff) ?? undefined}>
              {fila.staff.name}
            </span>
          </li>
        ))}
      </ul>
    </details>
  )
}
