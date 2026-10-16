'use client'

import { useEffect } from 'react'
import { suscribirSala } from '@/datos/en-vivo'
import { pedirBoletoDeSala } from './boletoDeSala'

/**
 * Mantiene la suscripción del navegador a la sala de un Espacio (`espacio:{id}`) mientras el
 * componente que lo usa está montado.
 *
 * Por esa sala llegan los avisos `acta` y `acta_comentario` del Proyecto. El BFF solo da el boleto si
 * la persona puede leer el Proyecto. Sin conexión al bus (o con «en vivo» apagado) no pasa nada: el
 * boleto no se concede o el socket no abre, y quien lo usa sigue con su sondeo de siempre.
 *
 * @param espacioId el Proyecto (Espacio) cuya sala se quiere escuchar
 * @param activo `false` no suscribe (por ejemplo, «en vivo» apagado o quien mira no es del equipo)
 */
export function useSalaDelEspacio (espacioId: number, activo: boolean): void {
  useEffect(() => {
    if (!activo || !Number.isSafeInteger(espacioId) || espacioId <= 0) return

    const sala = `espacio:${espacioId}`

    return suscribirSala(sala, async () => await pedirBoletoDeSala(sala))
  }, [espacioId, activo])
}
