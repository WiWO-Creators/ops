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
 * El tambor de las letras: por donde pasa un caracter que no es una cifra.
 *
 * Son mayusculas, como en un panel de verdad, aunque el caracter final sea minuscula: lo que se ve
 * mientras gira tiene que leerse como ruido mecanico, no como una palabra a medio escribir.
 *
 * El orden importa y es el que se recorre hacia atras para armar los intermedios. La `Ñ` esta en su
 * sitio del alfabeto castellano porque esta pared es de una oficina chilena y un apellido con eñe no
 * puede quedarse sin volteo.
 *
 * **Las cifras tienen tambor propio y los dos no se mezclan.** Con un tambor unico, una `A` llegaba
 * desde un `9` y un contador ensenaba letras camino a su cifra. Ver `TAMBOR_DE_CIFRAS`.
 */
export const TAMBOR_DE_LETRAS = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'

/**
 * El tambor de las cifras: diez aletas, ciclico y aparte del de las letras.
 *
 * Es el que hace que un contador se lea como un contador: lo unico que puede aparecer camino a un `7`
 * son cifras. Cuanto recorre cada una lo decide `pasosDeGlifo()`, y ahi esta la otra mitad del gesto:
 * una cifra sube UNA aleta desde la anterior y solo el `0` da la vuelta entera.
 */
export const TAMBOR_DE_CIFRAS = '0123456789'

/** Todo lo que voltea, los dos tambores juntos. Util para preguntar si un glifo tiene aleta. */
export const ALFABETO_SOLARI = TAMBOR_DE_LETRAS + TAMBOR_DE_CIFRAS

/**
 * Cuantas aletas mueve una cifra que cambia.
 *
 * Un contador que pasa de `3` a `4` mueve UNA aleta, no seis: la cifra de la que viene es siempre la
 * anterior del tambor, asi que la pieza no necesita recordarla para caer desde donde corresponde. Con
 * el recorrido desigual de las letras, en cambio, un reloj daba media vuelta al tambor por segundo y
 * se leia como una ruleta.
 */
export const PASOS_DE_CIFRA = 1

/**
 * El recorrido del `0`, que es la unica cifra que da la vuelta entera.
 *
 * A un `0` se llega desde un `9`, y en un tambor mecanico eso es el rodillo recorriendo las diez
 * aletas hasta volver al principio. Es el gesto que hace visible el acarreo —`09` pasando a `10`— y el
 * unico sitio donde la vuelta larga cuenta algo en vez de ser adorno.
 */
export const PASOS_DE_VUELTA = TAMBOR_DE_CIFRAS.length - 1

/**
 * Cuantos glifos intermedios recorre cada caracter antes del suyo.
 *
 * Seis es el minimo que todavia se lee como un rodillo girando y no como un parpadeo; por encima de
 * diez el caracter pasa mas tiempo ilegible que legible, y esta pared se lee de pie y de pasada. Cada
 * paso suma una linea de texto al DOM, asi que el numero es tambien el coste.
 *
 * Es el promedio: el recorrido real de cada posicion lo decide `pasosDeGlifo()`, que lo hace desigual
 * a proposito.
 */
export const PASOS_POR_GLIFO = 6

/**
 * El recorrido mas corto y el mas largo que puede tocarle a una posicion.
 *
 * === POR QUE NO TODAS LAS FICHAS RECORREN LO MISMO ===
 *
 * Con un recorrido igual para todas, y como el escalonado es tambien regular, las fichas se asientan
 * en fila india a intervalos identicos: se lee como un contador digital haciendo la ola, no como un
 * panel. Un panel de verdad es desigual porque cada aleta venia de donde venia.
 *
 * Con recorridos distintos y **la misma velocidad de giro** —la duracion sale de los pasos, no al
 * reves—, las que tienen mas camino tardan mas y el conjunto se asienta desordenado, que es el gesto
 * que hace que el efecto se lea como mecanico.
 *
 * Cuatro y nueve, y no las 3 a 7 vueltas al tambor completo que usa el panel del que viene esta idea:
 * una vuelta entera son decenas de glifos, y acá cada glifo es una linea de texto mas en el DOM de
 * una pared que corre en un stick HDMI. El desorden se consigue igual con la diferencia relativa, que
 * es lo que el ojo lee, y no con el largo absoluto.
 */
export const PASOS_MINIMOS = 4

/** Ver `PASOS_MINIMOS`. */
export const PASOS_MAXIMOS = 9

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
  /**
   * El ancho que esta posicion reserva, en `em`.
   *
   * Es lo que permite que el texto NO salga monoespaciado sin renunciar a reservar el hueco antes de
   * que empiece a girar. Ver `anchoDeGlifo()`.
   */
  ancho: number
}

