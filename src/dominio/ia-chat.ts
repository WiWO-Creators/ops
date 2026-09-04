import { PARAMETRO_TAREA } from '../componentes/datos/tabla.ts'
import { esObjeto, leerCita, type Cita } from './ia.ts'

/**
 * El hilo del chat de IA de un Proyecto, y lo que hace falta para pintarlo.
 *
 * El chat **solo responde y cita**: no propone acciones y no escribe nada. Por eso aca no hay una
 * sola funcion que arme un cuerpo de escritura, y `hrefDeCita()` solo produce URLs de lectura de la
 * propia pantalla.
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
  fase: FaseMensaje
}

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

  return {
    rol: valor.rol === 'asistente' || valor.rol === 'ia' ? 'ia' : 'persona',
    texto: valor.texto,
    citas,
    fase: 'listo'
  }
}
