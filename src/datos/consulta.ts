import { operadoresCampo } from '../definiciones/filtros.ts'
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

/**
 * Tope del selector de tamaño de pagina de las tablas.
 *
 * Ya no es el tope del backend —ese subio a 500 para que los catalogos del alta rapida entren en una
 * lectura—, sino el de esta interfaz: cien filas es lo que una tabla se puede pintar y recorrer sin
 * volverse inutil. Pedir mas no falla, se recorta, y un selector que ofrezca 500 miente igual.
 */
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
    orden: Array.isArray(definicion.ordenPorDefecto) ? definicion.ordenPorDefecto : [definicion.ordenPorDefecto],
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

    if (filtro === undefined || filtro.noDisponible) continue

    const originales = estado.filtros[clave] ?? []
    if (filtro.tipo === 'campo') {
      const [operador = '', valor = ''] = originales
      if (!operadoresCampo(filtro).includes(operador)) continue
      if (operador === 'empty' || operador === 'not_empty') params.set(`filter[${clave}__${operador}]`, '1')
      else if (valor !== '') params.set(`filter[${clave}__${operador}]`, valor)
      continue
    }
    const valores = originales.filter((v) => v !== '')

    if (valores.length === 0) continue

    // Un rango es un control con dos parametros distintos. Unirlos en una lista los convertiria en
    // un `IN (desde, hasta)`, que sobre una fecha no devuelve casi nada.
    if (filtro.clavesRango !== undefined) {
      const [desde, hasta] = filtro.clavesRango

      if (originales[0]) params.set(`filter[${desde}]`, originales[0])
      if (originales[1]) params.set(`filter[${hasta}]`, originales[1])

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
    if (filtro.noDisponible) continue
    if (filtro.tipo === 'campo') {
      for (const operador of operadoresCampo(filtro)) {
        const valor = params.get(`filter[${filtro.clave}__${operador}]`)
        if (valor === null || valor === '') continue
        estado.filtros[filtro.clave] = [operador, ['empty', 'not_empty'].includes(operador) ? '' : valor]
        break
      }
      continue
    }
    if (filtro.clavesRango !== undefined) {
      const [desde, hasta] = filtro.clavesRango
      const extremos = [params.get(`filter[${desde}]`) ?? '', params.get(`filter[${hasta}]`) ?? '']

      if (extremos.some((v) => v !== '')) estado.filtros[filtro.clave] = extremos

      continue
    }

    // El `assignee` suelto es la forma vieja de "las tareas de esta persona", y sigue llegando desde
    // enlaces guardados y desde los paneles que arman la URL a mano. Se lee como si viniera envuelto,
    // pero solo si son identificadores: el backend lo compara contra una columna numerica y un
    // `assignee=juan` de una URL escrita a mano seria un 422 en vez de una lista.
    const crudo = params.get(`filter[${filtro.clave}]`) ?? asignadoLegado(filtro.clave, params)

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
 * El `assignee` suelto de las URLs viejas, si trae identificadores.
 *
 * @param clave La clave del filtro que se esta leyendo.
 * @param params Los parametros de la URL.
 * @returns La lista de ids tal como venia, o `null` si no aplica o no son numeros.
 */
function asignadoLegado (clave: string, params: URLSearchParams): string | null {
  if (clave !== 'assignee') return null

  const crudo = params.get('assignee')

  return crudo !== null && /^\d+(,\d+)*$/.test(crudo) ? crudo : null
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

/**
 * Acota tareas al período del calendario manteniendo todos los filtros elegidos.
 * @param estado Filtros de la vista.
 * @param definicion Catálogo del recurso.
 * @param rango Período visible, inclusivo.
 * @param sinVencimiento Selecciona tareas sin entrega que empiezan en el período.
 * @returns Consulta de API con rango intersectado, sin paginación de la tabla.
 */
export function consultaDelCalendario<T> (
  estado: EstadoConsulta,
  definicion: DefinicionRecurso<T>,
  rango: { desde: string, hasta: string },
  sinVencimiento = false
): URLSearchParams {
  const params = new URLSearchParams(construirConsulta({ ...estado, orden: [], pagina: 1 }, definicion))
  const prefijo = sinVencimiento ? 'start_date' : 'due_date'
  const desde = params.get(`filter[${prefijo}__gte]`)
  const hasta = params.get(`filter[${prefijo}__lte]`)
  params.set(`filter[${prefijo}__gte]`, desde && desde > rango.desde ? desde : rango.desde)
  params.set(`filter[${prefijo}__lte]`, hasta && hasta < rango.hasta ? hasta : rango.hasta)
  params.set('sort', sinVencimiento ? 'start_date' : 'due_date')
  if (sinVencimiento) params.set('filter[due_date__empty]', '1')
  return params
}
