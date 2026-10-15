import { esMismaEtiqueta } from './etiquetas.ts'
import { formatearFecha } from '../lib/fechas.ts'
import type { SugeridosPorHabito } from './ia.ts'

/**
 * Sugerencias de campos de una Tarea nueva (`GET /projects/{id}/task-suggestions`), sin React.
 *
 * El servidor calcula, sobre el historial del Espacio, quienes suelen participar, que tipo, prioridad,
 * hito y etiquetas se usan, y cuanto suele tardar. Aca vive lo que hace la interfaz con eso:
 *
 * - **leer** la respuesta sin confiar en ella (es JSON de la red: un campo de mas o de menos no puede
 *   reventar el formulario);
 * - **decidir que chips mostrar**, ocultando lo que ya esta elegido;
 * - **armar el parte** de lo aceptado y lo ignorado que viaja con `POST /tasks`.
 *
 * Una sugerencia nunca se aplica sola: es un chip `+ X` y se acepta con un clic.
 */

/** Los campos de la Tarea que pueden venir sugeridos, tal como los nombra el contrato. */
export const CAMPOS_SUGERIDOS = [
  'asignados', 'seguidores', 'etiquetas', 'tipo', 'prioridad', 'hito', 'facturable', 'plazo', 'horas_estimadas'
] as const

export type CampoSugerido = typeof CAMPOS_SUGERIDOS[number]

/** Formato de fecha que acepta la API. */
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/

/** Una persona sugerida. */
export interface SugerenciaDePersona { id: number, nombre: string, puntaje: number, apoyo: number }
/** Una fila de catalogo sugerida: tipo, prioridad o hito. */
export interface SugerenciaDeCatalogo { id: number, nombre: string, puntaje: number, apoyo: number }
/** Una etiqueta sugerida, por nombre. */
export interface SugerenciaDeEtiqueta { nombre: string, puntaje: number, apoyo: number }

/** Todo lo que el servidor sugiere para una Tarea nueva del Espacio. Cada campo puede venir vacio. */
export interface SugerenciasTarea {
  asignados: SugerenciaDePersona[]
  seguidores: SugerenciaDePersona[]
  etiquetas: SugerenciaDeEtiqueta[]
  tipo: SugerenciaDeCatalogo | null
  prioridad: SugerenciaDeCatalogo | null
  hito: SugerenciaDeCatalogo | null
  /** Solo importa el `false`: facturable es lo que ya viene marcado, y sugerirlo no cambia nada. */
  facturable: { valor: boolean, puntaje: number, apoyo: number } | null
  plazo: { dias: number, fecha: string, fuente: 'eta_tipo' | 'historial', apoyo: number } | null
  horas: { valor: number, apoyo: number } | null
}

/** Un chip `+ X`: lo que se ofrece, y con que valor viaja en el parte de aceptadas e ignoradas. */
export interface ChipSugerido {
  campo: CampoSugerido
  /** Valor como cadena que el formulario aplica al campo: id, nombre de etiqueta, fecha, horas. */
  valor: string
  /**
   * Valor con que viaja en el parte cuando difiere del que aplica el formulario: los dias del plazo
   * y `'0'`/`'1'` del facturable, como los registra el servidor. Sin el, viaja `valor`.
   */
  valorEnParte?: string
  /** Lo que dice el boton, sin el `+`. */
  texto: string
  /** Por que se sugiere; sale como ayuda del boton. */
  ayuda: string
  /** Id de la persona o fila de catalogo; `null` para etiquetas, plazo, horas y facturable. */
  id: number | null
}

/**
 * Lee el valor de un selector como id.
 *
 * @param valor el valor del selector: un id en texto, `''` o el centinela de «sin elegir»
 * @returns el id, o `null` si no hay nada elegido
 */
export function idDeSelector (valor: string): number | null {
  const id = Number(valor)

  return Number.isSafeInteger(id) && id > 0 ? id : null
}

/** Los chips que quedan por campo. */
export type ChipsPorCampo = Record<CampoSugerido, ChipSugerido[]>

/** Lo que el formulario ya tiene elegido. Los campos sin valor van vacios, no `NINGUNO`. */
export interface ActualesDeTarea {
  asignados: readonly number[]
  seguidores: readonly number[]
  etiquetas: readonly string[]
  tipo: number | null
  prioridad: number | null
  hito: number | null
  /** `YYYY-MM-DD` o `''`. */
  vencimiento: string
  /** Texto del campo de horas; `''` sin estimacion. */
  horas: string
  facturable: boolean
}

