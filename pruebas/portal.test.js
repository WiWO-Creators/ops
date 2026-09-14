/**
 * Pruebas de la navegacion del portal del cliente.
 *
 * Lo que se prueba es la decision de que ve cada contacto. Un contacto sin permiso de proyectos que
 * ve el enlace a proyectos no rompe nada —la API responde 403— pero le muestra una puerta cerrada y
 * lo obliga a descubrirlo a los golpes.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CATALOGO_PORTAL, saludar, seccionesDelPortal } from '../src/dominio/portal.ts'
import { nombreDeArchivo, origenDeArchivo } from '../src/definiciones/archivos.ts'

test('solo muestra las secciones que la API habilito', () => {
  const secciones = seccionesDelPortal(['projects', 'files', 'kb'])

  assert.deepEqual(secciones.map((s) => s.clave), ['projects', 'files', 'kb'])
})

test('un contacto sin ninguna seccion no ve navegacion', () => {
  assert.deepEqual(seccionesDelPortal([]), [])
})

test('ignora claves que el frontend todavia no conoce', () => {
  // Si la API suma una seccion antes que el frontend, la navegacion no puede romperse.
  const secciones = seccionesDelPortal(['projects', 'seccion-del-futuro'])

  assert.deepEqual(secciones.map((s) => s.clave), ['projects'])
})

test('respeta el orden del catalogo y no el del argumento', () => {
  // El orden lo fija el producto, no en que orden vino el arreglo de la API.
  const secciones = seccionesDelPortal(['kb', 'projects', 'files'])

  assert.deepEqual(secciones.map((s) => s.clave), ['projects', 'files', 'kb'])
})

test('todas las rutas del catalogo cuelgan de /portal', () => {
  // Una ruta fuera de /portal caeria en el guardia del panel y mandaria al cliente al login del
  // equipo.
  for (const seccion of CATALOGO_PORTAL) {
    assert.equal(seccion.href.startsWith('/portal/'), true, `${seccion.clave}: ${seccion.href}`)
  }
})

test('no hay claves ni rutas repetidas', () => {
  const claves = CATALOGO_PORTAL.map((s) => s.clave)
  const rutas = CATALOGO_PORTAL.map((s) => s.href)

  assert.equal(new Set(claves).size, claves.length)
  assert.equal(new Set(rutas).size, rutas.length)
})

import { PESTANIAS_PROYECTO, PORTAL_PROYECTOS, PORTAL_TAREAS, pestaniasDelProyecto } from '../src/definiciones/portal-proyectos.ts'

test('las pestañas del proyecto salen de lo que habilito la API', () => {
  const visibles = pestaniasDelProyecto(['overview', 'tasks', 'gantt'])

  assert.deepEqual(visibles.map((p) => p.clave), ['overview', 'tasks', 'gantt'])
})

test('ignora las pestañas que la API habilita y el portal no construyo', () => {
  // Contratos y propuestas dentro de un proyecto: se ven en su seccion propia del menu, y una
  // pestaña que no lleva a ningun lado es peor que ninguna.
  const visibles = pestaniasDelProyecto(['tasks', 'contracts', 'proposals'])

  assert.deepEqual(visibles.map((p) => p.clave), ['tasks'])
})

test('el orden lo fija el producto, no el arreglo de la API', () => {
  const visibles = pestaniasDelProyecto(['activity', 'tickets', 'overview', 'tasks'])

  assert.deepEqual(visibles.map((p) => p.clave), ['overview', 'tasks', 'tickets', 'activity'])
})

test('un proyecto sin nada compartido no dibuja pestañas', () => {
  assert.deepEqual(pestaniasDelProyecto([]), [])
})

test('cada pestaña conocida tiene rotulo y no se repite', () => {
  const claves = PESTANIAS_PROYECTO.map((p) => p.clave)

  assert.equal(new Set(claves).size, claves.length)
  for (const p of PESTANIAS_PROYECTO) assert.equal(p.etiqueta.length > 0, true, p.clave)
})

test('las tareas del proyecto no declaran ruta propia', () => {
  // Cuelgan de un proyecto: la ruta la completa la pantalla con el id. Un valor fijo aca mentiria
  // sobre a donde apunta.
  assert.equal(PORTAL_TAREAS.ruta, '')
  assert.equal(PORTAL_PROYECTOS.ruta, 'portal/projects')
})

/**
 * Un archivo del portal. Lo resuelve `definiciones/archivos`, el mismo modulo que usa la pestaña
 * del equipo: estas pruebas existen para que la fila del portal siga cayendo ahi y no vuelva a
 * tener su propia version.
 */
