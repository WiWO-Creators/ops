'use client'

import { createContext, useContext, type ReactElement, type ReactNode } from 'react'
import { CONFIG_EN_VIVO_APAGADA, type ConfigEnVivo } from '@/dominio/en-vivo'
import { PuenteEnVivo } from './PuenteEnVivo'

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
 * Con «en vivo» activo monta el puente que conecta el bus y traduce sus avisos a eventos de ventana;
 * apagado no monta nada y el panel funciona solo por sondeo, como siempre.
 *
 * @param config resultado de `estadoEnVivo()`, resuelto en el servidor
 * @param children el panel
 */
export function ProveedorEnVivo ({ config, children }: { config: ConfigEnVivo, children: ReactNode }): ReactElement {
  return (
    <ContextoEnVivo.Provider value={config}>
      {config.activo && <PuenteEnVivo url={config.url} />}
      {children}
    </ContextoEnVivo.Provider>
  )
}
