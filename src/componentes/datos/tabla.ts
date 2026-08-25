import type { AccionRecurso, Columna, EstadoConsulta, Filtro, OpcionFiltro } from '@/definiciones/tipos'
import type { Capacidad, SobreError } from '@/datos/tipos'

/**
 * Logica del motor de tabla que no necesita React.
 *
 * Vive aparte del `.tsx` a proposito: Node despoja los tipos de un `.ts`, pero no el JSX, asi que
 * una funcion declarada dentro del componente no se podria probar. Todo lo que decida *que* se
 * muestra —columnas, acciones permitidas, mensajes de error— se prueba desde aca.
 *
 * Sin `import` de valores con alias `@/`: las pruebas corren estos archivos con el runner de Node,
 * que no conoce el alias. Los tipos si, porque el stripping los borra antes de resolver.
 */

/** Cuerpo del envelope de error, tal como lo devuelve el BFF. */
export type CuerpoError = SobreError['error']

/**
 * Claves de las columnas que se muestran al abrir la vista.
 *
 * @param columnas columnas de la definicion
 * @returns las claves de las que no arrancan ocultas, en el orden de la definicion
 */
export function clavesVisiblesPorDefecto<T> (columnas: Array<Columna<T>>): string[] {
  return columnas.filter((columna) => columna.ocultaPorDefecto !== true).map((columna) => columna.clave)
}

/**
 * Filtra las columnas a mostrar respetando el orden de la definicion.
 *
 * El orden lo manda la definicion y no el selector: si mandara el selector, activar una columna la
 * mandaria al final y la tabla se reordenaria sola delante de quien la usa.
 *
 * @param columnas columnas de la definicion
 * @param claves claves elegidas en el selector
 * @returns las columnas visibles
 */
export function columnasVisibles<T> (columnas: Array<Columna<T>>, claves: string[]): Array<Columna<T>> {
  const elegidas = new Set(claves)

  return columnas.filter((columna) => elegidas.has(columna.clave))
}

/**
 * Quita las acciones que la persona no puede ejecutar.
 *
 * Ocultar no es autorizar: el backend vuelve a decidir. Se poda igual porque ofrecer un boton que
 * siempre responde 403 es peor que no ofrecerlo.
 *
 * @param acciones acciones declaradas en la definicion
 * @param capacidades capacidades del area, tal como llegan en `permissions` de `/me`
 * @returns las acciones visibles, en el orden declarado
 */
export function podarPorPermisos (
  acciones: AccionRecurso[] | undefined,
  capacidades: Capacidad[]
): AccionRecurso[] {
  if (acciones === undefined) return []

  return acciones.filter((accion) => accion.requiere === undefined || capacidades.includes(accion.requiere))
}

/**
 * Resuelve la ruta de una accion reemplazando `:id` por el de la fila.
 *
 * @param ruta ruta declarada, con `:id`. Ej: `tasks/:id/actions/mark-complete`
 * @param id identificador de la fila
 * @returns la ruta lista para el BFF, sin barra inicial
 */
export function rutaDeAccion (ruta: string, id: string | number): string {
  return ruta.replace(':id', encodeURIComponent(String(id)))
}

/** Tamaños de pagina que ofrece el selector antes de acotarlos al tope del backend. */
const TAMANOS_DE_PAGINA = [10, 25, 50, 100, 200]

/**
 * Opciones del selector de tamaño de pagina.
 *
 * Nunca ofrece mas que el tope del backend: pedir mas no falla, se recorta en silencio, y una UI
 * que ofrezca 200 y devuelva 100 miente.
 *
 * @param maximo tope duro del backend (`POR_PAGINA_MAXIMO`)
 * @param actual valor vigente, que se incluye aunque no sea uno de los estandar
 * @returns tamaños ordenados, sin repetidos y todos menores o iguales al tope
 */
export function opcionesPorPagina (maximo: number, actual: number): number[] {
  const validos = [...TAMANOS_DE_PAGINA, actual].filter((n) => Number.isInteger(n) && n > 0 && n <= maximo)

  return [...new Set(validos)].sort((a, b) => a - b)
}

/**
 * Etiqueta visible de un filtro a partir de la clave que devuelve el backend en `details`.
 *
 * El backend nombra el campo como lo recibio (`filter[status]`, `filter.status` o `status`); acá se
 * normaliza a la clave declarada para poder mostrar el nombre humano.
 */
