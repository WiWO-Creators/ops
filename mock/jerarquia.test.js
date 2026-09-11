/**
 * Pruebas del organigrama — `GET /jerarquia` y sus tres escrituras.
 *
 * Van contra el servidor y no contra las funciones porque lo que la pantalla programa es la forma de
 * la respuesta: el arbol plano con `area_superior_id`, la gente ya adentro de cada area, la lista de
 * quien no tiene ninguna —que es el trabajo que la pantalla existe para permitir—, el `editable` por
 * area y los dos caminos de error que hay que saber explicar, el nombre repetido y el ciclo.
 *
 * El `403` tiene prueba propia: es lo que ve quien no dirige nada, y su mensaje se muestra tal cual.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'

let base
let headers
let headersJefa
let headersSinArea

/** Entra con una cuenta del fixture y devuelve sus cabeceras con el token puesto. */
async function entrar (email) {
  const respuesta = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'mock1234' })
  })

  return {
    'content-type': 'application/json',
    authorization: `Bearer ${(await respuesta.json()).data.access_token}`
  }
}

/** Pide la jerarquia ya desempaquetada. */
async function leerJerarquia (comoQuien = headers) {
  return (await (await fetch(`${base}/jerarquia`, { headers: comoQuien })).json()).data
}

/** El area de ese nombre dentro de una jerarquia ya leida. */
function areaLlamada (jerarquia, nombre) {
  const area = jerarquia.areas.find((otra) => otra.name === nombre)

  assert.ok(area !== undefined, `no se encontró el área "${nombre}"`)

  return area
}

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`

  // Ana administra; Carla dirige Analytics y nada más; Elena no dirige nada.
  headers = await entrar('ana@wiwo.me')
  headersJefa = await entrar('carla@wiwo.me')
  headersSinArea = await entrar('elena@wiwo.me')
})

after(() => new Promise((resolver) => servidor.close(resolver)))

test('una sola lectura trae el árbol, su gente, quién no tiene área y los asignables', async () => {
  const jerarquia = await leerJerarquia()

  assert.equal(jerarquia.hay_organigrama, true)
  assert.equal(jerarquia.es_admin, true)

  const wiwo = areaLlamada(jerarquia, 'Wiwo')
  const creatividad = areaLlamada(jerarquia, 'Creatividad')
  const analytics = areaLlamada(jerarquia, 'Analytics')

  assert.equal(wiwo.area_superior_id, null)
  assert.equal(creatividad.area_superior_id, wiwo.id)
  assert.equal(analytics.area_superior_id, creatividad.id)
  assert.equal(analytics.jefe_staffid, 3)

  // La gente viene adentro del área: no hay que pedirla aparte ni contarla desde otra lista.
  assert.deepEqual(analytics.personas.map((persona) => persona.full_name).sort(), ['Carla Méndez', 'Elena Paz'])

  // Gina no tiene área; Hugo está dado de baja y por eso no aparece en ninguna de las dos listas.
  assert.deepEqual(jerarquia.sin_area.map((persona) => persona.full_name), ['Gina Ferrer'])
  assert.equal(jerarquia.asignables.some((persona) => persona.full_name === 'Hugo Márquez'), false)
  assert.equal(jerarquia.asignables.length, 7)
})

test('quien administra edita todo; quien dirige un área ve su rama y solo edita lo suyo', async () => {
  const deAdmin = await leerJerarquia()
  assert.equal(deAdmin.areas.every((area) => area.editable), true)
  assert.equal(deAdmin.areas.length, 17)

  const deCarla = await leerJerarquia(headersJefa)
  assert.equal(deCarla.es_admin, false)
  // Carla dirige Analytics, que no tiene nada colgando: su rama es esa sola área.
  assert.deepEqual(deCarla.areas.map((area) => area.name), ['Analytics'])
  assert.equal(areaLlamada(deCarla, 'Analytics').editable, true)
})

test('quien no dirige nada recibe un 403 con el mensaje que la pantalla muestra tal cual', async () => {
  const respuesta = await fetch(`${base}/jerarquia`, { headers: headersSinArea })

  assert.equal(respuesta.status, 403)

  const { error } = await respuesta.json()
  assert.equal(error.code, 'forbidden')
  assert.match(error.message, /No diriges ningún área/)
})

test('el nombre repetido, el vacío y las referencias inexistentes vuelven con 422 y su motivo', async () => {
  const casos = [
    [{ name: 'analytics' }, { name: ['duplicado'] }],
    [{ name: '   ' }, { name: ['requerido'] }],
    [{ name: 'Huérfana', area_superior_id: 99999 }, { area_superior_id: ['no_existe'] }],
    [{ name: 'Sin jefe real', jefe_staffid: 99999 }, { jefe_staffid: ['no_existe'] }],
    // Hugo está dado de baja: no puede dirigir nada.
    [{ name: 'Con un jefe de baja', jefe_staffid: 8 }, { jefe_staffid: ['no_existe'] }]
  ]

  for (const [cuerpo, detalles] of casos) {
    const respuesta = await fetch(`${base}/jerarquia/areas`, {
      method: 'POST',
      headers,
      body: JSON.stringify(cuerpo)
    })

    assert.equal(respuesta.status, 422, `deberia rechazar ${JSON.stringify(cuerpo)}`)
    assert.deepEqual((await respuesta.json()).error.details, detalles)
  }
})

test('colgar un área de su propia descendencia es un ciclo', async () => {
  const jerarquia = await leerJerarquia()
  const wiwo = areaLlamada(jerarquia, 'Wiwo')
  const analytics = areaLlamada(jerarquia, 'Analytics')

  // Analytics cuelga de Creatividad, que cuelga de Wiwo: poner a Wiwo bajo Analytics cerraria el
  // circulo, y el mismo intento sobre si misma tambien.
  for (const superior of [analytics.id, wiwo.id]) {
    const respuesta = await fetch(`${base}/jerarquia/areas/${wiwo.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ name: wiwo.name, area_superior_id: superior, jefe_staffid: wiwo.jefe_staffid })
    })

    assert.equal(respuesta.status, 422, `deberia rechazar colgarla de ${superior}`)
    assert.deepEqual((await respuesta.json()).error.details, { area_superior_id: ['ciclo'] })
  }
})

