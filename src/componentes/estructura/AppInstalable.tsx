'use client'

import { useEffect } from 'react'
import { COLOR_BARRA, decidirActualizacion, urlDeRegistro } from '@/lib/pwa'
import { EVENTO_TEMA, esOscuro } from '@/lib/tema'

interface PropsAppInstalable {
  /** Versión del build que sirvió esta página. La resuelve el servidor (`versionDelServidor`). */
  version: string
}

/**
 * Registra el service worker de la aplicación instalable. No pinta nada.
 *
 * Va en el armazón del panel —igual que `VigilanteDeVersion`— y no en el layout raíz: la versión
 * tiene que ser la del JavaScript que se acaba de mandar, y solo un layout que se resuelve en cada
 * petición la conoce. Una página estática del layout raíz llevaría congelada la versión del momento
 * del build, y el trabajador saltaría de una URL a otra al navegar. El alcance del trabajador es
 * igual todo el sitio (`scope: '/'`): una vez registrado, la página sin red sale también fuera del
 * panel.
 *
 * El aviso de versión nueva es uno solo, el de `VigilanteDeVersion`. Antes este componente pintaba
 * el suyo arriba y los dos aparecían a la vez por el mismo despliegue. No hace falta: el trabajador
 * sirve las navegaciones siempre desde la red, así que recargar ya trae la página nueva, y esa página
 * registra el trabajador de su versión y lo activa en silencio (`decidirActualizacion`).
 *
 * Solo en producción. En `next dev` los chunks cambian en cada guardado y un trabajador sirviéndolos
 * desde caché sería una fuente de "no veo mi cambio" imposible de diagnosticar.
 */
export function AppInstalable ({ version }: PropsAppInstalable): null {
  useServiceWorker(version)
  return null
}

/**
 * Registra el trabajador y activa en silencio el que llegue en espera con la versión de la página.
 *
 * Uno de otra versión se deja esperando: la página que se está mirando es la vieja, y activarlo por
 * debajo mezclaría dos versiones. Lo resuelve la recarga que ofrece `VigilanteDeVersion`.
 *
 * @param version versión de la página
 */
function useServiceWorker (version: string): void {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return

    let vigente = true
    const contenedor = navigator.serviceWorker

    /** Activa el trabajador que terminó de instalarse si es de esta misma versión. */
    const atender = (trabajador: ServiceWorker | null) => {
      // Sin controlador es la primera instalación: no hay versión vieja que reemplazar.
      if (trabajador === null || contenedor.controller === null || !vigente) return
      if (decidirActualizacion(version, trabajador.scriptURL) === 'silenciosa') {
        trabajador.postMessage({ tipo: 'SALTAR_ESPERA' })
      }
    }

    contenedor.register(urlDeRegistro(version), { scope: '/' })
      .then((registro) => {
        atender(registro.waiting)
        registro.addEventListener('updatefound', () => {
          const nuevo = registro.installing
          nuevo?.addEventListener('statechange', () => {
            if (nuevo.state === 'installed') atender(nuevo)
          })
        })
      })
      .catch((error: unknown) => {
        // Sin trabajador la aplicación funciona igual, solo que sin página sin red. No es un error
        // que la persona pueda resolver, así que no se le muestra.
        console.warn('[pwa] No se pudo registrar el service worker.', error)
      })

    return () => {
      vigente = false
    }
  }, [version])
}

/**
 * Pinta la barra del sistema (la de estado del teléfono, la de la ventana instalada) del color del
 * tema EFECTIVO.
 *
 * El `themeColor` del viewport tiene una variante por esquema del sistema, pero no sabe nada de la
 * elección explícita del selector de tema: con el teléfono en claro y Ops en oscuro, la barra salía
 * clara sobre una aplicación oscura. Se reescribe el contenido de las metas —las dos, porque el
 * navegador usa la que coincide con el esquema del sistema— cada vez que el tema cambia.
 */
export function ColorDeBarraDelSistema (): null {
  useEffect(() => {
    const pintar = () => {
      const color = esOscuro() ? COLOR_BARRA.oscuro : COLOR_BARRA.claro
      for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute('content', color)
    }
    const esquema = window.matchMedia('(prefers-color-scheme: dark)')

    pintar()
    window.addEventListener(EVENTO_TEMA, pintar)
    window.addEventListener('storage', pintar)
    esquema.addEventListener('change', pintar)
    return () => {
      window.removeEventListener(EVENTO_TEMA, pintar)
      window.removeEventListener('storage', pintar)
      esquema.removeEventListener('change', pintar)
    }
  }, [])

  return null
}
