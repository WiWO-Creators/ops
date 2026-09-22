/**
 * Pruebas de `procesosDelContacto`: la tabla de Procesos del equipo, acotada a lo que ve un cliente.
 *
 * La tabla, el tablero y el calendario de la pestaña Tareas son **los mismos componentes** en el
 * panel y en el portal. Lo unico que los separa es esta definicion, asi que es el unico lugar donde
 * se puede colar un dato interno o una columna que la API del contacto no manda.
 *
 * Por eso la prueba central no es de forma sino de ejecucion: se pinta cada columna contra una fila
 * **del contrato del portal** (`TareaPortal`, sin asignados, sin hito, sin ETA) y se exige que
 * ninguna lance. Una columna del equipo que se cuele lee un objeto que no llego y rompe la fila
 * entera, no solo su celda.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PORTAL_TAREAS, procesosDelContacto } from '../src/definiciones/portal-proyectos.ts'
import { procesosDelEspacio } from '../src/definiciones/procesos.ts'
import { HITOS, definicionDeHitos } from '../src/definiciones/hitos.ts'
import { definicionDeTiempos } from '../src/definiciones/tiempos.ts'
import { ARCHIVOS, columnasDeArchivo } from '../src/definiciones/archivos.ts'
import { lecturasDelGantt } from '../src/componentes/proyecto/gantt.ts'
import { SIN_DATO } from '../src/lib/sla.ts'
import { fuenteDelPanel, fuenteDelPortal } from '../src/dominio/fuente-proyecto.ts'

const definicion = procesosDelContacto(8)

/**
 * Un Proceso tal como lo devuelve `GET /portal/projects/{id}/tasks`, con todos sus campos puestos.
 *
 * Copiado del contrato y no de `Proceso`: lo que hace valer la prueba es justamente lo que **no**
 * tiene —ni asignados, ni ETA, ni etiquetas—.
 *
 * `milestone`, `task_type` y `approval` son OBJETOS, no ids. La forma sale de
 * `RecursoProcesos::presentarLote()` recortada por `FormasDelPortal::PROCESOS`, y `Expuesto::solo()`
 * deja pasar entero lo declarado como valor suelto: por eso `task_type` trae tambien sus dos
 * colores. Esta fila decia `milestone: 0` y `task_type: 0`, y esa mentira es la que mantuvo las dos
 * columnas fuera de la tabla del cliente.
 *
 * `approval` no trae `rondas`: el portal no la manda. Es a proposito — `textoDeAprobacion` la lee
 * con un guard de tipo y sin ella el texto sale sin el sufijo `×N`.
 */
const FILA = {
  id: 512,
  patente: 'ESP-008-01',
  name: 'Revisar la pantalla de acceso',
  description: null,
  status: 4,
  priority: 1,
  start_date: '2026-08-08',
  due_date: '2026-09-08',
  date_finished: null,
  milestone: { id: 3, name: 'Puesta en marcha' },
  milestone_order: 0,
  task_type: { id: 7, name: 'Diseño', label_color: '#1e40af', text_color: '#ffffff' },
  approval: {
    requerida: true,
    estado: 'aprobada',
    solicitada_en: '2026-09-01T12:00:00Z',
    resuelta_en: '2026-09-02T09:30:00Z',
    comentario: 'Va bien, sigan'
  },
  counts: {}
}

/**
 * La misma fila con todo lo opcional vacio: sin hito, sin tipo y sin aprobacion.
 *
 * Es el caso normal, no el raro: `tbltasks.milestone` y `tbltasks.task_type` valen 0 cuando no hay
 * nada asignado, y ahi el presentador emite `null`. `approval` directamente no viaja cuando
 * `wiwo_core` no esta instalado, asi que la clave falta —no llega en `null`—: por eso se omite en
 * vez de ponerse en `null`.
 */
const { approval: _aprobacionQueNoViaja, ...SIN_APROBACION } = FILA

const FILA_VACIA = {
  ...SIN_APROBACION,
  id: 513,
  patente: null,
  start_date: null,
  due_date: null,
  milestone: null,
  task_type: null
}

test('la ruta es la del portal: el BFF elige el sujeto por el primer segmento', () => {
  assert.equal(definicion.ruta.startsWith('portal/'), true)
  assert.equal(definicion.ruta, 'portal/projects/8/tasks')
})

test('cada columna se pinta sin lanzar contra una fila del portal', () => {
  for (const columna of definicion.columnas) {
    assert.doesNotThrow(() => columna.presentar(FILA), `columna ${columna.clave}`)
    assert.doesNotThrow(() => columna.presentar(FILA_VACIA), `columna ${columna.clave} vacia`)
  }
})

