/*
 * Service worker de Ops.
 *
 * Qué hace y, sobre todo, qué NO hace:
 *
 * - Guarda el armazón mínimo para cuando no hay red: `offline.html` y los íconos. Nada más se
 *   precachea.
 * - Sirve `/_next/static/*` desde caché primero: esos archivos llevan el hash del contenido en el
 *   nombre y no cambian nunca, así que la copia guardada es siempre correcta.
 * - Fuentes, íconos e imágenes de marca: la copia guardada al instante y se refresca por detrás.
 * - Las navegaciones van SIEMPRE a la red. Las páginas del panel y del portal están hechas con la
 *   sesión de quien mira: guardarlas dejaría datos de una persona en el disco después de salir, y
 *   serviría pantallas viejas como si fueran actuales. Sin red, se muestra `offline.html`.
 * - `/api/*` (el BFF, con la cookie de sesión) no se toca jamás: ni se guarda ni se intercepta.
 *   Tampoco las peticiones de datos de React (`RSC`), ni nada que no sea GET, ni otro origen.
 *
 * La versión viaja en la URL de registro (`/sw.js?v=<BUILD_ID>`) y nombra la caché. Un despliegue
 * nuevo registra otra URL, el navegador instala este mismo archivo como trabajador nuevo y, al
 * activarse, borra las cachés de versiones anteriores.
 *
 * No hace `skipWaiting()` por su cuenta: el trabajador nuevo espera hasta que la página se lo pida
 * (`{ tipo: 'SALTAR_ESPERA' }`). Así una pestaña abierta nunca queda con un JavaScript servido por
 * una versión y otro por la siguiente.
 */

/* global self, caches, importScripts */

// Las notificaciones push viven en su propio archivo, que mantiene otro frente. Si falta o falla,
// el resto del trabajador tiene que seguir funcionando: un error acá abortaría la instalación entera.
try {
  importScripts('/sw-push.js')
} catch (error) {
  console.warn('[sw] sw-push.js no se pudo cargar; sigue sin push.', error)
}

const VERSION = new URL(self.location.href).searchParams.get('v') || 'local'
const PREFIJO = 'ops-'
const CACHE_ARMAZON = `${PREFIJO}armazon-${VERSION}`
const CACHE_ESTATICOS = `${PREFIJO}estaticos-${VERSION}`
const PAGINA_SIN_RED = '/offline.html'

const ARMAZON = [
  PAGINA_SIN_RED,
  '/iconos/icono-192.png',
  '/iconos/icono-512.png'
]

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE_ARMAZON).then((cache) => cache.addAll(ARMAZON)))
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    const vigentes = new Set([CACHE_ARMAZON, CACHE_ESTATICOS])
    const nombres = await caches.keys()
    await Promise.all(
      nombres
        .filter((nombre) => nombre.startsWith(PREFIJO) && !vigentes.has(nombre))
        .map((nombre) => caches.delete(nombre))
    )
    await self.clients.claim()
  })())
})

self.addEventListener('message', (evento) => {
  if (evento.data && evento.data.tipo === 'SALTAR_ESPERA') self.skipWaiting()
})

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request
  if (peticion.method !== 'GET') return

  const url = new URL(peticion.url)
  if (url.origin !== self.location.origin) return
  // El BFF y todo lo autenticado: pasa derecho a la red, sin respondWith.
  if (url.pathname.startsWith('/api/')) return
  // Datos de React Server Components: son la página con sesión, en otro formato.
  if (peticion.headers.has('RSC') || url.searchParams.has('_rsc')) return

  if (peticion.mode === 'navigate') {
    evento.respondWith(navegar(peticion))
    return
  }

  if (url.pathname.startsWith('/_next/static/')) {
    evento.respondWith(primeroCache(peticion))
    return
  }

  if (/^\/(fonts|iconos|marca)\//.test(url.pathname)) {
    evento.respondWith(cacheYRefresco(peticion))
  }
})

/**
 * Navegación: siempre la red, y la página sin red solo si la red falla.
 * La respuesta de la red no se guarda (ver el encabezado del archivo).
 */
async function navegar (peticion) {
  try {
    return await fetch(peticion)
  } catch (error) {
    const guardada = await caches.match(PAGINA_SIN_RED)
    if (guardada) return guardada
    throw error
  }
}

/** Archivos con hash: la copia guardada si existe; si no, la red, y se guarda si salió bien. */
async function primeroCache (peticion) {
  const guardada = await caches.match(peticion)
  if (guardada) return guardada

  const respuesta = await fetch(peticion)
  if (esGuardable(respuesta)) {
    const cache = await caches.open(CACHE_ESTATICOS)
    await cache.put(peticion, respuesta.clone())
  }
  return respuesta
}

/** Copia guardada al instante, y la red la reemplaza por detrás para la próxima vez. */
async function cacheYRefresco (peticion) {
  const cache = await caches.open(CACHE_ESTATICOS)
  const guardada = await cache.match(peticion)

  const deRed = fetch(peticion)
    .then(async (respuesta) => {
      if (esGuardable(respuesta)) await cache.put(peticion, respuesta.clone())
      return respuesta
    })
    .catch((error) => {
      if (guardada) return guardada
      throw error
    })

  return guardada || deRed
}

/**
 * Solo respuestas completas y del propio origen. Una respuesta con `Set-Cookie` o marcada como
 * privada viene de algo con sesión, y eso no se guarda aunque la ruta parezca estática.
 */
function esGuardable (respuesta) {
  if (!respuesta || respuesta.status !== 200 || respuesta.type !== 'basic') return false
  if (respuesta.headers.has('Set-Cookie')) return false
  const control = respuesta.headers.get('Cache-Control') || ''
  return !/no-store|private/i.test(control)
}
