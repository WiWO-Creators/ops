/**
 * Pruebas del borde de la capa de IA.
 *
 * `leerEventoIA()` es un trust boundary de verdad: el texto viene de la red y lo escribio un modelo.
 * Lo que se verifica no es que entienda lo bueno —eso se ve a simple vista— sino que lo malo
 * devuelva `null` en vez de lanzar. Un `TypeError` a mitad de la escritura tumba el panel entero, y
 * el payload que lo provoca no se puede reproducir a pedido.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerEventoIA } from '../src/dominio/ia.ts'

const frame = (evento, datos) => `event: ${evento}\ndata: ${typeof datos === 'string' ? datos : JSON.stringify(datos)}`

/** Una propuesta minima valida, para probar un campo a la vez sin repetir los otros seis. */
const propuesta = (campos) => leerEventoIA(frame('propuesta', {
  id: 12,
  herramienta: 'crear_tarea',
  resumen: 'Crear la tarea "Revisar el brief"',
  estado: 'pendiente',
  resultado: null,
  expira_en: '2026-09-04T12:30:00Z',
  ...campos
})).accion

test('lee un delta', () => {
  assert.deepEqual(leerEventoIA(frame('delta', { t: 'Hoy tenés ' })), { tipo: 'delta', texto: 'Hoy tenés ' })
})

test('un JSON invalido devuelve null', () => {
  assert.equal(leerEventoIA('event: delta\ndata: {"t":'), null)
  assert.equal(leerEventoIA('event: delta\ndata: no soy json'), null)
})

test('un evento desconocido devuelve null', () => {
  // Si la API agrega un evento nuevo, la version vieja del front lo ignora en vez de romperse.
  assert.equal(leerEventoIA(frame('herramienta', { nombre: 'crear_tarea' })), null)
})

test('un delta con la forma equivocada devuelve null', () => {
  // El campo se llama `t` y es texto. Ni `{"delta": 3}` ni `{"t": 3}` lo son.
  assert.equal(leerEventoIA(frame('delta', { delta: 3 })), null)
  assert.equal(leerEventoIA(frame('delta', { t: 3 })), null)
  assert.equal(leerEventoIA(frame('delta', { t: null })), null)
})

test('un data que no es objeto devuelve null', () => {
  // El contrato dice objeto JSON siempre. Un array o un numero pelado no es un payload.
  assert.equal(leerEventoIA(frame('delta', '["a"]')), null)
  assert.equal(leerEventoIA(frame('delta', '3')), null)
  assert.equal(leerEventoIA(frame('delta', 'null')), null)
})

test('un frame sin event o sin data devuelve null', () => {
  assert.equal(leerEventoIA('data: {"t":"a"}'), null)
  assert.equal(leerEventoIA('event: delta'), null)
  assert.equal(leerEventoIA(': ping'), null)
  assert.equal(leerEventoIA(''), null)
})

test('lee las citas y descarta solo las que vienen mal', () => {
  // Mismo criterio que el backend con `citas_descartadas`: una cita rota desaparece, las demas
  // sobreviven. Perder las tres porque una vino mal seria peor que no citar.
  const evento = leerEventoIA(frame('citas', {
    citas: [
      { tipo: 'tarea', id: 512, titulo: 'Corregir el informe' },
      { tipo: 'inventado', id: 9, titulo: 'x' },
      { tipo: 'hito', id: 'siete', titulo: 'x' },
      { tipo: 'espacio', id: 44, titulo: 'Colbún' }
    ]
  }))

  assert.deepEqual(evento, {
    tipo: 'citas',
    citas: [
      { tipo: 'tarea', id: 512, titulo: 'Corregir el informe' },
      { tipo: 'espacio', id: 44, titulo: 'Colbún' }
    ]
  })
})

test('un bloque de citas que no es lista devuelve null', () => {
  assert.equal(leerEventoIA(frame('citas', { citas: 'ninguna' })), null)
})

