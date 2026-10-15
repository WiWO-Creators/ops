'use client'

import { useState } from 'react'
import { Users } from 'lucide-react'
import { Vacio } from '@/componentes/estado/Estados'
import { EntradaEscalonada } from '@/componentes/estructura/EntradaEscalonada'
import type { FilaDeLive } from '@/datos/live'
import type { OpcionFiltro } from '@/definiciones/tipos'
import { repartirTarjetas } from '@/dominio/equipo-en-vivo'
import type { AlcanceDeLive } from '@/dominio/live'
import { cn } from '@/lib/clases'
import { AvisoDeTransparencia } from './AvisoDeTransparencia'
import { ResumenDePersona } from './ResumenDePersona'
import { SinJornada } from './SinJornada'
import { TarjetaPersona } from './TarjetaPersona'
import { TITULO_POR_ALCANCE } from './titulos'
import { useSalasDelEquipo } from './useSalasDelEquipo'
import { useTableroEnVivo } from './useTableroEnVivo'

/** Los cambios del bus que releen el tablero al instante: la jornada, el cronómetro y la presencia. */
const TIPOS_QUE_RELEEN = ['jornada', 'cronometro', 'presencia'] as const

interface PropsTarjetasDelEquipo {
  inicial: FilaDeLive[]
  /** Mensaje si el servidor no pudo leer el tablero al pintar. */
  errorInicial?: string | null
  /** Cada cuántos segundos se vuelve a preguntar si el bus no está conectado. */
  segundos: number
  /** Hasta dónde ve quien mira. Solo cambia el título: la API ya filtró las filas. */
  alcance: AlcanceDeLive
  /** `task_statuses` de `GET /lookups`, para el estado de la Tarea que cada quien mide. */
  estados?: OpcionFiltro[]
}

/**
 * El equipo, ahora mismo, como una grilla de tarjetas (`/live?vista=tarjetas`).
 *
 * === POR QUÉ ES OTRA VISTA Y NO OTRA PANTALLA ===
 *
 * Es el mismo tablero que `PanelEquipo` —`GET /live`, el mismo sondeo, los mismos avisos de medidor—
 * dibujado para mirarlo de un vistazo: quién está en reunión, quién mide y sobre qué, quién tiene la
 * jornada abierta y desde cuándo. Por eso comparte `useTableroEnVivo` con la lista y cambia con
 * `?vista=`, como el resto del panel, en vez de ser una ruta con su propia copia de la lógica.
 *
 * Solo existe con «Equipo en vivo» encendido (`config.equipo`); la página no la monta si no lo está.
 * Con el bus conectado, un cambio de jornada, de cronómetro o de presencia relee el tablero al
 * instante y el sondeo pasa a ser respaldo; sin él todo sigue por sondeo.
 *
 * === LO QUE SE AÑADE A LA LISTA ===
 *
 * Quién está en una sala de Teletrabajo (`useSalasDelEquipo`, de LiveKit vía `/api/equipo/salas`) y
 * el resumen de jornada por persona en un diálogo. Debajo va siempre `AvisoDeTransparencia`, que dice
 * qué se muestra y qué no.
 *
 * @param inicial las filas que el servidor leyó al pintar
 * @param errorInicial el error de esa lectura, si lo hubo
 * @param segundos el intervalo de respaldo del sondeo
 * @param alcance hasta dónde ve quien mira
 * @param estados catálogo de estados de Tarea
 */
export function TarjetasDelEquipo ({ inicial, errorInicial = null, segundos, alcance, estados = [] }: PropsTarjetasDelEquipo) {
  const { filas, transcurrido, error } = useTableroEnVivo({
    inicial,
    errorInicial,
    segundos,
    tiposEnVivo: TIPOS_QUE_RELEEN
  })
  const salas = useSalasDelEquipo()
  const [resumenDe, setResumenDe] = useState<FilaDeLive | null>(null)

  const { tarjetas, enReposo } = repartirTarjetas(filas, salas)
  const midiendo = filas.filter((fila) => fila.medidor !== null).length

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-texto text-titulo text-balance font-semibold">{TITULO_POR_ALCANCE[alcance]}</h2>
          <p className="text-texto-tenue text-pretty text-xs">Cada persona, con lo que declaró estar haciendo ahora</p>
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

      {tarjetas.length === 0
        ? (
          <Vacio
            titulo="Nadie con jornada abierta"
            descripcion="Aquí aparece quien abra su jornada, arranque un cronómetro o entre a una sala. Se actualiza solo."
            className="border-linea bg-superficie-hundida rounded-tarjeta border"
          />
          )
        : (
          <EntradaEscalonada densa>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {tarjetas.map((fila) => (
                <TarjetaPersona
                  key={fila.staff.id}
                  fila={fila}
                  transcurrido={transcurrido}
                  sala={salas?.get(fila.staff.id) ?? null}
                  estados={estados}
                  onVerResumen={setResumenDe}
                />
              ))}
            </ul>
          </EntradaEscalonada>
          )}

      {enReposo.length > 0 && <SinJornada filas={enReposo} />}

      <AvisoDeTransparencia />

      <ResumenDePersona fila={resumenDe} onCerrar={() => { setResumenDe(null) }} />
    </section>
  )
}
