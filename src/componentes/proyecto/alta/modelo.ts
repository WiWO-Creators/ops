import type { ValorFin } from '@/componentes/recurrencia/FinDeRecurrencia'
import type { ValoresDeCampos } from '@/dominio/campos-personalizados'
import { cuerpoDeFin, errorDeDiasExcluidos, errorDeFin } from '@/dominio/recurrencia'
import type { AltaRapida, CatalogosAlta } from '@/dominio/alta-rapida'
import type { CampoDeTarea, TareaFusionada } from '@/dominio/ia-tarea'
import { errorDeDescripcion } from '@/dominio/descripcion-tarea'
import { esRelacionDeEspacio, relTypeDeRelacion, type RelacionTarea } from '@/dominio/espacios-destino'
import { GLOSARIO } from '@/dominio/glosario'
import { errorDeHorasEstimadas, horasDeTexto } from '@/dominio/tiempo-estimado'
import { errorDeVencimientoRequerido } from '@/dominio/vencimiento-requerido'
import { formatearFecha } from '@/lib/fechas'
import { enFormatoTitulo } from '@/lib/titulo'
import type { Referencia } from '@/datos/recursos'
import type { MarcaPrevia } from '../VistaPreviaAlta'

/** Valor del selector cuando no se eligio nada. Radix no admite `value=""` en una opcion. */
export const NINGUNO = 'ninguno'

/** Como se nombra cada relacion en el selector y en el campo de destino. */
export const NOMBRES_DE_RELACION: Record<RelacionTarea, { singular: string, plural: string }> = {
  project: GLOSARIO.espacio,
  licitacion: GLOSARIO.licitacion,
  // "Upselling" y no "Upsell": es como el equipo llama a la seccion y a lo que cuelga de ella.
  upsell: { singular: GLOSARIO.upsell.plural, plural: GLOSARIO.upsell.plural },
  customer: GLOSARIO.cliente
}

/** Los dos modos del dialogo. */
export const MODOS = [
  { valor: 'linea', etiqueta: 'En una línea' },
  { valor: 'campos', etiqueta: 'Por campos' }
] as const

export type Modo = typeof MODOS[number]['valor']

/** Ruta del alta en varios Espacios a la vez. Ver `POST /tasks/multi-espacio` en la API. */
export const RUTA_MULTI = 'tasks/multi-espacio'

/** Una recurrencia recien encendida no termina: es lo que pide la mayoria y lo que hacia el alta antes. */
const FIN_INICIAL: ValorFin = { modo: 'nunca', ciclos: '12', hasta: '' }

/**
 * Cuántos Espacios acepta un alta múltiple.
 *
 * Copia del tope del servidor (`CrearProceso::MAXIMO_ESPACIOS`). Se repite acá solo para avisar
 * antes del viaje; quien decide sigue siendo la API, que responde 422 `espacios: ["demasiados"]`.
 */
const MAXIMO_ESPACIOS = 20

/** Lo que devuelve `POST /tasks/multi-espacio` por cada destino que se creó. */
interface AltaEnEspacio {
  espacio_id: number
  task_id: number
}

/** Lo que devuelve `POST /tasks/multi-espacio` por cada destino que no se pudo crear. */
interface FalloEnEspacio {
  espacio_id: number
  motivo: string
}

/** El parte del alta múltiple, tal como llega en `data`. */
export interface ParteMulti {
  creados: AltaEnEspacio[]
  fallidos: FalloEnEspacio[]
}

/** Lo que el diálogo tiene que seguir mostrando cuando un alta múltiple sale a medias. */
export interface ResumenParcial {
  /** Nombre del Espacio y qué pasó ahí, ya en texto para la persona. */
  hechos: Array<{ espacioId: number, nombre: string, detalle: string, ok: boolean }>
  /** Espacios que hay que reintentar; los que ya tienen su tarea no vuelven a viajar. */
  pendientes: number[]
}

/**
 * Todo lo que la persona escribe o elige en el alta.
 *
 * Los campos del modo "por campos" viven aparte de la linea (`texto`) a proposito: cambiar de modo
 * no debe borrar lo que se escribio en el otro, porque se alterna justo cuando un `@` no resolvio.
 */
