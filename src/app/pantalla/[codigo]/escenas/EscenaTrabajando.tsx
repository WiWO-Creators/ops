import type { ReactNode } from 'react'
import { cn } from '@/lib/clases'
import type { PersonaTrabajando } from '@/datos/pantalla-area'
import {
  Cara, CabeceraDeEscena, Corriendo, CUERPO_COLUMNA, CUERPO_PRINCIPAL, Nada, RELLENO_DE_FILA, RotulosDeColumna
} from './piezas'

/** La rejilla de columnas de esta escena. Su reparto vive en `pantalla.css`. */
const COLUMNAS = 'pantalla-columnas-trabajando'

/**
 * Quien tiene jornada abierta ahora mismo, con cuanto lleva.
 *
 * === LA UNICA LISTA A DOS COLUMNAS ===
 *
 * Las Tareas y los cronometros van a una sola columna a lo ancho de la pared porque su nombre es una
 * frase y partirlo en dos lo recorta. Un nombre de persona son dos o tres palabras: cabe de sobra en
 * media pared, asi que esta escena se parte en dos y duplica las filas de golpe. En vertical vuelve a
 * una sola columna, donde no hay ancho que partir.
 *
 * El contador mide la JORNADA, no el tiempo medido: son cosas distintas y la pantalla no las mezcla.
 * Cuanto se midio contra que es la escena siguiente.
 *
 * No aparece quien no abrio jornada. La escena contesta "quien esta trabajando ahora", y una lista de
 * gente que no esta trabajando no contesta eso; el total del equipo ya viaja en la portada.
 */
export function EscenaTrabajando ({ items, ocultos, ahora, congelado }: {
  items: PersonaTrabajando[]
  ocultos: number
  ahora: number | null
  congelado: boolean
}): ReactNode {
  if (items.length === 0) return <Nada texto="Nadie con jornada abierta" />

  return (
    <div className="flex min-h-0 flex-col">
      <CabeceraDeEscena titulo="Trabajando ahora" ocultos={ocultos} />

      {/*
        * Los rotulos se repiten en las dos columnas del tablero: una fila de la derecha esta a un
        * metro de la etiqueta de la izquierda, y a esa distancia un rotulo lejano no rotula nada. En
        * vertical hay una sola columna, asi que el segundo juego se cae entero.
        */}
      <div className="pantalla-tablero-doble shrink-0">
        <RotulosDeColumna columnas={COLUMNAS}>
          <span />
          <span className="truncate">Persona</span>
          <span className="truncate">Cargo</span>
          <span className="truncate text-right">Jornada</span>
        </RotulosDeColumna>
        <div className="portrait:hidden">
          <RotulosDeColumna columnas={COLUMNAS}>
            <span />
            <span className="truncate">Persona</span>
            <span className="truncate">Cargo</span>
            <span className="truncate text-right">Jornada</span>
          </RotulosDeColumna>
        </div>
      </div>

      <ul className="pantalla-tablero pantalla-tablero-doble min-h-0">
        {items.map((persona) => (
          <li key={persona.staff_id} className={cn('pantalla-fila py-[0.45vmin] leading-[1.1]', RELLENO_DE_FILA, COLUMNAS)}>
            <Cara nombre={persona.name} imagen={persona.avatar} tamano="3.8vmin" />

            <span className={cn('text-texto truncate font-semibold', CUERPO_PRINCIPAL)}>
              {persona.name}
            </span>

            <span className={cn('text-texto-tenue truncate', CUERPO_COLUMNA)}>
              {persona.cargo ?? '—'}
            </span>

            <Corriendo
              desde={persona.jornada_started_at}
              ahora={ahora}
              congelado={congelado}
              className="text-acento text-right text-[3vmin] font-semibold"
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
