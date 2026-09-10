'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Users } from 'lucide-react'
import { Vacio } from '@/componentes/estado/Estados'
import type { AlcanceDeLive } from '@/dominio/live'
import type { FilaDeLive } from '@/datos/live'
import type { Yo } from '@/datos/tipos'
import { escucharMedidor } from './medidor'
import { cn } from '@/lib/clases'
import { agruparPorEspacio } from './presentacion'
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
 * El equipo, ahora mismo, agrupado por el Espacio que cada quien esta midiendo.
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
 * `location` y `route`, que aca no existen. Y su arbol es de tres niveles; el de LIVE es de uno. Lo
 * que si se comparte es lo que de verdad es comun: `Avatar`, `Insignia`, `Vacio`, `haceCuanto()` y
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

  const grupos = agruparPorEspacio(filas)
  const midiendo = filas.filter((fila) => fila.medidor !== null).length

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-texto text-titulo text-balance font-semibold">
            {alcance === 'area' ? 'Mi área, ahora' : 'El equipo, ahora'}
          </h2>
          <p className="text-texto-tenue text-pretty text-xs">Agrupado por proyecto en curso</p>
        </div>

        <span className="text-texto flex items-center gap-2 text-sm font-medium tabular-nums">
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

      {grupos.length === 0
        ? (
          <Vacio
            titulo="Nadie con jornada abierta"
            descripcion="Aquí aparece quien abra su jornada y arranque un medidor. Se actualiza solo."
            className="border-linea bg-superficie-hundida rounded-tarjeta border"
          />
          )
        : (
          <ul className="flex flex-col gap-3">
            {grupos.map((grupo) => (
              <li
                key={grupo.clave}
                className="border-linea bg-superficie-elevada rounded-tarjeta border p-3"
              >
                <h3 className="text-texto flex items-center justify-between gap-2 text-sm font-semibold">
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]">{grupo.nombre}</span>
                  <span className="text-texto-tenue shrink-0 text-xs font-normal tabular-nums">
                    {grupo.personas.length}
                    <span className="sr-only">
                      {grupo.personas.length === 1 ? ' persona' : ' personas'}
                    </span>
                  </span>
                </h3>
                <ul className="divide-linea-suave divide-y">
                  {grupo.personas.map((fila) => (
                    <FilaEnVivo
                      key={`${fila.staff.id}:${fila.medidor?.id ?? 'sin-medidor'}`}
                      fila={fila}
                      transcurrido={transcurrido}
                      puedeDetener={operador.is_admin || operador.is_superadmin || operador.id === fila.staff.id}
                    />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          )}
    </section>
  )
}
