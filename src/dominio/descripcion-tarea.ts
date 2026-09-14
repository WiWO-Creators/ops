/**
 * La descripcion obligatoria de una Tarea, y el cuestionario que ayuda a escribirla.
 *
 * Dos cosas viven aca y las dos son puras: que cuenta como descripcion vacia, y como se arma el
 * pedido que se le manda al asistente a partir de lo que la persona contesto. Sin React y sin
 * `fetch`, que es lo que las hace probables desde `node --test` (`pruebas/descripcion-tarea.test.js`).
 *
 * === POR QUE EL VACIO NO ES `trim() === ''` ===
 *
 * Porque la descripcion se pega. De un correo, de un chat, de un Word: y de ahi vienen el espacio
 * duro (`U+00A0`) y el ancho cero (`U+200B`), que `trim()` no toca. Un campo con tres espacios duros
 * pasaria la validacion del navegador, viajaria, y el backend lo rechazaria con un 422 que en
 * pantalla se lee como "el formulario esta bien pero el servidor dice que no". El criterio de los
 * dos lados tiene que ser el mismo: este archivo es la version del navegador de
 * `CrearProceso::descripcionVacia()`.
 *
 * === POR QUE LAS PREGUNTAS SON FIJAS Y VIVEN ACA ===
 *
 * El asistente no conversa con el modelo: pregunta lo mismo siempre —tres cosas— y recien con las
 * tres respuestas juntas hace UNA llamada. Ver `IA\DescripcionDeTarea` en el board para las tres
 * razones. La consecuencia practica es que el cuestionario es datos, no red: se contesta sin
 * conexion y lo escrito no se pierde si el proveedor falla en el ultimo paso.
 */

/**
 * Maximo que acepta el campo, en caracteres.
 *
 * Es el limite defensivo del backend (`CrearProceso::descripcion()`), no el del esquema —`tbltasks`
 * es `mediumtext`—. Se repite aca para poder decirlo antes del viaje: un 422 por largo despues de
 * escribir dos mil palabras es la peor forma de enterarse.
 */
export const TOPE_DESCRIPCION = 65535

/** Maximo de una respuesta del cuestionario. El mismo que acepta `DescripcionDeTarea`. */
export const TOPE_RESPUESTA = 1000

/**
 * Todo lo que cuenta como espacio en blanco, incluido lo que `trim()` ignora.
 *
 * `\s` de JavaScript ya cubre el espacio duro y el BOM; lo que falta son los de ancho cero
 * (`U+200B` a `U+200D`) y el juntador de palabras (`U+2060`), que se cuelan al copiar de un editor
 * y no se ven en ningun lado.
 */
const SOLO_ESPACIOS = /^[\s​-‍⁠]*$/

/** Una pregunta del asistente, tal como se le muestra a la persona. */
export interface PreguntaAsistente {
  /** Identificador estable. Es la clave del mapa de respuestas, nunca se muestra. */
  clave: string
  /** Lo que el asistente pregunta, en primera persona del bot. */
  texto: string
  /** Ejemplo de respuesta. Va bajo el campo: sin el, la primera pregunta se contesta con una palabra. */
  ayuda: string
}

/**
 * Las tres preguntas, en orden.
 *
 * Son las tres del pedido —que hay que hacer, para quien, con que se da por terminada— y no cuatro
 * ni seis: el cuestionario compite con escribir la descripcion a mano, y si cuesta mas que eso nadie
 * lo abre dos veces. La tercera es la que mas aporta, porque es la que casi nunca esta escrita en
 * las descripciones que ya existen.
 */
export const PREGUNTAS_DESCRIPCION: readonly PreguntaAsistente[] = [
  {
    clave: 'que',
    texto: '¿Qué hay que hacer, en tus palabras?',
    ayuda: 'Ej: armar la grilla de contenidos de septiembre con las piezas de Instagram y LinkedIn.'
  },
  {
    clave: 'para_quien',
    texto: '¿Para quién es o quién la pidió?',
    ayuda: 'Ej: para Colbún, lo pidió la contraparte de marketing. Si no aplica, déjalo vacío.'
  },
  {
    clave: 'cierre',
    texto: '¿Con qué se da por terminada?',
    ayuda: 'Ej: cuando la grilla está aprobada y cargada en el calendario.'
  }
]

/** Un par pregunta/respuesta tal como viaja al backend. */
export interface ParDeRespuesta {
  pregunta: string
  respuesta: string
}

/** El cuerpo de `POST /ia/tareas/describir`. Las claves son las que acepta `DescripcionDeTarea`. */
export interface CuerpoRedaccion {
  titulo: string
  respuestas: ParDeRespuesta[]
  project_id?: number
}

/**
 * Si ese texto no dice nada.
 *
 * @param texto el valor crudo del campo
 * @returns `true` cuando esta vacio o es solo espacio en blanco de cualquier clase
 */
export function descripcionVacia (texto: string | null | undefined): boolean {
  if (typeof texto !== 'string') return true

  return SOLO_ESPACIOS.test(texto)
}