test('crear un área y colgarle otra la deja anidada', async () => {
  const raiz = (await (await fetch(`${base}/jerarquia/areas`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'Raíz de prueba' })
  })).json()).data

  assert.equal(raiz.area_superior_id, null)
  assert.equal(raiz.jefe_staffid, null)
  assert.deepEqual(raiz.personas, [])

  const alta = await fetch(`${base}/jerarquia/areas`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'Hija de prueba', area_superior_id: raiz.id, jefe_staffid: 3 })
  })

  assert.equal(alta.status, 201)

  const hija = (await alta.json()).data
  assert.equal(hija.area_superior_id, raiz.id)
  assert.equal(hija.jefe_staffid, 3)

  const editada = await fetch(`${base}/jerarquia/areas/${hija.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ name: hija.name, area_superior_id: hija.area_superior_id, jefe_staffid: null })
  })

  assert.equal(editada.status, 200)
  assert.equal((await editada.json()).data.jefe_staffid, null)
})

test('mover una persona la saca de una lista y la pone en la otra', async () => {
  const antes = await leerJerarquia()
  const analytics = areaLlamada(antes, 'Analytics')
  const contentStudio = areaLlamada(antes, 'Content Studio')

  // Elena (id 5) arranca en Analytics.
  const movida = await fetch(`${base}/jerarquia/personas/5`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ area_id: contentStudio.id })
  })

  assert.equal(movida.status, 200)

  const conElenaMovida = await leerJerarquia()
  assert.equal(areaLlamada(conElenaMovida, 'Analytics').personas.length, 1)
  assert.equal(areaLlamada(conElenaMovida, 'Content Studio').personas.length, 3)

  const soltada = await fetch(`${base}/jerarquia/personas/5`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ area_id: null })
  })

  assert.equal(soltada.status, 200)

  const suelta = await leerJerarquia()
  assert.deepEqual(suelta.sin_area.map((persona) => persona.full_name).sort(), ['Elena Paz', 'Gina Ferrer'])

  // Se la devuelve a Analytics para no dejar el fixture torcido para las pruebas que sigan.
  await fetch(`${base}/jerarquia/personas/5`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ area_id: analytics.id })
  })

  assert.equal(areaLlamada(await leerJerarquia(), 'Analytics').personas.length, 2)
})

test('un área inexistente no se le puede asignar a nadie', async () => {
  const respuesta = await fetch(`${base}/jerarquia/personas/5`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ area_id: 99999 })
  })

  assert.equal(respuesta.status, 422)
  assert.deepEqual((await respuesta.json()).error.details, { area_id: ['no_existe'] })
})

test('quien dirige un área no puede crear áreas ni tocar las ajenas', async () => {
  const alta = await fetch(`${base}/jerarquia/areas`, {
    method: 'POST',
    headers: headersJefa,
    body: JSON.stringify({ name: 'Área de nadie' })
  })

  assert.equal(alta.status, 403)

  const ajena = areaLlamada(await leerJerarquia(), 'Wiwo')
  const edicion = await fetch(`${base}/jerarquia/areas/${ajena.id}`, {
    method: 'PUT',
    headers: headersJefa,
    body: JSON.stringify({ name: ajena.name, area_superior_id: null, jefe_staffid: null })
  })

  assert.equal(edicion.status, 403)
})

test('quien dirige un área sí puede sumar gente a la suya', async () => {
  const analytics = areaLlamada(await leerJerarquia(), 'Analytics')

  // Gina no tiene área: sumarla a Analytics sale de la nada y entra a un área que Carla dirige.
  const sumada = await fetch(`${base}/jerarquia/personas/7`, {
    method: 'PUT',
    headers: headersJefa,
    body: JSON.stringify({ area_id: analytics.id })
  })

  assert.equal(sumada.status, 200)
  assert.equal(areaLlamada(await leerJerarquia(), 'Analytics').personas.length, 3)

  await fetch(`${base}/jerarquia/personas/7`, {
    method: 'PUT',
    headers: headersJefa,
    body: JSON.stringify({ area_id: null })
  })
})

test('en_tareas marca el área que no cruza con ningún Proceso', async () => {
  const jerarquia = await leerJerarquia()

  // Las 16 sembradas salen de las opciones de los Procesos: nacen alineadas.
  assert.equal(areaLlamada(jerarquia, 'Analytics').en_tareas, true)
  // «Retail» quedó desalineada: su nombre ya no figura entre esas opciones.
  assert.equal(areaLlamada(jerarquia, 'Retail').en_tareas, false)
})

test('un área recién creada nace alineada: el alta sincroniza el nombre', async () => {
  const nueva = (await (await fetch(`${base}/jerarquia/areas`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'Área recién nacida' })
  })).json()).data

  assert.equal(nueva.en_tareas, true)

  await fetch(`${base}/jerarquia/areas/${nueva.id}`, { method: 'DELETE', headers })
})

test('renombrar es 409 con su explicación; reenviar el mismo nombre no lo es', async () => {
  const analytics = areaLlamada(await leerJerarquia(), 'Analytics')

  const renombrada = await fetch(`${base}/jerarquia/areas/${analytics.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ name: 'Analítica', area_superior_id: analytics.area_superior_id, jefe_staffid: analytics.jefe_staffid })
  })

  assert.equal(renombrada.status, 409)
  assert.match((await renombrada.json()).error.message, /no se puede cambiar acá/)
  assert.equal(areaLlamada(await leerJerarquia(), 'Analytics').name, 'Analytics')

  // Mismo nombre con otra caja y espacios de sobra: no es un renombre y el PUT tiene que pasar.
  const soloMueve = await fetch(`${base}/jerarquia/areas/${analytics.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ name: '  aNaLyTiCs  ', area_superior_id: analytics.area_superior_id, jefe_staffid: null })
  })

  assert.equal(soloMueve.status, 200)
  assert.equal((await soloMueve.json()).data.jefe_staffid, null)

  await fetch(`${base}/jerarquia/areas/${analytics.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ name: 'Analytics', area_superior_id: analytics.area_superior_id, jefe_staffid: 3 })
  })
})

