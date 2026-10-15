'use client'

import { ChevronRight } from 'lucide-react'
import { EnlacePersona } from '@/componentes/presentadores/EnlacePersona'
import type { FilaDeLive } from '@/datos/live'

/**
 * Quien todavia no abrio su jornada, plegado.
 *
 * `<details>` nativo y no un `useState`: es exactamente lo que el elemento hace, lo hace con su
 * propia accesibilidad —`aria-expanded`, teclado, buscar en la pagina lo abre solo— y no repinta el
 * tablero al abrirlo. Empieza cerrado porque son la mayoria de las filas y ninguna contesta la
 * pregunta de la pantalla.
 *
 * Sin contador de tiempo: no hay ninguno que contar, y por eso tampoco se monta `FilaEnVivo` ni una
 * tarjeta, que existen para colgar la jerarquia de un medidor que aca no existe. Lo comparten la
 * lista (`PanelEquipo`) y las tarjetas (`TarjetasDelEquipo`).
 *
 * @param filas las personas sin jornada ni medidor
 */
export function SinJornada ({ filas }: { filas: FilaDeLive[] }) {
  return (
    <details className="border-linea bg-superficie-hundida rounded-tarjeta group border">
      <summary className="text-texto-tenue hover:text-texto flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium">
        <ChevronRight
          size={14}
          strokeWidth={2}
          aria-hidden="true"
          className="ease-neo shrink-0 transition-transform duration-rapida group-open:rotate-90"
        />
        Sin jornada abierta
        <span className="text-texto-sutil tabular-nums">({filas.length})</span>
      </summary>

      <ul className="flex flex-wrap gap-x-4 gap-y-2 px-3 pb-3 pt-1">
        {filas.map((fila) => (
          <li key={fila.staff.id} className="flex min-w-0 items-center gap-2">
            <EnlacePersona
              id={fila.staff.id}
              nombre={fila.staff.name}
              imagen={fila.staff.avatar}
              tamano="chico"
              className="text-texto-tenue text-sm"
            />
          </li>
        ))}
      </ul>
    </details>
  )
}
