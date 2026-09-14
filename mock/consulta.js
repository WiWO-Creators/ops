/**
 * Motor de consulta del mock: traduce los parametros de la URL (`page`, `per_page`, `sort`,
 * `filter[...]`, `q`, `fields`, `include`) a un recorte de filas mas su bloque de paginacion.
 *
 * Es deliberadamente estricto con la whitelist: un `filter[]` o un `sort` que el recurso no declara
 * devuelve 422 en vez de ignorarse. Un filtro que se ignora en silencio es peor que uno que falla:
 * la interfaz muestra datos de mas y nadie se entera.
 */

export const PER_PAGE_POR_DEFECTO = 25
/** El mismo tope que `Nucleo\Consulta::POR_PAGINA_MAXIMO` de la API: pedir de mas se recorta. */
export const PER_PAGE_MAXIMO = 500

/** Error con la forma del envelope del contrato. `detalles` solo se usa en 422. */
export class ErrorApi extends Error {
  /**
   * @param {number} estado codigo HTTP
   * @param {string} codigo codigo de error del contrato (`validation_failed`, `not_found`, ...)
   * @param {string} mensaje texto legible
   * @param {Record<string, string[]>|null} detalles errores por campo
   */
  constructor (estado, codigo, mensaje, detalles = null) {
    super(mensaje)
    this.name = 'ErrorApi'
    this.estado = estado
    this.codigo = codigo
    this.detalles = detalles
  }
}

/**
 * Lee `filter[clave]=valor` de un `URLSearchParams`.
 *
 * @param {URLSearchParams} parametros
 * @returns {Record<string, string>}
 */
export function leerFiltros (parametros) {
  const filtros = {}
  for (const [clave, valor] of parametros.entries()) {
    const coincidencia = /^filter\[([^\]]+)\]$/.exec(clave)
    if (coincidencia) filtros[coincidencia[1]] = valor
  }
  return filtros
}

/**
 * Interpreta `page` y `per_page`.
 *
 * @param {URLSearchParams} parametros
 * @returns {{page: number, per_page: number}}
 * @throws {ErrorApi} 422 si alguno no es un entero positivo
 */
export function leerPaginacion (parametros) {
  const entero = (nombre, porDefecto) => {
    const crudo = parametros.get(nombre)
    if (crudo === null || crudo === '') return porDefecto
    if (!/^\d+$/.test(crudo)) {
      throw new ErrorApi(422, 'validation_failed', `El parámetro "${nombre}" debe ser un entero.`, {
        [nombre]: ['integer']
      })
    }
    const valor = Number(crudo)
    if (valor < 1) {
      throw new ErrorApi(422, 'validation_failed', `El parámetro "${nombre}" debe ser mayor que cero.`, {
        [nombre]: ['min:1']
      })
    }
    return valor
  }

  return {
    page: entero('page', 1),
    // Recortar en vez de fallar: pedir 500 es un cliente optimista, no un cliente roto.
    per_page: Math.min(entero('per_page', PER_PAGE_POR_DEFECTO), PER_PAGE_MAXIMO)
  }
}

/**
 * Interpreta `sort=-fecha,nombre` contra la whitelist del recurso.
 *
 * @param {URLSearchParams} parametros
 * @param {string[]} permitidas columnas ordenables del recurso
 * @returns {{columna: string, direccion: 'asc'|'desc'}[]}
 * @throws {ErrorApi} 422 si alguna columna no esta en la whitelist
 */
export function leerOrden (parametros, permitidas) {
  const crudo = parametros.get('sort')
  if (!crudo) return []

  return crudo.split(',').filter(Boolean).map((pieza) => {
    const descendente = pieza.startsWith('-')
    const columna = descendente ? pieza.slice(1) : pieza
    if (!permitidas.includes(columna)) {
      throw new ErrorApi(422, 'validation_failed', `No se puede ordenar por "${columna}".`, {
        sort: [`unknown:${columna}`]
      })
    }
    return { columna, direccion: descendente ? 'desc' : 'asc' }
  })
}

/** True si el valor no aporta nada al ordenamiento. */
const esVacio = (valor) => valor === null || valor === undefined

/** Compara dos valores NO vacios. Los vacios los resuelve `compararColumna`. */
function comparar (a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'es')
}

/**
 * Compara una columna entre dos filas, ya con la direccion aplicada.
 *
 * Los vacios van al final en las DOS direcciones, asi que se resuelven antes de invertir el signo:
 * negar el comparador completo tambien invertiria esa regla y una fila sin fecha de vencimiento
 * encabezaria la lista descendente.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @param {'asc'|'desc'} direccion
 * @returns {number}
 */