/**
 * El ancho que reserva cada clase de caracter, en `em`.
 *
 * === POR QUE UNA TABLA Y NO EL ANCHO REAL DEL GLIFO ===
 *
 * El hueco tiene que medir lo mismo durante todo el volteo: dentro pasan siete glifos distintos, y si
 * el hueco midiera lo que mide el que esta encima, la celda cambiaria de ancho siete veces y empujaria
 * a sus vecinas. El marco de la pantalla es `overflow: hidden` sin barra de scroll, asi que eso no se
 * ve fallar: se lleva por delante la columna de al lado y nadie se entera.
 *
 * Asi que el ancho se fija de antemano, por clase de caracter. No es el ancho exacto de la fuente
 * —seria imposible sin medirlo en el navegador— pero es mucho mas fiel que un ancho unico: una `i` y
 * una `m` dejan de ocupar lo mismo, y el texto deja de leerse como una maquina de escribir.
 *
 * Los valores vienen calibrados de un panel Solari ya en produccion en otro proyecto; el resto de
 * clases se completo por continuidad con esas.
 */
const ANCHOS_EN_EM = {
  /** Digitos: van con `tabular-nums`, asi que todos miden igual por definicion. */
  digito: 0.66,
  /** Las letras anchas de verdad. */
  ancha: 0.9,
  /** Las letras finas, que con un ancho medio dejan un agujero a cada lado. */
  fina: 0.42,
  /** Puntos, comas, dos puntos: casi todo aire. */
  puntuacion: 0.3,
  /** Mayusculas, que en cualquier fuente son mas anchas que su minuscula. */
  mayuscula: 0.72,
  /**
   * El signo de porcentaje, que tiene clase propia y no va con las letras anchas.
   *
   * Es el unico glifo no alfabetico que aparece dentro de una tira uniforme —"85%"— y el ancho que
   * le tocaba con las `M` y las `W` (0.9em) abria un hueco visible entre la cifra y el signo: la
   * columna de avance decia "0 %", que se lee como dos datos. Con 0.8em el signo no se aprieta
   * contra sus bordes y la ficha sigue pareciendose a las de al lado.
   */
  porcentaje: 0.8,
  /** Todo lo demas. */
  normal: 0.58
} as const

/** Las letras que miden claramente mas que la media. */
const LETRAS_ANCHAS = 'MWmw@'

/** Las letras que miden claramente menos que la media. */
const LETRAS_FINAS = 'IiltfjJ'

/** Lo que es casi todo aire y no merece un hueco de letra. */
const PUNTUACION = ' .,:;!¡?¿\'"`|()[]{}-–—/\\*+·°º…'

/**
 * El ancho que reserva un caracter, en `em`.
 *
 * @param glifo el caracter que va a quedar en el hueco
 * @returns el ancho en `em`; ver `ANCHOS_EN_EM`
 */
export function anchoDeGlifo (glifo: string): number {
  if (glifo === '') return ANCHOS_EN_EM.puntuacion
  if (glifo === '%') return ANCHOS_EN_EM.porcentaje
  if (LETRAS_ANCHAS.includes(glifo)) return ANCHOS_EN_EM.ancha
  if (LETRAS_FINAS.includes(glifo)) return ANCHOS_EN_EM.fina
  if (PUNTUACION.includes(glifo)) return ANCHOS_EN_EM.puntuacion
  if (glifo >= '0' && glifo <= '9') return ANCHOS_EN_EM.digito
  // Una mayuscula es un caracter que cambia al pasarlo a minuscula: vale para acentos y para la eñe
  // sin escribir el alfabeto dos veces.
  if (glifo !== glifo.toLowerCase()) return ANCHOS_EN_EM.mayuscula

  return ANCHOS_EN_EM.normal
}

/**
 * Lo que mide el hueco de una ficha uniforme, en `em`.
 *
 * Es el valor de `--ancho-columna` de `pantalla.css` —`1ch`, el ancho del digito de la fuente— escrito
 * acá para poder razonar sobre el sin un navegador. No es exacto y no hace falta que lo sea: solo se
 * usa para contestar una pregunta de si o no, la de `excedeElHuecoUniforme()`.
 */
export const ANCHO_UNIFORME_EM = 0.72

