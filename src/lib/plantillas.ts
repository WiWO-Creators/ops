import type { EstadoLookup, ItemPlantilla, TipoItemPlantilla } from '../datos/recursos.ts'
import type { OpcionFiltro } from '../definiciones/tipos.ts'
import { sumarDias } from './fechas.ts'

/**
 * Logica pura de las plantillas de Espacio.
 *
 * Vive en `.ts` y no en un `.tsx` a proposito: el runner de Node despoja tipos pero no JSX, asi que
 * lo que esta aca se puede probar sin navegador. La parte visual esta en
 * `componentes/proyecto/PantallaPlantillas.tsx` y `EditorPlantilla.tsx`.
 *
 * **El calculo de fechas de este modulo es una vista previa, no la regla.** Quien decide las fechas
 * reales es `POST /projects/from-template`; esto solo muestra de antemano lo que va a pasar, para
 * que nadie cree cuarenta Procesos mal fechados y se entere despues.
 */

/** Cuanto se estira o se encoge la plantilla. `1` es "tal cual esta declarada". */
export function factorDeEscalado (
  duracionPedida: number | null | undefined,
  duracionDeLaPlantilla: number | null | undefined
): number {
  const pedida = Number(duracionPedida)
  const declarada = Number(duracionDeLaPlantilla)

  // Sin cualquiera de las dos no hay cociente que calcular: el contrato fija el factor en 1.
  if (!Number.isFinite(pedida) || pedida <= 0) return 1
  if (!Number.isFinite(declarada) || declarada <= 0) return 1

  return pedida / declarada
}

/** Una fila de la vista previa: el item con las fechas que le tocarian. */
export interface FilaPrevista {
  /** Posicion del item en la lista de la plantilla. Sirve de `key` y de `parent_index`. */
  indice: number
  tipo: TipoItemPlantilla
  nombre: string
  /** `YYYY-MM-DD`, o `null` si la fecha de inicio del Espacio todavia no es utilizable. */
  inicio: string | null
  vence: string | null
  /** La fila cuelga de un hito anterior: se sangra para que la jerarquia se lea. */
  esHija: boolean
}

/**
 * Calcula las fechas que tendria cada item si el Espacio se creara con estos datos.
 *
 * Replica la formula del contrato: `inicio = start_date + round(offset × factor)` y
 * `vence = inicio + round(duracion × factor)`.
 *
 * @param inicio Fecha de inicio del Espacio, en `YYYY-MM-DD`. Vacia o mal formada devuelve fechas nulas.
 * @param items Items de la plantilla, en su orden declarado.
 * @param factor Resultado de `factorDeEscalado()`.
 * @returns Una fila por item, en el mismo orden.
 */
export function previsualizarPlantilla (
  inicio: string | null | undefined,
  items: ItemPlantilla[],
  factor: number
): FilaPrevista[] {
  return items.map((item, indice) => {
    const desplazamiento = Math.round(item.offset_days * factor)
    const duracion = Math.round(item.duration_days * factor)
    const arranca = sumarDias(inicio, desplazamiento)

    return {
      indice,
      tipo: item.type,
      nombre: item.name,
      inicio: arranca,
      vence: sumarDias(arranca, duracion),
      esHija: item.type === 'task' && item.parent_index !== null
    }
  })
}

/**
 * Fecha de entrega que el backend va a derivar para el Espacio.
 *
 * Es el maximo entre el final de la duracion pedida y el vencimiento del ultimo item: recortar el
 * Espacio a la duracion haria que un item que se pasa tumbara el alta entera.
 *
 * @param inicio Fecha de inicio del Espacio.
 * @param duracionPedida Duracion esperada en dias, o `null` si no se pidio ninguna.
 * @param filas Vista previa ya calculada.
 * @returns La fecha en `YYYY-MM-DD`, o `null` si no hay duracion ni items con fecha.
 */
