/**
 * El volteo Solari: que glifos recorre cada caracter antes de quedarse quieto.
 *
 * === QUE ES ESTO ===
 *
 * Un panel de Solari di Udine —el de las salidas de un aeropuerto— no cambia un texto: hace girar un
 * rodillo de aletas por cada posicion, y cada rodillo pasa por los caracteres intermedios hasta llegar
 * al suyo. Como cada posicion arranca un instante despues que la anterior, el conjunto se lee como una
 * ola de izquierda a derecha.
 *
 * Este archivo es la mitad del efecto que se puede afirmar sin un navegador: **que glifos van en cada
 * rodillo, en que orden, y cuanto se retrasa cada posicion**. La otra mitad son cuatro reglas de
 * `pantalla.css` y el componente `escenas/Solari.tsx`, que solo dibuja lo que se decide acá.
 *
 * === LAS TRES DECISIONES QUE NO SON DE GUSTO ===
 *
 * **El rodillo tiene largo fijo y corto.** Un panel de verdad recorre el alfabeto entero desde donde
 * estuviera la aleta: cuarenta y tantos saltos. En pantalla eso serian cuarenta lineas de texto por
 * caracter —cuarenta veces el DOM de la pared— para un efecto que ya se lee entero con seis. El
 * destino es un televisor barato o un stick HDMI encendido durante meses, no una estacion de trabajo.
 *
 * **La secuencia sale del caracter de destino y no del anterior.** Asi la funcion es pura y el
 * componente que la usa no necesita estado, ni `use client`, ni recordar lo que habia antes: quien
 * dispara el volteo es el `key` de React, que cambia solo en las posiciones cuyo caracter cambio. Un
 * reloj que pasa de `14:32` a `14:33` voltea UN caracter, no cinco — que ademas es exactamente lo que
 * hace el panel de verdad.
 *
 * **Hay un tope de caracteres animados por texto.** Sin el, una celda con el nombre largo de una Tarea
 * lanza cuarenta rodillos, y quince filas lanzan seiscientos en el mismo fotograma. Con el tope, lo
 * que sobra aparece ya quieto: se pierde el volteo en la cola del texto —donde la vista no esta— y no
 * se pierde ni un caracter de informacion.
 */

/**
 * Los glifos por los que puede pasar un rodillo.
 *
 * Son mayusculas y digitos, como en un panel de verdad, aunque el caracter final sea minuscula: lo que
 * se ve mientras gira tiene que leerse como ruido mecanico, no como una palabra a medio escribir.
 *
 * El orden importa y es el que se recorre hacia atras para armar los intermedios. La `Ñ` esta en su
 * sitio del alfabeto castellano porque esta pared es de una oficina chilena y un apellido con eñe no
 * puede quedarse sin volteo.
 */
export const ALFABETO_SOLARI = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ0123456789'

/**
 * Cuantos glifos intermedios recorre cada caracter antes del suyo.
 *
 * Seis es el minimo que todavia se lee como un rodillo girando y no como un parpadeo; por encima de
 * diez el caracter pasa mas tiempo ilegible que legible, y esta pared se lee de pie y de pasada. Cada
 * paso suma una linea de texto al DOM, asi que el numero es tambien el coste.
 */
export const PASOS_POR_GLIFO = 6

/**
 * Nunca mas de estos rodillos por texto.
 *
 * El tope duro que el encargo de la pantalla exige. Catorce caracteres son el ancho de una celda
 * comoda del tablero: lo que se pasa de ahi ya venia recortado por `truncate`, asi que animarlo seria
 * pagar DOM por algo que no se ve entero.
 */
export const TOPE_DE_GLIFOS = 14

/**
 * A partir de que posicion el escalonado deja de crecer.
 *
 * Misma razon que el `TOPE_DE_ESCALON` de las filas: sin tope, un texto de catorce caracteres a 45 ms
 * tarda 630 ms en empezar el ultimo, y la ola se convierte en una espera. Con el tope la cola llega
 * junta, que es lo que hace un panel cuando termina de asentarse.
 */
export const TOPE_DE_ESCALON_GLIFO = 10

/** Una posicion del texto, ya resuelta: el caracter final y por donde pasa para llegar a el. */
export interface GlifoSolari {
  /** El caracter definitivo, tal cual va a quedar en pantalla. */
  glifo: string
  /**
   * Los glifos por los que pasa, **en orden de aparicion**, terminando siempre en `glifo`.
   *
   * `null` cuando esta posicion no voltea: un espacio, un signo que no esta en el alfabeto, o un
   * caracter que cayo fuera del tope. Se dibuja quieto desde el primer fotograma.
   */
  rodillo: string[] | null
  /** Cuantos pasos de escalon lleva esta posicion; ya viene acotado por `TOPE_DE_ESCALON_GLIFO`. */
  escalon: number
}

/**
 * Los glifos intermedios de un caracter, en orden de aparicion.
 *
 * Recorre `ALFABETO_SOLARI` hacia atras desde el destino, dando la vuelta cuando se acaba, y devuelve
 * el camino de ida: primero el mas lejano, ultimo el destino. El destino se devuelve **tal cual
 * llego** —con su acento y su caja—, aunque los intermedios se hayan buscado por su mayuscula sin
 * acentuar: lo que queda fijo en la pared tiene que ser el texto de verdad y no una aproximacion.
 *
 * @param destino    el caracter en el que el rodillo se detiene
 * @param pasos      cuantos glifos intermedios recorrer; se acota a [1, largo del alfabeto]
 * @returns la secuencia, de `pasos + 1` elementos, o `null` si el caracter no voltea
 */
