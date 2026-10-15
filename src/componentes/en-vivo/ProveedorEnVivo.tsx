'use client'

import { createContext, useContext, type ReactElement, type ReactNode } from 'react'
import { CONFIG_EN_VIVO_APAGADA, type ConfigEnVivo } from '@/dominio/en-vivo'

/** Sin proveedor de por medio «en vivo» está apagado: es el default seguro, no un caso de error. */
const ContextoEnVivo = createContext<ConfigEnVivo>(CONFIG_EN_VIVO_APAGADA)

/**
 * Los interruptores de «Ops en vivo» de esta instalación, decididos una vez por el armazon del panel.
 *
 * Quien ofrezca algo colaborativo (edición conjunta del Meeting Paper, presencia, tarjetas del
 * equipo) pregunta aquí en vez de pedir `/settings` por su cuenta. **Esconder no autoriza**: cada
 * función se vuelve a comprobar en la API y en el boleto.
 *
 * @returns la configuración; todo en `false` si «en vivo» está apagado o `/settings` no se pudo leer
 */
export function useConfigEnVivo (): ConfigEnVivo {
  return useContext(ContextoEnVivo)
}

/**
 * Publica la configuración de «en vivo» para todo el arbol de abajo.
 *
 * Por ahora solo lleva la configuración; la conexión al bus y el puente de eventos se montan aquí
 * cuando se encienda el bus del navegador.
 *
 * @param config resultado de `estadoEnVivo()`, resuelto en el servidor
 * @param children el panel
 */
export function ProveedorEnVivo ({ config, children }: { config: ConfigEnVivo, children: ReactNode }): ReactElement {
  return <ContextoEnVivo.Provider value={config}>{children}</ContextoEnVivo.Provider>
}