function compararColumna (a, b, direccion) {
  if (esVacio(a) && esVacio(b)) return 0
  if (esVacio(a)) return 1
  if (esVacio(b)) return -1
  const signo = comparar(a, b)
  return direccion === 'desc' ? -signo : signo
}

/**
 * Recorta cada fila a las claves pedidas en `fields`.
 *
 * Se aplica DESPUES de filtrar y ordenar, nunca antes: si no, ordenar por una columna que el cliente
 * no pidio dejaria de funcionar.
 *
 * @param {object[]} filas
 * @param {URLSearchParams} parametros
 * @returns {object[]}
 */
export function recortarCampos (filas, parametros) {
  const crudo = parametros.get('fields')
  if (!crudo) return filas

  const claves = crudo.split(',').map((c) => c.trim()).filter(Boolean)
  if (claves.length === 0) return filas

  // `id` viaja siempre: sin el, el cliente no puede identificar la fila que acaba de recibir.
  const conId = claves.includes('id') ? claves : ['id', ...claves]
  return filas.map((fila) => Object.fromEntries(conId.filter((c) => c in fila).map((c) => [c, fila[c]])))
}

/**
 * Lee `include=a,b` contra la whitelist del recurso.
 *
 * @param {URLSearchParams} parametros
 * @param {string[]} permitidos
 * @returns {string[]}
 * @throws {ErrorApi} 422 si alguno no esta permitido
 */
export function leerIncludes (parametros, permitidos) {
  const crudo = parametros.get('include')
  if (!crudo) return []

  return crudo.split(',').map((p) => p.trim()).filter(Boolean).map((pieza) => {
    if (!permitidos.includes(pieza)) {
      throw new ErrorApi(422, 'validation_failed', `No se puede incluir "${pieza}".`, {
        include: [`unknown:${pieza}`]
      })
    }
    return pieza
  })
}

/**
 * Aplica filtros, busqueda, orden y paginacion sobre un conjunto de filas.
 *
 * @param {object[]} filas conjunto completo del recurso
 * @param {URLSearchParams} parametros query string de la peticion
 * @param {{
 *   filtros?: Record<string, (fila: object, valor: string) => boolean>,
 *   orden?: string[],
 *   derivadas?: Record<string, (fila: object) => unknown>,
 *   busqueda?: string[]
 * }} definicion whitelist del recurso
 * @returns {{filas: object[], paginacion: {page: number, per_page: number, total: number, total_pages: number}}}
 * @throws {ErrorApi} 422 ante un filtro, orden o include fuera de la whitelist
 */
export function aplicarConsulta (filas, parametros, definicion) {
  const {
    filtros: permitidos = {},
    orden: ordenables = [],
    derivadas = {},
    busqueda = []
  } = definicion

  let resultado = filas

  for (const [clave, valor] of Object.entries(leerFiltros(parametros))) {
    const predicado = predicadoDeFiltro(permitidos, clave, valor)

    resultado = resultado.filter((fila) => predicado(fila, valor))
  }

  const texto = (parametros.get('q') ?? '').trim().toLowerCase()
  if (texto && busqueda.length > 0) {
    resultado = resultado.filter((fila) =>
      busqueda.some((campo) => String(fila[campo] ?? '').toLowerCase().includes(texto))
    )
  }

  const orden = leerOrden(parametros, ordenables)
  if (orden.length > 0) {
    // Copia antes de ordenar: `sort` muta, y `filas` es el fixture compartido del proceso.
    resultado = [...resultado].sort((a, b) => {
      for (const { columna, direccion } of orden) {
        // Una columna ordenable puede no ser un campo de la fila: la API ordena Procesos por
        // `completed`, que ahi es un CASE sobre `status` y no una columna de `tbltasks`.
        const leer = derivadas[columna]
        const signo = leer === undefined
          ? compararColumna(a[columna], b[columna], direccion)
          : compararColumna(leer(a), leer(b), direccion)
        if (signo !== 0) return signo
      }
      return 0
    })
  }

  const { page, per_page: perPage } = leerPaginacion(parametros)
  const total = resultado.length
  const desde = (page - 1) * perPage

  return {
    filas: recortarCampos(resultado.slice(desde, desde + perPage), parametros),
    paginacion: {
      page,
      per_page: perPage,
      total,
      total_pages: Math.max(1, Math.ceil(total / perPage))
    }
  }
}

/**
 * Predicado de filtro que acepta un valor o una lista separada por comas (`filter[status]=1,4`).
 *
 * @param {(fila: object) => unknown} extraer
 * @returns {(fila: object, valor: string) => boolean}
 */
export function coincideEnLista (extraer) {
  return (fila, valor) => {
    const buscados = valor.split(',').map((v) => v.trim()).filter(Boolean)
    if (buscados.length === 0) return true
    const propio = extraer(fila)
    const propios = Array.isArray(propio) ? propio : [propio]
    return propios.some((p) => buscados.includes(String(p)))
  }
}

