'use client'

import { createContext, useContext, useMemo, type ReactElement, type ReactNode } from 'react'
import type { AreaPermiso } from '@/datos/tipos'

/** Lo que decide si una entidad se enlaza: las mismas dos señales que ya reciben `EnlacePersona`,
 * `EnlaceCliente` y `EnlaceProyecto` por props.
 *
 * `permisos` va por area —igual que `Yo['permissions']`— porque `puedeVerSeccion` mira una area
 * distinta segun la entidad: `staff` para persona, `customers` para cliente, `projects` para
 * proyecto. Un solo arreglo plano no alcanzaria para las tres a la vez. */
interface ValorContextoEnlaces {
  /** Capacidades de quien mira, una entrada por area (de `permissions` de `/me`). */
  permisos: Partial<Record<AreaPermiso, readonly string[]>>
  /** `true` dentro del portal del cliente: ahi ninguna entidad se enlaza. */
  esPortal: boolean
}

/** Sin proveedor de por medio, nada enlaza: es el default seguro, no un caso de error. */
const VALOR_POR_DEFECTO: ValorContextoEnlaces = { permisos: {}, esPortal: false }

const ContextoEnlaces = createContext<ValorContextoEnlaces>(VALOR_POR_DEFECTO)

/**
 * Capacidades (de la `area` pedida) y `esPortal` vigentes para decidir si una entidad se enlaza a su
 * ficha, cuando el llamador no pasa esas props explicitas.
 *
 * @param area seccion cuya capacidad hace falta: `staff`, `customers` o `projects`.
 * @returns las capacidades de esa area (vacio si el proveedor no las trae) y el `esPortal` vigente.
 */
export function useContextoEnlaces (area: AreaPermiso): { capacidades: readonly string[], esPortal: boolean } {
  const contexto = useContext(ContextoEnlaces)
  return { capacidades: contexto.permisos[area] ?? [], esPortal: contexto.esPortal }
}

/**
 * Publica, para todo lo que este debajo en el arbol, las capacidades por area y el `esPortal` con
 * que decidir si una persona, un cliente o un proyecto se enlazan a su ficha.
 *
 * Se monta una vez en el armazon del panel (con `permissions` de `/me`) y otra en el del portal (con
 * `esPortal` fijo en `true` y sin capacidades: en el portal nunca se enlaza, sea cual sea el valor),
 * para que ningun llamador tenga que volver a pasar estas props a mano en cada
 * `EnlacePersona`/`EnlaceCliente`/`EnlaceProyecto` de la pantalla. Una prop explicita en el
 * componente sigue ganando: este contexto solo cubre el caso en que no se pasa nada.
 *
 * @param permisos capacidades de quien mira, por area, resueltas por el armazon.
 * @param esPortal si el arbol de abajo se dibuja dentro del portal del cliente.
 * @param children el arbol que puede enlazar.
 */
export function ProveedorEnlaces (
  {
    permisos,
    esPortal = false,
    children
  }: { permisos: Partial<Record<AreaPermiso, readonly string[]>>, esPortal?: boolean, children: ReactNode }
): ReactElement {
  const valor = useMemo(() => ({ permisos, esPortal }), [permisos, esPortal])

  return <ContextoEnlaces.Provider value={valor}>{children}</ContextoEnlaces.Provider>
}
