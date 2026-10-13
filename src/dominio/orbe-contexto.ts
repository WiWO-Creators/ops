import { GLOSARIO } from './glosario.ts'
import { actaAbiertaDeUrl, pantallaDeRuta } from './pantalla.ts'

/**
 * El contexto con el que el orbe flotante del equipo conversa: en qué pantalla está parada la persona,
 * qué Meeting Paper tiene abierto y de qué Proyecto es la ruta.
 *
 * Todo es pista para el servidor, nunca permiso: el backend valida `pantalla` y `acta_id` por su
 * cuenta (un acta inválida responde 422). Aquí solo se arma lo que se manda y lo que se muestra.
 */

/** La forma que acepta el backend para `pantalla`: ruta sin query, hasta 200 caracteres tras la barra. */
const PANTALLA_DEL_AGENTE = /^\/[a-z0-9/_\-[\]]{0,200}$/

/** `/proyectos/{id}` (o el antiguo `/espacios/{id}`) y lo que cuelgue de ahí. */
const RUTA_PROYECTO_PANEL = /^\/(?:proyectos|espacios)\/(\d+)(?:\/|$)/

/** Nombre legible del primer tramo de cada ruta del panel. */
const NOMBRE_DE_SECCION: Record<string, string> = {
  inicio: 'Inicio',
  proyectos: GLOSARIO.espacio.plural,
  tareas: GLOSARIO.proceso.plural,
  'mis-tareas': `Mis ${GLOSARIO.proceso.plural.toLowerCase()}`,
  clientes: GLOSARIO.cliente.plural,
  prospectos: GLOSARIO.prospecto.plural,
  licitaciones: GLOSARIO.licitacion.plural,
  contratos: GLOSARIO.contrato.plural,
  upsells: GLOSARIO.upsell.plural,
  focals: GLOSARIO.focal.plural,
  tickets: GLOSARIO.ticket.plural,
  equipo: 'Equipo',
  teletrabajo: GLOSARIO.teletrabajo.plural,
  salas: 'Salas',
  live: 'En vivo',
  indicadores: 'Indicadores',
  supervision: 'Supervisión',
  auditoria: 'Auditoría',
  novedades: 'Novedades',
  papelera: 'Papelera',
  perfil: 'Perfil',
  propuestas: 'Propuestas',
  fusiones: 'Fusiones',
  administracion: 'Administración'
}

/**
 * El Proyecto que la ruta del panel tiene abierto.
 *
 * @param ruta el pathname vigente, o `null` si no se conoce
 * @returns el id del Proyecto, o `undefined` fuera de una ficha o con un id inválido
 */
export function proyectoDeRutaPanel (ruta: string | null): number | undefined {
  if (ruta === null) return undefined

  const coincidencia = RUTA_PROYECTO_PANEL.exec(ruta.toLowerCase())
  if (coincidencia === null) return undefined

  const id = Number(coincidencia[1])

  return Number.isSafeInteger(id) && id > 0 ? id : undefined
}

/**
 * La ruta tal como se manda en `pantalla` al crear una ejecución del agente.
 *
 * @param ruta el pathname vigente
 * @returns la ruta saneada, o `null` si el backend no la aceptaría (no se manda a medias)
 */
export function pantallaParaAgente (ruta: string): string | null {
  const pantalla = pantallaDeRuta(ruta)

  return pantalla !== null && PANTALLA_DEL_AGENTE.test(pantalla) ? pantalla : null
}

/**
 * Nombre legible de la pantalla para el chip de contexto.
 *
 * @param pantalla la ruta saneada de `pantallaParaAgente`
 * @returns p. ej. «Tareas», «Proyecto» o «Inicio»; la ruta cruda si no se reconoce
 */
export function etiquetaDePantalla (pantalla: string): string {
  const [seccion = '', ...resto] = pantalla.split('/').filter(tramo => tramo !== '')
  const nombre = NOMBRE_DE_SECCION[seccion]

  if (nombre === undefined) return seccion === '' ? 'Inicio' : pantalla
  if (seccion === 'proyectos' && resto[0] !== undefined) return GLOSARIO.espacio.singular

  return nombre
}

/**
 * El id de un acta recibido en el detalle del evento de apertura del orbe.
 *
 * @param detalle el `detail` del evento, sin fiarse de su forma
 * @returns el id si es un entero positivo; `null` si no hay acta
 */
export function actaDeDetalleDeEvento (detalle: unknown): number | null {
  if (detalle === null || typeof detalle !== 'object') return null

  const id = (detalle as { actaId?: unknown }).actaId

  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null
}

/** Un acta que una pantalla pidió al abrir el orbe, válida mientras la persona siga en esa ruta. */
export interface ActaPedida {
  id: number
  ruta: string
}