test('lee el fin con su cupo y su consumo', () => {
  const evento = leerEventoIA(frame('fin', {
    generado_en: '2026-09-04T12:00:00Z',
    regeneracion: { restantes_hoy: 1, puede_ahora: true, disponible_desde: null, motivo: null },
    uso: { entrada: 3120, salida: 480 }
  }))

  assert.deepEqual(evento, {
    tipo: 'fin',
    generado_en: '2026-09-04T12:00:00Z',
    regeneracion: { restantes_hoy: 1, puede_ahora: true, disponible_desde: null, motivo: null },
    uso: { entrada: 3120, salida: 480 }
  })
})

test('un fin con bloques rotos igual termina el stream', () => {
  // Excepcion deliberada a la estrictez: descartar el `fin` dejaria a la interfaz escribiendo para
  // siempre. Los bloques opcionales caen a `null`; el evento sobrevive.
  const evento = leerEventoIA(frame('fin', { generado_en: 7, regeneracion: { motivo: 'otro' }, uso: 'mucho' }))

  assert.deepEqual(evento, { tipo: 'fin', generado_en: null, regeneracion: null, uso: null })
})

test('lee el error del stream con su codigo', () => {
  // Una vez abierto el stream el HTTP ya es 200: el error viaja como un frame mas, y perderlo deja
  // la interfaz esperando un `fin` que no va a llegar.
  assert.deepEqual(
    leerEventoIA(frame('error', { code: 'provider_error', message: 'El proveedor no respondió.' })),
    { tipo: 'error', codigo: 'provider_error', mensaje: 'El proveedor no respondió.' }
  )

  assert.equal(leerEventoIA(frame('error', { code: 'provider_error' })), null)
})

test('varias lineas data: se concatenan antes de parsear', () => {
  // Lo manda el protocolo. Este contrato siempre usa una sola linea, pero si alguna vez llega
  // partida el JSON se rearma en vez de perderse.
  assert.deepEqual(
    leerEventoIA('event: citas\ndata: {"citas":\ndata: [{"tipo":"tarea","id":1,"titulo":"a"}]}'),
    { tipo: 'citas', citas: [{ tipo: 'tarea', id: 1, titulo: 'a' }] }
  )
})

test('lee un paso y valida su estado de orbe contra los siete que existen', () => {
  assert.deepEqual(
    leerEventoIA(frame('paso', {
      fase: 'inicio', herramienta: 'crear_tarea', etiqueta: 'Preparando una tarea nueva…', orbe: 'thinking'
    })),
    {
      tipo: 'paso',
      paso: { fase: 'inicio', herramienta: 'crear_tarea', etiqueta: 'Preparando una tarea nueva…', orbe: 'thinking' }
    }
  )

  // `orbe` termina como prop de `Orbe.tsx`, que lo usa para elegir clase CSS. Un estado inventado
  // no lanza: deja la animacion a medias, que es peor porque no se ve.
  assert.equal(leerEventoIA(frame('paso', { fase: 'inicio', herramienta: 'x', etiqueta: 'y', orbe: 'brillando' })), null)
  assert.equal(leerEventoIA(frame('paso', { fase: 'empezando', herramienta: 'x', etiqueta: 'y', orbe: 'thinking' })), null)
  assert.equal(leerEventoIA(frame('paso', { fase: 'inicio', herramienta: 'x', etiqueta: '', orbe: 'thinking' })), null)
})

test('la etiqueta de un paso se recorta antes de pintarse', () => {
  // Sale de un mapa cerrado del servidor, pero llega por la red y se pinta en una linea de altura
  // fija: diez mil caracteres deforman el panel entero.
  const evento = leerEventoIA(frame('paso', {
    fase: 'fin', herramienta: 'x', etiqueta: 'a'.repeat(5000), orbe: 'routing'
  }))

  assert.equal(evento.paso.etiqueta.length, 120)
})