/** Ids que el formulario sabe ofrecer: un chip a un id que no esta en su selector no serviria. */
export interface IdsConocidos {
  personas?: ReadonlySet<number>
  tipos?: ReadonlySet<number>
  prioridades?: ReadonlySet<number>
  hitos?: ReadonlySet<number>
}

/** Como se filtran los chips segun la pantalla. */
export interface OpcionesDePendientes {
  /** En la edicion solo se sugiere donde no hay nada: las listas dejan de ofrecer si ya tienen gente. */
  soloVacios?: boolean
  conocidos?: IdsConocidos
}

const esObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor)

const numeroFinito = (valor: unknown): number | null =>
  typeof valor === 'number' && Number.isFinite(valor) ? valor : null

const idValido = (valor: unknown): number | null =>
  typeof valor === 'number' && Number.isSafeInteger(valor) && valor > 0 ? valor : null

const textoLleno = (valor: unknown): string | null =>
  typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null

/** Puntaje y apoyo de una fila: lo que falta o no es numero cae a 0, no descarta la sugerencia. */
function medidas (fila: Record<string, unknown>): { puntaje: number, apoyo: number } {
  return { puntaje: numeroFinito(fila.puntaje) ?? 0, apoyo: numeroFinito(fila.apoyo) ?? 0 }
}

/** Lee una lista de personas; descarta las filas sin id o sin nombre y las repetidas. */
function leerPersonas (valor: unknown): SugerenciaDePersona[] {
  if (!Array.isArray(valor)) return []

  const vistas = new Set<number>()
  const personas: SugerenciaDePersona[] = []

  for (const fila of valor as unknown[]) {
    if (!esObjeto(fila)) continue

    const id = idValido(fila.id)
    const nombre = textoLleno(fila.nombre)

    if (id === null || nombre === null || vistas.has(id)) continue
    vistas.add(id)
    personas.push({ id, nombre, ...medidas(fila) })
  }

  return personas
}

/** Lee una lista de etiquetas por nombre; descarta las vacias y las repetidas (sin mirar mayusculas). */
function leerEtiquetas (valor: unknown): SugerenciaDeEtiqueta[] {
  if (!Array.isArray(valor)) return []

  const etiquetas: SugerenciaDeEtiqueta[] = []

  for (const fila of valor as unknown[]) {
    if (!esObjeto(fila)) continue

    const nombre = textoLleno(fila.nombre)

    if (nombre === null || etiquetas.some((existente) => esMismaEtiqueta(existente.nombre, nombre))) continue
    etiquetas.push({ nombre, ...medidas(fila) })
  }

  return etiquetas
}

/** Lee una fila de catalogo (tipo, prioridad, hito); `null` si no trae id y nombre. */
function leerCatalogo (valor: unknown): SugerenciaDeCatalogo | null {
  if (!esObjeto(valor)) return null

  const id = idValido(valor.id)
  const nombre = textoLleno(valor.nombre)

  return id === null || nombre === null ? null : { id, nombre, ...medidas(valor) }
}

/** Lee el facturable sugerido; `null` si `valor` no es booleano. */
function leerFacturable (valor: unknown): SugerenciasTarea['facturable'] {
  return esObjeto(valor) && typeof valor.valor === 'boolean' ? { valor: valor.valor, ...medidas(valor) } : null
}

/** Lee el plazo sugerido; `null` si la fecha no tiene el formato del contrato. */
function leerPlazo (valor: unknown): SugerenciasTarea['plazo'] {
  if (!esObjeto(valor)) return null

  const fecha = typeof valor.fecha === 'string' && FORMATO_FECHA.test(valor.fecha) ? valor.fecha : null
  const fuente = valor.fuente === 'eta_tipo' || valor.fuente === 'historial' ? valor.fuente : null
  const dias = numeroFinito(valor.dias)

  return fecha === null || fuente === null || dias === null
    ? null
    : { dias, fecha, fuente, apoyo: numeroFinito(valor.apoyo) ?? 0 }
}

/** Lee las horas estimadas sugeridas; `null` si no son un numero de 0 o mas. */
function leerHoras (valor: unknown): SugerenciasTarea['horas'] {
  if (!esObjeto(valor)) return null

  const horas = numeroFinito(valor.valor)

  return horas === null || horas < 0 ? null : { valor: horas, apoyo: numeroFinito(valor.apoyo) ?? 0 }
}

/**
 * Lee el `data` de `GET /projects/{id}/task-suggestions`.
 *
 * Un campo que no encaja se descarta y se sigue con el resto: perder la lectura entera por un detalle
 * dejaria al formulario sin ayuda por nada.
 *
 * @param valor el `data` del envelope, tal como llego
 * @returns las sugerencias, o `null` si no es un objeto o no hay nada que sugerir
 */
