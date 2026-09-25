/**
 * Ops en el telefono: aplicacion instalable, barra inferior, tablas en tarjetas, arrastre tactil
 * del kanban y la fisica de los gestos.
 *
 * Todo lo que se prueba aca es logica pura o archivos estaticos: lo que se rompe en silencio. Un
 * `sw.js` que empieza a cachear `/api` no falla en ningun lado; deja datos de una sesion en el disco.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { bandaElastica, cierraLaHoja, curvaDeResorte, proyectar } from '../src/lib/resorte.ts'
import { repartirColumnas, ubicarCeldas } from '../src/componentes/datos/tarjetasDeTabla.ts'
import { destinoDelPuntero, esElMismoLugar, inclinacion } from '../src/componentes/datos/arrastreTactil.ts'
import { abreTeclado, pestanaActiva } from '../src/lib/navegacion-movil.ts'
import { HREFS_PRINCIPALES } from '../src/lib/navegacion.ts'
import { decidirActualizacion, diaLocal, tocaRecordarInstalar, urlDeRegistro, versionDelScript, viaDeInstalacion } from '../src/lib/pwa.ts'
import manifest from '../src/app/manifest.ts'

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')

/* ------------------------------------------------------------------------------------------- */
/* Resorte                                                                                      */
/* ------------------------------------------------------------------------------------------- */

/** Los valores numericos de una curva `linear(...)`. */
function valoresDe (curva) {
  return curva.slice('linear('.length, -1).split(',').map(Number)
}

test('el resorte critico llega a 1 sin pasarse', () => {
  const { curva, duracionMs } = curvaDeResorte(1, 0.4)
  const valores = valoresDe(curva)
  assert.equal(valores[0], 0)
  assert.equal(valores.at(-1), 1)
  assert.ok(valores.every((v) => v <= 1.0001), 'un resorte con amortiguacion 1 no rebota')
  assert.ok(valores.every((v, i) => i === 0 || v >= valores[i - 1] - 1e-4), 'y avanza siempre hacia el destino')
  assert.ok(duracionMs > 0 && duracionMs <= 1200)
})

test('el resorte subamortiguado rebota y termina en el destino', () => {
  const valores = valoresDe(curvaDeResorte(0.6, 0.4).curva)
  assert.ok(Math.max(...valores) > 1.02, 'con 0.6 tiene que pasarse del destino')
  assert.equal(valores.at(-1), 1)
})

test('el resorte acota parametros invalidos en vez de romper la animacion', () => {
  for (const [a, r] of [[NaN, 0.3], [1, Infinity], [-3, 0.3], [5, 0]]) {
    const { curva, duracionMs } = curvaDeResorte(a, r)
    assert.match(curva, /^linear\(0(, -?[\d.]+)+\)$/)
    assert.ok(Number.isFinite(duracionMs) && duracionMs > 0)
  }
})

test('la banda elastica resiste cada vez mas y conserva el signo', () => {
  assert.ok(bandaElastica(100, 400) < 100)
  assert.ok(bandaElastica(400, 400) - bandaElastica(300, 400) < bandaElastica(100, 400) - bandaElastica(0, 400))
  assert.ok(bandaElastica(-80, 400) < 0)
  assert.equal(bandaElastica(50, 0), 0)
  assert.equal(bandaElastica(NaN, 400), 0)
})

test('la proyeccion crece con la velocidad y es cero ante entradas invalidas', () => {
  assert.ok(proyectar(2) > proyectar(1))
  assert.ok(proyectar(-1) < 0)
  assert.equal(proyectar(NaN), 0)
  assert.equal(proyectar(1, 1), 0)
})

