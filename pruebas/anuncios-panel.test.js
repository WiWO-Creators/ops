/**
 * Pruebas de los anuncios de pantalla.
 *
 * Lo que se cuida acá es lo que se rompe en silencio: un borrador incoherente que sale de viaje y
 * vuelve como un 422 ilegible, un reordenado que pierde un id —y con el, un anuncio que deja de
 * salir en la pared sin que nadie lo note— y unos topes que el formulario deja pasar y el servidor
 * no.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FORMATOS, IMAGEN_BYTES_MAXIMO, ORDEN_MAXIMO, ORDEN_MINIMO, TEXTO_MAXIMO, TITULO_MAXIMO,
  acotarOrden, aplicarTipo, borradorDesde, camposMultipart, cuerpoDeAnuncio, enOrden, errorDeVigencia,
  erroresDelBorrador, esFechaValida, fechaONula, idsEnOrden, moverAnuncio, pesoLegible,
  problemaDeLaImagen, renumerar, rutaDeAnuncios, sinErrores, claveDeAlcance
} from '../src/dominio/anuncios-panel.ts'

/** Un borrador que la API aceptaria, para ir rompiendolo campo a campo. */
function bueno (cambios = {}) {
  return {
    tipo: 'imagen_con_texto',
    titulo: 'Cierre de mes',
    texto: 'El viernes cerramos a las 15:00.',
    vigenteDesde: '2026-09-01',
    vigenteHasta: '2026-09-30',
    orden: 0,
    ...cambios
  }
}

/** Una fila como la devuelve la API. */
function fila (id, orden, cambios = {}) {
  return {
    id,
    area_id: 4,
    tipo: 'texto',
    titulo: `Aviso ${id}`,
    texto: null,
    orden,
    vigente_desde: null,
    vigente_hasta: null,
    vigente_hoy: true,
    image_url: null,
    image_name: null,
    image_bytes: 0,
    created_at: '2026-09-01T10:00:00Z',
    ...cambios
  }
}

// === COHERENCIA TIPO ↔ IMAGEN ↔ TEXTO ===

test('un borrador completo y coherente no tiene nada que corregir', () => {
  assert.ok(sinErrores(erroresDelBorrador(bueno(), true)))
})

test('los formatos de imagen exigen imagen', () => {
  assert.ok(erroresDelBorrador(bueno({ tipo: 'imagen_con_texto' }), false).imagen !== undefined)
  assert.ok(erroresDelBorrador(bueno({ tipo: 'imagen', titulo: '', texto: '' }), false).imagen !== undefined)
})

test('el formato de solo texto NO tolera imagen', () => {
  const conImagen = erroresDelBorrador(bueno({ tipo: 'texto' }), true)
  const sinImagen = erroresDelBorrador(bueno({ tipo: 'texto' }), false)

  assert.ok(conImagen.imagen !== undefined, 'hay que mandar quitar_imagen')
  assert.ok(sinErrores(sinImagen), 'sin imagen es valido')
})

test('el formato de solo imagen no lleva titulo ni texto', () => {
  const errores = erroresDelBorrador(bueno({ tipo: 'imagen' }), true)

  assert.ok(errores.titulo !== undefined)
})

test('pasar a solo imagen borra el titulo y el texto a la vista', () => {
  const limpio = aplicarTipo(bueno(), 'imagen')

  assert.equal(limpio.titulo, '')
  assert.equal(limpio.texto, '')
  assert.equal(limpio.tipo, 'imagen')
  assert.ok(sinErrores(erroresDelBorrador(limpio, true)), 'y queda coherente al instante')
})

test('pasar entre formatos que admiten texto conserva lo escrito', () => {
  const borrador = bueno()
  const pasado = aplicarTipo(borrador, 'texto')

  assert.equal(pasado.titulo, borrador.titulo)
  assert.equal(pasado.texto, borrador.texto)
})

test('cambiar al mismo formato devuelve el MISMO borrador', () => {
  const borrador = bueno()

  assert.equal(aplicarTipo(borrador, 'imagen_con_texto'), borrador)
})

test('un anuncio de solo texto sin nada escrito no se puede guardar', () => {
  const vacio = erroresDelBorrador(bueno({ tipo: 'texto', titulo: '  ', texto: '' }), false)

  assert.ok(vacio.texto !== undefined, 'seria una pantalla en blanco en la pared')
})

test('los tres formatos declarados coinciden con los que valida la API', () => {
  assert.deepEqual(Object.keys(FORMATOS).sort(), ['imagen', 'imagen_con_texto', 'texto'])
})

// === TOPES ===

test('el titulo se corta en 191 y el texto en 1200', () => {
  const justo = bueno({ titulo: 'a'.repeat(TITULO_MAXIMO), texto: 'b'.repeat(TEXTO_MAXIMO) })
  const pasado = bueno({ titulo: 'a'.repeat(TITULO_MAXIMO + 1), texto: 'b'.repeat(TEXTO_MAXIMO + 1) })

  assert.ok(sinErrores(erroresDelBorrador(justo, true)), 'el limite exacto entra')
  assert.ok(erroresDelBorrador(pasado, true).titulo !== undefined)
  assert.ok(erroresDelBorrador(pasado, true).texto !== undefined)
})

