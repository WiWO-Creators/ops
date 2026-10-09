'use client'

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useFiltrosEnUrl } from '@/componentes/datos/useFiltrosEnUrl'
import { urlConParametros } from '@/componentes/datos/filtros-en-url'
import type { FiltroDeCartera, OrdenDeCartera } from '@/dominio/cartera'
import {
  RETRASO_DE_BUSQUEDA_MS,
  construirRecorte,
  leerRecorte
} from '@/dominio/recorte-de-cartera'
import { conRetardo } from '@/lib/retardo'

export interface ControlDeRecorte {
  /** El texto tal como se está escribiendo: es el que lleva el campo. */
  texto: string
  /** El texto con el que se filtra: se queda un paso atrás mientras React atiende la escritura. */
  textoDiferido: string
  filtro: FiltroDeCartera
  orden: OrdenDeCartera
  onTexto: (texto: string) => void
  onFiltro: (filtro: FiltroDeCartera) => void
  onOrden: (orden: OrdenDeCartera) => void
  /** Quita texto y filtro de una vez; el orden no es un recorte y se conserva. */
  onLimpiar: () => void
}

/**
 * El texto, el filtro y el orden de la cartera de Focals, con la URL como respaldo.
 *
 * === Por qué el texto vive en memoria y la URL llega después ===
 *
 * Porque la cartera entera ya está en el navegador y filtrar no necesita al servidor, pero escribir
 * en la URL con `router.replace` en cada tecla sí es una navegación: Next vuelve a pedir la página.
 * El campo y el filtro leen el estado local, y la URL se actualiza con `history.replaceState` tras
 * una pausa de tecleo, que Next integra con `useSearchParams` sin pedir nada. El enlace sigue siendo
 * compartible y recargar no pierde el recorte.
 *
 * El filtro y el orden sí pasan por `cambiar`, de `useFiltrosEnUrl`: son clics sueltos y no hay
 * ráfaga que amortiguar. Llevan el texto vigente en la misma URL para que una escritura pendiente
 * no se pierda ni deshaga la nueva.
 *
 * @param mostrarFocal si la pantalla es la cartera entera; en la propia `sin_focal` no existe
 * @returns el recorte vigente y sus funciones para cambiarlo
 */
export function useRecorteDeCartera (mostrarFocal: boolean): ControlDeRecorte {
  const leer = useCallback((params: URLSearchParams) => leerRecorte(params, mostrarFocal), [mostrarFocal])
  const { estado, cambiar } = useFiltrosEnUrl({ leer, construir: construirRecorte })

  const [texto, setTexto] = useState(estado.buscar)
  const [escrito, setEscrito] = useState(estado.buscar)
  const [urlPrevia, setUrlPrevia] = useState(estado.buscar)
  const textoDiferido = useDeferredValue(texto)

  // Un cambio de la URL que no escribimos nosotros (atrás/adelante, un enlace) se adopta, salvo que
  // haya una escritura a medias: el eco de la nuestra llega igual a `escrito` y no cuenta.
  if (estado.buscar !== urlPrevia) {
    setUrlPrevia(estado.buscar)

    if (estado.buscar !== escrito && texto === escrito) {
      setTexto(estado.buscar)
      setEscrito(estado.buscar)
    }
  }

  const volcar = useMemo(() => conRetardo((valor: string) => {
    const url = urlConParametros(new URLSearchParams(window.location.search), { buscar: valor }, undefined)

    window.history.replaceState(null, '', url)
    setEscrito(valor)
  }, RETRASO_DE_BUSQUEDA_MS), [])

  // Una escritura pendiente no debe caer sobre la página a la que se navegó.
  useEffect(() => volcar.cancelar, [volcar])

  function onTexto (valor: string): void {
    setTexto(valor)
    volcar.llamar(valor)
  }

  function onFiltro (filtro: FiltroDeCartera): void {
    volcar.cancelar()
    setEscrito(texto)
    cambiar({ filtro, buscar: texto })
  }

  function onOrden (orden: OrdenDeCartera): void {
    volcar.cancelar()
    setEscrito(texto)
    cambiar({ orden, buscar: texto })
  }

  function onLimpiar (): void {
    volcar.cancelar()
    setTexto('')
    setEscrito('')
    cambiar({ filtro: 'todas', buscar: '' })
  }

  return { texto, textoDiferido, filtro: estado.filtro, orden: estado.orden, onTexto, onFiltro, onOrden, onLimpiar }
}
