import { PARAMETRO_TAREA } from '../componentes/datos/tabla.ts'
import {
  esObjeto, leerAccion, leerCita, leerPregunta,
  type AccionIA, type Cita, type PasoIA, type PreguntaIA
} from './ia.ts'

/**
 * El hilo del chat de WiBot, y lo que hace falta para pintarlo.
 *
 * El chat responde, cita y —con el interruptor de escrituras encendido— **propone** o **pregunta**.
 * Preguntar es lo que hace cuando le falta un dato que cambia el efecto de la escritura: en vez de
 * asumirlo deja opciones, ese turno no trae tarjeta para esa accion, y la respuesta entra al hilo
 * como un mensaje mas de la persona. Proponer no es
 * escribir: lo que llega es una tarjeta con un id, y confirmarla es un `POST` que **solo manda ese
 * id**. Ni una funcion de este archivo arma un cuerpo de escritura, y `hrefDeCita()` sigue
 * produciendo unicamente URLs de lectura. El QUE de la escritura vive congelado en la fila del
 * servidor desde que se propuso; el navegador no puede cambiarlo ni queriendo, que es exactamente lo
 * que hace que la confirmacion signifique algo.
 *
 * El hilo vive a nivel de modulo y no en el componente: el chat se cierra y se vuelve a abrir, y
 * navegar de una pantalla a otra desmonta lo que haya montado. Con el estado dentro del componente
 * la conversacion se perderia en cada ida y vuelta.
 *
 * El hilo global y los de cada proyecto se guardan por separado. Abrir un proyecto nunca usa
 * mensajes de otro como contexto ni borra la conversación global.
 */

/**
 * En que punto de su vida esta un mensaje.
 *
 * Solo los de la IA pasan por los cuatro; los de la persona nacen `listo`. `interrumpido` es el
 * mensaje al que se le corto el stream por cambiar de pestaña: se conserva lo que llego, porque
 * media respuesta con su marca es mas util que una burbuja vacia.
 */
export type FaseMensaje = 'generando' | 'listo' | 'error' | 'interrumpido'

export interface Mensaje {
  rol: 'persona' | 'ia'
  texto: string
  /** Verificadas por el servidor contra la base. Los de la persona siempre traen `[]`. */
  citas: Cita[]
  /**
   * Lo ultimo que WiBot dijo estar haciendo, o `null`.
   *
   * Solo vive mientras la burbuja esta en `generando`: es el indicador, no historia. Un backend sin
   * los eventos `paso` —o el interruptor de escrituras apagado, que no cambia esto— deja `null`, y
   * la burbuja se queda con el texto fijo de siempre.
   */
  paso: PasoIA | null
  /** Las escrituras que este mensaje dejo propuestas. Vacio en todo lo demas. */
  acciones: AccionIA[]
  /**
   * Lo que WiBot necesito preguntar antes de proponer. Vacio en todo lo demas.
   *
   * Un mensaje que trae preguntas **no trae la propuesta de esa accion**: la pregunta cierra el
   * turno. La respuesta no se guarda aca porque no es un campo de este mensaje sino el mensaje
   * siguiente del hilo —ver `respuestaAPreguntas()`—.
   */
  preguntas: PreguntaIA[]
  fase: FaseMensaje
}

/** Segundos que una propuesta sigue siendo confirmable. El del servidor manda; esto solo cuenta. */
export const EXPIRACION_SEGUNDOS = 30 * 60

export interface Hilo {
  mensajes: Mensaje[]
  /**
   * Si ya se leyo el hilo guardado con `GET /ia/chat`.
   *
   * Sin esta marca, cada vez que se abre el chat se repetiria el GET y pisaria lo que hay en
   * memoria — incluida una respuesta interrumpida que el servidor no guardo con esa marca.
   */
  cargado: boolean
}

/** Un tramo de la respuesta ya partida: o prosa, o una cita para enlazar. */
export type TramoRespuesta = { texto: string } | { cita: Cita }

