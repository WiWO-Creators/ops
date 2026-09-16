/** Regresión WIW-0366: el orden de tareas se aplica antes de paginar cada hito. */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'
import { ESPACIOS, HITOS, PROCESOS } from './datos.js'

let base
let headers

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`
  const respuesta = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ana@wiwo.me', password: 'mock1234' })
  })
  assert.equal(respuesta.status, 201)
  headers = { authorization: `Bearer ${(await respuesta.json()).data.access_token}` }
})

after(() => new Promise((resolver) => servidor.close(resolver)))

test('hitos pagina pendientes antes de completas y conserva orden manual al completar o reabrir', async () => {
  const proyecto = ESPACIOS[0]
  const hito = HITOS.find((fila) => fila.project_id === proyecto.id)
  const plantilla = PROCESOS.find((fila) => fila.project?.id === proyecto.id)
  const primero = Math.max(...PROCESOS.map((fila) => fila.id)) + 1
  const agregadas = [[5, 0], [1, 10], [5, 20], [2, 10]].map(([status, orden], indice) => ({
    ...plantilla,
    id: primero + indice,
    name: 'Regresión WIW-0366',
    status,
    milestone: { id: hito.id, name: hito.name },
    milestone_order: orden,
    kanban_order: 100 - indice
  }))
  PROCESOS.push(...agregadas)

  /** Obtiene la página del hito bajo prueba mediante el contrato HTTP real del mock. */
  async function pagina (numero, excluir = false, nombre = 'Regresión WIW-0366') {
    const consulta = new URLSearchParams({
      vista: 'tablero', excluir_completadas: String(excluir), page: String(numero),
      per_page: '2', sort: '-order', 'filter[name__eq]': nombre
    })
    const respuesta = await fetch(`${base}/projects/${proyecto.id}/milestones?${consulta}`, { headers })
    assert.equal(respuesta.status, 200)
    return (await respuesta.json()).data.find((grupo) => grupo.columna.id === hito.id)
  }

  try {
    const primera = await pagina(1)
    assert.deepEqual(primera.tarjetas.map((fila) => fila.id), [primero + 1, primero + 3])
    assert.equal(primera.pagination.total, 4)
    assert.equal(primera.pagination.total_pages, 2)
    assert.deepEqual((await pagina(2)).tarjetas.map((fila) => fila.id), [primero, primero + 2])
    const excluidas = await pagina(1, true)
    assert.deepEqual(excluidas.tarjetas.map((fila) => fila.id), [primero + 1, primero + 3])
    assert.equal(excluidas.pagination.total, 2)
    agregadas[1].status = 5
    assert.deepEqual((await pagina(1)).tarjetas.map((fila) => fila.id), [primero + 3, primero])
    agregadas[2].status = 1
    assert.deepEqual((await pagina(1)).tarjetas.map((fila) => fila.id), [primero + 3, primero + 2])
    const vacia = await pagina(1, false, 'Nombre inexistente WIW-0366')
    assert.deepEqual(vacia.tarjetas, [])
    assert.equal(vacia.pagination.total, 0)
  } finally {
    PROCESOS.splice(PROCESOS.indexOf(agregadas[0]), agregadas.length)
  }
})
