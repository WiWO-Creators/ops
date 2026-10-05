'use client'

import { createContext, useContext } from 'react'

/** Arma la URL que abre el detalle de una fila: la actual con `clave=valor`, filtros y orden intactos. */
export type ConstructorDeUrlDeDetalle = (clave: string, valor: string | number) => string

const ContextoUrlDeDetalle = createContext<ConstructorDeUrlDeDetalle | null>(null)

/**
 * Lo provee `TablaRecurso` a todo lo que dibuja.
 *
 * La tabla ya lee la URL una vez; sin esto cada enlace de fila (`EnlaceATicket`) se suscribia por su
 * cuenta a `useSearchParams` y armaba su propio `URLSearchParams`, una vez por fila y por tarjeta.
 */
export const ProveedorUrlDeDetalle = ContextoUrlDeDetalle.Provider

/**
 * El constructor de URL de detalle de la tabla que contiene a quien llama.
 *
 * @returns el constructor, o `null` fuera de una tabla
 */
export function useUrlDeDetalle (): ConstructorDeUrlDeDetalle | null {
  return useContext(ContextoUrlDeDetalle)
}