/**
 * Que esta mal en la descripcion que se escribio, o `null` si se puede mandar.
 *
 * Es la validacion de cortesia del cliente: la que manda es la del servidor, que rechaza con 422
 * exactamente los mismos dos casos. Decirlo antes evita el viaje y, sobre todo, deja el foco en el
 * campo en vez de mostrar un cartel arriba del formulario.
 *
 * @param texto el valor crudo del campo
 * @param queEs como nombrar la cosa en el mensaje ("La tarea", "El proceso"): lo decide el glosario
 * @returns el mensaje a mostrar junto al campo, o `null`
 */
export function errorDeDescripcion (texto: string, queEs = 'La tarea'): string | null {
  if (descripcionVacia(texto)) {
    return `${queEs} necesita una descripción. Escríbela o pide ayuda al asistente.`
  }

  if (texto.trim().length > TOPE_DESCRIPCION) {
    return `La descripción no puede pasar de ${TOPE_DESCRIPCION.toLocaleString('es-CL')} caracteres.`
  }

  return null
}

/**
 * Minimo de palabras que tiene que traer un pedido antes de dejarlo llegar al modelo.
 *
 * Cuatro y no dos: con "arreglar esto" el modelo no interpreta, inventa —y lo que inventa entra al
 * formulario con cara de dato revisado—. Cuatro palabras es lo que ocupa la frase mas corta que
 * todavia dice algo ("revisar la propuesta de Colbun"), asi que el piso corta el ruido sin obligar
 * a redactar un parrafo.
 */
export const MINIMO_PALABRAS_DETALLE = 4

/**
 * Minimo de caracteres del mismo pedido.
 *
 * Va junto al de palabras porque solo el conteo de palabras se pasa con "ver el tema con el que"
 * —cinco palabras, trece letras, cero informacion—. Los dos a la vez es lo que distingue un pedido
 * corto de uno vacio.
 */
export const MINIMO_CARACTERES_DETALLE = 25

/**
 * Que le falta al pedido para que valga la pena llamar al modelo, o `null` si ya alcanza.
 *
 * Es el requisito previo del alta con IA: sin un minimo de detalle el modelo no tiene de donde
 * sacar el para quien ni el cuando, y devuelve un formulario lleno de suposiciones que despues hay
 * que revisar campo por campo. Cuesta menos pedir tres palabras mas que desarmar eso.
 *
 * El mensaje nombra lo que falta y cuanto falta: "escribe un poco mas" no le dice a nadie si el
 * problema es el largo o el contenido.
 *
 * @param texto lo escrito en el campo de texto libre
 * @returns el mensaje a mostrar, o `null` cuando el pedido tiene detalle suficiente
 */
export function errorDeDetalle (texto: string): string | null {
  if (descripcionVacia(texto)) return 'Escribe primero qué hay que hacer.'

  // Los invisibles se sacan antes de contar: pegados desde un correo, "hola\u200b mundo" contaria
  // como una palabra mas de las que se ven.
  const limpio = texto.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim()
  const palabras = limpio === '' ? [] : limpio.split(/\s+/)

  if (palabras.length < MINIMO_PALABRAS_DETALLE) {
    const faltan = MINIMO_PALABRAS_DETALLE - palabras.length

    return `Cuéntame un poco más: falta${faltan === 1 ? '' : 'n'} ${faltan} palabra${faltan === 1 ? '' : 's'}. `
      + 'Di qué hay que hacer, para quién y cuándo.'
  }

  if (limpio.length < MINIMO_CARACTERES_DETALLE) {
    return `Muy corto para interpretarlo: escribe al menos ${MINIMO_CARACTERES_DETALLE} caracteres `
      + `(llevas ${limpio.length}). Agrega para quién es o con qué se da por terminada.`
  }

  return null
}

/**
 * Arma el cuerpo del pedido al asistente con lo que se contesto.
 *
 * Las respuestas en blanco se caen: una persona puede no tener nada que decir de "para quién es", y
 * mandar el par vacio solo gasta tokens en una linea que dice `R: `. Cada respuesta se recorta al
 * tope que el backend acepta, para que un pegado largo no vuelva como 422 en lugar de como texto.
 *
 * @param titulo el nombre de la Tarea tal como esta en el formulario; puede ir vacio
 * @param respuestas lo contestado, por `clave` de `PREGUNTAS_DESCRIPCION`
 * @param proyectoId el Espacio de la Tarea, si el formulario ya eligio uno
 * @returns el cuerpo listo para `POST /ia/tareas/describir`, o `null` si no hay ni una respuesta
 *          util, que es el unico caso donde llamar al modelo seria pedirle que invente la tarea
 */
export function cuerpoDeRedaccion (
  titulo: string,
  respuestas: Readonly<Record<string, string>>,
  proyectoId?: number | null
): CuerpoRedaccion | null {
  const pares = PREGUNTAS_DESCRIPCION
    .map((pregunta) => ({
      pregunta: pregunta.texto,
      respuesta: (respuestas[pregunta.clave] ?? '').trim().slice(0, TOPE_RESPUESTA)
    }))
    .filter((par) => !descripcionVacia(par.respuesta))

  if (pares.length === 0) return null

  return {
    titulo: titulo.trim(),
    respuestas: pares,
    ...(typeof proyectoId === 'number' && Number.isSafeInteger(proyectoId) && proyectoId > 0
      ? { project_id: proyectoId }
      : {})
  }
}
