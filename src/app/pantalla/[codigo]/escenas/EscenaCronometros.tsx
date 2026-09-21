import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/clases'
import { GLOSARIO } from '@/dominio/glosario'
import { horaDeReloj } from '@/dominio/momento-del-dia'
import { ANCHO_SOBRIO_EM, cupoDeFichas, planDeOla } from '@/dominio/solari'
import type { CronometroEnPantalla } from '@/datos/pantalla-area'
import {
  Cara, CabeceraDeEscena, CeldaQueAlterna, Corriendo, CUERPO_COLUMNA, CUERPO_PRINCIPAL,
  FichaDeTablero, MarcaDeCliente, Nada, RELLENO_DE_FILA, Rotulo, RotulosDeColumna, cupoDeRotulo,
  nombreCorto
} from './piezas'

/** La rejilla de columnas de esta escena. Su reparto vive en `pantalla.css`. */
const COLUMNAS = 'pantalla-columnas-cronometros'

/**
 * Cuanto pesa cada columna en la ola: la Tarea, quien mide y el cliente.
 *
 * El contador no entra: tiene ola propia porque cambia una vez por segundo. Ver `Corriendo`.
 */
const PESOS = [6, 2, 2] as const

/**
 * Lo que mide cada columna, en `vmin`: el mismo numero que esta en `.pantalla-columnas-cronometros`.
 *
 * Ver el docblock de `ANCHO` en `EscenaProcesos`: de acá salen el cupo de la columna y el de su
 * rotulo, para que no puedan discrepar.
 */
const ANCHO = {
  /** Lo que sobra despues de las fijas: no es un ancho, es un resto. */
  nombre: 92,
  quien: 21,
  cliente: 25,
  lleva: 20
} as const

/**
 * Cuantos caracteres caben en cada columna.
 *
 * El nombre de la Tarea dispone de 92vmin en la pared tumbada —54 caracteres— y ese es el cambio de
 * la escena: antes eran 60vmin y 35 caracteres, y "Certificación de soldaduras de la línea 3" llegaba
 * a la pared como "Certificación de soldaduras de la …". Los 32vmin salen de las dos columnas de
 * apoyo: quien mide pasa a nombre abreviado y el cliente a caja mixta, y las dos entregan lo mismo en
 * bastante menos sitio.
 *
 * Las tres columnas de palabras son texto plano y solo el contador se dibuja como panel mecanico: ver
 * `esNumerico()` en el dominio. Los cupos de palabras van calculados con el ancho sobrio porque es el
 * de un texto en caja mixta, que es justo lo que ahora dibujan las tres.
 */
const CUPO = {
  nombre: cupoDeFichas(ANCHO.nombre, 3, ANCHO_SOBRIO_EM),
  quien: cupoDeFichas(ANCHO.quien, 2.7, ANCHO_SOBRIO_EM),
  cliente: cupoDeFichas(ANCHO.cliente, 2.7, ANCHO_SOBRIO_EM),
  /** El contador: digitos, ancho fijo y ficha entera. Por eso su columna crecio a 20vmin. */
  lleva: cupoDeFichas(ANCHO.lleva, 3.4)
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
 * el nombre de quien mide y el del cliente pasaron de ser una segunda linea gris a ser dos columnas
 * propias. La misma informacion, tres veces mas filas, y ademas comparable de columna a columna.
 *
 * La tercera columna dice el CLIENTE y no el Proyecto, igual que en la escena de Tareas: con logo si
 * el cliente lo tiene cargado y con su nombre si no. Ver `MarcaDeCliente`.
 *
 * Los nombres de Tarea y Cliente salen de `GLOSARIO`, nunca escritos a mano: el producto los ha
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
    // `flex-1`: la escena ocupa la banda entera, que es lo que permite a las filas del tablero
    // repartirse lo que sobra en vez de dejarlo muerto al pie. Ver `.pantalla-tablero`.
    <div className="flex min-h-0 flex-1 flex-col">
      <CabeceraDeEscena titulo="Midiendo ahora" ocultos={ocultos} />

      <RotulosDeColumna columnas={COLUMNAS}>
        <span />
        <Rotulo texto={GLOSARIO.proceso.singular} columna={0} maximo={cupoDeRotulo(ANCHO.nombre)} />
        <Rotulo texto={fase === 0 ? 'Quién' : 'Arrancó'} columna={1} maximo={cupoDeRotulo(ANCHO.quien)} />
        <Rotulo texto={GLOSARIO.cliente.singular} columna={2} maximo={cupoDeRotulo(ANCHO.cliente)} className="portrait:hidden" />
        <Rotulo texto="Lleva" columna={3} maximo={cupoDeRotulo(ANCHO.lleva)} className="text-right" />
      </RotulosDeColumna>

      <ul
        className="pantalla-tablero min-h-0"
        // `--filas` es el techo de cuanto puede estirarse cada fila. Ver `.pantalla-tablero`.
        style={{ '--filas': items.length } as CSSProperties}
      >
        {items.map((medidor, indice) => (
          <li
            // Por POSICION y no por `medidor.staff_id`. Ver el docblock de `EscenaProcesos`.
            key={indice}
            // Su ranura en la pasada que descubre el tablero. Ver `pantalla.css`.
            style={{ '--fila': indice } as CSSProperties}
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
              *
              * Y abreviado con `nombreCorto()`, igual que en la escena de Tareas: el nombre entero
              * pedia 34vmin de columna y los sacaba del nombre de la Tarea, que es lo que la fila
              * identifica. "Bernardita U." se lee y se busca recorriendo la columna con la vista.
              */}
            <CeldaQueAlterna
              fase={fase}
              principal={nombreCorto(medidor.name)}
              alterno={arrancoA(medidor.started_at, zona)}
              sitio={{ plan, fila: indice, columna: 1 }}
              maximo={CUPO.quien}
              className={cn('text-texto-tenue', CUERPO_COLUMNA)}
            />

            {/* El cliente del Proyecto medido, no el Proyecto. Ver `MarcaDeCliente`. */}
            <MarcaDeCliente
              cliente={medidor.client}
              sitio={{ plan, fila: indice, columna: 2 }}
              maximo={CUPO.cliente}
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
