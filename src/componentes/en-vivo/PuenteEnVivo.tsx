'use client'

import { useEffect } from 'react'
import { avisarCambioDeMedidor } from '@/componentes/live/medidor'
import { conectarEnVivo, crearAgrupadorDeCambios, escucharEnVivo, type CambioEnVivo } from '@/datos/en-vivo'
import { conLimite, TIEMPO_LECTURA_MS } from '@/datos/red'
import { eventosDeVentanaPara } from '@/dominio/en-vivo'

/** Los cambios repetidos que llegan dentro de esta ventana cuentan una vez. */
const VENTANA_DE_AGRUPACION_MS = 1000

/** Cambios que, además del evento común, hacen releer el medidor de la cabecera y el tablero del equipo. */
const TIPOS_DEL_MEDIDOR: readonly string[] = ['jornada', 'cronometro']

/**
 * Pide un boleto al BFF con las salas por defecto (la propia y la del equipo).
 *
 * @returns el boleto, o `null` si no se pudo (sin sesión, apagado, red caída): el cliente reintenta con espera
 */
async function pedirBoletoDelPanel (): Promise<string | null> {
  try {
    const respuesta = await fetch('/api/en-vivo/boleto', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
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

/**
 * Convierte los cambios del bus en los eventos de ventana que ya escuchan las pantallas.
 *
 * Tarea y ticket salen como `ops:tareas-cambiadas` / `ops:tickets-cambiados` más
 * `ops:recurso-cambiado` con `origen: 'en-vivo'` (las tablas solo se invalidan si es su recurso);
 * jornada y cronómetro además avisan al medidor; el resto sale como `ops:en-vivo`.
 *
 * @param cambios los cambios únicos de la ventana
 */
function despachar (cambios: CambioEnVivo[]): void {
  let medidor = false

  for (const cambio of cambios) {
    for (const evento of eventosDeVentanaPara(cambio)) {
      window.dispatchEvent(new CustomEvent(evento.nombre, { detail: evento.detalle }))
    }
    if (TIPOS_DEL_MEDIDOR.includes(cambio.tipo)) medidor = true
  }

  if (medidor) avisarCambioDeMedidor()
}

/**
 * Mantiene el socket de «Ops en vivo» y traduce sus avisos a eventos de ventana.
 *
 * No pinta nada. Conecta al montarse y desconecta al desmontarse; si algo falla, el panel sigue por
 * sondeo exactamente como sin «en vivo». Solo se monta con «en vivo» encendido.
 *
 * @param url base pública del servicio (`NEXT_PUBLIC_EN_VIVO_URL`, ya validada por el servidor)
 */
export function PuenteEnVivo ({ url }: { url: string }): null {
  useEffect(() => {
    const agrupador = crearAgrupadorDeCambios(despachar, VENTANA_DE_AGRUPACION_MS)
    const dejarDeEscuchar = escucharEnVivo(agrupador.agregar)
    const desconectar = conectarEnVivo({ url, pedirBoleto: pedirBoletoDelPanel })

    return () => {
      desconectar()
      dejarDeEscuchar()
      agrupador.cancelar()
    }
  }, [url])

  return null
}
