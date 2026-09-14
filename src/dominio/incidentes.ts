import { GLOSARIO } from './glosario.ts'
import type { TonoInsignia } from '@/componentes/presentadores/Insignia'
import type { Incidente, OrigenIncidente, SujetoIncidente } from '@/datos/recursos'

/**
 * Como se nombra en pantalla a cada sujeto de un incidente.
 *
 * `proceso` sale del glosario y no escrito a mano: es el mismo recurso que el resto del panel
 * muestra como "Tarea", y un renombre futuro tiene que alcanzar tambien a esta pantalla.
 */
const SUJETOS: Record<SujetoIncidente, string> = {
  staff: 'Colaborador',
  contacto: 'Contacto',
  proceso: GLOSARIO.proceso.singular
}

/**
 * Quien estaba detras del error, en una linea.
 *
 * Devuelve `null` cuando la API no pudo atribuir la peticion a nadie —se cayo sin sesion, o antes de
 * resolverla—, para que la pantalla diga eso en vez de inventar un nombre. Vive aca y no en la
 * pagina porque el listado y el detalle muestran el mismo dato y tienen que decirlo igual.
 *
 * @param incidente la fila, o el detalle: solo se leen los tres campos del sujeto
 * @returns el sujeto listo para pintar, o `null` si el incidente no tiene ninguno
 */
export function describirSujeto (
  incidente: Pick<Incidente, 'sujeto_tipo' | 'sujeto_id' | 'sujeto_nombre'>
): string | null {
  if (incidente.sujeto_tipo === null) return null

  const tipo = SUJETOS[incidente.sujeto_tipo] ?? incidente.sujeto_tipo
  const nombre = incidente.sujeto_nombre ?? (incidente.sujeto_id === null ? null : `#${incidente.sujeto_id}`)

  return nombre === null ? tipo : `${tipo}: ${nombre}`
}

/**
 * Como se nombra y se pinta cada origen.
 *
 * El tono no es decorativo: `api` es un 500 con traza del servidor y es el caso mas grave, mientras
 * que uno del panel o del portal puede ser una pantalla que no se dibujo. Verlos distintos en el
 * listado ahorra abrir filas para descubrir de que tipo era cada una.
 */
const ORIGENES: Record<OrigenIncidente, { etiqueta: string, tono: TonoInsignia }> = {
  api: { etiqueta: 'API', tono: 'peligro' },
  panel: { etiqueta: 'Panel', tono: 'aviso' },
  portal: { etiqueta: 'Portal', tono: 'neutro' }
}

/**
 * El origen de un incidente, listo para pintar.
 *
 * Un origen que no este en la tabla se muestra tal cual y en neutro: la API puede empezar a
 * registrar un origen nuevo antes de que el panel lo conozca, y esconderlo seria peor que
 * mostrarlo sin nombre bonito.
 *
 * @param origen el valor que devolvio la API
 * @returns la etiqueta y el tono de la insignia
 */
export function describirOrigen (origen: OrigenIncidente): { etiqueta: string, tono: TonoInsignia } {
  return ORIGENES[origen] ?? { etiqueta: origen, tono: 'neutro' }
}

/**
 * Lo que la API pone delante del mensaje cuando el panel reporta una respuesta suya: el estado HTTP
 * y el codigo, antes del texto que de verdad se leyo en pantalla.
 *
 * Ej: `403 forbidden: Solo el creador del espacio configura los tipos.`
 */
const RESPUESTA_DE_API = /^(\d{3}) ([a-z_]+): ([\s\S]*)$/

/**
 * Como se titula cada estado HTTP en la pantalla.
 *
 * El titular dice QUE PASO en el idioma del producto. El numero y el codigo tecnico siguen estando
 * —en el bloque plegado del detalle— pero dejan de ser lo primero que se lee: "403 forbidden" no le
 * dice a nadie que a alguien le faltaba un permiso.
 */
const TITULARES_HTTP: Record<string, string> = {
  400: 'La petición llegó mal armada',
  401: 'La sesión ya no era válida',
  403: 'Le faltaba permiso',
  404: 'No existe lo que se pidió',
  409: 'Chocó con el estado actual',
  422: 'Los datos no pasaron la validación',
  429: 'Demasiados intentos seguidos',
  500: 'La API se cayó',
  502: 'La API no respondió',
  503: 'La API no estaba disponible',
  504: 'La API tardó demasiado'
}

