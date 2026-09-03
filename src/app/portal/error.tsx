'use client'

import { ErrorEstado } from '@/componentes/estado/Estados'

/**
 * Red de contencion del portal.
 *
 * Las pestañas del proyecto se resuelven en el servidor, asi que un 500 en cualquiera de ellas —o en
 * el `/portal/me` del armazon— tumbaba la pantalla entera con la pagina generica de Next. Aca queda
 * dentro del sistema de diseño y con un reintento, que es lo que casi siempre alcanza.
 *
 * El detalle no se muestra: en produccion Next lo reemplaza por un digest, y el mensaje crudo puede
 * llevar rastros del backend.
 */
export default function ErrorDelPortal ({ reset }: { error: Error & { digest?: string }, reset: () => void }) {
  return (
    <ErrorEstado
      detalle="No pudimos cargar esta pantalla. Probá de nuevo en un momento."
      onReintentar={reset}
    />
  )
}