test('la hoja se cierra con un tiron corto y rapido, no con uno lento', () => {
  assert.equal(cierraLaHoja(60, 1.2, 500), true, 'lanzamiento rapido')
  assert.equal(cierraLaHoja(60, 0, 500), false, 'mismo recorrido, sin velocidad')
  assert.equal(cierraLaHoja(300, 0, 500), true, 'arrastre largo')
  assert.equal(cierraLaHoja(300, -1, 500), false, 'lanzado hacia arriba vuelve')
  assert.equal(cierraLaHoja(300, 0, 0), false)
  assert.equal(cierraLaHoja(NaN, 1, 500), false)
})

/* ------------------------------------------------------------------------------------------- */
/* Tablas en tarjetas                                                                           */
/* ------------------------------------------------------------------------------------------- */

const col = (etiqueta, angosta = false, prioridad = null) => ({ etiqueta, angosta, prioridad })

test('el titulo de la tarjeta es la primera columna ancha con encabezado', () => {
  // La forma de "Mis Tareas": el id va primero pero es angosto.
  const roles = repartirColumnas([col('ID', true), col('Nombre'), col('Estado'), col('Origen'), col('Vence')])
  assert.deepEqual(roles, ['secundaria', 'principal', 'secundaria', 'secundaria', 'secundaria'])
})

test('las columnas sin encabezado visible son controles, a cada lado del titulo', () => {
  // La forma de `TablaRecurso` con seleccion masiva y acciones.
  const roles = repartirColumnas([col(''), col('Cliente'), col('Total', true), col('')])
  assert.deepEqual(roles, ['control-inicio', 'principal', 'secundaria', 'control-fin'])
})

test('la prioridad explicita manda sobre la heuristica', () => {
  const roles = repartirColumnas([col('Nombre'), col('Correo', false, 'principal'), col('Notas', false, 'oculta')])
  assert.deepEqual(roles, ['secundaria', 'principal', 'oculta'])
})

test('con varias principales o solo columnas angostas, el reparto no se queda sin titulo', () => {
  assert.deepEqual(repartirColumnas([col('A'), col('B'), col('C')], 2), ['principal', 'principal', 'secundaria'])
  assert.deepEqual(repartirColumnas([col('ID', true), col('Monto', true)]), ['principal', 'secundaria'])
  assert.deepEqual(repartirColumnas([col('A'), col('B')], -2), ['principal', 'secundaria'], 'un cupo invalido vale 1')
  assert.deepEqual(repartirColumnas([]), [])
  assert.deepEqual(repartirColumnas([col(''), col('')]), ['control-fin', 'control-fin'])
})

test('las celdas se ubican respetando colSpan, y la fila vacia ocupa la tarjeta entera', () => {
  const roles = ['control-inicio', 'principal', 'secundaria', 'secundaria']
  assert.deepEqual(ubicarCeldas([1, 1, 2], roles).map((c) => c.rol), ['control-inicio', 'principal', 'secundaria'])
  assert.deepEqual(ubicarCeldas([4], roles), [{ rol: 'completa', columna: 0 }])
  assert.deepEqual(ubicarCeldas([0, NaN], roles).map((c) => c.columna), [0, 1], 'un colSpan invalido vale 1')
})

/* ------------------------------------------------------------------------------------------- */
/* Arrastre tactil del kanban                                                                   */
/* ------------------------------------------------------------------------------------------- */

const tablero = [
  { izquierda: 0, derecha: 280, tarjetas: [{ id: 1, centro: 100 }, { id: 2, centro: 200 }, { id: 3, centro: 300 }] },
  { izquierda: 292, derecha: 572, tarjetas: [{ id: 4, centro: 100 }] },
  { izquierda: 584, derecha: 864, tarjetas: [] }
]

test('cae antes de la primera tarjeta cuyo centro queda debajo del dedo', () => {
  assert.deepEqual(destinoDelPuntero(400, 50, tablero, 1), { columna: 1, posicion: 0 })
  assert.deepEqual(destinoDelPuntero(400, 150, tablero, 1), { columna: 1, posicion: 1 })
  assert.deepEqual(destinoDelPuntero(700, 500, tablero, 1), { columna: 2, posicion: 0 }, 'columna vacia')
})

