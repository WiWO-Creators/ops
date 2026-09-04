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
