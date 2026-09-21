import type { ReactNode } from 'react'
import { horaDeReloj } from '@/dominio/momento-del-dia'
import type { FranjaDelDia } from '@/dominio/momento-del-dia'
import { ANCHO_SOBRIO_EM, cupoDeFichas } from '@/dominio/solari'
import { TextoSolari } from './Solari'
import { Ficha } from './piezas'

/**
 * El momento del día: la hora en grande y una frase.
 *
 * === POR QUE UNA ESCENA Y NO UN AVISO EN LA CABECERA ===
 *
 * El reloj ya esta en la esquina de todas las escenas, en 3.2vmin, y ahi cumple su funcion: se mira de
 * reojo para saber si uno llega tarde. Esto es otra cosa. Tres veces al dia la pared deja de ser un
 * tablero de trabajo y se dirige a quien pasa por delante — al llegar, al mediodia y al irse—, y eso
 * pide la pantalla entera: un numero de 22vmin que se lee desde la otra punta del piso y una linea
 * debajo. Puesto como aviso en un rincon no lo leeria nadie, que es lo mismo que no ponerlo.
 *
 * === FUERA DE FRANJA NO EXISTE ===
 *
 * Esta escena solo se dibuja si `construirGuion()` la metio en el guion, y solo la mete dentro de una
 * franja horaria. No hay un estado "sin mensaje": si no hay franja, no hay escena. El `franja === null`
 * de abajo cubre la unica rendija —que la franja se cierre entre el render y el siguiente tic— y no
 * es un caso de diseño.
 *
 * === LAS DOS FUENTES DE TIEMPO ===
 *
 * `ahora` es el instante que el navegador cree que es; `zona` es la del negocio, que manda la API. Un
 * televisor barato acierta el primero y falla la segunda, asi que la hora se formatea con las dos y
 * nunca con `getHours()`. El razonamiento largo esta en `src/dominio/momento-del-dia.ts`.
 */
export function EscenaMomento ({ franja, ahora, zona }: {
  franja: FranjaDelDia | null
  ahora: number | null
  zona: string | null
}): ReactNode {
  if (franja === null) return null

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[3vmin] text-center">
      {/*
        * `tabular-nums` no es cosmetico: sin el, el ancho del reloj cambia al pasar de las 09:19 a las
        * 09:20 y el numero entero da un salto lateral en una pared de dos metros. Con el volteo Solari
        * ademas es estructural: el hueco de cada caracter mide `1ch`.
        *
        * Cinco caracteres a 22vmin es el sitio donde el volteo se ve como lo que imita y no cuesta
        * nada: un digito por minuto. `leading-none` se cae —el rodillo fija su propio renglon, que es
        * la altura del hueco y el paso de la animacion a la vez— y por eso el bloque se centra con el
        * `justify-center` del padre y no dependiendo del interlineado.
        */}
      <p className="text-texto text-[22vmin] font-bold tabular-nums">
        <TextoSolari texto={horaDeReloj(ahora, zona)} />
      </p>

      <div className="flex flex-col items-center gap-[1.5vmin]">
        <p className="text-acento text-[7vmin] font-semibold">
          <Ficha texto={franja.titulo} maximo={CUPO_DE_TITULO} />
        </p>
        <p className="text-texto-tenue text-[4vmin]">
          <Ficha texto={franja.apoyo} maximo={CUPO_DE_APOYO} />
        </p>
      </div>
    </div>
  )
}

/** Lo que cabe en el titulo de la franja a 7vmin sobre la pared tumbada. */
const CUPO_DE_TITULO = cupoDeFichas(150, 7, ANCHO_SOBRIO_EM)

/**
 * Lo que cabe en la linea de apoyo a 4vmin.
 *
 * Sale del ancho de la pared tumbada y no del de la de pie a proposito: una tira de fichas no parte
 * en dos lineas —lo impide el `whitespace-nowrap` de `Ficha`, y menos mal, porque partiria a mitad de
 * palabra— asi que en vertical la frase mas larga pierde su cola. Recortarla a lo que cabe en vertical
 * se la quitaria tambien a la pared tumbada, que es donde cuelgan todas.
 */
const CUPO_DE_APOYO = cupoDeFichas(150, 4, ANCHO_SOBRIO_EM)
