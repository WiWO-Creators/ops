import type { ReactNode } from 'react'
import { cn } from '@/lib/clases'
import { GLOSARIO } from '@/dominio/glosario'
import type { CronometroEnPantalla } from '@/datos/pantalla-area'
import {
  Cara, CabeceraDeEscena, Corriendo, CUERPO_COLUMNA, CUERPO_PRINCIPAL, Nada, RELLENO_DE_FILA, RotulosDeColumna
} from './piezas'

/** La rejilla de columnas de esta escena. Su reparto vive en `pantalla.css`. */
const COLUMNAS = 'pantalla-columnas-cronometros'

/**
 * Los cronometros corriendo: quien mide, contra que, y desde cuando.
 *
 * Es la escena que contesta la pregunta que la gente se para a mirar, y por eso el contador sigue
 * siendo lo mas grande de la fila —3.4vmin contra los 3 del nombre— y va en la ultima columna, donde
 * los numeros quedan alineados en vertical y se comparan sin leerlos: la columna sola dice quien
 * lleva veinte minutos y quien lleva tres horas.
 *
 * Lo que cambio del diseño anterior es todo lo demas. Antes cada cronometro era una ficha de dos
 * lineas con un avatar de 7vmin y entraban cinco; ahora es una fila de tabla y entran quince, porque
 * el nombre de quien mide y el del Proyecto pasaron de ser una segunda linea gris a ser dos columnas
 * propias. La misma informacion, tres veces mas filas, y ademas comparable de columna a columna.
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
      <CabeceraDeEscena titulo="Midiendo ahora" ocultos={ocultos} />

      <RotulosDeColumna columnas={COLUMNAS}>
        <span />
        <span className="truncate">{GLOSARIO.proceso.singular}</span>
        <span className="truncate">Quién mide</span>
        <span className="truncate portrait:hidden">{GLOSARIO.espacio.singular}</span>
        <span className="truncate text-right">Lleva</span>
      </RotulosDeColumna>

      <ul className="pantalla-tablero min-h-0">
        {items.map((medidor) => (
          <li key={medidor.staff_id} className={cn('pantalla-fila py-[0.45vmin] leading-[1.1]', RELLENO_DE_FILA, COLUMNAS)}>
            <Cara nombre={medidor.name} imagen={medidor.avatar} tamano="3.8vmin" />

            <span className={cn('text-texto truncate font-semibold', CUERPO_PRINCIPAL)}>
              {medidor.task?.name ?? `Sin ${GLOSARIO.proceso.singular.toLowerCase()}`}
            </span>

            <span className={cn('text-texto-tenue truncate', CUERPO_COLUMNA)}>{medidor.name}</span>

            <span className={cn('text-texto-tenue truncate portrait:hidden', CUERPO_COLUMNA)}>
              {medidor.project?.name ?? '—'}
            </span>

            <Corriendo
              desde={medidor.started_at}
              ahora={ahora}
              congelado={congelado}
              className="text-acento text-right text-[3.4vmin] font-bold"
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
