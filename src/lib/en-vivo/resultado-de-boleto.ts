/**
 * Lo que comparten las decisiones de boleto que no tienen sesión de staff (pantallas y portal).
 *
 * Cada ruta de Next solo traduce este resultado a una respuesta HTTP; la decisión vive en funciones
 * puras que se prueban sin Next. Import relativo con extensión `.ts`.
 */

/** Estado HTTP y cuerpo JSON que la ruta devuelve tal cual. */
export interface ResultadoDeBoleto {
  estado: number
  cuerpo: unknown
}

/**
 * Arma una respuesta de error con el sobre `{error:{code}}` del resto de la API.
 *
 * @param estado código HTTP
 * @param code código de error estable, sin detalle interno
 * @returns el resultado a devolver
 */
export function falloDeBoleto (estado: number, code: string): ResultadoDeBoleto {
  return { estado, cuerpo: { error: { code } } }
}
