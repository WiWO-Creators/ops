/**
 * Pruebas del resumen, el filtro y el orden de la pantalla de Focals.
 *
 * Lo que se verifica es lo que nadie ve fallar: un recuento equivocado dice un número cualquiera con
 * toda confianza, y es el número con el que alguien decide a quién llamar. Se prueba también que
 * "sin focal" sea una condición aparte y no un tramo —una cuenta al día sin focal tiene que caer en
 * ese filtro— y que buscar sin acentos encuentre lo que los tiene, que es como se escribe en la vida
 * real.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  FILTROS,
  ORDENES,
  CUENTAS_POR_PAGINA,
  EXPLICACION_DE_FORMULA,
  descripcionDeFocals,
  esProyectoUnico,
  esSinFocal,
  fotoDeLaCartera,
  filtrarCartera as filtrarPreparada,
  nombreDeCuenta,
  paginar,
  ordenarCartera as ordenarPreparada,
  prepararCartera,
  proyectosCoincidentes,
  resumirCartera,
  textoDeCarteraVacia,
  textoDeRecuento
} from '../src/dominio/cartera.ts'

/** Filtra una cartera cruda: la prepara y devuelve las cuentas que quedaron. */
function filtrarCartera (cuentas, texto, filtro) {
  return filtrarPreparada(prepararCartera(cuentas), texto, filtro).map((preparada) => preparada.cuenta)
}

/** Ordena una cartera cruda: la prepara y devuelve las cuentas en su nuevo orden. */
function ordenarCartera (cuentas, orden) {
  return ordenarPreparada(prepararCartera(cuentas), orden).map((preparada) => preparada.cuenta)
}

/** Las tres señales, con la forma mínima que el tipo exige. */
function senales () {
  return {
    plazos: { valor: 0, peso: 0, tareas: 0, incumplidas: 0, atraso_promedio: 0 },
    carga: { valor: 0, peso: 0, abiertas: 0, por_persona: 0 },
    vencimientos: { valor: 0, peso: 0, vencidas: 0, proximas: 0 }
  }
}

/**
 * Una cuenta de la cartera.
 *
 * @param id el cliente
 * @param semaforo su tramo
 * @param focales los nombres de quienes responden por ella
 * @param espacios los tramos de sus Proyectos, en orden
 */
function cuenta (id, semaforo, focales = [], espacios = [], nombre = `Cliente ${id}`) {
  return {
    cliente: {
      client_id: id,
      cliente: nombre,
      fecha: '2026-09-14',
      score: semaforo === 'sin_datos' ? null : 50,
      semaforo,
      variacion: null,
      espacios: espacios.length,
      procesos: 0,
      senales: senales(),
      focales: focales.map((full_name, indice) => ({ staffid: indice + 1, full_name }))
    },
    espacios: espacios.map((tramo, indice) => ({
      project_id: id * 100 + indice,
      espacio: `Proyecto ${id}-${indice}`,
      client_id: id,
      cliente: nombre,
      fecha: '2026-09-14',
      score: tramo === 'sin_datos' ? null : 40,
      semaforo: tramo,
      variacion: null,
      procesos: 0,
      senales: senales(),
      estado: null
    }))
  }
}

test('el resumen cuenta cada tramo, los Proyectos y las cuentas sin focal', () => {
  const cartera = [
    cuenta(1, 'rojo', ['Ana'], ['rojo', 'rojo', 'verde']),
    cuenta(2, 'rojo', [], ['rojo']),
    cuenta(3, 'verde', ['Beto'], ['verde']),
    cuenta(4, 'sin_datos', [], [])
  ]

  const resumen = resumirCartera(cartera)

  assert.equal(resumen.cuentas, 4)
  assert.equal(resumen.porTramo.rojo, 2)
  assert.equal(resumen.porTramo.verde, 1)
  assert.equal(resumen.porTramo.amarillo, 0)
  assert.equal(resumen.porTramo.sin_datos, 1)
  assert.equal(resumen.sinFocal, 2)
  assert.equal(resumen.espacios, 5)
  assert.equal(resumen.espaciosCriticos, 3)
})

test('un focal con el nombre en blanco cuenta como cuenta sin focal', () => {
  // Una persona dada de alta sin nombre pinta una insignia vacía: para esta pantalla es lo mismo que
  // no tener a nadie nombrado, y el recuento tiene que decir lo mismo que se ve.
  const resumen = resumirCartera([cuenta(1, 'verde', ['   '], [])])

  assert.equal(resumen.sinFocal, 1)
})

