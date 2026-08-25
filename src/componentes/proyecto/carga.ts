'use client'

import { useCallback, useEffect, useState } from 'react'
import { pedirSobre } from '@/datos/cliente'
import type { Meta } from '@/datos/tipos'

/**
 * Carga de un recurso del detalle de Proyecto desde el navegador.
 *
 * Los paneles que no son tablas —Descripcion, el kanban de Hitos, el Gantt— repiten el mismo baile:
 * pedir, mostrar el bloque de carga, mostrar el error como texto legible, y poder reintentar. Esto es
 * ese baile, una sola vez.
 *
 * El prefijo `use` no es ingles por descuido: React exige que todo hook empiece asi, y la regla de
 * lint de hooks no reconoce ningun otro prefijo.
 */

/** Estado de una carga. El error es un texto listo para mostrar, no un envelope. */
export type EstadoCarga<T> =
  | { fase: 'cargando' }
  | { fase: 'listo', datos: T, meta: Meta | undefined }
  | { fase: 'error', mensaje: string }

/**
 * Pide una ruta del BFF y devuelve su estado de carga.
 *
 * @param ruta ruta sin la base del BFF ni barra inicial. Ej: `projects/93/overview`
 * @param mensajeGenerico que decir cuando el fallo no trae mensaje propio
 * @returns el estado y una funcion para volver a pedir
 */
export function useRecurso<T> (
  ruta: string,
  mensajeGenerico: string
): { estado: EstadoCarga<T>, recargar: () => void } {
  const [estado, setEstado] = useState<EstadoCarga<T>>({ fase: 'cargando' })
  const [intento, setIntento] = useState(0)
  const [peticion, setPeticion] = useState(`${ruta}|0`)

  const recargar = useCallback(() => { setIntento((n) => n + 1) }, [])

  // Volver a "cargando" en el render y no en el efecto: cambiar de ruta con los datos viejos todavia
  // en pantalla mostraria por un instante el resultado de otra peticion. React admite este `setState`
  // durante el render —reinicia el render antes de pintar— y es lo que la regla de hooks pide en vez
  // de encadenar renders desde el efecto.
  const actual = `${ruta}|${intento}`
  if (peticion !== actual) {
    setPeticion(actual)
    setEstado({ fase: 'cargando' })
  }

  useEffect(() => {
    const control = new AbortController()

    void pedirSobre<T>(ruta, control.signal)
      .then((sobre) => {
        if (!control.signal.aborted) setEstado({ fase: 'listo', datos: sobre.data, meta: sobre.meta })
      })
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return

        setEstado({
          fase: 'error',
          mensaje: fallo instanceof Error ? fallo.message : mensajeGenerico
        })
      })

    return () => { control.abort() }
  }, [ruta, intento, mensajeGenerico])

  return { estado, recargar }
}
