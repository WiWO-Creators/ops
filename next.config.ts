import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
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
      }
    ]
  }
}

export default nextConfig