/**
 * De que clave del payload vive cada columna, cuando no se llama igual.
 *
 * Las dos de aprobacion se pintan por separado —el estado y el comentario del cliente— y leen el
 * mismo bloque `approval`. Es el unico lugar donde el nombre de la columna y el de la clave se
 * separan, y sin este mapa la prueba de abajo pediria una clave `aprobacion` que no existe.
 */
const CLAVE_EN_EL_PAYLOAD = {
  aprobacion: 'approval',
  aprobacion_comentario: 'approval'
}

test('ninguna columna lee una clave que el contacto no recibe', () => {
  const recibidas = Object.keys(FILA)

  for (const columna of definicion.columnas) {
    const clave = CLAVE_EN_EL_PAYLOAD[columna.clave] ?? columna.clave

    assert.equal(recibidas.includes(clave), true, `columna ${columna.clave}`)
  }
})

test('no viajan las columnas internas del equipo', () => {
  const claves = definicion.columnas.map((c) => c.clave)

  // Asignados y seguidores son personas del equipo; el ETA, la desviacion, el SLA y la
  // justificacion son el compromiso interno del equipo consigo mismo; las iteraciones son un
  // contador de gestion y las etiquetas vocabulario interno, igual que en `proyectoDelPortal`.
  // Ninguna de las siete esta declarada en `FormasDelPortal::PROCESOS`.
  for (const prohibida of ['assignees', 'followers', 'eta', 'desviacion', 'estado_sla', 'justificacion', 'tags', 'project', 'date_added', 'iterations']) {
    assert.equal(claves.includes(prohibida), false, prohibida)
  }
})

test('el tipo, el hito y la aprobacion si se pintan: la API los manda como objeto', () => {
  const porClave = new Map(definicion.columnas.map((c) => [c.clave, c]))

  // Las tres estuvieron fuera por un comentario desactualizado que decia que la API no las mandaba.
  // Lo que se verifica acá no es que esten, sino que pinten el dato y no el guion: una columna que
  // dice "—" en todas las filas es peor que no tener la columna.
  assert.equal(porClave.get('task_type').presentar(FILA), 'Diseño')
  assert.equal(porClave.get('milestone').presentar(FILA), 'Puesta en marcha')
  // Sin `rondas` el texto no lleva el sufijo `×N`: el portal no manda ese contador.
  assert.equal(porClave.get('aprobacion').presentar(FILA), 'Aprobada')
  assert.equal(porClave.get('aprobacion_comentario').presentar(FILA), 'Va bien, sigan')

  // Vacias dicen lo que corresponde, y sin leer una propiedad de `null`.
  assert.equal(porClave.get('task_type').presentar(FILA_VACIA), SIN_DATO)
  assert.equal(porClave.get('milestone').presentar(FILA_VACIA), SIN_DATO)
  assert.equal(porClave.get('aprobacion').presentar(FILA_VACIA), 'No requiere')
  assert.equal(porClave.get('aprobacion_comentario').presentar(FILA_VACIA), SIN_DATO)
})

test('los encabezados y el orden son los del panel', () => {
  // La misma columna no puede llamarse distinto segun de que lado se abra: los dos hablan por
  // telefono. Se deriva de una sola lista justamente para eso.
  const delPanel = procesosDelEspacio(8).columnas
  const rotuloDelPanel = new Map(delPanel.map((c) => [c.clave, c.encabezado]))
  const posicionEnPanel = delPanel.map((c) => c.clave)

  let anterior = -1

  for (const columna of definicion.columnas) {
    assert.equal(columna.encabezado, rotuloDelPanel.get(columna.clave), columna.clave)

    const posicion = posicionEnPanel.indexOf(columna.clave)
    assert.equal(posicion > anterior, true, `${columna.clave} cambio de lugar`)
    anterior = posicion
  }
})

test('solo sobreviven los filtros que el endpoint del portal declara', () => {
  const claves = definicion.filtros.map((f) => f.clave)

  assert.deepEqual(claves, PORTAL_TAREAS.filtros.map((f) => f.clave))
  // `assignee`, `project_id`, `area` y compañia no existen para un contacto: pedirlos da 422.
  assert.equal(claves.includes('assignee'), false)
  assert.equal(claves.includes('project_id'), false)
})

test('el contacto no ejecuta ninguna accion sobre un Proceso', () => {
  // Dos acciones del equipo —arrancar y detener el cronometro— no piden capacidad, asi que
  // `capacidades={[]}` no alcanzaba para podarlas: el cliente veia un menu por fila que solo podia
  // devolver 404. La accion no existe para este sujeto, y con la lista vacia la columna desaparece.
  assert.deepEqual(definicion.acciones, [])
  assert.equal(procesosDelEspacio(8).acciones.length > 0, true, 'el panel perdio sus acciones')
})

