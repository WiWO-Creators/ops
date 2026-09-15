/**
 * Pruebas de la logica de la pantalla de area.
 *
 * Lo que se cuida aca es lo que no se ve fallar mirando la pared: un guion que queda vacio, una
 * escena que desaparece y manda la rotacion al principio, un paginado que esconde gente sin decirlo,
 * y un parametro de la URL que congela la pantalla o la convierte en un estrobo.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CLASES_DE_ESCENA, REJILLAS, TOPE_DE_PAGINAS, construirGuion, firmaDelGuion, frescuraDe,
  intervaloConBackoff, leerParametrosDePantalla, proximaEscenaViva, proximoRecargado
} from '../src/dominio/pantalla-area.ts'

/** Los parametros por defecto, sin nada en la URL. */
const PARAMETROS = leerParametrosDePantalla({})

function gente (cuantos, desde = 1) {
  return Array.from({ length: cuantos }, (_, i) => ({
    staff_id: desde + i,
    name: `Persona ${desde + i}`,
    avatar: null,
    cargo: null,
    jornada_started_at: '2026-09-15T09:00:00-03:00',
    last_seen_at: null
  }))
}

/**
 * Un paquete como el que manda la API: las cinco escenas siempre, en orden.
 *
 * `trabajando`, `cronometros`, `procesos` y `espacios` se llenan con lo que pida cada prueba.
 */
function paquete (relleno = {}) {
  const dura = (clase, porDefecto) => (relleno.segundos?.[clase] ?? porDefecto)

  return {
    area: { id: 7, name: 'Content' },
    scenes: [
      {
        kind: 'portada',
        seconds: dura('portada', 12),
        counts: {
          personas: 14,
          jornadas_abiertas: (relleno.trabajando ?? []).length,
          cronometros_corriendo: (relleno.cronometros ?? []).length,
          procesos_abiertos: (relleno.procesos ?? []).length,
          procesos_atrasados: 0,
          espacios_activos: (relleno.espacios ?? []).length
        }
      },
      { kind: 'trabajando', seconds: dura('trabajando', 20), items: relleno.trabajando ?? [] },
      { kind: 'cronometros', seconds: dura('cronometros', 20), items: relleno.cronometros ?? [] },
      { kind: 'procesos', seconds: dura('procesos', 20), items: relleno.procesos ?? [], total: (relleno.procesos ?? []).length },
      { kind: 'espacios', seconds: dura('espacios', 20), items: relleno.espacios ?? [] }
    ]
  }
}

test('un area dormida muestra la portada y no una pantalla en blanco', () => {
  const guion = construirGuion(paquete(), PARAMETROS)

  assert.equal(guion.length, 1)
  assert.equal(guion[0].clase, 'portada')
})

test('las escenas vacias salen del guion, las llenas se quedan', () => {
  const guion = construirGuion(paquete({ trabajando: gente(3) }), PARAMETROS)

  assert.deepEqual(guion.map((e) => e.id), ['portada', 'trabajando'])
})

test('el guion nunca vuelve vacio, ni con todo salteado', () => {
  const soloPortada = leerParametrosDePantalla({ saltar: CLASES_DE_ESCENA.join(',') })
  const guion = construirGuion(paquete({ trabajando: gente(3) }), soloPortada)

  assert.equal(guion.length, 1)
  assert.equal(guion[0].clase, 'portada')
})

test('sin datos no hay guion: la pantalla esta en modo espera, no dibujando vacio', () => {
  assert.deepEqual(construirGuion(null, PARAMETROS), [])
})

test('una escena que entra en una pagina conserva su id sin numero', () => {
  const guion = construirGuion(paquete({ trabajando: gente(REJILLAS.horizontal.trabajando) }), PARAMETROS)

  assert.deepEqual(guion.map((e) => e.id), ['portada', 'trabajando'])
})

test('cada pagina es una entrada propia del guion', () => {
  const guion = construirGuion(paquete({ trabajando: gente(REJILLAS.horizontal.trabajando + 1) }), PARAMETROS)

  assert.deepEqual(guion.map((e) => e.id), ['portada', 'trabajando#1', 'trabajando#2'])
  assert.equal(guion[1].items.length, REJILLAS.horizontal.trabajando)
  assert.equal(guion[2].items.length, 1)
})

test('pasado el tope de paginas se corta, y lo cortado se cuenta en vez de desaparecer', () => {
  const cuantos = REJILLAS.horizontal.trabajando * TOPE_DE_PAGINAS + 7
  const guion = construirGuion(paquete({ trabajando: gente(cuantos) }), PARAMETROS)
  const paginas = guion.filter((e) => e.clase === 'trabajando')

  assert.equal(paginas.length, TOPE_DE_PAGINAS)
  assert.equal(paginas[paginas.length - 1].ocultos, 7, 'los que no entraron se nombran en el pie')
  assert.equal(paginas[0].ocultos, 0, 'y solo en la ultima pagina')
})

