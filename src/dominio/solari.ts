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
 * === UN TAMBOR POR CLASE DE CARACTER, Y ESTO NO ES UN DETALLE ===
 *
 * En un panel de Solari cada posicion es un rodillo FISICO con un juego fijo de aletas, y no puede
 * enseñar nada que no lleve montado. Un rodillo de digitos tiene diez aletas y ninguna letra: por eso
 * un reloj de un aeropuerto pasa de `7` a `2` por `8, 9, 0, 1, 2` y jamas por una `W`.
 *
 * La primera version de este archivo tenia UN solo tambor con las letras y los digitos pegados, y el
 * resultado se vio en la pared: un contador mostrando `0:09:2W`. Una `W` dentro de un reloj no existe
 * en ningun panel del mundo, y el efecto entero se leia como texto al azar en vez de como un
 * mecanismo. De ahi la regla que gobierna todo el modulo:
 *
 * - **Digito a digito.** El tambor es `0-9` y nada mas, ciclico.
 * - **Letra a letra.** El tambor son las 26 letras sin acento, ciclico.
 * - **Todo lo demas cae en un solo giro**: los dos puntos, el guion, el espacio, la coma, el punto —y
 *   tambien las vocales acentuadas, la `Ñ` y la `Ü`—. No recorren nada: aparecen puestas.
 *
 * Y una consecuencia que hay que nombrar porque es donde el instinto se equivoca: **cada posicion
 * recorre SU tambor y no sabe nada de sus vecinas**. Pasar de `9` a `10` no es una ficha que sube de
 * nueve a diez: son dos posiciones distintas, la de las unidades yendo de `9` a `0` y la de las
 * decenas apareciendo con un `1`. Nadie interpola el numero completo, y por eso la cuenta nunca
 * enseña un valor que no existio.
 */
export const TAMBOR_DE_DIGITOS = '0123456789'

/**
 * El tambor de las letras: las 26 sin acento, en orden alfabetico.
 *
 * **Sin `Ñ` y sin vocales acentuadas a proposito.** Un rodillo con `Ñ` obligaria a decidir si `Á` gira
 * por el camino de la `A` —y entonces el glifo que se lee mientras gira no es el que va a quedar— o si
 * cada acento se monta en su propia aleta, que son siete aletas mas por rodillo para un caracter que
 * aparece una vez cada doscientas. Cayendo en un solo giro, el acento y la eñe se dibujan enteros
 * desde el primer fotograma y nunca se rompen; ver `tamborDeGlifo()`.
 */
export const TAMBOR_DE_LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * Cuantos glifos intermedios recorre cada caracter antes del suyo.
 *
 * Cinco es el minimo que todavia se lee como un rodillo girando y no como un parpadeo; por encima de
 * diez el caracter pasa mas tiempo ilegible que legible, y esta pared se lee de pie y de pasada. Cada
 * paso suma una linea de texto al DOM, asi que el numero es tambien el coste.
 *
 * **Bajo de seis a cinco al partir el tambor por clase**, y las dos cosas van juntas: el tambor de
 * digitos tiene diez aletas, asi que un recorrido largo le daba casi una vuelta entera y el digito
 * pasaba mas tiempo mintiendo que diciendo su valor. Ademas, lo que gira en el mismo fotograma es la
 * duracion del giro partida por el escalon, y la duracion sale de los pasos: acortar el recorrido baja
 * el pico en la misma proporcion sin quitarle ni una ficha al volteo.
 *
 * Es el promedio: el recorrido real de cada posicion lo decide `pasosDeGlifo()`, que lo hace desigual
 * a proposito.
 */
export const PASOS_POR_GLIFO = 5

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
 * Tres y siete, y no las 3 a 7 vueltas al tambor completo que usa el panel del que viene esta idea:
 * una vuelta entera son decenas de glifos, y acá cada glifo es una linea de texto mas en el DOM de
 * una pared que corre en un stick HDMI. El desorden se consigue igual con la diferencia relativa, que
 * es lo que el ojo lee, y no con el largo absoluto.
 *
 * **El techo bajo de nueve a siete cuando el tambor se partio por clase**, y el motivo es el tambor de
 * digitos: tiene diez aletas, asi que nueve pasos eran casi la vuelta completa y el `7` de un reloj se
 * pasaba el giro entero enseñando los otros nueve digitos. Con siete el recorrido sigue leyendose como
 * un rodillo y el valor aparece antes.
 */