test('el resumen de una cartera vacía es todo ceros y no revienta', () => {
  const resumen = resumirCartera([])

  assert.deepEqual(resumen.porTramo, { verde: 0, amarillo: 0, rojo: 0, sin_datos: 0 })
  assert.equal(resumen.cuentas, 0)
  assert.equal(resumen.espacios, 0)
})

test('el filtro por tramo deja solo las cuentas de ese tramo', () => {
  const cartera = [cuenta(1, 'rojo'), cuenta(2, 'verde'), cuenta(3, 'rojo')]

  assert.deepEqual(
    filtrarCartera(cartera, '', 'rojo').map((una) => una.cliente.client_id),
    [1, 3]
  )
})

test('"sin focal" atrapa también a una cuenta al día', () => {
  // Es justamente el caso que el filtro existe para encontrar: nada arde, pero no hay a quién
  // reclamarle cuando empiece a arder.
  const cartera = [cuenta(1, 'verde', []), cuenta(2, 'verde', ['Ana'])]

  assert.deepEqual(
    filtrarCartera(cartera, '', 'sin_focal').map((una) => una.cliente.client_id),
    [1]
  )
})

test('el buscador encuentra sin acentos y por el nombre del Proyecto o del focal', () => {
  const cartera = [
    cuenta(1, 'rojo', ['Ana Pérez'], [], 'Analítica Sur'),
    cuenta(2, 'verde', ['Beto'], ['rojo'], 'Otra cuenta')
  ]

  cartera[1].espacios[0].espacio = 'Rediseño del sitio'

  assert.deepEqual(filtrarCartera(cartera, 'analitica', 'todas').map(nombreDeCuenta), ['Analítica Sur'])
  assert.deepEqual(filtrarCartera(cartera, 'PEREZ', 'todas').map(nombreDeCuenta), ['Analítica Sur'])
  assert.deepEqual(filtrarCartera(cartera, 'rediseno', 'todas').map(nombreDeCuenta), ['Otra cuenta'])
  assert.equal(filtrarCartera(cartera, '   ', 'todas').length, 2)
})

test('el filtro y el texto se aplican juntos, no uno o el otro', () => {
  const cartera = [cuenta(1, 'rojo', [], [], 'Norte'), cuenta(2, 'verde', [], [], 'Norte grande')]

  assert.deepEqual(filtrarCartera(cartera, 'norte', 'rojo').map(nombreDeCuenta), ['Norte'])
})

test('"peor primero" respeta el orden que puso el servidor', () => {
  const cartera = [cuenta(3, 'rojo'), cuenta(1, 'verde'), cuenta(2, 'amarillo')]

  assert.deepEqual(
    ordenarCartera(cartera, 'peor').map((una) => una.cliente.client_id),
    [3, 1, 2]
  )
})

test('ordenar por críticos cuenta los Proyectos en rojo, no el score del cliente', () => {
  const cartera = [
    cuenta(1, 'rojo', [], ['rojo']),
    cuenta(2, 'verde', [], ['rojo', 'rojo', 'verde']),
    cuenta(3, 'rojo', [], [])
  ]

  assert.deepEqual(
    ordenarCartera(cartera, 'criticos').map((una) => una.cliente.client_id),
    [2, 1, 3]
  )
})

test('ordenar por nombre usa el orden del español y no toca el arreglo de entrada', () => {
  const cartera = [cuenta(1, 'rojo', [], [], 'Ñandú'), cuenta(2, 'rojo', [], [], 'Abastible')]
  const copia = ordenarCartera(cartera, 'nombre')

  assert.deepEqual(copia.map(nombreDeCuenta), ['Abastible', 'Ñandú'])
  assert.deepEqual(cartera.map(nombreDeCuenta), ['Ñandú', 'Abastible'])
})

test('un cliente sin nombre se muestra con su id y se puede buscar igual', () => {
  const sinNombre = cuenta(7, 'rojo')
  sinNombre.cliente.cliente = null

  assert.equal(nombreDeCuenta(sinNombre), 'Cliente #7')
  assert.equal(filtrarCartera([sinNombre], '#7', 'todas').length, 1)
})

test('ordenar por críticos desempata por el orden del servidor y no por el nombre', () => {
  // El servidor ya puso a estas tres en un orden por una razón (su score): con los mismos Proyectos
  // críticos, reordenarlas por nombre mostraría otro orden del que el listado declara.
  const cartera = [
    cuenta(1, 'rojo', [], ['rojo'], 'Zeta'),
    cuenta(2, 'rojo', [], ['rojo'], 'Alfa'),
    cuenta(3, 'verde', [], ['rojo', 'rojo'], 'Medio')
  ]

  assert.deepEqual(
    ordenarCartera(cartera, 'criticos').map(nombreDeCuenta),
    ['Medio', 'Zeta', 'Alfa']
  )
})

