/**
 * Pruebas de las reglas del Scope del contrato (`src/dominio/scope.ts`).
 *
 * Lo que queda clavado:
 *
 *  1. **El navegador valida igual que la API**: lo que el editor deja mandar no vuelve como 422, y lo
 *     que la API rechaza no se manda.
 *  2. **Los cuerpos tienen la forma del contrato**: el texto original se conserva para volver a
 *     editar, las listas viajan limpias y el nombre del PDF sobrevive a una edicion sin archivo.
 *  3. **La pestaña Tareas solo marca lo que importa**: fuera y dudoso, nunca las de adentro.
 *  4. **Cada fallo de la IA dice donde se arregla**, y el 429 dice cuanto esperar.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparPorVeredicto,
  camposDeInterpretacionPdf,
  contenidoDe,
  cuerpoDeGuardado,
  cuerpoDeInterpretacion,
  entradaInicial,
  errorDeArchivo,
  errorDeEntrada,
  erroresDeContenido,
  ETIQUETA_VEREDICTO,
  filtrarTareas,
  mensajeDeFalloIa,
  normalizarLista,
  segundosDeEspera,
  textoAnalizando,
  veredictosParaMarcar
} from '../src/dominio/scope.ts'

const SCOPE = {
  fuente: 'estructurado',
  texto_original: null,
  archivo_nombre: null,
  resumen: 'Rediseño del sitio',
  incluye: ['Diseño de home'],
  excluye: ['Hosting'],
  supuestos: ['El cliente entrega textos'],
  actualizado_por: { id: 1, nombre: 'Ana' },
  actualizado_en: '2026-09-24 10:00:00'
}

const TAREAS = [
  { task_id: 1, nombre: 'Home', estado: 1, veredicto: 'dentro', motivo: 'Está en el alcance', referencia: 'Diseño de home' },
  { task_id: 2, nombre: 'Servidor', estado: 1, veredicto: 'fuera', motivo: 'Hosting excluido', referencia: 'Hosting' },
  { task_id: 3, nombre: 'Textos', estado: 4, veredicto: 'dudoso', motivo: 'No queda claro', referencia: null },
  { task_id: 4, nombre: 'Otra', estado: 1, veredicto: 'raro', motivo: '', referencia: null }
]

test('normalizarLista recorta y descarta vacios y lo que no es texto', () => {
  assert.deepEqual(normalizarLista(['  a ', '', '   ', 3, null, 'b']), ['a', 'b'])
  assert.deepEqual(normalizarLista(null), [])
  assert.deepEqual(normalizarLista(undefined), [])
})

test('entradaInicial sin scope arranca en texto libre y vacia', () => {
  const entrada = entradaInicial(null)

  assert.equal(entrada.fuente, 'texto')
  assert.equal(entrada.texto, '')
  assert.equal(entrada.archivo, null)
})

test('entradaInicial con scope arranca con sus datos', () => {
  assert.deepEqual(entradaInicial(SCOPE).estructurado.incluye, ['Diseño de home'])

  const pegado = entradaInicial({ ...SCOPE, fuente: 'texto', texto_original: 'Contrato' })
  assert.equal(pegado.texto, 'Contrato')

  const pdf = entradaInicial({ ...SCOPE, fuente: 'pdf', texto_original: null, archivo_nombre: 'c.pdf' })
  assert.equal(pdf.archivoGuardado, 'c.pdf')
  assert.equal(pdf.texto, '')
})

test('errorDeArchivo valida tipo y tamaño', () => {
  assert.match(errorDeArchivo(null), /Elige/)
  assert.match(errorDeArchivo({ nombre: 'a.docx', tipo: 'application/msword', bytes: 10 }), /PDF/)
  assert.match(errorDeArchivo({ nombre: 'a.pdf', tipo: 'application/pdf', bytes: 10 * 1024 * 1024 + 1 }), /10 MB/)
  assert.match(errorDeArchivo({ nombre: 'a.pdf', tipo: 'application/pdf', bytes: 0 }), /vacío/)
  assert.equal(errorDeArchivo({ nombre: 'a.pdf', tipo: 'application/pdf', bytes: 10 * 1024 * 1024 }), null)
  // Sin tipo, el nombre decide.
  assert.equal(errorDeArchivo({ nombre: 'a.PDF', tipo: '', bytes: 5 }), null)
})

test('errorDeEntrada: texto vacio no se interpreta', () => {
  const entrada = { ...entradaInicial(null), texto: '   ' }

  assert.notEqual(errorDeEntrada(entrada), null)
  assert.equal(errorDeEntrada({ ...entrada, texto: 'Hola' }), null)
  assert.notEqual(errorDeEntrada({ ...entrada, texto: 'x'.repeat(100_001) }), null)
})

test('errorDeEntrada: estructurado pide resumen o un item incluido', () => {
  const base = { ...entradaInicial(null), fuente: 'estructurado' }

  assert.notEqual(errorDeEntrada(base), null)
  assert.equal(errorDeEntrada({ ...base, estructurado: { ...base.estructurado, incluye: ['a'] } }), null)
  assert.equal(errorDeEntrada({ ...base, estructurado: { ...base.estructurado, resumen: 'Algo' } }), null)
})

test('erroresDeContenido aplica los topes del contrato', () => {
  assert.deepEqual(erroresDeContenido(contenidoDe(SCOPE)), {})
  assert.ok(erroresDeContenido({ ...SCOPE, resumen: 'x'.repeat(4001) }).resumen)
  assert.ok(erroresDeContenido({ ...SCOPE, incluye: ['x'.repeat(501)] }).incluye)
  assert.ok(erroresDeContenido({ ...SCOPE, supuestos: Array.from({ length: 101 }, (_, i) => `s${i}`) }).supuestos)
  // Items en blanco no cuentan: el editor los deja y el cuerpo los descarta.
  assert.deepEqual(erroresDeContenido({ ...SCOPE, excluye: ['', '  '] }), {})
})

test('cuerpoDeInterpretacion arma el JSON de texto y de estructurado', () => {
  assert.deepEqual(cuerpoDeInterpretacion({ ...entradaInicial(null), texto: '  Contrato  ' }), { fuente: 'texto', texto: 'Contrato' })

  const estructurado = { ...entradaInicial(SCOPE), estructurado: { ...contenidoDe(SCOPE), incluye: ['a', ' '] } }
  assert.deepEqual(cuerpoDeInterpretacion(estructurado), {
    fuente: 'estructurado', resumen: 'Rediseño del sitio', incluye: ['a'], excluye: ['Hosting'], supuestos: ['El cliente entrega textos']
  })
})

test('camposDeInterpretacionPdf solo manda el texto si hay texto', () => {
  const entrada = { ...entradaInicial(null), fuente: 'pdf' }

  assert.deepEqual(camposDeInterpretacionPdf(entrada), [['fuente', 'pdf']])
  assert.deepEqual(camposDeInterpretacionPdf({ ...entrada, texto: ' ctx ' }), [['fuente', 'pdf'], ['texto', 'ctx']])
})

test('cuerpoDeGuardado conserva el texto original de cada forma de carga', () => {
  const contenido = { resumen: ' R ', incluye: ['a', ''], excluye: [], supuestos: [] }

  const texto = cuerpoDeGuardado({ ...entradaInicial(null), texto: 'Pegado' }, contenido)
  assert.equal(texto.texto_original, 'Pegado')
  assert.equal(texto.archivo_nombre, null)
  assert.equal(texto.resumen, 'R')
  assert.deepEqual(texto.incluye, ['a'])

  const estructurado = cuerpoDeGuardado(entradaInicial(SCOPE), contenido)
  assert.deepEqual(JSON.parse(estructurado.texto_original).incluye, ['Diseño de home'])

  const pdfNuevo = cuerpoDeGuardado(
    { ...entradaInicial(null), fuente: 'pdf', archivo: { nombre: 'nuevo.pdf', tipo: 'application/pdf', bytes: 3 } },
    contenido
  )
  assert.equal(pdfNuevo.archivo_nombre, 'nuevo.pdf')
  assert.equal(pdfNuevo.texto_original, null)

  // Editar un scope de PDF sin volver a subirlo conserva el nombre del archivo.
  const pdfGuardado = cuerpoDeGuardado(entradaInicial({ ...SCOPE, fuente: 'pdf', archivo_nombre: 'viejo.pdf' }), contenido)
  assert.equal(pdfGuardado.archivo_nombre, 'viejo.pdf')
})

test('agruparPorVeredicto ordena fuera, dudoso, dentro y descarta lo desconocido', () => {
  const grupos = agruparPorVeredicto(TAREAS)

  assert.deepEqual(grupos.map((g) => g.veredicto), ['fuera', 'dudoso', 'dentro'])
  assert.equal(grupos.flatMap((g) => g.tareas).length, 3)
  assert.deepEqual(agruparPorVeredicto([]), [])
})

test('filtrarTareas por veredicto y por texto', () => {
  assert.deepEqual(filtrarTareas(TAREAS, 'fuera').map((t) => t.task_id), [2])
  assert.equal(filtrarTareas(TAREAS, 'todas').length, 4)
  assert.deepEqual(filtrarTareas(TAREAS, 'todas', 'hosting').map((t) => t.task_id), [2])
  assert.deepEqual(filtrarTareas(TAREAS, 'dentro', 'hosting'), [])
})

test('veredictosParaMarcar marca solo fuera y dudoso', () => {
  const mapa = veredictosParaMarcar({ puede_editar: true, scope: SCOPE, analisis: { tareas: TAREAS } })

  assert.deepEqual([...mapa.entries()], [[2, 'fuera'], [3, 'dudoso']])
  assert.equal(veredictosParaMarcar(null).size, 0)
  assert.equal(veredictosParaMarcar({ puede_editar: false, scope: null, analisis: null }).size, 0)
})

test('las etiquetas dicen scope', () => {
  assert.equal(ETIQUETA_VEREDICTO.fuera, 'Fuera de scope')
  assert.equal(ETIQUETA_VEREDICTO.dudoso, 'Scope dudoso')
})

test('segundosDeEspera lee retry_after y cae al respaldo', () => {
  assert.equal(segundosDeEspera({ mensaje: '', detalles: { retry_after: 41.2 } }), 42)
  assert.equal(segundosDeEspera({ mensaje: '', reintentarEnSegundos: 7 }), 7)
  assert.equal(segundosDeEspera({ mensaje: '' }), null)
})

test('mensajeDeFalloIa dice donde se arregla cada fallo', () => {
  assert.match(mensajeDeFalloIa({ mensaje: 'x', estado: 404 }, 'analizar'), /Ajustes/)
  assert.match(mensajeDeFalloIa({ mensaje: 'x', estado: 429, detalles: { retry_after: 30 } }, 'analizar'), /30 s/)
  assert.match(mensajeDeFalloIa({ mensaje: 'x', estado: 429 }, 'analizar'), /Espera/)
  assert.match(mensajeDeFalloIa({ mensaje: 'Sin scope.', estado: 409 }, 'analizar'), /^Sin scope\./)
  assert.match(mensajeDeFalloIa({ mensaje: 'x', estado: 502 }, 'interpretar'), /no se pudo leer/)
  assert.match(mensajeDeFalloIa({ mensaje: 'x', estado: 503 }, 'interpretar'), /configurada/)
  assert.match(
    mensajeDeFalloIa({ mensaje: 'Datos inválidos.', estado: 422, detalles: { texto: ['required'] } }, 'interpretar'),
    /Texto: falta/
  )
  assert.equal(mensajeDeFalloIa({ mensaje: 'Sin red' }, 'interpretar'), 'Sin red')
})

test('textoAnalizando dice cuantas tareas', () => {
  assert.equal(textoAnalizando(40), 'Analizando 40 tareas…')
  assert.equal(textoAnalizando(1), 'Analizando 1 tarea…')
  assert.equal(textoAnalizando(null), 'Analizando las tareas…')
})
