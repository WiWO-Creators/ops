import type { ReactNode } from 'react'
import { cn } from '@/lib/clases'
import { horaDeReloj } from '@/dominio/momento-del-dia'
import { ANCHO_SOBRIO_EM, cupoDeFichas, planDeOla } from '@/dominio/solari'
import type { PlanDeOla } from '@/dominio/solari'
import type { PersonaTrabajando } from '@/datos/pantalla-area'
import {
  Cara, CabeceraDeEscena, CeldaQueAlterna, Corriendo, CUERPO_COLUMNA, CUERPO_PRINCIPAL,
  DESFASE_DE_ROTULOS, FichaDeTablero, Nada, RELLENO_DE_FILA, Rotulo, RotulosDeColumna
} from './piezas'

/** La rejilla de columnas de esta escena. Su reparto vive en `pantalla.css`. */
const COLUMNAS = 'pantalla-columnas-trabajando'

/**
 * Cuanto pesa cada columna en la ola: el nombre y la columna que alterna.
 *
 * La jornada no entra en el reparto porque tiene ola propia: es un contador, cambia una vez por
 * segundo y no una vez por pagina. Ver `Corriendo` y `ondaDeContador()`.
 */
const PESOS = [6, 3] as const

/**
 * Cuantos caracteres caben en cada columna. Los anchos son los de `.pantalla-columnas-trabajando`.
 *
 * Esta escena va a dos columnas de tablero, asi que cada tabla dispone de la mitad de la pared: unos
 * 83vmin, de los que el nombre se queda con lo que sobra despues de la cara, el cargo, la jornada y
 * los huecos. En vertical la columna del nombre es mas ancha, asi que manda la medida horizontal.
 *
 * El nombre y el cargo van sobrios y la jornada lleva ficha entera: ver `ANCHO_DE_FICHA_EM`.
 */
const CUPO = {
  nombre: cupoDeFichas(31, 3, ANCHO_SOBRIO_EM),
  cargo: cupoDeFichas(19, 2.7, ANCHO_SOBRIO_EM),
  /** El contador: digitos, ancho fijo y ficha entera. Por eso su columna crecio a 19vmin. */
  jornada: cupoDeFichas(19, 3)
}

/** Una tabla ya paginada, con lo que su cabecera necesita decir. */
export interface TablaDeGente {
  items: PersonaTrabajando[]
  ocultos: number
  total: number | null
}

/**
 * Quien tiene jornada abierta ahora mismo: la compañia entera arriba, el area de esta pantalla abajo.
 *
 * === POR QUE DOS TABLAS Y NO UNA ===
 *
 * Es una decision de producto, no una comodidad tecnica. Quien pasa por delante de esta pared se hace
 * dos preguntas a la vez —"¿esta arrancando la empresa?" y "¿esta mi equipo?"— y responderlas en dos
 * escenas separadas costaria el doble de vuelta para decir lo mismo, ademas de obligar a recordar el
 * numero de la primera mientras aparece la segunda.
 *
 * **Las dos listas se solapan a proposito.** Quien es del area sale arriba y abajo, y cada tabla lleva
 * su total real. No hay que deduplicar nada: son dos conteos de dos poblaciones distintas, y restar
 * una de la otra daria un numero que no contesta ninguna de las dos preguntas.
 *
 * **En la pantalla global se dibuja una sola.** Ahi no hay area, la API manda `items` vacio, y el
 * bloque del area no aparece — ni como tabla vacia ni como hueco. La que queda se lleva la banda
 * entera; lo reparte `repartoDeTrabajando()` en el dominio.
 *
 * === UNA SOLA OLA PARA LAS DOS TABLAS ===
 *
 * El plan se calcula con las filas de las DOS tablas juntas, y la segunda arranca donde termino la
 * primera (`desfase`). Es lo que evita el unico fallo que la pared no podria disimular: dos olas
 * independientes lanzadas en el mismo fotograma son el doble de fichas girando a la vez que lo medido,
 * y el pico no se nota mirando el codigo de una sola tabla.
 *
 * === LA UNICA LISTA A DOS COLUMNAS ===
 *
 * Las Tareas y los cronometros van a una sola columna a lo ancho de la pared porque su nombre es una
 * frase y partirlo en dos lo recorta. Un nombre de persona son dos o tres palabras: cabe de sobra en
 * media pared, asi que cada tabla se parte en dos y duplica las filas de golpe. En vertical vuelve a
 * una sola columna, donde no hay ancho que partir.
 *
 * El contador mide la JORNADA, no el tiempo medido: son cosas distintas y la pantalla no las mezcla.
 * Cuanto se midio contra que es la escena siguiente.
 *
 * No aparece quien no abrio jornada. La escena contesta "quien esta trabajando ahora", y una lista de
 * gente que no esta trabajando no contesta eso; el total del equipo ya viaja en la portada.
 */