test('ordenar una cartera vacía devuelve una lista vacía con cualquier criterio', () => {
  for (const orden of ORDENES) assert.deepEqual(ordenarCartera([], orden), [])
})

test('filtrar y ordenar no tocan la cartera preparada', () => {
  const preparadas = prepararCartera([cuenta(1, 'rojo', [], ['rojo']), cuenta(2, 'verde', [], [])])
  const copia = [...preparadas]

  filtrarPreparada(preparadas, 'cliente', 'rojo')
  ordenarPreparada(preparadas, 'criticos')

  assert.deepEqual(preparadas, copia)
})

test('preparar calcula una vez el texto comparable y los tramos de cada cuenta', () => {
  const cartera = [cuenta(1, 'rojo', ['Ana Pérez'], ['rojo', 'verde', 'sin_datos'], 'Analítica Sur')]

  const [preparada] = prepararCartera(cartera)

  assert.equal(preparada.cuenta, cartera[0])
  assert.match(preparada.textoNormalizado, /analitica sur ana perez/)
  assert.deepEqual(preparada.tramos, { verde: 1, amarillo: 0, rojo: 1, sin_datos: 1 })
  assert.deepEqual(prepararCartera([]), [])
})

test('"todas" y un texto vacío no recortan nada, y "sin focal" no mira el semáforo', () => {
  const cartera = [cuenta(1, 'rojo', []), cuenta(2, 'sin_datos', ['Ana'])]

  assert.equal(filtrarCartera(cartera, '', 'todas').length, 2)
  assert.deepEqual(filtrarCartera(cartera, '', 'sin_focal').map(nombreDeCuenta), ['Cliente 1'])
  assert.deepEqual(filtrarCartera([], 'x', 'rojo'), [])
})

test('buscar algo que no está da lista vacía', () => {
  assert.deepEqual(filtrarCartera([cuenta(1, 'rojo')], 'zzz', 'todas'), [])
})

test('esSinFocal es verdadero sin focales, con la lista ausente o con nombres en blanco', () => {
  assert.equal(esSinFocal(cuenta(1, 'verde', [])), true)
  assert.equal(esSinFocal(cuenta(1, 'verde', ['  '])), true)
  assert.equal(esSinFocal(cuenta(1, 'verde', ['Ana'])), false)

  const vieja = cuenta(1, 'verde', ['Ana'])
  delete vieja.cliente.focales

  assert.equal(esSinFocal(vieja), true)
})

test('los filtros y órdenes válidos son los que declara el dominio', () => {
  assert.deepEqual([...FILTROS], ['verde', 'amarillo', 'rojo', 'sin_datos', 'sin_focal', 'todas'])
  assert.deepEqual([...ORDENES], ['peor', 'nombre', 'criticos'])
})

test('el recuento escrito sigue el orden de urgencia y singulariza el uno', () => {
  const { espacios } = cuenta(1, 'rojo', [], ['rojo', 'rojo', 'amarillo', 'verde', 'sin_datos'])

  assert.equal(textoDeRecuento(espacios), '5 Proyectos · 2 críticos · 1 en atención · 1 al día · 1 sin datos')
  assert.equal(textoDeRecuento(cuenta(1, 'rojo', [], ['rojo']).espacios), '1 Proyecto · 1 crítico')
})

test('el recuento de una cuenta sin Proyectos lo dice con palabras', () => {
  assert.equal(textoDeRecuento([]), 'Sin proyectos: no hay nada que abrir todavía.')
})

test('la foto de la cartera es la fecha más reciente entre cuentas y Proyectos', () => {
  const cartera = [cuenta(1, 'rojo', [], ['rojo']), cuenta(2, 'verde', [], ['verde'])]
  cartera[0].cliente.fecha = '2026-09-10'
  cartera[0].espacios[0].fecha = '2026-09-12'
  cartera[1].cliente.fecha = '2026-09-11'
  cartera[1].espacios[0].fecha = '2026-09-09'

  assert.deepEqual(fotoDeLaCartera(cartera, '2026-09-12'), { fecha: '2026-09-12', obsoleta: false })
})

test('la foto es obsoleta solo si es anterior a hoy', () => {
  const cartera = [cuenta(1, 'rojo', [], [])]

  assert.equal(fotoDeLaCartera(cartera, '2026-09-15').obsoleta, true)
  assert.equal(fotoDeLaCartera(cartera, '2026-09-14').obsoleta, false)
  assert.equal(fotoDeLaCartera(cartera, '2026-09-13').obsoleta, false)
})