export interface BorradorAlta {
  modo: Modo
  texto: string
  nombre: string
  relacion: RelacionTarea
  relacionId: string
  /**
   * Los Espacios destino, en el orden en que se eligieron. **Es la fuente de verdad.**
   *
   * Antes era un solo id en un `Selector`. Ahora es una lista porque la misma tarea se pide muchas
   * veces en varios Espacios a la vez, y repetir el formulario entero una vez por Espacio es lo que
   * hace que esas tareas terminen en un chat.
   *
   * Con cero o un elemento el alta es EXACTAMENTE la de siempre: mismo `POST /tasks`, mismo cuerpo.
   * La ruta múltiple aparece recién con dos.
   */
  espacios: number[]
  estado: string
  hito: string
  tipo: string
  prioridad: string
  asignados: number[]
  seguidores: number[]
  inicio: string
  vencimiento: string
  cierre: string
  etiquetasEscritas: string[]
  descripcion: string
  /** Archivos elegidos junto a la descripcion: se suben a la carpeta de Drive cuando la tarea ya existe. */
  adjuntos: File[]
  // Se pide en el alta y no solo en la ficha: la estimacion se define al solicitar la tarea, y lo
  // que no se anota en ese momento no se anota nunca.
  horasEstimadas: string
  tarifa: string
  facturable: boolean
  publica: boolean
  visibleCliente: boolean
  recurrente: boolean
  cada: string
  unidad: string
  fin: ValorFin
  diasExcluidos: number[]
  personalizados: ValoresDeCampos
}

/** Los campos manuales, para poder devolverlos tal como estaban antes de que la IA los pisara. */
export type CamposManuales = Pick<BorradorAlta,
  'nombre' | 'hito' | 'relacion' | 'relacionId' | 'espacios' | 'asignados' | 'seguidores' | 'tipo' |
  'prioridad' | 'inicio' | 'vencimiento' | 'etiquetasEscritas' | 'descripcion'>

/** Con qué contexto se abrió el alta: lo que un borrador nuevo conserva. */
interface ContextoDelBorrador {
  proyectoId?: number
  hitoInicial?: number
  relacion: RelacionTarea
  asignados: number[]
  personalizados: ValoresDeCampos
  visibleCliente: boolean
}

/**
 * Arma un borrador vacío para el contexto de apertura.
 *
 * @param contexto el Espacio y el hito fijados, la relación y los asignados con que arranca
 * @returns el borrador con todos los campos en su valor inicial
 */
export function borradorInicial (contexto: ContextoDelBorrador): BorradorAlta {
  return {
    modo: 'campos',
    texto: '',
    nombre: '',
    relacion: contexto.relacion,
    relacionId: '',
    espacios: contexto.proyectoId === undefined ? [] : [contexto.proyectoId],
    estado: NINGUNO,
    hito: contexto.hitoInicial === undefined ? NINGUNO : String(contexto.hitoInicial),
    tipo: NINGUNO,
    prioridad: NINGUNO,
    asignados: contexto.asignados,
    seguidores: [],
    inicio: '',
    vencimiento: '',
    cierre: '',
    etiquetasEscritas: [],
    descripcion: '',
    adjuntos: [],
    horasEstimadas: '',
    tarifa: '',
    facturable: true,
    publica: false,
    visibleCliente: contexto.visibleCliente,
    recurrente: false,
    cada: '1',
    unidad: 'month',
    fin: FIN_INICIAL,
    diasExcluidos: [],
    personalizados: contexto.personalizados
  }
}

/**
 * Copia los campos que la interpretación de IA puede pisar.
 *
 * @param borrador el borrador actual
 * @returns los campos manuales, listos para devolverlos con "Deshacer"
 */
export function camposManuales (borrador: BorradorAlta): CamposManuales {
  const { nombre, hito, relacion, relacionId, espacios, asignados, seguidores, tipo, prioridad, inicio, vencimiento, etiquetasEscritas, descripcion } = borrador

  return { nombre, hito, relacion, relacionId, espacios, asignados, seguidores, tipo, prioridad, inicio, vencimiento, etiquetasEscritas, descripcion }
}

