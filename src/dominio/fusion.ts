import { GLOSARIO } from './glosario.ts'
import type { Yo } from '@/datos/tipos'

/**
 * Fusionar entidades: juntar dos Proyectos, dos Clientes o dos Prospectos en uno solo.
 *
 * La fusion mueve todo lo que cuelga del **origen** al **destino** y manda el origen a la Papelera.
 * Se puede deshacer durante 30 dias. Este modulo decide lo que se puede decidir sin dibujar: quien
 * puede fusionar, como se llama cada entidad, a que ruta de la API se le pregunta y cuando el
 * resultado de la vista previa deja confirmar.
 *
 * Vive en un `.ts` y no en un componente por la regla de las pruebas: Node despoja los tipos de un
 * `.ts` pero no el JSX de un `.tsx`.
 */

/** Las tres entidades que se pueden fusionar. Los slugs son los de la API de fusion. */
export const ENTIDADES_FUSIONABLES = ['projects', 'clients', 'prospects'] as const

export type EntidadFusionable = typeof ENTIDADES_FUSIONABLES[number]

/** La palabra que hay que escribir para confirmar. Exacta salvo los espacios de los bordes. */
export const PALABRA_DE_FUSION = 'FUSIONAR'

/** Cuantos dias queda disponible el "Deshacer" tras una fusion. */
export const DIAS_PARA_DESHACER = 30

/** Lo minimo de una entidad para hablar de ella: como se llama y cual es. */
export interface ReferenciaDeFusion {
  id: number
  nombre: string
}

/**
 * Que le pasa a una tabla que cuelga del origen.
 *
 * Son las palabras del catalogo de la API (`Fusion\Relaciones`): `mover`, `deduplicar`, `descartar`,
 * `recalcular`, `conservar_destino`, y `cancelar` para la solicitud de eliminacion pendiente.
 */
export type AccionDeFusion = string

/** Cuantas filas de una tabla alcanza la fusion, y que hace con ellas. */
export interface ConteoDeFusion {
  tabla: string
  etiqueta: string
  filas: number
  accion?: AccionDeFusion
}

/** Un campo que el origen y el destino tienen distinto: hay que elegir cual se conserva. */
export interface ConflictoDeFusion {
  campo: string
  etiqueta: string
  valor_origen: unknown
  valor_destino: unknown
}

/** Algo que existe en los dos lados y que la fusion no puede decidir sola. */
export interface DuplicadoDeFusion {
  etiqueta: string
  cantidad: number
}

/** `GET /{entidad}/{id}/merge-preview?into={destino}`: que pasaria si se fusionara ahora. */
export interface PrevisualizacionDeFusion {
  /**
   * Si la funcion esta encendida en la instalacion. Apagada, la vista previa se ve pero confirmar
   * responde 403: es el interruptor con el que la fusion se despliega sin efecto.
   */
  habilitada: boolean
  origen: ReferenciaDeFusion
  destino: ReferenciaDeFusion
  /** Motivos por los que la fusion no se puede hacer. Con uno solo, no se confirma. */
  bloqueos: string[]
  conteos: ConteoDeFusion[]
  conflictos: ConflictoDeFusion[]
  duplicados: DuplicadoDeFusion[]
  archivos: { cantidad: number }
  drive: { carpetas: number }
}

/** De cual de los dos lados se queda el valor de un campo. */
export type LadoDeFusion = 'origen' | 'destino'

/** La eleccion de cada campo en conflicto, por la clave del campo. */
export type EleccionesDeFusion = Record<string, LadoDeFusion>

/** `POST /{entidad}/{id}/actions/merge`. */
export interface ResultadoDeFusion {
  fusion_id: number
  estado: string
}

/** Un cambio que no se pudo devolver al deshacer, con el motivo. */
export interface OmitidaDeReversion {
  tabla: string
  columna: string | null
  motivo: string
}

/** `POST /merges/{id}/actions/revert`. `omitidas` son los cambios que no se pudieron devolver. */
export interface ResultadoDeReversion {
  fusion_id: number
  estado: string
  omitidas: OmitidaDeReversion[]
}

