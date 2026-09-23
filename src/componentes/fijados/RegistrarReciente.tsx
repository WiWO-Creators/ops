'use client'

import { useEffect } from 'react'
import type { TipoFijable } from './fijados'

/**
 * Anota en `/me/recientes` que la persona abrio esta ficha. No pinta nada.
 *
 * Va del lado del navegador y no en el Server Component de la ficha a proposito: el servidor
 * renderiza tambien los prefetch de `<Link>`, y contar ahi haria "recientes" de lo que el menu
 * precargo sin que nadie lo abriera.
 *
 * Un fallo no se avisa: los recientes son un atajo, y un aviso de error por algo que la persona no
 * pidio seria ruido. Tampoco pasa por `escribirEnBff`, que avisa de los fallos con el aviso flotante.
 *
 * @param tipo `project` o `client`
 * @param id el id de la ficha
 */
export function RegistrarReciente ({ tipo, id }: { tipo: TipoFijable, id: number }) {
  useEffect(() => {
    // Sin `AbortController` a proposito: salir de la ficha antes de que conteste no deshace que se
    // abrio, y abortar perderia justo las visitas cortas. Dos envios (modo estricto en desarrollo)
    // no duplican nada: la API deduplica por clave.
    fetch('/api/bff/me/recientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: tipo, id })
    }).catch(() => {
      // Red caida: el reciente no se anota, y no hace falta mas.
    })
  }, [tipo, id])

  return null
}
