'use client'

import { useEffect, useRef, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { CLAVE_BIENVENIDA } from '@/lib/bienvenida'
import { COLOR_BARRA, decidirActualizacion, urlDeRegistro, versionDelScript } from '@/lib/pwa'
import { EVENTO_TEMA, esOscuro } from '@/lib/tema'

interface PropsAppInstalable {
  /** Versión del build que sirvió esta página. La resuelve el servidor (`versionDelServidor`). */
  version: string
}

/**
 * Registra el service worker de la aplicación instalable y ofrece recargar cuando hay uno nuevo.
 *
 * Va en el armazón del panel —igual que `VigilanteDeVersion`— y no en el layout raíz: la versión
 * tiene que ser la del JavaScript que se acaba de mandar, y solo un layout que se resuelve en cada
 * petición la conoce. Una página estática del layout raíz llevaría congelada la versión del momento
 * del build, y el trabajador saltaría de una URL a otra al navegar. El alcance del trabajador es
 * igual todo el sitio (`scope: '/'`): una vez registrado, la página sin red sale también fuera del
 * panel.
 *
 * Solo en producción. En `next dev` los chunks cambian en cada guardado y un trabajador sirviéndolos
 * desde caché sería una fuente de "no veo mi cambio" imposible de diagnosticar.
 */
export function AppInstalable ({ version }: PropsAppInstalable) {
  const { enEspera, descartar } = useServiceWorker(version)

  if (enEspera === null) return null

  return (
    <div
      role="status"
      // Capa fija sobre el panel: sin nombre propio, la transición de página la taparía en sus
      // primeros fotogramas. Ver la memoria de `TransicionDePagina`.
      style={{ viewTransitionName: 'aviso-app-nueva' }}
      className="border-linea bg-superficie-flotante shadow-flotante animate-entrar-abajo top-seguro fixed inset-x-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border px-4 py-3"
    >
      <RefreshCw className="text-acento size-5 shrink-0" aria-hidden="true" />
      <p className="text-texto min-w-0 flex-1 text-sm font-semibold">Hay una versión nueva, recarga para usarla.</p>
      <Boton variante="primario" tamano="chico" className="pointer-coarse:min-h-11" onClick={() => { activar(enEspera) }}>
        Recargar
      </Boton>
      <Boton variante="sutil" tamano="chico" soloIcono className="pointer-coarse:min-h-11 pointer-coarse:min-w-11" aria-label="Descartar el aviso" onClick={descartar}>
        <X className="size-4" aria-hidden="true" />
      </Boton>
    </div>
  )
}

/**
 * Registra el trabajador y vigila si aparece uno nuevo en espera.
 *
 * @param version versión de la página
 * @returns el trabajador en espera que conviene ofrecer, o `null`, y cómo descartar el aviso
 */
function useServiceWorker (version: string) {
  const [enEspera, setEnEspera] = useState<ServiceWorker | null>(null)
  const recargando = useRef(false)

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return

    let vigente = true
    const contenedor = navigator.serviceWorker

    /** Decide qué hacer con un trabajador que terminó de instalarse y espera. */
    const atender = (trabajador: ServiceWorker | null) => {
      // Sin controlador es la primera instalación: no hay versión vieja que reemplazar.
      if (trabajador === null || contenedor.controller === null || !vigente) return
      if (decidirActualizacion(version, trabajador.scriptURL) === 'silenciosa') {
        trabajador.postMessage({ tipo: 'SALTAR_ESPERA' })
        return
      }
      setEnEspera(trabajador)
    }

    // Recargar solo si fue la persona quien pidió activar la versión nueva. Una activación silenciosa
    // también cambia el controlador, y recargar ahí le borraría lo que estaba escribiendo.
    const alCambiarControlador = () => {
      if (!recargaPedida || recargando.current) return
      recargando.current = true
      window.location.reload()
    }
    contenedor.addEventListener('controllerchange', alCambiarControlador)

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
      contenedor.removeEventListener('controllerchange', alCambiarControlador)
    }
  }, [version])

  return { enEspera, descartar: () => { setEnEspera(null) } }
}

/** Si la persona pidió activar la versión nueva desde el aviso. Vive lo que vive la pestaña. */
let recargaPedida = false

/**
 * Activa el trabajador en espera y recarga cuando tome el control.
 *
 * Deja además la marca de la bienvenida, la misma que usa `VigilanteDeVersion`: quien actualiza
 * desde este aviso ve la misma recepción que quien lo hace desde el otro.
 *
 * @param trabajador el service worker en espera
 */
function activar (trabajador: ServiceWorker): void {
  recargaPedida = true
  try {
    const nueva = versionDelScript(trabajador.scriptURL)
    if (nueva !== '') sessionStorage.setItem(CLAVE_BIENVENIDA, nueva)
  } catch {
    // Sin almacenamiento de sesión la recarga igual ocurre; solo se pierde la bienvenida.
  }
  trabajador.postMessage({ tipo: 'SALTAR_ESPERA' })
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