/**
 * Tope del campo de pregunta, aplicado con el `maxLength` nativo del `<textarea>`.
 *
 * El borde de verdad esta en la respuesta —de eso se encarga `leerEventoIA()`—; esto solo evita
 * mandar un texto absurdo que el proveedor va a rechazar despues de cobrarlo.
 */
export const LARGO_MAXIMO_PREGUNTA = 1000

/** Marcador de cita como lo reescribe el servidor: `[1]`, `[12]`. El indice es 1-based. */
const MARCADOR = /^\[(\d+)\]$/

/** El mismo marcador como separador; el grupo hace que `split` conserve los marcadores. */
const SEPARADOR = /(\[\d+\])/

/** Un marcador a medio llegar al final del texto: `[`, `[3`. */
const COLGANTE = /\[\d*$/

/**
 * Conversaciones vivas de la pestaña del navegador, separadas por proyecto y ámbito global.
 *
 * Se recarga la pagina y se va, como corresponde: lo que persiste de verdad es lo que el servidor
 * guarda y devuelve en el `GET`. Esto es la copia con la que se pinta mientras tanto.
 */
const HILOS = new Map<number | undefined, Hilo>()

/**
 * Devuelve la conversacion en memoria.
 *
 * @param proyectoId proyecto del hilo; omitido para la conversación global
 * @returns el hilo guardado; vacio y sin cargar la primera vez
 */
export function leerHilo (proyectoId?: number): Hilo {
  return HILOS.get(proyectoId) ?? { mensajes: [], cargado: false }
}

/**
 * Guarda la conversacion en memoria.
 *
 * @param hilo el hilo completo, ya con los mensajes nuevos
 * @param proyectoId proyecto del hilo; omitido para la conversación global
 */
export function guardarHilo (hilo: Hilo, proyectoId?: number): void {
  HILOS.set(proyectoId, hilo)
}

/**
 * Parte el texto de una respuesta en tramos de prosa y citas.
 *
 * Existe para pintar los enlaces sin `dangerouslySetInnerHTML`: el texto lo escribio un modelo y
 * meterlo como HTML seria confiar en el ultimo lugar donde hay que confiar.
 *
 * **Retiene el marcador incompleto del final** (`[`, `[3`) y no lo devuelve. Mientras el stream
 * escribe, un marcador cae partido entre dos chunks todo el tiempo; sin esta retencion, el `[3`
 * aparece como texto literal durante un frame y desaparece al llegar el `]`. Ese parpadeo es lo que
 * delata que la respuesta se esta armando a pedazos.
 *
 * Un marcador que apunta a una cita que no existe —`[9]` con dos citas— **queda como texto**: es lo
 * que el servidor ya hace con `citas_descartadas`, y un enlace a la nada es peor que un `[9]` suelto.
 *
 * @param texto la respuesta tal como llego, completa o a medias
 * @param citas las citas verificadas, en el orden en que el servidor numero los marcadores
 * @returns los tramos en orden, con la prosa contigua ya unida
 */
export function partirConCitas (texto: string, citas: Cita[]): TramoRespuesta[] {
  const util = texto.replace(COLGANTE, '')
  const tramos: TramoRespuesta[] = []

  for (const parte of util.split(SEPARADOR)) {
    if (parte === '') continue

    const cita = citaDeMarcador(parte, citas)

    if (cita !== null) {
      tramos.push({ cita })
      continue
    }

    const ultimo = tramos[tramos.length - 1]

    if (ultimo !== undefined && 'texto' in ultimo) ultimo.texto += parte
    else tramos.push({ texto: parte })
  }

  return tramos
}

/**
 * La cita a la que apunta un tramo, si el tramo es un marcador y la cita existe.
 *
 * @param parte un tramo del `split`
 * @param citas las citas verificadas
 * @returns la cita, o `null` si el tramo es prosa o el numero no corresponde a ninguna
 */
function citaDeMarcador (parte: string, citas: Cita[]): Cita | null {
  const encontrado = MARCADOR.exec(parte)

  if (encontrado?.[1] === undefined) return null

  return citas[Number(encontrado[1]) - 1] ?? null
}

/**
 * Destino de una cita: una ruta absoluta del panel, o `null` si la cita no tiene a donde ir.
 *
 * Antes devolvia `?params` sobre la pantalla vigente, porque el chat solo existia dentro de la ficha
 * de un Espacio y una cita era siempre un salto dentro de esa misma ficha. Con el chat en todo el
 * panel esa suposicion se cae dos veces: la persona puede estar en cualquier pantalla, y **la cita
 * puede ser de otro Espacio**. Un `?tab=hitos` pegado a la URL vigente abriria la pestaña de Hitos
 * del Espacio equivocado, que es exactamente el fallo mudo que estas citas tienen que evitar: un
 * enlace prolijo que lleva a otro lado y al que la persona le cree.
 *
 * Por eso cada tipo va a la pantalla que lo sabe resolver por su id y por nada mas:
 *
 *   - `tarea` al listado global con `?tarea={id}`, que monta el unico detalle de Tarea del producto
 *     y lo pide por id: sirva quien sirva de Espacio, abre la que es.
 *   - `espacio` a su ficha.
 *
 * `discusion` e `hito` devuelven `null` **a proposito**: solo existen como pestaña de la ficha de un
 * Espacio y la cita no dice de cual. Mientras el contrato no traiga ese id, se pintan como texto sin
 * enlace, que es lo mismo que ya se hace con un marcador que no tiene cita.
 *
 * @param cita la cita a enlazar
 * @returns la ruta absoluta, o `null` si el destino no se puede resolver con lo que trae la cita
 */
export function hrefDeCita (cita: Cita): string | null {
  if (cita.tipo === 'tarea') return `/procesos?${PARAMETRO_TAREA}=${cita.id}`
  if (cita.tipo === 'espacio') return `/espacios/${cita.id}`

  return null
}

/**
 * `true` si la tarjeta todavia ofrece Confirmar y Rechazar.
 *
 * El reloj es del navegador y **no manda**: el servidor recalcula la caducidad al leer y la vuelve
 * a comprobar al confirmar, asi que lo peor que puede pasar con un reloj corrido es que la tarjeta
 * ofrezca un boton que responde `409`. Al reves —esconder un boton que todavia sirve— seria peor,
 * pero tampoco: los dos relojes hablan del mismo instante ISO.
 *
 * @param accion la propuesta
 * @param ahora milisegundos, normalmente `Date.now()`
 */
export function esResoluble (accion: AccionIA, ahora: number): boolean {
  return accion.estado === 'pendiente' && segundosParaExpirar(accion, ahora) > 0
}

/**
 * Segundos que le quedan a una propuesta, o `0` si ya caduco o no trae instante.
 *
 * @param accion la propuesta
 * @param ahora milisegundos
 */
export function segundosParaExpirar (accion: AccionIA, ahora: number): number {
  if (accion.expira_en === null) return 0

  const limite = Date.parse(accion.expira_en)

  if (Number.isNaN(limite)) return 0

  return Math.max(0, Math.ceil((limite - ahora) / 1000))
}

/**
 * El estado con el que se pinta la tarjeta, ya con la caducidad aplicada del lado del navegador.
 *
 * El servidor manda `pendiente` en el instante en que la emite; treinta minutos despues, sin que
 * nadie haya pedido nada, esa misma tarjeta tiene que leerse como caducada. Sin esto habria que
 * recargar la pagina para enterarse.
 *
 * @param accion la propuesta
 * @param ahora milisegundos
 */
export function estadoDeAccion (accion: AccionIA, ahora: number): AccionIA['estado'] {
  return accion.estado === 'pendiente' && !esResoluble(accion, ahora) ? 'expirada' : accion.estado
}

/**
 * Reemplaza una accion dentro del hilo por su version resuelta.
 *
 * Pura y sin identidad compartida: devuelve mensajes nuevos, que es lo que hace que React repinte.
 * Se usa despues de confirmar o rechazar, con lo que devolvio el servidor —nunca con lo que el
 * navegador supone que paso—.
 *
 * @param mensajes el hilo actual
 * @param accion la accion tal como volvio del `POST`
 * @returns el hilo con esa accion actualizada; el mismo array si no estaba
 */
export function conAccionResuelta (mensajes: Mensaje[], accion: AccionIA): Mensaje[] {
  return mensajes.map((mensaje) => (
    mensaje.acciones.some((previa) => previa.id === accion.id)
      ? { ...mensaje, acciones: mensaje.acciones.map((previa) => previa.id === accion.id ? accion : previa) }
      : mensaje
  ))
}

/**
 * Lo que la persona contesto a las preguntas de un mensaje, o `null` si todavia no contesto.
 *
 * **No hay estado de "pregunta contestada" en ningun lado, y no hace falta inventarlo.** La pregunta
 * cierra el turno y la respuesta es el mensaje siguiente de la persona, asi que el propio hilo ya
 * dice si se contesto. Derivarlo en vez de guardarlo es lo que hace que la tarjeta siga bloqueada
 * despues de cerrar y volver a abrir el chat —el componente se desmonta, el hilo vive en el modulo—
 * y tambien despues de recargar y releer el hilo guardado del servidor.
 *
 * Contestar cierra **todas** las preguntas del turno, aunque la persona haya elegido en una sola. No
 * es un atajo: al mandar el mensaje el turno ya se cerro y el modelo respondio con un contexto
 * nuevo, asi que un boton que siguiera vivo mandaria una respuesta a una pregunta que ya no esta
 * sobre la mesa —y haria proponer dos veces, que es exactamente lo que este bloqueo evita—.
 *
 * @param mensajes el hilo completo
 * @param indice posicion del mensaje que trae las preguntas
 * @returns el texto que la persona mando despues, o `null` si todavia no mando nada
 */
export function respuestaAPreguntas (mensajes: Mensaje[], indice: number): string | null {
  const siguiente = mensajes[indice + 1]

  return siguiente !== undefined && siguiente.rol === 'persona' ? siguiente.texto : null
}

/**
 * Lee el hilo guardado que devuelve `GET /ia/chat`.
 *
 * Es un trust boundary como el de `leerEventoIA()`: el cuerpo viene de la red y sus textos los
 * escribio un modelo. Un mensaje que no se entiende se descarta y los demas sobreviven; un cuerpo
 * entero que no tiene la forma del contrato devuelve `[]`, que la interfaz muestra como hilo nuevo.
 *
 * Traduce el rol de la API al del panel: la API dice `usuario`/`asistente` y aca se dice
 * `persona`/`ia`, que es como se llaman en el glosario del producto.
 *
 * @param valor el `data` del envelope, sin validar
 * @returns los mensajes en orden, todos en fase `listo`
 */
export function leerMensajesGuardados (valor: unknown): Mensaje[] {
  if (!esObjeto(valor) || !Array.isArray(valor.mensajes)) return []

  return valor.mensajes.map(leerMensaje).filter((mensaje) => mensaje !== null)
}

/**
 * Valida un mensaje suelto del hilo guardado.
 *
 * @param valor una entrada del array `mensajes`
 * @returns el mensaje, o `null` si no trae texto
 */
function leerMensaje (valor: unknown): Mensaje | null {
  if (!esObjeto(valor) || typeof valor.texto !== 'string') return null

  const citas = Array.isArray(valor.citas)
    ? valor.citas.map(leerCita).filter((cita) => cita !== null)
    : []

  const acciones = Array.isArray(valor.acciones)
    ? valor.acciones.map(leerAccion).filter((accion) => accion !== null)
    : []

  const preguntas = Array.isArray(valor.preguntas)
    ? valor.preguntas.map(leerPregunta).filter((pregunta) => pregunta !== null)
    : []

  return {
    rol: valor.rol === 'asistente' || valor.rol === 'ia' ? 'ia' : 'persona',
    texto: valor.texto,
    citas,
    // El paso es del momento: un hilo guardado no lo trae y no tendria sentido que lo trajera.
    paso: null,
    acciones,
    preguntas,
    fase: 'listo'
  }
}