test('el PUT exige las tres claves presentes, aunque dos vengan en null', async () => {
  const analytics = areaLlamada(await leerJerarquia(), 'Analytics')

  // Un cuerpo parcial desenganchaba el área del árbol en silencio: ahora falta lo que falta.
  const parcial = await fetch(`${base}/jerarquia/areas/${analytics.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ jefe_staffid: 3 })
  })

  assert.equal(parcial.status, 422)
  assert.deepEqual((await parcial.json()).error.details, {
    name: ['required'],
    area_superior_id: ['required']
  })

  const completo = await fetch(`${base}/jerarquia/areas/${analytics.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ name: 'Analytics', area_superior_id: analytics.area_superior_id, jefe_staffid: 3 })
  })

  assert.equal(completo.status, 200)
})

test('borrar un área vacía devuelve el árbol entero, ya sin ella', async () => {
  const creada = (await (await fetch(`${base}/jerarquia/areas`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'Área para borrar' })
  })).json()).data

  const borrada = await fetch(`${base}/jerarquia/areas/${creada.id}`, { method: 'DELETE', headers })

  assert.equal(borrada.status, 200)

  // No es un 204: devuelve todo, porque borrar puede dejar huérfanas a las que colgaban.
  const arbol = (await borrada.json()).data
  assert.equal(Array.isArray(arbol.areas), true)
  assert.equal(arbol.areas.some((area) => area.id === creada.id), false)
  assert.equal(Array.isArray(arbol.sin_area), true)
  assert.equal(Array.isArray(arbol.asignables), true)
})