test('sin cuentas no hay foto que fechar', () => {
  assert.equal(fotoDeLaCartera([], '2026-09-14'), null)
})

test('un Proyecto que coincide se marca solo cuando la cuenta no coincidía por sí misma', () => {
  const [acme] = prepararCartera([cuenta(1, 'rojo', ['Ana'], ['rojo', 'verde'], 'Acme')])
  acme.cuenta.espacios[0].espacio = 'Rediseño web'
  const [preparada] = prepararCartera([acme.cuenta])

  assert.deepEqual(proyectosCoincidentes(preparada, 'REDISEÑO'), [100])
  assert.deepEqual(proyectosCoincidentes(preparada, 'rediseno'), [100])
  assert.deepEqual(proyectosCoincidentes(preparada, 'proyecto 1-1'), [101])
  // Coincide el cliente o el focal: la cuenta aparece por sí misma y los Proyectos no se marcan.
  assert.deepEqual(proyectosCoincidentes(preparada, 'acme'), [])
  assert.deepEqual(proyectosCoincidentes(preparada, 'ana'), [])
})

test('sin texto, o con un texto que nadie contiene, no se marca ningún Proyecto', () => {
  const [preparada] = prepararCartera([cuenta(1, 'rojo', [], ['rojo'])])

  assert.deepEqual(proyectosCoincidentes(preparada, ''), [])
  assert.deepEqual(proyectosCoincidentes(preparada, '   '), [])
  assert.deepEqual(proyectosCoincidentes(preparada, 'zzz'), [])
})

test('el vacío de la cartera propia admite que la foto del día aún no exista', () => {
  const propia = textoDeCarteraVacia(false)

  assert.match(propia.descripcion, /foto del día/)
  assert.doesNotMatch(propia.titulo, /No eres/)
  assert.match(textoDeCarteraVacia(true).descripcion, /corrida diaria/)
})

test('la descripción de la pantalla es una frase de alcance, sin la fórmula', () => {
  for (const alcance of [true, false, null]) {
    assert.doesNotMatch(descripcionDeFocals(alcance), /fórmula|Thinking Orb/)
    assert.match(descripcionDeFocals(alcance), /de la que peor está a la que mejor/)
  }

  assert.match(descripcionDeFocals(true), /con quien responde por cada una/)
  assert.match(descripcionDeFocals(false), /de las que respondes/)
})

test('la fórmula se dice aparte, con los tres pesos y quién redacta el estado', () => {
  assert.match(EXPLICACION_DE_FORMULA, /45 %.*30 %.*25 %/)
  assert.match(EXPLICACION_DE_FORMULA, /Thinking Orb/)
})

test('un solo Proyecto con las mismas señales que la cuenta se devuelve como único', () => {
  const unica = cuenta(1, 'rojo', [], ['rojo'])

  assert.equal(esProyectoUnico(unica), unica.espacios[0])
})

test('sin Proyectos, con varios o con señales distintas no hay Proyecto único', () => {
  assert.equal(esProyectoUnico(cuenta(1, 'rojo', [], [])), null)
  assert.equal(esProyectoUnico(cuenta(1, 'rojo', [], ['rojo', 'verde'])), null)

  const distinta = cuenta(1, 'rojo', [], ['rojo'])
  distinta.espacios[0].senales.plazos.valor = 99

  assert.equal(esProyectoUnico(distinta), null)
})

test('paginar corta la lista y dice cuántas páginas hay', () => {
  const lista = Array.from({ length: 30 }, (_, i) => i + 1)
  const segunda = paginar(lista, 2, 12)

  assert.deepEqual(segunda.items, [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24])
  assert.equal(segunda.pagina, 2)
  assert.equal(segunda.totalPaginas, 3)
  assert.equal(segunda.total, 30)
  assert.equal(paginar(lista, 3, 12).items.length, 6)
})

test('paginar acota una página fuera de rango y tolera una lista vacía', () => {
  const lista = [1, 2, 3]

  assert.equal(paginar(lista, 9, 2).pagina, 2)
  assert.equal(paginar(lista, 0, 2).pagina, 1)
  assert.equal(paginar(lista, Number.NaN, 2).pagina, 1)
  assert.deepEqual(paginar([], 4), { items: [], pagina: 1, totalPaginas: 1, total: 0, porPagina: CUENTAS_POR_PAGINA })
})

test('paginar rechaza un tamaño de página que no sea un entero mayor que 0', () => {
  for (const invalido of [0, -1, 2.5, Number.NaN]) assert.throws(() => paginar([1], 1, invalido), RangeError)
})
