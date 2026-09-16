/**
 * Pruebas del editor de pantallas.
 *
 * Lo que se cuida acá es lo que se rompe en silencio al reordenar una lista: un elemento que se
 * pierde al moverlo, una configuracion que se queda sin escenas —y deja un televisor en negro sin que
 * nadie lo vea— o un boton de guardar que se habilita cuando no hay nada que guardar.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CLASES_CONFIGURABLES, ESCENAS, SEGUNDOS_MAXIMO, SEGUNDOS_MINIMO, SEGUNDOS_POR_DEFECTO, alternar,
  durar, duracionDeLaVuelta, iguales, mover, textoParaAlcance
} from '../src/dominio/pantallas-panel.ts'

/** Las siete encendidas, como nace una pantalla desde que la API las manda todas. */
function todas () {
  return CLASES_CONFIGURABLES.map((clase) => ({ clase, segundos: clase === 'portada' ? 12 : 20 }))
}

/** Cuantas escenas configurables hay. Se lee de la lista para que agregar una no rompa las pruebas. */
const CUANTAS = CLASES_CONFIGURABLES.length

/** La ultima de la lista, que es la que no se puede bajar mas. */
const ULTIMA = CLASES_CONFIGURABLES[CUANTAS - 1]

test('apagar una escena la saca de la lista y conserva el resto', () => {
  const quedan = alternar(todas(), 'cronometros')

  assert.deepEqual(
    quedan.map((e) => e.clase),
    CLASES_CONFIGURABLES.filter((clase) => clase !== 'cronometros')
  )
})

test('encender una escena la pone al final, donde el ojo la busca', () => {
  const sinPortada = alternar(todas(), 'portada')
  const vuelve = alternar(sinPortada, 'portada')

  assert.equal(vuelve[vuelve.length - 1].clase, 'portada')
  assert.equal(vuelve.length, CUANTAS)
})

test('la ultima escena encendida NO se puede apagar', () => {
  const una = [{ clase: 'procesos', segundos: 20 }]

  assert.equal(alternar(una, 'procesos'), una, 'devuelve la misma lista: no pasa nada')
})

test('mover cambia el orden sin perder ni duplicar nada', () => {
  const movida = mover(todas(), 'espacios', -1)

  assert.deepEqual(
    movida.map((e) => e.clase),
    ['portada', 'trabajando', 'cronometros', 'espacios', 'procesos', 'momento', 'anuncios']
  )
  assert.equal(movida.length, CUANTAS, 'ni se pierde ni se duplica')
})

test('en los extremos, mover no hace nada', () => {
  const escenas = todas()

  assert.equal(mover(escenas, 'portada', -1), escenas, 'la primera no sube')
  assert.equal(mover(escenas, ULTIMA, 1), escenas, 'la ultima no baja')
  assert.equal(mover(escenas, 'inventada', 1), escenas, 'una que no esta, tampoco')
})

test('mover y devolver deja la lista como estaba', () => {
  const antes = todas()
  const ida = mover(antes, 'procesos', -1)
  const vuelta = mover(ida, 'procesos', 1)

  assert.ok(iguales(antes, vuelta))
})

test('la duracion se acota al escribirla, no al guardarla', () => {
  assert.equal(durar(todas(), 'procesos', 9999).find((e) => e.clase === 'procesos').segundos, SEGUNDOS_MAXIMO)
  assert.equal(durar(todas(), 'procesos', 1).find((e) => e.clase === 'procesos').segundos, SEGUNDOS_MINIMO)
  assert.equal(durar(todas(), 'procesos', 45).find((e) => e.clase === 'procesos').segundos, 45)
})

test('un campo vacio no convierte la duracion en NaN', () => {
  const escenas = todas()

  // `Number('')` es 0 y `Number('abc')` es NaN: el segundo llegaria a la API y volveria como 422.
  assert.equal(durar(escenas, 'procesos', Number('abc')), escenas, 'no se toca la lista')
  assert.equal(durar(escenas, 'procesos', Number('')).find((e) => e.clase === 'procesos').segundos, SEGUNDOS_MINIMO)
})

test('iguales compara el orden, no solo el conjunto', () => {
  const antes = todas()
  const reordenadas = mover(antes, 'procesos', -1)

  assert.ok(iguales(antes, [...antes]), 'una copia es igual')
  assert.ok(!iguales(antes, reordenadas), 'mover una de sitio es un cambio')
  assert.ok(!iguales(antes, durar(antes, 'procesos', 45)), 'cambiar la duracion tambien')
  assert.ok(!iguales(antes, alternar(antes, 'portada')), 'y apagar una, tambien')
})