export const PASOS_MINIMOS = 3

/** Ver `PASOS_MINIMOS`. */
export const PASOS_MAXIMOS = 7

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
 * El ancho que reserva cada caracter, en `em`, **medido en la fuente de la pared**.
 *
 * === POR QUE UNA TABLA Y NO EL ANCHO REAL DEL GLIFO ===
 *
 * El hueco tiene que medir lo mismo durante todo el volteo: dentro pasan varios glifos distintos, y si
 * el hueco midiera lo que mide el que esta encima, la celda cambiaria de ancho en cada paso y
 * empujaria a sus vecinas. El marco de la pantalla es `overflow: hidden` sin barra de scroll, asi que
 * eso no se ve fallar: se lleva por delante la columna de al lado y nadie se entera.
 *
 * === POR QUE ES UNA MEDIDA Y YA NO SEIS CLASES A OJO ===
 *
 * Hasta acá habia seis clases —ancha, fina, puntuacion, digito, mayuscula, normal— con anchos puestos
 * a ojo, y **el hueco recortaba el glifo por la derecha**. Se veia en la captura del televisor y no era
 * sutil: la `O` mayuscula mide 0.80em en esta fuente y reservaba 0.72, asi que la pared escribia
 * "REDISEÑC DE MARCA", "AUTCGESTIÓN" y "JCRNADA". Lo mismo la `W` (0.99 contra 0.90), la `%` y los
 * puntos suspensivos del recorte, que miden 0.81em y reservaban 0.30 — por eso un texto recortado
 * terminaba en un punto suelto en vez de en `…`.
 *
 * Asi que los anchos se **midieron** con `getComputedStyle` de un hueco de la pared ya dibujada y
 * `measureText` de cada caracter en la familia de verdad (`Outfit`, con `tabular-nums`, que es como
 * van todas las tiras). Cada uno se redondea hacia ARRIBA al multiplo de 0.04em: el redondeo tiene que
 * ser hacia arriba porque un hueco de menos recorta el glifo y uno de mas solo deja aire.
 *
 * Al medirlos, ademas, el tablero se aprieta: las mayusculas promedian 0.66em en vez de los 0.72 que
 * reservaban todas por igual, y una `i` reserva 0.28 en vez de 0.42. Ninguna columna se pasa de ancho
 * por esto — solo dejan de sobrar huecos.
 *
 * Si la pared cambia de fuente hay que volver a medir. Es el precio de no recortar glifos, y es el
 * correcto: una tabla desactualizada deja aire de mas, y eso se ve mucho menos que una `O` que se lee
 * como una `C`.
 */
const ANCHOS_MEDIDOS: ReadonlyArray<readonly [number, string]> = [
  [0.20, ' ·'],
  [0.28, 'ijlí\''],
  [0.32, 'IÍ.,:;()¡!|'],
  [0.36, 'º'],
  [0.40, 't/°'],
  [0.44, 'fr"'],
  [0.48, 'sz-'],
  [0.52, 'Jc¿?*'],
  [0.56, 'ekuvxyéúü'],
  [0.60, '0123456789EFLSZÉabdghnopqáóñ–+'],
  [0.64, 'BPRT'],
  [0.68, 'Y%&'],
  [0.72, 'ACHKUVXÁÚÜ'],
  [0.76, 'DNÑ@'],
  [0.80, 'GOÓw'],
  [0.84, 'Q…'],
  [0.88, 'Mm—'],
  [1.00, 'W']
]

/**
 * Lo que reserva un caracter que no esta en la tabla.
 *
 * Generoso a proposito: un emoji, una letra de otro alfabeto o un simbolo raro caen acá, y de los tres
 * el unico fallo que se ve desde el pasillo es el glifo cortado por la mitad. Un hueco con aire de mas
 * no lo nota nadie; una `Ж` partida, si.
 */
const ANCHO_DESCONOCIDO = 1.0

/** La tabla de `ANCHOS_MEDIDOS` vuelta un indice por caracter. Se arma una vez por proceso. */
const ANCHOS_POR_GLIFO: ReadonlyMap<string, number> = new Map(
  ANCHOS_MEDIDOS.flatMap(([ancho, glifos]) => Array.from(glifos, (glifo) => [glifo, ancho] as const))
)