/** Lo que se deriva del destino elegido y usan tanto la vista como el envío. */
export interface DestinoDelAlta {
  /**
   * El primer Espacio elegido, en la forma de cadena que ya usaban los campos que dependen de él.
   *
   * Derivado y no un estado propio: dos estados para el mismo dato es el que se desincroniza. De
   * este salen los hitos, los tipos y el contexto del asistente de descripción, y por eso el orden
   * de elección importa.
   */
  espacio: string
  /** Hay más de un destino: el hito y el tipo dejan de tener sentido (son por Espacio). */
  multiple: boolean
  /** La relacion elegida es un Espacio —Proyecto, Licitacion o Upsell— y no un Cliente. */
  vaAEspacio: boolean
}

/**
 * Deriva el destino del alta a partir del borrador.
 *
 * @param borrador el borrador actual
 * @returns el primer Espacio, si hay varios y si la relación es con un Espacio
 */
export function destinoDelAlta (borrador: Pick<BorradorAlta, 'espacios' | 'relacion'>): DestinoDelAlta {
  return {
    espacio: borrador.espacios.length === 0 ? NINGUNO : String(borrador.espacios[0]),
    multiple: borrador.espacios.length > 1,
    vaAEspacio: esRelacionDeEspacio(borrador.relacion)
  }
}

/**
 * El nombre de una fila de catálogo por su id.
 *
 * @param id id buscado
 * @param lista catálogo donde buscarlo
 * @param campo columna que tiene el nombre
 * @returns el nombre, o cadena vacía si el catálogo no lo tiene
 */
function nombreDe (id: number, lista: ReadonlyArray<{ id: number }>, campo: 'full_name' | 'name'): string {
  const fila = lista.find((f) => f.id === id) as Record<string, unknown> | undefined
  return fila === undefined ? '' : String(fila[campo])
}

/**
 * El nombre del Espacio para mostrar.
 *
 * @param id id del Espacio
 * @param espacios catálogo de Espacios
 * @returns su nombre, o su id cuando el catálogo no lo tiene
 */
export function nombreDeEspacio (id: number, espacios: ReadonlyArray<Referencia>): string {
  return espacios.find((fila) => fila.id === id)?.name ?? `${GLOSARIO.espacio.singular} #${id}`
}

/**
 * Las marcas de la vista previa del modo "en una línea".
 *
 * Se arman aca, no en la vista previa: los nombres salen de los catalogos de esta pantalla y la
 * vista previa solo pinta lo que ya viene con nombre. Aca todas son 'texto': el alta rapida no
 * llama al modelo, su gracia es ser instantanea.
 *
 * @param leido lo que entendió `interpretarAltaRapida()`
 * @param catalogos contra qué se resolvieron los nombres
 * @returns las marcas en el orden en que se muestran
 */
export function marcasDeLinea (leido: AltaRapida, catalogos: CatalogosAlta): MarcaPrevia[] {
  const marcas: MarcaPrevia[] = []

  if (leido.due_date !== null) marcas.push({ texto: `Vence ${formatearFecha(leido.due_date)}`, origen: 'texto' })
  if (leido.rel_id !== null) marcas.push({ texto: nombreDe(leido.rel_id, catalogos.espacios, 'name'), origen: 'texto' })
  if (leido.priority !== null) marcas.push({ texto: nombreDe(leido.priority, catalogos.prioridades, 'name'), origen: 'texto' })
  for (const id of leido.assignees) marcas.push({ texto: nombreDe(id, catalogos.personas, 'full_name'), origen: 'texto' })

  return marcas
}

/**
 * Las marcas de la vista previa de la interpretación con IA.
 *
 * Cada marca declara de donde salio: lo que propuso el modelo no puede verse igual que lo que
 * escribio la persona, porque lo primero hay que revisarlo y lo segundo no.
 *
 * @param fusion el resultado de fusionar parser y modelo, o `null` si no hubo interpretación
 * @param espacio el primer Espacio elegido (`NINGUNO` si no hay)
 * @param espacioDeIa si ese Espacio lo propuso el modelo
 * @param catalogos contra qué se resolvieron los nombres
 * @returns las marcas en el orden en que se muestran; vacía sin interpretación
 */
