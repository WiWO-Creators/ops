/**
 * Logica pura de las iteraciones de un Proceso.
 *
 * La API las devuelve ordenadas por `id` ascendente —de la mas vieja a la mas nueva— porque asi las
 * lista el panel de Perfex. En pantalla se leen al reves: lo ultimo que se rehizo es lo que importa.
 * El criterio vive aca, en un `.ts`, para que la prueba pueda correrlo sin JSX de por medio.
 */

/** Lo unico que el orden necesita de una iteracion: su id de fila. */
export interface ConIdentidad {
  id: number
}

/**
 * Ordena las iteraciones de la mas nueva a la mas vieja.
 *
 * No confia en el orden en que llegaron: `id` descendente es el criterio, asi que una lista
 * desordenada se muestra igual de bien. Devuelve una copia; el arreglo original no se toca, que es
 * lo que espera cualquier estado de React.
 *
 * @param lista las iteraciones tal como las devolvio la API
 * @returns una copia ordenada por `id` descendente
 */
export function ordenarIteraciones<T extends ConIdentidad> (lista: readonly T[]): T[] {
  return [...lista].sort((primera, segunda) => segunda.id - primera.id)
}

/** Lo que la numeracion necesita de una iteracion: su id y su ronda, que puede faltar. */
export interface ConRonda extends ConIdentidad {
  round: number | null
}

/** Una iteracion con su numero de ronda ya resuelto. */
export type Numerada<T> = T & { numero: number }

/**
 * Resuelve el numero de ronda de cada iteracion.
 *
 * Desde la migracion `0682` la ronda es una columna: se asigna al registrar y no se mueve, asi que
 * borrar una iteracion intermedia deja un hueco en vez de correr las siguientes hacia atras. Eso es
 * lo que se muestra cuando `round` viene.
 *
 * Las iteraciones anteriores a esa migracion —y las instalaciones que todavia no la corrieron— traen
 * `round` nulo. Ahi se cae a la POSICION en la lista ordenada por `id`, que es exactamente como se
 * numeraba antes: no es mejor, pero es lo unico que hay y es lo que esas filas ya venian mostrando.
 *
 * @param lista las iteraciones tal como las devolvio la API
 * @returns una copia de la mas nueva a la mas vieja, cada una con su `numero`
 */
export function numerarIteraciones<T extends ConRonda> (lista: readonly T[]): Array<Numerada<T>> {
  // La posicion se cuenta sobre la lista de la mas vieja a la mas nueva, que es como la numeraba el
  // panel: la primera iteracion registrada es la #1.
  const masViejaPrimero = [...lista].sort((primera, segunda) => primera.id - segunda.id)

  const numeradas = masViejaPrimero.map((iteracion, indice) => ({
    ...iteracion,
    numero: iteracion.round ?? indice + 1
  }))

  return ordenarIteraciones(numeradas)
}