test('la posicion se cuenta sin la tarjeta arrastrada, como la espera moverTarjeta', () => {
  // Bajar la 1 hasta debajo de la 2: sin ella, la columna es [2, 3] y cae en el medio.
  assert.deepEqual(destinoDelPuntero(100, 250, tablero, 1), { columna: 0, posicion: 1 })
  // Dejarla donde estaba es "el mismo lugar".
  const origen = { columna: 0, posicion: 0 }
  assert.equal(esElMismoLugar(origen, destinoDelPuntero(100, 60, tablero, 1)), true)
  assert.equal(esElMismoLugar(origen, destinoDelPuntero(100, 250, tablero, 1)), false)
})

test('el hueco entre columnas elige la mas cercana; lejos de todas no hay destino', () => {
  assert.equal(destinoDelPuntero(284, 50, tablero, 9)?.columna, 0)
  assert.equal(destinoDelPuntero(290, 50, tablero, 9)?.columna, 1)
  assert.equal(destinoDelPuntero(1000, 50, tablero, 9), null)
  assert.equal(destinoDelPuntero(NaN, 50, tablero, 9), null)
  assert.equal(destinoDelPuntero(10, 50, [], 9), null)
})

test('la inclinacion sigue la velocidad y nunca pasa de 4 grados', () => {
  assert.ok(inclinacion(0.5) > 0 && inclinacion(-0.5) < 0)
  assert.equal(inclinacion(50), 4)
  assert.equal(inclinacion(-50), -4)
  assert.equal(inclinacion(NaN), 0)
})

/* ------------------------------------------------------------------------------------------- */
/* Barra inferior                                                                               */
/* ------------------------------------------------------------------------------------------- */

test('la pestana activa se decide por segmento, y lo demas cae en "Mas"', () => {
  const hrefs = [...HREFS_PRINCIPALES]
  assert.equal(pestanaActiva('/inicio', hrefs), 0)
  assert.equal(pestanaActiva('/proyectos/8/tareas?vista=tablero', hrefs), 3)
  assert.equal(pestanaActiva('/proyectos-viejos', hrefs), hrefs.length)
  assert.equal(pestanaActiva('/clientes', hrefs), hrefs.length)
  assert.equal(pestanaActiva('', hrefs), hrefs.length)
  // Sin permiso de Proyectos la barra tiene tres fijas, y "Mas" pasa a ser la cuarta.
  assert.equal(pestanaActiva('/proyectos/8', ['/inicio', '/mis-tareas', '/live']), 3)
})

test('la barra se esconde solo con campos que abren el teclado', () => {
  assert.equal(abreTeclado('INPUT', null, false), true)
  assert.equal(abreTeclado('input', 'email', false), true)
  assert.equal(abreTeclado('INPUT', 'checkbox', false), false)
  assert.equal(abreTeclado('TEXTAREA', null, false), true)
  assert.equal(abreTeclado('SELECT', null, false), false)
  assert.equal(abreTeclado('BUTTON', null, false), false)
  assert.equal(abreTeclado('DIV', null, true), true, 'el editor enriquecido es contenteditable')
})

/* ------------------------------------------------------------------------------------------- */
/* Aplicacion instalable                                                                        */
/* ------------------------------------------------------------------------------------------- */

test('el service worker se registra con la version en la URL', () => {
  assert.equal(urlDeRegistro('abc123'), '/sw.js?v=abc123')
  assert.equal(urlDeRegistro('  '), '/sw.js')
  assert.equal(urlDeRegistro('a b&c'), '/sw.js?v=a%20b%26c')
  assert.equal(versionDelScript('https://ops.wiwo.me/sw.js?v=abc123'), 'abc123')
  assert.equal(versionDelScript('/sw.js'), '')
})