/**
 * Titular por origen, para el incidente que no trae una respuesta de la API adentro.
 *
 * Son las pantallas que no se pudieron dibujar: ahí no hay estado HTTP que contar, y lo unico cierto
 * es de que lado se rompio.
 */
const TITULARES_POR_ORIGEN: Record<OrigenIncidente, string> = {
  api: 'La API se cayó',
  panel: 'Una pantalla del panel no se pudo dibujar',
  portal: 'Una pantalla del portal no se pudo dibujar'
}

export interface FallaLegible {
  /** Que paso, en una linea y sin jerga. Es el encabezado de la pantalla. */
  titular: string
  /** El texto que de verdad se leyo, ya sin el `403 forbidden:` de adelante. `null` si no aporta. */
  detalle: string | null
  /** El estado HTTP, cuando el incidente es una respuesta de la API. */
  estado: string | null
}

/**
 * Traduce un incidente a lo que hay que leer primero: que paso y que se vio.
 *
 * Existe porque el campo `mensaje` se guarda tal como lo emitio quien fallo —`403 forbidden: ...`,
 * el `message` de una excepcion de PHP— y eso es un dato de diagnostico, no una frase. Puesto de
 * titulo deja al lector traduciendo codigos antes de entender el problema.
 *
 * No inventa nada: si el mensaje no tiene la forma de una respuesta de la API, el titular sale del
 * origen y el mensaje entero pasa a ser el detalle.
 *
 * @param incidente la fila o el detalle; se leen `mensaje` y `origen`
 * @returns el titular, el detalle limpio y el estado HTTP si lo habia
 */
export function describirFalla (incidente: Pick<Incidente, 'mensaje' | 'origen'>): FallaLegible {
  const partido = RESPUESTA_DE_API.exec(incidente.mensaje)

  if (partido === null) {
    const mensaje = incidente.mensaje.trim()

    return {
      titular: TITULARES_POR_ORIGEN[incidente.origen] ?? 'Algo se rompió',
      detalle: mensaje === '' ? null : mensaje,
      estado: null
    }
  }

  const estado = partido[1] ?? ''
  const codigo = partido[2] ?? ''
  const limpio = (partido[3] ?? '').trim()

  return {
    // Un estado que no esta en la tabla se nombra con su codigo tal cual y no con una frase
    // inventada: la API puede empezar a contestar uno que esta pantalla todavia no conoce.
    titular: TITULARES_HTTP[estado] ?? `La API contestó ${estado} ${codigo}`.trim(),
    detalle: limpio === '' ? null : limpio,
    estado
  }
}

/**
 * Los recursos de la API que tienen nombre en el producto.
 *
 * Solo los que aparecen seguido en un incidente. Lo que no este aca se muestra tal cual: inventarle
 * un nombre bonito a una ruta desconocida es peor que mostrar la ruta, que al menos es cierta.
 */
const RECURSOS: Record<string, string> = {
  projects: GLOSARIO.espacio.singular,
  tasks: GLOSARIO.proceso.singular,
  clients: 'Cliente',
  staff: 'Colaborador',
  incidentes: 'Incidente',
  jornadas: 'Jornada',
  contracts: 'Contrato',
  leads: 'Prospecto'
}

/**
 * La peticion que se cayo, dicha en castellano.
 *
 * `GET /projects/274/task-types` se lee "Proyecto #274 · task-types", que ubica el problema sin
 * obligar a leer una URL. La ruta original NO se pierde: sigue entera en el bloque tecnico del
 * detalle, que es donde sirve para reproducir la llamada.
 *
 * @param uri la ruta tal como la guardo la API
 * @returns la frase para pantalla, o la ruta tal cual si no se reconoce el recurso
 */
export function describirPeticion (uri: string): string {
  const ruta = uri.split('?')[0] ?? uri
  const partes = ruta.split('/').filter((parte) => parte !== '')
  const raiz = partes[0]

  if (raiz === undefined) return uri

  const nombre = RECURSOS[raiz]

  if (nombre === undefined) return ruta

  const id = partes[1] !== undefined && /^\d+$/.test(partes[1]) ? ` #${partes[1]}` : ''
  const resto = partes.slice(id === '' ? 1 : 2)

  return resto.length === 0 ? `${nombre}${id}` : `${nombre}${id} · ${resto.join(' / ')}`
}