export function marcasDeFusion (
  fusion: TareaFusionada | null, espacio: string, espacioDeIa: boolean, catalogos: CatalogosAlta
): MarcaPrevia[] {
  if (fusion === null) return []

  const marcas: MarcaPrevia[] = []
  const origen = (campo: CampoDeTarea): 'texto' | 'ia' => fusion.deIa.includes(campo) ? 'ia' : 'texto'

  if (fusion.due_date !== null) marcas.push({ texto: `Vence ${formatearFecha(fusion.due_date)}`, origen: origen('due_date') })
  if (fusion.start_date !== null) marcas.push({ texto: `Empieza ${formatearFecha(fusion.start_date)}`, origen: origen('start_date') })
  if (espacio !== NINGUNO) marcas.push({ texto: nombreDe(Number(espacio), catalogos.espacios, 'name'), origen: espacioDeIa ? 'ia' : 'texto' })
  if (fusion.priority !== null) marcas.push({ texto: nombreDe(fusion.priority, catalogos.prioridades, 'name'), origen: origen('priority') })
  for (const id of fusion.assignees) marcas.push({ texto: nombreDe(id, catalogos.personas, 'full_name'), origen: origen('assignees') })
  if (fusion.description !== null) marcas.push({ texto: 'Con descripción', origen: origen('description') })
  for (const etiqueta of fusion.tags) marcas.push({ texto: etiqueta, origen: origen('tags') })

  return marcas
}

/** Por qué no se puede enviar el alta por campos, y dónde mostrarlo. */
export type FalloDelAlta = { campo: 'descripcion' | 'formulario', mensaje: string }

/**
 * Comprueba el borrador antes del alta por campos, en el orden en que se avisan los fallos.
 *
 * La descripción y el vencimiento requerido son cortesía, no la regla: la aplica `POST /tasks` (y
 * `multi-espacio`), que devuelve 422. Esto solo evita el viaje y deja el foco donde se arregla.
 *
 * @param borrador el borrador a enviar
 * @param vencimientoRequerido si algún destino exige fecha de vencimiento
 * @returns el primer fallo encontrado, o `null` si se puede enviar
 */
export function falloDelAltaPorCampos (borrador: BorradorAlta, vencimientoRequerido: boolean): FalloDelAlta | null {
  if (borrador.nombre.trim() === '') return { campo: 'formulario', mensaje: 'La tarea necesita un nombre.' }

  const descripcionMal = errorDeDescripcion(borrador.descripcion, `La ${GLOSARIO.proceso.singular.toLowerCase()}`)
  if (descripcionMal !== null) return { campo: 'descripcion', mensaje: descripcionMal }

  const mensaje = errorDeCamposDelAlta(borrador, vencimientoRequerido)

  return mensaje === null ? null : { campo: 'formulario', mensaje }
}

/**
 * Los fallos del resto de los campos, que se muestran en el cartel general del formulario.
 *
 * @param borrador el borrador a enviar
 * @param vencimientoRequerido si algún destino exige fecha de vencimiento
 * @returns el mensaje del primer fallo, o `null`
 */
function errorDeCamposDelAlta (borrador: BorradorAlta, vencimientoRequerido: boolean): string | null {
  const { inicio, vencimiento, relacionId, tarifa, recurrente, cada, fin } = borrador
  const vaAEspacio = esRelacionDeEspacio(borrador.relacion)

  const horasMal = errorDeHorasEstimadas(borrador.horasEstimadas)
  if (horasMal !== null) return horasMal
  if (inicio !== '' && vencimiento !== '' && vencimiento < inicio) return 'El vencimiento no puede ser anterior al inicio.'
  // Si la consulta del vencimiento requerido fallo, esto no corta nada.
  const vencimientoFaltante = errorDeVencimientoRequerido(vencimientoRequerido, vencimiento)
  if (vencimientoFaltante !== null) return vencimientoFaltante
  if (!vaAEspacio && (!Number.isSafeInteger(Number(relacionId)) || Number(relacionId) < 1)) return `Elige un ${GLOSARIO.cliente.singular.toLowerCase()}.`
  if (tarifa !== '' && (!Number.isFinite(Number(tarifa)) || Number(tarifa) < 0)) return 'La tarifa debe ser un número mayor o igual a cero.'
  if (recurrente && (!Number.isInteger(Number(cada)) || Number(cada) < 1)) return 'La frecuencia debe ser un entero positivo.'
  const errorFin = recurrente ? errorDeFin(fin.modo, fin.ciclos, fin.hasta, inicio) ?? errorDeDiasExcluidos(borrador.diasExcluidos) : null
  if (errorFin !== null) return errorFin
  if (vaAEspacio && borrador.espacios.length > MAXIMO_ESPACIOS) {
    return `Como máximo ${MAXIMO_ESPACIOS} ${GLOSARIO.espacio.plural.toLowerCase()} por vez. Saca algunos y repite el alta con el resto.`
  }

  return null
}

