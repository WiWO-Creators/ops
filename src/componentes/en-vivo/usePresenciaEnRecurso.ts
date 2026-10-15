'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useConfigEnVivo } from '@/componentes/en-vivo/ProveedorEnVivo'
import {
  anunciarPresencia,
  avisarEscribiendoEnSala,
  escucharPresencia,
  presentesDe,
  suscribirSala
} from '@/datos/en-vivo'
import {
  debeAvisarEscribiendo,
  escribiendoVigentes,
  msHastaElProximoVencimiento,
  registrarEscritura,
  salaDeRecurso,
  sinMiPresencia,
  type TipoDeRecurso
} from '@/dominio/presencia-en-recurso'
import { escucharQuienSoy, pedirBoletoDeSala, staffIdConocido } from './boletoDeSala'

/** Lo que `usePresenciaEnRecurso` entrega. Con la presencia apagada, todo vacío y `avisarEscribiendo` no hace nada. */
export interface PresenciaEnRecurso {
  /** Ids de las demás personas que miran el recurso con la pestaña visible. */
  presentes: number[]
  /** Ids de quienes están escribiendo la respuesta del ticket ahora mismo. */
  escribiendo: number[]
  /** Dice a los demás que se está escribiendo; se limita solo a un aviso cada 3 s. */
  avisarEscribiendo: () => void
}

const NADIE: number[] = []

/** Suscripción estable de `useSyncExternalStore` a los avisos de presencia. */
function alCambiarPresencia (avisar: () => void): () => void {
  return escucharPresencia(() => { avisar() })
}

/**
 * Mantiene la suscripción del navegador a la sala de un recurso.
 *
 * @param sala la sala (`recurso:{tipo}:{id}`), o `null` si no hay que estar en ninguna
 */
function useSalaSuscrita (sala: string | null): void {
  useEffect(() => {
    if (sala === null) return

    return suscribirSala(sala, async () => await pedirBoletoDeSala(sala))
  }, [sala])
}

/**
 * Devuelve la función que avisa «estoy escribiendo» en la sala, con el límite del cliente (un aviso
 * cada 3 s; el servicio descarta además lo que llegue en menos de 2 s).
 *
 * @param sala la sala de un ticket, o `null` para que no haga nada
 * @returns la función para llamar en cada tecla
 */
function useAvisadorDeEscritura (sala: string | null): () => void {
  const ultimo = useRef<number | null>(null)

  return useCallback(() => {
    if (sala === null) return

    const ahora = Date.now()

    if (!debeAvisarEscribiendo(ultimo.current, ahora)) return

    ultimo.current = ahora
    avisarEscribiendoEnSala(sala)
  }, [sala])
}

/**
 * Para la caja de respuesta de un ticket: solo avisa que se escribe, sin seguir quién mira.
 *
 * Comparte la suscripción con `usePresenciaEnRecurso` si los dos viven a la vez (la sala se cuenta
 * por altas). Con la presencia apagada no hace nada.
 *
 * @param ticketId el ticket cuya respuesta se escribe
 * @param activo `false` en el portal del cliente, que no tiene presencia
 * @returns la función para llamar en cada tecla
 */
export function useAvisarEscribiendo (ticketId: number, activo: boolean): () => void {
  const { presencia } = useConfigEnVivo()
  const sala = presencia && activo ? salaDeRecurso('ticket', ticketId) : null

  useSalaSuscrita(sala)

  return useAvisadorDeEscritura(sala)
}

/**
 * Presencia en un recurso: quiénes lo miran y, en un ticket, quién escribe la respuesta.
 *
 * Se suscribe a la sala `recurso:{tipo}:{id}` con un boleto que el BFF emite tras comprobar que la
 * persona puede leer el recurso, y se anuncia «viendo» mientras la pestaña esté visible (oculta, dice
 * «fuera»). Si el socket se reconecta, el cliente del bus repite la suscripción y el anuncio. Solo
 * funciona con `config.presencia`; apagado no abre nada.
 *
 * «Escribiendo» no se guarda: cada aviso dura 5 s y se vence solo.
 *
 * @param tipo qué recurso es
 * @param id su id
 * @returns los presentes (sin quien mira), quiénes escriben y cómo avisar que se escribe
 */
export function usePresenciaEnRecurso (tipo: TipoDeRecurso, id: number): PresenciaEnRecurso {
  const { presencia } = useConfigEnVivo()
  const sala = presencia ? salaDeRecurso(tipo, id) : null
  const yoId = useSyncExternalStore(escucharQuienSoy, staffIdConocido, () => null)
  // Los presentes viven en el cliente del bus: así quien se monta después de que llegó el aviso
  // (la caja de respuesta junto al detalle, por ejemplo) igual los ve.
  const vistos = useSyncExternalStore(
    alCambiarPresencia,
    () => sala === null ? NADIE : presentesDe(sala),
    () => NADIE
  )
  const [quienEscribe, setQuienEscribe] = useState<{ sala: string, ids: number[] } | null>(null)

  useSalaSuscrita(sala)
  const avisar = useAvisadorDeEscritura(sala !== null && tipo === 'ticket' ? sala : null)

  useEffect(() => {
    if (sala === null) return

    let registro = new Map<number, number>()
    let temporizador: ReturnType<typeof setTimeout> | null = null
    let soltarPresencia: (() => void) | null = null

    const recalcularEscritura = (): void => {
      const ahora = Date.now()
      const espera = msHastaElProximoVencimiento(registro, ahora)

      if (temporizador !== null) clearTimeout(temporizador)
      temporizador = espera === null ? null : setTimeout(recalcularEscritura, espera)
      setQuienEscribe({ sala, ids: escribiendoVigentes(registro, ahora) })
    }

    const ver = (): void => { soltarPresencia ??= anunciarPresencia(sala) }
    const irse = (): void => {
      soltarPresencia?.()
      soltarPresencia = null
    }
    const alCambiarVisibilidad = (): void => {
      if (document.visibilityState === 'hidden') irse()
      else ver()
    }

    const dejarDeEscuchar = escucharPresencia((aviso) => {
      if (aviso.sala !== sala || aviso.t !== 'escribiendo') return

      registro = registrarEscritura(registro, aviso.staff, Date.now())
      recalcularEscritura()
    })

    if (document.visibilityState !== 'hidden') ver()
    document.addEventListener('visibilitychange', alCambiarVisibilidad)

    return () => {
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      dejarDeEscuchar()
      irse()
      if (temporizador !== null) clearTimeout(temporizador)
    }
  }, [sala])

  return {
    presentes: sinMiPresencia(vistos, yoId),
    escribiendo: quienEscribe !== null && quienEscribe.sala === sala ? sinMiPresencia(quienEscribe.ids, yoId) : NADIE,
    avisarEscribiendo: avisar
  }
}
