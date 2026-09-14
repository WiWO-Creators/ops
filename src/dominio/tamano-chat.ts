/**
 * El tamaño del panel flotante del chat: los límites, el recorte a la ventana y lo que se recuerda.
 *
 * Vive acá y no dentro de `OrbeChatIA` por la misma razón que el resto de `dominio/`: es aritmética
 * pura y hay que poder probarla con `node --test` sin montar React ni un navegador. El componente se
 * queda solo con los eventos de puntero y el estado; todas las decisiones —cuánto es demasiado
 * grande, cuánto es demasiado chico, qué hacer con lo que había guardado— se toman acá.
 *
 * === POR QUE TODO RECIBE LAS MEDIDAS POR PARAMETRO ===
 *
 * Ninguna función de este archivo toca `window` ni `localStorage` por su cuenta: las dos cosas
 * llegan como argumento. Así la prueba pasa una ventana de 400×700 o un almacenamiento que lanza, y
 * no hace falta simular el navegador entero para saber qué pasa en un teléfono o en modo privado.
 * Es también lo que hace que el archivo se pueda importar desde un Server Component sin explotar.
 */

/** El tamaño del panel, en píxeles de CSS. */
export interface TamanoChat {
  ancho: number
  alto: number
}

/** Lo que mide el área visible del navegador, en píxeles de CSS. */
export interface VentanaVisible {
  ancho: number
  alto: number
}

/**
 * Con lo que arranca el chat la primera vez.
 *
 * Antes eran 24rem × 32rem (384 × 512). Se quedaba corto para lo único que hace el panel: leer una
 * conversación. Con cuatro o cinco turnos y una tarjeta de propuesta en el medio había que scrollear
 * para ver la pregunta y la respuesta juntas. Estos 480 × 640 entran enteros en un portátil de
 * 1366×768 después de descontar los márgenes, así que nadie ve el panel recortado al abrirlo.
 */
export const TAMANO_CHAT_POR_DEFECTO: TamanoChat = { ancho: 480, alto: 640 }

/**
 * Lo más chico que se puede dejar el panel.
 *
 * No es un número redondo elegido a ojo: es lo que hace falta para que el chat siga siendo un chat.
 * Por debajo de 300 de ancho el campo de escribir y los botones de la cabecera se pisan, y por
 * debajo de 360 de alto la cabecera más el campo se comen todo y no queda ni un mensaje a la vista.
 * Un panel que no muestra ningún mensaje no está "chico", está roto.
 */
export const TAMANO_CHAT_MINIMO: TamanoChat = { ancho: 300, alto: 360 }

/**
 * Lo más grande que se puede dejar el panel, antes de recortarlo contra la ventana.
 *
 * El tope existe aunque la pantalla dé para más: el orbe es una caja flotante sobre la pantalla que
 * se está mirando, y una caja que ocupa un monitor de 4K entero dejó de ser flotante y pasó a ser un
 * modal de hecho —justo lo que este panel decidió no ser—. A 960 de ancho la conversación se lee
 * cómoda y la pantalla de atrás se sigue viendo.
 */
export const TAMANO_CHAT_MAXIMO: TamanoChat = { ancho: 960, alto: 1040 }

/**
 * El aire que el panel tiene que dejar libre contra los bordes de la ventana.
 *
 * Sale de dónde está anclado el panel en `OrbeChatIA`: `right-4` (16px) y `bottom-24` (96px, que es
 * lo que ocupa el botón del orbe más su separación). Al horizontal se le suma otro 16 para que el
 * borde izquierdo no quede pegado al canto de la pantalla cuando el panel crece; al vertical, otro
 * 16 por el borde de arriba. Si alguna de esas clases cambia en el componente, estos números cambian
 * con ella: son la misma decisión escrita dos veces y no hay forma de derivar una de la otra.
 */
export const MARGEN_CHAT = { horizontal: 32, vertical: 112 } as const

/** Dónde se recuerda el tamaño. Con prefijo del proyecto para no chocar con nada más del origen. */
export const CLAVE_TAMANO_CHAT = 'ops.chat-orbe.tamano'

/** Cuánto crece o se achica el panel por cada pulsación de flecha en el tirador. */
export const PASO_TAMANO_CHAT = 32

/** Lo mínimo que se le pide a un almacenamiento: leer y escribir una clave. Así la prueba lo finge. */
export interface AlmacenamientoSimple {
  getItem: (clave: string) => string | null
  setItem: (clave: string, valor: string) => void
}

/** Un número sirve como medida si es finito y positivo. `NaN`, `Infinity` y 0 no lo son. */
function esMedida (valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor > 0
}

/**
 * Acota una medida entre su mínimo, su máximo y el techo que impone la ventana.
 *
 * El orden importa: el techo de la ventana se aplica **al final** y gana incluso sobre el mínimo. En
 * una pantalla tan angosta que ni el mínimo entra, preferimos un panel más chico de lo usable antes
 * que uno que se sale por el costado: lo primero es incómodo, lo segundo esconde el campo de
 * escribir fuera del área visible y deja al chat sin forma de usarse.
 */
function acotarMedida (valor: number, minimo: number, maximo: number, disponible: number | null): number {
  const techo = disponible === null ? maximo : Math.min(maximo, Math.max(1, disponible))

  return Math.min(Math.max(valor, minimo), techo)
}

/**
 * Deja un tamaño dentro de los límites del panel y de lo que da la ventana.
 *
 * @param tamano el tamaño a acotar; sus medidas inválidas se reemplazan por las del defecto
 * @param ventana lo que mide el área visible, o `null` cuando todavía no se sabe (render del
 *   servidor, primer render antes de hidratar). Sin ventana solo se aplican los límites fijos.
 * @returns un tamaño siempre usable, con las dos medidas redondeadas a píxeles enteros
 */