test('lee una propuesta con su resumen y su detalle', () => {
  assert.deepEqual(
    leerEventoIA(frame('propuesta', {
      id: 12,
      herramienta: 'eliminar_tarea',
      resumen: 'Mandar a la papelera la tarea "Corregir el informe"',
      detalle: ['Se puede restaurar durante 30 días desde la Papelera.'],
      supuestos: ['Espacio: el que estás mirando (asumido)'],
      estado: 'pendiente',
      resultado: null,
      expira_en: '2026-09-04T12:30:00Z'
    })),
    {
      tipo: 'propuesta',
      accion: {
        id: 12,
        herramienta: 'eliminar_tarea',
        resumen: 'Mandar a la papelera la tarea "Corregir el informe"',
        detalle: ['Se puede restaurar durante 30 días desde la Papelera.'],
        supuestos: ['Espacio: el que estás mirando (asumido)'],
        estado: 'pendiente',
        resultado: null,
        expira_en: '2026-09-04T12:30:00Z'
      }
    }
  )
})

test('una propuesta sin `supuestos` trae [] y no rompe', () => {
  // Una fila guardada antes de que el campo existiera. El unico despliegue posible es backend
  // primero, pero el hilo viejo sigue en la base y se vuelve a leer en cada `GET /ia/chat`.
  const accion = propuesta({ detalle: ['Espacio: NESTLÉ'] })

  assert.deepEqual(accion.supuestos, [])
  assert.deepEqual(accion.detalle, ['Espacio: NESTLÉ'])
})

test('`supuestos` con basura adentro pierde la basura y conserva lo legible', () => {
  // Mismo filtro que `detalle`: fuera lo que no sea texto o venga vacio, y cada linea recortada.
  const accion = propuesta({
    supuestos: ['Inicio: hoy (asumido)', '', null, 42, { a: 1 }, ['x'], undefined, 'b'.repeat(900)]
  })

  assert.equal(accion.supuestos.length, 2)
  assert.equal(accion.supuestos[0], 'Inicio: hoy (asumido)')
  assert.equal(accion.supuestos[1].length, 500)
})

test('`supuestos` que no es un array se descarta sin descartar la propuesta', () => {
  // Es un campo informativo: perderlo no vale tirar el boton de Confirmar entero.
  for (const basura of ['Inicio: hoy', 42, { 0: 'x' }, null]) {
    assert.deepEqual(propuesta({ supuestos: basura }).supuestos, [], JSON.stringify(basura))
  }
})

test('un plan de 8 pasos entra entero: el tope del cliente no lo corta', () => {
  // El backend topea los pasos de un `plan` en 8, cada uno con su resumen mas su detalle. Si el
  // tope del cliente se comiera eso, la persona confirmaria una transaccion que no pudo leer.
  const lineas = Array.from({ length: 8 }, (_, i) => [
    `${i + 1}. Crear la tarea "Paso ${i + 1}"`,
    '   Espacio: NESTLÉ | AGOSTO 2026',
    '   Prioridad: Media',
    '   Responsable: Ana'
  ]).flat()

  const accion = propuesta({ herramienta: 'plan', resumen: 'Un plan de 8 pasos', detalle: lineas })

  assert.deepEqual(accion.detalle, lineas)
})

test('si el tope igual recorta, la ultima linea dice cuantas faltan', () => {
  // La red defensiva sigue existiendo por si el backend emite de mas, pero cortar en silencio es el
  // mismo bug con otra cara: se confirma lo que no se pudo leer.
  const accion = propuesta({ detalle: Array.from({ length: 60 }, (_, i) => `linea ${i + 1}`) })

  assert.equal(accion.detalle.length, 40)
  assert.equal(accion.detalle[38], 'linea 39')
  assert.equal(accion.detalle[39], '… (21 líneas más)')
})

test('una propuesta con un estado que no existe se descarta entera', () => {
  // La tarjeta es un boton que escribe en el sistema: una con datos a medias es peor que ninguna.
  const base = { id: 1, herramienta: 'crear_tarea', resumen: 'x', detalle: [], resultado: null, expira_en: null }

  assert.equal(leerEventoIA(frame('propuesta', { ...base, estado: 'casi' })), null)
  assert.equal(leerEventoIA(frame('propuesta', { ...base, estado: 'pendiente', id: '1' })), null)
  assert.equal(leerEventoIA(frame('propuesta', { ...base, estado: 'pendiente', resumen: '' })), null)
})