test('la firma no cambia cuando cambian los datos pero no las escenas', () => {
  const antes = construirGuion(paquete({ trabajando: gente(3) }), PARAMETROS)

  // Mismo conjunto de escenas, otros nombres y otras horas: es lo que devuelve el sondeo siguiente.
  const otros = gente(3).map((persona) => ({ ...persona, jornada_started_at: '2026-09-15T11:22:33-03:00' }))
  const despues = construirGuion(paquete({ trabajando: otros }), PARAMETROS)

  assert.equal(firmaDelGuion(antes), firmaDelGuion(despues))
})

test('la firma SI cambia cuando una escena aparece o se parte en dos', () => {
  const una = firmaDelGuion(construirGuion(paquete({ trabajando: gente(3) }), PARAMETROS))
  const dos = firmaDelGuion(construirGuion(paquete({ trabajando: gente(REJILLAS.horizontal.trabajando + 1) }), PARAMETROS))
  const otra = firmaDelGuion(construirGuion(
    paquete({ trabajando: gente(3), espacios: [{ id: 1, name: 'X', deadline: null, progress: 0, procesos_abiertos: 1, procesos_atrasados: 0 }] }),
    PARAMETROS
  ))

  assert.notEqual(una, dos)
  assert.notEqual(una, otra)
})

test('cuando la escena actual muere se avanza a la siguiente, nunca al principio', () => {
  // Eran las 18:04 y habia gente trabajando; a las 18:05 cierran la ultima jornada.
  const despues = construirGuion(paquete({ cronometros: gente(2), espacios: [] }), PARAMETROS)

  assert.deepEqual(despues.map((e) => e.id), ['portada', 'cronometros'])
  assert.equal(proximaEscenaViva(despues, 'trabajando'), 1, 'cronometros viene despues de trabajando')
})

test('si la escena muerta era la ultima, se vuelve al principio', () => {
  const guion = construirGuion(paquete({ trabajando: gente(2) }), PARAMETROS)

  assert.equal(proximaEscenaViva(guion, 'espacios'), 0)
})

test('la posicion se busca por clase aunque la escena estuviera paginada', () => {
  const guion = construirGuion(paquete({ espacios: [{ id: 1, name: 'X', deadline: null, progress: 0, procesos_abiertos: 1, procesos_atrasados: 0 }] }), PARAMETROS)

  assert.equal(proximaEscenaViva(guion, 'trabajando#2'), 1, 'espacios viene despues de trabajando')
})

test('los parametros se acotan en vez de fallar', () => {
  assert.equal(leerParametrosDePantalla({ escena: '9999' }).segundosPorEscena, 120)
  assert.equal(leerParametrosDePantalla({ escena: '1' }).segundosPorEscena, 5)
  // Lo que no se entiende ya no cae a un numero: cae a `null`, que significa "respeta la
  // configuracion del area". Ver la prueba dedicada mas abajo.
  assert.equal(leerParametrosDePantalla({ refresco: '1' }).segundosDeRefresco, 15)
  assert.equal(leerParametrosDePantalla({ refresco: '99999' }).segundosDeRefresco, 300)
  assert.equal(leerParametrosDePantalla({ zoom: '99' }).zoom, 1.4)
})

test('lo que no se reconoce se ignora en silencio', () => {
  assert.deepEqual(leerParametrosDePantalla({ saltar: 'espacios,inventada' }).saltar, ['espacios'])
  assert.equal(leerParametrosDePantalla({ solo: 'inventada' }).solo, null)
  assert.equal(leerParametrosDePantalla({ tema: 'fucsia' }).tema, 'oscuro')
  assert.equal(leerParametrosDePantalla({ transicion: 'explosion' }).transicion, 'fundido')
})

test('la portada no se puede saltar: es lo que impide la pantalla en blanco', () => {
  assert.deepEqual(leerParametrosDePantalla({ saltar: 'portada' }).saltar, [])
})

test('un `solo` que no deja nada en pie devuelve la portada, no una pantalla vacia', () => {
  const soloEspacios = leerParametrosDePantalla({ solo: 'espacios' })
  const guion = construirGuion(paquete({ trabajando: gente(3) }), soloEspacios)

  assert.equal(guion.length, 1)
  assert.equal(guion[0].clase, 'portada')
})

test('un solo sondeo fallido no cambia nada en pantalla', () => {
  const intervalo = 30_000

  assert.equal(frescuraDe(intervalo, intervalo), 'fresco')
  assert.equal(frescuraDe(intervalo * 2.5, intervalo), 'fresco')
  assert.equal(frescuraDe(intervalo * 4, intervalo), 'viejo')
  assert.equal(frescuraDe(11 * 60 * 1000, intervalo), 'sin-conexion')
})

test('el backoff se duplica y tiene techo', () => {
  assert.equal(intervaloConBackoff(30_000, 0), 30_000)
  assert.equal(intervaloConBackoff(30_000, 1), 60_000)
  assert.equal(intervaloConBackoff(30_000, 2), 120_000)
  assert.equal(intervaloConBackoff(30_000, 50), 300_000)
})