/**
 * Operadores que la API acepta como sufijo de la clave: `filter[name__contains]`.
 *
 * Los cinco de comparacion no valen sobre texto y `contains` solo vale sobre texto, igual que en
 * `Nucleo/Consulta.php`: el mock rechaza lo mismo que produccion o el frontend aprende a mandar algo
 * que despues falla.
 */
const OPERADORES = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'empty', 'not_empty']

/**
 * Declara un campo filtrable con operadores.
 *
 * @param {(fila: object) => unknown} leer De donde sale el valor de la fila. Puede devolver una lista.
 * @param {'texto'|'numero'|'fecha'} [tipo] Que comparaciones admite.
 * @returns {{leer: (fila: object) => unknown, tipo: string}} La declaracion, para la whitelist.
 */
export function campoFiltrable (leer, tipo = 'texto') {
  return { leer, tipo }
}

/**
 * Resuelve el predicado de una clave de filtro, con o sin operador.
 *
 * @param {Record<string, unknown>} permitidos Whitelist del recurso.
 * @param {string} clave Clave tal como llego, quizas con `__operador`.
 * @param {string} valor Valor recibido.
 * @returns {(fila: object, valor: string) => boolean}
 * @throws {ErrorApi} 422 si el campo, el operador o el valor no corresponden.
 */
function predicadoDeFiltro (permitidos, clave, valor) {
  const directo = permitidos[clave]
  if (typeof directo === 'function') return directo

  const corte = clave.lastIndexOf('__')
  const campo = corte === -1 ? clave : clave.slice(0, corte)
  const operador = corte === -1 ? 'eq' : clave.slice(corte + 2)
  const declarado = permitidos[campo]

  if (declarado === undefined || (corte !== -1 && !OPERADORES.includes(operador))) {
    throw new ErrorApi(422, 'validation_failed', `Filtro desconocido: "${clave}".`, {
      [`filter[${clave}]`]: ['unknown']
    })
  }

  if (typeof declarado === 'function') {
    if (operador !== 'eq') {
      throw new ErrorApi(422, 'validation_failed', 'Valor u operador incompatible con el campo.', {
        [`filter[${clave}]`]: ['invalid']
      })
    }

    return declarado
  }

  const { leer, tipo } = declarado
  const esTexto = tipo === 'texto'

  if ((esTexto && ['gt', 'gte', 'lt', 'lte'].includes(operador)) || (operador === 'contains' && !esTexto)) {
    throw new ErrorApi(422, 'validation_failed', 'Valor u operador incompatible con el campo.', {
      [`filter[${clave}]`]: ['invalid']
    })
  }

  return (fila) => cumple(leer(fila), operador, valor, esTexto)
}

/**
 * Compara el valor de una fila con el del filtro.
 *
 * Una lista en la fila —los asignados, las etiquetas— coincide si lo hace alguno de sus elementos,
 * que es lo que hace el `EXISTS` del backend.
 *
 * @param {unknown} propio Valor de la fila.
 * @param {string} operador Uno de `OPERADORES`.
 * @param {string} valor Valor del filtro.
 * @param {boolean} esTexto Si la comparacion es de texto.
 * @returns {boolean}
 */
function cumple (propio, operador, valor, esTexto) {
  const propios = Array.isArray(propio) ? propio : [propio]
  const vacio = propios.length === 0 || propios.every((v) => v === null || v === undefined || v === '')

  if (operador === 'empty') return vacio
  if (operador === 'not_empty') return !vacio
  if (vacio) return operador === 'ne'

  // La coma es una lista solo donde el backend la acepta: sobre texto es parte del valor.
  const buscados = esTexto ? [valor] : valor.split(',').map((v) => v.trim()).filter(Boolean)
  const coincide = propios.some((uno) => buscados.some((buscado) => comparaUno(uno, operador, buscado)))

  return operador === 'ne' ? !coincide : coincide
}

/**
 * Una comparacion suelta entre el valor de la fila y uno del filtro.
 *
 * @param {unknown} propio
 * @param {string} operador
 * @param {string} buscado
 * @returns {boolean}
 */
function comparaUno (propio, operador, buscado) {
  const texto = String(propio)

  if (operador === 'contains') return texto.toLowerCase().includes(buscado.toLowerCase())
  if (operador === 'eq' || operador === 'ne') return texto === buscado

  const izquierda = Number.isNaN(Number(propio)) ? texto : Number(propio)
  const derecha = Number.isNaN(Number(buscado)) ? buscado : Number(buscado)

  if (operador === 'gt') return izquierda > derecha
  if (operador === 'gte') return izquierda >= derecha
  if (operador === 'lt') return izquierda < derecha

  return izquierda <= derecha
}