test('el 409 al borrar trae las tres cuentas, y la tercera es la que sorprende', async () => {
  const jerarquia = await leerJerarquia()

  // Analytics tiene gente y Procesos: el mensaje nombra las tres cuentas aunque una esté en cero.
  const conGente = await fetch(`${base}/jerarquia/areas/${areaLlamada(jerarquia, 'Analytics').id}`, {
    method: 'DELETE',
    headers
  })

  assert.equal(conGente.status, 409)
  assert.match((await conGente.json()).error.message,
    /El área "Analytics" está en uso: 2 persona\(s\) asignada\(s\), 0 área\(s\) que dependen de ella y 412 Proceso\(s\)/)

  // Creatividad tiene dos áreas colgando.
  const conHijas = await fetch(`${base}/jerarquia/areas/${areaLlamada(jerarquia, 'Creatividad').id}`, {
    method: 'DELETE',
    headers
  })

  assert.equal(conHijas.status, 409)
  assert.match((await conHijas.json()).error.message, /2 área\(s\) que dependen de ella/)

  // PR se ve VACÍA en la pantalla —sin gente, sin hijas— y aun así no se puede borrar.
  const pr = areaLlamada(jerarquia, 'PR')
  assert.equal(pr.personas.length, 0)

  const vaciaPeroUsada = await fetch(`${base}/jerarquia/areas/${pr.id}`, { method: 'DELETE', headers })

  assert.equal(vaciaPeroUsada.status, 409)
  assert.match((await vaciaPeroUsada.json()).error.message,
    /0 persona\(s\) asignada\(s\), 0 área\(s\) que dependen de ella y 24 Proceso\(s\)/)
})

test('quien dirige un área no puede borrar ninguna', async () => {
  const analytics = areaLlamada(await leerJerarquia(), 'Analytics')
  const respuesta = await fetch(`${base}/jerarquia/areas/${analytics.id}`, {
    method: 'DELETE',
    headers: headersJefa
  })

  assert.equal(respuesta.status, 403)
})

test('lookups sirve las áreas del mismo catálogo que administra /jerarquia', async () => {
  const lookups = (await (await fetch(`${base}/lookups`, { headers })).json()).data
  const jerarquia = await leerJerarquia()

  assert.deepEqual(lookups.areas, jerarquia.areas.map(({ id, name }) => ({ id, name })))
})
