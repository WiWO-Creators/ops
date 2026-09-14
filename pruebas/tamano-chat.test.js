/**
 * Pruebas del tamaño del panel flotante del chat.
 *
 * Lo que se verifica es todo lo que puede salir mal fuera del camino feliz: que no haya nada
 * guardado, que lo guardado sea basura, que lo guardado ya no entre en la ventana, y que el
 * almacenamiento directamente lance —el caso del modo privado—. En los cuatro el chat tiene que
 * abrirse igual: un panel que no abre porque no pudo leer una preferencia de tamaño es peor que uno
 * que abre con el tamaño equivocado.
 *
 * El arrastre no se prueba acá: eso son eventos de puntero y vive en el componente. Lo que sí vive
 * acá es la aritmética que el arrastre usa, que es donde están las decisiones.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  acotarTamanoChat,
  CLAVE_TAMANO_CHAT,
  guardarTamanoChat,
  leerTamanoChatGuardado,
  MARGEN_CHAT,
  TAMANO_CHAT_MAXIMO,
  TAMANO_CHAT_MINIMO,
  TAMANO_CHAT_POR_DEFECTO
} from '../src/dominio/tamano-chat.ts'

/** Un almacenamiento de mentira con una sola clave, para no depender de ningún navegador. */
function almacen (valorInicial = null) {
  let valor = valorInicial

  return {
    getItem: (clave) => (clave === CLAVE_TAMANO_CHAT ? valor : null),
    setItem: (clave, nuevo) => { if (clave === CLAVE_TAMANO_CHAT) valor = nuevo },
    leerCrudo: () => valor
  }
}

/** Un almacenamiento bloqueado: es lo que hace el navegador en una ventana privada. */
function almacenBloqueado () {
  return {
    getItem: () => { throw new Error('SecurityError') },
    setItem: () => { throw new Error('QuotaExceededError') }
  }
}

const ESCRITORIO = { ancho: 1920, alto: 1080 }

test('sin nada guardado se usa el tamaño por defecto', () => {
  assert.deepEqual(leerTamanoChatGuardado(almacen(), ESCRITORIO), TAMANO_CHAT_POR_DEFECTO)
  assert.deepEqual(leerTamanoChatGuardado(null, ESCRITORIO), TAMANO_CHAT_POR_DEFECTO)
})

test('el tamaño por defecto arranca más grande que el panel viejo de 384×512', () => {
  assert.ok(TAMANO_CHAT_POR_DEFECTO.ancho > 384)
  assert.ok(TAMANO_CHAT_POR_DEFECTO.alto > 512)
})

test('un tamaño guardado válido se devuelve tal cual', () => {
  const guardado = { ancho: 620, alto: 760 }

  assert.deepEqual(leerTamanoChatGuardado(almacen(JSON.stringify(guardado)), ESCRITORIO), guardado)
})

test('un valor corrupto cae al defecto en vez de aplicarse a ciegas', () => {
  const corruptos = [
    'no soy json',
    'null',
    '"480"',
    '[480, 640]',
    '{"ancho":620}',
    '{"ancho":"620","alto":"760"}',
    '{"ancho":0,"alto":0}',
    '{"ancho":-620,"alto":760}'
  ]

  for (const crudo of corruptos) {
    assert.deepEqual(
      leerTamanoChatGuardado(almacen(crudo), ESCRITORIO),
      TAMANO_CHAT_POR_DEFECTO,
      `«${crudo}» tenía que caer al defecto`
    )
  }
})

test('un valor fuera de los límites duros del panel se trata como corrupto', () => {
  const enorme = JSON.stringify({ ancho: TAMANO_CHAT_MAXIMO.ancho + 1, alto: 700 })
  const diminuto = JSON.stringify({ ancho: 500, alto: TAMANO_CHAT_MINIMO.alto - 1 })

  assert.deepEqual(leerTamanoChatGuardado(almacen(enorme), ESCRITORIO), TAMANO_CHAT_POR_DEFECTO)
  assert.deepEqual(leerTamanoChatGuardado(almacen(diminuto), ESCRITORIO), TAMANO_CHAT_POR_DEFECTO)
})

