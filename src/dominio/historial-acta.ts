import {
  bloquesDeActa,
  diferenciasDeUnidades,
  unidadesDeBloques,
  type CambioDeUnidad,
  type EtiquetaDeUnidad,
  type UnidadActa
} from './diff-acta.ts'
import { ASISTENTE, GLOSARIO } from './glosario.ts'

/**
 * El historial de cambios de un Meeting Paper: lo que la lista y el panel de diferencias necesitan
 * saber sin tocar el DOM.
 *
 * La API guarda, por cada cambio del contenido, quién lo hizo y con qué origen (`manual`, `ia`, `orb`,
 * `restauracion`, `colaborativo`). Acá se decide cómo se llama cada origen, qué filtro lo incluye y
 * cómo se compacta la comparación de dos versiones para que un documento largo con un cambio chico no
 * se lea entero. Es lógica pura, para probarla con `node:test`.
 */

/** Cómo se llama el documento en los textos de este módulo; sale del glosario. */
const DOCUMENTO = GLOSARIO.acta.singular

/** Lo que dice la API de por qué cambió el contenido. Un valor desconocido se muestra como «Cambio». */
export type OrigenDeRevision = 'manual' | 'ia' | 'orb' | 'restauracion' | 'colaborativo'

/**
 * Una de las personas que escribieron en un mismo cambio. Una revisión de edición conjunta puede
 * tener varias; `staff_id` de la revisión sigue siendo quien escribió último.
 */
export interface AutorDelActa {
  staff_id: number
  staff_name: string
  staff_image: string | null
}

/** Una persona tal como la pide `GrupoEnlacesPersona`. */
export interface PersonaDelGrupo {
  id: number
  full_name: string
  profile_image_url: string | null
}

/**
 * Las personas de un cambio cuando fueron varias, para mostrarlas juntas.
 *
 * Con una sola (o ninguna, o una API que aún no manda `authors`) devuelve vacío: ahí se muestra a
 * quien firma la revisión, como siempre. Se descartan las repetidas y las entradas inválidas.
 *
 * @param revision la entrada o el cambio, con su lista opcional de `authors`
 * @returns las personas si son dos o más; vacío en cualquier otro caso
 */
export function autoresDeRevision (revision: { authors?: readonly AutorDelActa[] | null }): PersonaDelGrupo[] {
  const vistos = new Set<number>()
  const personas: PersonaDelGrupo[] = []

  for (const autor of revision.authors ?? []) {
    if (!Number.isInteger(autor.staff_id) || autor.staff_id <= 0 || vistos.has(autor.staff_id)) continue
    if (typeof autor.staff_name !== 'string' || autor.staff_name === '') continue

    vistos.add(autor.staff_id)
    personas.push({ id: autor.staff_id, full_name: autor.staff_name, profile_image_url: autor.staff_image ?? null })
  }

  return personas.length > 1 ? personas : []
}

/** Una entrada de la lista: un cambio, o el punto en que se creó el documento. */
export interface RevisionDelActa {
  /** `0` en la entrada de creación. */
  id: number
  kind: 'change' | 'created'
  /** Casi siempre un {@link OrigenDeRevision}; se acepta cualquier texto para no romper con uno nuevo. */
  origin: string
  staff_id: number | null
  staff_name: string | null
  staff_image: string | null
  /** Quienes escribieron en el cambio (edición conjunta). Opcional: una API anterior no lo manda. */
  authors?: readonly AutorDelActa[]
  /** Las secciones tocadas, ya redactadas por la API; `null` si no se calculó. */
  summary: string | null
  preview: string | null
  date_added: string | null
}

/** El detalle de un cambio: el contenido antes y después, para compararlo. */
export interface CambioDelActa {
  id: number
  origin: string
  staff_id: number | null
  staff_name: string | null
  staff_image: string | null
  /** Quienes escribieron en el cambio (edición conjunta). Opcional: una API anterior no lo manda. */
  authors?: readonly AutorDelActa[]
  date_added: string | null
  summary: string | null
  /** El HTML que había antes del cambio; es lo que «Restaurar» devuelve. */
  before: string
  /** El HTML que quedó. */
  after: string
}

