import { normalizar } from './salas.ts'

/**
 * Lógica pura del selector de etiquetas: qué ofrecer mientras se escribe.
 *
 * El problema que resuelve es de datos, no de pantalla: el catálogo ya tiene "Licitación" y
 * "licitaciones" como dos etiquetas distintas, porque cada quien escribió la suya sin ver que había
 * otra. Mostrar las parecidas antes de crear una nueva es lo único que frena ese goteo; filtrarlas
 * después cuesta un barrido a mano por Tarea.
 */

/** Cuántas sugerencias se muestran como mucho. Más que esto ya no se lee, se recorre. */
const MAXIMO_DE_SUGERENCIAS = 8

/** Largo máximo de un nombre de etiqueta: la columna `tbltags.name` es `varchar(100)`. */
export const LARGO_MAXIMO_ETIQUETA = 100

/** Lo que el selector ofrece para un texto escrito. */
export interface SugerenciasDeEtiqueta {
  /** La etiqueta del catálogo que es la misma que lo escrito, sin mirar mayúsculas ni acentos. */
  exacta: string | null
  /** Las del catálogo que contienen lo escrito; primero las que empiezan igual. */
  coincidencias: string[]
  /** Las que no lo contienen pero se le parecen: un error de tipeo o una variante. */
  parecidas: string[]
  /** Lo escrito, recortado, si se puede crear como etiqueta nueva; `null` si ya existe o no sirve. */
  nueva: string | null
}

/**
 * ¿Son la misma etiqueta? Sin mirar mayúsculas, acentos ni espacios a los lados.
 *
 * Es el criterio con el que conviene deduplicar en el navegador. La API compara con la collation de
 * `tbltags.name`, que ignora mayúsculas; los acentos se ignoran acá además para no ofrecer
 * "Licitacion" como nueva cuando ya existe "Licitación".
 */
export function esMismaEtiqueta (a: string, b: string): boolean {
  return normalizar(a) === normalizar(b)
}

/**
 * Distancia de edición entre dos textos (inserciones, borrados y cambios de una letra).
 *
 * @returns el número de cambios, cortado en `tope + 1` para no recorrer de más en textos largos
 */
function distancia (a: string, b: string, tope: number): number {
  if (Math.abs(a.length - b.length) > tope) return tope + 1

  let previa = Array.from({ length: b.length + 1 }, (_, indice) => indice)

  for (let i = 1; i <= a.length; i++) {
    const actual = [i]
    let minimoDeFila = i

    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1
      const valor = Math.min((previa[j] ?? 0) + 1, (actual[j - 1] ?? 0) + 1, (previa[j - 1] ?? 0) + costo)
      actual.push(valor)
      minimoDeFila = Math.min(minimoDeFila, valor)
    }

    if (minimoDeFila > tope) return tope + 1
    previa = actual
  }

  return previa[b.length] ?? tope + 1
}

/**
 * Cuántos errores se toleran para llamar "parecida" a una etiqueta.
 *
 * Crece con el largo: en tres letras un cambio ya es otra palabra ("ppt" y "pdf"), en once es un
 * error de tipeo ("licitasion").
 */
function toleranciaPara (largo: number): number {
  if (largo <= 3) return 0
  if (largo <= 6) return 1

  return 2
}

/**
 * Qué ofrecer para lo que se lleva escrito.
 *
 * - Las ya elegidas no se ofrecen de nuevo.
 * - Con el campo vacío se ofrece el catálogo en orden alfabético, para elegir sin escribir.
 * - "Parecida" compara contra el nombre entero y contra su comienzo del mismo largo que lo escrito,
 *   así "licitasi" encuentra "Licitaciones" antes de terminar de escribir.
 *
 * @param catalogo los nombres de las etiquetas existentes (`lookups.tags`)
 * @param texto lo escrito en el campo
 * @param elegidas los nombres que ya están puestos
 * @returns las sugerencias, a lo sumo `MAXIMO_DE_SUGERENCIAS` entre coincidencias y parecidas
 */
export function sugerenciasDeEtiqueta (
  catalogo: readonly string[] | null | undefined,
  texto: string | null | undefined,
  elegidas: readonly string[] = []
): SugerenciasDeEtiqueta {
  const escrito = (texto ?? '').trim()
  const buscado = normalizar(escrito)
  const puestas = new Set(elegidas.map(normalizar))
  const disponibles = [...new Set((catalogo ?? []).filter((nombre) => typeof nombre === 'string' && nombre.trim() !== ''))]
    .filter((nombre) => !puestas.has(normalizar(nombre)))

  if (buscado === '') {
    return {
      exacta: null,
      coincidencias: [...disponibles].sort((a, b) => a.localeCompare(b, 'es')).slice(0, MAXIMO_DE_SUGERENCIAS),
      parecidas: [],
      nueva: null
    }
  }

  const exacta = (catalogo ?? []).find((nombre) => normalizar(nombre) === buscado) ?? null
  const rango = (nombre: string): number => normalizar(nombre).startsWith(buscado) ? 0 : 1
  const coincidencias = disponibles
    .filter((nombre) => normalizar(nombre).includes(buscado))
    .sort((a, b) => rango(a) - rango(b) || a.length - b.length || a.localeCompare(b, 'es'))
    .slice(0, MAXIMO_DE_SUGERENCIAS)

  const tolerancia = toleranciaPara(buscado.length)
  const parecidas = tolerancia === 0
    ? []
    : disponibles
      .filter((nombre) => !coincidencias.includes(nombre) && !normalizar(nombre).includes(buscado))
      .map((nombre) => {
        const normal = normalizar(nombre)

        return {
          nombre,
          cambios: Math.min(
            distancia(buscado, normal, tolerancia),
            distancia(buscado, normal.slice(0, buscado.length), tolerancia)
          )
        }
      })
      .filter(({ cambios }) => cambios <= tolerancia)
      .sort((a, b) => a.cambios - b.cambios || a.nombre.localeCompare(b.nombre, 'es'))
      .slice(0, MAXIMO_DE_SUGERENCIAS - coincidencias.length)
      .map(({ nombre }) => nombre)

  const yaPuesta = puestas.has(buscado)
  const nueva = exacta === null && !yaPuesta && escrito.length <= LARGO_MAXIMO_ETIQUETA ? escrito : null

  return { exacta: yaPuesta ? null : exacta, coincidencias, parecidas, nueva }
}

/**
 * Suma una etiqueta a la lista sin repetirla.
 *
 * Si lo que se suma es la misma que una del catálogo se guarda con el nombre del catálogo: así
 * "licitación" escrita a mano se vincula a la "Licitación" que ya existe en vez de pedirle a la API
 * que cree otra.
 *
 * @param elegidas los nombres ya puestos
 * @param nombre el que se agrega
 * @param catalogo los nombres existentes
 * @returns la lista nueva, o la misma si el nombre estaba vacío, era muy largo o ya estaba
 */
export function agregarEtiqueta (
  elegidas: readonly string[],
  nombre: string,
  catalogo: readonly string[] = []
): string[] {
  const limpio = nombre.trim()

  if (limpio === '' || limpio.length > LARGO_MAXIMO_ETIQUETA) return [...elegidas]
  if (elegidas.some((elegida) => esMismaEtiqueta(elegida, limpio))) return [...elegidas]

  return [...elegidas, catalogo.find((existente) => esMismaEtiqueta(existente, limpio)) ?? limpio]
}