test('un tamaño guardado más grande que la ventana se recorta, no se descarta', () => {
  const guardado = JSON.stringify({ ancho: 900, alto: 1000 })
  const movil = { ancho: 400, alto: 720 }

  const leido = leerTamanoChatGuardado(almacen(guardado), movil)

  assert.equal(leido.ancho, movil.ancho - MARGEN_CHAT.horizontal)
  assert.equal(leido.alto, movil.alto - MARGEN_CHAT.vertical)
})

test('con el almacenamiento bloqueado se degrada al defecto sin lanzar', () => {
  assert.deepEqual(leerTamanoChatGuardado(almacenBloqueado(), ESCRITORIO), TAMANO_CHAT_POR_DEFECTO)
  assert.equal(guardarTamanoChat(almacenBloqueado(), { ancho: 620, alto: 760 }), false)
  assert.equal(guardarTamanoChat(null, { ancho: 620, alto: 760 }), false)
})

test('lo que se guarda es la preferencia acotada a los límites, sin recortar contra la ventana', () => {
  const caja = almacen()

  assert.equal(guardarTamanoChat(caja, { ancho: 900, alto: 1000 }), true)
  assert.deepEqual(JSON.parse(caja.leerCrudo()), { ancho: 900, alto: 1000 })

  guardarTamanoChat(caja, { ancho: TAMANO_CHAT_MAXIMO.ancho + 500, alto: 10 })
  assert.deepEqual(JSON.parse(caja.leerCrudo()), { ancho: TAMANO_CHAT_MAXIMO.ancho, alto: TAMANO_CHAT_MINIMO.alto })
})

test('lo guardado vuelve a salir entero cuando la ventana grande regresa', () => {
  const caja = almacen()
  guardarTamanoChat(caja, { ancho: 900, alto: 1000 })

  assert.deepEqual(leerTamanoChatGuardado(caja, { ancho: 400, alto: 720 }), { ancho: 368, alto: 608 })
  assert.deepEqual(leerTamanoChatGuardado(caja, { ancho: 2560, alto: 1440 }), { ancho: 900, alto: 1000 })
})

test('acotar respeta los límites fijos cuando todavía no se sabe cuánto mide la ventana', () => {
  assert.deepEqual(acotarTamanoChat({ ancho: 10, alto: 10 }, null), TAMANO_CHAT_MINIMO)
  assert.deepEqual(acotarTamanoChat({ ancho: 5000, alto: 5000 }, null), TAMANO_CHAT_MAXIMO)
  assert.deepEqual(acotarTamanoChat(TAMANO_CHAT_POR_DEFECTO, null), TAMANO_CHAT_POR_DEFECTO)
})

test('en un teléfono de 400px el panel no desborda', () => {
  const movil = { ancho: 400, alto: 720 }
  const acotado = acotarTamanoChat(TAMANO_CHAT_POR_DEFECTO, movil)

  assert.ok(acotado.ancho <= movil.ancho - MARGEN_CHAT.horizontal)
  assert.ok(acotado.alto <= movil.alto - MARGEN_CHAT.vertical)
})

test('en una ventana más angosta que el mínimo gana la ventana y no el mínimo', () => {
  const rendija = { ancho: 280, alto: 300 }
  const acotado = acotarTamanoChat(TAMANO_CHAT_POR_DEFECTO, rendija)

  assert.equal(acotado.ancho, rendija.ancho - MARGEN_CHAT.horizontal)
  assert.equal(acotado.alto, rendija.alto - MARGEN_CHAT.vertical)
  assert.ok(acotado.ancho < TAMANO_CHAT_MINIMO.ancho)
})

test('una ventana sin medidas usables se ignora en vez de romper el panel', () => {
  assert.deepEqual(acotarTamanoChat(TAMANO_CHAT_POR_DEFECTO, { ancho: 0, alto: 0 }), TAMANO_CHAT_POR_DEFECTO)
  assert.deepEqual(acotarTamanoChat(TAMANO_CHAT_POR_DEFECTO, { ancho: NaN, alto: NaN }), TAMANO_CHAT_POR_DEFECTO)
})

test('las medidas que salen son enteras: un panel de 479.6px pinta un borde borroso', () => {
  const acotado = acotarTamanoChat({ ancho: 479.6, alto: 640.4 }, ESCRITORIO)

  assert.equal(acotado.ancho, 480)
  assert.equal(acotado.alto, 640)
})
