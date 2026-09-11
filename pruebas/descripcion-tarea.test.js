/**
 * Pruebas de la descripcion obligatoria y del cuestionario que la redacta.
 *
 * Lo que se verifica son las dos reglas que, si fallan, fallan en silencio:
 *
 *   1. **Que cuenta como vacia.** El navegador y el backend tienen que decir lo mismo. Si el
 *      navegador acepta tres espacios duros y el backend los rechaza, lo que se ve es un formulario
 *      que dice que esta bien y un servidor que contesta 422: nadie sabe cual de los dos miente.
 *   2. **Como se arma el pedido al asistente.** Una respuesta en blanco que igual viaja gasta una
 *      llamada pagada; un tope que no se aplica vuelve como 422 en vez de como texto.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PREGUNTAS_DESCRIPCION,
  TOPE_DESCRIPCION,
  TOPE_RESPUESTA,
  cuerpoDeRedaccion,
  descripcionVacia,
  errorDeDescripcion
} from '../src/dominio/descripcion-tarea.ts'

/** Las claves de las tres preguntas, para no repetirlas en cada caso. */
const [QUE, PARA_QUIEN, CIERRE] = PREGUNTAS_DESCRIPCION.map((pregunta) => pregunta.clave)

test('descripcionVacia: lo que no dice nada', () => {
  assert.equal(descripcionVacia(''), true)
  assert.equal(descripcionVacia('   '), true)
  assert.equal(descripcionVacia('\n\t  \r\n'), true)
  assert.equal(descripcionVacia(null), true)
  assert.equal(descripcionVacia(undefined), true)
})

test('descripcionVacia: el espacio que trim() no ve', () => {
  // Espacio duro (U+00A0): lo pega cualquier copiado desde Word o desde el navegador.
  assert.equal(descripcionVacia('  '), true)
  // Ancho cero (U+200B) y juntador de palabras (U+2060): invisibles hasta en el textarea.
  assert.equal(descripcionVacia('​'), true)
  assert.equal(descripcionVacia('⁠‍'), true)
  assert.equal(descripcionVacia('  \n​ '), true)
})

test('descripcionVacia: lo que si dice algo', () => {
  assert.equal(descripcionVacia('Armar la grilla'), false)
  assert.equal(descripcionVacia('   x   '), false)
  // Un solo caracter que no es espacio alcanza: el juicio de si dice poco es de la persona.
  assert.equal(descripcionVacia('.'), false)
})

test('errorDeDescripcion: pide texto y nombra la cosa como la nombra el glosario', () => {
  const mensaje = errorDeDescripcion('   ')
  assert.ok(mensaje !== null)
  assert.match(mensaje, /^La tarea necesita una descripción/)

  assert.match(errorDeDescripcion(' ', 'El proceso') ?? '', /^El proceso necesita/)
})

test('errorDeDescripcion: pasa lo valido y corta lo larguisimo', () => {
  assert.equal(errorDeDescripcion('Armar la grilla de septiembre.'), null)

  // Justo en el tope se acepta: el limite es inclusivo, igual que en el backend.
  assert.equal(errorDeDescripcion('x'.repeat(TOPE_DESCRIPCION)), null)

  const pasado = errorDeDescripcion('x'.repeat(TOPE_DESCRIPCION + 1))
  assert.ok(pasado !== null)
  assert.match(pasado, /caracteres/)
})

test('errorDeDescripcion: el largo se mide sobre el texto recortado', () => {
  // Un textarea con saltos al final no puede quedar fuera del tope por esos saltos.
  assert.equal(errorDeDescripcion('x'.repeat(TOPE_DESCRIPCION) + '\n\n  '), null)
})

test('cuerpoDeRedaccion: arma el pedido con las tres respuestas', () => {
  const cuerpo = cuerpoDeRedaccion('Grilla Colbún septiembre', {
    [QUE]: 'Armar la grilla de contenidos',
    [PARA_QUIEN]: 'Para Colbún',
    [CIERRE]: 'Cuando está aprobada'
  }, 93)

  assert.deepEqual(cuerpo, {
    titulo: 'Grilla Colbún septiembre',
    project_id: 93,
    respuestas: [
      { pregunta: PREGUNTAS_DESCRIPCION[0].texto, respuesta: 'Armar la grilla de contenidos' },
      { pregunta: PREGUNTAS_DESCRIPCION[1].texto, respuesta: 'Para Colbún' },
      { pregunta: PREGUNTAS_DESCRIPCION[2].texto, respuesta: 'Cuando está aprobada' }
    ]
  })
})

test('cuerpoDeRedaccion: descarta lo que quedo en blanco y conserva el orden', () => {
  const cuerpo = cuerpoDeRedaccion('  Revisar el brief  ', {
    [QUE]: 'Revisar el brief que mandó el cliente',
    [PARA_QUIEN]: '     ',
    [CIERRE]: 'Cuando está comentado'
  })

  assert.equal(cuerpo?.titulo, 'Revisar el brief')
  assert.equal(cuerpo?.respuestas.length, 2)
  assert.deepEqual(
    cuerpo?.respuestas.map((par) => par.pregunta),
    [PREGUNTAS_DESCRIPCION[0].texto, PREGUNTAS_DESCRIPCION[2].texto]
  )
  // Sin Espacio elegido la clave no viaja: mandar `project_id: null` seria otra cosa para la API.
  assert.equal('project_id' in (cuerpo ?? {}), false)
})

test('cuerpoDeRedaccion: sin una sola respuesta util devuelve null', () => {
  assert.equal(cuerpoDeRedaccion('Una tarea', {}), null)
  assert.equal(cuerpoDeRedaccion('Una tarea', { [QUE]: '  ', [PARA_QUIEN]: '​' }), null)
})

test('cuerpoDeRedaccion: recorta la respuesta al tope que acepta el backend', () => {
  const cuerpo = cuerpoDeRedaccion('Tarea', { [QUE]: 'a'.repeat(TOPE_RESPUESTA + 500) })

  assert.equal(cuerpo?.respuestas[0].respuesta.length, TOPE_RESPUESTA)
})

test('cuerpoDeRedaccion: ignora un project_id que no es un id', () => {
  const claves = { [QUE]: 'Algo que hacer' }

  assert.equal('project_id' in (cuerpoDeRedaccion('T', claves, 0) ?? {}), false)
  assert.equal('project_id' in (cuerpoDeRedaccion('T', claves, -3) ?? {}), false)
  assert.equal('project_id' in (cuerpoDeRedaccion('T', claves, 1.5) ?? {}), false)
  assert.equal('project_id' in (cuerpoDeRedaccion('T', claves, null) ?? {}), false)
})

test('las preguntas son tres, con clave unica y con ayuda', () => {
  assert.equal(PREGUNTAS_DESCRIPCION.length, 3)
  assert.equal(new Set(PREGUNTAS_DESCRIPCION.map((p) => p.clave)).size, 3)

  for (const pregunta of PREGUNTAS_DESCRIPCION) {
    assert.ok(pregunta.texto.trim() !== '')
    assert.ok(pregunta.ayuda.trim() !== '')
  }
})
