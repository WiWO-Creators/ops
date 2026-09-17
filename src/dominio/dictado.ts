/**
 * Dictado por voz: lo que el navegador transcribe, antes de que lo vea un componente.
 *
 * **Hay dos motores y no uno.** El primero es el del navegador (`SpeechRecognition`, o
 * `webkitSpeechRecognition` en los basados en Chromium): reconoce mientras se habla, el audio no
 * pasa por Ops y no cuesta nada. El problema es que declarar la API no significa poder usarla: en
 * Brave y en los Chromium abiertos el servicio de voz de Google viene sin credenciales, la API
 * existe y cada intento muere con `network`. Firefox y el WebKit de iOS no la traen siquiera.
 *
 * Para esos casos esta el segundo motor: grabar con `MediaRecorder` y mandar el audio a
 * `POST /ia/dictado`, que lo transcribe con Whisper y devuelve el texto. Eso si gasta GPU de
 * Replicate y vive bajo el interruptor de IA, asi que es el respaldo y no el camino principal.
 *
 * Cual se usa no lo elige la persona: {@see MOTIVOS_SIN_MOTOR} nombra los fallos que significan
 * "este navegador no puede reconocer voz", y ante uno de ellos el hook cambia de motor sin pedir
 * otro clic y no vuelve a intentar el del navegador en lo que queda de sesion.
 *
 * El motor entrega dos clases de resultado y confundirlas es el error tipico: los `isFinal` son
 * definitivos y se acumulan, los demas son una apuesta que el motor reescribe en el siguiente
 * evento. Si se acumulan los dos, la frase sale triplicada. Por eso el parcial vive aparte y se
 * pisa entero cada vez, y solo `componerDictado()` sabe como se juntan.
 *
 * Este modulo no importa React a proposito: asi `node --test` lo prueba sin navegador.
 */

/**
 * Idioma con el que se le pide al motor reconocer. Etiqueta BCP 47, no un nombre de idioma.
 *
 * Configurable porque el motor rinde distinto con `es-CL` que con `es-ES` —cambia el vocabulario y
 * la puntuacion que arriesga—, y el equipo de Ops dicta en español de Chile.
 */
export const IDIOMA_DICTADO = process.env.NEXT_PUBLIC_IDIOMA_DICTADO ?? 'es-CL'

/** La ruta del board que transcribe el audio del respaldo. */
export const RUTA_DICTADO = 'ia/dictado'

/** El campo del multipart, tal como lo espera `EntradaDeDictado` del board. */
export const CAMPO_DICTADO = 'audio'

/**
 * Tope del audio del respaldo: 8 MB.
 *
 * El mismo numero que `EntradaDeDictado::MAX_BYTES` en el board. Se comprueba de los dos lados a
 * proposito: aca para no hacer subir megas que van a terminar en un 413, y alla porque un tope que
 * solo vive en el navegador no es un tope.
 */
export const MAXIMO_BYTES_DICTADO = 8 * 1024 * 1024

/**
 * Corte automatico del respaldo: 120 segundos.
 *
 * El motor del navegador se puede dejar abierto sin costo, pero el respaldo se paga por segundo de
 * GPU. Dos minutos son mas de lo que se dicta en un campo de pregunta, y el corte evita que un
 * microfono olvidado abierto se convierta en una factura.
 */
export const SEGUNDOS_MAXIMOS_DICTADO = 120

/**
 * Los fallos del motor del navegador que significan "este navegador no puede reconocer voz".
 *
 * No son errores de la persona ni cosas que se arreglen reintentando: son navegadores sin el
 * servicio de voz detras de la API. Ante uno de ellos se cambia al respaldo.
 *
 * `not-allowed` y `audio-capture` NO estan aca: esos son el permiso del microfono y la falta de
 * microfono, y con el respaldo fallarian igual porque `getUserMedia` necesita lo mismo.
 */
export const MOTIVOS_SIN_MOTOR = ['network', 'service-not-allowed', 'language-not-supported', 'bad-grammar']

/**
 * Si este fallo del motor del navegador justifica cambiarse al respaldo.
 *
 * @param codigo el `error` del evento del motor
 */
export function pideRespaldo (codigo: string): boolean {
  return MOTIVOS_SIN_MOTOR.includes(codigo)
}

/** Nombre del archivo que se manda al board, con la extension que corresponde a su tipo. */
export function nombreDeDictado (mime: string): string {
  return `dictado.${mime.startsWith('audio/mp4') ? 'm4a' : 'webm'}`
}

/** Lo que el motor devuelve en cada evento, ya separado en definitivo y apuesta. */
export interface TrozosDictados {
  /** Lo que el motor ya no va a reescribir. Se acumula. */
  confirmado: string
  /** La apuesta en curso. Se reemplaza entera en el evento siguiente. */
  parcial: string
}

/**
 * La forma del motor del navegador, reducida a lo que este modulo usa.
 *
 * Se declara a mano porque `SpeechRecognition` no esta en las librerias de TypeScript que trae el
 * proyecto (es una API de borrador del WHATWG que no todos los navegadores implementan).
 */
export interface MotorDeDictado {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((evento: EventoDeDictado) => void) | null
  onerror: ((evento: { error: string }) => void) | null
  onend: (() => void) | null
}

/** El evento de resultados, con la lista indexada que expone la API. */
export interface EventoDeDictado {
  resultIndex: number
  results: {
    length: number
    [indice: number]: { isFinal: boolean, 0: { transcript: string } }
  }
}

interface VentanaConDictado {
  SpeechRecognition?: new () => MotorDeDictado
  webkitSpeechRecognition?: new () => MotorDeDictado
}