export function entregaPrevista (
  inicio: string | null | undefined,
  duracionPedida: number | null | undefined,
  filas: FilaPrevista[]
): string | null {
  const candidatas: string[] = []
  const duracion = Number(duracionPedida)

  if (Number.isFinite(duracion) && duracion > 0) {
    const fin = sumarDias(inicio, duracion)

    if (fin !== null) candidatas.push(fin)
  }

  for (const fila of filas) {
    if (fila.vence !== null) candidatas.push(fila.vence)
  }

  if (candidatas.length === 0) return null

  // `YYYY-MM-DD` ordena igual como texto que como fecha: no hace falta parsear para comparar.
  return candidatas.reduce((mayor, fecha) => (fecha > mayor ? fecha : mayor))
}

/**
 * Deduplica el catalogo de tipos de Proceso por nombre, quedandose con el id mas bajo.
 *
 * `tbltask_types` tiene una fila por Espacio: los tres tipos globales (Bug, Feature, Task) aparecen
 * repetidos cientos de veces con ids distintos, y un desplegable con 278 opciones que dicen "Bug" no
 * se puede usar. El id mas bajo de cada nombre es el global —los de Espacio se crearon despues—, que
 * es justamente el que sirve en una plantilla, porque una plantilla no pertenece a ningun Espacio.
 *
 * @param tipos `task_types` de `GET /lookups`.
 * @returns Una opcion por nombre distinto, ordenada por nombre.
 */
