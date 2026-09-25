/**
 * Pruebas de `src/dominio/recurrencia.ts`: como termina una regla y como se lee una planilla.
 *
 * Lo que se rompe sin avisar: una planilla pegada de Sheets que se parte por la coma equivocada, un
 * encabezado en otro orden que corre todas las columnas, y un "tras N veces" que viaja como "nunca".
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  alternarDia, alternarFinesDeSemana, camposDeRegla, cuerpoDeFin, cuerpoDePrevia, errorDeDiasExcluidos, errorDeFin,
  erroresDeApiEnRegla, erroresDeRegla, ESTADOS_REGLA, excluyeFinesDeSemana, fraseDeRegla, leerPlanilla, mensajesDeFila,
  mismosDias, modoDeFin, normalizarDias, parcheDeRegla, plantillaCsv, resolverNombres, rutaDeRecurrentes,
  textoDeDiasExcluidos, textoDeDistancia, textoDeFechaDePrevia, textoDeFin, textoDeFinDeRegla, tieneDosTopes
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

test('los dias excluidos se normalizan, se alternan y el atajo de fin de semana va y vuelve', () => {
  assert.deepEqual(normalizarDias([7, 6, 6, 0, 8, 1.5, 3]), [3, 6, 7])
  assert.deepEqual(normalizarDias(null), [])
  assert.deepEqual(alternarDia([1, 3], 3), [1])
  assert.deepEqual(alternarDia([3], 1), [1, 3])
  assert.deepEqual(alternarFinesDeSemana([1]), [1, 6, 7])
  assert.deepEqual(alternarFinesDeSemana([6]), [6, 7], 'Con uno solo, completa el par')
  assert.deepEqual(alternarFinesDeSemana([1, 6, 7]), [1])
  assert.equal(excluyeFinesDeSemana([6, 7]), true)
  assert.equal(excluyeFinesDeSemana([7]), false)
  assert.equal(mismosDias([7, 6], [6, 7]), true)
  assert.equal(mismosDias([6], [6, 7]), false)
  assert.equal(errorDeDiasExcluidos([1, 2, 3, 4, 5, 6]), null)
  assert.equal(typeof errorDeDiasExcluidos([1, 2, 3, 4, 5, 6, 7]), 'string')
})

test('la regla se escribe como el frequency_label de la API', () => {
  assert.equal(textoDeDiasExcluidos([]), '')
  assert.equal(textoDeDiasExcluidos([7, 6]), 'salvo sábado y domingo')
  assert.equal(textoDeDiasExcluidos([1, 3, 5]), 'salvo lunes, miércoles y viernes')
  assert.equal(fraseDeRegla(1, 'day', [6, 7]), 'Cada día, salvo sábado y domingo')
  assert.equal(fraseDeRegla(2, 'week'), 'Cada 2 semanas')
  assert.equal(fraseDeRegla(1, null), null)
  assert.equal(fraseDeRegla(0, 'month'), null)
  assert.equal(textoDeFechaDePrevia('2030-01-07'), 'lunes 7 de enero de 2030')
  assert.equal(textoDeFechaDePrevia('basura'), 'basura')
})

test('el estado pausada tiene etiqueta y la ayuda de completada no promete reabrir desde la lista', () => {
  assert.equal(ESTADOS_REGLA.pausada.etiqueta, 'Pausada')
  assert.match(ESTADOS_REGLA.suspendida.ayuda, /ficha/)
  assert.doesNotMatch(ESTADOS_REGLA.suspendida.ayuda, /hasta que se reabra/)
})

const GUARDADA = { start_date: '2026-09-01', repeat_every: 1, recurring_type: 'week', cycles: 0, recurring_until: null, skip_weekdays: [] }

test('el editor manda solo lo que cambio, con la regla entera cuando cambia la regla', () => {
  const inicial = camposDeRegla(GUARDADA)
  assert.deepEqual(parcheDeRegla(inicial, inicial), {})

  assert.deepEqual(parcheDeRegla(inicial, { ...inicial, dias: [7, 6] }),
    { recurring: true, repeat_every: 1, recurring_type: 'week', cycles: 0, skip_weekdays: [6, 7] })
  assert.deepEqual(parcheDeRegla(inicial, { ...inicial, repetirCada: '2' }),
    { recurring: true, repeat_every: 2, recurring_type: 'week', cycles: 0 }, 'Sin tocar los dias, no viajan')
  assert.deepEqual(parcheDeRegla(inicial, { ...inicial, inicio: '2026-10-01' }), { start_date: '2026-10-01' })

  const conDias = camposDeRegla({ ...GUARDADA, skip_weekdays: [6, 7] })
  assert.deepEqual(parcheDeRegla(conDias, { ...conDias, dias: [] }),
    { recurring: true, repeat_every: 1, recurring_type: 'week', cycles: 0, skip_weekdays: [] }, '[] limpia')
})

test('una regla con veces y fecha conserva los dos topes si nadie toca "Termina"', () => {
  const inicial = camposDeRegla({ ...GUARDADA, cycles: 12, recurring_until: '2026-12-31' })
  assert.equal(inicial.fin.modo, 'fecha')
  assert.equal(tieneDosTopes(inicial), true)
  assert.deepEqual(parcheDeRegla(inicial, { ...inicial, unidad: 'month' }),
    { recurring: true, repeat_every: 1, recurring_type: 'month', cycles: 12, recurring_until: '2026-12-31' })
  assert.deepEqual(parcheDeRegla(inicial, { ...inicial, fin: { ...inicial.fin, modo: 'ciclos' } }),
    { recurring: true, repeat_every: 1, recurring_type: 'week', cycles: 12 }, 'Si se toca, manda lo elegido')
  assert.equal(tieneDosTopes(camposDeRegla(GUARDADA)), false)
})

test('la vista previa manda el inicio solo si cambio, y siempre sin Tarea', () => {
  const inicial = camposDeRegla({ ...GUARDADA, skip_weekdays: [6, 7] })
  assert.deepEqual(cuerpoDePrevia(inicial, inicial, 42),
    { task_id: 42, repeat_every: 1, recurring_type: 'week', cycles: 0, skip_weekdays: [6, 7], cantidad: 5 })
  assert.deepEqual(cuerpoDePrevia(inicial, { ...inicial, inicio: '2026-10-01' }, 42).start_date, '2026-10-01')
  assert.equal(cuerpoDePrevia(inicial, inicial, null).start_date, '2026-09-01')
  assert.equal('task_id' in cuerpoDePrevia(inicial, inicial, null), false)
})

test('los errores del formulario y los del 422 caen en su campo', () => {
  const inicial = camposDeRegla(GUARDADA)
  assert.deepEqual(erroresDeRegla(inicial), {})
  const errores = erroresDeRegla({ ...inicial, inicio: '', repetirCada: '0', unidad: 'x', dias: [1, 2, 3, 4, 5, 6, 7], fin: { modo: 'ciclos', ciclos: '', hasta: '' } })
  assert.deepEqual(Object.keys(errores).sort(), ['dias', 'fin', 'inicio', 'repetirCada', 'unidad'])

  assert.deepEqual(erroresDeApiEnRegla({ skip_weekdays: ['excluye_todos'], cycles: ['fuera_de_rango'], assignees: ['no_existe'] }), {
    dias: 'No puedes excluir los siete días: la tarea nunca se generaría.',
    fin: 'Las veces deben ser un entero entre 1 y 365.'
  })
  assert.deepEqual(erroresDeApiEnRegla(undefined), {})
  assert.match(erroresDeApiEnRegla({ repeat_every: ['raro_nuevo'] }).repetirCada ?? '', /raro nuevo/)
})

test('como termina una regla guardada, en la ficha', () => {
  const igual = (fecha) => fecha
  assert.equal(textoDeFinDeRegla(0, null, igual), 'Sin fecha de término')
  assert.equal(textoDeFinDeRegla(1, null, igual), 'Termina tras 1 vez')
  assert.equal(textoDeFinDeRegla(12, '', igual), 'Termina tras 12 veces')
  assert.equal(textoDeFinDeRegla(0, '2026-12-31', igual), 'Termina el 2026-12-31')
  assert.equal(textoDeFinDeRegla(6, '2026-12-31', igual), 'Termina tras 6 veces o el 2026-12-31, lo que ocurra primero')
})
