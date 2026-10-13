'use client'

import { useEffect, useState } from 'react'
import { pedirSobre } from '@/datos/cliente'
import { guardarNombreDeProyecto, nombreDeProyectoGuardado } from '@/dominio/nombres-proyecto'

/**
 * El nombre de un Proyecto, para rotular el chip «Continuar en el hilo de …».
 *
 * Se pide una vez por Proyecto y se recuerda mientras viva la pestaña. Un fallo no molesta a nadie:
 * el chip dice «este proyecto» y el hilo funciona igual.
 *
 * @param proyectoId El Proyecto de la ruta, o `undefined`.
 * @param activo Si hace falta el nombre ahora (el panel está abierto).
 * @returns El nombre, o `null` mientras no se conoce.
 */
export function useNombreDeProyecto (proyectoId: number | undefined, activo: boolean): string | null {
  const [leido, setLeido] = useState<{ id: number, nombre: string } | null>(null)

  useEffect(() => {
    if (!activo || proyectoId === undefined || nombreDeProyectoGuardado(proyectoId) !== undefined) return
    const abortador = new AbortController()
    void pedirSobre<{ name?: unknown }>(`projects/${proyectoId}`, abortador.signal)
      .then(sobre => {
        const nombre = sobre.data?.name
        if (typeof nombre !== 'string' || nombre.trim() === '' || abortador.signal.aborted) return
        guardarNombreDeProyecto(proyectoId, nombre)
        setLeido({ id: proyectoId, nombre })
      })
      .catch(() => {})
    return () => { abortador.abort() }
  }, [proyectoId, activo])

  if (proyectoId === undefined) return null
  return nombreDeProyectoGuardado(proyectoId) ?? (leido?.id === proyectoId ? leido.nombre : null)
}