test('lee un navegar y deja pasar el prefill tal cual', () => {
  assert.deepEqual(
    leerEventoIA(frame('navegar', { href: '/procesos?tarea=7', etiqueta: 'la tarea Revisar el brief', prefill: null })),
    { tipo: 'navegar', href: '/procesos?tarea=7', etiqueta: 'la tarea Revisar el brief', prefill: null }
  )

  const conPrefill = leerEventoIA(frame('navegar', { href: '/procesos', etiqueta: 'el alta', prefill: { name: 'x' } }))

  assert.deepEqual(conPrefill.prefill, { name: 'x' })
})

test('un navegar que apunta fuera del panel se descarta entero', () => {
  // Lo que esta prueba protege: `router.push()` sigue sin chistar lo que le den. Un `//host` o un
  // `https://` en ese campo convertiria una respuesta de un modelo en una redireccion afuera.
  for (const href of ['https://evil.example/x', '//evil.example/x', '/\\evil.example', 'procesos', '', 'javascript:alert(1)']) {
    assert.equal(leerEventoIA(frame('navegar', { href, etiqueta: 'algo' })), null, href)
  }
})

test('un navegar sin etiqueta se descarta: la pantalla cambia sola y hay que decir a donde', () => {
  assert.equal(leerEventoIA(frame('navegar', { href: '/procesos', etiqueta: '' })), null)
  assert.equal(leerEventoIA(frame('navegar', { href: '/procesos' })), null)
})

test('un frontend viejo pinta la respuesta igual: no hace falta versionar el stream', () => {
  // Esta es la prueba de compatibilidad. `parserViejo` es `leerEventoIA()` tal como era ANTES de
  // que existieran `paso` y `propuesta`: solo conoce cuatro eventos y devuelve `null` para el
  // resto. Se comprueba que un stream nuevo, leido con el parser viejo, produce exactamente el
  // mismo texto y las mismas citas que producia antes — sin tarjeta y sin indicadores, pero sin
  // perder una sola palabra.
  const parserViejo = (crudo) => {
    const nombre = crudo.split('\n').find((l) => l.startsWith('event:'))?.slice(6).trim()

    return ['delta', 'citas', 'fin', 'error'].includes(nombre) ? leerEventoIA(crudo) : null
  }

  const stream = [
    frame('paso', { fase: 'inicio', herramienta: 'tareas_del_espacio', etiqueta: 'Revisando…', orbe: 'routing' }),
    frame('delta', { t: 'Te dejé preparada la tarea ' }),
    frame('delta', { t: '"Revisar el brief" [1].' }),
    frame('propuesta', {
      id: 3, herramienta: 'crear_tarea', resumen: 'Crear la tarea "Revisar el brief"',
      detalle: [], estado: 'pendiente', resultado: null, expira_en: '2026-09-04T12:30:00Z'
    }),
    frame('citas', { citas: [{ tipo: 'tarea', id: 9, titulo: 'Revisar el brief' }] }),
    frame('fin', { generado_en: '2026-09-04T12:00:00Z', regeneracion: null, uso: null })
  ]

  let texto = ''
  let citas = []
  let vistos = 0

  for (const crudo of stream) {
    const evento = parserViejo(crudo)

    if (evento === null) continue

    vistos++
    if (evento.tipo === 'delta') texto += evento.texto
    if (evento.tipo === 'citas') citas = evento.citas
  }

  assert.equal(texto, 'Te dejé preparada la tarea "Revisar el brief" [1].')
  assert.deepEqual(citas, [{ tipo: 'tarea', id: 9, titulo: 'Revisar el brief' }])
  assert.equal(vistos, 4, 'el parser viejo ignora los dos eventos nuevos y no ve nada mas')
})
