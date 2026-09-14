/**
 * Nombres de Tarea y de Proyecto en formato de titulo.
 *
 * El pedido del cliente fue "sin MAYUSCULAS SOSTENIDAS": un nombre gritado ensucia cualquier lista
 * y, al lado de los demas, se lee como un error. Lo que NO se pidio es reescribir como escribe la
 * gente, y por eso este helper hace una sola cosa.
 *
 * === POR QUE SOLO TOCA LO QUE ESTA TODO EN MAYUSCULAS ===
 *
 * Porque es el unico caso donde se sabe con certeza que el texto no dice nada por estar asi. En
 * cuanto aparece una minuscula, lo que hay es una decision de quien escribio —una marca, una sigla
 * en medio de una frase, un nombre propio raro— y no hay forma de distinguirla de un descuido. Ante
 * la duda se deja como esta: un nombre feo se arregla editandolo, un nombre corrompido no se nota
 * hasta que alguien lo busca y no lo encuentra.
 *
 * === COMO SOBREVIVEN LAS SIGLAS ===
 *
 * Sin lista de siglas conocidas, que envejeceria mal y seria una constante de negocio escondida en
 * el codigo. Se reconocen por forma: hasta tres letras ("SAC", "MGC", "HL", "PR"), sin vocales
 * ("DMG", "RRHH") o con digitos ("B2B", "H2"). Una palabra corriente en castellano no entra en
 * ninguna de las tres —"PLAN" y "MES" tienen vocal y mas de tres letras la primera—, asi que el
 * criterio corta donde tiene que cortar sin conocer el negocio.
 *
 * Las de cuatro letras o mas con vocal se pierden ("SERNAC" queda "Sernac"). Es el precio de no
 * tener lista, y es el error barato: se ve al escribirlo y se corrige a mano.
 */

/**
 * Las palabras que en castellano van en minuscula dentro de un titulo, salvo al principio.
 *
 * Son de la lengua, no del negocio: no cambian entre instalaciones y no tienen por que configurarse.
 */
const ATONAS = new Set([
  'a', 'al', 'ante', 'con', 'contra', 'de', 'del', 'desde', 'e', 'el', 'en', 'entre', 'hacia',
  'hasta', 'la', 'las', 'lo', 'los', 'o', 'para', 'por', 'según', 'sin', 'sobre', 'tras', 'u',
  'un', 'una', 'unas', 'unos', 'y'
])

/** Cuantas letras puede tener una sigla sin que haga falta otra señal para reconocerla. */
const LARGO_SIGLA = 3

/** Corta en palabras dejando los separadores adentro, para poder rearmar el texto tal cual. */
const PALABRAS = /[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu

/**
 * La misma palabra con la inicial en mayuscula.
 *
 * @param palabra la palabra ya en minusculas
 * @returns la palabra capitalizada
 */
function conMayusculaInicial (palabra: string): string {
  return palabra.charAt(0).toLocaleUpperCase('es') + palabra.slice(1)
}

/**
 * Si ese pedazo de texto se comporta como una sigla y hay que dejarlo como esta.
 *
 * @param palabra un token ya separado, sin espacios ni puntuacion
 * @returns `true` cuando conviene no tocarlo
 */
function pareceSigla (palabra: string): boolean {
  if (palabra.length <= LARGO_SIGLA) return true
  if (/\p{N}/u.test(palabra)) return true

  return !/[AEIOUÁÉÍÓÚÜ]/u.test(palabra)
}

/**
 * Si el texto viene gritado: tiene letras y ninguna es minuscula.
 *
 * @param texto el nombre crudo
 * @returns `true` cuando esta todo en mayusculas
 */
function estaGritado (texto: string): boolean {
  return /\p{Lu}/u.test(texto) && !/\p{Ll}/u.test(texto)
}

/**
 * Devuelve el nombre en formato de titulo, o el mismo nombre si no hay nada seguro que arreglar.
 *
 * Siempre recorta los espacios de los extremos: eso no corrompe nada y es lo que el campo hacia
 * antes de este helper. La conversion de mayusculas solo corre cuando el texto entero esta gritado.
 *
 * @param nombre el nombre tal como se escribio en el formulario
 * @returns el nombre listo para guardar
 */
export function enFormatoTitulo (nombre: string): string {
  const limpio = nombre.trim()

  if (!estaGritado(limpio)) return limpio

  let primera = true

  return limpio.replace(PALABRAS, (trozo) => {
    if (!/[\p{L}\p{N}]/u.test(trozo)) return trozo

    const esPrimera = primera
    primera = false

    const minuscula = trozo.toLocaleLowerCase('es')

    // Las atonas se resuelven ANTES que las siglas: "DE", "EL" y "LA" tienen tres letras o menos y
    // si no, `pareceSigla` las dejaria gritadas en medio de la frase.
    if (ATONAS.has(minuscula)) return esPrimera ? conMayusculaInicial(minuscula) : minuscula

    if (pareceSigla(trozo)) return trozo

    return conMayusculaInicial(minuscula)
  })
}
