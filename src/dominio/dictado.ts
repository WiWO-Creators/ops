/**
 * Dictado por voz: lo que el navegador transcribe, antes de que lo vea un componente.
 *
 * Reconocer voz lo hace el navegador con `SpeechRecognition` (`webkitSpeechRecognition` en los
 * basados en Chromium). El audio NO pasa por Ops ni por la API del board: sale del navegador al
 * servicio del proveedor del navegador y vuelve como texto. Por eso el dictado no depende del
 * interruptor de IA ni gasta tokens: lo que llega aca ya es texto.
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
  network: 'El reconocimiento de voz necesita conexión y no la hubo.',
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
