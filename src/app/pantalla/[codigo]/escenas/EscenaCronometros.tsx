import type { ReactNode } from 'react'
import { cn } from '@/lib/clases'
import { GLOSARIO } from '@/dominio/glosario'
import { horaDeReloj } from '@/dominio/momento-del-dia'
import type { CronometroEnPantalla } from '@/datos/pantalla-area'
import {
  Cara, CabeceraDeEscena, CeldaQueAlterna, Corriendo, CUERPO_COLUMNA, CUERPO_PRINCIPAL, FILA_VIVA,
  Nada, RELLENO_DE_FILA, RotulosDeColumna, escalonDeFila
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
 *
 * === QUE ALTERNA ===
 *
 * La columna de quien mide dice el nombre y, cada `PERIODO_DE_DATO_MS`, la hora a la que arranco. Es
 * el unico dato del cronometro que el contador de al lado no da: "lleva 40 min" y "arranco a las
 * 15:20" contestan cosas distintas, y la segunda es la que dice si alguien se olvido el cronometro
 * puesto desde la maniana. No alterna el nombre de la Tarea —que es lo que identifica la fila— ni el
 * contador, que es la respuesta de la escena.
 */
export function EscenaCronometros ({ items, ocultos, ahora, congelado, zona, fase }: {
  items: CronometroEnPantalla[]
  ocultos: number
  ahora: number | null
  congelado: boolean
  /** La zona del negocio: la hora de arranque no se formatea con la del televisor. */
  zona: string | null
  fase: 0 | 1
}): ReactNode {
  if (items.length === 0) return <Nada texto="Ningún cronómetro corriendo" />

  return (
    <div className="flex min-h-0 flex-col">
      <CabeceraDeEscena titulo="Midiendo ahora" ocultos={ocultos} />

      <RotulosDeColumna columnas={COLUMNAS}>
        <span />
        <span className="truncate">{GLOSARIO.proceso.singular}</span>
        <CeldaQueAlterna fase={fase} principal="Quién mide" alterno="Arrancó" />
        <span className="truncate portrait:hidden">{GLOSARIO.espacio.singular}</span>
        <span className="truncate text-right">Lleva</span>
      </RotulosDeColumna>

      <ul className="pantalla-tablero min-h-0">
        {items.map((medidor, indice) => (
          <li
            key={medidor.staff_id}
            className={cn('pantalla-fila py-[0.45vmin] leading-[1.1]', FILA_VIVA, RELLENO_DE_FILA, COLUMNAS)}
            style={escalonDeFila(indice)}
          >
            <Cara nombre={medidor.name} imagen={medidor.avatar} tamano="3.8vmin" />

            <span className={cn('text-texto truncate font-semibold', CUERPO_PRINCIPAL)}>
              {medidor.task?.name ?? `Sin ${GLOSARIO.proceso.singular.toLowerCase()}`}
            </span>

            <CeldaQueAlterna
              fase={fase}
              className={cn('text-texto-tenue', CUERPO_COLUMNA)}
              principal={medidor.name}
              alterno={<ArrancoA desde={medidor.started_at} zona={zona} />}
            />

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

/**
 * A que hora se puso en marcha el cronometro, en la zona del negocio.
 *
 * `horaDeReloj()` y no un `Intl` propio: es la misma funcion del reloj de la cabecera, y dos horas
 * visibles a la vez en la misma pared no pueden discrepar en el formato.
 */
function ArrancoA ({ desde, zona }: { desde: string | null, zona: string | null }): ReactNode {
  if (desde === null) return <>—</>

  const arranque = Date.parse(desde)

  if (Number.isNaN(arranque)) return <>—</>

  return <span className="tabular-nums">{horaDeReloj(arranque, zona)}</span>
}
