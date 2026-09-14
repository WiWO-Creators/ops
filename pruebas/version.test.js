/**
 * Pruebas del aviso de version nueva.
 *
 * Lo importante no es que devuelva un texto, sino lo que rompe si se descuida: un intervalo mal
 * escrito que convierta el chequeo en un martillo contra el servidor, y un script anti-destello con
 * un error de sintaxis — que no lanza en ningun lado, simplemente deja el telon puesto para siempre.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { ATRIBUTO_BIENVENIDA, CLAVE_BIENVENIDA, SCRIPT_BIENVENIDA_INICIAL } from '../src/lib/bienvenida.ts'

// Se fija ANTES del import: `datos/version.ts` resuelve la version una sola vez, al cargarse.
process.env.OPS_VERSION = 'sha-de-prueba'
const { versionDelServidor, intervaloDeVersion } = await import('../src/datos/version.ts')

test('OPS_VERSION manda sobre el build id', () => {
  assert.equal(versionDelServidor(), 'sha-de-prueba')
})

test('la version es siempre un texto util', () => {
  // Un vacio no romperia nada de forma visible: el navegador compararia '' contra '' y nadie se
  // enteraria nunca de que hay una version nueva.
  assert.equal(typeof versionDelServidor(), 'string')
  assert.notEqual(versionDelServidor().trim(), '')
})

test('el intervalo cae al valor por defecto cuando la variable no sirve', () => {
  for (const valor of [undefined, '', 'cinco', '0', '-30', 'NaN']) {
    if (valor === undefined) delete process.env.VERSION_INTERVALO_SEGUNDOS
    else process.env.VERSION_INTERVALO_SEGUNDOS = valor

    assert.equal(intervaloDeVersion(), 300, String(valor))
  }
})

test('el intervalo se acota en vez de fallar', () => {
  const casos = [
    ['1', 30], // por debajo del minimo: seria una peticion por segundo, por pestaña abierta
    ['30', 30],
    ['600', 600],
    ['3600', 3600],
    ['99999', 3600], // por encima del maximo el aviso llega tan tarde que da lo mismo
    ['45.6', 46] // decimal: se redondea, no se descarta
  ]

  for (const [crudo, esperado] of casos) {
    process.env.VERSION_INTERVALO_SEGUNDOS = crudo
    assert.equal(intervaloDeVersion(), esperado, crudo)
  }

  delete process.env.VERSION_INTERVALO_SEGUNDOS
})

test('el script anti-destello es JavaScript valido', () => {
  // Va inyectado crudo en el `<head>`: un error de sintaxis no lanza en ningun log, solo deja de
  // correr. Compilarlo aca es la unica forma de enterarse.
  assert.doesNotThrow(() => new Function(SCRIPT_BIENVENIDA_INICIAL))
})

test('el script usa la misma clave y el mismo atributo que el componente', () => {
  // Si se separan, el script pone un telon que nadie levanta.
  assert.ok(SCRIPT_BIENVENIDA_INICIAL.includes(CLAVE_BIENVENIDA))
  assert.ok(SCRIPT_BIENVENIDA_INICIAL.includes(ATRIBUTO_BIENVENIDA))
})

test('el script levanta el telon solo aunque React no monte', () => {
  // La red de seguridad. Sin ella, un fallo del bundle deja la pantalla en blanco sin salida.
  assert.match(SCRIPT_BIENVENIDA_INICIAL, /setTimeout\(.*removeAttribute/s)
})

/**
 * Las escenas de bienvenida no se pueden importar desde aca —son `.tsx` y el intérprete de pruebas
 * solo quita tipos, no compila JSX—, asi que se revisan como texto. Alcanza: lo que se rompe en
 * silencio no es el dibujo sino el contrato entre los cuatro, que vive en atributos literales.
 */
const carpetaEscenas = new URL('../src/componentes/estructura/bienvenida/', import.meta.url)
const archivosDeEscena = (await readdir(carpetaEscenas)).filter((nombre) => nombre.startsWith('Escena'))
const registro = await readFile(new URL('escenas.ts', carpetaEscenas), 'utf8')

test('las cuatro escenas comparten encuadre y suelo', async () => {
  // Con encuadres distintos, la que salga sorteada cambia de tamaño y la bienvenida da un salto.
  assert.equal(archivosDeEscena.length, 4)

  for (const nombre of archivosDeEscena) {
    const fuente = await readFile(new URL(nombre, carpetaEscenas), 'utf8')

    assert.ok(fuente.includes('viewBox="34 8 116 102"'), `${nombre} cambia el encuadre`)
    assert.ok(fuente.includes('y1="102"'), `${nombre} no apoya en el mismo suelo`)
    assert.ok(fuente.includes('aria-hidden="true"'), `${nombre} no es decorativa`)
  }
})

test('todas las escenas estan registradas', () => {
  // Una escena sin entrada en `ESCENAS` no se sortea nunca: queda como codigo muerto que compila.
  for (const nombre of archivosDeEscena) {
    assert.ok(registro.includes(nombre.replace('.tsx', '')), `${nombre} no esta en ESCENAS`)
  }
})
