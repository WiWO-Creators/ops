'use client'

import { useSyncExternalStore } from 'react'
import { CLAVE_MODO_APAGADO, EVENTO_MODO } from './tema'
import { esClaveDeModo, type ClaveDeModo } from '@/dominio/modos-especiales'

/**
 * Estado del modo especial en ESTE navegador.
 *
 * El servidor pinta dos atributos en `<html>`: `data-modo-vigente` (el modo programado para hoy,
 * siempre) y `data-modo` (el modo que se ve: desaparece si la persona lo apago o si vencio con la
 * pestaña abierta). Las hojas de estilo leen `data-modo`; este modulo es el unico que lo escribe en
 * el cliente. El script de `SCRIPT_TEMA_INICIAL` aplica el apagado antes del primer pintado.
 */

export interface EstadoDeModo {
  /** El modo programado para hoy, o `null`. */
  vigente: ClaveDeModo | null
  /** El modo que se esta viendo ahora, o `null` si no hay o esta apagado. */
  activo: ClaveDeModo | null
}

const SEPARADOR = '|'

/** Lee los dos atributos del documento como una cadena comparable. */
function instantanea (): string {
  const raiz = document.documentElement

  return `${raiz.getAttribute('data-modo-vigente') ?? ''}${SEPARADOR}${raiz.getAttribute('data-modo') ?? ''}`
}

function suscribir (avisar: () => void): () => void {
  window.addEventListener(EVENTO_MODO, avisar)
  window.addEventListener('storage', avisar)

  return () => {
    window.removeEventListener(EVENTO_MODO, avisar)
    window.removeEventListener('storage', avisar)
  }
}

/**
 * Lee el estado del modo desde el documento, y se vuelve a pintar cuando cambia.
 *
 * @returns el modo vigente y el que se ve; en el servidor y en la hidratacion, ambos `null`
 */
export function useEstadoDeModo (): EstadoDeModo {
  const crudo = useSyncExternalStore(suscribir, instantanea, () => SEPARADOR)
  const [vigente = '', activo = ''] = crudo.split(SEPARADOR)

  return {
    vigente: esClaveDeModo(vigente) ? vigente : null,
    activo: esClaveDeModo(activo) ? activo : null
  }
}

/**
 * Enciende o apaga el modo vigente para esta persona y lo recuerda.
 *
 * @param vigente el modo programado para hoy
 * @param encendido `true` lo muestra; `false` lo oculta
 */
export function fijarModoPropio (vigente: ClaveDeModo, encendido: boolean): void {
  const raiz = document.documentElement

  if (encendido) raiz.setAttribute('data-modo', vigente)
  else raiz.removeAttribute('data-modo')

  try {
    if (encendido) window.localStorage.removeItem(CLAVE_MODO_APAGADO)
    else window.localStorage.setItem(CLAVE_MODO_APAGADO, vigente)
  } catch {
    // Se aplico igual; que no se pueda recordar no justifica romper la pantalla.
  }

  window.dispatchEvent(new Event(EVENTO_MODO))
}

/** Quita el modo del documento (vencio con la pestaña abierta) sin tocar la preferencia guardada. */
export function retirarModo (): void {
  const raiz = document.documentElement

  raiz.removeAttribute('data-modo')
  raiz.removeAttribute('data-modo-vigente')
  window.dispatchEvent(new Event(EVENTO_MODO))
}