/**
 * El ancho que reserva un caracter, en `em`.
 *
 * Primero por la tabla medida; si no esta, por su letra base sin acento —asi una `à` reserva lo de una
 * `a` en vez de caer en el ancho de respaldo—; y si tampoco, `ANCHO_DESCONOCIDO`.
 *
 * @param glifo el caracter que va a quedar en el hueco
 * @returns el ancho en `em`; ver `ANCHOS_MEDIDOS`
 */
export function anchoDeGlifo (glifo: string): number {
  if (glifo === '') return ANCHOS_POR_GLIFO.get(' ') ?? ANCHO_DESCONOCIDO

  return ANCHOS_POR_GLIFO.get(glifo) ?? ANCHOS_POR_GLIFO.get(sinAcento(glifo)) ?? ANCHO_DESCONOCIDO
}

/**
 * La letra base de un caracter: `Í` da `I`, `ñ` da `n`, y lo que no lleva marcas se devuelve tal cual.
 *
 * Solo sirve para **clasificar** el ancho de lo que no esta medido. Lo que se dibuja es siempre el
 * caracter original: acá no se decide ni un glifo de la pared.
 */
function sinAcento (glifo: string): string {
  return glifo.normalize('NFD').replace(/[\u0300-\u036f]/gu, '')
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
 * @param glifo  el caracter de destino
 * @param indice su posicion dentro del texto
 * @returns un entero entre `PASOS_MINIMOS` y `PASOS_MAXIMOS`
 */
export function pasosDeGlifo (glifo: string, indice: number): number {
  const rango = PASOS_MAXIMOS - PASOS_MINIMOS + 1
  const semilla = (glifo.codePointAt(0) ?? 0) * 31 + (Number.isFinite(indice) ? Math.abs(Math.trunc(indice)) : 0) * 17

  return PASOS_MINIMOS + (semilla % rango)
}

/**
 * El tambor que le toca a un caracter, o `null` si no gira.
 *
 * Es la funcion que hace cumplir la regla de arriba: un caracter solo puede recorrer el juego de
 * glifos de SU clase. Un digito nunca puede devolver una letra intermedia y una letra nunca puede
 * devolver un digito, y eso es una propiedad del tipo de dato, no una casualidad del recorrido.
 *
 * Lo que devuelve `null` —y por tanto se dibuja quieto desde el primer fotograma— es todo lo que no
 * tiene rodillo propio: el espacio, la puntuacion, los simbolos, los emojis, las vocales acentuadas,
 * la `Ñ` y la `Ü`. Un acento que no gira es un acento que no se puede romper a mitad de giro, que es
 * justo lo que la pared estaba enseñando.
 *
 * @param destino el caracter de destino, ya partido por punto de codigo
 * @returns el tambor por el que gira, o `null` si cae en un solo giro
 */
function tamborDeGlifo (destino: string): string | null {
  if (destino === '' || destino.length > 2) return null

  if (TAMBOR_DE_DIGITOS.includes(destino)) return TAMBOR_DE_DIGITOS

  const mayuscula = destino.toUpperCase()

  // El largo se comprueba porque hay minusculas que crecen al subir de caja —la `ß` da `SS`— y una
  // busqueda de dos caracteres dentro del tambor daria un indice que no es el de ninguna aleta.
  if (mayuscula.length === 1 && TAMBOR_DE_LETRAS.includes(mayuscula)) return TAMBOR_DE_LETRAS

  return null
}

/**
 * Los glifos intermedios de un caracter, en orden de aparicion.
 *
 * Recorre el tambor de SU clase hacia atras desde el destino, dando la vuelta cuando se acaba, y
 * devuelve el camino de ida: primero el mas lejano, ultimo el destino.
 *
 * === EL CAMINO VA EN LA CAJA DEL DESTINO ===
 *
 * `TAMBOR_DE_LETRAS` esta en mayusculas porque es el ORDEN del rodillo, no su dibujo. Lo que se pinta
 * se pasa a la caja del destino: una `e` recorre `z a b c d` y no `Z A B C D`.
 *
 * No es prolijidad tipografica, es el mismo recorte que ya obligo a medir los anchos. El hueco mide lo
 * que reserva el destino —`anchoDeGlifo()`— y tiene `overflow: hidden`: una `e` reserva 0.56em y una
 * `W` mide 1.00, asi que el camino en mayusculas de una palabra en caja mixta se dibujaba cortado por
 * los dos lados. En la captura del televisor "Desarrollo" giraba como "XYLUNrollo", con cinco
 * mayusculas apretadas contra las minusculas quietas de la cola. En la caja del destino el camino se
 * mueve dentro de la misma banda de anchos que el hueco reservo, y ademas es lo que hace un panel de
 * verdad: un rodillo es UN juego de aletas, no dos.
 *
 * @param destino    el caracter en el que el rodillo se detiene
 * @param pasos      cuantos glifos intermedios recorrer; se acota a [1, largo de su tambor]
 * @returns la secuencia, de `pasos + 1` elementos, o `null` si el caracter no voltea
 */
export function rodilloDeGlifo (destino: string, pasos: number = PASOS_POR_GLIFO): string[] | null {
  const tambor = tamborDeGlifo(destino)

  // Un espacio, un signo de puntuacion, un emoji, un acento: no hay tambor por el que hacerlo girar, y
  // un rodillo de un solo glifo es DOM para no mover nada. Se dibuja quieto.
  if (tambor === null) return null

  const largo = tambor.length
  const indice = tambor.indexOf(destino.toUpperCase())
  const cuantos = Math.min(Math.max(Math.floor(pasos), 1), largo)
  const secuencia: string[] = []

  // Un destino en minuscula pinta su camino en minuscula. Se pregunta por el destino y no por el
  // tambor porque los digitos no tienen caja: `'7'.toLowerCase()` es `'7'` y la rebaja no los toca.
  const enMinuscula = destino !== destino.toUpperCase()

  // Se recorre hacia atras desde el mas lejano —`cuantos` aletas antes del destino— hasta el destino,
  // que entra al final y tal cual llego.
  for (let salto = cuantos; salto > 0; salto -= 1) {
    const glifo = tambor[(indice - salto + largo) % largo] as string
    secuencia.push(enMinuscula ? glifo.toLowerCase() : glifo)
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
 * los 32 ms del tablero son ~4,5 s de los 10 a 20 que dura una pagina — la pared se mueve menos de un
 * cuarto del tiempo y esta quieta el resto, que es la condicion para leerla de pie y de pasada. Por
 * abajo: menos ranuras dejarian filas enteras sin una sola ficha girando, y entonces el cambio de
 * pagina se leeria como un reemplazo de texto y no como un panel.
 *
 * El numero se afino midiendo, no razonando: ver el bloque de medicion del informe de la rama. Con 190
 * ranuras a 16 ms el pico medido fue de 68 fichas y la pared bajo a 39 fps con saltos de 333 ms; con
 * 170 a 26 ms el pico bajo al orden de las veinte, que seguia por encima de las ~14 que se sabe que
 * rinden. Con **140 a 32 ms** la ola dura lo mismo —lo que se movio es el reparto, no la duracion— y
 * el pico cae otro tercio: el pico es el giro partido por el escalon, y el giro tambien se acorto al
 * bajar `PASOS_MAXIMOS`.
 *
 * **No es un tope de fichas en pantalla**: los huecos que no entran en el presupuesto existen igual y
 * muestran su caracter definitivo desde el primer fotograma. Lo que se reparte es el movimiento.
 */
export const RANURAS_DE_OLA = 140

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
 * Treinta y cuatro ranuras con los 26 ms de `.solari-contador` son 0,88 s: la ola baja por la columna
 * entera y se cierra antes de que llegue el valor siguiente, tenga la tabla quince filas o las ~36 de
 * `trabajando`. Y como el reparto es proporcional, cuantas menos filas haya mas separadas arrancan, que
 * es justo lo que baja el pico donde sobra sitio para bajarlo.
 *
 * **El contador tiene escalon propio y no el del tablero**, justamente por esto: el escalon del tablero
 * subio a 32 ms para bajar el pico de un cambio de pagina, y con el la ventana pasaria de un segundo —o
 * sea, la ultima fila voltearia un valor que ya no es el suyo y la pared mentiria—. Ver
 * `.solari-contador` en `pantalla.css`.
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