export function acotarTamanoChat (tamano: Partial<TamanoChat>, ventana: VentanaVisible | null): TamanoChat {
  const anchoVentana = ventana !== null && esMedida(ventana.ancho) ? ventana.ancho - MARGEN_CHAT.horizontal : null
  const altoVentana = ventana !== null && esMedida(ventana.alto) ? ventana.alto - MARGEN_CHAT.vertical : null

  const ancho = esMedida(tamano.ancho) ? tamano.ancho : TAMANO_CHAT_POR_DEFECTO.ancho
  const alto = esMedida(tamano.alto) ? tamano.alto : TAMANO_CHAT_POR_DEFECTO.alto

  return {
    ancho: Math.round(acotarMedida(ancho, TAMANO_CHAT_MINIMO.ancho, TAMANO_CHAT_MAXIMO.ancho, anchoVentana)),
    alto: Math.round(acotarMedida(alto, TAMANO_CHAT_MINIMO.alto, TAMANO_CHAT_MAXIMO.alto, altoVentana))
  }
}

/**
 * Lee el tamaño recordado y lo deja listo para aplicar.
 *
 * === POR QUE HAY DOS TRATOS DISTINTOS PARA LO QUE NO ENCAJA ===
 *
 * Un valor que no se puede parsear, o que no trae dos números positivos, es un valor del que no
 * sabemos nada: puede venir de otra versión del panel, de otra aplicación del mismo origen o de
 * alguien editando el almacenamiento a mano. Ese cae al tamaño por defecto entero, porque quedarse
 * con "la mitad buena" de un dato corrupto es inventar.
 *
 * Un valor que sí trae dos números pero que hoy no entra en la ventana es distinto: es un tamaño que
 * la persona eligió y que sigue siendo válido: lo único que pasó es que achicó la ventana o cambió
 * de monitor. Ese se recorta y se aplica, y cuando vuelva la pantalla grande el valor guardado sigue
 * ahí intacto para volver a usarse. Por eso el recorte pasa acá y **no** se vuelve a guardar.
 *
 * Un valor fuera de los límites duros del panel se trata como el corrupto y no como el recortable:
 * 40.000 píxeles de ancho no es una preferencia, es un dato que nadie pudo haber producido con el
 * tirador.
 *
 * @param almacenamiento de dónde leer, o `null` si no hay ninguno disponible
 * @param ventana lo que mide el área visible, o `null` si todavía no se sabe
 * @returns un tamaño usable; nunca lanza, ni siquiera con el almacenamiento bloqueado
 */
export function leerTamanoChatGuardado (
  almacenamiento: AlmacenamientoSimple | null,
  ventana: VentanaVisible | null
): TamanoChat {
  if (almacenamiento === null) return acotarTamanoChat(TAMANO_CHAT_POR_DEFECTO, ventana)

  let crudo: string | null = null

  // En una ventana privada el simple acceso a `localStorage` lanza, y en Safari lanza también cuando
  // la cuota está llena. No hay forma de preguntar antes si se puede: hay que intentarlo y fallar.
  try {
    crudo = almacenamiento.getItem(CLAVE_TAMANO_CHAT)
  } catch {
    return acotarTamanoChat(TAMANO_CHAT_POR_DEFECTO, ventana)
  }

  if (crudo === null) return acotarTamanoChat(TAMANO_CHAT_POR_DEFECTO, ventana)

  let guardado: unknown

  try {
    guardado = JSON.parse(crudo)
  } catch {
    return acotarTamanoChat(TAMANO_CHAT_POR_DEFECTO, ventana)
  }

  if (typeof guardado !== 'object' || guardado === null) {
    return acotarTamanoChat(TAMANO_CHAT_POR_DEFECTO, ventana)
  }

  const { ancho, alto } = guardado as Partial<TamanoChat>

  if (!esMedida(ancho) || !esMedida(alto)) return acotarTamanoChat(TAMANO_CHAT_POR_DEFECTO, ventana)

  const fueraDeLimites =
    ancho < TAMANO_CHAT_MINIMO.ancho || ancho > TAMANO_CHAT_MAXIMO.ancho ||
    alto < TAMANO_CHAT_MINIMO.alto || alto > TAMANO_CHAT_MAXIMO.alto

  if (fueraDeLimites) return acotarTamanoChat(TAMANO_CHAT_POR_DEFECTO, ventana)

  return acotarTamanoChat({ ancho, alto }, ventana)
}

/**
 * Recuerda el tamaño elegido.
 *
 * Guarda el tamaño acotado a los límites fijos pero **no** a la ventana, para que achicar la ventana
 * un rato no borre para siempre la preferencia de quien trabaja en un monitor grande.
 *
 * @param almacenamiento dónde escribir, o `null` si no hay ninguno disponible
 * @param tamano el tamaño elegido
 * @returns `true` si quedó guardado; `false` si no se pudo, que no es un error que valga interrumpir
 *   nada: el chat sigue funcionando, solo que la próxima vez arranca con el tamaño por defecto
 */
export function guardarTamanoChat (almacenamiento: AlmacenamientoSimple | null, tamano: TamanoChat): boolean {
  if (almacenamiento === null) return false

  try {
    almacenamiento.setItem(CLAVE_TAMANO_CHAT, JSON.stringify(acotarTamanoChat(tamano, null)))

    return true
  } catch {
    return false
  }
}

/**
 * El almacenamiento del navegador, o `null` si no hay ninguno al que se pueda llegar.
 *
 * Existe para que el componente no repita este `try/catch`: en el servidor no hay `window`, y en una
 * ventana privada leer la propiedad `localStorage` ya lanza antes de llamar a ningún método.
 */
export function almacenamientoDelNavegador (): AlmacenamientoSimple | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}
