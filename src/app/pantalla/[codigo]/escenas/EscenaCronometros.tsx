import type { ReactNode } from 'react'
import { cn } from '@/lib/clases'
import { GLOSARIO } from '@/dominio/glosario'
import { horaDeReloj } from '@/dominio/momento-del-dia'
import { ANCHO_MAYUSCULA_EM, ANCHO_SOBRIO_EM, cupoDeFichas, planDeOla } from '@/dominio/solari'
import type { CronometroEnPantalla } from '@/datos/pantalla-area'
import {
  Cara, CabeceraDeEscena, CeldaQueAlterna, Corriendo, CUERPO_COLUMNA, CUERPO_PRINCIPAL,
  FichaDeTablero, Nada, RELLENO_DE_FILA, Rotulo, RotulosDeColumna
} from './piezas'

/** La rejilla de columnas de esta escena. Su reparto vive en `pantalla.css`. */
const COLUMNAS = 'pantalla-columnas-cronometros'

/**
 * Cuanto pesa cada columna en la ola: la Tarea, quien mide y el Proyecto.
 *
 * El contador no entra: tiene ola propia porque cambia una vez por segundo. Ver `Corriendo`.
 */
const PESOS = [6, 2, 2] as const

/**
 * Cuantos caracteres caben en cada columna. Los anchos son los de `.pantalla-columnas-cronometros`.
 *
 * El nombre de la Tarea dispone de ~71vmin en la pared tumbada, que darian 42 fichas; se corta en las
 * que da una columna de 60vmin porque un nombre de Tarea de mas de 35 caracteres es una frase entera,
 * y dibujar siete huecos mas por fila para enseñar el final de una frase que ya se entendio es DOM
 * pagado a cambio de nada.
 *
 * Las tres columnas de palabras son texto plano y solo el contador se dibuja como panel mecanico: ver
 * `esNumerico()` en el dominio. Los cupos de palabras siguen calculados con el ancho sobrio porque es
 * el de un texto en caja mixta, que es justo lo que ahora dibujan.
 */
const CUPO = {
  nombre: cupoDeFichas(60, 3, ANCHO_SOBRIO_EM),
  quien: cupoDeFichas(26, 2.7, ANCHO_SOBRIO_EM),
  espacio: cupoDeFichas(30, 2.7, ANCHO_MAYUSCULA_EM),
  /** El contador: digitos, ancho fijo y ficha entera. Por eso su columna crecio a 20vmin. */
  lleva: cupoDeFichas(20, 3.4)
}

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
 * === EL CONTADOR TAMBIEN ES SOLARI ===
 *
 * Y es el sitio donde mas se nota que lo es: quince contadores en fila voltean su digito de las
 * unidades una vez por segundo, escalonados de arriba abajo. No es caro porque un contador **no cambia
 * entero**: gira una ficha por segundo y no ocho. El razonamiento y los numeros estan en el docblock
 * de `Corriendo`.
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

  const plan = planDeOla(items.length, PESOS)

  return (
    <div className="flex min-h-0 flex-col">
      <CabeceraDeEscena titulo="Midiendo ahora" ocultos={ocultos} />

      <RotulosDeColumna columnas={COLUMNAS}>
        <span />
        <Rotulo texto={GLOSARIO.proceso.singular} columna={0} maximo={CUPO.nombre} />
        <Rotulo texto={fase === 0 ? 'Quién mide' : 'Arrancó'} columna={1} maximo={CUPO.quien} />
        <Rotulo texto={GLOSARIO.espacio.singular} columna={2} maximo={CUPO.espacio} className="portrait:hidden" />
        <Rotulo texto="Lleva" columna={3} maximo={CUPO.lleva} className="text-right" />
      </RotulosDeColumna>

      <ul className="pantalla-tablero min-h-0">
        {items.map((medidor, indice) => (
          <li
            // Por POSICION y no por `medidor.staff_id`. Ver el docblock de `EscenaProcesos`.
            key={indice}
            className={cn('pantalla-fila py-[0.45vmin] leading-[1.1]', RELLENO_DE_FILA, COLUMNAS)}
          >
            <Cara nombre={medidor.name} imagen={medidor.avatar} tamano="3.8vmin" />

            <FichaDeTablero
              texto={medidor.task?.name ?? `Sin ${GLOSARIO.proceso.singular.toLowerCase()}`}
              sitio={{ plan, fila: indice, columna: 0 }}
              maximo={CUPO.nombre}
              className={cn('text-texto font-semibold', CUERPO_PRINCIPAL)}
            />

            {/*
              * Sin `mayusculas`: es un nombre de persona. Las columnas cortas del tablero van en caja
              * alta porque es el gesto de un panel de aletas, pero un nombre propio en mayusculas
              * pierde la silueta por la que se reconoce a alguien recorriendo la columna con la vista
              * — que es exactamente para lo que esta esta columna.
              */}
            <CeldaQueAlterna
              fase={fase}
              principal={medidor.name}
              alterno={arrancoA(medidor.started_at, zona)}
              sitio={{ plan, fila: indice, columna: 1 }}
              maximo={CUPO.quien}
              className={cn('text-texto-tenue', CUERPO_COLUMNA)}
            />

            <FichaDeTablero
              mayusculas
              texto={medidor.project?.name ?? '—'}
              sitio={{ plan, fila: indice, columna: 2 }}
              maximo={CUPO.espacio}
              className={cn('text-texto-tenue portrait:hidden', CUERPO_COLUMNA)}
            />

            <Corriendo
              desde={medidor.started_at}
              ahora={ahora}
              congelado={congelado}
              fila={indice}
              filas={items.length}
              maximo={CUPO.lleva}
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
function arrancoA (desde: string | null, zona: string | null): string {
  if (desde === null) return '—'

  const arranque = Date.parse(desde)

  if (Number.isNaN(arranque)) return '—'

  return horaDeReloj(arranque, zona)
}