/** `POST /merges/{id}/actions/retry-files`. */
export interface ResultadoDeReintento {
  fusion_id: number
  estado: string
}

/** Una fila del historial (`GET /merges`). */
export interface FusionDelHistorial {
  id: number
  entidad: EntidadFusionable
  origen: ReferenciaDeFusion
  destino: ReferenciaDeFusion
  /** `aplicada`, `pendiente_archivos` o `revertida`. */
  estado: string
  staff: { id: number, full_name: string } | null
  fecha: string
  revertida_en: string | null
  /** La API lo decide: dentro del plazo, no revertida y sin otra fusion encima. */
  puede_revertir: boolean
  revertible_hasta: string | null
}

interface DescripcionDeEntidad {
  /** Primer segmento de la ruta en la API. Los Prospectos son `prospectos`, no `prospects`. */
  ruta: string
  singular: string
  plural: string
  /** Si el origen pasa por la Papelera. Los Prospectos no tienen: se eliminan, respaldados. */
  usaPapelera: boolean
  /** Donde se mira la ficha del destino, para llevar a la persona alli tras fusionar. */
  fichaEn: (id: number) => string
}

const ENTIDADES: Record<EntidadFusionable, DescripcionDeEntidad> = {
  projects: {
    ruta: 'projects',
    singular: GLOSARIO.espacio.singular,
    plural: GLOSARIO.espacio.plural,
    usaPapelera: true,
    fichaEn: (id) => `/proyectos/${id}`
  },
  clients: {
    ruta: 'clients',
    singular: GLOSARIO.cliente.singular,
    plural: GLOSARIO.cliente.plural,
    usaPapelera: true,
    fichaEn: (id) => `/clientes/${id}`
  },
  prospects: {
    ruta: 'prospectos',
    singular: GLOSARIO.prospecto.singular,
    plural: GLOSARIO.prospecto.plural,
    usaPapelera: false,
    fichaEn: (id) => `/prospectos/${id}`
  }
}

/**
 * Como se nombra una entidad fusionable.
 *
 * @param entidad la entidad
 * @param plural `true` para el plural
 * @returns el nombre del glosario, con su mayuscula inicial
 */
export function nombreDeEntidadFusionable (entidad: EntidadFusionable, plural = false): string {
  return plural ? ENTIDADES[entidad].plural : ENTIDADES[entidad].singular
}

/**
 * Que le pasa al origen tras fusionar, para completar una frase que ya lo nombra.
 *
 * @param entidad la entidad
 * @returns «pasa a la Papelera» o «se elimina (queda respaldado)», segun la entidad
 */
export function salidaDelOrigen (entidad: EntidadFusionable): string {
  return ENTIDADES[entidad].usaPapelera ? 'pasa a la Papelera' : 'se elimina (queda respaldado)'
}

/**
 * Si el origen espera en la Papelera mientras dura el plazo de deshacer.
 *
 * @param entidad la entidad
 */
export function origenEstaEnPapelera (entidad: EntidadFusionable): boolean {
  return ENTIDADES[entidad].usaPapelera
}

/**
 * A donde lleva la ficha de una entidad fusionable.
 *
 * @param entidad la entidad
 * @param id id de la ficha
 * @returns la ruta del panel
 */
export function fichaDeEntidadFusionable (entidad: EntidadFusionable, id: number): string {
  return ENTIDADES[entidad].fichaEn(id)
}

/**
 * Si quien mira puede fusionar: administracion y coordinacion multiarea.
 *
 * Mismo criterio que la Papelera para el eje de administracion (`is_admin` incluye al
 * superadministrador, pero se mira ademas por si la API manda solo uno), y suma a quien coordina
 * varias areas. **Esconder no autoriza**: la puerta real es la API, que responde 403.
 *
 * @param yo quien mira, tal como lo devolvio `GET /me`
 * @returns si se ofrece la accion "Fusionar con…"
 */
export function puedeFusionar (yo: Pick<Yo, 'is_admin' | 'is_superadmin' | 'is_coordinador_multiarea'>): boolean {
  return yo.is_admin || yo.is_superadmin || yo.is_coordinador_multiarea
}

