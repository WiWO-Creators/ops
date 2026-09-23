import type { MetadataRoute } from 'next'

/**
 * Manifiesto de la aplicación instalable.
 *
 * Los colores son los literales de `--superficie` en claro (`--wiwo-almost-white`) y del azul de la
 * marca: el manifiesto es JSON estático y no entiende `var()` ni `light-dark()`. El color de la barra
 * del sistema en oscuro lo resuelve `viewport.themeColor` del layout raíz, que sí acepta una media
 * query por color; el manifiesto solo admite uno.
 *
 * `start_url` es `/inicio` y no `/`: la raíz es el acceso del portal de clientes, y quien instala Ops
 * desde el panel espera abrir el panel.
 */
export default function manifest (): MetadataRoute.Manifest {
  return {
    id: '/inicio',
    name: 'WiWO Ops',
    short_name: 'Ops',
    description: 'Sistema operativo de WiWO',
    lang: 'es',
    start_url: '/inicio',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#F4F3EE',
    theme_color: '#F4F3EE',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/iconos/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/iconos/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/iconos/icono-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/iconos/icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ],
    shortcuts: [
      {
        name: 'Mis Tareas',
        short_name: 'Mis Tareas',
        url: '/mis-tareas',
        icons: [{ src: '/iconos/icono-192.png', sizes: '192x192', type: 'image/png' }]
      },
      {
        name: 'En vivo',
        short_name: 'En vivo',
        url: '/live',
        icons: [{ src: '/iconos/icono-192.png', sizes: '192x192', type: 'image/png' }]
      }
    ]
  }
}
