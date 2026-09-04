/**
 * Quien entra a que sala de Teletrabajo.
 *
 * Es la unica barrera del modulo: LiveKit abre cualquier sala a cualquier token firmado, asi que un
 * error aca no da un 403, da una conversacion privada con alguien de mas adentro. Estas pruebas
 * cubren sobre todo lo que NO tiene que pasar.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SALAS_COMUNES,
  esNombreDeSalaValido,
  espacioDeSala,
  identidadDe,
  imagenDeMetadata,
  mosaico,
  puedeEntrar,
  salaComunPorId,
  salaDeEspacio
} from '../src/dominio/teletrabajo.ts'

test('el catalogo de salas comunes no tiene ids repetidos', () => {
  const ids = SALAS_COMUNES.map((sala) => sala.id)

  assert.equal(new Set(ids).size, ids.length)
})

test('todas las salas comunes tienen nombre de sala valido', () => {
  for (const sala of SALAS_COMUNES) {
    assert.ok(esNombreDeSalaValido(sala.id), `"${sala.id}" no es un nombre de sala valido`)
  }
})

test('el nombre de sala rechaza lo que no es minusculas, digitos y guiones', () => {
  assert.ok(esNombreDeSalaValido('general'))
  assert.ok(esNombreDeSalaValido('espacio-42'))

  assert.equal(esNombreDeSalaValido(''), false)
  assert.equal(esNombreDeSalaValido('General'), false)
  assert.equal(esNombreDeSalaValido('sala con espacios'), false)
  assert.equal(esNombreDeSalaValido('../otra'), false)
  assert.equal(esNombreDeSalaValido('sala/otra'), false)
  assert.equal(esNombreDeSalaValido('a'.repeat(65)), false)
})

test('salaDeEspacio y espacioDeSala son inversas', () => {
  assert.equal(salaDeEspacio(42), 'espacio-42')
  assert.equal(espacioDeSala('espacio-42'), 42)
})

test('salaDeEspacio rechaza ids que no son enteros positivos', () => {
  assert.equal(salaDeEspacio(0), null)
  assert.equal(salaDeEspacio(-3), null)
  assert.equal(salaDeEspacio(1.5), null)
  assert.equal(salaDeEspacio(Number.NaN), null)
})

test('espacioDeSala no acepta nombres que apuntarian dos veces a la misma sala', () => {
  // "espacio-007" y "espacio-7" volverian ambos al id 7: dos URLs, una sala, y un permiso que se
  // comprueba sobre un nombre distinto del que termina en el token.
  assert.equal(espacioDeSala('espacio-007'), null)
  assert.equal(espacioDeSala('espacio-0'), null)
  assert.equal(espacioDeSala('espacio-'), null)
  assert.equal(espacioDeSala('espacio-1a'), null)
  assert.equal(espacioDeSala('general'), null)
})

test('salaComunPorId encuentra las del catalogo y nada mas', () => {
  assert.equal(salaComunPorId('general')?.id, 'general')
  assert.equal(salaComunPorId('espacio-1'), null)
  assert.equal(salaComunPorId('inventada'), null)
})

test('cualquiera del equipo entra a una sala comun', () => {
  assert.ok(puedeEntrar('general', 183, null))
  assert.ok(puedeEntrar('cafe', 1, []))
})

test('a una sala privada solo entra quien integra el espacio', () => {
  assert.ok(puedeEntrar('espacio-7', 183, [12, 183, 44]))
  assert.equal(puedeEntrar('espacio-7', 99, [12, 183, 44]), false)
})

test('sin miembros cargados, la sala privada queda cerrada', () => {
  // Es el caso de `include=members` olvidado. Cerrado molesta; abierto es una fuga.
  assert.equal(puedeEntrar('espacio-7', 183, null), false)
  assert.equal(puedeEntrar('espacio-7', 183, []), false)
})

test('un nombre de sala invalido no entra a ningun lado', () => {
  assert.equal(puedeEntrar('../general', 183, [183]), false)
  assert.equal(puedeEntrar('', 183, [183]), false)
})

test('una sala que no es ni comun ni de espacio queda cerrada', () => {
  // Nombre valido, catalogo desconocido: sin regla que la abra, no se abre.
  assert.equal(puedeEntrar('sala-inventada', 183, [183]), false)
})

test('un staffId invalido no entra ni a las salas comunes', () => {
  assert.equal(puedeEntrar('general', 0, null), false)
  assert.equal(puedeEntrar('general', -1, null), false)
  assert.equal(puedeEntrar('general', 1.5, null), false)
  assert.equal(puedeEntrar('general', Number.NaN, null), false)
})

test('la identidad separa dos conexiones de la misma persona', () => {
  // Si coincidieran, LiveKit expulsaria la primera pestaña al abrir la segunda.
  assert.notEqual(identidadDe(183, 'a1b2c3d4'), identidadDe(183, 'e5f6a7b8'))
  assert.ok(identidadDe(183, 'a1b2c3d4').includes('183'))
})

/**
 * Comprueba que un reparto de verdad entra en el escenario.
 *
 * Es la condicion que el mosaico tiene que cumplir siempre y la que el `auto-fit` de CSS no podia
 * cumplir: con las columnas y filas elegidas, cada ficha tiene ancho y alto positivos.
 */
