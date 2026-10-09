'use client'

import { createContext, useContext, type ReactElement, type ReactNode } from 'react'

/** Sin proveedor de por medio nadie fusiona: es el default seguro, no un caso de error. */
const ContextoFusion = createContext(false)

/**
 * Si quien mira puede fusionar entidades, decidido una vez por el armazon del panel.
 *
 * Existe para no pasar un booleano por cada pantalla que ofrece "Fusionar con…" —tres listados y tres
 * fichas—, igual que `ProveedorEnlaces` evita repetir los permisos en cada enlace. **Esconder no
 * autoriza**: la compuerta es la API (403).
 *
 * @returns `true` si se ofrece la accion
 */
export function usePuedeFusionar (): boolean {
  return useContext(ContextoFusion)
}

/**
 * Publica `puedeFusionar` para todo el arbol de abajo.
 *
 * @param puede resultado de `puedeFusionar(yo)`
 * @param children el panel
 */
export function ProveedorFusion ({ puede, children }: { puede: boolean, children: ReactNode }): ReactElement {
  return <ContextoFusion.Provider value={puede}>{children}</ContextoFusion.Provider>
}