/** Qué cambios mira la lista. */
export type FiltroDeHistorial = 'todos' | 'asistente' | 'colaboradores'

/** Los filtros en el orden en que se ofrecen, con su rótulo. */
export const FILTROS_DE_HISTORIAL: ReadonlyArray<{ id: FiltroDeHistorial, etiqueta: string }> = [
  { id: 'todos', etiqueta: 'Todos' },
  { id: 'asistente', etiqueta: `${ASISTENTE} e IA` },
  { id: 'colaboradores', etiqueta: 'Colaboradores' }
]

/** Los orígenes que cuentan como obra del asistente y no de una persona. */
const ORIGENES_DEL_ASISTENTE: ReadonlySet<string> = new Set<OrigenDeRevision>(['orb', 'ia'])

/** El rótulo de cada origen conocido. */
const ETIQUETA_DE_ORIGEN: Readonly<Record<OrigenDeRevision, string>> = {
  orb: ASISTENTE,
  ia: 'IA',
  manual: 'Manual',
  restauracion: 'Restauración',
  colaborativo: 'Edición conjunta'
}

/**
 * Cómo se llama un origen en la lista.
 *
 * @param origen el `origin` que manda la API
 * @returns el rótulo; «Cambio» si el origen no se conoce
 */
export function etiquetaDeOrigen (origen: string): string {
  return Object.hasOwn(ETIQUETA_DE_ORIGEN, origen) ? ETIQUETA_DE_ORIGEN[origen as OrigenDeRevision] : 'Cambio'
}

/**
 * Si el cambio lo hizo el asistente (Thinking Orb o la IA de generación) y no una persona escribiendo.
 *
 * @param origen el `origin` que manda la API
 * @returns `true` para `orb` e `ia`
 */
export function esOrigenDelAsistente (origen: string): boolean {
  return ORIGENES_DEL_ASISTENTE.has(origen)
}

/**
 * Si una entrada pasa un filtro.
 *
 * La entrada de creación no es un cambio que se filtre: es el ancla de la lista y se muestra siempre.
 *
 * @param revision la entrada
 * @param filtro el filtro elegido
 * @returns `true` si se muestra
 */
export function pasaElFiltro (revision: RevisionDelActa, filtro: FiltroDeHistorial): boolean {
  if (revision.kind === 'created' || filtro === 'todos') return true

  return esOrigenDelAsistente(revision.origin) === (filtro === 'asistente')
}

/**
 * Las entradas que muestra un filtro, en el mismo orden en que llegaron (la más nueva primero).
 *
 * @param revisiones la lista completa de la API
 * @param filtro el filtro elegido
 * @returns la lista filtrada; una lista nueva, la original no se toca
 */
export function filtrarRevisiones (revisiones: readonly RevisionDelActa[], filtro: FiltroDeHistorial): RevisionDelActa[] {
  return revisiones.filter((revision) => pasaElFiltro(revision, filtro))
}

/**
 * Cuántos cambios (sin contar la creación) trae cada filtro.
 *
 * @param revisiones la lista completa de la API
 * @returns el conteo por filtro
 */
export function contarPorFiltro (revisiones: readonly RevisionDelActa[]): Record<FiltroDeHistorial, number> {
  const cambios = revisiones.filter((revision) => revision.kind === 'change')
  const delAsistente = cambios.filter((revision) => esOrigenDelAsistente(revision.origin)).length

  return { todos: cambios.length, asistente: delAsistente, colaboradores: cambios.length - delAsistente }
}

/**
 * La frase que dice qué pasó en una entrada, sin el nombre de quien lo hizo.
 *
 * @param revision la entrada
 * @returns por ejemplo «Cambió el Meeting Paper» o «Creó el Meeting Paper»
 */