function etiquetaDeFiltro (claveCruda: string, filtros: Filtro[]): string {
  const clave = claveCruda.replace(/^filter[.[]?/, '').replace(/]$/, '')
  const filtro = filtros.find((f) => f.clave === clave)

  return filtro?.etiqueta ?? clave
}

/**
 * Mensaje que se le muestra a la persona cuando el BFF devuelve un error.
 *
 * En `validation_failed` el `message` generico no alcanza: el 422 sale de un filtro concreto, y sin
 * decir cual la unica salida es borrar la URL entera. Por eso se nombran los filtros de `details`.
 *
 * @param error cuerpo `error` del envelope
 * @param filtros filtros de la definicion, para traducir la clave al nombre visible
 * @returns el mensaje a mostrar; nunca vacio
 */
export function mensajeDeError (error: CuerpoError, filtros: Filtro[]): string {
  if (error.code !== 'validation_failed' || error.details === undefined) return error.message

  const partes = Object.entries(error.details).map(
    ([clave, mensajes]) => `${etiquetaDeFiltro(clave, filtros)}: ${mensajes.join(' ')}`
  )

  if (partes.length === 0) return error.message

  return `El filtro no es válido — ${partes.join(' · ')}`
}

/**
 * Resuelve el valor de una columna contra el catalogo que declara `comoInsignia`.
 *
 * Los estados y las prioridades llegan de la API como numeros. Mostrarlos crudos deja un "2" donde
 * deberia decir "En progreso", y confiar solo en el color deja el estado ilegible para quien no lo
 * distingue: por eso la insignia lleva siempre el nombre, y el color va encima.
 *
 * @param valor lo que devolvio `presentar`
 * @param catalogo la lista del lookup, tal como la arma `opcionesDeFiltros`
 * @returns etiqueta y color, o `null` si el valor no esta en el catalogo — ahi la tabla muestra el
 *          valor crudo, que es mas util que una celda vacia
 */
export function resolverInsignia (
  valor: unknown,
  catalogo: OpcionFiltro[] | undefined
): { etiqueta: string, color: string | undefined } | null {
  if (catalogo === undefined || valor === null || valor === undefined) return null

  const buscado = String(valor)
  const opcion = catalogo.find((o) => o.valor === buscado)

  return opcion === undefined ? null : { etiqueta: opcion.etiqueta, color: opcion.color }
}

/**
 * Texto que muestra el disparador de un filtro de varios valores.
 *
 * Con nada elegido devuelve "Estado: todos", el mismo marcador que muestran los filtros de un solo
 * valor: es lo que dice de que filtro se trata cuando cinco desplegables iguales estan en fila.
 * Con algo elegido devuelve el nombre pelado ("En progreso"), tambien como el filtro de un solo
 * valor: repetir la etiqueta ahi se come el ancho del disparador y termina recortando justamente
 * el dato que se fue a buscar ("Estado: En progr…").
 *
 * Con varios elegidos nombra el primero y cuenta el resto ("En progreso" + "+2"). Un numero suelto
 * ("Estado: 2") se lee como si el valor filtrado fuera el 2, que es exactamente lo que la API
 * recibe en `filter[status]`.
 *
 * El conteo viaja aparte del texto y no pegado a el: el disparador tiene ancho fijo y recorta lo
 * que no entra, y si el conteo fuera parte de la misma cadena seria lo primero en desaparecer,
 * mintiendo sobre cuantos estados estan puestos.
 *
 * Un valor que no este en el catalogo se muestra crudo pero se sigue contando: la consulta vive en
 * la URL y se edita a mano, y el resumen tiene que coincidir con lo que se manda al backend.
 *
 * @param etiqueta nombre del filtro, el de la definicion
 * @param opciones catalogo del filtro, para traducir el valor a su nombre
 * @param valores los valores elegidos, tal como viajan a la API
 * @returns `texto` para el cuerpo del disparador y `extra` con el conteo, o `null` si no hay resto
 */
export function resumenDeFiltro (
  etiqueta: string,
  opciones: OpcionFiltro[],
  valores: string[]
): { texto: string, extra: string | null } {
  if (valores.length === 0) return { texto: `${etiqueta}: todos`, extra: null }

  // `valores[0]` existe: la lista no esta vacia. El `?? ''` es solo para el tipo.
  const primero = valores[0] ?? ''
  const elegida = opciones.find((opcion) => opcion.valor === primero)

  return {
    texto: elegida === undefined ? primero : elegida.etiqueta,
    extra: valores.length === 1 ? null : `+${valores.length - 1}`
  }
}