test('no se piden campos personalizados: el contacto no los tiene', () => {
  assert.deepEqual(definicion.incluirSiempre, [])
  assert.deepEqual(definicion.includes, [])
})

test('ninguna columna ofrece ordenar por algo que el portal no ordena', () => {
  for (const columna of definicion.columnas) {
    if (columna.ordenPor === undefined) continue

    assert.equal(definicion.ordenables.includes(columna.ordenPor), true, columna.clave)
  }
})

/*
 * Las otras cuatro pestañas compartidas eligen lo suyo por el mismo camino: una funcion de la capa
 * de definiciones que mira el sujeto de la fuente. Es el UNICO lugar del front que lo mira, asi que
 * es el unico donde se puede colar una columna, un filtro o una lectura que el contacto no tiene.
 */

const FUENTE_DEL_PANEL = fuenteDelPanel(7)
const FUENTE_DEL_PORTAL = fuenteDelPortal(7)

test('la tabla de Hitos del contacto se deriva de la del equipo y pierde lo que su endpoint no atiende', () => {
  const { definicion: equipo } = definicionDeHitos(FUENTE_DEL_PANEL, 7)
  const { definicion: contacto } = definicionDeHitos(FUENTE_DEL_PORTAL, 7)

  assert.equal(equipo.ruta, 'projects/7/milestones')
  assert.equal(contacto.ruta, 'portal/projects/7/milestones')
  // Mismos encabezados y en el mismo orden: la lista del cliente y la del equipo se leen igual.
  assert.deepEqual(
    contacto.columnas.map((c) => c.encabezado),
    equipo.columnas.map((c) => c.encabezado)
  )
  // `paraContacto()` lee los mismos parametros que el listado del equipo: buscar y ordenar son
  // lecturas, y la tabla del cliente las conserva.
  assert.equal(contacto.busqueda, true)
  assert.deepEqual(contacto.ordenables, HITOS.ordenables)
  assert.deepEqual(
    contacto.columnas.map((c) => c.ordenPor),
    equipo.columnas.map((c) => c.ordenPor)
  )
  // Dos filtros no se ofrecen, y la API los rechaza igual: `hide_from_customer` vale siempre 0 para
  // el contacto, y `description` cae sobre la columna cruda —serviria para reconstruir por
  // respuestas las descripciones que el equipo decidio no compartir—.
  assert.equal(contacto.filtros.some((f) => f.clave === 'hide_from_customer'), false)
  assert.equal(contacto.filtros.some((f) => f.clave === 'description'), false)
  assert.equal(contacto.filtros.length, HITOS.filtros.length - 2)
  // La descripcion del Hito se comparte hito por hito (`description_visible_to_customer`) y llega
  // en `null` mientras nadie la comparta: la columna del cliente solo existe si alguna fila la
  // trae. En el panel el campo es del equipo y la columna va siempre.
  assert.equal(contacto.columnas.find((c) => c.clave === 'description')?.omitirSiVacia, true)
  assert.equal(equipo.columnas.find((c) => c.clave === 'description')?.omitirSiVacia, undefined)
  // El kanban ya existe para los dos. `conTablero` valia `false` para el contacto porque
  // `GET /portal/projects/{id}/milestones` no atendia `?vista=tablero`; ahora lo atiende, asi que la
  // bandera se fue: una que siempre vale lo mismo no es una decision, es ruido que hay que leer.
  assert.equal('conTablero' in definicionDeHitos(FUENTE_DEL_PORTAL, 7), false)
})

test('el kanban de Hitos del contacto pide a sus rutas y no ofrece escrituras', () => {
  // La barra del kanban ofrece los filtros del sujeto que mira. Los del contacto son 22 contra los
  // ~40 del equipo: ofrecerle los del panel seria un 422 por cada control que toque.
  const delEquipo = procesosDelEspacio(7).filtros.map((f) => f.clave)
  const delContacto = procesosDelContacto(7).filtros.map((f) => f.clave)

  assert.equal(delContacto.length < delEquipo.length, true)
  for (const prohibido of ['assignee', 'tags', 'area', 'bloqueada', 'estado_sla']) {
    assert.equal(delContacto.includes(prohibido), false, `filtro colado en el kanban: ${prohibido}`)
  }

  // Y las tres rutas que el tablero pide salen de la fuente, no escritas a mano. Sin esto el kanban
  // del cliente daba tres 403: los Hitos, el catalogo y los campos personalizados eran del equipo.
  assert.equal(FUENTE_DEL_PORTAL.hitos, 'portal/projects/7/milestones')
  assert.equal(FUENTE_DEL_PORTAL.lookups, 'portal/lookups')
  // `null` no es un dato vacio: es una rama menos. El contacto no tiene campos personalizados, asi
  // que la lista se resuelve vacia en vez de pedirlos y comerse un 403.
  assert.equal(FUENTE_DEL_PORTAL.camposDeTareas, null)
  assert.equal(FUENTE_DEL_PANEL.camposDeTareas, 'custom-fields?para=tasks')
})