test('la vuelta entera suma lo que dura cada escena', () => {
  assert.equal(duracionDeLaVuelta(todas()), 12 + 20 * (CUANTAS - 1))
  assert.equal(duracionDeLaVuelta([]), 0)
})

// -- Las dos escenas nuevas -----------------------------------------------------------------------
//
// `momento` y `anuncios` se configuran exactamente igual que las otras cinco: se encienden, se
// ordenan y se les pone duracion desde el mismo editor. Lo que las distingue —que pueden estar
// encendidas y no mostrarse— lo decide el televisor, y aca no se replica.

test('las siete clases de la API son configurables, y ninguna sobra', () => {
  // Es la lista blanca de `Escritura\\Pantallas::ESCENAS`. Mandar una clase que no este ahi es un 422,
  // y que falte una significa que no hay forma de encenderla desde el panel.
  assert.deepEqual(
    [...CLASES_CONFIGURABLES].sort(),
    ['anuncios', 'cronometros', 'espacios', 'momento', 'portada', 'procesos', 'trabajando']
  )
})

test('momento y anuncios se encienden, se mueven y duran como cualquier otra', () => {
  const sinMomento = alternar(todas(), 'momento')

  assert.ok(!sinMomento.some((e) => e.clase === 'momento'))

  const vuelve = alternar(sinMomento, 'momento')

  assert.equal(vuelve[vuelve.length - 1].clase, 'momento', 'vuelve al final, donde el ojo la busca')
  assert.equal(vuelve[vuelve.length - 1].segundos, SEGUNDOS_POR_DEFECTO.momento)

  const subida = mover(vuelve, 'momento', -1)

  assert.equal(subida.length, CUANTAS)
  assert.equal(durar(vuelve, 'anuncios', 25).find((e) => e.clase === 'anuncios').segundos, 25)
})

test('cada escena tiene nombre y descripcion, y ninguna se quedo sin traducir', () => {
  for (const clase of CLASES_CONFIGURABLES) {
    assert.ok(ESCENAS[clase]?.nombre.length > 0, `"${clase}" no tiene nombre`)
    assert.ok(ESCENAS[clase]?.descripcion.length > 0, `"${clase}" no tiene descripcion`)
    assert.ok(SEGUNDOS_POR_DEFECTO[clase] > 0, `"${clase}" no tiene duracion por defecto`)
  }
})

test('las descripciones de las dos escenas condicionales avisan de que pueden no verse', () => {
  // Es lo unico que quien configura no puede deducir mirando el interruptor: encendida no significa
  // visible. Si no lo dijera, la primera llamada seria "prendi anuncios y no sale nada".
  assert.match(ESCENAS.momento.descripcion, /no se muestra/)
  assert.match(ESCENAS.anuncios.descripcion, /no se muestra/)
})

test('los nombres de Tarea y Proyecto salen del glosario, nunca escritos a mano', () => {
  assert.match(ESCENAS.procesos.nombre, /Tareas/)
  assert.match(ESCENAS.espacios.nombre, /Proyectos/)
})

test('la pantalla global no dice "del área" en ninguna escena', () => {
  // La global muestra las mismas siete escenas con otro alcance. Un rótulo que dijera "Tareas del
  // área" en la pantalla de toda la empresa nombraría algo que ahí no existe.
  for (const clase of CLASES_CONFIGURABLES) {
    const nombre = textoParaAlcance(ESCENAS[clase].nombre, true)
    const descripcion = textoParaAlcance(ESCENAS[clase].descripcion, true)

    assert.ok(!/\bárea\b/i.test(nombre), `"${clase}": el nombre sigue diciendo área`)
    assert.ok(!/\bárea\b/i.test(descripcion), `"${clase}": la descripcion sigue diciendo área`)
  }

  assert.match(textoParaAlcance(ESCENAS.procesos.nombre, true), /de la compañía/)
})

test('sin alcance global el texto no se toca', () => {
  for (const clase of CLASES_CONFIGURABLES) {
    assert.equal(textoParaAlcance(ESCENAS[clase].nombre, false), ESCENAS[clase].nombre)
    assert.equal(textoParaAlcance(ESCENAS[clase].descripcion, false), ESCENAS[clase].descripcion)
  }
})

test('la reescritura no toca un texto que no nombra al área', () => {
  assert.equal(textoParaAlcance('Los cronómetros corriendo.', true), 'Los cronómetros corriendo.')
  assert.equal(textoParaAlcance('', true), '')
})