/**
 * Selector de los controles que viven dentro de una fila y tienen su propio destino.
 *
 * Una fila clickeable con un menu, un selector de estado y un enlace adentro es un campo minado si
 * el clic de la fila se dispara igual: la persona apunta al control y termina en otra pantalla. Estos
 * elementos se quedan con su clic y la fila no hace nada.
 *
 * Va con los roles ademas de las etiquetas porque Radix pinta sus disparadores y sus items con
 * `role`, no siempre con el elemento nativo que les corresponde.
 */
export const SELECTOR_CONTROLES_DE_FILA =
  'a, button, input, select, textarea, label, [role="button"], [role="menuitem"], [role="checkbox"], [role="combobox"], [contenteditable="true"]'

/** Lo unico que hace falta de un elemento del DOM para decidir si el clic era suyo. */
export interface ElementoConAncestros {
  closest: (selector: string) => unknown
}

/**
 * Si el clic nacio en un control propio de la fila.
 *
 * @param objetivo el `event.target` del clic, o `null`
 * @returns `true` si el clic le pertenece a un control y la fila no debe reaccionar
 */
export function esControlDeFila (objetivo: ElementoConAncestros | null): boolean {
  if (objetivo === null) return false

  return objetivo.closest(SELECTOR_CONTROLES_DE_FILA) !== null
}

/**
 * La URL actual con un parametro puesto, conservando todo lo demas.
 *
 * El detalle se abre escribiendo la URL —`?tarea=12`— y no con estado local: asi el enlace se
 * comparte, "atras" lo cierra y recargar no lo pierde. Los filtros, el orden y la pagina vigentes
 * tienen que sobrevivir a esa escritura, o abrir una tarea reiniciaria la vista.
 *
 * @param params los parametros vigentes de la URL
 * @param clave el parametro a escribir
 * @param valor el valor a escribir
 * @returns la URL relativa, siempre con `?` adelante
 */
export function urlConParametro (params: URLSearchParams, clave: string, valor: string): string {
  const siguientes = new URLSearchParams(params.toString())

  siguientes.set(clave, valor)

  return `?${siguientes.toString()}`
}

/**
 * Lee un id de un parametro de la URL.
 *
 * La URL la escribe cualquiera: `?tarea=abc` o `?tarea=-3` no pueden terminar en una peticion al BFF.
 *
 * @param crudo el valor del parametro, o `null` si no viene
 * @returns el id, o `null` si no es un entero positivo
 */
export function idDeParametro (crudo: string | null): number | null {
  if (crudo === null || crudo.trim() === '') return null

  const id = Number(crudo)

  return Number.isInteger(id) && id > 0 ? id : null
}

/**
 * Une la consulta fija de una definicion con la que sale de la vista.
 *
 * La fija acota el listado a un dueño que la ruta no expresa (`filter[clientid]=113` en las Tareas
 * de un Cliente) y no viaja por la URL, asi que no puede salir de `construirConsulta`.
 *
 * @param fija Query string de `DefinicionRecurso.consultaFija`, sin `?`. Puede no venir.
 * @param vista Query string que armo `construirConsulta`, sin `?`.
 * @returns Las dos unidas por `&`, sin `&` sueltos cuando alguna esta vacia.
 */
export function unirConsultas (fija: string | undefined, vista: string): string {
  return [fija ?? '', vista].filter((parte) => parte !== '').join('&')
}

/**
 * Si la vista tiene algun filtro o busqueda puesto.
 *
 * Lo usa el estado vacio: "probá quitando filtros" delante de una lista sin ningun filtro puesto le
 * pide a la persona que deshaga algo que no hizo, y la manda a buscar un problema donde no hay
 * ninguno. Un recurso realmente vacio tiene que decir que esta vacio.
 *
 * @param estado Estado de la vista, tal como lo leyo `leerConsulta`.
 * @returns `true` si hay al menos un filtro con valor o un texto de busqueda.
 */
export function hayFiltrosPuestos (estado: EstadoConsulta): boolean {
  if (estado.busqueda.trim() !== '') return true

  return Object.values(estado.filtros).some((valores) => (valores ?? []).some((v) => v !== ''))
}
