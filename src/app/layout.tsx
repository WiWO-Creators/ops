import type { Metadata, Viewport } from 'next'
import { SCRIPT_BARRA_INICIAL } from '@/lib/barra-lateral'
import { SCRIPT_TEMA_INICIAL } from '@/lib/tema'
import './globals.css'

export const metadata: Metadata = {
  title: 'WiWO Ops',
  description: 'Sistema operativo de WiWO'
}

export const viewport: Viewport = {
  // El layout ya se adapta a los cinco cortes; bloquear el zoom le saca la salida de emergencia a
  // quien necesita agrandar.
  width: 'device-width',
  initialScale: 1
}

export default function RaizLayout ({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/*
          Corre antes del primer pintado para que quien eligio oscuro no vea un destello claro.
          Cualquier otra via (efecto, provider) corre despues, que es justo el momento a ganarle.
          `suppressHydrationWarning` en <html> porque este script le agrega un atributo que el HTML
          del servidor no trae.
        */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA_INICIAL }} />
        {/* Mismo motivo que el de arriba, para el ancho de la barra lateral. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_BARRA_INICIAL }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