/**
 * Dice si este navegador sabe reconocer voz, sin abrir el microfono ni pedir permiso.
 *
 * Se consulta aparte de {@link crearMotorDeDictado} porque decidir si el boton existe pasa en cada
 * render, y construir un motor para tirarlo despues es basura que el recolector tiene que limpiar.
 *
 * @returns `false` en el servidor y en los navegadores sin la API (Firefox, WebKit de iOS)
 */
export function hayDictado (): boolean {
  if (typeof window === 'undefined') return false

  const ventana = window as unknown as VentanaConDictado

  return (ventana.SpeechRecognition ?? ventana.webkitSpeechRecognition) !== undefined
}

/**
 * Crea un motor listo para dictar, o `null` si el navegador no sabe reconocer voz.
 *
 * Devolver `null` en vez de lanzar es deliberado: quien lo llama esconde el boton en vez de mostrar
 * uno que no puede funcionar. Firefox y los WebKit de iOS caen en ese caso.
 *
 * @returns el motor configurado en {@link IDIOMA_DICTADO}, o `null` si no hay soporte
 */
export function crearMotorDeDictado (): MotorDeDictado | null {
  if (typeof window === 'undefined') return null

  const ventana = window as unknown as VentanaConDictado
  const Motor = ventana.SpeechRecognition ?? ventana.webkitSpeechRecognition
  if (Motor === undefined) return null

  const motor = new Motor()
  motor.lang = IDIOMA_DICTADO
  // Sin `continuous`, el motor se corta solo en la primera pausa y dictar un parrafo obliga a
  // apretar el boton en cada coma.
  motor.continuous = true
  // El parcial es lo que deja ver que el microfono esta vivo mientras se habla.
  motor.interimResults = true

  return motor
}

/**
 * Reparte los resultados de un evento del motor en definitivo y apuesta.
 *
 * Recorre desde `resultIndex` porque los resultados anteriores ya se leyeron en eventos previos:
 * releerlos desde cero es la otra forma de duplicar la frase.
 *
 * @param evento el evento tal como lo entrega el motor
 * @returns lo confirmado en ESTE evento (hay que acumularlo) y el parcial en curso (hay que pisarlo)
 */
export function leerTrozos (evento: EventoDeDictado): TrozosDictados {
  let confirmado = ''
  let parcial = ''

  for (let indice = evento.resultIndex; indice < evento.results.length; indice += 1) {
    const resultado = evento.results[indice]
    if (resultado === undefined) continue

    const texto = resultado[0]?.transcript ?? ''
    if (resultado.isFinal) confirmado += texto
    else parcial += texto
  }

  return { confirmado, parcial }
}

/**
 * Une lo confirmado con la apuesta en curso.
 *
 * Existe porque el motor no promete espacios en los bordes: entrega `'de la semana'` y despues
 * `'y el siguiente'`, y pegarlos de frente da `'semanay'`. Se mete un espacio solo cuando ninguno de
 * los dos lados lo trae, asi el motor que si lo manda no termina con dos.
 *
 * @param confirmado lo que el motor ya no va a reescribir
 * @param parcial    la apuesta en curso
 * @returns las dos partes unidas con un solo espacio entre ellas
 */
export function unirDictado (confirmado: string, parcial: string): string {
  if (confirmado === '' || parcial === '') return confirmado + parcial

  const pegado = /\s$/.test(confirmado) || /^\s/.test(parcial)

  return pegado ? confirmado + parcial : `${confirmado} ${parcial}`
}

/**
 * Arma el texto que se ve en el campo mientras se dicta.
 *
 * Existe porque el campo tiene tres dueños a la vez: lo que la persona habia escrito a mano antes de
 * apretar el microfono, lo que el motor ya confirmo y la apuesta en curso. El orden es siempre ese y
 * el resultado se recorta al largo que acepta el campo, porque el motor no sabe nada de ese limite y
 * el `maxLength` del textarea no frena lo que se escribe por codigo.
 *
 * @param previo   lo que habia en el campo cuando arranco el dictado
 * @param dictado  lo acumulado por el motor mas la apuesta en curso, ya unidos
 * @param maximo   largo maximo que acepta el campo, en caracteres
 * @returns el texto a mostrar, nunca mas largo que `maximo`
 */
export function componerDictado (previo: string, dictado: string, maximo: number): string {
  const limpio = dictado.trim().replace(/\s+/g, ' ')
  if (limpio === '') return previo.slice(0, maximo)

  const base = previo.trimEnd()
  const junto = base === '' ? limpio : `${base} ${limpio}`

  return junto.slice(0, maximo)
}

/** Los fallos del motor que tienen una salida distinta para quien dicta. */
const MENSAJES_DE_ERROR: Record<string, string> = {
  'not-allowed': 'El navegador bloqueó el micrófono. Permítelo en el candado de la barra de direcciones.',
  'service-not-allowed': 'El navegador bloqueó el micrófono. Permítelo en el candado de la barra de direcciones.',
  'audio-capture': 'No se encontró ningún micrófono conectado.',
  'no-speech': 'No se escuchó nada. Acércate al micrófono y vuelve a intentarlo.',
  network: 'Este navegador no trae el servicio de reconocimiento de voz.',
  aborted: ''
}

/**
 * Traduce el codigo de error del motor a algo que se pueda leer en pantalla.
 *
 * `aborted` devuelve cadena vacia: es lo que llega cuando alguien para el dictado a mano, y avisar
 * de un error ahi seria mentir.
 *
 * @param codigo el `error` del evento del motor
 * @returns el mensaje en español, o cadena vacia si no hay nada que avisar
 */
export function mensajeDeErrorDeDictado (codigo: string): string {
  return MENSAJES_DE_ERROR[codigo] ?? 'El dictado se cortó por un problema del navegador.'
}