/**
 * La ruta de la vista previa de una fusion, sin barra inicial (el BFF la agrega).
 *
 * @param entidad la entidad
 * @param origenId id del que se fusiona
 * @param destinoId id del que lo recibe
 * @returns la ruta con su consulta
 */
export function rutaDePrevisualizacion (entidad: EntidadFusionable, origenId: number, destinoId: number): string {
  return `${ENTIDADES[entidad].ruta}/${origenId}/merge-preview?into=${destinoId}`
}

/**
 * La ruta que ejecuta la fusion.
 *
 * @param entidad la entidad
 * @param origenId id del que se fusiona
 * @returns la ruta, sin barra inicial
 */
export function rutaDeFusion (entidad: EntidadFusionable, origenId: number): string {
  return `${ENTIDADES[entidad].ruta}/${origenId}/actions/merge`
}

/**
 * La ruta del catalogo entre el que se elige el destino.
 *
 * `clients/minimos` y no `clients`: corre antes de la compuerta de `customers.view` y no corta en
 * cien. Los otros dos son los listados, con el tope que el selector necesita.
 *
 * @param entidad la entidad
 * @returns la ruta con su consulta, sin barra inicial
 */
export function rutaDeDestinos (entidad: EntidadFusionable): string {
  if (entidad === 'clients') return 'clients/minimos?sort=company&per_page=500'
  if (entidad === 'prospects') return 'prospectos?sort=empresa&per_page=500'

  return 'projects?sort=name&per_page=500'
}

/** Una opcion del selector de destino. */
export interface OpcionDeDestino {
  valor: string
  etiqueta: string
}

/**
 * Las opciones del selector de destino, sacadas de lo que devolvio el catalogo.
 *
 * Cada entidad nombra su campo de otra manera (`name`, `company`, `empresa`); aca se unifican. El
 * origen no se ofrece: fusionar algo consigo mismo no existe. Las filas sin id o sin nombre se
 * descartan en vez de romper la lista.
 *
 * @param entidad la entidad
 * @param filas las filas tal como las devolvio la API
 * @param origenId id del origen, que se excluye
 * @returns las opciones, en el orden en que llegaron
 */
export function opcionesDeDestino (entidad: EntidadFusionable, filas: unknown, origenId: number): OpcionDeDestino[] {
  if (!Array.isArray(filas)) return []

  const campo = entidad === 'clients' ? 'company' : entidad === 'prospects' ? 'empresa' : 'name'

  return filas.flatMap((fila: unknown) => {
    if (fila === null || typeof fila !== 'object') return []

    const { id, [campo]: nombre } = fila as Record<string, unknown>

    if (typeof id !== 'number' || id === origenId) return []
    if (typeof nombre !== 'string' || nombre.trim() === '') return []

    return [{ valor: String(id), etiqueta: nombre }]
  })
}

/**
 * Las elecciones con que nace la vista previa: cada campo en conflicto se queda con el del destino.
 *
 * El destino es el que sigue vivo, y conservar lo suyo es lo que menos sorprende: nadie pierde un
 * dato sin haberlo pedido.
 *
 * @param conflictos los de la vista previa
 * @returns una eleccion por campo
 */
export function eleccionesIniciales (conflictos: readonly ConflictoDeFusion[]): EleccionesDeFusion {
  return Object.fromEntries(conflictos.map((conflicto) => [conflicto.campo, 'destino' as const]))
}

/**
 * Si la vista previa deja confirmar: ningun bloqueo en pie y la funcion encendida.
 *
 * @param previa la vista previa
 * @returns `true` si no hay bloqueos y la API acepta aplicar
 */
export function puedeConfirmarFusion (previa: Pick<PrevisualizacionDeFusion, 'bloqueos' | 'habilitada'>): boolean {
  return previa.bloqueos.length === 0 && previa.habilitada
}

/** Como se lee lo que la fusion hace con cada tabla. Lo que el catalogo agregue y no este aca se omite. */
const ETIQUETAS_DE_ACCION: Record<string, string> = {
  mover: 'Pasa al destino',
  mover_si_falta: 'Pasa si el destino no lo tiene',
  deduplicar: 'Pasa sin repetir lo que ya hay',
  descartar: 'Se descarta (queda respaldado)',
  recalcular: 'Se recalcula',
  conservar_destino: 'Queda el del destino',
  cancelar: 'Se cancela'
}