export function accionDeRevision (revision: Pick<RevisionDelActa, 'kind' | 'origin'>): string {
  if (revision.kind === 'created') return `Creó el ${DOCUMENTO}`
  if (revision.origin === 'restauracion') return `Restauró una versión del ${DOCUMENTO}`

  return `Cambió el ${DOCUMENTO}`
}

/**
 * Compara dos versiones del acta por bloques y palabras.
 *
 * @param antes el HTML anterior
 * @param despues el HTML posterior
 * @returns un cambio por unidad (título, párrafo, cita o punto de lista), en el orden del documento
 */
export function diferenciaDeVersiones (antes: string, despues: string): CambioDeUnidad[] {
  return diferenciasDeUnidades(
    unidadesDeBloques(bloquesDeActa(antes)),
    unidadesDeBloques(bloquesDeActa(despues))
  )
}

/** Cuántos bloques agregó, quitó y corrigió un cambio. */
export interface ResumenDeDiferencias {
  agregados: number
  eliminados: number
  modificados: number
}

/**
 * Cuenta los bloques que cambiaron.
 *
 * @param cambios la comparación de {@link diferenciaDeVersiones}
 * @returns los tres conteos; todo en cero si el texto es el mismo
 */
export function resumirDiferencias (cambios: readonly CambioDeUnidad[]): ResumenDeDiferencias {
  const resumen: ResumenDeDiferencias = { agregados: 0, eliminados: 0, modificados: 0 }

  for (const cambio of cambios) {
    if (cambio.tipo === 'insertado') resumen.agregados++
    else if (cambio.tipo === 'eliminado') resumen.eliminados++
    else if (cambio.tipo === 'modificado') resumen.modificados++
  }

  return resumen
}

/**
 * El resumen como texto para leer.
 *
 * @param resumen los conteos de {@link resumirDiferencias}
 * @returns por ejemplo «1 bloque agregado · 2 corregidos»; «Sin cambios de texto» si no hay ninguno
 */
export function textoDeResumen (resumen: ResumenDeDiferencias): string {
  const partes: string[] = []

  if (resumen.agregados > 0) partes.push(`${resumen.agregados} ${resumen.agregados === 1 ? 'agregado' : 'agregados'}`)
  if (resumen.eliminados > 0) partes.push(`${resumen.eliminados} ${resumen.eliminados === 1 ? 'eliminado' : 'eliminados'}`)
  if (resumen.modificados > 0) partes.push(`${resumen.modificados} ${resumen.modificados === 1 ? 'corregido' : 'corregidos'}`)

  return partes.length === 0 ? 'Sin cambios de texto' : partes.join(' · ')
}

/** Una unidad de la comparación, tal como se dibuja. */
export interface ItemDeUnidad {
  tipo: 'unidad'
  cambio: CambioDeUnidad
}

/** Un tramo de unidades sin cambios que se muestra plegado. */
export interface ItemPlegado {
  tipo: 'plegado'
  /** Posición de la primera unidad plegada en la comparación completa; sirve de identificador. */
  desde: number
  cantidad: number
}

/** Lo que dibuja la comparación compacta. */
export type ItemDeDiferencias = ItemDeUnidad | ItemPlegado

/** Cuántas unidades iguales se dejan alrededor de un cambio, como contexto. */
export const CONTEXTO_DE_DIFERENCIAS = 1

/** Un tramo de iguales se pliega solo si esconde al menos esto: plegar una sola unidad no ahorra nada. */
const MINIMO_PLEGADO = 2

/**
 * Compacta la comparación: deja los cambios con un poco de contexto y pliega los tramos largos sin
 * cambios.
 *
 * @param cambios la comparación completa
 * @param expandidos posiciones (`desde`) de los tramos que la persona ya abrió; se muestran enteros
 * @param contexto cuántas unidades iguales se conservan junto a cada cambio
 * @returns las unidades a dibujar, con los tramos plegados como un solo item
 */
