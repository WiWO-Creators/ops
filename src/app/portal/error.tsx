'use client'

import { PantallaCaida } from '@/componentes/estado/PantallaCaida'

/**
 * Red de contencion del portal.
 *
 * Las pestañas del proyecto se resuelven en el servidor, asi que un 500 en cualquiera de ellas —o en
 * el `/portal/me` del armazon— tumbaba la pantalla entera con la pagina generica de Next. Aca queda
 * dentro del sistema de diseño y con un reintento, que es lo que casi siempre alcanza.
 *
 * El detalle no se muestra pero si se registra: `PantallaCaida` guarda el incidente y el aviso
 * flotante le da al contacto el codigo para reportarlo. Antes, un cliente que veia caerse el portal
 * no tenia nada que contar mas que la hora aproximada.
 */
export default function ErrorDelPortal ({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
  return (
    <PantallaCaida
      error={error}
      reset={reset}
      detalle="No pudimos cargar esta pantalla. Prueba de nuevo en un momento."
    />
  )
}
