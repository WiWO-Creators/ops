/**
 * Notificaciones push de Ops, dentro del service worker.
 *
 * No es un service worker por si solo: lo carga `public/sw.js` con `importScripts('/sw-push.js')`.
 * Asi el service worker de la app (cache, instalacion) y el de los avisos se mantienen por separado
 * y ninguno puede romper al otro: si este archivo falla al cargar, `sw.js` lo atrapa y sigue.
 *
 * === EL PUSH LLEGA VACIO ===
 *
 * La API manda el push sin contenido (ver `modules/api/Push/EnvioPush.php` en el board): el texto
 * del aviso no pasa por los servidores de Google, Mozilla, Apple ni Microsoft. Al recibirlo, esto
 * le pide al BFF el ultimo aviso sin leer con la sesion del dispositivo y muestra ese. Si la sesion
 * vencio o no hay red, muestra un aviso generico: el navegador exige mostrar algo por cada push y,
 * si no, pinta uno propio que dice menos todavia.
 *
 * Todas las notificaciones llevan la misma `tag`: la nueva reemplaza a la anterior en vez de apilar
 * diez en el centro de notificaciones. La campana sigue teniendo la lista completa.
 */

/** Ruta del BFF que devuelve el ultimo aviso sin leer. */
const RUTA_ULTIMO_AVISO = '/api/bff/notifications?per_page=1&filter[unread]=1'

/** A donde lleva un aviso que no apunta a nada que Ops sepa abrir. */
const RUTA_POR_DEFECTO = '/inicio'

/** El listado de Tareas que abre una por id. Mismo destino que `dominio/enlace-de-aviso.ts`. */
const RUTA_DE_TAREAS = '/procesos'

/** Etiqueta comun: cada aviso nuevo reemplaza al anterior. */
const ETIQUETA = 'ops-aviso'

const ICONO = '/marca/wiwo-ops.png'

/** Lo que se muestra cuando no se pudo leer el aviso. */
const AVISO_GENERICO = { titulo: 'WiWO Ops', cuerpo: 'Tienes un aviso nuevo.', url: RUTA_POR_DEFECTO }

/**
 * Traduce el `link` de un aviso a una ruta de Ops: la ruta interna tal cual (`/proyectos/1?tab=tickets&ticket=4`)
 * o el `#taskid=512` del panel clasico.
 *
 * Es una copia deliberada de `rutaDeAviso()` (`src/dominio/enlace-de-aviso.ts`): un service worker
 * es un archivo suelto que el navegador carga sin pasar por el bundler, asi que no puede importar
 * TypeScript. `pruebas/sw-push.test.js` comprueba que las dos digan lo mismo.
 *
 * @param {string | null | undefined} link
 * @returns {string | null}
 */
function rutaDeAviso (link) {
  if (typeof link !== 'string') return null

  const recortado = link.trim()
  if (/^\/(?![/\\])[A-Za-z0-9\-._~/?&=%]*$/.test(recortado)) return recortado

  const coincidencia = /^#taskid=(\d+)$/.exec(recortado)
  if (coincidencia === null) return null

  const id = Number(coincidencia[1])
  if (!Number.isSafeInteger(id) || id <= 0) return null

  return `${RUTA_DE_TAREAS}?tarea=${id}`
}

/**
 * El aviso a mostrar a partir de la respuesta del BFF.
 *
 * @param {unknown} sobre el JSON de `GET /notifications`
 * @returns {{ titulo: string, cuerpo: string, url: string }}
 */
function avisoDesdeRespuesta (sobre) {
  const filas = sobre !== null && typeof sobre === 'object' && Array.isArray(sobre.data) ? sobre.data : []
  const aviso = filas[0]

  if (aviso === undefined || typeof aviso.text !== 'string' || aviso.text.trim() === '') {
    return AVISO_GENERICO
  }

  const autor = aviso.from !== null && typeof aviso.from === 'object' && typeof aviso.from.name === 'string'
    ? aviso.from.name.trim()
    : ''

  return {
    titulo: autor === '' ? 'WiWO Ops' : autor,
    cuerpo: aviso.text.trim(),
    url: rutaDeAviso(aviso.link) ?? RUTA_POR_DEFECTO
  }
}

/**
 * Pide el ultimo aviso sin leer. Nunca rechaza: cualquier fallo es el aviso generico.
 *
 * @returns {Promise<{ titulo: string, cuerpo: string, url: string }>}
 */
async function ultimoAviso () {
  try {
    const respuesta = await fetch(RUTA_ULTIMO_AVISO, { credentials: 'include', cache: 'no-store' })

    if (!respuesta.ok) return AVISO_GENERICO

    return avisoDesdeRespuesta(await respuesta.json())
  } catch {
    return AVISO_GENERICO
  }
}

/** Muestra el ultimo aviso. */
async function mostrarUltimoAviso () {
  const aviso = await ultimoAviso()

  await self.registration.showNotification(aviso.titulo, {
    body: aviso.cuerpo,
    icon: ICONO,
    badge: ICONO,
    tag: ETIQUETA,
    renotify: true,
    lang: 'es',
    data: { url: aviso.url }
  })
}

/**
 * `true` si la pestaña ya muestra exactamente el destino (misma ruta y misma consulta).
 *
 * @param {string} url la URL de la pestaña
 * @param {URL} destino a donde lleva el aviso
 * @returns {boolean}
 */
function yaEstaEn (url, destino) {
  try {
    const actual = new URL(url)

    return actual.origin === destino.origin && actual.pathname === destino.pathname && actual.search === destino.search
  } catch {
    return false
  }
}

/**
 * Lleva a la persona al aviso: enfoca la pestaña que ya lo muestra o abre una nueva.
 *
 * **Nunca navega una pestaña abierta.** Antes se tomaba cualquier pestaña de Ops y se la llevaba al
 * aviso; si en esa pestaña habia una respuesta a medio escribir o un formulario abierto, el clic en
 * la notificacion lo tiraba. Ahora solo se reutiliza la que ya esta en el destino (enfocarla no
 * cambia nada), y en cualquier otro caso se abre una pestaña aparte.
 *
 * @param {string} ruta ruta relativa del aviso
 */
async function abrirAviso (ruta) {
  const destino = new URL(ruta, self.location.origin)

  // Solo rutas del mismo origen: el dato viene del propio SW, pero una URL absoluta colada en `data`
  // no puede convertir el clic en un salto a otro sitio.
  if (destino.origin !== self.location.origin) return

  const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const enElDestino = ventanas.find((ventana) => yaEstaEn(ventana.url, destino))

  if (enElDestino !== undefined) {
    await enElDestino.focus()

    return
  }

  await self.clients.openWindow(destino.href)
}

self.addEventListener('push', (evento) => {
  evento.waitUntil(mostrarUltimoAviso())
})

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()

  const datos = evento.notification.data
  const ruta = datos !== null && typeof datos === 'object' && typeof datos.url === 'string' ? datos.url : RUTA_POR_DEFECTO

  evento.waitUntil(abrirAviso(ruta))
})

// Para las pruebas de Node: fuera de un service worker `module` existe y se exportan las funciones
// puras. Dentro del navegador no hay `module` y esta linea no hace nada.
if (typeof module !== 'undefined') {
  module.exports = { rutaDeAviso, avisoDesdeRespuesta, RUTA_ULTIMO_AVISO }
}
