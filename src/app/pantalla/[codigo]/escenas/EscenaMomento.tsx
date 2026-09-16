import type { ReactNode } from 'react'
import { horaDeReloj } from '@/dominio/momento-del-dia'
import type { FranjaDelDia } from '@/dominio/momento-del-dia'

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
        * 09:20 y el numero entero da un salto lateral en una pared de dos metros.
        */}
      <p className="text-texto text-[22vmin] leading-none font-bold tabular-nums">
        {horaDeReloj(ahora, zona)}
      </p>

      <div className="flex flex-col items-center gap-[1.5vmin]">
        <p className="text-acento text-[7vmin] leading-tight font-semibold">{franja.titulo}</p>
        <p className="text-texto-tenue text-[4vmin] leading-tight">{franja.apoyo}</p>
      </div>
    </div>
  )
}