/**
 * Si un glifo no cabe en un hueco uniforme y necesita el suyo.
 *
 * La tira uniforme le da a toda posicion el mismo ancho, que es lo que alinea dos celdas de la misma
 * columna del tablero. Funciona para los digitos —van con `tabular-nums` y miden todos igual— y para
 * los separadores, que sobra aire. **No funciona para el `%`**, que mide 0.9em: metido en un hueco de
 * 0.72 se dibuja apretado contra sus dos bordes y el `0%` de la columna de avance se leia `0 %`, como
 * si fueran dos datos.
 *
 * Los pocos glifos anchos reciben su ancho propio aunque la tira sea uniforme. Rompe la alineacion de
 * esa posicion —a cambio de que el dato se lea— y no rompe la de las columnas: el `%` va siempre al
 * final de la celda y la celda va alineada a la derecha, asi que lo que se compara de fila a fila
 * sigue cayendo en el mismo sitio.
 *
 * @param ancho lo que `anchoDeGlifo()` reserva para el glifo, en `em`
 */
export function excedeElHuecoUniforme (ancho: number): boolean {
  return ancho > ANCHO_UNIFORME_EM
}

/**
 * Cuantos glifos recorre la posicion `indice` antes de asentarse.
 *
 * Es desigual a proposito —ver `PASOS_MINIMOS`— pero **no es al azar**: sale del caracter y de su
 * posicion. Tiene que ser asi por dos motivos, y el segundo no es negociable:
 *
 * 1. El componente que lo dibuja es puro y no guarda estado. Con `Math.random()` cada render daria un
 *    recorrido distinto, y React remontaria fichas que no cambiaron.
 * 2. **La pagina se pinta en el servidor y se hidrata en el cliente.** Un numero al azar sale distinto
 *    en los dos lados, React lo detecta como un desajuste de hidratacion y descarta el arbol entero.
 *    En esta pantalla eso no se ve en desarrollo —`pnpm dev` no hidrata— y arruina la pared en
 *    produccion, que es el peor sitio donde puede aparecer un fallo.
 *
 * Las cifras quedan fuera de este desorden: ver `PASOS_DE_CIFRA`.
 *
 * @param glifo  el caracter de destino
 * @param indice su posicion dentro del texto
 * @returns `PASOS_DE_CIFRA` o `PASOS_DE_VUELTA` si es una cifra; si no, un entero entre
 *          `PASOS_MINIMOS` y `PASOS_MAXIMOS`
 */
export function pasosDeGlifo (glifo: string, indice: number): number {
  // Las cifras no entran en el sorteo: su recorrido lo dicta el tambor de diez aletas y no el gusto.
  // Ver `PASOS_DE_CIFRA` y `PASOS_DE_VUELTA`.
  if (TAMBOR_DE_CIFRAS.includes(glifo)) {
    return glifo === '0' ? PASOS_DE_VUELTA : PASOS_DE_CIFRA
  }

  const rango = PASOS_MAXIMOS - PASOS_MINIMOS + 1
  const semilla = (glifo.codePointAt(0) ?? 0) * 31 + (Number.isFinite(indice) ? Math.abs(Math.trunc(indice)) : 0) * 17

  return PASOS_MINIMOS + (semilla % rango)
}

/**
 * Los glifos intermedios de un caracter, en orden de aparicion.
 *
 * Recorre el tambor de SU clase hacia atras desde el destino, dando la vuelta cuando se acaba, y devuelve
 * el camino de ida: primero el mas lejano, ultimo el destino. El destino se devuelve **tal cual
 * llego** —con su acento y su caja—, aunque los intermedios se hayan buscado por su mayuscula sin
 * acentuar: lo que queda fijo en la pared tiene que ser el texto de verdad y no una aproximacion.
 *
 * @param destino    el caracter en el que el rodillo se detiene
 * @param pasos      cuantos glifos intermedios recorrer; se acota a [1, largo de su tambor]
 * @returns la secuencia, de `pasos + 1` elementos, o `null` si el caracter no voltea
 */
