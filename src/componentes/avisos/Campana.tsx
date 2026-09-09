'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import {
  ContenidoMenu,
  DisparadorMenu,
  MenuContextual
} from '@/componentes/superposiciones/MenuContextual'
import type { ConteoDeAvisos } from '@/datos/avisos'
import { cn } from '@/lib/clases'
import { ListaAvisos } from './ListaAvisos'

/** A partir de aca el globo deja de decir el numero: no entra, y "99+" ya comunica lo mismo. */
const TOPE_VISIBLE = 99

interface PropsCampana {
  /**
   * El conteo que resolvio el servidor. Va por prop y no se pide al montar para que el globo no
   * aparezca vacio y salte a doce un segundo despues, en la cabecera, en cada navegacion.
   */
  inicial: ConteoDeAvisos | null
  /** Cada cuantos segundos se vuelve a contar. Lo resuelve el servidor. */
  segundos: number
}

/**
 * La campana de avisos.
 *
 * === QUE SE PIDE Y CUANDO ===
 *
 * El intervalo pide **solo el contador** (`/notifications/count`), que es una fila; la lista se pide
 * una vez, **al abrir el desplegable**. Traer quince avisos cada treinta segundos para pintar un
 * numero seria mover una pagina entera para mostrar un digito.
 *
 * === POR QUE SE MARCA TODO AL CERRAR ===
 *
 * Porque abrir la campana ES leerlos: quien la abre ya vio lo que habia. Marcar uno por uno al pasar
 * el mouse por encima produce lecturas que nadie hizo, y no marcar nada deja el globo en rojo para
 * siempre. El globo se pone en cero **antes** de que la API conteste —actualizacion optimista— porque
 * el numero ya es falso en el momento en que se cierra el desplegable; si la escritura falla, el
 * proximo intervalo lo devuelve a su valor real.
 *
 * Las preferencias de aviso quedan fuera a proposito: son una pantalla de ajustes, no un
 * desplegable.
 */
export function Campana ({ inicial, segundos }: PropsCampana) {
  const [conteo, setConteo] = useState<ConteoDeAvisos | null>(inicial)
  const [abierto, setAbierto] = useState(false)

  const sinLeer = conteo?.unread ?? 0

  const contar = useCallback(async (senal: AbortSignal): Promise<void> => {
    const respuesta = await fetch('/api/bff/notifications/count', { signal: senal })

    if (!respuesta.ok) return

    const sobre = await respuesta.json() as { data: ConteoDeAvisos }

    setConteo(sobre.data)
  }, [])

  useEffect(() => {
    const control = new AbortController()

    function tic (): void {
      // Con la pestaña oculta no se cuenta: el globo se pone al dia en cuanto vuelve al frente.
      if (document.hidden) return

      // Un fallo del contador no se muestra: la campana no es el trabajo de nadie, y un error rojo
      // permanente en la cabecera por una fila que no llego es peor que un numero viejo.
      contar(control.signal).catch(() => {})
    }

    const intervalo = globalThis.setInterval(tic, segundos * 1000)
    document.addEventListener('visibilitychange', tic)

    return () => {
      globalThis.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', tic)
      control.abort()
    }
  }, [contar, segundos])

  /** Marca todo como leido y baja el globo sin esperar la respuesta. */
  function marcarTodo (): void {
    if (sinLeer === 0) return

    setConteo((previo) => previo === null ? previo : { ...previo, unread: 0 })

    void fetch('/api/bff/notifications/read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    }).catch(() => {
      // El proximo intervalo devuelve el contador a su valor real: no hay nada que avisar.
    })
  }

  return (
    <MenuContextual
      open={abierto}
      onOpenChange={(siguiente) => {
        setAbierto(siguiente)

        if (!siguiente) marcarTodo()
      }}
    >
      <DisparadorMenu
        aria-label={sinLeer === 0 ? 'Avisos' : `Avisos, ${sinLeer} sin leer`}
        className={cn(
          'text-texto-tenue hover:bg-hover hover:text-texto rounded-chico relative inline-flex size-8 items-center justify-center transition-colors'
        )}
      >
        <Bell size={20} strokeWidth={2} aria-hidden="true" />
        {sinLeer > 0 && (
          <span
            aria-hidden="true"
            className="bg-relleno-peligro text-relleno-peligro-contenido absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs font-semibold tabular-nums"
          >
            {sinLeer > TOPE_VISIBLE ? `${TOPE_VISIBLE}+` : sinLeer}
          </span>
        )}
      </DisparadorMenu>

      {/* La lista se monta con el desplegable: eso ES la peticion, y por eso no aparece en el
          intervalo de arriba. */}
      <ContenidoMenu align="end" className="w-88 p-0">
        <ListaAvisos />
      </ContenidoMenu>
    </MenuContextual>
  )
}
