import type { NextConfig } from 'next'

/**
 * Zona horaria del proceso de Next, fijada antes de que arranque la aplicacion.
 *
 * Next carga este archivo en el proceso del servidor antes de montar nada, y Node relee `TZ` en la
 * siguiente operacion de fecha, asi que basta con escribirla aca para que valga en `next build` y en
 * `next start`.
 *
 * No es cosmetico. Todo lo que agrupa por dia calendario —`diasHasta()` y `estadoVencimiento()` en
 * `lib/fechas.ts`, y con ellos los tramos "Vencido / Hoy / Próximo" del Inicio— lee el dia de HOY con
 * `getFullYear/getMonth/getDate`, que son la zona del proceso. Sin `TZ`, un servidor en UTC clasifica
 * contra el dia equivocado durante las ultimas horas de cada tarde chilena: lo que vence hoy se
 * pinta como vencido, y la pantalla que tenia que decir que hacer hoy dice otra cosa.
 *
 * Se fija aca y no solo en el entorno del despliegue porque el entorno se olvida: una maquina nueva,
 * un contenedor sin `TZ`, un `pnpm build` en el portatil de alguien, y el corrimiento vuelve sin que
 * nada falle. `process.env.TZ` ya puesto en el entorno gana igual: esto es el piso, no la orden.
 */
if ((process.env.TZ ?? '').trim() === '') process.env.TZ = 'America/Santiago'

const nextConfig: NextConfig = {
  /** Conserva enlaces guardados de proyectos y sus filtros al cambiar el slug público. */
  async redirects () {
    return [{ source: '/espacios/:ruta*', destination: '/proyectos/:ruta*', permanent: true }]
  },
  /**
   * Las fuentes se sirven con CORS abierto.
   *
   * No es por gusto: el Meeting Paper y los documentos del portal se pintan dentro de un iframe con
   * `sandbox=""`, que le da al documento un **origen opaco**. Desde ahí, pedir una fuente es una
   * petición entre orígenes que manda `Origin: null`, y sin `Access-Control-Allow-Origin` el
   * navegador la descarta en silencio: el documento cae a la tipografía del sistema y nadie se
   * entera de por qué. Con esta cabecera, un acta se lee —y se imprime— con la tipografía de la
   * marca.
   *
   * Abrirlo no expone nada: son archivos estáticos y públicos, que cualquiera puede descargar
   * pidiendo la URL directamente. Se acota a `/fonts/` para que sea eso y nada más.
   */
  async headers () {
    return [
      {
        source: '/fonts/:ruta*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }
        ]
      },
      /*
       * El service worker y lo que importa nunca se sirven desde una caché HTTP: el navegador decide
       * si hay versión nueva comparando el archivo, y una copia cacheada por un día congelaría a
       * todos en el trabajador viejo ese día entero. `Service-Worker-Allowed: /` deja explícito el
       * alcance sobre todo el sitio, que es donde vive `sw.js`.
       */
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' }
        ]
      },
      {
        source: '/sw-push.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }
        ]
      }
    ]
  }
}

export default nextConfig
