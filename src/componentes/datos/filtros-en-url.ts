/**
 * Logica pura de `useFiltrosEnUrl`: como un estado de vista (E) se traduce a la URL y viceversa,
 * con soporte de prefijo de parametros.
 *
 * Vive aparte del hook de React a proposito: Node despoja los tipos de un `.ts`, pero un archivo que
 * llama a `useSearchParams`/`useRouter` no se puede ejecutar fuera de Next. Todo lo que decide *que*
 * URL resulta de un cambio se prueba desde aca, igual que `tabla.ts` con el resto del motor.
 *
 * El prefijo existe para que dos instancias de una misma tabla en la misma pagina —"Mis Tareas"
 * pinta dos TablaRecurso, una de Espacios/Licitaciones y otra de Tareas privadas— no se pisen los
 * parametros: cada una lee y escribe solo las claves que llevan su prefijo, y dos tablas sin prefijo
 * siguen leyendo el mismo lugar de siempre.
 */

/** Antepone el prefijo a una clave. Sin prefijo, la clave vuelve intacta. */
export function agregarPrefijo (clave: string, prefijo: string | undefined): string {
  return prefijo === undefined || prefijo === '' ? clave : `${prefijo}${clave}`
}

/**
 * Los parametros que le pertenecen a esta instancia, con el prefijo ya quitado.
 *
 * Sin prefijo, son todos: es el comportamiento de siempre, una sola tabla duena de toda la URL.
 *
 * @param params Los parametros vigentes de la URL completa.
 * @param prefijo Prefijo de esta instancia, o `undefined` si no lo declara.
 * @returns Los parametros propios, listos para `leer`.
 */
export function parametrosPropios (params: URLSearchParams, prefijo: string | undefined): URLSearchParams {
  if (prefijo === undefined || prefijo === '') return new URLSearchParams(params)

  const propios = new URLSearchParams()

  for (const [clave, valor] of params) {
    if (clave.startsWith(prefijo)) propios.append(clave.slice(prefijo.length), valor)
  }

  return propios
}

/** Antepone el prefijo a cada clave de una query string ya armada (sin `?`). */
export function prefijarQuery (query: string, prefijo: string | undefined): string {
  if (prefijo === undefined || prefijo === '' || query === '') return query

  const resultado = new URLSearchParams()

  for (const [clave, valor] of new URLSearchParams(query)) resultado.set(agregarPrefijo(clave, prefijo), valor)

  return resultado.toString()
}

/**
 * La URL que resulta de reemplazar la consulta de esta instancia por una nueva, preservando lo que
 * no le pertenece: los parametros de otra instancia (otro prefijo) o de otro dueno (`?vista=` de
 * otra pantalla, `?tarea=` de un modal).
 *
 * @param params Los parametros vigentes de la URL completa.
 * @param queryVieja Query (sin prefijo) que produce el estado ANTERIOR de esta instancia: son las
 *   claves que se borran antes de escribir la nueva, para no dejar basura cuando un filtro se vacia
 *   del todo (`construirConsulta` no serializa una lista vacia, asi que la clave vieja no sale de
 *   `queryNueva` y hay que borrarla a mano).
 * @param queryNueva Query (sin prefijo) del estado que se quiere escribir.
 * @param prefijo Prefijo de esta instancia.
 * @returns La URL relativa, siempre con `?` adelante aunque quede vacia.
 */
export function urlConCambio (
  params: URLSearchParams,
  queryVieja: string,
  queryNueva: string,
  prefijo: string | undefined
): string {
  const ajenos = new URLSearchParams(params.toString())

  for (const clave of new URLSearchParams(prefijarQuery(queryVieja, prefijo)).keys()) {
    ajenos.delete(clave)
  }

  const combinada = [prefijarQuery(queryNueva, prefijo), ajenos.toString()].filter((parte) => parte !== '').join('&')

  return combinada === '' ? '?' : `?${combinada}`
}

/** La URL con un parametro suelto propio de esta instancia puesto, conservando el resto. */
export function urlConParametroPropio (
  params: URLSearchParams,
  clave: string,
  valor: string,
  prefijo: string | undefined
): string {
  const siguientes = new URLSearchParams(params.toString())

  siguientes.set(agregarPrefijo(clave, prefijo), valor)

  return `?${siguientes.toString()}`
}

/** Un parametro suelto propio de esta instancia, leido de la URL completa. */
export function parametroPropio (params: URLSearchParams, clave: string, prefijo: string | undefined): string | null {
  return params.get(agregarPrefijo(clave, prefijo))
}
