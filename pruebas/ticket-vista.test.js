/**
 * Pruebas del modal de ticket de un solo dibujo: la fuente, la traduccion de los dos contratos y la
 * regla de respuesta.
 *
 *  1. Las dos fuentes declaran **las mismas claves** y las del portal van por `portal/`: si no, el
 *     modal tendria que preguntar por el sujeto o el BFF mandaria la sesion equivocada.
 *  2. Las dos fichas terminan en **la misma forma**, con el mensaje de apertura primero en el hilo.
 *  3. La regla de respuesta del portal **la manda la API**; la local solo cubre un backend sin T2.
 *  4. El enlace del equipo es el mismo que arman el correo y la campana (T3).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  agregarRespuestaAlHilo,
  avisarCambioDeTicket,
  avisoSinRespuesta,
  claveDeBorrador,
  cuerpoDeRespuesta,
  enlaceDelEquipoAlTicket,
  estadoInicialAlResponder,
  estadosParaResponder,
  EVENTO_TICKETS_CAMBIADOS,
  falloDeTicket,
  guardarBorrador,
  insertarPredefinida,
  leerBorrador,
  nombreEnCatalogo,
  reglaDeRespuestaLocal,
  rutaDeAdjunto,
  rutaDeTicket,
  segundosParaReintentar,
  textoDe,
  textoDeMensaje,
  TICKET_DEL_PANEL,
  TICKET_DEL_PORTAL,
  ticketDelPanel,
  ticketDelPortal,
  tituloDelModal,
  nombreDelTicket,
  vistaDelTicket,
  vistaTrasResponder
} from '../src/dominio/ticket-vista.ts'

const fichaDelPanel = {
  id: 7,
  subject: 'No carga el logo',
  status: 1,
  priority: 3,
  department: null,
  assigned: null,
  solicitante: { tipo: 'contacto', contact: { id: 1, full_name: 'Renata Ferreyra', email: 'r@x.cl' }, client: null, name: null, email: null },
  task: { id: 500, name: 'Revisar logo', status: 2, visible_to_client: false },
  date: '2026-09-15 09:12:00',
  lastreply: null,
  message: 'Se ve borroso.',
  project_id: 1
}

const fichaDelPortal = {
  id: 7,
  subject: 'No carga el logo',
  date: '2026-09-15 09:12:00',
  last_reply: '2026-09-16 10:00:00',
  status: 2,
  priority: 3,
  project_id: 1,
  task: { progress: 40 },
  message: 'Se ve borroso.',
  replies: [{ id: 1, message: 'Lo vemos.', date: '2026-09-16 10:00:00', from: 'equipo', name: 'Ana' }],
  puede_responder: true,
  motivo_sin_respuesta: null
}

test('las dos fuentes tienen las mismas claves, todo texto o null', () => {
  // `catalogoSinNombre` tambien es texto: la fuente cruza de un Server Component al cliente.
  assert.deepEqual(Object.keys(TICKET_DEL_PANEL).sort(), Object.keys(TICKET_DEL_PORTAL).sort())

  for (const fuente of [TICKET_DEL_PANEL, TICKET_DEL_PORTAL]) {
    for (const valor of Object.values(fuente)) assert.ok(valor === null || typeof valor === 'string')
  }
})

test('las rutas del BFF del portal empiezan con portal/ y sus enlaces con /portal/', () => {
  for (const clave of ['ticket', 'responder', 'editar', 'lookups']) {
    assert.match(TICKET_DEL_PORTAL[clave], /^portal\//)
  }
  assert.equal(TICKET_DEL_PORTAL.respuestas, null)
  assert.match(TICKET_DEL_PORTAL.paginaProyecto, /^\/portal\//)
  assert.match(TICKET_DEL_PORTAL.paginaTarea, /^\/portal\//)
})

test('rutaDeTicket resuelve :id y :proyecto', () => {
  assert.equal(rutaDeTicket(TICKET_DEL_PANEL.responder, 12), 'tickets/12/respuestas')
  assert.equal(rutaDeTicket(TICKET_DEL_PANEL.paginaTarea, 500, 3), '/proyectos/3?tab=tareas&tarea=500')
})

test('la ficha del panel pone la apertura primero y resuelve autores por tipo', () => {
  const vista = ticketDelPanel(fichaDelPanel, [
    { id: 9, message: 'Hola', date: null, autor: { tipo: 'staff', id: 2, full_name: 'Ana Ruiz', email: null } },
    { id: 10, message: null, date: null, autor: { tipo: 'correo', id: null, full_name: null, email: null } }
  ])

  assert.deepEqual(vista.hilo.map((m) => [m.autor, m.lado]), [
    ['Renata Ferreyra', 'cliente'], ['Ana Ruiz', 'equipo'], ['Cliente', 'cliente']
  ])
  assert.equal(vista.hilo[2].texto, '')
  assert.deepEqual(vista.tarea, { id: 500, nombre: 'Revisar logo', progreso: null })
  assert.deepEqual(vista.respuesta, { permitida: true, motivo: null })
  assert.equal(vista.solicitante, 'Renata Ferreyra')
})

test('la ficha del panel lleva la asignacion y los adjuntos; nunca acciones del solicitante', () => {
  const vista = ticketDelPanel({ ...fichaDelPanel, assigned: { id: 2, full_name: 'Ana Ruiz', profile_image_url: null } }, [], [
    { id: 8, ticket_id: 7, reply_id: null, file_name: 'captura.png', filetype: 'image/png', date_added: null, download_path: 'files/ticket/8/download' }
  ])

  assert.deepEqual(vista.asignacion, { asignado: { id: 2, nombre: 'Ana Ruiz' } })
  assert.deepEqual(vista.hilo[0].adjuntos, [{ id: 8, nombre: 'captura.png', ruta: '/api/bff/files/ticket/8/download' }])
  assert.deepEqual(vista.acciones, { cerrar: false, reabrir: false })
  assert.equal(vista.noLeido, false)
  assert.deepEqual(ticketDelPanel(fichaDelPanel, []).asignacion, { asignado: null })
})

test('la ficha del portal respeta la tarea interna sin nombre', () => {
  const vista = ticketDelPortal(fichaDelPortal)

  assert.deepEqual(vista.tarea, { id: null, nombre: null, progreso: 40 })
  assert.equal(vista.solicitante, null)
  assert.deepEqual(vista.hilo.map((m) => m.lado), ['cliente', 'equipo'])
})

test('las dos vistas tienen las mismas claves', () => {
  assert.deepEqual(
    Object.keys(vistaDelTicket(TICKET_DEL_PANEL, fichaDelPanel, [])).sort(),
    Object.keys(vistaDelTicket(TICKET_DEL_PORTAL, fichaDelPortal, [])).sort()
  )
})

test('la regla del portal la decide la API aunque el hilo diga otra cosa', () => {
  const bloqueado = ticketDelPortal({ ...fichaDelPortal, puede_responder: false, motivo_sin_respuesta: 'cerrado' })
  assert.deepEqual(bloqueado.respuesta, { permitida: false, motivo: 'cerrado' })
})

test('sin los campos de T2 cae a la regla local', () => {
  const { puede_responder: _p, motivo_sin_respuesta: _m, ...sinRegla } = fichaDelPortal

  assert.deepEqual(ticketDelPortal({ ...sinRegla, replies: [] }).respuesta, { permitida: false, motivo: 'esperando_equipo' })
  assert.deepEqual(ticketDelPortal(sinRegla).respuesta, { permitida: true, motivo: null })
})

test('regla local: cerrado manda sobre esperando al equipo', () => {
  assert.deepEqual(reglaDeRespuestaLocal(5, false), { permitida: false, motivo: 'cerrado' })
  assert.deepEqual(reglaDeRespuestaLocal(5, true), { permitida: false, motivo: 'cerrado' })
  assert.deepEqual(reglaDeRespuestaLocal(1, false), { permitida: false, motivo: 'esperando_equipo' })
  assert.deepEqual(reglaDeRespuestaLocal(3, true), { permitida: true, motivo: null })
})

test('los avisos dicen lo que pidio el producto', () => {
  assert.equal(avisoSinRespuesta('esperando_equipo'), 'El equipo aún no responde tu ticket; podrás responder cuando lo haga.')
  assert.equal(avisoSinRespuesta('cerrado'), 'Este ticket ya se cerró.')
  assert.equal(avisoSinRespuesta('cerrado', nombreDelTicket(TICKET_DEL_PORTAL)), 'Este ticket ya se cerró.')
  assert.match(avisoSinRespuesta(null, nombreDelTicket(TICKET_DEL_PORTAL)), /este ticket\.$/)
  assert.ok(avisoSinRespuesta(null).length > 0)
})

test('el cuerpo de la respuesta omite status si no se eligio y rechaza el vacio', () => {
  assert.deepEqual(cuerpoDeRespuesta('  hola ', null), { message: 'hola' })
  assert.deepEqual(cuerpoDeRespuesta('hola', 3), { message: 'hola', status: 3 })
  assert.equal(cuerpoDeRespuesta('   ', 3), null)
})

test('el enlace del equipo abre la pestaña y el modal', () => {
  assert.equal(enlaceDelEquipoAlTicket(12, 4), '/proyectos/4?tab=tickets&ticket=12')
})

// --- Contrato v2 -------------------------------------------------------------------------------

test('textoDeMensaje sigue la regla A: saltos de bloque, sin etiquetas, entidades y recorte', () => {
  assert.equal(textoDeMensaje('<p>Hola</p><p>Mundo</p>'), 'Hola\nMundo')
  assert.equal(textoDeMensaje('uno<br />\r\ndos<br>tres<BR/>cuatro'), 'uno\ndos\ntres\ncuatro', 'el salto de nl2br no duplica el renglon')
  assert.equal(textoDeMensaje('<p>a</p>\n<p>b</p>'), 'a\nb')
  assert.equal(textoDeMensaje('<div>a</div><ul><li>x</li><li>y</li></ul>'), 'a\nx\ny')
  assert.equal(textoDeMensaje('a<br><br><br><br>b'), 'a\n\nb', 'tres o mas saltos quedan en dos')
  assert.equal(textoDeMensaje('&lt;b&gt;no es negrita&lt;/b&gt; &amp; m&aacute;s &#233; &#xE9; &nbsp;'), '<b>no es negrita</b> & más é é')
  assert.equal(textoDeMensaje('<script>alert(1)</script>ok'), 'alert(1)ok')
  assert.equal(textoDeMensaje('&desconocida; &#0;'), '&desconocida; &#0;')
  assert.equal(textoDeMensaje('  <p> </p>  '), '')
  assert.equal(textoDeMensaje(null), '')
  assert.equal(textoDeMensaje(undefined), '')
  assert.equal(textoDeMensaje(''), '')
})

test('textoDe prefiere message_texto y solo convierte si no viene', () => {
  assert.equal(textoDe('<p>html</p>', 'de la API'), 'de la API')
  assert.equal(textoDe('<p>html</p>', ''), '', 'un texto vacio de la API se respeta')
  assert.equal(textoDe('<p>html</p>', undefined), 'html')
  assert.equal(ticketDelPanel({ ...fichaDelPanel, message: '<p>Se ve</p><p>borroso</p>' }, []).hilo[0].texto, 'Se ve\nborroso')
})

test('en el portal solo es «Tú» lo que la API marca como mio', () => {
  const ficha = {
    ...fichaDelPortal,
    mio: false,
    solicitante: { nombre: 'Colega Soto' },
    replies: [
      { id: 1, message: 'a', date: null, from: 'cliente', name: 'Colega Soto', autor: { tipo: 'cliente', nombre: 'Colega Soto', mio: false } },
      { id: 2, message: 'b', date: null, from: 'cliente', name: 'Yo Misma', autor: { tipo: 'cliente', nombre: 'Yo Misma', mio: true } },
      { id: 3, message: 'c', date: null, from: 'equipo', name: 'x', autor: { tipo: 'equipo', nombre: 'Ana Ruiz', mio: false } },
      { id: 4, message: 'd', date: null, from: 'cliente', name: 'Sin Autor' }
    ]
  }

  assert.deepEqual(ticketDelPortal(ficha).hilo.map((m) => m.autor), ['Colega Soto', 'Colega Soto', 'Tú', 'Ana Ruiz', 'Sin Autor'])
  assert.equal(ticketDelPortal({ ...fichaDelPortal, mio: true }).hilo[0].autor, 'Tú')
  assert.equal(ticketDelPortal(fichaDelPortal).hilo[0].autor, 'Cliente', 'sin mio nadie es «Tú»')
})

test('la ficha del portal trae acciones, lectura y fusion; nunca asignacion', () => {
  const vista = ticketDelPortal({ ...fichaDelPortal, puede_cerrar: true, puede_reabrir: false, no_leido: true, fusionado_desde: 40 })

  assert.deepEqual(vista.acciones, { cerrar: true, reabrir: false })
  assert.equal(vista.noLeido, true)
  assert.equal(vista.fusionadoDesde, 40)
  assert.equal(vista.asignacion, null)
  assert.equal(ticketDelPortal({ ...fichaDelPortal, fusionado_desde: null }).fusionadoDesde, null)
  assert.deepEqual(ticketDelPortal(fichaDelPortal).acciones, { cerrar: false, reabrir: false }, 'sin campos, nada se ofrece')
})

test('rutaDeAdjunto solo acepta rutas de archivos de la API', () => {
  assert.equal(rutaDeAdjunto('files/ticket/9/download'), '/api/bff/files/ticket/9/download')
  assert.equal(rutaDeAdjunto('/files/ticket/9/download'), '/api/bff/files/ticket/9/download')
  for (const mala of ['../admin', 'files/../x', 'https://evil.com/files/x', 'files/a?b=c', 'tickets/9', '', null, undefined]) {
    assert.equal(rutaDeAdjunto(mala), null, String(mala))
  }
})

test('la respuesta confirmada se suma al hilo una sola vez', () => {
  const vista = ticketDelPanel(fichaDelPanel, [])
  const respuesta = { id: 9, message: 'uno<br />\r\ndos', date: '2026-09-20 10:00:00', autor: { tipo: 'staff', id: 2, full_name: 'Ana Ruiz', email: null } }
  const con = agregarRespuestaAlHilo(vista, respuesta)

  assert.equal(con.hilo.length, 2)
  assert.equal(con.hilo[1].texto, 'uno\ndos')
  assert.equal(con.ultimaRespuesta, '2026-09-20 10:00:00')
  assert.equal(agregarRespuestaAlHilo(con, respuesta), con)
})

test('vistaTrasResponder reconoce la ficha del portal, la fila del panel y lo que no sirve', () => {
  const delPanel = ticketDelPanel(fichaDelPanel, [])
  const fila = { id: 9, message: 'ok', date: null, autor: { tipo: 'staff', id: 2, full_name: 'Ana', email: null } }

  assert.equal(vistaTrasResponder(TICKET_DEL_PANEL, delPanel, fila).hilo.length, 2)
  assert.equal(vistaTrasResponder(TICKET_DEL_PANEL, delPanel, null), delPanel)
  assert.equal(vistaTrasResponder(TICKET_DEL_PANEL, delPanel, { algo: 1 }), delPanel)

  const delPortal = ticketDelPortal(fichaDelPortal)
  const nueva = { ...fichaDelPortal, replies: [...fichaDelPortal.replies, { id: 5, message: 'gracias', date: null, from: 'cliente', name: 'R', autor: { tipo: 'cliente', nombre: 'R', mio: true } }] }
  assert.deepEqual(vistaTrasResponder(TICKET_DEL_PORTAL, delPortal, nueva).hilo.map((m) => m.autor), ['Cliente', 'Ana', 'Tú'])
})

test('el selector al responder no ofrece el estado actual y propone Respondido si esta Abierto', () => {
  const estados = [{ id: 1, name: 'Abierto' }, { id: 2, name: 'En curso' }, { id: 3, name: 'Respondido' }, { id: 5, name: 'Cerrado' }]

  assert.deepEqual(estadosParaResponder(estados, 2).map((e) => e.id), [1, 3, 5])
  assert.equal(estadoInicialAlResponder(1, estadosParaResponder(estados, 1)), 3)
  assert.equal(estadoInicialAlResponder(2, estadosParaResponder(estados, 2)), null)
  assert.equal(estadoInicialAlResponder(1, []), null, 'sin catalogo no se propone nada')
})

test('un valor sin nombre en el catalogo: numero para el equipo, nada para el cliente', () => {
  const catalogo = [{ id: 1, name: 'Abierto' }, { id: 2, name: ' ' }]

  assert.equal(nombreEnCatalogo(catalogo, 1, 'Estado', 'numero'), 'Abierto')
  assert.equal(nombreEnCatalogo(catalogo, 7, 'Estado', TICKET_DEL_PANEL.catalogoSinNombre), 'Estado #7')
  assert.equal(nombreEnCatalogo(catalogo, 2, 'Prioridad', 'numero'), 'Prioridad #2')
  assert.equal(nombreEnCatalogo([], 7, 'Estado', TICKET_DEL_PORTAL.catalogoSinNombre), null)
})

test('el titulo accesible nombra numero y asunto', () => {
  assert.equal(tituloDelModal(12, 'No carga el logo'), 'Ticket #12 · No carga el logo')
  assert.equal(tituloDelModal(12, null), 'Ticket #12')
  assert.equal(tituloDelModal(12, '   '), 'Ticket #12')
  assert.equal(tituloDelModal(12, 'No carga el logo', nombreDelTicket(TICKET_DEL_PORTAL)), 'Ticket #12 · No carga el logo')
  assert.equal(nombreDelTicket(TICKET_DEL_PANEL).titulo, 'Ticket')
})

test('los rechazos se explican por codigo', () => {
  const base = { mensaje: 'Mensaje de la API.' }

  assert.match(falloDeTicket({ ...base, estado: 409, codigo: 'ticket_cerrado' }, 'responder').texto, /se cerró mientras escribías/)
  assert.match(falloDeTicket({ ...base, estado: 409, codigo: 'ticket_cerrado' }, 'cerrar').texto, /ya estaba cerrado/)
  assert.match(falloDeTicket({ ...base, estado: 409, codigo: 'ticket_abierto' }, 'reabrir').texto, /ya está abierto/)
  assert.match(falloDeTicket({ ...base, estado: 409, codigo: 'reapertura_vencida' }, 'reabrir').texto, /ticket nuevo/)
  assert.match(falloDeTicket({ ...base, estado: 409, codigo: 'ticket_sin_respuesta_del_equipo' }, 'responder').texto, /aún no responde/)

  const tope = falloDeTicket({ ...base, estado: 429, codigo: 'rate_limited', reintentarEnSegundos: 125 }, 'responder')
  assert.equal(tope.esperarSegundos, 125)
  assert.match(tope.texto, /3 minutos/)
  assert.match(falloDeTicket({ ...base, estado: 429, codigo: 'rate_limited', reintentarEnSegundos: 30 }, 'crear').texto, /tickets.*1 minuto/)
  assert.equal(falloDeTicket({ ...base, estado: 429, codigo: 'rate_limited' }, 'crear').esperarSegundos, null)

  assert.match(falloDeTicket({ ...base, estado: 422, codigo: 'validation_failed', detalles: { project_id: ['otro_cliente'] } }, 'editar').texto, /otro cliente/)
  assert.equal(falloDeTicket({ ...base, estado: 422, detalles: { subject: ['required'] } }, 'editar').texto, 'Mensaje de la API.')
  assert.deepEqual(falloDeTicket({ ...base, estado: 500 }, 'responder'), { texto: 'Mensaje de la API.', esperarSegundos: null })
})

test('segundosParaReintentar: details primero, Retry-After despues', () => {
  assert.equal(segundosParaReintentar({ reintentar_en_segundos: 90 }, '10'), 90)
  assert.equal(segundosParaReintentar({ reintentar_en_segundos: 'x' }, '10'), 10)
  assert.equal(segundosParaReintentar(undefined, '12.2'), 13)
  assert.equal(segundosParaReintentar(null, null), null)
  assert.equal(segundosParaReintentar({}, 'Wed, 21 Oct 2026 07:28:00 GMT'), null)
})

test('el borrador se guarda por sujeto y ticket, y sobrevive a un almacen que lanza', () => {
  const datos = new Map()
  const almacen = {
    getItem: (c) => datos.get(c) ?? null,
    setItem: (c, v) => { datos.set(c, v) },
    removeItem: (c) => { datos.delete(c) }
  }
  const clave = claveDeBorrador(TICKET_DEL_PORTAL, 7)

  assert.equal(clave, 'ticket-borrador:portal:7')
  assert.notEqual(claveDeBorrador(TICKET_DEL_PANEL, 7), clave)
  assert.equal(guardarBorrador(almacen, clave, 'hola'), true)
  assert.equal(leerBorrador(almacen, clave), 'hola')
  assert.equal(guardarBorrador(almacen, clave, '   '), true)
  assert.equal(datos.has(clave), false, 'vaciar la caja borra el borrador')

  const roto = { getItem: () => { throw new Error('privado') }, setItem: () => { throw new Error('cuota') }, removeItem: () => { throw new Error('x') } }
  assert.equal(leerBorrador(roto, clave), '')
  assert.equal(guardarBorrador(roto, clave, 'hola'), false)
  assert.equal(leerBorrador(null, clave), '')
  assert.equal(guardarBorrador(null, clave, 'hola'), false)
})

test('insertar una predefinida suma texto plano al final sin pisar lo escrito', () => {
  assert.equal(insertarPredefinida('', '<p>Hola</p><p>Gracias</p>'), 'Hola\nGracias')
  assert.equal(insertarPredefinida('Buenas,  \n', 'Te cuento<br />\r\nque'), 'Buenas,\n\nTe cuento\nque')
  assert.equal(insertarPredefinida('Algo', '<p> </p>'), 'Algo')
})

test('el aviso de cambio lleva el id del ticket', () => {
  const eventos = []
  avisarCambioDeTicket(12, { dispatchEvent: (e) => { eventos.push(e); return true } })

  assert.equal(EVENTO_TICKETS_CAMBIADOS, 'ops:tickets-cambiados')
  assert.equal(eventos[0].type, 'ops:tickets-cambiados')
  assert.deepEqual(eventos[0].detail, { id: 12 })
  assert.doesNotThrow(() => { avisarCambioDeTicket(12, null) })
})
