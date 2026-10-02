'use client'

import { useRouter } from 'next/navigation'
import { startTransition, type ReactElement } from 'react'
import { ErrorEstado } from '@/componentes/estado/Estados'

/**
 * `ErrorEstado` con "Reintentar" para las páginas de servidor.
 *
 * Una página de servidor no puede pasar `onReintentar`: una función no cruza al cliente. Este
 * envoltorio lo resuelve con `router.refresh()`, que vuelve a pedir la página al servidor sin
 * perder el estado del cliente ni recargar el documento.
 *
 * @param titulo el titular del error; por defecto el de `ErrorEstado`
 * @param detalle el mensaje de la API, que `ErrorEstado` pasa a lenguaje de pantalla
 * @param className clases extra del contenedor
 * @returns el bloque de error con su botón de reintento
 */
export function ErrorRecargable ({ titulo, detalle, className }: {
  titulo?: string
  detalle?: string
  className?: string
}): ReactElement {
  const router = useRouter()

  return (
    <ErrorEstado
      titulo={titulo}
      detalle={detalle}
      className={className}
      onReintentar={() => { startTransition(() => { router.refresh() }) }}
    />
  )
}