export function leerSugerencias (valor: unknown): SugerenciasTarea | null {
  if (!esObjeto(valor)) return null

  const sugerencias: SugerenciasTarea = {
    asignados: leerPersonas(valor.asignados),
    seguidores: leerPersonas(valor.seguidores),
    etiquetas: leerEtiquetas(valor.etiquetas),
    tipo: leerCatalogo(valor.tipo),
    prioridad: leerCatalogo(valor.prioridad),
    hito: leerCatalogo(valor.hito),
    facturable: leerFacturable(valor.facturable),
    plazo: leerPlazo(valor.plazo),
    horas: leerHoras(valor.horas_estimadas)
  }

  return hayAlgoQueSugerir(sugerencias) ? sugerencias : null
}

/** ¿Alguno de los campos trae algo? */
function hayAlgoQueSugerir (s: SugerenciasTarea): boolean {
  return s.asignados.length > 0 || s.seguidores.length > 0 || s.etiquetas.length > 0 ||
    [s.tipo, s.prioridad, s.hito, s.facturable, s.plazo, s.horas].some((campo) => campo !== null)
}

/** «3 tareas» / «1 tarea». */
function tareas (apoyo: number): string {
  return `${apoyo} ${apoyo === 1 ? 'tarea' : 'tareas'}`
}

/** Por que se sugiere algo que sale de contar el historial. */
function ayudaDeHabito (apoyo: number): string {
  return apoyo > 0 ? `Aparece en ${tareas(apoyo)} recientes de este proyecto.` : 'Es lo habitual en este proyecto.'
}

/** Los chips de una lista de personas: las que el selector conoce y que aun no estan elegidas. */
function chipsDePersonas (
  campo: 'asignados' | 'seguidores', lista: SugerenciaDePersona[], elegidas: readonly number[], conocidas?: ReadonlySet<number>
): ChipSugerido[] {
  return lista
    .filter((persona) => !elegidas.includes(persona.id) && (conocidas === undefined || conocidas.has(persona.id)))
    .map((persona) => ({ campo, valor: String(persona.id), texto: persona.nombre, ayuda: ayudaDeHabito(persona.apoyo), id: persona.id }))
}

/** El chip de un campo de un solo valor, si el campo esta vacio y el catalogo conoce la fila. */
function chipDeCatalogo (
  campo: 'tipo' | 'prioridad' | 'hito', sugerida: SugerenciaDeCatalogo | null, actual: number | null, conocidos?: ReadonlySet<number>
): ChipSugerido[] {
  if (sugerida === null || actual !== null) return []
  if (conocidos !== undefined && !conocidos.has(sugerida.id)) return []

  return [{ campo, valor: String(sugerida.id), texto: sugerida.nombre, ayuda: ayudaDeHabito(sugerida.apoyo), id: sugerida.id }]
}

/** Los chips de etiquetas que aun no estan elegidas. */
function chipsDeEtiquetas (lista: SugerenciaDeEtiqueta[], elegidas: readonly string[]): ChipSugerido[] {
  return lista
    .filter((etiqueta) => !elegidas.some((elegida) => esMismaEtiqueta(elegida, etiqueta.nombre)))
    .map((etiqueta) => ({ campo: 'etiquetas', valor: etiqueta.nombre, texto: etiqueta.nombre, ayuda: ayudaDeHabito(etiqueta.apoyo), id: null }))
}

/** El chip del vencimiento sugerido, si el campo esta vacío. */
function chipDePlazo (plazo: SugerenciasTarea['plazo'], vencimiento: string): ChipSugerido[] {
  if (plazo === null || vencimiento !== '') return []

  const ayuda = plazo.fuente === 'eta_tipo'
    ? 'Es el plazo estándar de este tipo de tarea.'
    : `Es lo que suelen tardar las tareas de este proyecto (${tareas(plazo.apoyo)}).`

  return [{ campo: 'plazo', valor: plazo.fecha, valorEnParte: String(Math.round(plazo.dias)), texto: `Vence ${formatearFecha(plazo.fecha)}`, ayuda, id: null }]
}

/** El chip de las horas estimadas, si el campo esta vacío. */
function chipDeHoras (horas: SugerenciasTarea['horas'], texto: string): ChipSugerido[] {
  if (horas === null || texto.trim() !== '') return []

  const legible = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(horas.valor)

  return [{
    campo: 'horas_estimadas',
    valor: String(horas.valor),
    texto: `${legible} ${horas.valor === 1 ? 'hora' : 'horas'}`,
    ayuda: `Es la mediana de ${tareas(horas.apoyo)} anteriores de este proyecto.`,
    id: null
  }]
}