function archivo (url, extra = {}) {
  return {
    id: 1,
    file_name: 'plano_5f3a.pdf',
    original_file_name: null,
    subject: null,
    filetype: null,
    date_added: null,
    url,
    thumbnail_url: null,
    ...extra
  }
}

test('un archivo del servidor se descarga por el BFF, que es quien tiene el token', () => {
  assert.deepEqual(origenDeArchivo(archivo('/api/v1/files/7')), {
    tipo: 'descargable',
    ruta: '/api/bff/files/7'
  })
})

test('un adjunto externo del portal se reconoce como externo', () => {
  // Antes el portal no miraba `external` y lo enlazaba como si fuera propio. Es la diferencia que
  // justifica compartir el modulo en vez de copiarlo.
  assert.deepEqual(origenDeArchivo(archivo('https://drive.ejemplo.cl/x', { external: 'gdrive' })), {
    tipo: 'externo',
    servicio: 'gdrive',
    enlace: 'https://drive.ejemplo.cl/x'
  })
})

test('un archivo sin url no da enlace', () => {
  // Sin esto el portal pintaba `href=""`, que recarga la pantalla en vez de descargar y deja al
  // cliente creyendo que el archivo esta roto.
  assert.equal(origenDeArchivo(archivo(null)).tipo, 'sinEnlace')
  assert.equal(origenDeArchivo(archivo('')).tipo, 'sinEnlace')
})

test('el portal muestra el nombre que escribio la persona, no el de disco', () => {
  assert.equal(nombreDeArchivo(archivo(null)), 'plano_5f3a.pdf')
  assert.equal(nombreDeArchivo(archivo(null, { original_file_name: 'plano.pdf' })), 'plano.pdf')
  assert.equal(nombreDeArchivo(archivo(null, { subject: 'Plano de planta' })), 'Plano de planta')
})

test('el saludo usa el nombre de pila', () => {
  assert.equal(saludar({ firstname: 'Ana', full_name: 'Ana Soto' }), 'Ana')
})

test('sin nombre de pila el saludo cae al nombre completo', () => {
  // Pasa con los contactos cargados con todo el nombre en un solo campo: antes quedaba "Hola, ".
  assert.equal(saludar({ firstname: '', full_name: 'Ana Soto' }), 'Ana Soto')
  assert.equal(saludar({ firstname: '   ', full_name: 'Ana Soto' }), 'Ana Soto')
})

/**
 * El bloque "Esperan tu visto bueno" pinta el estado de cada {proceso}.
 *
 * Es la unica pantalla del portal donde una Tarea aparece fuera de la tabla, asi que es la unica que
 * puede quedarse sin estado sin que `comoInsignia` la cubra. La insignia sale de `EstadoDeTarea`,
 * que devuelve `null` si no le llega el catalogo: si alguien deja de pasar `estados` desde el
 * servidor, la insignia desaparece en silencio y nada falla. Esto lo hace fallar.
 */
test('el catalogo de estados del portal alcanza para resolver una Tarea pendiente', async () => {
  const { PROCESOS } = await import('../mock/datos.js')
  const { resolverEstado } = await import('../src/dominio/estados-tarea.ts')
  const { ESTADOS_PROCESO } = await import('../mock/datos.js')

  const pendientes = PROCESOS.filter((p) => p.aprobacion?.estado === 'pendiente')
  assert.ok(pendientes.length > 0, 'el fixture tiene que traer alguna esperando visto bueno')

  for (const tarea of pendientes) {
    const estado = resolverEstado(tarea.status, ESTADOS_PROCESO)
    assert.equal(estado.desconocido, false, `el estado ${tarea.status} tiene que estar en el catalogo`)
    assert.ok(estado.etiqueta.length > 0, 'una Tarea que espera visto bueno no puede quedar sin estado')
  }
})

/** Sin catalogo no hay insignia: es la guarda que evita una lista de "#1" y "#4". */
test('sin catalogo el estado no se inventa', async () => {
  const { resolverEstado } = await import('../src/dominio/estados-tarea.ts')

  assert.equal(resolverEstado(1, []).desconocido, true)
})
