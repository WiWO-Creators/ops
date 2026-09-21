/**
 * El codigo con el que se habla de una pantalla que no se pudo dibujar.
 *
 * En produccion Next borra el `message` de un error de servidor y deja en su lugar un `digest`: es
 * lo unico que cruza lo que vio la persona con la linea que el servidor escribio en su propio log.
 * Si no se muestra, no existe — nadie puede dictarle a soporte un numero que nunca vio.
 *
 * Vive aparte de `PantallaCaida` porque ahi el digest viaja al incidente, y el incidente necesita
 * una sesion. En las pantallas de acceso no la hay: el codigo visible es lo unico que queda.
 */

/** Lo que se acepta como codigo. Un digest de Next es un puñado de digitos; nada mas se pinta. */
const FORMA_DE_DIGEST = /^[0-9a-z]{1,64}$/i

/**
 * El codigo dictable de un fallo de render.
 *
 * Se valida la forma en vez de confiar en el valor: el `digest` entra en una frase que se muestra
 * tal cual, y un valor inesperado ahi seria texto ajeno pintado como si fuera del producto.
 *
 * @param error el error tal como lo entrega el limite de error de Next
 * @returns el digest, o `null` si Next no lo puso —en desarrollo no lo pone— o no tiene su forma
 */
export function codigoDeFallo (error: { digest?: string }): string | null {
  const digest = error.digest?.trim() ?? ''

  return FORMA_DE_DIGEST.test(digest) ? digest : null
}

/**
 * La frase de una pantalla caida, con el codigo pegado atras cuando lo hay.
 *
 * La frase la arma esta funcion y no cada limite de error para que el codigo se pida siempre igual:
 * una pantalla que dice «reportalo con el codigo» y otra que lo suelta entre parentesis obligan a
 * soporte a adivinar que numero le estan dictando.
 *
 * Queda dentro del `detalle` de `ErrorEstado` —y no como un bloque aparte— porque asi pasa por el
 * mismo filtro que el resto de los mensajes de error del producto.
 *
 * @param detalle lo que se le dice a la persona, sin el codigo
 * @param codigo el que devolvio {@link codigoDeFallo}
 * @returns la frase lista para mostrar
 */
export function detalleConCodigoDeFallo (detalle: string, codigo: string | null): string {
  return codigo === null ? detalle : `${detalle} Si vuelve a pasar, repórtalo con el código ${codigo}.`
}