/** El chip «No facturable», solo si lo habitual es no facturar y la casilla sigue marcada. */
function chipDeFacturable (facturable: SugerenciasTarea['facturable'], actual: boolean): ChipSugerido[] {
  if (facturable === null || facturable.valor || !actual) return []

  return [{ campo: 'facturable', valor: 'false', valorEnParte: '0', texto: 'No facturable', ayuda: ayudaDeHabito(facturable.apoyo), id: null }]
}

/**
 * Decide que chips ofrecer segun lo que el formulario ya tiene.
 *
 * Lo que ya esta elegido no se ofrece; los campos de un solo valor solo se ofrecen vacios. Con
 * `soloVacios` (la edicion) las listas tambien: si una Tarea ya tiene asignados, no se le sugieren
 * mas, y el facturable —que nunca esta «vacio»— no se sugiere.
 *
 * @param sugerencias lo que leyo `leerSugerencias()`; `null` deja todo vacio
 * @param actuales lo que el formulario tiene elegido
 * @param opciones `soloVacios` y los ids que el formulario sabe mostrar
 * @returns los chips de cada campo; siempre trae las nueve claves
 */
export function pendientes (
  sugerencias: SugerenciasTarea | null,
  actuales: ActualesDeTarea,
  opciones: OpcionesDePendientes = {}
): ChipsPorCampo {
  const vacios: ChipsPorCampo = {
    asignados: [], seguidores: [], etiquetas: [], tipo: [], prioridad: [], hito: [], facturable: [], plazo: [], horas_estimadas: []
  }

  if (sugerencias === null) return vacios

  const { soloVacios = false, conocidos = {} } = opciones
  const conLista = <T>(chips: T[], elegidas: readonly unknown[]): T[] => soloVacios && elegidas.length > 0 ? [] : chips

  return {
    asignados: conLista(chipsDePersonas('asignados', sugerencias.asignados, actuales.asignados, conocidos.personas), actuales.asignados),
    seguidores: conLista(chipsDePersonas('seguidores', sugerencias.seguidores, actuales.seguidores, conocidos.personas), actuales.seguidores),
    etiquetas: conLista(chipsDeEtiquetas(sugerencias.etiquetas, actuales.etiquetas), actuales.etiquetas),
    tipo: chipDeCatalogo('tipo', sugerencias.tipo, actuales.tipo, conocidos.tipos),
    prioridad: chipDeCatalogo('prioridad', sugerencias.prioridad, actuales.prioridad, conocidos.prioridades),
    hito: chipDeCatalogo('hito', sugerencias.hito, actuales.hito, conocidos.hitos),
    facturable: soloVacios ? [] : chipDeFacturable(sugerencias.facturable, actuales.facturable),
    plazo: chipDePlazo(sugerencias.plazo, actuales.vencimiento),
    horas_estimadas: chipDeHoras(sugerencias.horas, actuales.horas)
  }
}

/**
 * Junta los chips de todos los campos en una sola lista.
 *
 * @param chips los chips por campo
 * @returns todos, en el orden de `CAMPOS_SUGERIDOS`
 */
export function aplanar (chips: ChipsPorCampo): ChipSugerido[] {
  return CAMPOS_SUGERIDOS.flatMap((campo) => chips[campo])
}

/** Un valor del parte de sugerencias de `POST /tasks`. */
export interface EventoDeSugerencia { campo: CampoSugerido, valor: string }

/** El campo opcional `sugerencias` de `POST /tasks`. */
export interface ParteDeSugerencias {
  aceptadas: EventoDeSugerencia[]
  ignoradas: EventoDeSugerencia[]
}

/** Quita los repetidos (mismo campo y valor) conservando el orden. */
function sinRepetidos (chips: readonly ChipSugerido[]): EventoDeSugerencia[] {
  const vistos = new Set<string>()
  const eventos: EventoDeSugerencia[] = []

  for (const chip of chips) {
    const { campo } = chip
    const valor = chip.valorEnParte ?? chip.valor
    const clave = `${campo}:${valor}`

    if (vistos.has(clave)) continue
    vistos.add(clave)
    eventos.push({ campo, valor })
  }

  return eventos
}