test('el recargado nocturno cae de madrugada y dispersa por token', () => {
  const mediodia = new Date('2026-09-15T12:00:00').getTime()
  const uno = proximoRecargado(mediodia, 'aaaa')
  const otro = proximoRecargado(mediodia, 'zzzz')

  assert.ok(uno > mediodia, 'siempre en el futuro')
  assert.ok(new Date(uno).getHours() === 4, 'a las cuatro de la maniana')
  assert.notEqual(uno, otro, 'dos televisores no recargan en el mismo segundo')
  assert.equal(proximoRecargado(mediodia, 'aaaa'), uno, 'y cada uno siempre en el mismo momento')
})

test('la duracion de cada escena la manda la configuracion del area', () => {
  const guion = construirGuion(
    paquete({ trabajando: gente(2), segundos: { portada: 8, trabajando: 45 } }),
    PARAMETROS
  )

  assert.equal(guion[0].duracionMs, 8_000, 'la portada dura lo que diga su configuracion')
  assert.equal(guion[1].duracionMs, 45_000, 'y cada escena la suya')
})

test('un `?escena=` en la URL pisa la configuracion entera', () => {
  const forzado = leerParametrosDePantalla({ escena: '7' })
  const guion = construirGuion(
    paquete({ trabajando: gente(2), segundos: { portada: 8, trabajando: 45 } }),
    forzado
  )

  assert.equal(guion[1].duracionMs, 7_000, 'la URL manda para probar una vuelta rapida')
  // La portada sigue durando menos: es un titulo, no una lista.
  assert.ok(guion[0].duracionMs < guion[1].duracionMs, 'y la portada conserva su proporcion')
})

test('sin `?escena=` no se inventa una duracion que pise la configuracion', () => {
  assert.equal(leerParametrosDePantalla({}).segundosPorEscena, null)
  assert.equal(leerParametrosDePantalla({ escena: 'ya' }).segundosPorEscena, null)
  assert.equal(leerParametrosDePantalla({ escena: '-3' }).segundosPorEscena, null)
})

test('una escena sin duracion no se queda en cero', () => {
  const sinSegundos = {
    area: { id: 7, name: 'Content' },
    scenes: [{ kind: 'trabajando', items: gente(2) }]
  }

  const guion = construirGuion(sinSegundos, PARAMETROS)

  assert.ok(guion[0].duracionMs >= 5_000, 'una escena de cero segundos seria un parpadeo')
})

test('de pie entran mas filas y menos columnas que tumbado', () => {
  const cuantos = REJILLAS.horizontal.trabajando + 1
  const tumbado = construirGuion(paquete({ trabajando: gente(cuantos) }), PARAMETROS, 'horizontal')
  const dePie = construirGuion(paquete({ trabajando: gente(cuantos) }), PARAMETROS, 'vertical')

  assert.equal(tumbado.filter((e) => e.clase === 'trabajando').length, 2, 'tumbado no entran y se pagina')
  assert.equal(dePie.filter((e) => e.clase === 'trabajando').length, 1, 'de pie entran de una')
  assert.ok(
    REJILLAS.vertical.procesos > REJILLAS.horizontal.procesos,
    'la banda util vertical mide el doble: tiene que caber mas'
  )
})

test('cada orientacion pagina con su propia rejilla', () => {
  const cuantos = REJILLAS.vertical.procesos + 1
  const tareas = Array.from({ length: cuantos }, (_, i) => ({
    id: i + 1,
    name: `Tarea ${i + 1}`,
    status: null,
    priority: null,
    due_date: null,
    overdue: false,
    progress: { checklist_total: 0, checklist_done: 0, percent: null },
    project: null,
    assignees: []
  }))

  const dePie = construirGuion(paquete({ procesos: tareas }), PARAMETROS, 'vertical')
  const paginas = dePie.filter((e) => e.clase === 'procesos')

  assert.equal(paginas.length, 2)
  assert.equal(paginas[0].items.length, REJILLAS.vertical.procesos)
  assert.equal(paginas[1].items.length, 1)
})

test('una escena apagada en el panel simplemente no llega, y el guion la respeta', () => {
  // El backend no manda las escenas apagadas: el guion es lo que llegue, en el orden en que llegue.
  const soloDos = {
    area: { id: 7, name: 'Content' },
    scenes: [
      { kind: 'procesos', seconds: 30, items: [], total: 0 },
      { kind: 'portada', seconds: 8, counts: { personas: 3, jornadas_abiertas: 0, cronometros_corriendo: 0, procesos_abiertos: 0, procesos_atrasados: 0, espacios_activos: 0 } }
    ]
  }

  const guion = construirGuion(soloDos, PARAMETROS)

  assert.deepEqual(guion.map((e) => e.id), ['portada'], 'procesos viene vacia y sale; queda la portada')
  assert.equal(guion[0].duracionMs, 8_000, 'con su duracion configurada')
})
