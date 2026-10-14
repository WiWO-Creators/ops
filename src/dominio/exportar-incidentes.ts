import type { Incidente } from '@/datos/recursos'

/** Cuántos códigos y cuántas peticiones distintas se listan por grupo antes de resumir con "+N más". */
const MAX_CODIGOS = 10
const MAX_PETICIONES = 5

/**
 * Incidentes que son el mismo error: misma excepción, mismo mensaje y mismo punto del código.
 *
 * `filas` sale ordenado como vino de la API (más reciente primero), así que la primera fila es la
 * representativa: es la que se usa para pedir la traza.
 */
export interface GrupoIncidentes {
  clave: string
  filas: Incidente[]
}

/**
 * Agrupa los incidentes repetidos.
 *
 * Un mismo bug suele dejar decenas de filas idénticas; exportarlas una por una entierra los errores
 * distintos debajo del que más se repite. La clave incluye el origen porque un mismo mensaje en el
 * panel y en la API se investiga en lugares distintos.
 *
 * @param incidentes filas de `GET /incidentes`, en el orden de la API
 * @returns los grupos, del que más veces ocurrió al que menos
 */
export function agruparIncidentes (incidentes: Incidente[]): GrupoIncidentes[] {
  const grupos = new Map<string, Incidente[]>()

  for (const incidente of incidentes) {
    const clave = [incidente.origen, incidente.tipo, incidente.mensaje, incidente.archivo, incidente.linea].join('\u0000')
    const filas = grupos.get(clave)

    if (filas === undefined) grupos.set(clave, [incidente])
    else filas.push(incidente)
  }

  return [...grupos.entries()]
    .map(([clave, filas]) => ({ clave, filas }))
    .sort((a, b) => b.filas.length - a.filas.length)
}

/**
 * Lista hasta `maximo` valores y resume el resto, para que un grupo de 300 filas no sea un muro.
 *
 * @param valores los valores ya sin repetir
 * @param maximo cuántos mostrar
 * @returns los valores separados por coma, con "+N más" si sobraron
 */
function listarAcotado (valores: string[], maximo: number): string {
  const visibles = valores.slice(0, maximo).join(', ')
  const resto = valores.length - maximo

  return resto > 0 ? `${visibles} (+${resto} más)` : visibles
}

/**
 * Un grupo en texto plano: qué falló, dónde, cuántas veces, desde qué peticiones y la traza.
 *
 * @param grupo el grupo a describir
 * @param numero su posición en el reporte, desde 1
 * @param traza la traza del incidente representativo; `null` si no la hay o no se pudo traer
 * @returns el bloque de texto del grupo
 */
function bloqueDeGrupo (grupo: GrupoIncidentes, numero: number, traza: string | null): string {
  const [primero] = grupo.filas
  const ultimo = grupo.filas[grupo.filas.length - 1]

  if (primero === undefined || ultimo === undefined) return ''

  const peticiones = [...new Set(grupo.filas.map((fila) => `${fila.metodo} ${fila.uri}`))]
  const codigos = grupo.filas.map((fila) => fila.incidente)
  const veces = grupo.filas.length === 1 ? '1 vez' : `${grupo.filas.length} veces`

  return [
    `## ${numero}. [${primero.origen}] ${primero.tipo} — ${veces}`,
    `Mensaje: ${primero.mensaje}`,
    `Dónde: ${primero.archivo}:${primero.linea}`,
    `Entre: ${ultimo.creado_en} y ${primero.creado_en}`,
    `Peticiones: ${listarAcotado(peticiones, MAX_PETICIONES)}`,
    `Códigos: ${listarAcotado(codigos, MAX_CODIGOS)}`,
    `Traza (de ${primero.incidente}):`,
    traza ?? '(sin traza)'
  ].join('\n')
}

/**
 * El reporte completo, listo para copiar y pegar en una conversación.
 *
 * @param grupos los grupos, en el orden en que se quieren mostrar
 * @param trazas traza por código de incidente representativo; los que falten salen "(sin traza)"
 * @param total cuántos incidentes hay en la base, para decir si el reporte cubre todos o no
 * @returns el texto entero; con cero grupos, una sola línea que lo dice
 */
export function textoDeExportacion (
  grupos: GrupoIncidentes[],
  trazas: Map<string, string | null>,
  total: number
): string {
  const cubiertos = grupos.reduce((suma, grupo) => suma + grupo.filas.length, 0)

  if (cubiertos === 0) return 'Incidentes de WiWO Ops: no hay ninguno registrado.'

  const alcance = cubiertos < total ? `los ${cubiertos} más recientes de ${total}` : `${cubiertos} en total`
  const encabezado = `Incidentes de WiWO Ops — ${alcance}, ${grupos.length} errores distintos.`
  const bloques = grupos.map((grupo, indice) =>
    bloqueDeGrupo(grupo, indice + 1, trazas.get(grupo.filas[0]?.incidente ?? '') ?? null)
  )

  return [encabezado, ...bloques].join('\n\n')
}
