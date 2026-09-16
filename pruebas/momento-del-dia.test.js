/**
 * Pruebas del saludo por hora de la pantalla.
 *
 * Lo que se cuida acá es lo que NO se puede mirar: esta escena solo existe tres veces al dia y durante
 * media hora, asi que un fallo de borde —las 09:30 dentro en vez de fuera, la zona del televisor en vez
 * de la del negocio— se descubre en produccion, un martes, cuando la pared le desea buenos dias a una
 * oficina a las seis de la tarde. La funcion es pura y recibe el instante, asi que acá se prueban las
 * tres franjas, sus dos bordes y los cuatro modos de no tener respuesta, sin esperar a ninguna hora.
 *
 * Todas las horas de abajo se escriben como instantes UTC y se leen en `America/Santiago`. En
 * septiembre Chile esta en UTC-3, asi que las 12:00Z son las 09:00 locales. Que las dos cosas no
 * coincidan es a proposito: si el codigo usara el reloj del aparato en vez de la zona, estas pruebas
 * fallarian, que es justo lo que tienen que hacer.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FRANJAS_DEL_DIA, franjaDelMomento, horaDeReloj, minutosEnLaZona
} from '../src/dominio/momento-del-dia.ts'

const ZONA = 'America/Santiago'

/** Un instante a partir de una hora local de Santiago en septiembre (UTC-3). */
function enSantiago (hora, minuto = 0, segundo = 0) {
  return Date.parse(
    `2026-09-15T${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}:${String(segundo).padStart(2, '0')}-03:00`
  )
}

function claveA (hora, minuto = 0, segundo = 0) {
  return franjaDelMomento(enSantiago(hora, minuto, segundo), ZONA)?.clave ?? null
}

test('las tres franjas del dia contestan su mensaje', () => {
  assert.equal(claveA(9, 0), 'apertura')
  assert.equal(claveA(9, 15), 'apertura')
  assert.equal(claveA(13, 0), 'almuerzo')
  assert.equal(claveA(13, 59), 'almuerzo')
  assert.equal(claveA(18, 0), 'cierre')
  assert.equal(claveA(18, 29), 'cierre')
})

test('el borde de arriba queda FUERA: a las 09:30 en punto ya no hay mensaje', () => {
  // La regla es `[desde, hasta)`. Es lo unico que permite pegar dos franjas sin solaparlas, y ademas
  // es como se lee: una reunion "de 9 a 9:30" termina a las 9:30.
  assert.equal(claveA(9, 29, 59), 'apertura', 'el ultimo segundo del minuto 29 todavia esta dentro')
  assert.equal(claveA(9, 30, 0), null, 'las 09:30:00 en punto ya estan fuera')
  assert.equal(claveA(9, 30, 59), null, 'y el minuto entero de las 09:30, tambien')
  assert.equal(claveA(14, 0, 0), null)
  assert.equal(claveA(18, 30, 0), null)
})

test('el borde de abajo queda DENTRO: a las 09:00:00 el mensaje ya esta', () => {
  assert.equal(claveA(8, 59, 59), null)
  assert.equal(claveA(9, 0, 0), 'apertura')
})

test('fuera de las tres franjas no hay escena', () => {
  // Es lo que la saca del guion: una pared con un reloj mudo todo el dia es una pared que se deja de
  // mirar. Ver `construirGuion` en `src/dominio/pantalla-area.ts`.
  assert.equal(claveA(0, 0), null)
  assert.equal(claveA(7, 30), null)
  assert.equal(claveA(11, 0), null)
  assert.equal(claveA(16, 45), null)
  assert.equal(claveA(23, 59), null)
})

test('manda la zona del negocio y NO el reloj del televisor', () => {
  // El mismo instante: las 12:00 UTC son las 09:00 en Santiago y las 09:00 UTC no son nada.
  const instante = Date.parse('2026-09-15T12:00:00Z')

  assert.equal(franjaDelMomento(instante, ZONA)?.clave, 'apertura')
  assert.equal(franjaDelMomento(instante, 'UTC'), null, 'un televisor en UTC no puede inventarse el saludo')
  assert.equal(franjaDelMomento(Date.parse('2026-09-15T09:00:00Z'), ZONA), null)
})

test('sin zona no hay franja, aunque haya hora', () => {
  // `meta` todavia no llego. Adivinar con el reloj del aparato es peor que no decir nada.
  assert.equal(franjaDelMomento(enSantiago(9, 10), null), null)
  assert.equal(franjaDelMomento(enSantiago(9, 10), ''), null)
})

test('sin hora no hay franja: antes de hidratar la escena no existe', () => {
  assert.equal(franjaDelMomento(null, ZONA), null)
  assert.equal(franjaDelMomento(Number.NaN, ZONA), null)
})