/**
 * La frase de lo que la fusion hace con una tabla.
 *
 * @param accion la accion que mando la API
 * @returns la frase; vacia si no hay accion o el panel no la conoce
 */
export function etiquetaDeAccion (accion: AccionDeFusion | undefined): string {
  return accion === undefined ? '' : ETIQUETAS_DE_ACCION[accion] ?? ''
}

/**
 * Cuantas filas mueve la fusion en total.
 *
 * @param conteos los de la vista previa
 * @returns la suma de las filas, ignorando lo que no sea un numero finito
 */
export function totalDeFilas (conteos: readonly ConteoDeFusion[]): number {
  return conteos.reduce((suma, conteo) => suma + (Number.isFinite(conteo.filas) ? conteo.filas : 0), 0)
}

/**
 * El valor de un campo en conflicto, legible.
 *
 * @param valor lo que mando la API: texto, numero, booleano o nada
 * @returns el texto a mostrar; un guion largo si no hay valor
 */
export function textoDeValor (valor: unknown): string {
  if (valor === null || valor === undefined) return '—'
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No'
  if (typeof valor === 'number') return String(valor)
  if (typeof valor === 'string') return valor.trim() === '' ? '—' : valor

  return JSON.stringify(valor)
}

/**
 * Los dias que le quedan a una fusion para deshacerse.
 *
 * @param deshacerHasta instante limite (ISO), o `null` si ya no se puede
 * @param ahora instante de referencia, inyectable para pruebas
 * @returns dias enteros hacia arriba (queda "1 día" hasta el ultimo minuto); `0` si ya no se puede
 */
export function diasParaDeshacer (deshacerHasta: string | null, ahora: Date = new Date()): number {
  if (deshacerHasta === null) return 0

  const limite = Date.parse(deshacerHasta)

  if (!Number.isFinite(limite)) return 0

  return Math.max(0, Math.ceil((limite - ahora.getTime()) / 86400000))
}

/**
 * Como se lee lo que queda para deshacer.
 *
 * @param dias de `diasParaDeshacer`
 * @returns "Ya no se puede", "1 día" o "N días"
 */
export function textoParaDeshacer (dias: number): string {
  if (dias <= 0) return 'Ya no se puede'

  return dias === 1 ? '1 día' : `${dias} días`
}

/** Como se llama cada estado de una fusion. Lo que la API agregue y no este aca se muestra tal cual. */
const ETIQUETAS_DE_ESTADO: Record<string, string> = {
  aplicada: 'Fusionada',
  pendiente_archivos: 'Archivos pendientes',
  revertida: 'Deshecha'
}

/**
 * El nombre visible del estado de una fusion.
 *
 * @param estado el estado, tal como lo manda la API
 * @returns la etiqueta en español; el valor crudo si el panel no lo conoce
 */
export function etiquetaDeEstadoDeFusion (estado: string): string {
  return ETIQUETAS_DE_ESTADO[estado] ?? estado
}

/** Cuantos motivos distintos se citan en el aviso de lo que no se pudo devolver. */
const MOTIVOS_CITADOS = 2

/**
 * Que se avisa tras deshacer una fusion que dejo cambios sin devolver.
 *
 * Deshacer no es todo o nada: lo que ya cambio despues de fusionar se deja como esta, y la persona
 * tiene que saberlo. Se citan los primeros motivos distintos, no la lista entera.
 *
 * @param omitidas los cambios que no se pudieron devolver
 * @returns la frase del aviso, o `null` si no quedo nada afuera
 */
export function avisoDeOmitidas (omitidas: readonly OmitidaDeReversion[]): string | null {
  if (omitidas.length === 0) return null

  const motivos = [...new Set(omitidas.map((omitida) => omitida.motivo))].slice(0, MOTIVOS_CITADOS)
  const cuantas = omitidas.length === 1 ? 'un cambio no se pudo devolver' : `${omitidas.length} cambios no se pudieron devolver`

  return `Se deshizo, pero ${cuantas}: ${motivos.join('; ')}`
}
