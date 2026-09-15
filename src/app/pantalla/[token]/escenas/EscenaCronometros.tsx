import type { ReactNode } from 'react'
import { GLOSARIO } from '@/dominio/glosario'
import type { CronometroEnPantalla } from '@/datos/pantalla-area'
import { Cara, Corriendo, Nada, Ocultos, TituloDeEscena } from './piezas'

/**
 * Los cronometros corriendo: quien mide, contra que, y desde cuando.
 *
 * Es la escena que contesta la pregunta que la gente se para a mirar. Por eso el contador es lo mas
 * grande de la ficha y el nombre de la Tarea va completo hasta donde entra, en vez de recortarse para
 * que quepan mas filas.
 *
 * Los nombres de Tarea y Proyecto salen de `GLOSARIO`, nunca escritos a mano: el producto los ha
 * renombrado antes y lo volvera a hacer.
 */
export function EscenaCronometros ({ items, ocultos, ahora, congelado }: {
  items: CronometroEnPantalla[]
  ocultos: number
  ahora: number | null
  congelado: boolean
}): ReactNode {
  if (items.length === 0) return <Nada texto="Ningún cronómetro corriendo" />

  return (
    <div className="flex min-h-0 flex-col">
      <TituloDeEscena>Midiendo ahora</TituloDeEscena>

      <ul className="flex flex-col gap-[1.6vmin]">
        {items.map((medidor) => (
          <li
            key={medidor.staff_id}
            className="border-linea bg-superficie-elevada flex items-center gap-[2.5vmin] rounded-[2vmin] border px-[2.5vmin] py-[1.6vmin]"
          >
            <Cara nombre={medidor.name} imagen={medidor.avatar} tamano="7vmin" />

            <div className="flex min-w-0 flex-1 flex-col gap-[0.3vmin]">
              <p className="text-texto truncate text-[3.4vmin] font-semibold">
                {medidor.task?.name ?? `Sin ${GLOSARIO.proceso.singular.toLowerCase()}`}
              </p>
              <p className="text-texto-tenue truncate text-[2.8vmin]">
                {medidor.name}
                {medidor.project !== null && ` · ${medidor.project.name}`}
              </p>
            </div>

            <Corriendo
              desde={medidor.started_at}
              ahora={ahora}
              congelado={congelado}
              className="text-acento shrink-0 text-[5vmin] font-bold"
            />
          </li>
        ))}
      </ul>

      <Ocultos cuantos={ocultos} />
    </div>
  )
}