test('una zona que no se entiende no rompe la pantalla', () => {
  // `Intl` lanza `RangeError` con una zona inventada. Una pared no se puede caer por un dato de
  // configuracion: la escena no se muestra y el resto sigue rotando.
  assert.equal(franjaDelMomento(enSantiago(9, 10), 'Marte/Olympus'), null)
  assert.equal(minutosEnLaZona(enSantiago(9, 10), 'Marte/Olympus'), null)
})

test('la franja devuelta es la MISMA referencia de la constante', () => {
  // De esto depende que el guion no se reconstruya una vez por segundo: `Escenario` memoriza por
  // identidad. Si algun dia se devolviera una copia, la pantalla seguiria funcionando y gastaria un
  // render entero por tic sin que nadie lo notara.
  const uno = franjaDelMomento(enSantiago(13, 10), ZONA)
  const otro = franjaDelMomento(enSantiago(13, 40), ZONA)

  assert.equal(uno, otro)
  assert.ok(FRANJAS_DEL_DIA.includes(uno))
})

test('las franjas por defecto no se solapan y estan bien escritas', () => {
  let ultimoFin = -1

  for (const franja of FRANJAS_DEL_DIA) {
    assert.match(franja.desde, /^\d{2}:\d{2}$/)
    assert.match(franja.hasta, /^\d{2}:\d{2}$/)
    assert.ok(franja.titulo.length > 0 && franja.apoyo.length > 0)
    // Sin signos de exclamacion: se leen a cuatro metros durante meses, y lo que en un mensaje suena
    // simpatico, colgado en una pared todo el año suena a cartel.
    assert.ok(!/[!¡]/.test(franja.titulo + franja.apoyo), `"${franja.clave}" grita`)

    const desde = Number(franja.desde.slice(0, 2)) * 60 + Number(franja.desde.slice(3))
    const hasta = Number(franja.hasta.slice(0, 2)) * 60 + Number(franja.hasta.slice(3))

    assert.ok(hasta > desde, `"${franja.clave}" termina antes de empezar`)
    assert.ok(desde >= ultimoFin, `"${franja.clave}" se solapa con la anterior`)
    ultimoFin = hasta
  }
})

test('unas franjas a medida pisan las del negocio', () => {
  const propias = [{ clave: 'turno', desde: '22:00', hasta: '23:00', titulo: 'Turno de noche', apoyo: 'Buen turno.' }]

  assert.equal(franjaDelMomento(enSantiago(22, 30), ZONA, propias)?.clave, 'turno')
  assert.equal(franjaDelMomento(enSantiago(9, 10), ZONA, propias), null, 'las de por defecto ya no aplican')
})

test('una franja mal escrita se ignora en vez de romper la pantalla', () => {
  const rotas = [
    { clave: 'alreves', desde: '18:00', hasta: '09:00', titulo: 'x', apoyo: 'y' },
    { clave: 'basura', desde: 'mañana', hasta: 'tarde', titulo: 'x', apoyo: 'y' },
    { clave: 'imposible', desde: '25:00', hasta: '26:00', titulo: 'x', apoyo: 'y' }
  ]

  assert.equal(franjaDelMomento(enSantiago(12, 0), ZONA, rotas), null)
  assert.equal(franjaDelMomento(enSantiago(20, 0), ZONA, rotas), null)
})

test('el reloj de pared usa la zona del negocio y avisa cuando no sabe la hora', () => {
  assert.equal(horaDeReloj(Date.parse('2026-09-15T12:00:00Z'), ZONA), '09:00')
  assert.equal(horaDeReloj(Date.parse('2026-09-15T12:00:00Z'), 'UTC'), '12:00')
  assert.equal(horaDeReloj(null, ZONA), '--:--', 'antes de hidratar no se inventa una hora')
  // Medianoche es 00:00 y nunca 24:00: `hourCycle: 'h23'` existe por esto.
  assert.equal(horaDeReloj(Date.parse('2026-09-15T03:00:00Z'), ZONA), '00:00')
})

test('una zona ilegible no apaga el reloj: cae a la del aparato', () => {
  // Al reves que la franja. El reloj de la cabecera es el unico indicador de que la pared esta viva, y
  // apagarlo por una zona mal configurada seria peor que mostrar una hora que puede estar corrida.
  assert.match(horaDeReloj(Date.parse('2026-09-15T12:00:00Z'), 'Marte/Olympus'), /^\d{2}:\d{2}$/)
})

test('los minutos del dia salen de la zona y no del proceso', () => {
  assert.equal(minutosEnLaZona(Date.parse('2026-09-15T12:00:00Z'), ZONA), 9 * 60)
  assert.equal(minutosEnLaZona(Date.parse('2026-09-15T12:00:00Z'), 'UTC'), 12 * 60)
  assert.equal(minutosEnLaZona(null, ZONA), null)
  assert.equal(minutosEnLaZona(Date.parse('2026-09-15T12:00:00Z'), null), null)
})
