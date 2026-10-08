'use client'

import { useEffect } from 'react'
import type { LiveCardState } from '@/datos/live'
import { enAppNativa } from '@/lib/app-nativa'
import {
  EVENTO_JORNADA,
  enviarAlApp,
  escucharApp,
  mensajeAuth,
  mensajeCardEnd,
  mensajeCardStart,
  mensajeCardUpdate,
  mensajeReady,
  type EstadoDeLaApp
} from '@/lib/puente-app'

/** Espera tras un aviso de cambio antes de leer la tarjeta: la API la publica al terminar de responder. */
const ESPERA_SINCRONIZAR_MS = 400
/** Tras un fallo al vincular, cuánto se espera antes de volver a intentarlo con el mismo reto. */
const ESPERA_REINTENTO_VINCULO_MS = 30_000

const RUTA_VINCULO = '/api/sesion/vinculo-movil'
const RUTA_TARJETA = '/api/bff/me/jornada/tarjeta'

/** Lo que recuerda el puente entre una sincronización y la siguiente. */
interface MemoriaDelPuente {
  /** Último estado que contó la app, o `null` mientras no haya dicho nada. */
  app: EstadoDeLaApp | null
  /** La tarjeta que la app tiene ahora, tal como se la mandamos. */
  tarjeta: LiveCardState | null
  vinculando: boolean
  sincronizando: boolean
  resincronizar: boolean
  retoFallido: string | null
  reintentoVinculoDesde: number
}

/**
 * El lado PWA del puente con la app nativa. No pinta nada y solo se monta dentro de la app.
 *
 * Hace dos cosas, las dos silenciosas:
 *
 * 1. **Vincula el teléfono.** Si la app dice que no está vinculada y trae un `reto`, pide el código de
 *    un solo uso a `/api/sesion/vinculo-movil` y se lo entrega con `auth`. La sesión de la persona ya
 *    está abierta en esta página, así que no hay nada que escribir ni aprobar.
 * 2. **Mantiene la tarjeta.** Lee la tarjeta de la jornada (`GET /me/jornada/tarjeta`) al cargar, al
 *    volver a primer plano y cuando una pantalla avisa `jornada-cambio`, y manda a la app `card.start`,
 *    `card.update` o `card.end` según lo que cambió. La verdad es el servidor; esto solo es el
 *    camino rápido para que la tarjeta aparezca sin esperar al push.
 *
 * La app solo acepta `card.*` con el dispositivo vinculado, así que la tarjeta se sincroniza cuando
 * `vinculado` es `true`.
 */
export function PuenteApp (): null {
  useEffect(() => {
    if (!enAppNativa()) return

    const memoria: MemoriaDelPuente = {
      app: estadoInicial(),
      tarjeta: null,
      vinculando: false,
      sincronizando: false,
      resincronizar: false,
      retoFallido: null,
      reintentoVinculoDesde: 0
    }
    let temporizador: number | undefined

    /** Agenda una lectura de la tarjeta, juntando los avisos que lleguen seguidos. */
    const programar = (): void => {
      window.clearTimeout(temporizador)
      temporizador = window.setTimeout(() => { void sincronizar(memoria) }, ESPERA_SINCRONIZAR_MS)
    }
    const alVolver = (): void => {
      if (document.visibilityState === 'visible') programar()
    }
    const dejarDeEscuchar = escucharApp((mensaje) => {
      const vinculadoAntes = memoria.app?.vinculado
      memoria.app = mensaje
      if (!mensaje.vinculado) memoria.tarjeta = null
      void vincular(memoria)
      if (mensaje.vinculado && vinculadoAntes !== true) programar()
    })

    window.addEventListener(EVENTO_JORNADA, programar)
    document.addEventListener('visibilitychange', alVolver)
    enviarAlApp(mensajeReady())
    void vincular(memoria)
    programar()

    return () => {
      window.clearTimeout(temporizador)
      window.removeEventListener(EVENTO_JORNADA, programar)
      document.removeEventListener('visibilitychange', alVolver)
      dejarDeEscuchar()
    }
  }, [])

  return null
}

