'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import {
  ContenidoMenu,
  DisparadorMenu,
  MenuContextual
} from '@/componentes/superposiciones/MenuContextual'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { useAviso } from '@/componentes/estado/useAviso'
import { useEnVivo } from '@/componentes/en-vivo/useEnVivo'
import type { Aviso, ConteoDeAvisos } from '@/datos/avisos'
import { pedirSobre } from '@/datos/cliente'
import { estaConectadoEnVivo } from '@/datos/en-vivo'
import { conLimite, TIEMPO_LECTURA_MS } from '@/datos/red'
import { sondeoSinApilar } from '@/datos/sondeo'
import { debeSondear } from '@/dominio/en-vivo'
import { cn } from '@/lib/clases'
import { ListaAvisos } from './ListaAvisos'

/** A partir de aca el globo deja de decir el numero: no entra, y "99+" ya comunica lo mismo. */
const TOPE_VISIBLE = 99

/** Largo máximo del texto del aviso que sale como toast cuando llega en vivo. */
const LARGO_MAXIMO_DEL_TOAST = 80

/** Recorta el texto de un aviso para el toast, con puntos suspensivos si no entra. */
function textoParaToast (texto: string): string {
  return texto.length <= LARGO_MAXIMO_DEL_TOAST ? texto : `${texto.slice(0, LARGO_MAXIMO_DEL_TOAST - 1).trimEnd()}…`
}

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
  const aviso = useAviso()
  // Lo último que se sabe del contador y si el desplegable está abierto, para decidir sin
  // volver a suscribirse al bus en cada render.
  const conteoVisto = useRef<ConteoDeAvisos | null>(inicial)
  const desplegableAbierto = useRef(false)

  const sinLeer = conteo?.unread ?? 0

  const fijarConteo = useCallback((nuevo: ConteoDeAvisos | null): void => {
    conteoVisto.current = nuevo
    setConteo(nuevo)
  }, [])

  const contar = useCallback(async (senal: AbortSignal): Promise<ConteoDeAvisos | null> => {
    const respuesta = await fetch('/api/bff/notifications/count', { signal: conLimite(senal, TIEMPO_LECTURA_MS) })

    if (!respuesta.ok) return null

    const sobre = await respuesta.json() as { data: ConteoDeAvisos }

    fijarConteo(sobre.data)

    return sobre.data
  }, [fijarConteo])

  useEffect(() => {
    const control = new AbortController()
    let ultimaConsulta = 0

    // Un fallo del contador no se muestra: la campana no es el trabajo de nadie, y un error rojo
    // permanente en la cabecera por una fila que no llego es peor que un numero viejo.
    const consultar = sondeoSinApilar(async () => {
      ultimaConsulta = Date.now()

      try {
        await contar(control.signal)
      } catch {
        // Se vuelve a intentar con el siguiente tic.
      }
    })

    // Con la pestaña oculta no se cuenta: el globo se pone al dia en cuanto vuelve al frente. El tic
    // no se apila sobre una consulta en camino.
    const tic = (): void => { if (!document.hidden) consultar(true) }
    // Con el bus conectado el intervalo es solo respaldo: los avisos llegan por `useEnVivo`.
    const ticDelIntervalo = (): void => {
      if (estaConectadoEnVivo() && !debeSondear(ultimaConsulta, segundos * 1000, true, Date.now())) return
      tic()
    }

    const intervalo = globalThis.setInterval(ticDelIntervalo, segundos * 1000)
    document.addEventListener('visibilitychange', tic)

    return () => {
      globalThis.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', tic)
      control.abort()
    }
  }, [contar, segundos])

  // Llegó un aviso por el bus: se vuelve a contar y, si el contador subió, se muestra el más
  // reciente como toast (salvo que el desplegable esté abierto, que ya lo muestra).
  useEnVivo(['aviso'], () => {
    const previo = conteoVisto.current?.unread ?? 0
    const senal = new AbortController().signal

    void (async () => {
      try {
        const nuevo = await contar(senal)

        if (nuevo === null || nuevo.unread <= previo || desplegableAbierto.current) return

        const sobre = await pedirSobre<Aviso[]>('notifications?per_page=1', senal)
        const ultimo = sobre.data[0]

        if (ultimo !== undefined && !ultimo.read) aviso.info(textoParaToast(ultimo.text))
      } catch {
        // El toast es un extra: el contador ya se actualizó o lo hará el respaldo.
      }
    })()
  })

  /** Marca todo como leido y baja el globo sin esperar la respuesta. */
  function marcarTodo (): void {
    if (sinLeer === 0) return

    fijarConteo(conteoVisto.current === null ? null : { ...conteoVisto.current, unread: 0 })

    void escribirEnBff('notifications/read', 'POST', {}).then((resultado) => {
      // Si no se confirmo, el globo en cero puede ser falso: se vuelve a contar ya y no en el proximo tic.
      if (!resultado.ok) void contar(new AbortController().signal).catch(() => {})
    })
  }

  return (
    <MenuContextual
      open={abierto}
      onOpenChange={(siguiente) => {
        desplegableAbierto.current = siguiente
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