export function rodilloDeGlifo (destino: string, pasos: number = PASOS_POR_GLIFO): string[] | null {
  if (destino === '') return null

  const indice = ALFABETO_SOLARI.indexOf(comoGlifo(destino))

  // Un espacio, un signo de puntuacion, un emoji: no hay alfabeto por el que hacerlo girar y un
  // rodillo de un solo glifo es DOM para no mover nada. Se dibuja quieto.
  if (indice < 0) return null

  const largo = ALFABETO_SOLARI.length
  const cuantos = Math.min(Math.max(Math.floor(pasos), 1), largo)
  const secuencia: string[] = []

  // Se recorre hacia atras desde el mas lejano —`cuantos` posiciones antes del destino— hasta el
  // destino, que entra al final y con su caja original.
  for (let salto = cuantos; salto > 0; salto -= 1) {
    secuencia.push(ALFABETO_SOLARI[(indice - salto + largo) % largo] as string)
  }

  secuencia.push(destino)

  return secuencia
}

/**
 * El texto entero resuelto en posiciones, listo para dibujar.
 *
 * Parte por punto de codigo y no por unidad UTF-16 (`Array.from` y no `split('')`): un caracter fuera
 * del plano basico partido por la mitad se dibuja como dos rombos, y un apellido con un caracter raro
 * no puede reventar la pared.
 *
 * El tope de `TOPE_DE_GLIFOS` se cuenta sobre los que **de verdad voltean**: los espacios no gastan
 * presupuesto, asi que "Persona 12 Apellido" no se queda sin volteo antes de tiempo por sus dos
 * espacios.
 *
 * @param texto  lo que se quiere mostrar; `''` devuelve una lista vacia
 * @param pasos  glifos intermedios por caracter; ver `PASOS_POR_GLIFO`
 * @param tope   cuantos caracteres como mucho voltean; ver `TOPE_DE_GLIFOS`
 * @returns una posicion por caracter, en el orden del texto
 */
export function rodilloDeTexto (
  texto: string,
  pasos: number = PASOS_POR_GLIFO,
  tope: number = TOPE_DE_GLIFOS
): GlifoSolari[] {
  if (typeof texto !== 'string' || texto === '') return []

  const limite = Math.max(Math.floor(tope), 0)
  let animados = 0

  return Array.from(texto).map((glifo, indice) => {
    const rodillo = animados < limite ? rodilloDeGlifo(glifo, pasos) : null

    if (rodillo !== null) animados += 1

    return { glifo, rodillo, escalon: escalonDeGlifo(indice) }
  })
}

/**
 * El escalon de la posicion numero `indice`, ya acotado.
 *
 * Es lo que convierte N caracteres volteando a la vez en una ola de izquierda a derecha. Sale de la
 * posicion dentro del texto y no de un reloj: la pantalla tiene UN solo temporizador —el latido de
 * `proyeccion.ts`— y este efecto no agrega ninguno.
 *
 * @param indice la posicion dentro del texto, empezando en 0
 * @returns un entero entre 0 y `TOPE_DE_ESCALON_GLIFO`
 */
export function escalonDeGlifo (indice: number): number {
  if (!Number.isFinite(indice)) return 0

  return Math.min(Math.max(Math.floor(indice), 0), TOPE_DE_ESCALON_GLIFO)
}

/**
 * El texto de una sola pieza que se mete en el rodillo del DOM, con el destino ARRIBA.
 *
 * Es el orden invertido del de aparicion, y es la pieza que hay que leer junto a `@keyframes
 * solari-rodillo` en `pantalla.css`: la animacion arranca desplazada hacia arriba —mostrando la ultima
 * linea, el glifo mas lejano— y termina en `transform: none`, que muestra la primera, el destino.
 *
 * Que el reposo sea `transform: none` y no un `forwards` no es un detalle: una animacion que termina en
 * su estado natural deja de existir, y el navegador puede soltar la capa de composicion. Con cientos de
 * rodillos en pantalla, esa es la diferencia entre una pared que se asienta y una que se queda con
 * cientos de capas vivas para siempre.
 *
 * @param rodillo la secuencia en orden de aparicion, tal como la devuelve `rodilloDeGlifo`
 * @returns las lineas separadas por saltos, listas para un elemento con `white-space: pre`
 */
export function cintaDeRodillo (rodillo: string[]): string {
  return [...rodillo].reverse().join('\n')
}

/**
 * La mayuscula sin acento de un caracter, que es como se busca en el alfabeto.
 *
 * Sin esto, ni una minuscula ni una vocal acentuada voltearian, y en castellano eso es casi todo el
 * texto de la pared.
 */
function comoGlifo (caracter: string): string {
  const mayuscula = caracter.toUpperCase()

  // La `Ñ` se atiende antes de descomponer: tiene entrada propia en el alfabeto, y quitarle la tilde
  // la convertiria en una `N` — que es otra letra y no el glifo que la pared tiene que enseñar.
  if (mayuscula === 'Ñ') return 'Ñ'

  // Para el resto, fuera las marcas diacriticas: `Á` busca por `A`, que si esta en el alfabeto.
  return mayuscula.normalize('NFD').replace(/[̀-ͯ]/g, '')
}