test('un trabajador de la misma version se activa solo; uno de otra version se ofrece', () => {
  assert.equal(decidirActualizacion('v2', 'https://ops.wiwo.me/sw.js?v=v2'), 'silenciosa')
  assert.equal(decidirActualizacion('v1', 'https://ops.wiwo.me/sw.js?v=v2'), 'avisar')
  assert.equal(decidirActualizacion('v1', 'https://ops.wiwo.me/sw.js'), 'silenciosa')
})

test('el manifiesto abre el panel en ventana propia y tiene iconos instalables', () => {
  const m = manifest()
  assert.equal(m.display, 'standalone')
  assert.equal(m.start_url, '/inicio')
  const tamanos = m.icons.map((i) => `${i.sizes}:${i.purpose}`)
  for (const esperado of ['192x192:any', '512x512:any', '512x512:maskable']) assert.ok(tamanos.includes(esperado), esperado)
  assert.deepEqual(m.shortcuts.map((s) => s.url), ['/mis-tareas', '/live'])
  assert.match(m.theme_color, /^#[0-9A-F]{6}$/i)
})

test('sw.js nunca intercepta /api, RSC ni navegaciones para guardarlas', () => {
  const sw = leer('../public/sw.js')
  assert.match(sw, /if \(url\.pathname\.startsWith\('\/api\/'\)\) return/)
  assert.match(sw, /headers\.has\('RSC'\)/)
  // La navegacion va a la red y solo cae a la pagina sin red: nunca se hace put de una navegacion.
  const navegar = sw.slice(sw.indexOf('async function navegar'), sw.indexOf('async function primeroCache'))
  assert.doesNotMatch(navegar, /\.put\(/)
  assert.match(sw, /importScripts\('\/sw-push\.js'\)/)
  assert.match(sw, /try \{\s*importScripts/)
  assert.match(sw, /SALTAR_ESPERA/)
  assert.doesNotMatch(sw, /self\.skipWaiting\(\)\s*\n\s*\}\)\s*\n\s*self\.addEventListener\('activate'/, 'skipWaiting no va en install')
})

test('los cortes escritos a mano en movil.css son los del tema', () => {
  const css = leer('../src/estilos/movil.css')
  const usados = new Set([...css.matchAll(/max-width:\s*([\d.]+)px/g)].map(([, px]) => Math.ceil(Number(px))))
  assert.deepEqual([...usados].sort(), [680, 760], 'sm (680) y md (760)')
})

/* ------------------------------------------------------------------------------------------- */
/* Recordatorio de instalar                                                                     */
/* ------------------------------------------------------------------------------------------- */

const UA = {
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0'
}

test('la via de instalacion sale del navegador', () => {
  assert.equal(viaDeInstalacion(UA.chrome, 0, true), 'nativo')
  assert.equal(viaDeInstalacion(UA.iphone, 5, false), 'ios')
  assert.equal(viaDeInstalacion(UA.ipad, 5, false), 'ios', 'el iPad se anuncia como Mac y lo delata el tactil')
  assert.equal(viaDeInstalacion(UA.ipad, 0, false), 'safari-mac')
  assert.equal(viaDeInstalacion(UA.firefox, 0, false), 'no-instalable')
  assert.equal(viaDeInstalacion(UA.firefoxAndroid, 5, false), 'firefox-android')
  assert.equal(viaDeInstalacion(UA.chrome, 0, false), 'no-instalable', 'Chrome sin el evento no se adivina')
  assert.equal(viaDeInstalacion('', 0, false), 'no-instalable')
})

test('el recordatorio sale una vez por dia local', () => {
  assert.equal(diaLocal(new Date(2026, 0, 5, 23, 59)), '2026-01-05')
  assert.equal(tocaRecordarInstalar(null, '2026-09-25'), true)
  assert.equal(tocaRecordarInstalar('', '2026-09-25'), true)
  assert.equal(tocaRecordarInstalar('2026-09-24', '2026-09-25'), true)
  assert.equal(tocaRecordarInstalar('2026-09-25', '2026-09-25'), false)
})
