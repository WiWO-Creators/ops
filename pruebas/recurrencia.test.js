/**
 * Pruebas de `src/dominio/recurrencia.ts`: como termina una regla y como se lee una planilla.
 *
 * Lo que se rompe sin avisar: una planilla pegada de Sheets que se parte por la coma equivocada, un
 * encabezado en otro orden que corre todas las columnas, y un "tras N veces" que viaja como "nunca".
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cuerpoDeFin, errorDeFin, leerPlanilla, mensajesDeFila, modoDeFin, plantillaCsv, resolverNombres,
  rutaDeRecurrentes, textoDeDistancia, textoDeFin
} from '../src/dominio/recurrencia.ts'

test('el modo de fin sale de lo guardado, y la fecha manda sobre los ciclos', () => {
  assert.equal(modoDeFin(0, null), 'nunca')
  assert.equal(modoDeFin(undefined, undefined), 'nunca')
  assert.equal(modoDeFin(6, null), 'ciclos')
  assert.equal(modoDeFin(6, '2026-12-31'), 'fecha')
})

test('el cuerpo de fin manda solo lo que el modo dice', () => {
  assert.deepEqual(cuerpoDeFin('nunca', '12', '2026-12-31'), { cycles: 0 })
  assert.deepEqual(cuerpoDeFin('ciclos', '12', '2026-12-31'), { cycles: 12 })
  assert.deepEqual(cuerpoDeFin('fecha', '12', '2026-12-31'), { cycles: 0, recurring_until: '2026-12-31' })
})

test('los errores de fin cubren vacio, cero, tope y una fecha anterior al inicio', () => {
  assert.equal(errorDeFin('nunca', '', ''), null)
  for (const ciclos of ['', '0', '366', '1.5', '-2']) assert.equal(typeof errorDeFin('ciclos', ciclos, ''), 'string', ciclos)
  assert.equal(errorDeFin('ciclos', '365', ''), null)
  assert.equal(typeof errorDeFin('fecha', '', ''), 'string')
  assert.equal(typeof errorDeFin('fecha', '', '2026-09-01', '2026-09-10'), 'string')
  assert.equal(errorDeFin('fecha', '', '2026-09-10', '2026-09-10'), null)
})

test('una planilla pegada de Sheets se lee por tabulador y con el encabezado en cualquier orden', () => {
  const filas = leerPlanilla('Responsable\tTarea\tFrecuencia\tProyecto\nana@wiwo.me\tInforme, mensual\tMensual\t12\n\n')

  assert.equal(filas.length, 1)
  assert.equal(filas[0].tarea, 'Informe, mensual', 'La coma dentro de una celda no parte la fila')
  assert.equal(filas[0].responsable, 'ana@wiwo.me')
  assert.equal(filas[0].proyecto_id, '12')
  assert.equal(filas[0].fin, '')
})

test('un CSV de Excel en español usa punto y coma, y las comillas se respetan', () => {
  const filas = leerPlanilla('\uFEFFTarea;Frecuencia;Responsable;Proyecto;Inicio;Plazo dias;Fin\r\n"Revisar ""pauta""";Semanal;41;8;01/10/2026;2;6 veces\r\n')

  assert.equal(filas[0].tarea, 'Revisar "pauta"')
  assert.equal(filas[0].fecha_inicio, '01/10/2026')
  assert.equal(filas[0].vencimiento_dias, '2')
  assert.equal(filas[0].fin, '6 veces')
})

test('sin encabezado se toma el orden de la plantilla, y las lineas en blanco no cuentan', () => {
  const filas = leerPlanilla('Cierre,Mensual,1,8\n   \nBackup,cada 2 semanas,2,9,,,31/12/2026\n')

  assert.equal(filas.length, 2)
  assert.deepEqual([filas[0].tarea, filas[0].frecuencia, filas[0].responsable, filas[0].proyecto_id], ['Cierre', 'Mensual', '1', '8'])
  assert.equal(filas[1].fin, '31/12/2026')
  assert.deepEqual(leerPlanilla(''), [])
})

test('la plantilla descargable se vuelve a leer igual', () => {
  const filas = leerPlanilla(plantillaCsv())

  assert.equal(filas.length, 2)
  assert.equal(filas[0].frecuencia, 'Mensual')
  assert.equal(filas[1].fin, '6 veces')
})

test('los nombres escritos a mano se traducen a id solo si hay exactamente uno', () => {
  const proyectos = [{ id: 8, name: 'SAC Contact Center' }, { id: 9, name: 'Web' }, { id: 10, name: 'Web' }]
  const personas = [{ id: 41, name: 'Lucía Pereira' }]
  const fila = { tarea: 'x', frecuencia: 'semanal', responsable: 'lucia pereira', proyecto_id: 'sac contact center', fecha_inicio: '', vencimiento_dias: '', fin: '' }

  const resuelta = resolverNombres(fila, proyectos, personas)
  assert.equal(resuelta.proyecto_id, '8')
  assert.equal(resuelta.responsable, '41')
  assert.equal(resolverNombres({ ...fila, proyecto_id: 'Web' }, proyectos, personas).proyecto_id, 'Web', 'Dos homonimos: no se adivina')
  assert.equal(resolverNombres({ ...fila, responsable: 'LUCIA@wiwo.me' }, proyectos, personas).responsable, 'LUCIA@wiwo.me')
  assert.equal(resolverNombres({ ...fila, proyecto_id: '112' }, proyectos, personas).proyecto_id, '112')
})

test('la ruta del listado lleva solo los filtros elegidos', () => {
  assert.equal(rutaDeRecurrentes({ proyecto: '', responsable: '', area: '' }), 'tasks/recurrentes')
  assert.equal(
    rutaDeRecurrentes({ proyecto: '8', responsable: '', area: '3' }),
    'tasks/recurrentes?filter%5Bproject_id%5D=8&filter%5Barea%5D=3'
  )
})

test('los codigos de la API se vuelven frases, y lo desconocido no se pierde', () => {
  assert.deepEqual(mensajesDeFila(null), [])
  const mensajes = mensajesDeFila({ frecuencia: ['no_soportada'], color: ['no_editable'] })
  assert.equal(mensajes.length, 2)
  assert.match(mensajes[0].mensaje, /Frecuencia no reconocida/)
  assert.match(mensajes[1].mensaje, /color/)
})

test('el fin de una regla se lee en una frase', () => {
  const formatear = (fecha) => fecha.split('-').reverse().join('/')
  assert.equal(textoDeFin({ cycles: 12, total_cycles: 3, recurring_until: null }, formatear), '3 de 12 veces')
  assert.equal(textoDeFin({ cycles: 0, total_cycles: 1, recurring_until: '2026-12-31' }, formatear), 'hasta el 31/12/2026')
  assert.equal(textoDeFin({ cycles: 0, total_cycles: 1, recurring_until: null }, formatear), 'Sin fin · 1 copia')
})

test('la distancia a la proxima copia se cuenta en dias, no en horas', () => {
  assert.equal(textoDeDistancia(0), 'hoy')
  assert.equal(textoDeDistancia(1), 'mañana')
  assert.equal(textoDeDistancia(-1), 'ayer')
  assert.equal(textoDeDistancia(5), 'en 5 días')
  assert.equal(textoDeDistancia(-3), 'hace 3 días')
})