test('el orden tiene que ser un entero dentro del rango', () => {
  assert.ok(erroresDelBorrador(bueno({ orden: -1 }), true).orden !== undefined)
  assert.ok(erroresDelBorrador(bueno({ orden: ORDEN_MAXIMO + 1 }), true).orden !== undefined)
  assert.ok(erroresDelBorrador(bueno({ orden: 1.5 }), true).orden !== undefined)
  assert.ok(erroresDelBorrador(bueno({ orden: Number('') }), true).orden === undefined, '0 es valido')
  assert.ok(erroresDelBorrador(bueno({ orden: Number.NaN }), true).orden !== undefined)
})

test('acotarOrden deja el numero dentro del rango y nunca NaN', () => {
  assert.equal(acotarOrden(-5), ORDEN_MINIMO)
  assert.equal(acotarOrden(99999), ORDEN_MAXIMO)
  assert.equal(acotarOrden(3.6), 4)
  assert.equal(acotarOrden(Number('abc')), ORDEN_MINIMO)
})

test('la imagen se rechaza por tipo y por tamaño antes de subirla', () => {
  assert.equal(problemaDeLaImagen({ type: 'image/png', size: 1024 }), null)
  assert.equal(problemaDeLaImagen({ type: 'image/webp', size: IMAGEN_BYTES_MAXIMO }), null, 'el limite exacto entra')
  assert.ok(problemaDeLaImagen({ type: 'image/heic', size: 1024 }) !== null, 'un mime que la API no acepta')
  assert.ok(problemaDeLaImagen({ type: 'application/pdf', size: 1024 }) !== null)
  assert.ok(problemaDeLaImagen({ type: 'image/png', size: IMAGEN_BYTES_MAXIMO + 1 }) !== null)
  assert.ok(problemaDeLaImagen({ type: 'image/png', size: 0 }) !== null, 'un archivo vacio')
})

test('el peso se lee en KB o en MB, nunca en bytes sueltos', () => {
  assert.equal(pesoLegible(0), '0 KB')
  assert.equal(pesoLegible(2048), '2 KB')
  assert.equal(pesoLegible(100), '1 KB', 'nada baja de 1 KB')
  assert.equal(pesoLegible(1468006), '1,4 MB')
})

// === FECHAS ===

test('una fecha que no existe en el calendario se rechaza', () => {
  assert.ok(esFechaValida('2026-02-28'))
  assert.ok(esFechaValida('2028-02-29'), 'año bisiesto')
  assert.ok(!esFechaValida('2026-02-30'))
  assert.ok(!esFechaValida('2026-13-01'))
  assert.ok(!esFechaValida('01-09-2026'), 'no es YYYY-MM-DD')
  assert.ok(!esFechaValida('2026-9-1'), 'sin rellenar con ceros, tampoco')
  assert.ok(!esFechaValida(''))
})

test('el termino no puede ser anterior al inicio', () => {
  assert.equal(errorDeVigencia('2026-09-01', '2026-09-30'), null)
  assert.equal(errorDeVigencia('2026-09-01', '2026-09-01'), null, 'un solo dia es valido')
  assert.ok(errorDeVigencia('2026-09-30', '2026-09-01') !== null)
})

test('las dos fechas son opcionales por separado', () => {
  assert.equal(errorDeVigencia('', ''), null, 'siempre visible')
  assert.equal(errorDeVigencia('2026-09-01', ''), null, 'sin limite por arriba')
  assert.equal(errorDeVigencia('', '2026-09-30'), null, 'sin limite por abajo')
})

test('una fecha a medio escribir es un error, no un nulo silencioso', () => {
  assert.ok(errorDeVigencia('2026-0', '') !== null)
  assert.ok(erroresDelBorrador(bueno({ vigenteDesde: '2026-0' }), true).vigencia !== undefined)
})

test('fechaONula recorta y convierte el vacio en nulo', () => {
  assert.equal(fechaONula('  2026-09-01 '), '2026-09-01')
  assert.equal(fechaONula('   '), null)
})

// === ORDEN ===

test('enOrden ordena por orden y desempata por id', () => {
  const desordenados = [fila(7, 2), fila(3, 0), fila(9, 1), fila(1, 1)]

  assert.deepEqual(idsEnOrden(enOrden(desordenados)), [3, 1, 9, 7])
})

test('enOrden no toca la lista original', () => {
  const original = [fila(7, 2), fila(3, 0)]

  enOrden(original)

  assert.deepEqual(idsEnOrden(original), [7, 3])
})

test('mover cambia el orden sin perder ni duplicar nada', () => {
  const lista = [fila(1, 0), fila(2, 1), fila(3, 2)]
  const movida = moverAnuncio(lista, 3, -1)

  assert.deepEqual(idsEnOrden(movida), [1, 3, 2])
  assert.equal(movida.length, lista.length, 'ni se pierde ni se duplica')
  assert.deepEqual([...new Set(idsEnOrden(movida))].length, 3)
})

