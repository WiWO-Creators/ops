import { PARAMETRO_TAREA } from '../componentes/datos/tabla.ts'
import { esObjeto, leerAccion, leerCita, type AccionIA, type Cita, type PasoIA } from './ia.ts'

/**
 * El hilo del chat de IA de un Proyecto, y lo que hace falta para pintarlo.
 *
 * El chat responde, cita y —con el interruptor de escrituras encendido— **propone**. Proponer no es
 * escribir: lo que llega es una tarjeta con un id, y confirmarla es un `POST` que **solo manda ese
 * id**. Ni una funcion de este archivo arma un cuerpo de escritura, y `hrefDeCita()` sigue
 * produciendo unicamente URLs de lectura de la propia pantalla. El QUE de la escritura vive
 * congelado en la fila del servidor desde que se propuso; el navegador no puede cambiarlo ni
 * queriendo, que es exactamente lo que hace que la confirmacion signifique algo.
 *
 * El hilo vive en un `Map` a nivel de modulo y no en la pagina: `Pestanas` monta solo la pestaña
 * activa, asi que cambiar a "Tareas" y volver **desmonta y remonta el panel**. Con el estado en el
 * componente, la conversacion se perderia en cada ida y vuelta; subirlo a `espacios/[id]/page.tsx`
 * obligaria a montar el chat siempre, que es justo lo que la pestaña evita.
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
  fase: FaseMensaje
}

/**
 * Herramientas cuya tarjeta se pinta en tono de peligro.
 *
 * Las dos mandan a la papelera y **ninguna borra de verdad**: se restauran durante 30 dias. El tono
 * no dice "irreversible", dice "leelo dos veces", y por eso la tarjeta acompaña el tono con la
 * linea que explica que se puede deshacer. Un rojo sin esa linea asusta y no informa.
 */
const HERRAMIENTAS_DE_BORRADO = ['eliminar_tarea', 'eliminar_espacio']

/** Segundos que una propuesta sigue siendo confirmable. El del servidor manda; esto solo cuenta. */
export const EXPIRACION_SEGUNDOS = 30 * 60

export interface Hilo {
  mensajes: Mensaje[]
  /**
   * Si ya se leyo el hilo guardado con `GET /ia/proyectos/{id}/chat`.
   *
   * Sin esta marca, cada vuelta a la pestaña repetiria el GET y pisaria lo que hay en memoria —
   * incluida una respuesta interrumpida que el servidor no guardo con esa marca.
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
 * Hilos vivos, por id de Proyecto.
 *
 * ponytail: sin desalojo. Son 275 Proyectos en produccion y un hilo pesa lo que su texto; el dia que
 * un panel abierto durante horas moleste, se poda por antiguedad.
 */
const HILOS = new Map<number, Hilo>()

/**
 * Devuelve el hilo de un Proyecto, creandolo vacio la primera vez.
 *
 * @param proyectoId id del Proyecto
 * @returns el hilo guardado en memoria; nunca `undefined`
 */
export function leerHilo (proyectoId: number): Hilo {
  return HILOS.get(proyectoId) ?? { mensajes: [], cargado: false }
}

/**
 * Guarda el hilo de un Proyecto.
 *
 * @param proyectoId id del Proyecto
 * @param hilo el hilo completo, ya con los mensajes nuevos
 */
export function guardarHilo (proyectoId: number, hilo: Hilo): void {
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
 * Destino de una cita, conservando el resto de la vista.
 *
 * Se copian los parametros vigentes —la pestaña, los filtros, la pagina de la tabla— porque una cita
 * es un salto dentro de la misma pantalla: perder el filtro por el que la persona estaba mirando
 * seria reiniciarle la vista para mostrarle una tarea.
 *
 * La `tarea` **no cambia de pestaña**: escribe `?tarea={id}` y el modal se abre encima del chat, asi
 * que cerrarlo devuelve a `?tab=ia` con el hilo intacto.
 *
 * `hito` solo cambia de pestaña: `PanelHitos` todavia no lee un `?hito={id}`, y agregarlo no es de
 * este frente. Queda anotado como limitacion conocida.
 *
 * @param cita la cita a enlazar
 * @param params los parametros vigentes de la URL
 * @returns la URL relativa, siempre con `?` adelante
 */
export function hrefDeCita (cita: Cita, params: URLSearchParams): string {
  const siguientes = new URLSearchParams(params.toString())
  const id = String(cita.id)

  if (cita.tipo === 'tarea') {
    siguientes.set(PARAMETRO_TAREA, id)
  } else if (cita.tipo === 'discusion') {
    // `discusion` es el parametro que ya lee `PanelDiscusiones`; el `tab` es el de `Pestanas`.
    siguientes.set('tab', 'discusiones')
    siguientes.set('discusion', id)
  } else if (cita.tipo === 'hito') {
    siguientes.set('tab', 'hitos')
  } else {
    // El propio Proyecto: su ficha es la primera pestaña.
    siguientes.set('tab', 'descripcion')
  }

  return `?${siguientes.toString()}`
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

/** `true` si la propuesta manda algo a la papelera y la tarjeta va en tono de peligro. */
export function esBorrado (accion: AccionIA): boolean {
  return HERRAMIENTAS_DE_BORRADO.includes(accion.herramienta)
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
 * Lee el hilo guardado que devuelve `GET /ia/proyectos/{id}/chat`.
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

  return {
    rol: valor.rol === 'asistente' || valor.rol === 'ia' ? 'ia' : 'persona',
    texto: valor.texto,
    citas,
    // El paso es del momento: un hilo guardado no lo trae y no tendria sentido que lo trajera.
    paso: null,
    acciones,
    fase: 'listo'
  }
}