/** Lo que la app inyectó antes de cargar la página, como si ya hubiera mandado su estado. */
function estadoInicial (): EstadoDeLaApp | null {
  const info = window.WiwoOpsApp

  return info === undefined ? null : { tipo: 'estado', vinculado: info.vinculado, reto: info.reto }
}

/**
 * Si el teléfono no está vinculado y hay un reto, canjea un código y se lo entrega a la app.
 *
 * Un fallo no se reintenta enseguida con el mismo reto: la app puede repetir su estado, y sin este
 * freno cada repetición pegaría de nuevo a una ruta con límite de intentos.
 */
async function vincular (memoria: MemoriaDelPuente): Promise<void> {
  const { app } = memoria

  if (app === null || app.vinculado || app.reto === null || memoria.vinculando) return
  if (app.reto === memoria.retoFallido && Date.now() < memoria.reintentoVinculoDesde) return

  memoria.vinculando = true

  try {
    const respuesta = await fetch(RUTA_VINCULO, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reto: app.reto })
    })

    if (!respuesta.ok) {
      memoria.retoFallido = app.reto
      memoria.reintentoVinculoDesde = Date.now() + ESPERA_REINTENTO_VINCULO_MS
      return
    }

    const cuerpo = await respuesta.json() as { codigo?: unknown }

    if (typeof cuerpo.codigo === 'string' && cuerpo.codigo !== '') enviarAlApp(mensajeAuth(cuerpo.codigo))
  } catch {
    memoria.retoFallido = app.reto
    memoria.reintentoVinculoDesde = Date.now() + ESPERA_REINTENTO_VINCULO_MS
  } finally {
    memoria.vinculando = false
  }
}

/**
 * Lee la tarjeta del servidor y le cuenta a la app lo que cambió.
 *
 * Una sola lectura en vuelo: si llega otro aviso mientras tanto, se repite al terminar para no
 * quedarse con el estado anterior.
 */
async function sincronizar (memoria: MemoriaDelPuente): Promise<void> {
  if (memoria.app?.vinculado !== true) return

  if (memoria.sincronizando) {
    memoria.resincronizar = true
    return
  }

  memoria.sincronizando = true

  try {
    const respuesta = await fetch(RUTA_TARJETA, { cache: 'no-store' })

    // Sin respuesta del servidor no se toca la tarjeta: terminarla por un error de red sería mentir.
    if (!respuesta.ok) return

    const sobre = await respuesta.json() as { data?: { card?: LiveCardState | null } }

    aplicarTarjeta(memoria, sobre.data?.card ?? null)
  } catch {
    // Red caída: la tarjeta que ya está en la app sigue igual hasta la próxima lectura.
  } finally {
    memoria.sincronizando = false

    if (memoria.resincronizar) {
      memoria.resincronizar = false
      void sincronizar(memoria)
    }
  }
}

/**
 * Compara la tarjeta del servidor con la que tiene la app y manda el mensaje que las iguala.
 *
 * @param memoria lo que el puente recuerda de la app
 * @param nueva la tarjeta de la jornada abierta, o `null` si no hay
 */
function aplicarTarjeta (memoria: MemoriaDelPuente, nueva: LiveCardState | null): void {
  const actual = memoria.tarjeta

  if (nueva === null) {
    if (actual !== null) enviarAlApp(mensajeCardEnd(actual.cardId))
    memoria.tarjeta = null
    return
  }

  if (actual === null) {
    enviarAlApp(mensajeCardStart(nueva))
  } else if (actual.cardId !== nueva.cardId) {
    enviarAlApp(mensajeCardEnd(actual.cardId))
    enviarAlApp(mensajeCardStart(nueva))
  } else if (JSON.stringify(actual) !== JSON.stringify(nueva)) {
    enviarAlApp(mensajeCardUpdate(nueva))
  }

  memoria.tarjeta = nueva
}
