'use client'

import { useEffect, useEffectEvent } from 'react'
import { conectarEnVivo, escucharEnVivo, escucharEstado } from '@/datos/en-vivo'
import { conLimite, TIEMPO_LECTURA_MS } from '@/datos/red'

/**
 * Pide el boleto de esta pantalla al BFF.
 *
 * @param codigo el código de la URL de la pantalla
 * @returns el boleto, o `null` si no se pudo (apagado, red caída): el cliente del bus reintenta con espera
 */
async function pedirBoletoDePantalla (codigo: string): Promise<string | null> {
  try {
    const respuesta = await fetch(`/api/pantalla/${encodeURIComponent(codigo)}/boleto`, {
      method: 'POST',
      cache: 'no-store',
      signal: conLimite(undefined, TIEMPO_LECTURA_MS)
    })

    if (!respuesta.ok) return null

    const sobre = await respuesta.json() as { data?: { boleto?: unknown } }
    const boleto = sobre.data?.boleto

    return typeof boleto === 'string' && boleto !== '' ? boleto : null
  } catch {
    return null
  }
}

interface OpcionesDelBus {
  codigo: string
  /** `true` si el board declara `meta.en_vivo` y hay URL del servicio. */
  activo: boolean
  /** Base pública del servicio (`NEXT_PUBLIC_EN_VIVO_URL`). */
  url: string
  /** Se llama cuando el bus avisa un cambio de pantalla o el socket vuelve a conectar. */
  alCambiar: () => void
}

/**
 * Conecta la pantalla de oficina al bus (sala `pantallas`) y avisa cuando algo cambió.
 *
 * El aviso no trae datos: quien lo recibe vuelve a pedir el paquete por la ruta de siempre. Si el
 * bus no conecta o `activo` es `false`, no hace nada y la pantalla sigue por sondeo como antes. Al
 * reconectar también avisa, porque lo ocurrido con el socket caído no llegó por el bus.
 *
 * @param opciones el código, si está activo, la URL y qué hacer ante un aviso
 */
export function useBusDePantalla ({ codigo, activo, url, alCambiar }: OpcionesDelBus): void {
  const avisar = useEffectEvent(alCambiar)

  useEffect(() => {
    if (!activo) return

    const dejarDeEscuchar = escucharEnVivo((cambio) => { if (cambio.tipo === 'pantalla') avisar() })
    const dejarDeVigilar = escucharEstado((conectado) => { if (conectado) avisar() })
    const desconectar = conectarEnVivo({ url, pedirBoleto: async () => await pedirBoletoDePantalla(codigo) })

    return () => {
      desconectar()
      dejarDeVigilar()
      dejarDeEscuchar()
    }
  }, [activo, url, codigo])
}