export function rodilloDeGlifo (destino: string, pasos: number = PASOS_POR_GLIFO): string[] | null {
  if (destino === '') return null

  const glifo = comoGlifo(destino)
  // Cada clase gira en SU tambor: una cifra solo pasa por cifras y una letra solo por letras.
  const tambor = TAMBOR_DE_CIFRAS.includes(glifo) ? TAMBOR_DE_CIFRAS : TAMBOR_DE_LETRAS
  const indice = tambor.indexOf(glifo)

  // Un espacio, un signo de puntuacion, un emoji: no hay tambor por el que hacerlo girar y un
  // rodillo de un solo glifo es DOM para no mover nada. Se dibuja quieto.
  if (indice < 0) return null

  const largo = tambor.length
  const cuantos = Math.min(Math.max(Math.floor(pasos), 1), largo)
  const secuencia: string[] = []

  // Se recorre hacia atras desde el mas lejano —`cuantos` posiciones antes del destino— hasta el
  // destino, que entra al final y con su caja original.
  for (let salto = cuantos; salto > 0; salto -= 1) {
    secuencia.push(tambor[(indice - salto + largo) % largo] as string)
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
 * El recorrido de cada posicion NO es el mismo: lo decide `pasosDeGlifo()`, para que las fichas no se
 * asienten todas en fila. El ancho tampoco: lo decide `anchoDeGlifo()`.
 *
 * === POR QUE EL PRESUPUESTO SE PUEDE GASTAR DESDE EL FINAL ===
 *
 * Por defecto voltean los primeros caracteres, que es donde esta la vista: en un nombre, lo que
 * identifica la fila son las primeras letras y la cola ya venia recortada.
 *
 * En un CONTADOR es exactamente al reves. `2:14:37` cambia una vez por segundo y lo que cambia es el
 * ultimo digito; el de las decenas cambia cada diez segundos y el de las horas cada hora. Gastar el
 * presupuesto por delante dejaria girando justo los digitos que no se mueven y quieto el unico que si.
 * Con `desdeElFinal` el presupuesto se gasta por la cola, que es donde ocurre el cambio.
 *
 * @param texto        lo que se quiere mostrar; `''` devuelve una lista vacia
 * @param tope         cuantos caracteres como mucho voltean; ver `TOPE_DE_GLIFOS`
 * @param desdeElFinal si el presupuesto se reparte desde la cola del texto y no desde el principio
 * @returns una posicion por caracter, en el orden del texto
 */
export function rodilloDeTexto (
  texto: string,
  tope: number = TOPE_DE_GLIFOS,
  desdeElFinal: boolean = false
): GlifoSolari[] {
  if (typeof texto !== 'string' || texto === '') return []

  const limite = Math.max(Math.floor(tope), 0)
  const letras = Array.from(texto)
  const rodillos: Array<string[] | null> = letras.map(() => null)
  const recorrido = letras.map((_, indice) => indice)
  let animados = 0

  if (desdeElFinal) recorrido.reverse()

  for (const indice of recorrido) {
    if (animados >= limite) break

    const glifo = letras[indice] as string
    const rodillo = rodilloDeGlifo(glifo, pasosDeGlifo(glifo, indice))

    if (rodillo === null) continue

    rodillos[indice] = rodillo
    animados += 1
  }

  return letras.map((glifo, indice) => ({
    glifo,
    rodillo: rodillos[indice] ?? null,
    escalon: escalonDeGlifo(indice),
    ancho: anchoDeGlifo(glifo)
  }))
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

/**
 * === LA OLA DEL TABLERO ===
 *
 * Lo de arriba resuelve UN texto. Lo que sigue resuelve una PANTALLA entera de textos, que es un
 * problema distinto y es el que decide si la pared rinde o tironea.
 *
 * **El numero que importa no es cuantas fichas hay, sino cuantas giran en el mismo fotograma.** Un
 * tablero de quince filas por seis columnas tiene del orden de mil cuatrocientos huecos; medido, con
 * ciento cuarenta y nueve girando a la vez la pared baja a 21 fotogramas por segundo, y con catorce se
 * queda en 61. Un panel de Solari de verdad no tiene ese problema porque **nunca giran todas**: la ola
 * recorre el tablero de arriba abajo y de izquierda a derecha, y cuando la fila ocho arranca, la uno
 * ya se asento.
 *
 * Asi que la ola se reparte en RANURAS: cada ficha que va a girar recibe una ranura propia, en orden
 * de lectura, y arranca `--escalon` milisegundos despues que la anterior. Con eso el pico deja de
 * depender del tamaño del tablero y pasa a ser una division:
 *
 *     fichas girando a la vez ≈ (pasos promedio * velocidad) / escalon
 *
 * —unos 325 ms de giro contra los 16 ms del escalon del tablero: del orden de veinte—. Y la ola entera
 * dura `RANURAS_DE_OLA * escalon`, que es lo que la acota por el otro lado: no puede durar mas que una
 * fraccion de la pagina, o la pared se pasa la vida moviendose.
 *
 * Las dos cosas juntas son el presupuesto: **cuantas fichas pueden girar en un cambio de pagina**. Se
 * reparte entre las filas que haya —quince en horizontal, treinta en vertical— y dentro de cada fila
 * entre sus columnas por peso. Lo que no entra en el presupuesto no se pierde: aparece ya quieto, con
 * su caracter nuevo.
 */

/**
 * Cuantas fichas pueden girar, como mucho, en un cambio de pagina.
 *
 * Sale de las dos restricciones a la vez. Por arriba: la ola dura `RANURAS_DE_OLA * --escalon`, y con
 * los 6 ms del tablero son ~1,0 s de los 10 a 20 que dura una pagina — la pared se mueve una fraccion
 * del tiempo y esta quieta el resto, que es la condicion para leerla de pie y de pasada. Por abajo:
 * menos ranuras dejarian filas enteras sin una sola ficha girando, y entonces el cambio de pagina se
 * leeria como un reemplazo de texto y no como un panel.
 *
 * El limite de arriba ya no es el que manda: con el escalon de 6 ms lo que acota la ola no es el
 * presupuesto de tiempo sino el de fichas. Ver `.solari-tablero` en `pantalla.css`.
 *
 * El numero se afino midiendo, no razonando: ver el bloque de medicion del informe de la rama. Con 190
 * ranuras a 16 ms el pico medido fue de 68 fichas y la pared bajo a 39 fps con saltos de 333 ms; con
 * 170 —y el giro de `--velocidad` acortado— el arranque se reparte en menos de tres fichas por
 * fotograma, que es lo que de verdad cuesta: una animacion de `transform` ya en curso la compone la
 * GPU y no paga estilo.
 *
 * **No es un tope de fichas en pantalla**: los huecos que no entran en el presupuesto existen igual y
 * muestran su caracter definitivo desde el primer fotograma. Lo que se reparte es el movimiento.
 */
export const RANURAS_DE_OLA = 170

/**
 * El minimo y el maximo de fichas que giran en UNA fila.
 *
 * El piso existe para la pagina con tres filas: repartir 190 ranuras entre tres daria sesenta fichas
 * girando en una sola fila, que es toda la fila volteandose a la vez y ademas la ola mas lenta de la
 * pared. El techo, para la de treinta: sin el, una fila se quedaria con una sola ficha girando y el
 * resto del renglon cambiando de golpe, que se lee peor que no animar nada.
 */
export const TOPE_DE_FILA = 16

/** Ver `TOPE_DE_FILA`. */
export const PISO_DE_FILA = 4

/** Como se reparte la ola de un tablero entre sus columnas. Lo arma `planDeOla()`. */
export interface PlanDeOla {
  /**
   * Cuantas fichas giran en cada columna, en el orden en que se le pasaron los pesos.
   *
   * Es el `tope` que recibe `rodilloDeTexto()` para esa celda: lo que se pasa de ahi se dibuja quieto.
   */
  topes: number[]
  /** Cuantas ranuras de la ola consume una fila entera; es la suma de `topes`. */
  porFila: number
}

/**
 * Como se reparte la ola de este tablero.
 *
 * El presupuesto de una fila sale de dividir `RANURAS_DE_OLA` entre las filas que hay en la pagina
 * —quince en horizontal, treinta en vertical— y acotarlo entre `PISO_DE_FILA` y `TOPE_DE_FILA`. Ese
 * presupuesto se reparte despues entre las columnas por peso, con el metodo del **mayor resto**: la
 * suma de los topes es exactamente el presupuesto, sin perder ni inventar una ranura por redondeo.
 *
 * Los pesos son una decision de lectura, no de calculo: el nombre —lo unico que alguien lee de verdad
 * desde el pasillo— pesa varias veces lo que una columna de apoyo, porque una ficha girando en el
 * nombre cuenta el cambio y una girando en el porcentaje no la ve nadie.
 *
 * @param filas cuantas filas tiene la pagina; menos de una se trata como una
 * @param pesos la importancia relativa de cada columna, en el orden del DOM; los negativos son cero
 * @returns el tope por columna y lo que consume la fila entera
 */
export function planDeOla (filas: number, pesos: readonly number[]): PlanDeOla {
  const cuantas = Number.isFinite(filas) ? Math.max(Math.floor(filas), 1) : 1
  const limpios = pesos.map((peso) => (Number.isFinite(peso) ? Math.max(peso, 0) : 0))
  const suma = limpios.reduce((total, peso) => total + peso, 0)

  if (suma <= 0) return { topes: limpios.map(() => 0), porFila: 1 }

  const presupuesto = Math.min(Math.max(Math.floor(RANURAS_DE_OLA / cuantas), PISO_DE_FILA), TOPE_DE_FILA)
  const topes = repartirPorMayorResto(presupuesto, limpios, suma)

  return { topes, porFila: Math.max(topes.reduce((total, tope) => total + tope, 0), 1) }
}

/**
 * En que ranura de la ola arranca la primera ficha de una celda.
 *
 * Es el orden de lectura del tablero: todas las columnas de la fila 0, despues las de la fila 1, y
 * asi. Dentro de la celda, `escalonDeGlifo()` suma la posicion del caracter, de modo que cada ficha
 * que gira tiene una ranura propia y arranca un `--escalon` despues que la anterior. Eso es lo que
 * mantiene el pico bajo: ver el docblock de `RANURAS_DE_OLA`.
 *
 * Es aritmetica pura de dos enteros, sin reloj y sin azar: el mismo tablero da la misma ola en el
 * servidor y en el cliente, que es lo que exige la hidratacion.
 *
 * @param plan    el reparto de la escena, de `planDeOla()`
 * @param fila    la posicion de la fila dentro de SU tabla, empezando en 0
 * @param columna el indice de la columna, en el mismo orden de los pesos
 * @param desfase ranuras extra, para la segunda tabla de una escena que tiene dos
 * @returns la ranura de arranque, nunca negativa
 */
export function ondaDeFicha (plan: PlanDeOla, fila: number, columna: number, desfase: number = 0): number {
  const cual = Number.isFinite(fila) ? Math.max(Math.floor(fila), 0) : 0
  const hasta = Number.isFinite(columna) ? Math.max(Math.floor(columna), 0) : 0
  const extra = Number.isFinite(desfase) ? Math.max(Math.floor(desfase), 0) : 0

  let antes = 0

  for (let indice = 0; indice < hasta && indice < plan.topes.length; indice += 1) {
    antes += plan.topes[indice] ?? 0
  }

  return extra + cual * plan.porFila + antes
}

/**
 * El texto tal como entra en una tira de fichas: recortado y, si toca, en mayusculas.
 *
 * === POR QUE HAY QUE RECORTARLO ANTES Y NO DEJARSELO AL `overflow` ===
 *
 * Una tira de fichas no se recorta con `truncate`: son `inline-block`, y lo unico que los detiene es
 * el `overflow: hidden` de la celda. Eso tapa lo que sobra pero **lo dibuja igual**: un nombre de
 * sesenta caracteres en una columna donde caben treinta son treinta huecos de DOM por fila que nadie
 * va a ver nunca. En quince filas son cuatrocientos cincuenta elementos pagados a cambio de nada.
 *
 * Asi que el recorte es del dominio y no del navegador, y termina en puntos suspensivos —que si se
 * ven— en vez de cortarse a mitad de letra.
 *
 * === LAS MAYUSCULAS NO SON PARA TODO ===
 *
 * Un panel de verdad es todo mayusculas porque sus aletas solo tienen mayusculas. Acá la caja se
 * elige por columna: las cortas van en mayuscula, que es el gesto; **el nombre no**. Una frase larga
 * en mayusculas pierde la silueta de las palabras —lo que el ojo usa para leerla de un golpe a cuatro
 * metros— y encima crece de ancho, que en la columna que ya es la mas apretada del tablero significa
 * recortar informacion para ganar estetica.
 *
 * @param texto      lo que se quiere mostrar
 * @param maximo     cuantos caracteres caben en la columna; ver `cupoDeFichas()`
 * @param mayusculas si la columna va en mayusculas
 * @returns el texto listo para `rodilloDeTexto()`
 */
export function textoDeFicha (texto: string, maximo: number, mayusculas: boolean = false): string {
  if (typeof texto !== 'string' || texto === '') return ''

  const caja = mayusculas ? texto.toLocaleUpperCase('es') : texto
  const cabe = Number.isFinite(maximo) ? Math.max(Math.floor(maximo), 1) : 1
  const letras = Array.from(caja)

  if (letras.length <= cabe) return caja

  return `${letras.slice(0, cabe - 1).join('')}…`
}

/**
 * El ancho que ocupa una ficha uniforme, en `em`, junta incluida.
 *
 * `1ch` —el ancho del digito de la fuente— mas la junta de `--solari-junta`, que es la separacion
 * entre aletas. **Es una medida y no una estimacion**: 0.72em de `1ch` mas 0.07em de junta, leidos del
 * `getComputedStyle` de un hueco de la pared ya dibujada. La primera version tenia 0.66 a ojo y el
 * resultado se vio en la captura: la mitad de las columnas cortadas a media palabra, porque el cupo
 * decia que entraban quince caracteres donde entraban doce.
 *
 * === LO QUE ESTE NUMERO DECIDE, Y POR QUE NO TODA LA PARED LLEVA FICHA UNIFORME ===
 *
 * Una ficha uniforme cuesta 0.79em por caracter. Un texto en caja mixta promedia 0.56 —ver
 * `ANCHO_SOBRIO_EM`—, asi que **ponerle fichas de ancho fijo a una columna de palabras le quita el 29%
 * de sus caracteres**: "En progreso" en 18vmin pasa de entrar entero a entrar como "EN PROGR…".
 *
 * De ahi sale la regla que reparte la estetica en la pantalla, y es una regla y no un gusto: **la
 * ficha de ancho fijo es gratis donde el texto ya es de ancho fijo** —los digitos, que van con
 * `tabular-nums`— y cuesta una palabra de cada tres donde no lo es. Asi que la llevan los contadores,
 * los relojes, los porcentajes, las fechas y las cifras; y las columnas de palabras van sobrias, que
 * es la misma tira de fichas con el ancho de cada letra y sin fondo ni junta. La linea de pliegue las
 * cruza a las dos, que es lo que hace que la pared entera se lea como un panel.
 */
export const ANCHO_DE_FICHA_EM = 0.79

/**
 * Lo que mide un caracter promedio en una tira SOBRIA, en `em`.
 *
 * La tira sobria no reserva un ancho de columna por hueco sino el que `anchoDeGlifo()` le da a cada
 * clase de caracter. En castellano y en caja mixta eso promedia 0.56em contra los 0.79 de una ficha
 * uniforme, y esa diferencia es la que decide que columnas de la pared llevan ficha y cuales no: ver
 * el docblock de `ANCHO_DE_FICHA_EM`.
 */
export const ANCHO_SOBRIO_EM = 0.56

/**
 * Lo que mide un caracter promedio en una tira sobria **en mayusculas**, en `em`.
 *
 * Una mayuscula reserva 0.72em en `anchoDeGlifo()` contra los ~0.55 de una minuscula, asi que una
 * columna en caja alta cabe un 30% menos que la misma columna en caja mixta. Medirla con
 * `ANCHO_SOBRIO_EM` es lo que dejo "EN PROGRESO" entrando como "EN PROGRES" en la primera captura: el
 * cupo decia once y entraban nueve.
 *
 * De aca sale ademas la regla de que columnas van en mayusculas y cuales no. Las mayusculas son el
 * gesto del panel, pero cuestan caracteres: donde el texto mas largo no entra en caja alta —el estado
 * de una Tarea, el "Venció 12/05", el cargo de alguien— se queda en caja mixta, porque una pared que
 * no dice el dato entero no es mas Solari por estar en mayusculas.
 */
export const ANCHO_MAYUSCULA_EM = 0.74

/**
 * Cuantos caracteres caben en una columna del tablero.
 *
 * Las dos medidas salen de `pantalla.css` y de `piezas.tsx`, y las dos estan en `vmin`, asi que la
 * division no depende del tamaño del televisor: una columna de 18vmin con letra de 2.7vmin da los
 * mismos diez caracteres en un aparato de 43 pulgadas y en uno de 75.
 *
 * Cuando una columna mide distinto en horizontal y en vertical se le pasa **la mas angosta de las
 * dos**: sobrar hueco se ve como aire, y faltar se ve como una palabra cortada. La excepcion es la
 * columna flexible del nombre, que en vertical se estrecha mucho: ahi manda la medida horizontal,
 * porque perder ocho caracteres del nombre de una Tarea en la pared tumbada —que es como cuelgan
 * todas— para ahorrar DOM en la de pie seria pagar informacion con estetica.
 *
 * @param anchoVmin  el ancho de la columna, tal como esta en `.pantalla-columnas-*`
 * @param cuerpoVmin el cuerpo de letra de la celda, de `CUERPO_PRINCIPAL` o `CUERPO_COLUMNA`
 * @param anchoEm    lo que mide un caracter; `ANCHO_DE_FICHA_EM` o `ANCHO_SOBRIO_EM`
 * @returns cuantos caracteres pedirle al texto, al menos uno
 */
export function cupoDeFichas (anchoVmin: number, cuerpoVmin: number, anchoEm: number = ANCHO_DE_FICHA_EM): number {
  if (!Number.isFinite(anchoVmin) || !Number.isFinite(cuerpoVmin) || cuerpoVmin <= 0) return 1
  if (!Number.isFinite(anchoEm) || anchoEm <= 0) return 1

  return Math.max(Math.floor(anchoVmin / (cuerpoVmin * anchoEm)), 1)
}

/**
 * Reparte `total` unidades entre `pesos` sin perder ni inventar ninguna.
 *
 * Metodo del mayor resto: se reparte la parte entera y lo que sobra va a las columnas con el resto mas
 * grande. Los empates los rompe el orden de las columnas, que es fijo, asi que el reparto es el mismo
 * en el servidor y en el cliente.
 */
function repartirPorMayorResto (total: number, pesos: number[], suma: number): number[] {
  const exactos = pesos.map((peso) => (total * peso) / suma)
  const partes = exactos.map((exacto) => Math.floor(exacto))
  let sobran = total - partes.reduce((acumulado, parte) => acumulado + parte, 0)

  const orden = exactos
    .map((exacto, indice) => ({ indice, resto: exacto - Math.floor(exacto) }))
    .sort((uno, otro) => (otro.resto - uno.resto) || (uno.indice - otro.indice))

  for (const { indice } of orden) {
    if (sobran <= 0) break

    partes[indice] = (partes[indice] ?? 0) + 1
    sobran -= 1
  }

  return partes
}

/**
 * Cuantas fichas de un contador pueden girar.
 *
 * Dos, y siempre las dos ultimas: ver `rodilloDeTexto()` y su `desdeElFinal`. Un contador de pared
 * cambia un digito por segundo —el de las unidades— y dos cada diez segundos; volteando dos, la fila
 * cuenta el cambio entero y el resto del numero se queda quieto porque de verdad no cambio.
 *
 * Con quince contadores en pantalla son quince fichas por segundo, que es el orden que ya se sabe que
 * rinde. Con las ocho posiciones de `0:12:33` serian ciento veinte por segundo, para animar seis
 * digitos que no se movieron.
 */
export const TOPE_DE_CONTADOR = 2

/**
 * En cuantas ranuras se reparte la ola de una columna de contadores.
 *
 * Es una VENTANA y no un paso por fila, y la diferencia importa: la ola de un tablero cambia una vez
 * por pagina, pero la de los contadores se repite **cada segundo**. Si la ultima fila arrancara mas
 * de un segundo tarde, su digito voltearia un valor que ya no es el suyo — la pared mentiria.
 *
 * Treinta y cuatro ranuras con el escalon de 3 ms de `.solari-contador` son 0,10 s: la columna entera
 * arranca dentro de un mismo vistazo —el ojo lo lee como simultaneo— y el volteo completo se asienta en
 * ~0,54 s, con medio segundo de margen antes del tic siguiente, tenga la tabla quince filas o las ~36
 * de `trabajando`. La ventana no existe para escalonar la lectura sino para que las 36 fichas no
 * ARRANQUEN en el mismo fotograma; la cuenta entera esta en `.solari-contador` en `pantalla.css`.
 *
 * Lo que NO puede volver a pasar: que la espera de la ola pase del segundo. Cuando pasaba —el escalon
 * de 26 ms daba 1,4 s en la ultima fila— el valor siguiente remontaba la ficha antes de que la anterior
 * se asentara y el contador se quedaba clavado en un glifo intermedio, sin avanzar y sin decir la hora.
 */
export const RANURAS_DE_CONTADOR = 34

/**
 * En que ranura arranca el contador de la fila `fila`.
 *
 * @param fila  la posicion de la fila dentro de su tabla, empezando en 0
 * @param filas cuantas filas tiene la tabla, para repartir la ventana entre todas
 * @returns la ranura de arranque, entre 0 y `RANURAS_DE_CONTADOR`
 */
export function ondaDeContador (fila: number, filas: number): number {
  if (!Number.isFinite(fila) || !Number.isFinite(filas)) return 0

  const cual = Math.max(Math.floor(fila), 0)
  const cuantas = Math.max(Math.floor(filas), 1)

  return Math.min(Math.round((cual * RANURAS_DE_CONTADOR) / cuantas), RANURAS_DE_CONTADOR)
}

/**
 * Si una cadena es una CIFRA y no una palabra.
 *
 * Es el unico criterio que decide que se dibuja como panel mecanico y que se dibuja como texto plano.
 * El volteo y la estetica de aleta quedan reservados a lo que cambia de valor —relojes, contadores,
 * porcentajes, conteos, fechas cortas— y no alcanzan a los nombres, titulos ni rotulos.
 *
 * El motivo es de lectura y esta medido en el docblock de `ANCHO_DE_FICHA_EM`: una ficha de ancho fijo
 * cuesta 0.79em por caracter contra los 0.56 de un texto en caja mixta. Una columna de digitos ya es
 * de ancho fijo y no paga nada; una de palabras paga el 29% de sus caracteres, o sea informacion. Y a
 * cuatro metros lo que el ojo usa para leer una palabra de un golpe es su silueta, que una tira de
 * huecos iguales destruye.
 *
 * La regla es: **hay al menos un digito y no hay ni una letra**. Los separadores —`:`, `/`, `%`, el
 * punto, la coma, el signo— no cuentan como letra, asi que `14:32`, `2:14:37`, `85%` y `12/09` pasan.
 * No pasan ni `+3 más` ni `Venció 12/09`, que son frases con un numero adentro, ni `—`, que es el
 * hueco de un dato que no existe: un guion volteando no cuenta nada.
 *
 * @param texto lo que se va a dibujar, ya recortado por `textoDeFicha()`
 * @returns `true` si se dibuja como ficha mecanica
 */
export function esNumerico (texto: string): boolean {
  return /\d/.test(texto) && !/\p{L}/u.test(texto)
}
