/**
 * Guardian del transporte: toda escritura al BFF pasa por `escribirEnBff`/`mutarEnBff`.
 *
 * Una escritura con `fetch` crudo no tiene limite de tiempo, no manda clave de idempotencia, no
 * distingue "no sabemos si se guardo" de un fallo y no avisa a las tablas para que se pongan al dia:
 * justo lo que, con red lenta, se vive como tareas que se pierden o se duplican. Este test falla si
 * aparece una nueva.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const RAIZ = new URL('../src/', import.meta.url).pathname

/**
 * Archivos que pueden escribir con `fetch` crudo, y por que.
 * Agregar uno aca exige una razon; lo normal es usar `escribirEnBff`.
 */
const EXCEPCIONES = new Map([
  ['componentes/datos/mutaciones.ts', 'es el propio transporte'],
  ['datos/descripcion-ia.ts', 'tiene su propio timeout y no es una escritura de datos'],
  ['datos/sse.ts', 'flujo de eventos largo'],
  ['componentes/auditoria/Latido.tsx', 'latido periodico, con timeout, que no debe invalidar tablas'],
  ['componentes/fijados/RegistrarReciente.tsx', 'telemetria de uso, con timeout'],
  ['componentes/recurrencia/LimpiezaDeCopias.tsx', 'POST de validacion sin escritura, con timeout'],
  ['componentes/recurrencia/EditorDeRegla.tsx', 'POST de vista previa sin escritura, con timeout']
])

/** Lista los archivos de codigo bajo `carpeta`. */
function archivos (carpeta) {
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre)

    if (statSync(ruta).isDirectory()) return archivos(ruta)

    return /\.(ts|tsx)$/.test(nombre) && !/\.test\./.test(nombre) ? [ruta] : []
  })
}

/** `true` si el texto tiene un `fetch` al BFF con un verbo que escribe. */
function escribeConFetchCrudo (texto) {
  const llamadas = texto.matchAll(/fetch\(\s*[`'"]\/api\/bff[\s\S]{0,400}?\)/g)

  return [...llamadas].some(([llamada]) => /method:\s*['"](POST|PATCH|PUT|DELETE)['"]/.test(llamada))
}

test('ninguna escritura al BFF usa fetch crudo fuera de las excepciones', () => {
  const infractores = archivos(RAIZ)
    .map((ruta) => relative(RAIZ, ruta))
    .filter((ruta) => !EXCEPCIONES.has(ruta))
    .filter((ruta) => escribeConFetchCrudo(readFileSync(join(RAIZ, ruta), 'utf8')))

  assert.deepEqual(infractores, [], `Usa escribirEnBff o mutarEnBff en vez de fetch crudo: ${infractores.join(', ')}`)
})

test('las excepciones siguen existiendo', () => {
  for (const ruta of EXCEPCIONES.keys()) {
    assert.ok(statSync(join(RAIZ, ruta)).isFile(), `${ruta} ya no existe: quitarlo de las excepciones`)
  }
})