/**
 * Arma el campo `sugerencias` del alta.
 *
 * Las aceptadas son los chips que se clicaron; las ignoradas, los que seguian a la vista al guardar.
 * Lo aceptado nunca cuenta tambien como ignorado, aunque despues se haya sacado a mano y su chip
 * haya vuelto a aparecer.
 *
 * @param aceptadas los chips clicados
 * @param visibles los chips pendientes al momento de guardar
 * @returns el parte, o `null` si no hubo nada que registrar
 */
export function parteDeSugerencias (
  aceptadas: readonly ChipSugerido[],
  visibles: readonly ChipSugerido[]
): ParteDeSugerencias | null {
  const aceptadasUnicas = sinRepetidos(aceptadas)
  const yaAceptado = new Set(aceptadasUnicas.map(({ campo, valor }) => `${campo}:${valor}`))
  const ignoradas = sinRepetidos(visibles).filter(({ campo, valor }) => !yaAceptado.has(`${campo}:${valor}`))
  // `sinRepetidos` ya devuelve el valor del parte, asi que la comparacion es entre iguales.

  return aceptadasUnicas.length === 0 && ignoradas.length === 0
    ? null
    : { aceptadas: aceptadasUnicas, ignoradas }
}

/** Los nombres con que la interfaz sabe mostrar un id sugerido por la IA. */
export interface NombresConocidos {
  personas: ReadonlyArray<{ id: number, nombre: string }>
  tipos: ReadonlyArray<{ id: number, nombre: string }>
  prioridades: ReadonlyArray<{ id: number, nombre: string }>
  hitos: ReadonlyArray<{ id: number, nombre: string }>
}

/** Suma a una lista de personas las que sugiere la IA y no estaban, con sus nombres. */
function sumarPersonas (
  base: SugerenciaDePersona[], ids: readonly number[], personas: NombresConocidos['personas']
): SugerenciaDePersona[] {
  const extra = ids
    .filter((id) => !base.some((persona) => persona.id === id))
    .flatMap((id) => {
      const nombre = personas.find((persona) => persona.id === id)?.nombre

      return nombre === undefined ? [] : [{ id, nombre, puntaje: 0, apoyo: 0 }]
    })

  return [...base, ...extra]
}

/** La fila de catalogo sugerida: la del historial si hay, y si no la de la IA con su nombre. */
function catalogoSugerido (
  base: SugerenciaDeCatalogo | null, id: number | null, filas: NombresConocidos['tipos']
): SugerenciaDeCatalogo | null {
  if (base !== null || id === null) return base

  const nombre = filas.find((fila) => fila.id === id)?.nombre

  return nombre === undefined ? null : { id, nombre, puntaje: 0, apoyo: 0 }
}

/**
 * Une lo que sugiere el historial con lo que sugiere la IA por habito.
 *
 * Los chips de la IA se suman sin duplicar los del historial. Una persona, prioridad, tipo o hito que
 * la interfaz no sabe nombrar se descarta: ofrecer un boton sin nombre es peor que no ofrecerlo.
 *
 * @param base lo del historial, o `null` si no hay
 * @param sugeridos lo que dijo la IA por habito, o `null` si no hubo interpretacion
 * @param nombres los catalogos de la pantalla
 * @returns la union, o `null` si no queda nada que sugerir
 */
export function unirSugeridos (
  base: SugerenciasTarea | null,
  sugeridos: SugeridosPorHabito | null,
  nombres: NombresConocidos
): SugerenciasTarea | null {
  if (sugeridos === null) return base

  const partida: SugerenciasTarea = base ?? {
    asignados: [], seguidores: [], etiquetas: [], tipo: null, prioridad: null, hito: null, facturable: null, plazo: null, horas: null
  }
  const etiquetasNuevas = sugeridos.etiquetas
    .filter((nombre) => !partida.etiquetas.some((etiqueta) => esMismaEtiqueta(etiqueta.nombre, nombre)))
    .map((nombre) => ({ nombre, puntaje: 0, apoyo: 0 }))

  const unida: SugerenciasTarea = {
    ...partida,
    asignados: sumarPersonas(partida.asignados, sugeridos.asignados, nombres.personas),
    seguidores: sumarPersonas(partida.seguidores, sugeridos.seguidores, nombres.personas),
    etiquetas: [...partida.etiquetas, ...etiquetasNuevas],
    tipo: catalogoSugerido(partida.tipo, sugeridos.tipo, nombres.tipos),
    prioridad: catalogoSugerido(partida.prioridad, sugeridos.prioridad, nombres.prioridades),
    hito: catalogoSugerido(partida.hito, sugeridos.hito, nombres.hitos)
  }

  return hayAlgoQueSugerir(unida) ? unida : null
}
