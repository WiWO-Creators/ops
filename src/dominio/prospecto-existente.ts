/**
 * Coincidencia entre lo que se escribe en la Empresa del alta de licitación y los prospectos que ya
 * existen.
 *
 * Existe porque el alta creaba un prospecto nuevo por cada licitación aunque la empresa ya estuviera:
 * así se duplicaron SERNATUR y «Puerto San Antonio / EPSA». La API busca con `LIKE` sobre una columna
 * `utf8mb4_unicode_ci`, que ya ignora mayúsculas y acentos; esto hace la misma comparación del lado
 * del navegador para ordenar las sugerencias y para saber si lo escrito es exactamente una que existe.
 */

/** Lo mínimo que hace falta de un prospecto para ofrecerlo como sugerencia. */
export interface ProspectoSugerible {
  id: number
  empresa: string
}

/** Resultado de comparar lo escrito con los prospectos que devolvió la búsqueda. */
export interface CoincidenciasDeEmpresa<T extends ProspectoSugerible> {
  /** Los prospectos a ofrecer, el exacto primero y luego los que empiezan igual. */
  sugerencias: T[]
  /** El prospecto cuya empresa es la escrita, salvo mayúsculas, acentos y espacios de borde. */
  exacta: T | null
}

/** Largo mínimo, ya sin espacios de borde, a partir del cual se consulta a la API. */
export const LARGO_MINIMO_DE_BUSQUEDA = 2

/** Tope de sugerencias que se muestran bajo el campo. */
export const MAXIMO_DE_SUGERENCIAS = 5

/**
 * Lleva un nombre de empresa a su forma comparable.
 *
 * @param texto lo escrito o el nombre guardado; `null`/`undefined` valen como vacío
 * @returns en minúsculas, sin marcas diacríticas y sin espacios de borde
 */
export function normalizarEmpresa (texto: string | null | undefined): string {
  if (typeof texto !== 'string') return ''

  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

/**
 * El término que se manda como `q` a `GET /prospectos`, o `null` si no vale la pena buscar.
 *
 * Se recortan los bordes porque la API busca `%término%` literal: un espacio al final dejaría fuera
 * justo a la empresa que se está escribiendo.
 *
 * @param texto lo escrito en el campo Empresa
 * @returns el texto recortado, o `null` si está vacío o es más corto que el mínimo
 */
export function terminoDeBusqueda (texto: string | null | undefined): string | null {
  if (typeof texto !== 'string') return null
  const recortado = texto.trim()

  return normalizarEmpresa(recortado).length >= LARGO_MINIMO_DE_BUSQUEDA ? recortado : null
}

/**
 * Ordena y filtra los prospectos que devolvió la API contra lo escrito.
 *
 * Se vuelve a filtrar en el navegador aunque la API ya filtró: la respuesta puede llegar tarde, de
 * una búsqueda anterior, y ofrecer lo que ya no coincide con el campo confunde más que no ofrecer.
 *
 * @param prospectos la página que devolvió `GET /prospectos?q=`
 * @param texto lo escrito en el campo Empresa
 * @returns las sugerencias ordenadas (exacta, luego prefijo, luego alfabético) y la exacta si hay
 */
export function coincidenciasDeEmpresa<T extends ProspectoSugerible> (
  prospectos: readonly T[] | null | undefined,
  texto: string | null | undefined
): CoincidenciasDeEmpresa<T> {
  const buscado = normalizarEmpresa(texto)
  if (buscado.length < LARGO_MINIMO_DE_BUSQUEDA || !Array.isArray(prospectos)) return { sugerencias: [], exacta: null }

  const rango = (empresa: string): number => empresa === buscado ? 0 : empresa.startsWith(buscado) ? 1 : 2
  const candidatos = prospectos
    .map((prospecto) => ({ prospecto, empresa: normalizarEmpresa(prospecto.empresa) }))
    .filter(({ empresa }) => empresa.includes(buscado))
    .sort((a, b) => rango(a.empresa) - rango(b.empresa) || a.empresa.localeCompare(b.empresa, 'es'))

  return {
    sugerencias: candidatos.slice(0, MAXIMO_DE_SUGERENCIAS).map(({ prospecto }) => prospecto),
    exacta: candidatos.find(({ empresa }) => empresa === buscado)?.prospecto ?? null
  }
}