export function compactarDiferencias (
  cambios: readonly CambioDeUnidad[],
  expandidos: ReadonlySet<number> = new Set(),
  contexto: number = CONTEXTO_DE_DIFERENCIAS
): ItemDeDiferencias[] {
  const items: ItemDeDiferencias[] = []
  let posicion = 0

  while (posicion < cambios.length) {
    const actual = cambios[posicion]

    if (actual === undefined) break

    if (actual.tipo !== 'igual') {
      items.push({ tipo: 'unidad', cambio: actual })
      posicion++
      continue
    }

    let fin = posicion

    while (cambios[fin]?.tipo === 'igual') fin++

    const alInicio = posicion === 0
    const alFinal = fin === cambios.length
    const visiblesAntes = alInicio ? 0 : contexto
    const visiblesDespues = alFinal ? 0 : contexto
    const plegadas = fin - posicion - visiblesAntes - visiblesDespues
    const seAbrio = expandidos.has(posicion + visiblesAntes)

    if (plegadas < MINIMO_PLEGADO || seAbrio) {
      for (let i = posicion; i < fin; i++) items.push({ tipo: 'unidad', cambio: cambios[i] as CambioDeUnidad })
    } else {
      for (let i = posicion; i < posicion + visiblesAntes; i++) items.push({ tipo: 'unidad', cambio: cambios[i] as CambioDeUnidad })
      items.push({ tipo: 'plegado', desde: posicion + visiblesAntes, cantidad: plegadas })
      for (let i = fin - visiblesDespues; i < fin; i++) items.push({ tipo: 'unidad', cambio: cambios[i] as CambioDeUnidad })
    }

    posicion = fin
  }

  return items
}

/**
 * La unidad que representa un cambio en pantalla: la nueva, salvo en lo eliminado.
 *
 * @param cambio el cambio de una unidad
 * @returns la unidad a mostrar; `null` solo con una comparación malformada
 */
export function unidadVisible (cambio: CambioDeUnidad): UnidadActa | null {
  return cambio.nuevo ?? cambio.anterior
}

/** Un bloque suelto de la comparación. */
export interface TramoSuelto {
  tipo: 'suelto'
  etiqueta: Exclude<EtiquetaDeUnidad, 'li'>
  cambio: CambioDeUnidad
}

/** Puntos de una misma lista seguidos, que se dibujan dentro de un único `ul` u `ol`. */
export interface TramoDeLista {
  tipo: 'lista'
  lista: 'ul' | 'ol'
  cambios: CambioDeUnidad[]
}

/** Un tramo plegado, tal cual. */
export type TramoDeDiferencias = TramoSuelto | TramoDeLista | ItemPlegado

/**
 * Junta los puntos de lista consecutivos para dibujarlos en una sola lista.
 *
 * Una lista se corta con cualquier bloque que no sea un punto de la misma lista y con un tramo
 * plegado.
 *
 * @param items la comparación compacta
 * @returns los tramos en orden; las unidades sin contenido (sin unidad que mostrar) se omiten
 */
export function agruparEnTramos (items: readonly ItemDeDiferencias[]): TramoDeDiferencias[] {
  const tramos: TramoDeDiferencias[] = []

  for (const item of items) {
    if (item.tipo === 'plegado') {
      tramos.push(item)
      continue
    }

    const unidad = unidadVisible(item.cambio)

    if (unidad === null) continue

    const ultimo = tramos[tramos.length - 1]

    if (unidad.etiqueta !== 'li') {
      tramos.push({ tipo: 'suelto', etiqueta: unidad.etiqueta, cambio: item.cambio })
    } else if (ultimo?.tipo === 'lista' && ultimo.lista === unidad.lista) {
      ultimo.cambios.push(item.cambio)
    } else {
      tramos.push({ tipo: 'lista', lista: unidad.lista ?? 'ul', cambios: [item.cambio] })
    }
  }

  return tramos
}