/** Lo que el orbe del equipo manda y muestra como contexto. */
export interface ContextoDeOrbe {
  /** La ruta saneada, o `null` si el backend no la aceptaría. */
  pantalla: string | null
  /** El Meeting Paper abierto, o `null`. */
  actaId: number | null
  /** Texto del chip: «Meeting Paper #12» o el nombre de la pantalla; `null` si no hay contexto que mostrar. */
  etiqueta: string | null
}

/**
 * Deriva el contexto del orbe de la URL y, si la pantalla lo pidió, del evento de apertura.
 *
 * El acta de la URL (`?tab=actas&acta=12`) manda; la del evento solo vale mientras la ruta sea la
 * misma desde la que se pidió, para no arrastrar un acta a otra pantalla.
 *
 * @param ruta el pathname vigente
 * @param busqueda los parámetros de la URL
 * @param actaPedida el acta del último evento de apertura, si hubo
 * @returns pantalla, acta y etiqueta del chip
 */
export function contextoDeOrbe (ruta: string, busqueda: URLSearchParams, actaPedida: ActaPedida | null): ContextoDeOrbe {
  const pantalla = pantallaParaAgente(ruta)
  const actaUrl = actaAbiertaDeUrl(ruta, busqueda)
  const actaId = actaUrl ?? (actaPedida !== null && actaPedida.ruta === ruta ? actaPedida.id : null)
  const etiqueta = actaId !== null ? `${GLOSARIO.acta.singular} #${actaId}` : pantalla === null ? null : etiquetaDePantalla(pantalla)

  return { pantalla, actaId, etiqueta }
}

/** Valor de `?tab=` de la pestaña del Orbe en la ficha del Proyecto (la clave no cambió con el renombre). */
export const PESTANA_ORBE = 'wibot'

/**
 * Enlace que amplía el chat del Proyecto a su pestaña del Orbe.
 *
 * @param proyectoId el Proyecto de la ruta
 * @returns `/proyectos/{id}?tab=wibot`
 */
export function hrefDePestanaDelOrbe (proyectoId: number): string {
  return `/proyectos/${proyectoId}?tab=${PESTANA_ORBE}`
}

/** Lo mínimo que se le pide a `sessionStorage`. Así la prueba lo finge. */
export interface AlmacenDeBorradores {
  getItem: (clave: string) => string | null
  setItem: (clave: string, valor: string) => void
  removeItem: (clave: string) => void
  readonly length: number
  key: (indice: number) => string | null
}

const PREFIJO_BORRADOR = 'ops.orbe.borrador:'

/**
 * Lee el borrador de un ámbito.
 *
 * @param almacen el almacén, o `null` si no hay uno al que se pueda llegar
 * @param ambito clave de `ambitoDeOrbe`
 * @returns el texto guardado, o `''`
 */
export function leerBorrador (almacen: AlmacenDeBorradores | null, ambito: string): string {
  try {
    return almacen?.getItem(PREFIJO_BORRADOR + ambito) ?? ''
  } catch {
    return ''
  }
}

/**
 * Guarda el borrador de un ámbito; un texto vacío (o solo espacios) borra la clave.
 *
 * @param almacen el almacén, o `null`
 * @param ambito clave de `ambitoDeOrbe`
 * @param texto lo escrito
 */
export function guardarBorrador (almacen: AlmacenDeBorradores | null, ambito: string, texto: string): void {
  try {
    if (texto.trim() === '') almacen?.removeItem(PREFIJO_BORRADOR + ambito)
    else almacen?.setItem(PREFIJO_BORRADOR + ambito, texto)
  } catch {
    // Almacenamiento lleno o bloqueado: el borrador es una comodidad, no un dato.
  }
}

/**
 * Borra todos los borradores del orbe, de cualquier ámbito. Al cerrar sesión: el `sessionStorage`
 * dura lo que la pestaña, y lo que una persona dejó escrito no debe verlo quien entre después.
 *
 * @param almacen el almacén, o `null`
 */
export function vaciarBorradores (almacen: AlmacenDeBorradores | null): void {
  try {
    if (almacen === null) return
    const claves: string[] = []
    for (let i = 0; i < almacen.length; i += 1) {
      const clave = almacen.key(i)
      if (clave?.startsWith(PREFIJO_BORRADOR)) claves.push(clave)
    }
    for (const clave of claves) almacen.removeItem(clave)
  } catch {
    // Almacén bloqueado: no hay nada que se pueda leer ni quedar a la vista.
  }
}

/** El `sessionStorage`, o `null` si no existe o no se puede tocar (ventana privada, servidor). */
export function almacenDeBorradoresDelNavegador (): AlmacenDeBorradores | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}