export function tiposDeProcesoUnicos (tipos: EstadoLookup[] | undefined): OpcionFiltro[] {
  const porNombre = new Map<string, EstadoLookup>()

  for (const tipo of tipos ?? []) {
    const previo = porNombre.get(tipo.name)

    if (previo === undefined || tipo.id < previo.id) porNombre.set(tipo.name, tipo)
  }

  return [...porNombre.values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .map((tipo) => ({ valor: String(tipo.id), etiqueta: tipo.name }))
}

/**
 * Fila del editor, con los numeros todavia como texto.
 *
 * Se guardan como los escribe el navegador y se convierten al armar el cuerpo: convertir en cada
 * pulsacion hace que borrar el contenido de un campo numerico lo reponga en `0`.
 */
export interface FilaEditor {
  /** Identidad local estable, para el `key` de React. No viaja a la API. */
  clave: string
  type: TipoItemPlantilla
  name: string
  /**
   * Clave local del hito del que cuelga, no su posicion.
   *
   * La API habla de `parent_index`, pero guardarlo aca obligaria a reindexar la lista entera cada
   * vez que una fila se mueve, se agrega o se borra — y un indice que quedo viejo es exactamente el
   * `422 no_es_un_hito_anterior` del contrato. La posicion se calcula recien al guardar.
   */
  padre: string | null
  offset_days: string
  duration_days: string
  /** Id del tipo de Proceso como texto; vacio = sin tipo. */
  task_type_id: string
  /** `staffid` de los responsables, como texto. */
  assignees: string[]
}

/** Item tal como lo acepta `POST`/`PATCH /project-templates`. */
export interface ItemParaGuardar {
  type: TipoItemPlantilla
  name: string
  parent_index: number | null
  offset_days: number
  duration_days: number
  task_type_id: number | null
  assignees: number[]
}

/** Entero no negativo de un campo de texto; lo que no lo sea vale `0`, igual que el defecto del contrato. */
function entero (texto: string): number {
  const valor = Number(texto)

  return Number.isFinite(valor) && valor > 0 ? Math.trunc(valor) : 0
}

/**
 * Posicion del hito del que cuelga una fila, o `null` si no cuelga de ninguno valido.
 *
 * Se exige que el padre sea un hito y que este **antes** en la lista: es la regla que el contrato
 * rechaza con `422 no_es_un_hito_anterior`, y resolverla aca hace que reordenar filas suelte el
 * vinculo en vez de romper el guardado.
 */
function posicionDelPadre (filas: FilaEditor[], indice: number): number | null {
  const fila = filas[indice]

  if (fila === undefined || fila.type !== 'task' || fila.padre === null) return null

  const posicion = filas.findIndex((otra) => otra.clave === fila.padre)

  if (posicion === -1 || posicion >= indice) return null

  return filas[posicion]?.type === 'milestone' ? posicion : null
}

/**
 * Hitos que una fila puede tener como padre: los que estan mas arriba en la lista.
 *
 * @param filas Filas del editor, en el orden en que se ven.
 * @param indice Posicion de la fila que esta eligiendo padre.
 * @returns Una opcion por hito anterior, con su clave local como valor.
 */
export function padresPosibles (filas: FilaEditor[], indice: number): OpcionFiltro[] {
  return filas
    .slice(0, indice)
    .filter((fila) => fila.type === 'milestone')
    .map((fila) => ({ valor: fila.clave, etiqueta: fila.name.trim() === '' ? 'Hito sin nombre' : fila.name }))
}

/**
 * Convierte las filas del editor en los items que espera la API.
 *
 * Un hito nunca lleva `parent_index` ni `task_type_id`: el contrato solo los acepta en un `task`, y
 * mandarlos igual seria un `422` por un dato que la pantalla no ofrece.
 *
 * @param filas Filas del editor, en el orden en que se ven.
 * @returns Los items, en el mismo orden. `order` no se manda: es la posicion.
 */
export function itemsParaGuardar (filas: FilaEditor[]): ItemParaGuardar[] {
  return filas.map((fila, indice) => ({
    type: fila.type,
    name: fila.name.trim(),
    parent_index: posicionDelPadre(filas, indice),
    offset_days: entero(fila.offset_days),
    duration_days: entero(fila.duration_days),
    task_type_id: fila.type === 'task' && fila.task_type_id !== '' ? Number(fila.task_type_id) : null,
    assignees: fila.type === 'task' ? fila.assignees.map(Number).filter(Number.isFinite) : []
  }))
}

/**
 * Reconstruye las filas del editor a partir de una plantilla leida.
 *
 * Usa `parent_index` y no `parent_id`: la lista se vuelve a mandar entera, con ids que todavia no
 * existen, asi que la jerarquia solo sobrevive por posicion.
 *
 * @param items Items de `GET /project-templates/{id}`.
 * @returns Las filas del editor, en el orden declarado.
 */
export function filasDeItems (items: ItemPlantilla[]): FilaEditor[] {
  const claves = items.map((item, indice) => `item-${item.id}-${indice}`)

  return items.map((item, indice) => ({
    clave: claves[indice] ?? `item-${indice}`,
    type: item.type,
    name: item.name,
    padre: item.type === 'task' && item.parent_index !== null ? claves[item.parent_index] ?? null : null,
    offset_days: String(item.offset_days),
    duration_days: String(item.duration_days),
    task_type_id: item.task_type_id === null ? '' : String(item.task_type_id),
    assignees: item.assignees.map(String)
  }))
}

/**
 * Reparte los `details` de un `422` entre las filas del editor.
 *
 * La API los devuelve con la posicion adentro de la clave (`items.2.task_type_id`) justamente para
 * que se puedan pintar al lado del campo que fallo, en vez de como un parrafo al pie que no dice
 * cual de los cuarenta items esta mal.
 *
 * @param detalles `details` del envelope de error.
 * @returns Mapa posicion -> campo -> codigo. Las claves que no hablan de un item quedan afuera.
 */
export function erroresDeItems (
  detalles: Record<string, string[]> | undefined
): Record<number, Record<string, string>> {
  const porFila: Record<number, Record<string, string>> = {}

  for (const [clave, motivos] of Object.entries(detalles ?? {})) {
    const partes = /^items\.(\d+)\.(.+)$/.exec(clave)

    if (partes === null || !Array.isArray(motivos)) continue

    const indice = Number(partes[1])
    const campo = partes[2] ?? ''
    const motivo = motivos[0]

    if (motivo === undefined) continue

    porFila[indice] = { ...porFila[indice], [campo]: motivo }
  }

  return porFila
}

/** Motivos del contrato propios de las plantillas, en castellano. */
const MOTIVOS_DE_ITEM: Record<string, string> = {
  required: 'Pon un nombre.',
  no_existe: 'Ya no existe.',
  no_es_un_hito_anterior: 'El hito tiene que estar más arriba en la lista.',
  'in:milestone,task': 'Tipo desconocido.'
}

/**
 * Texto legible de un motivo de item.
 *
 * @param motivo Codigo tal como lo manda la API.
 * @returns La frase, o el codigo con los guiones bajos cambiados por espacios.
 */
export function textoDeMotivo (motivo: string): string {
  return MOTIVOS_DE_ITEM[motivo] ?? motivo.replace(/_/g, ' ')
}