test('la tabla de Tiempos del contacto solo pierde las escrituras', () => {
  const equipo = definicionDeTiempos(FUENTE_DEL_PANEL, 7)
  const contacto = definicionDeTiempos(FUENTE_DEL_PORTAL, 7)

  assert.equal(equipo.definicion.ruta, 'projects/7/timesheets')
  assert.equal(contacto.definicion.ruta, 'portal/projects/7/timesheets')

  // Esta es la premisa, escrita para que se caiga sola si deja de ser cierta.
  //
  // `tags` y `decimal` estuvieron fuera de la tabla del cliente con un comentario que decia que la
  // columna Etiquetas salia «siempre vacia» y que la Hora decimal «no llega». Dejo de ser cierto
  // —`RecursoTimesheets::paraContacto()` poda con `FormasDelPortal::TIMESHEETS`, que declara `tags`
  // y `duration_decimal`— y nadie reviso el comentario, asi que el cliente vio dos columnas menos
  // que un colaborador sobre exactamente los mismos datos.
  //
  // El invariante que reemplaza al comentario: la tabla del contacto es la del equipo MENOS las
  // escrituras. Si manana el contrato del portal deja de emitir una columna, hay que sacarla de
  // `COLUMNAS_DE_TIEMPO_DEL_CONTACTO` y esta prueba obliga a explicarlo ahi mismo.
  const ESCRITURAS = ['acciones']

  assert.deepEqual(
    contacto.columnas,
    equipo.columnas.filter((c) => !ESCRITURAS.includes(c)),
    'la tabla del cliente perdio una columna de LECTURA que el contrato del portal si emite'
  )
  for (const columna of ['tags', 'decimal']) {
    assert.equal(contacto.columnas.includes(columna), true, `el cliente perdio la columna ${columna}`)
  }
  for (const columna of ESCRITURAS) {
    assert.equal(equipo.columnas.includes(columna), true, `el equipo perdio la columna ${columna}`)
    assert.equal(contacto.columnas.includes(columna), false, `columna de escritura colada: ${columna}`)
  }

  // El filtro por persona sin su catalogo es un desplegable vacio; facturable y facturada son del equipo.
  for (const filtro of ['staff_id', 'billable', 'billed']) {
    assert.equal(contacto.definicion.filtros.some((f) => f.clave === filtro), false, `filtro colado: ${filtro}`)
  }
  assert.equal(equipo.conFiltroDePersonas, true)
  assert.equal(contacto.conFiltroDePersonas, false)
})

test('el Gantt del contacto solo agrupa por Hitos', () => {
  assert.deepEqual(lecturasDelGantt(FUENTE_DEL_PANEL).agrupaciones, ['milestones', 'members', 'status'])
  // `RecursoGantt::paraContacto()` responde 422 a cualquier otra: ofrecerlas seria mandarlo a un error.
  assert.deepEqual(lecturasDelGantt(FUENTE_DEL_PORTAL).agrupaciones, ['milestones'])
})

test('la tabla de Archivos del contacto no dibuja el interruptor de visibilidad ni el origen', () => {
  const equipo = columnasDeArchivo(false).map((c) => c.clave)
  const contacto = columnasDeArchivo(true).map((c) => c.clave)

  assert.deepEqual(equipo, ARCHIVOS.columnas.map((c) => c.clave))

  // `visible_to_customer` es el interruptor con el que el equipo decide qué esconderle, y
  // `RecursoArchivos::deEspacioParaContacto()` dejó de publicarlo. Dibujar la columna contra una
  // clave ausente no deja la celda vacía: pinta «No» en TODAS las filas, o sea le dice al cliente
  // que ninguno de los archivos que está viendo es visible para él.
  assert.equal(contacto.includes('visible_to_customer'), false)
  // `external` dice en qué nube vive el original: infraestructura del equipo, y tampoco viaja.
  assert.equal(contacto.includes('external'), false)

  // Lo que sí ve es todo lo demás, y en el mismo orden que el equipo.
  assert.deepEqual(contacto, equipo.filter((clave) => contacto.includes(clave)))
  for (const clave of ['file_name', 'filetype', 'date_added']) {
    assert.equal(contacto.includes(clave), true, `el cliente perdió la columna ${clave}`)
  }
})