function entra (reparto, cantidad, ancho, alto, hueco) {
  const { columnas, filas } = reparto

  assert.ok(columnas >= 1 && filas >= 1, 'columnas y filas positivas')
  assert.ok(columnas * filas >= cantidad, `${columnas}x${filas} no alcanza para ${cantidad}`)
  assert.ok((ancho - hueco * (columnas - 1)) / columnas > 0, 'la celda tiene ancho')
  assert.ok((alto - hueco * (filas - 1)) / filas > 0, 'la celda tiene alto')

  assert.ok(reparto.anchoDeFicha > 0, 'la ficha tiene medida')
  assert.ok(reparto.anchoDeFicha <= (ancho - hueco * (columnas - 1)) / columnas + 0.001, 'la ficha entra a lo ancho')
  assert.ok(
    reparto.anchoDeFicha * 9 / 16 <= (alto - hueco * (filas - 1)) / filas + 0.001,
    'la ficha entra a lo alto'
  )
}

test('una sola persona no ocupa el escenario entero', () => {
  // El bug reportado: al prender la camara estando solo, el video se comia la pantalla. La ficha
  // es la caja 16:9 que entra, no la celda: en 1600x700 mide 700*16/9 y no 1600.
  const reparto = mosaico(1, 1600, 700, 12)

  assert.equal(reparto.columnas, 1)
  assert.equal(reparto.filas, 1)
  assert.ok(reparto.anchoDeFicha < 1600, 'la ficha no puede ocupar todo el ancho')
  assert.equal(Math.round(reparto.anchoDeFicha), Math.round(700 * 16 / 9))
})

test('dos personas van lado a lado en un escenario ancho', () => {
  // Por la cuenta pelada ganaria una sola columna —deja la ficha un 3% mas grande—, y dos personas
  // aparecerian apiladas con media pantalla vacia a los costados. La holgura lo corrige.
  const reparto = mosaico(2, 1600, 700, 12)

  assert.equal(reparto.columnas, 2)
  assert.equal(reparto.filas, 1)
})

test('en movil el mosaico se apila en vez de aplastarse', () => {
  // 390x600 es un telefono en vertical: dos columnas dejarian fichas de 189px de ancho.
  const reparto = mosaico(2, 390, 600, 12)

  assert.equal(reparto.columnas, 1)
  entra(reparto, 2, 390, 600, 12)
})

test('el reparto entra en el escenario para cualquier cantidad y forma', () => {
  const formas = [
    [1600, 700], // escritorio ancho
    [1000, 700], // con el lateral de chat abierto
    [390, 600], // telefono en vertical
    [1280, 300] // ventana muy baja
  ]

  for (const [ancho, alto] of formas) {
    for (const cantidad of [1, 2, 3, 5, 9, 12, 25, 50]) {
      entra(mosaico(cantidad, ancho, alto, 12), cantidad, ancho, alto, 12)
    }
  }
})

test('el reparto elegido no achica la ficha mas alla de la holgura', () => {
  // Se compara contra la fuerza bruta hecha aparte. La holgura permite ceder hasta un 10% de lado
  // a cambio de repartir a lo ancho; mas que eso ya seria empequeñecer a la gente por estetica.
  const [ancho, alto, hueco] = [1200, 640, 12]

  for (const cantidad of [3, 5, 7, 9, 15]) {
    const elegido = mosaico(cantidad, ancho, alto, hueco)
    const lado = (columnas) => {
      const filas = Math.ceil(cantidad / columnas)
      return Math.min(
        (ancho - hueco * (columnas - 1)) / columnas,
        ((alto - hueco * (filas - 1)) / filas) * (16 / 9)
      )
    }

    let mejor = 0
    for (let columnas = 1; columnas <= cantidad; columnas++) mejor = Math.max(mejor, lado(columnas))

    assert.ok(
      elegido.anchoDeFicha >= mejor * 0.9,
      `${cantidad} fichas: la ficha quedo mas de un 10% por debajo de la mejor posible`
    )
    assert.equal(Math.round(elegido.anchoDeFicha), Math.round(lado(elegido.columnas)))
  }
})

test('sin medida todavia, el mosaico reparte en cuadrado en vez de romperse', () => {
  // El primer render ocurre antes de que el ResizeObserver mida: 0x0 no puede tirar una division
  // por cero ni devolver cero columnas. El ancho cero avisa a quien dibuja que todavia no hay
  // medida, para que no fije un tamaño inventado.
  assert.deepEqual(mosaico(4, 0, 0, 12), { columnas: 2, filas: 2, anchoDeFicha: 0 })
  assert.deepEqual(mosaico(1, 0, 0, 12), { columnas: 1, filas: 1, anchoDeFicha: 0 })
})

test('una cantidad sin sentido no rompe el mosaico', () => {
  assert.equal(mosaico(0, 1600, 700, 12).columnas, 1)
  assert.equal(mosaico(-3, 1600, 700, 12).columnas, 1)

  // Por encima del tope del servidor se recorta: nunca devuelve un reparto imposible.
  const tope = mosaico(500, 1600, 700, 12)
  assert.ok(tope.columnas * tope.filas >= 50)
})

test('la foto del participante se lee de la metadata cuando viene bien', () => {
  assert.equal(imagenDeMetadata('{"imagen":"https://panel/uploads/ana.jpg"}'), 'https://panel/uploads/ana.jpg')
})

test('una metadata rota no tumba la ficha del participante', () => {
  // Llega por la red: puede venir vacia, de otra version del formato o de un token firmado a mano.
  // Cualquiera de esos casos tiene que dar "sin foto", nunca una excepcion en medio de la llamada.
  for (const cruda of ['', '{', 'null', '"texto"', '[]', '{"imagen":null}', '{"imagen":42}', '{"imagen":""}', '{"otra":"cosa"}']) {
    assert.equal(imagenDeMetadata(cruda), null, `deberia ser null con ${JSON.stringify(cruda)}`)
  }

  assert.equal(imagenDeMetadata(undefined), null)
})