test('en los extremos, mover no hace nada', () => {
  const lista = [fila(1, 0), fila(2, 1), fila(3, 2)]

  assert.equal(moverAnuncio(lista, 1, -1), lista, 'el primero no sube')
  assert.equal(moverAnuncio(lista, 3, 1), lista, 'el ultimo no baja')
  assert.equal(moverAnuncio(lista, 404, 1), lista, 'uno que no esta, tampoco')
})

test('mover y devolver deja la lista como estaba', () => {
  const lista = [fila(1, 0), fila(2, 1), fila(3, 2)]
  const vuelta = moverAnuncio(moverAnuncio(lista, 2, 1), 2, -1)

  assert.deepEqual(idsEnOrden(vuelta), idsEnOrden(lista))
})

test('el cuerpo del reordenado es la lista COMPLETA del alcance', () => {
  const lista = [fila(5, 0), fila(6, 1), fila(7, 2)]

  assert.deepEqual(idsEnOrden(moverAnuncio(lista, 7, -1)), [5, 7, 6])
})

test('renumerar pone el orden de acuerdo con la posicion', () => {
  const lista = [fila(1, 4), fila(2, 9), fila(3, 0)]

  assert.deepEqual(renumerar(lista).map((anuncio) => anuncio.orden), [0, 1, 2])
})

test('renumerar conserva las filas que ya estaban bien', () => {
  const lista = [fila(1, 0), fila(2, 1)]
  const renumerada = renumerar(lista)

  assert.equal(renumerada[0], lista[0], 'no se copia lo que no cambia')
  assert.equal(renumerada[1], lista[1])
})

// === CUERPO PARA LA API ===

test('el borrador de una fila existente se carga tal cual', () => {
  const borrador = borradorDesde(fila(1, 3, { tipo: 'imagen_con_texto', texto: 'hola', vigente_desde: '2026-09-01' }))

  assert.equal(borrador.tipo, 'imagen_con_texto')
  assert.equal(borrador.titulo, 'Aviso 1')
  assert.equal(borrador.texto, 'hola')
  assert.equal(borrador.vigenteDesde, '2026-09-01')
  assert.equal(borrador.vigenteHasta, '', 'un nulo se edita como vacio')
  assert.equal(borrador.orden, 3)
})

test('un borrador nuevo entra al final de la lista', () => {
  const nuevo = borradorDesde(null, 4)

  assert.equal(nuevo.orden, 4)
  assert.equal(nuevo.tipo, 'imagen_con_texto')
  assert.equal(nuevo.titulo, '')
})

test('el cuerpo manda nulos donde la API espera nulos', () => {
  const cuerpo = cuerpoDeAnuncio(bueno({ vigenteHasta: '' }))

  assert.equal(cuerpo.vigente_hasta, null)
  assert.equal(cuerpo.vigente_desde, '2026-09-01')
  assert.equal(cuerpo.quitar_imagen, undefined, 'sin pedirlo, no viaja')
})

test('en un formato sin texto, titulo y texto viajan nulos aunque el borrador traiga algo', () => {
  const cuerpo = cuerpoDeAnuncio({ ...bueno(), tipo: 'imagen' })

  assert.equal(cuerpo.titulo, null)
  assert.equal(cuerpo.texto, null)
})

test('quitar_imagen viaja solo cuando se pide', () => {
  assert.equal(cuerpoDeAnuncio(bueno({ tipo: 'texto' }), true).quitar_imagen, 1)
})

test('en multipart un nulo viaja como cadena vacia', () => {
  const campos = camposMultipart(cuerpoDeAnuncio(bueno({ vigenteHasta: '' })))
  const mapa = Object.fromEntries(campos)

  assert.equal(mapa.vigente_hasta, '', 'la unica forma de decir "quitale el limite"')
  assert.equal(mapa.orden, '0', 'todo es texto en multipart')
  assert.equal(mapa.tipo, 'imagen_con_texto')
})

// === ALCANCE ===

test('cada alcance escribe en su propia ruta', () => {
  assert.equal(rutaDeAnuncios({ global: true, area_id: null }), 'accesos/pantallas/global/anuncios')
  assert.equal(rutaDeAnuncios({ global: false, area_id: 4 }), 'accesos/areas/4/pantalla/anuncios')
})

test('una fila global con area_id se escribe igual en la global', () => {
  assert.equal(rutaDeAnuncios({ global: true, area_id: 4 }), 'accesos/pantallas/global/anuncios')
  assert.equal(rutaDeAnuncios({ global: false, area_id: null }), 'accesos/pantallas/global/anuncios')
})

test('la clave del selector distingue la global de un area', () => {
  assert.equal(claveDeAlcance({ global: true, area_id: null }), 'global')
  assert.equal(claveDeAlcance({ global: false, area_id: 12 }), '12')
  assert.notEqual(claveDeAlcance({ global: true, area_id: null }), '', 'el vacio es de Radix')
})
