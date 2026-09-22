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

// Se comprueban las RUTAS y no las claves: desde que el estado de los Proyectos existe, dos entradas
// del catalogo comparten la clave `projects` —son dos pantallas del mismo recurso— y lo que
// distingue un destino de otro es su href.
test('solo muestra las secciones que la API habilito', () => {
  const secciones = seccionesDelPortal(['projects', 'files', 'kb'])

  assert.deepEqual(
    secciones.map((s) => s.href),
    ['/portal/estado', '/portal/proyectos', '/portal/archivos', '/portal/ayuda']
  )
})

test('un contacto sin ninguna seccion no ve navegacion', () => {
  assert.deepEqual(seccionesDelPortal([]), [])
})

test('ignora claves que el frontend todavia no conoce', () => {
  // Si la API suma una seccion antes que el frontend, la navegacion no puede romperse.
  const secciones = seccionesDelPortal(['projects', 'seccion-del-futuro'])

  assert.deepEqual(secciones.map((s) => s.href), ['/portal/estado', '/portal/proyectos'])
})

test('respeta el orden del catalogo y no el del argumento', () => {
  // El orden lo fija el producto, no en que orden vino el arreglo de la API.
  const secciones = seccionesDelPortal(['kb', 'projects', 'files'])

  assert.deepEqual(
    secciones.map((s) => s.href),
    ['/portal/estado', '/portal/proyectos', '/portal/archivos', '/portal/ayuda']
  )
})

test('el estado de los Proyectos entra y sale con el listado, no con una clave propia', () => {
  // La API no emite ninguna clave para esta pantalla: es otra lectura del mismo recurso. Si alguien
  // le inventara una, la entrada quedaria apagada para siempre y nadie se enteraria, porque
  // `seccionesDelPortal` filtra en silencio lo que no reconoce.
  const con = seccionesDelPortal(['projects']).map((s) => s.href)
  const sin = seccionesDelPortal(['files']).map((s) => s.href)

  assert.deepEqual(con, ['/portal/estado', '/portal/proyectos'])
  assert.equal(sin.includes('/portal/estado'), false)
})

test('la navegacion no ofrece Soporte, ni aunque la API habilite la clave', () => {
  // El pedido fue explicito: los tickets se ven y se piden DENTRO del Proyecto. Un contacto con
  // `support` habilitado no puede volver a encontrarse una entrada general en el menu, porque desde
  // ahi abriria solicitudes sin Proyecto, que es justamente lo que dejaba tickets sin pestaña.
  const secciones = seccionesDelPortal(['projects', 'support', 'files'])

  assert.deepEqual(
    secciones.map((s) => s.href),
    ['/portal/estado', '/portal/proyectos', '/portal/archivos']
  )
  assert.equal(CATALOGO_PORTAL.some((s) => s.clave === 'support'), false)
})

test('ninguna entrada del catalogo apunta al soporte', () => {
  // El hilo de un ticket —`/portal/soporte/{id}`— sigue existiendo y tiene que seguir existiendo:
  // es la unica pantalla de un ticket sin Proyecto. Lo que no puede volver es una entrada de menu
  // hacia ahi, ni al listado ni al detalle.
  for (const seccion of CATALOGO_PORTAL) {
    assert.equal(seccion.href.startsWith('/portal/soporte'), false, seccion.href)
  }
})

test('todas las rutas del catalogo cuelgan de /portal', () => {
  // Una ruta fuera de /portal caeria en el guardia del panel y mandaria al cliente al login del
  // equipo.
  for (const seccion of CATALOGO_PORTAL) {
    assert.equal(seccion.href.startsWith('/portal/'), true, `${seccion.clave}: ${seccion.href}`)
  }
})

test('no hay rutas repetidas, y toda entrada tiene su puerta', () => {
  // La ruta es la identidad —dos entradas al mismo destino serian dos enlaces iguales en el menu, y
  // ademas la misma clave de React—. La clave, en cambio, SI se puede repetir: es la puerta que la
  // API abre, y dos pantallas del mismo recurso pasan por la misma. Lo que no se admite es una
  // entrada sin puerta, que no se encenderia nunca.
  const rutas = CATALOGO_PORTAL.map((s) => s.href)

  assert.equal(new Set(rutas).size, rutas.length)
  for (const seccion of CATALOGO_PORTAL) {
    assert.equal(seccion.clave.length > 0, true, seccion.href)
  }
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

test('la pestaña Tickets es la unica puerta al soporte y depende del interruptor del Proyecto', () => {
  // Desde que el menu no ofrece Soporte, esta pestaña es el unico lugar donde el cliente pide algo.
  // Sigue atada a lo que la API habilita: un Proyecto que no la comparte no la dibuja, y ahi no hay
  // atajo que valga. Si alguien la sacara de la lista, el portal se quedaria sin alta de tickets.
  assert.equal(PESTANIAS_PROYECTO.some((p) => p.clave === 'tickets'), true)
  assert.deepEqual(pestaniasDelProyecto(['tickets']).map((p) => p.clave), ['tickets'])
  assert.deepEqual(pestaniasDelProyecto(['overview', 'tasks']).map((p) => p.clave), ['overview', 'tasks'])
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
