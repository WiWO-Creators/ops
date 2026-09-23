import type { Metadata, Viewport } from 'next'
import { AvisosDeError } from '@/componentes/estado/AvisosDeError'
import { ColorDeBarraDelSistema } from '@/componentes/estructura/AppInstalable'
import { COLOR_BARRA } from '@/lib/pwa'
import { SCRIPT_BARRA_INICIAL } from '@/lib/barra-lateral'
import { SCRIPT_BIENVENIDA_INICIAL } from '@/lib/bienvenida'
import { SCRIPT_TEMA_INICIAL } from '@/lib/tema'
import './globals.css'

export const metadata: Metadata = {
  title: 'WiWO Ops',
  description: 'Sistema operativo de WiWO',
  // El manifiesto lo publica `app/manifest.ts`. Esto es lo que iOS lee aparte, porque Safari no usa
  // el manifiesto para decidir como se abre la aplicacion agregada a la pantalla de inicio.
  applicationName: 'WiWO Ops',
  appleWebApp: { capable: true, title: 'Ops', statusBarStyle: 'default' }
}

export const viewport: Viewport = {
  // El layout ya se adapta a los cinco cortes; bloquear el zoom le saca la salida de emergencia a
  // quien necesita agrandar.
  width: 'device-width',
  initialScale: 1,
  // La pagina ocupa la pantalla entera, muesca y barra de gestos incluidas; cada borde que lo
  // necesita devuelve ese espacio con `pt-seguro` / `pb-seguro` (`estilos/movil.css`).
  viewportFit: 'cover',
  // El color de la barra del sistema, uno por esquema. Si la persona eligio un tema distinto del
  // del sistema, `AppInstalable` los reescribe al vuelo.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: COLOR_BARRA.claro },
    { media: '(prefers-color-scheme: dark)', color: COLOR_BARRA.oscuro }
  ]
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
        {/*
          Y el mismo motivo otra vez, para la bienvenida de despues de actualizar: si el telon lo
          pusiera React, la pagina nueva se veria unos cientos de milisegundos antes de que la tape la
          animacion, que es el orden inverso al que se quiere. Ver `lib/bienvenida.ts`.
        */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_BIENVENIDA_INICIAL }} />
      </head>
      <body>
        {children}
        {/*
          La pila de avisos de error vive en el layout raiz y no en el del panel porque los errores
          ocurren en los cuatro armazones —el panel, el portal del cliente, la ficha publica de una
          Tarea y las pantallas de acceso— y cada uno los sufria en silencio. Es lo ultimo del
          `body`: si abriera el arbol, cualquier error suyo se llevaria la pagina entera, y es el
          componente que existe justamente para cuando algo ya se rompio.
        */}
        <AvisosDeError />
        {/* Barra del sistema del color del tema elegido, en los cuatro armazones. */}
        <ColorDeBarraDelSistema />
      </body>
    </html>
  )
}