/**
 * Lo que es igual en todos los destinos.
 *
 * El hito, el tipo y la relacion quedan fuera: son de UN Espacio, y son justo lo que el alta
 * multiple no acepta. Lo que quedo sin elegir no viaja, para que la API aplique sus propios
 * valores por defecto en vez de recibir un `null` que significa otra cosa.
 *
 * @param borrador el borrador ya validado
 * @returns el cuerpo compartido de `POST /tasks` y `POST /tasks/multi-espacio`
 */
export function cuerpoComunDelAlta (borrador: BorradorAlta): Record<string, unknown> {
  const { estado, tarifa, recurrente, cierre, asignados, seguidores, prioridad, inicio, vencimiento } = borrador
  // La colacion de `tbltags` es `_ci`: "urgente" y "Urgente" son la misma fila para la API, asi
  // que no hace falta normalizar nada aca.
  const pedidas = borrador.etiquetasEscritas
  const horas = horasDeTexto(borrador.horasEstimadas)

  return {
    // En formato de titulo al guardar y no mientras se escribe: corregir el campo bajo el
    // cursor pelea con quien esta tecleando. Solo convierte lo que viene todo en mayusculas.
    name: enFormatoTitulo(borrador.nombre),
    billable: borrador.facturable,
    is_public: borrador.publica,
    visible_to_client: borrador.visibleCliente,
    ...(estado === NINGUNO ? {} : { status: Number(estado) }),
    ...(tarifa === '' ? {} : { hourly_rate: Number(tarifa) }),
    ...(recurrente ? cuerpoDeRecurrencia(borrador) : {}),
    ...(estado === '5' && cierre !== '' ? { completed_at: new Date(cierre).toISOString() } : {}),
    ...(asignados.length === 0 ? {} : { assignees: asignados }),
    ...(seguidores.length === 0 ? {} : { followers: seguidores }),
    ...(prioridad === NINGUNO ? {} : { priority: Number(prioridad) }),
    ...(inicio === '' ? {} : { start_date: inicio }),
    ...(vencimiento === '' ? {} : { due_date: vencimiento }),
    // Siempre viaja: es obligatoria, y omitirla cuando esta vacia le escondia al servidor
    // justamente el caso que ahora tiene que rechazar.
    description: borrador.descripcion.trim(),
    ...(horas === null ? {} : { estimated_hours: horas }),
    ...(pedidas.length === 0 ? {} : { tags: pedidas })
  }
}

/**
 * Los campos de recurrencia del cuerpo del alta.
 *
 * @param borrador el borrador con la recurrencia encendida
 * @returns `recurring`, la frecuencia, el fin y los días excluidos
 */
function cuerpoDeRecurrencia (borrador: BorradorAlta): Record<string, unknown> {
  const { fin, diasExcluidos } = borrador

  return {
    recurring: true,
    repeat_every: Number(borrador.cada),
    recurring_type: borrador.unidad,
    ...cuerpoDeFin(fin.modo, fin.ciclos, fin.hasta),
    ...(diasExcluidos.length === 0 ? {} : { skip_weekdays: diasExcluidos })
  }
}

/**
 * Lo que solo lleva el alta en UN destino: el hito, el tipo y la relación.
 *
 * @param borrador el borrador ya validado
 * @returns los campos a sumar al cuerpo común de `POST /tasks`
 */
export function cuerpoDeUnDestino (borrador: BorradorAlta): Record<string, unknown> {
  const { hito, tipo, relacion, relacionId } = borrador
  const { espacio, vaAEspacio } = destinoDelAlta(borrador)

  return {
    ...(!vaAEspacio || hito === NINGUNO ? {} : { milestone: Number(hito) }),
    ...(!vaAEspacio ? { rel_type: relTypeDeRelacion(relacion), rel_id: Number(relacionId) } : espacio === NINGUNO ? {} : { rel_type: 'project', rel_id: Number(espacio) }),
    ...(!vaAEspacio || tipo === NINGUNO ? {} : { task_type: Number(tipo) })
  }
}
