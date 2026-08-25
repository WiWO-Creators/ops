import type { DefinicionRecurso, EstadoConsulta } from '@/definiciones/tipos'

/**
 * Traduccion entre el estado de una vista y la consulta que entiende la API.
 *
 * Es el punto donde el frontend puede romper el contrato sin darse cuenta: el backend valida
 * `filter[]`, `sort` e `include` contra whitelists y responde `422` ante cualquier nombre que no
 * conozca — no lo ignora. Por eso aca se poda contra la definicion antes de salir: un filtro que la
 * definicion no declara nunca llega a viajar.
 *
 * Sin dependencias de Next ni de React: se prueba con el runner de Node.
 */

/** Tope duro del backend. Pedir mas no falla: se recorta en silencio, y una UI que ofrezca 200 miente. */
export const POR_PAGINA_MAXIMO = 100
export const POR_PAGINA_POR_DEFECTO = 25

/**
 * Convierte los `searchParams` de una pagina en `URLSearchParams`.
 *
 * Next entrega un objeto donde un mismo parametro puede venir como cadena o como lista. Esta funcion
 * lo normaliza para que `leerConsulta` reciba siempre lo mismo, y existe para que cada pagina de
 * listado no repita el mismo bucle: son doce modulos.
 */
export function paramsDeUrl (crudos: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams()

  for (const [clave, valor] of Object.entries(crudos)) {
    if (valor === undefined) continue

    params.set(clave, Array.isArray(valor) ? valor.join(',') : valor)
  }

  return params
}

/** Estado inicial de una vista, tomando el orden por defecto de su definicion. */
export function estadoInicial<T> (definicion: DefinicionRecurso<T>): EstadoConsulta {
  return {
    pagina: 1,
    porPagina: POR_PAGINA_POR_DEFECTO,
    filtros: {},
    orden: [definicion.ordenPorDefecto],
    busqueda: '',
    includes: definicion.incluirSiempre ?? []
  }
}

/**
 * Arma la query string para la API.
 *
 * Poda todo lo que la definicion no declare: filtros, campos de orden e includes desconocidos se
 * descartan en vez de provocar un `422`. La busqueda se ignora si el recurso no la acepta.
 *
 * @param estado Lo que la persona eligio en la vista.
 * @param definicion El recurso, con sus whitelists.
 * @returns La query string sin `?` inicial. Cadena vacia si no hay nada que enviar.
 */
export function construirConsulta<T> (estado: EstadoConsulta, definicion: DefinicionRecurso<T>): string {
  const params = new URLSearchParams()

  const pagina = Math.max(1, Math.trunc(estado.pagina))
  if (pagina !== 1) params.set('page', String(pagina))

  const porPagina = acotarPorPagina(estado.porPagina)
  if (porPagina !== POR_PAGINA_POR_DEFECTO) params.set('per_page', String(porPagina))

  const porClave = new Map(definicion.filtros.map((f) => [f.clave, f]))

  for (const clave of Object.keys(estado.filtros).sort()) {
    const filtro = porClave.get(clave)

    if (filtro === undefined) continue

    const valores = (estado.filtros[clave] ?? []).filter((v) => v !== '')

    if (valores.length === 0) continue

    // Un rango es un control con dos parametros distintos. Unirlos en una lista los convertiria en
    // un `IN (desde, hasta)`, que sobre una fecha no devuelve casi nada.
    if (filtro.clavesRango !== undefined) {
      const [desde, hasta] = filtro.clavesRango

      if (valores[0] !== undefined) params.set(`filter[${desde}]`, valores[0])
      if (valores[1] !== undefined) params.set(`filter[${hasta}]`, valores[1])

      continue
    }

    params.set(`filter[${clave}]`, valores.join(','))
  }

  const orden = estado.orden.filter((campo) => definicion.ordenables.includes(sinSigno(campo)))
  if (orden.length > 0) params.set('sort', orden.join(','))

  const busqueda = estado.busqueda.trim()
  if (definicion.busqueda && busqueda !== '') params.set('q', busqueda)

  const includes = [...new Set(estado.includes)].filter((i) => definicion.includes.includes(i))
  if (includes.length > 0) params.set('include', includes.join(','))

  return params.toString()
}

/**
 * Lee el estado de una vista desde los parametros de la URL.
 *
 * Lo desconocido se descarta en silencio: una URL vieja o escrita a mano tiene que producir una vista
 * util, no un error.
 */
export function leerConsulta<T> (
  params: URLSearchParams,
  definicion: DefinicionRecurso<T>
): EstadoConsulta {
  const estado = estadoInicial(definicion)

  estado.pagina = enteroPositivo(params.get('page')) ?? 1
  estado.porPagina = acotarPorPagina(enteroPositivo(params.get('per_page')) ?? POR_PAGINA_POR_DEFECTO)

  for (const filtro of definicion.filtros) {
    if (filtro.clavesRango !== undefined) {
      const [desde, hasta] = filtro.clavesRango
      const extremos = [params.get(`filter[${desde}]`) ?? '', params.get(`filter[${hasta}]`) ?? '']

      if (extremos.some((v) => v !== '')) estado.filtros[filtro.clave] = extremos

      continue
    }

    const crudo = params.get(`filter[${filtro.clave}]`)

    if (crudo === null || crudo === '') continue

    const valores = crudo.split(',').map((v) => v.trim()).filter((v) => v !== '')

    if (valores.length > 0) estado.filtros[filtro.clave] = valores
  }

  const orden = (params.get('sort') ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c !== '' && definicion.ordenables.includes(sinSigno(c)))

  if (orden.length > 0) estado.orden = orden

  if (definicion.busqueda) estado.busqueda = params.get('q') ?? ''

  const includes = (params.get('include') ?? '')
    .split(',')
    .map((i) => i.trim())
    .filter((i) => definicion.includes.includes(i))

  estado.includes = [...new Set([...(definicion.incluirSiempre ?? []), ...includes])]

  return estado
}

/**
 * Alterna el orden de una columna, al estilo de una tabla: primero ascendente, luego descendente.
 *
 * Ordenar por una columna reemplaza el orden anterior en vez de acumularlo: acumular es util pero
 * ilegible sin una interfaz que lo muestre, y esa no existe todavia.
 */
export function alternarOrden (orden: string[], campo: string): string[] {
  const actual = orden[0]

  if (actual === campo) return [`-${campo}`]
  if (actual === `-${campo}`) return [campo]

  return [campo]
}

/** Direccion actual de un campo dentro del orden, para pintar la flecha del encabezado. */
export function direccionDe (orden: string[], campo: string): 'asc' | 'desc' | null {
  if (orden.includes(campo)) return 'asc'
  if (orden.includes(`-${campo}`)) return 'desc'

  return null
}

function sinSigno (campo: string): string {
  return campo.startsWith('-') ? campo.slice(1) : campo
}

function acotarPorPagina (valor: number): number {
  if (!Number.isFinite(valor) || valor < 1) return POR_PAGINA_POR_DEFECTO

  return Math.min(Math.trunc(valor), POR_PAGINA_MAXIMO)
}

function enteroPositivo (crudo: string | null): number | null {
  if (crudo === null) return null

  const valor = Number(crudo)

  return Number.isInteger(valor) && valor > 0 ? valor : null
}