export function EscenaTrabajando ({ compania, area, nombreDelArea, zona, ahora, congelado, fase }: {
  /** La tabla de toda la compañia, o `null` si esta pagina no la trae. */
  compania: TablaDeGente | null
  /** La tabla del area de esta pantalla, o `null` en la pantalla global. */
  area: TablaDeGente | null
  /** Como se llama el area, para rotular su tabla. */
  nombreDelArea: string
  /** La zona del negocio: la hora de inicio de jornada no se formatea con la del televisor. */
  zona: string | null
  ahora: number | null
  congelado: boolean
  fase: 0 | 1
}): ReactNode {
  if (compania === null && area === null) return <Nada texto="Nadie con jornada abierta" />

  const plan = planDeOla((compania?.items.length ?? 0) + (area?.items.length ?? 0), PESOS)

  return (
    <div className="pantalla-dos-tablas">
      {compania !== null && (
        <TablaDeTrabajando
          titulo="Trabajando en la compañía"
          tabla={compania}
          plan={plan}
          desfase={0}
          zona={zona}
          ahora={ahora}
          congelado={congelado}
          fase={fase}
        />
      )}

      {area !== null && (
        <TablaDeTrabajando
          titulo={nombreDelArea === '' ? 'Trabajando en el área' : `Trabajando en ${nombreDelArea}`}
          tabla={area}
          plan={plan}
          desfase={(compania?.items.length ?? 0) * plan.porFila}
          zona={zona}
          ahora={ahora}
          congelado={congelado}
          fase={fase}
        />
      )}
    </div>
  )
}

/**
 * Una de las dos tablas: cabecera, rotulos y filas.
 *
 * `shrink-0` y no `min-h-0` a proposito. Con las tablas encogiendose, un reparto de filas mal medido
 * dejaria filas fuera del marco sin mover nada mas y nadie se enteraria —`overflow: hidden` no produce
 * barra de scroll, corta—. Sin encoger, lo que no cabe empuja la cabecera de la tabla de abajo por
 * debajo del marco, que es justo lo que `pruebas/pantalla-area.browser.mjs` sabe cazar midiendo los
 * `h2`. El fallo se ve; el silencio, no.
 */
