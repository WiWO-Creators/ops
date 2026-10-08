'use client'

import { useState } from 'react'
import type { Resultado } from '@/componentes/datos/mutaciones'
import { useAviso } from '@/componentes/estado/useAviso'
import { falloDeTicket } from '@/dominio/ticket-vista'

/** Lo que `useEdicionOptimista` entrega al menu que edita un campo del ticket. */
export interface EdicionOptimista<T> {
  /** El valor que se dibuja: el de la ficha, salvo mientras un cambio espera a la API. */
  pintado: T
  /** Hay un cambio en vuelo; el menu se deshabilita. */
  enCurso: boolean
  /**
   * Pinta `destino` de inmediato y manda el cambio. Si la API lo rechaza, vuelve al valor previo y
   * avisa con el texto de `falloDeTicket`; si lo confirma, llama a `onCambiado`.
   */
  aplicar: (destino: T, enviar: () => Promise<Resultado<unknown>>, onCambiado: () => void) => Promise<void>
}

/**
 * La edicion optimista de un campo de la ficha del ticket (estado, prioridad, asignado).
 *
 * El cambio se pinta antes de que responda la API y se revierte si la rechaza: una insignia que dice
 * «Cerrado» despues de un 422 mentiria sobre el ticket. El valor pintado se realinea cuando la ficha
 * recargada trae otro (`setState` en el render, en vez de encadenar renders desde un efecto).
 *
 * @param valorDeApi el valor que trae la ficha
 * @param claveDe como se comparan dos valores de la ficha para saber que cambio; por defecto, identidad
 * @returns el valor pintado, si hay un cambio en vuelo y `aplicar`
 */
export function useEdicionOptimista<T> (valorDeApi: T, claveDe: (valor: T) => unknown = (valor) => valor): EdicionOptimista<T> {
  const avisar = useAviso()
  const [pintado, setPintado] = useState(valorDeApi)
  const [ultimoDeLaApi, setUltimoDeLaApi] = useState(valorDeApi)
  const [enCurso, setEnCurso] = useState(false)

  if (claveDe(ultimoDeLaApi) !== claveDe(valorDeApi)) {
    setUltimoDeLaApi(valorDeApi)
    setPintado(valorDeApi)
  }

  async function aplicar (destino: T, enviar: () => Promise<Resultado<unknown>>, onCambiado: () => void): Promise<void> {
    const previo = pintado

    setPintado(destino)
    setEnCurso(true)

    const resultado = await enviar()

    setEnCurso(false)

    if (!resultado.ok) {
      setPintado(previo)
      avisar.error(falloDeTicket(resultado, 'editar').texto)

      return
    }

    onCambiado()
  }

  return { pintado, enCurso, aplicar }
}