function TablaDeTrabajando ({ titulo, tabla, plan, desfase, zona, ahora, congelado, fase }: {
  titulo: string
  tabla: TablaDeGente
  plan: PlanDeOla
  desfase: number
  zona: string | null
  ahora: number | null
  congelado: boolean
  fase: 0 | 1
}): ReactNode {
  return (
    <div className="flex shrink-0 flex-col">
      <CabeceraDeEscena titulo={titulo} total={tabla.total ?? undefined} ocultos={tabla.ocultos} />

      {/*
        * Los rotulos se repiten en las dos columnas del tablero: una fila de la derecha esta a un
        * metro de la etiqueta de la izquierda, y a esa distancia un rotulo lejano no rotula nada. En
        * vertical hay una sola columna, asi que el segundo juego se cae entero.
        */}
      <div className="pantalla-tablero-doble shrink-0">
        <RotulosDeTrabajando fase={fase} desfase={0} />
        <div className="portrait:hidden">
          {/* Con la misma ranura, los dos juegos girarian en el mismo fotograma y valdrian el doble. */}
          <RotulosDeTrabajando fase={fase} desfase={DESFASE_DE_ROTULOS} />
        </div>
      </div>

      <ul className="pantalla-tablero pantalla-tablero-doble">
        {tabla.items.map((persona, indice) => (
          <li
            // Por POSICION y no por `persona.staff_id`: la fila se queda donde esta y lo que cambia es
            // su texto, caracter a caracter. Ver el docblock de `EscenaProcesos`.
            key={indice}
            className={cn('pantalla-fila py-[0.45vmin] leading-[1.1]', RELLENO_DE_FILA, COLUMNAS)}
          >
            <Cara nombre={persona.name} imagen={persona.avatar} tamano="3.8vmin" />

            <FichaDeTablero
              sobria
              texto={persona.name}
              sitio={{ plan, fila: indice, columna: 0, desfase }}
              maximo={CUPO.nombre}
              className={cn('text-texto font-semibold', CUERPO_PRINCIPAL)}
            />

            {/*
              * El cargo y la hora de entrada comparten columna: las dos son contexto de la misma
              * persona, ninguna es lo que identifica la fila, y a cuatro metros solo se puede leer
              * una a la vez. Lo que NO alterna es el nombre ni el contador de jornada: uno es el
              * ancla para recorrer la columna con la vista y el otro es la respuesta de la escena.
              */}
            {/* Sin `mayusculas`: un cargo de quince caracteres no entra en caja alta en 19vmin. */}
            <CeldaQueAlterna
              sobria
              fase={fase}
              principal={persona.cargo ?? '—'}
              alterno={entroA(persona.jornada_started_at, zona)}
              sitio={{ plan, fila: indice, columna: 1, desfase }}
              maximo={CUPO.cargo}
              className={cn('text-texto-tenue', CUERPO_COLUMNA)}
            />

            <Corriendo
              desde={persona.jornada_started_at}
              ahora={ahora}
              congelado={congelado}
              fila={indice}
              filas={tabla.items.length}
              maximo={CUPO.jornada}
              className="text-acento text-right text-[3vmin] font-semibold"
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Los cuatro rotulos de la tabla. Se dibujan dos veces en horizontal, una en vertical. */
function RotulosDeTrabajando ({ fase, desfase }: { fase: 0 | 1, desfase: number }): ReactNode {
  return (
    <RotulosDeColumna columnas={COLUMNAS}>
      <span />
      <Rotulo texto="Persona" columna={0} desfase={desfase} maximo={CUPO.nombre} />
      <Rotulo texto={fase === 0 ? 'Cargo' : 'Entró'} columna={1} desfase={desfase} maximo={CUPO.cargo} />
      <Rotulo texto="Jornada" columna={2} desfase={desfase} maximo={CUPO.jornada} className="text-right" />
    </RotulosDeColumna>
  )
}

/**
 * A que hora empezo la jornada, en la zona del negocio.
 *
 * Es el dato que el contador de al lado no da: "lleva 2:14" y "entro a las 08:05" contestan cosas
 * distintas, y la segunda es la que dice si alguien llego tarde. No cabia en una columna propia sin
 * recortar el cargo, y por eso comparte la suya.
 *
 * `horaDeReloj()` y no un `Intl` propio: es la misma funcion del reloj de la cabecera, y dos horas
 * visibles a la vez en la misma pared no pueden discrepar en el formato.
 */
function entroA (desde: string | null, zona: string | null): string {
  if (desde === null) return '—'

  const arranque = Date.parse(desde)

  if (Number.isNaN(arranque)) return '—'

  return horaDeReloj(arranque, zona)
}
