/**
 * Pruebas de la logica de la pantalla de area.
 *
 * Lo que se cuida aca es lo que no se ve fallar mirando la pared: un guion que queda vacio, una
 * escena que desaparece y manda la rotacion al principio, un paginado que esconde gente sin decirlo,
 * y un parametro de la URL que congela la pantalla o la convierte en un estrobo.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BANDA_DE_TRABAJANDO, CLASES_DE_ESCENA, PERIODO_DE_DATO_MS, REJILLAS, TABLA_AREA, TABLA_EMPRESA,
  TOPE_DE_ANUNCIOS, TOPE_DE_PAGINAS, construirGuion, faseDeDato, firmaDelGuion, frescuraDe,
  intervaloConBackoff, leerParametrosDePantalla, proximaEscenaViva, proximoRecargado, tablaDeEscena
} from '../src/dominio/pantalla-area.ts'
import { FRANJAS_DEL_DIA, franjaDelMomento } from '../src/dominio/momento-del-dia.ts'

/** La zona del negocio, la misma que manda la API en `meta.timezone`. */
const ZONA = 'America/Santiago'

/** Un instante a partir de una hora local de Santiago en septiembre (UTC-3). */
function enSantiago (hora, minuto = 0) {
  return Date.parse(`2026-09-15T${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}:00-03:00`)
}

/** La franja vigente a esa hora local, para pasarsela a `construirGuion`. */
function franjaA (hora, minuto = 0) {
  return franjaDelMomento(enSantiago(hora, minuto), ZONA)
}

function anuncio (id) {
  return {
    id,
    tipo: 'imagen_con_texto',
    titulo: `Anuncio ${id}`,
    texto: 'Un aviso de prueba.',
    image_url: `https://ejemplo.test/anuncio/${id}`
  }
}

/** Los parametros por defecto, sin nada en la URL. */
const PARAMETROS = leerParametrosDePantalla({})

/** La tabla de una escena que solo tiene una. Existe para no escribir `tablas[0]` treinta veces. */
function unica (escena) {
  return escena.tablas[0]
}

function gente (cuantos, desde = 1) {
  return Array.from({ length: cuantos }, (_, i) => ({
    staff_id: desde + i,
    name: `Persona ${desde + i}`,
    avatar: null,
    cargo: null,
    jornada_started_at: '2026-09-15T09:00:00-03:00',
    last_seen_at: null
  }))
}

/**
 * Un paquete como el que manda la API: las cinco escenas siempre, en orden.
 *
 * `trabajando`, `cronometros`, `procesos` y `espacios` se llenan con lo que pida cada prueba.
 */
function paquete (relleno = {}) {
  const dura = (clase, porDefecto) => (relleno.segundos?.[clase] ?? porDefecto)

  return {
    area: { id: 7, name: 'Content' },
    scenes: [
      {
        kind: 'portada',
        seconds: dura('portada', 12),
        counts: {
          personas: 14,
          jornadas_abiertas: (relleno.trabajando ?? []).length,
          cronometros_corriendo: (relleno.cronometros ?? []).length,
          procesos_abiertos: (relleno.procesos ?? []).length,
          procesos_atrasados: 0,
          espacios_activos: (relleno.espacios ?? []).length
        }
      },
      {
        kind: 'trabajando',
        seconds: dura('trabajando', 20),
        items: relleno.trabajando ?? [],
        total: relleno.totalDelArea ?? (relleno.trabajando ?? []).length,
        empresa: {
          items: relleno.empresa ?? [],
          total: relleno.totalDeLaEmpresa ?? (relleno.empresa ?? []).length
        }
      },
      { kind: 'cronometros', seconds: dura('cronometros', 20), items: relleno.cronometros ?? [] },
      { kind: 'procesos', seconds: dura('procesos', 20), items: relleno.procesos ?? [], total: (relleno.procesos ?? []).length },
      { kind: 'espacios', seconds: dura('espacios', 20), items: relleno.espacios ?? [] },
      { kind: 'momento', seconds: dura('momento', 10) },
      { kind: 'anuncios', seconds: dura('anuncios', 20), items: relleno.anuncios ?? [] }
    ]
  }
}

test('un area dormida muestra la portada y no una pantalla en blanco', () => {
  const guion = construirGuion(paquete(), PARAMETROS)

  assert.equal(guion.length, 1)
  assert.equal(guion[0].clase, 'portada')
})

test('las escenas vacias salen del guion, las llenas se quedan', () => {
  const guion = construirGuion(paquete({ trabajando: gente(3) }), PARAMETROS)

  assert.deepEqual(guion.map((e) => e.id), ['portada', 'trabajando#e0a1'])
})

test('el guion nunca vuelve vacio, ni con todo salteado', () => {
  const soloPortada = leerParametrosDePantalla({ saltar: CLASES_DE_ESCENA.join(',') })
  const guion = construirGuion(paquete({ trabajando: gente(3) }), soloPortada)

  assert.equal(guion.length, 1)
  assert.equal(guion[0].clase, 'portada')
})

test('sin datos no hay guion: la pantalla esta en modo espera, no dibujando vacio', () => {
  assert.deepEqual(construirGuion(null, PARAMETROS), [])
})

test('una escena que entra en una pagina conserva su id sin numero', () => {
  const guion = construirGuion(paquete({ cronometros: gente(REJILLAS.horizontal.cronometros) }), PARAMETROS)

  assert.deepEqual(guion.map((e) => e.id), ['portada', 'cronometros'])
})

test('cada pagina es una entrada propia del guion', () => {
  const guion = construirGuion(paquete({ cronometros: gente(REJILLAS.horizontal.cronometros + 1) }), PARAMETROS)

  assert.deepEqual(guion.map((e) => e.id), ['portada', 'cronometros#1', 'cronometros#2'])
  // A tope y no parejo: una escena de UNA tabla llena la banda entera en cada pagina. El reparto
  // parejo es de `trabajando`, donde un bloque corto deja un hueco entre dos bloques.
  assert.equal(unica(guion[1]).items.length, REJILLAS.horizontal.cronometros)
  assert.equal(unica(guion[2]).items.length, 1)
})

test('pasado el tope de paginas se corta, y lo cortado se cuenta en vez de desaparecer', () => {
  const cuantos = REJILLAS.horizontal.cronometros * TOPE_DE_PAGINAS + 7
  const guion = construirGuion(paquete({ cronometros: gente(cuantos) }), PARAMETROS)
  const paginas = guion.filter((e) => e.clase === 'cronometros')

  assert.equal(paginas.length, TOPE_DE_PAGINAS)
  assert.equal(unica(paginas[paginas.length - 1]).ocultos, 7, 'los que no entraron se nombran en el pie')
  assert.equal(unica(paginas[0]).ocultos, 0, 'y solo en la ultima pagina')
})

test('la firma no cambia cuando cambian los datos pero no las escenas', () => {
  const antes = construirGuion(paquete({ trabajando: gente(3) }), PARAMETROS)

  // Mismo conjunto de escenas, otros nombres y otras horas: es lo que devuelve el sondeo siguiente.
  const otros = gente(3).map((persona) => ({ ...persona, jornada_started_at: '2026-09-15T11:22:33-03:00' }))
  const despues = construirGuion(paquete({ trabajando: otros }), PARAMETROS)

  assert.equal(firmaDelGuion(antes), firmaDelGuion(despues))
})

test('la firma SI cambia cuando una escena aparece o se parte en dos', () => {
  const una = firmaDelGuion(construirGuion(paquete({ trabajando: gente(3) }), PARAMETROS))
  const dos = firmaDelGuion(construirGuion(paquete({ trabajando: gente(REJILLAS.horizontal.trabajando + 1) }), PARAMETROS))
  const otra = firmaDelGuion(construirGuion(
    paquete({ trabajando: gente(3), espacios: [{ id: 1, name: 'X', deadline: null, progress: 0, procesos_abiertos: 1, procesos_atrasados: 0 }] }),
    PARAMETROS
  ))

  assert.notEqual(una, dos)
  assert.notEqual(una, otra)
})

test('cuando la escena actual muere se avanza a la siguiente, nunca al principio', () => {
  // Eran las 18:04 y habia gente trabajando; a las 18:05 cierran la ultima jornada.
  const despues = construirGuion(paquete({ cronometros: gente(2), espacios: [] }), PARAMETROS)

  assert.deepEqual(despues.map((e) => e.id), ['portada', 'cronometros'])
  assert.equal(proximaEscenaViva(despues, 'trabajando'), 1, 'cronometros viene despues de trabajando')
})

test('si la escena muerta era la ultima, se vuelve al principio', () => {
  const guion = construirGuion(paquete({ trabajando: gente(2) }), PARAMETROS)

  assert.equal(proximaEscenaViva(guion, 'espacios'), 0)
})

test('la posicion se busca por clase aunque la escena estuviera paginada', () => {
  const guion = construirGuion(paquete({ espacios: [{ id: 1, name: 'X', deadline: null, progress: 0, procesos_abiertos: 1, procesos_atrasados: 0 }] }), PARAMETROS)

  assert.equal(proximaEscenaViva(guion, 'trabajando#2'), 1, 'espacios viene despues de trabajando')
})

test('los parametros se acotan en vez de fallar', () => {
  assert.equal(leerParametrosDePantalla({ escena: '9999' }).segundosPorEscena, 120)
  assert.equal(leerParametrosDePantalla({ escena: '1' }).segundosPorEscena, 5)
  // Lo que no se entiende ya no cae a un numero: cae a `null`, que significa "respeta la
  // configuracion del area". Ver la prueba dedicada mas abajo.
  assert.equal(leerParametrosDePantalla({ refresco: '1' }).segundosDeRefresco, 15)
  assert.equal(leerParametrosDePantalla({ refresco: '99999' }).segundosDeRefresco, 300)
  assert.equal(leerParametrosDePantalla({ zoom: '99' }).zoom, 1.4)
})

test('lo que no se reconoce se ignora en silencio', () => {
  assert.deepEqual(leerParametrosDePantalla({ saltar: 'espacios,inventada' }).saltar, ['espacios'])
  assert.equal(leerParametrosDePantalla({ solo: 'inventada' }).solo, null)
  assert.equal(leerParametrosDePantalla({ tema: 'fucsia' }).tema, 'oscuro')
  assert.equal(leerParametrosDePantalla({ transicion: 'explosion' }).transicion, 'fundido')
})

test('la portada no se puede saltar: es lo que impide la pantalla en blanco', () => {
  assert.deepEqual(leerParametrosDePantalla({ saltar: 'portada' }).saltar, [])
})

test('un `solo` que no deja nada en pie devuelve la portada, no una pantalla vacia', () => {
  const soloEspacios = leerParametrosDePantalla({ solo: 'espacios' })
  const guion = construirGuion(paquete({ trabajando: gente(3) }), soloEspacios)

  assert.equal(guion.length, 1)
  assert.equal(guion[0].clase, 'portada')
})

test('un solo sondeo fallido no cambia nada en pantalla', () => {
  const intervalo = 30_000

  assert.equal(frescuraDe(intervalo, intervalo), 'fresco')
  assert.equal(frescuraDe(intervalo * 2.5, intervalo), 'fresco')
  assert.equal(frescuraDe(intervalo * 4, intervalo), 'viejo')
  assert.equal(frescuraDe(11 * 60 * 1000, intervalo), 'sin-conexion')
})

test('el backoff se duplica y tiene techo', () => {
  assert.equal(intervaloConBackoff(30_000, 0), 30_000)
  assert.equal(intervaloConBackoff(30_000, 1), 60_000)
  assert.equal(intervaloConBackoff(30_000, 2), 120_000)
  assert.equal(intervaloConBackoff(30_000, 50), 300_000)
})

test('el recargado nocturno cae de madrugada y dispersa por token', () => {
  const mediodia = new Date('2026-09-15T12:00:00').getTime()
  const uno = proximoRecargado(mediodia, 'aaaa')
  const otro = proximoRecargado(mediodia, 'zzzz')

  assert.ok(uno > mediodia, 'siempre en el futuro')
  assert.ok(new Date(uno).getHours() === 4, 'a las cuatro de la maniana')
  assert.notEqual(uno, otro, 'dos televisores no recargan en el mismo segundo')
  assert.equal(proximoRecargado(mediodia, 'aaaa'), uno, 'y cada uno siempre en el mismo momento')
})

test('la duracion de cada escena la manda la configuracion del area', () => {
  const guion = construirGuion(
    paquete({ trabajando: gente(2), segundos: { portada: 8, trabajando: 45 } }),
    PARAMETROS
  )

  assert.equal(guion[0].duracionMs, 8_000, 'la portada dura lo que diga su configuracion')
  assert.equal(guion[1].duracionMs, 45_000, 'y cada escena la suya')
})

test('un `?escena=` en la URL pisa la configuracion entera', () => {
  const forzado = leerParametrosDePantalla({ escena: '7' })
  const guion = construirGuion(
    paquete({ trabajando: gente(2), segundos: { portada: 8, trabajando: 45 } }),
    forzado
  )

  assert.equal(guion[1].duracionMs, 7_000, 'la URL manda para probar una vuelta rapida')
  // La portada sigue durando menos: es un titulo, no una lista.
  assert.ok(guion[0].duracionMs < guion[1].duracionMs, 'y la portada conserva su proporcion')
})

test('sin `?escena=` no se inventa una duracion que pise la configuracion', () => {
  assert.equal(leerParametrosDePantalla({}).segundosPorEscena, null)
  assert.equal(leerParametrosDePantalla({ escena: 'ya' }).segundosPorEscena, null)
  assert.equal(leerParametrosDePantalla({ escena: '-3' }).segundosPorEscena, null)
})

test('una escena sin duracion no se queda en cero', () => {
  const sinSegundos = {
    area: { id: 7, name: 'Content' },
    scenes: [{ kind: 'trabajando', items: gente(2) }]
  }

  const guion = construirGuion(sinSegundos, PARAMETROS)

  assert.ok(guion[0].duracionMs >= 5_000, 'una escena de cero segundos seria un parpadeo')
})

test('de pie entran mas filas y menos columnas que tumbado', () => {
  const cuantos = REJILLAS.horizontal.trabajando + 1
  const tumbado = construirGuion(paquete({ trabajando: gente(cuantos) }), PARAMETROS, 'horizontal')
  const dePie = construirGuion(paquete({ trabajando: gente(cuantos) }), PARAMETROS, 'vertical')

  assert.equal(tumbado.filter((e) => e.clase === 'trabajando').length, 2, 'tumbado no entran y se pagina')
  assert.equal(dePie.filter((e) => e.clase === 'trabajando').length, 1, 'de pie entran de una')
  assert.ok(
    REJILLAS.vertical.procesos > REJILLAS.horizontal.procesos,
    'la banda util vertical mide el doble: tiene que caber mas'
  )
})

test('cada orientacion pagina con su propia rejilla', () => {
  const cuantos = REJILLAS.vertical.procesos + 1
  const tareas = Array.from({ length: cuantos }, (_, i) => ({
    id: i + 1,
    name: `Tarea ${i + 1}`,
    status: null,
    priority: null,
    due_date: null,
    overdue: false,
    progress: { checklist_total: 0, checklist_done: 0, percent: null },
    project: null,
    assignees: []
  }))

  const dePie = construirGuion(paquete({ procesos: tareas }), PARAMETROS, 'vertical')
  const paginas = dePie.filter((e) => e.clase === 'procesos')

  assert.equal(paginas.length, 2)
  assert.equal(unica(paginas[0]).items.length, REJILLAS.vertical.procesos)
  assert.equal(unica(paginas[1]).items.length, 1)
})

test('una escena apagada en el panel simplemente no llega, y el guion la respeta', () => {
  // El backend no manda las escenas apagadas: el guion es lo que llegue, en el orden en que llegue.
  const soloDos = {
    area: { id: 7, name: 'Content' },
    scenes: [
      { kind: 'procesos', seconds: 30, items: [], total: 0 },
      { kind: 'portada', seconds: 8, counts: { personas: 3, jornadas_abiertas: 0, cronometros_corriendo: 0, procesos_abiertos: 0, procesos_atrasados: 0, espacios_activos: 0 } }
    ]
  }

  const guion = construirGuion(soloDos, PARAMETROS)

  assert.deepEqual(guion.map((e) => e.id), ['portada'], 'procesos viene vacia y sale; queda la portada')
  assert.equal(guion[0].duracionMs, 8_000, 'con su duracion configurada')
})

test('el margen para el overscan se acota, y por defecto no hay', () => {
  assert.equal(leerParametrosDePantalla({}).margen, 0, 'sin pedirlo no se recorta nada')
  assert.equal(leerParametrosDePantalla({ margen: '3' }).margen, 3)
  assert.equal(leerParametrosDePantalla({ margen: '99' }).margen, 8, 'mas de ocho vmin es desperdiciar pantalla')
  assert.equal(leerParametrosDePantalla({ margen: 'ya' }).margen, 0)
})

// -- La escena `momento`: la tercera forma de entrar al guion ------------------------------------
//
// Ni "siempre" como la portada ni "si tiene items" como las listas: entra si el reloj lo dice. Lo que
// se cuida acá es que salga cuando toca, porque una pared que gasta una escena de cada vuelta en un
// reloj mudo, todo el dia, es una pared que la gente aprende a no mirar.

test('dentro de una franja, `momento` entra al guion con su mensaje en el id', () => {
  const guion = construirGuion(paquete(), PARAMETROS, 'horizontal', franjaA(9, 10))

  assert.deepEqual(guion.map((e) => e.id), ['portada', 'momento#apertura'])
})

test('fuera de toda franja, `momento` no se muestra', () => {
  const guion = construirGuion(paquete(), PARAMETROS, 'horizontal', franjaA(16, 0))

  assert.deepEqual(guion.map((e) => e.id), ['portada'], 'sale igual que una escena vacia')
})

test('sin franja resuelta —todavia no llego `meta`— tampoco se muestra', () => {
  // `construirGuion` sin cuarto argumento es exactamente ese caso: la zona no se sabe.
  assert.deepEqual(construirGuion(paquete(), PARAMETROS).map((e) => e.id), ['portada'])
})

test('cambiar de franja cambia la firma, y por eso la rotacion se entera', () => {
  const manana = construirGuion(paquete(), PARAMETROS, 'horizontal', franjaA(9, 10))
  const mediodia = construirGuion(paquete(), PARAMETROS, 'horizontal', franjaA(13, 30))
  const tarde = construirGuion(paquete(), PARAMETROS, 'horizontal', franjaA(16, 0))

  assert.notEqual(firmaDelGuion(manana), firmaDelGuion(mediodia), 'otro mensaje es otra escena')
  assert.notEqual(firmaDelGuion(manana), firmaDelGuion(tarde), 'y salir del guion, tambien')
})

test('dentro de la MISMA franja la firma no se mueve, aunque pasen los minutos', () => {
  // Si se moviera, cada tic reiniciaria el temporizador y la pantalla se quedaria clavada.
  const antes = construirGuion(paquete(), PARAMETROS, 'horizontal', franjaA(9, 1))
  const despues = construirGuion(paquete(), PARAMETROS, 'horizontal', franjaA(9, 29))

  assert.equal(firmaDelGuion(antes), firmaDelGuion(despues))
})

test('`momento` dura lo que dice la configuracion del area', () => {
  const guion = construirGuion(paquete({ segundos: { momento: 8 } }), PARAMETROS, 'horizontal', franjaA(13, 5))

  assert.equal(guion.find((e) => e.clase === 'momento').duracionMs, 8_000)
})

test('con `?escena=` en la URL, `momento` dura menos: es un titulo, no una lista', () => {
  const rapido = leerParametrosDePantalla({ escena: '10' })
  const guion = construirGuion(paquete({ trabajando: gente(2) }), rapido, 'horizontal', franjaA(18, 10))
  const momento = guion.find((e) => e.clase === 'momento')
  const lista = guion.find((e) => e.clase === 'trabajando')

  assert.equal(momento.duracionMs, 6_000, 'la misma proporcion que la portada')
  assert.equal(lista.duracionMs, 10_000)
})

test('`momento` se puede saltar desde la URL, y la portada no', () => {
  const sinMomento = leerParametrosDePantalla({ saltar: 'momento,portada' })
  const guion = construirGuion(paquete(), sinMomento, 'horizontal', franjaA(9, 10))

  assert.deepEqual(guion.map((e) => e.id), ['portada'], 'momento sale; la portada no se deja saltar')
})

test('con `?solo=momento` fuera de franja el guion NO queda vacio', () => {
  // Es el caso que dejaria un televisor en negro: la unica escena pedida no se puede mostrar.
  const solo = leerParametrosDePantalla({ solo: 'momento' })
  const guion = construirGuion(paquete(), solo, 'horizontal', franjaA(16, 0))

  assert.equal(guion.length, 1)
  assert.equal(guion[0].clase, 'portada', 'la portada de respaldo sostiene el guion')
})

test('la recuperacion por id entiende el `#` de la franja', () => {
  // `proximaEscenaViva` parte el id por `#` para sacar la clase: `momento#almuerzo` es `momento`, y no
  // una clase desconocida que mandaria la pantalla al principio.
  const guion = construirGuion(paquete({ espacios: [{ id: 1, name: 'Uno', deadline: null, progress: 0, procesos_abiertos: 1, procesos_atrasados: 0 }] }), PARAMETROS, 'horizontal', franjaA(13, 5))

  assert.deepEqual(guion.map((e) => e.id), ['portada', 'espacios', 'momento#almuerzo'])
  assert.equal(proximaEscenaViva(guion, 'espacios'), 2, 'despues de espacios viene momento')
  assert.equal(proximaEscenaViva(guion, 'momento#almuerzo'), 0, 'y despues de momento se vuelve al principio')
})

test('las tres franjas del negocio producen tres ids distintos', () => {
  const ids = FRANJAS_DEL_DIA.map((franja) => `momento#${franja.clave}`)

  assert.equal(new Set(ids).size, FRANJAS_DEL_DIA.length, 'ninguna clave repetida')
})

// -- La escena `anuncios`: un aviso por pantalla ------------------------------------------------

test('cada anuncio es una entrada propia del guion', () => {
  const guion = construirGuion(paquete({ anuncios: [anuncio(1), anuncio(2), anuncio(3)] }), PARAMETROS)
  const slides = guion.filter((e) => e.clase === 'anuncios')

  assert.deepEqual(slides.map((e) => e.id), ['anuncios#1', 'anuncios#2', 'anuncios#3'])
  assert.ok(slides.every((e) => unica(e).items.length === 1), 'uno por pantalla, nunca una lista')
})

test('sin anuncios vigentes la escena sale del guion aunque este encendida', () => {
  // Es el caso que dejaria slides en blanco: la API manda `anuncios` con `items: []` igual.
  const guion = construirGuion(paquete(), PARAMETROS)

  assert.ok(!guion.some((e) => e.clase === 'anuncios'))
})

test('un anuncio solo conserva el id sin numero, como cualquier escena de una pagina', () => {
  const guion = construirGuion(paquete({ anuncios: [anuncio(1)] }), PARAMETROS)

  assert.deepEqual(guion.map((e) => e.id), ['portada', 'anuncios'])
})

test('los anuncios tienen su propio tope, mas alto que el de las listas', () => {
  const muchos = Array.from({ length: TOPE_DE_ANUNCIOS + 3 }, (_, i) => anuncio(i + 1))
  const guion = construirGuion(paquete({ anuncios: muchos }), PARAMETROS)
  const slides = guion.filter((e) => e.clase === 'anuncios')

  assert.equal(slides.length, TOPE_DE_ANUNCIOS)
  assert.ok(TOPE_DE_ANUNCIOS > TOPE_DE_PAGINAS, 'cuatro avisos serian pocos para algo que alguien publico a mano')
  assert.equal(unica(slides[slides.length - 1]).ocultos, 3, 'lo que no entro se dice, no se esconde')
})

test('un anuncio dura lo configurado, sin la rebaja de las escenas breves', () => {
  const guion = construirGuion(paquete({ anuncios: [anuncio(1)], segundos: { anuncios: 15 } }), PARAMETROS)

  assert.equal(guion.find((e) => e.clase === 'anuncios').duracionMs, 15_000)
})

test('una vuelta con las siete escenas encendidas mantiene el orden del paquete', () => {
  const lleno = paquete({
    trabajando: gente(2),
    anuncios: [anuncio(1)],
    espacios: [{ id: 1, name: 'Uno', deadline: null, progress: 0, procesos_abiertos: 1, procesos_atrasados: 0 }]
  })

  const guion = construirGuion(lleno, PARAMETROS, 'horizontal', franjaA(9, 10))

  assert.deepEqual(
    guion.map((e) => e.id),
    ['portada', 'trabajando#e0a1', 'espacios', 'momento#apertura', 'anuncios'],
    'el orden lo manda la API, y las vacias no aparecen'
  )
})

// === Las DOS tablas de `trabajando` ===========================================================
//
// La escena dejo de ser una lista y paso a ser dos: la compañia arriba y el area abajo. Lo que se
// cuida aca es lo que no se ve fallar mirando la pared — un reparto de filas que deja a alguien fuera
// del marco sin decirlo, una tabla que desaparece sin que la rotacion se entere, y un "+N mas" que
// cuenta mal cuando las listas se recortan por los dos lados.

/** Las dos tablas de una escena `trabajando`, por su clave. */
function dosTablas (escena) {
  return {
    empresa: tablaDeEscena(escena, TABLA_EMPRESA),
    area: tablaDeEscena(escena, TABLA_AREA)
  }
}

/** Las paginas de `trabajando` de un guion. */
function paginasDeTrabajando (guion) {
  return guion.filter((escena) => escena.clase === 'trabajando')
}

test('con las dos listas llenas se dibujan las dos tablas, cada una con su reparto', () => {
  const guion = construirGuion(
    paquete({ empresa: gente(30, 100), trabajando: gente(5) }),
    PARAMETROS
  )
  const paginas = paginasDeTrabajando(guion)
  const { empresa, area } = dosTablas(paginas[0])

  // El area pide 5 y se los lleva; la compañia se queda con las 19 que sobran de la banda, y como no
  // le alcanzan para sus 30 las reparte en dos paginas parejas de 15.
  assert.equal(area.items.length, 5)
  assert.equal(empresa.items.length, 15)
  assert.equal(empresa.total, 30, 'cada tabla lleva su total real')
  assert.equal(area.total, 5)
})

test('las dos listas caben enteras cuando suman la banda: nadie pagina de mas', () => {
  // El caso exacto que el usuario vio roto: 13 en la compañia y 11 en el area. Con el reparto fijo
  // de antes el area enseñaba 3 de sus 11 en una segunda pagina y dejaba medio televisor vacio.
  const guion = construirGuion(
    paquete({ empresa: gente(13, 100), trabajando: gente(11) }),
    PARAMETROS
  )
  const paginas = paginasDeTrabajando(guion)
  const { empresa, area } = dosTablas(paginas[0])

  assert.equal(paginas.length, 1, 'con 24 personas y una banda de 24 no hay nada que paginar')
  assert.equal(empresa.items.length, 13)
  assert.equal(area.items.length, 11, 'la tabla que dice 11 tiene que enseñar 11')
  assert.equal(area.ocultos, 0)
  assert.equal(empresa.ocultos, 0)
})

test('lo que la compañia no necesita se lo queda el area', () => {
  const guion = construirGuion(
    paquete({ empresa: gente(5, 100), trabajando: gente(19) }),
    PARAMETROS
  )
  const paginas = paginasDeTrabajando(guion)
  const { empresa, area } = dosTablas(paginas[0])

  assert.equal(paginas.length, 1)
  assert.equal(empresa.items.length, 5)
  assert.equal(area.items.length, 19, 'el area no se queda en la mitad de la banda si hay sitio')
})

test('una tabla que pagina reparte sus filas parejo y no deja una pagina a medias', () => {
  // 11 personas con un cupo de 8 daban 8 y 3, y ese bloque de 3 es lo que se lee como una pantalla
  // rota. Repartidas parejo salen 6 y 5.
  const guion = construirGuion(
    paquete({ empresa: gente(20, 100), trabajando: gente(19) }),
    PARAMETROS
  )
  const paginas = paginasDeTrabajando(guion)
  const largos = paginas.map((pagina) => dosTablas(pagina).area.items.length)

  assert.deepEqual(largos, [10, 9])
  assert.ok(
    Math.max(...largos) - Math.min(...largos) <= 1,
    'un bloque que cambia de alto entre paginas se lee como que la pared se rompio'
  )
})

test('las dos listas se solapan a proposito: nadie se deduplica', () => {
  // Las cinco del area son cinco de las treinta de la compañia, con los mismos ids.
  const delArea = gente(5)
  const guion = construirGuion(
    paquete({ empresa: [...delArea, ...gente(25, 50)], trabajando: delArea }),
    PARAMETROS
  )
  const { empresa, area } = dosTablas(paginasDeTrabajando(guion)[0])

  const repetidos = area.items.filter(
    (persona) => empresa.items.some((otra) => otra.staff_id === persona.staff_id)
  )

  assert.equal(repetidos.length, 5, 'quien es del area sale arriba y abajo, y es correcto')
})

test('en la pantalla global se dibuja UNA tabla, y se lleva la banda entera', () => {
  // `area.id` en null: el backend manda `items` vacio, `total` en cero y la compañia completa.
  const global = paquete({ empresa: gente(40, 100), trabajando: [] })
  global.area = { id: null, name: 'WiWO' }

  const paginas = paginasDeTrabajando(construirGuion(global, PARAMETROS))
  const { empresa, area } = dosTablas(paginas[0])

  assert.equal(area, null, 'sin area no hay bloque del area, ni vacio ni en hueco')
  assert.ok(
    empresa.items.length <= REJILLAS.horizontal.trabajando,
    'sin el segundo bloque vuelven su cabecera y sus rotulos: la banda entera es de la compañia'
  )
  // 40 personas en una banda de 28 son dos paginas, y se reparten parejo: 20 y 20.
  assert.equal(empresa.items.length, 20)
  assert.deepEqual(paginas.map((e) => e.id), ['trabajando#e1a0', 'trabajando#e2a0'])
})

test('un area sin nadie trabajando deja solo la tabla de la compañia', () => {
  const guion = construirGuion(paquete({ empresa: gente(10, 100), trabajando: [] }), PARAMETROS)
  const { empresa, area } = dosTablas(paginasDeTrabajando(guion)[0])

  assert.equal(area, null)
  assert.equal(empresa.items.length, 10)
})

test('un paquete SIN bloque `empresa` sigue dibujando el area: la pared no se queda en blanco', () => {
  // Es el backend que todavia no desplego. La pantalla no puede caerse por un campo que falta.
  const viejo = {
    area: { id: 7, name: 'Content' },
    scenes: [{ kind: 'trabajando', seconds: 20, items: gente(4) }]
  }

  const paginas = paginasDeTrabajando(construirGuion(viejo, PARAMETROS))
  const { empresa, area } = dosTablas(paginas[0])

  assert.equal(empresa, null)
  assert.equal(area.items.length, 4)
  assert.deepEqual(paginas.map((e) => e.id), ['trabajando#e0a1'])
})

test('con las dos listas vacias la escena sale del guion', () => {
  const guion = construirGuion(paquete({ empresa: [], trabajando: [] }), PARAMETROS)

  assert.deepEqual(paginasDeTrabajando(guion), [])
})

test('la tabla corta se queda clavada en su ultima pagina en vez de desaparecer', () => {
  // 40 en la compañia son tres paginas de 16; 6 en el area, una sola.
  const guion = construirGuion(
    paquete({ empresa: gente(40, 100), trabajando: gente(6) }),
    PARAMETROS
  )
  const paginas = paginasDeTrabajando(guion)

  assert.deepEqual(
    paginas.map((e) => e.id),
    ['trabajando#e1a1', 'trabajando#e2a1', 'trabajando#e3a1'],
    'la escena tiene tantas paginas como la tabla que mas necesita'
  )

  for (const pagina of paginas) {
    const { empresa, area } = dosTablas(pagina)

    assert.equal(area.items.length, 6, 'el area sigue en pantalla toda la escena')
    assert.ok(empresa.items.length > 0, 'y la compañia va avanzando')
  }

  const primera = dosTablas(paginas[0]).empresa.items[0].staff_id
  const ultima = dosTablas(paginas[2]).empresa.items[0].staff_id

  assert.notEqual(primera, ultima, 'la tabla larga si cambia de gente en cada pagina')
})

test('cada tabla lleva su propio tope de paginas', () => {
  // Con 3 personas en el area, a la compañia le quedan las otras 21 filas de la banda.
  const cupo = BANDA_DE_TRABAJANDO.horizontal - 3
  const cuantos = cupo * TOPE_DE_PAGINAS + 5
  const guion = construirGuion(
    paquete({ empresa: gente(cuantos, 100), trabajando: gente(3) }),
    PARAMETROS
  )
  const paginas = paginasDeTrabajando(guion)

  assert.equal(paginas.length, TOPE_DE_PAGINAS)
  assert.equal(
    dosTablas(paginas[TOPE_DE_PAGINAS - 1]).empresa.ocultos,
    5,
    'lo que no entro se dice, y solo en la ultima pagina de esa tabla'
  )
  assert.equal(dosTablas(paginas[0]).empresa.ocultos, 0)
})

test('el "+N mas" cuenta el recorte del backend y el del paginado, tabla por tabla', () => {
  // La API dice que hay 42 trabajando en la compañia y manda 30: 12 los recorto ella.
  const guion = construirGuion(
    paquete({
      empresa: gente(30, 100), totalDeLaEmpresa: 42,
      trabajando: gente(5), totalDelArea: 5
    }),
    PARAMETROS
  )
  const paginas = paginasDeTrabajando(guion)
  const ultima = dosTablas(paginas[paginas.length - 1])

  // 42 declarados, 30 recibidos y 30 mostrados en dos paginas de 16: los 12 del backend.
  assert.equal(ultima.empresa.ocultos, 12, 'nunca se miente por omision')
  assert.equal(ultima.area.ocultos, 0, 'y la otra tabla cuenta lo suyo, no lo ajeno')
})

test('la firma cambia cuando aparece o desaparece una tabla', () => {
  const soloArea = firmaDelGuion(construirGuion(paquete({ trabajando: gente(5) }), PARAMETROS))
  const lasDos = firmaDelGuion(construirGuion(
    paquete({ empresa: gente(10, 100), trabajando: gente(5) }), PARAMETROS
  ))
  const soloEmpresa = firmaDelGuion(construirGuion(
    paquete({ empresa: gente(10, 100), trabajando: [] }), PARAMETROS
  ))

  assert.notEqual(soloArea, lasDos, 'si no cambiara, la pantalla se quedaria clavada')
  assert.notEqual(soloEmpresa, lasDos)
  assert.notEqual(soloArea, soloEmpresa)
})

test('la firma NO cambia porque entre o salga una persona que cabe en la pagina que ya habia', () => {
  const antes = firmaDelGuion(construirGuion(
    paquete({ empresa: gente(10, 100), trabajando: gente(5) }), PARAMETROS
  ))
  const despues = firmaDelGuion(construirGuion(
    paquete({ empresa: gente(11, 100), trabajando: gente(6) }), PARAMETROS
  ))

  assert.equal(antes, despues, 'si cambiara, la pantalla saltaria a mitad de escena')
})

test('la firma SI cambia cuando una tabla gana una pagina', () => {
  const cabe = BANDA_DE_TRABAJANDO.horizontal - 4
  const antes = firmaDelGuion(construirGuion(
    paquete({ empresa: gente(cabe, 100), trabajando: gente(4) }), PARAMETROS
  ))
  const despues = firmaDelGuion(construirGuion(
    paquete({ empresa: gente(cabe + 1, 100), trabajando: gente(4) }), PARAMETROS
  ))

  assert.notEqual(antes, despues)
})

test('la banda de dos tablas deja sitio para la cabecera y los rotulos del segundo bloque', () => {
  for (const orientacion of ['horizontal', 'vertical']) {
    const juntas = BANDA_DE_TRABAJANDO[orientacion]
    const banda = REJILLAS[orientacion].trabajando
    // Tumbada la escena va a dos columnas, asi que cada renglon visual son DOS personas.
    const porRenglon = orientacion === 'horizontal' ? 2 : 1
    const renglonesDeMas = (banda - juntas) / porRenglon

    assert.ok(
      renglonesDeMas >= 2,
      `${orientacion}: el segundo bloque cuesta ~2 renglones y la banda solo deja ${renglonesDeMas}`
    )
  }
})

test('las dos tablas juntas nunca reservan mas filas que la banda', () => {
  for (const orientacion of ['horizontal', 'vertical']) {
    const juntas = BANDA_DE_TRABAJANDO[orientacion]

    for (const [cuantosEmpresa, cuantosArea] of [[13, 11], [40, 8], [5, 19], [30, 2], [42, 20]]) {
      const guion = construirGuion(
        paquete({ empresa: gente(cuantosEmpresa, 100), trabajando: gente(cuantosArea) }),
        PARAMETROS,
        orientacion
      )
      const { empresa, area } = dosTablas(paginasDeTrabajando(guion)[0])

      assert.ok(
        empresa.items.length + area.items.length <= juntas,
        `${orientacion} ${cuantosEmpresa}/${cuantosArea}: se reservaron mas filas que la banda`
      )
    }
  }
})

test('cada orientacion reparte las dos tablas con su propia banda', () => {
  const relleno = { empresa: gente(40, 100), trabajando: gente(20) }
  const tumbado = construirGuion(paquete(relleno), PARAMETROS, 'horizontal')
  const dePie = construirGuion(paquete(relleno), PARAMETROS, 'vertical')

  assert.ok(
    dosTablas(paginasDeTrabajando(dePie)[0]).empresa.items.length >
    dosTablas(paginasDeTrabajando(tumbado)[0]).empresa.items.length,
    'de pie caben mas filas, asi que la compañia se lleva mas'
  )
})

// === La continuidad: que se remonta y que no ==================================================

test('dos paginas del mismo tablero comparten continuidad: el marco no se remonta', () => {
  const guion = construirGuion(
    paquete({ empresa: gente(40, 100), trabajando: gente(6) }),
    PARAMETROS
  )
  const paginas = paginasDeTrabajando(guion)

  assert.ok(paginas.length > 1)
  assert.equal(
    new Set(paginas.map((e) => e.continuidad)).size,
    1,
    'si se remontara, el cambio de pagina se veria como un cambio de vista'
  )
  assert.ok(
    new Set(paginas.map((e) => e.id)).size > 1,
    'y aun asi cada pagina es una entrada propia del guion'
  )
})

test('dos anuncios NO comparten continuidad: son dos laminas y se funden', () => {
  const guion = construirGuion(paquete({ anuncios: [anuncio(1), anuncio(2)] }), PARAMETROS)
  const slides = guion.filter((e) => e.clase === 'anuncios')

  assert.equal(slides.length, 2)
  assert.notEqual(slides[0].continuidad, slides[1].continuidad)
})

test('cada clase de tablero tiene su propia continuidad', () => {
  const guion = construirGuion(
    paquete({ trabajando: gente(3), cronometros: gente(3) }),
    PARAMETROS
  )
  const tableros = guion.filter((e) => e.clase === 'trabajando' || e.clase === 'cronometros')

  assert.equal(new Set(tableros.map((e) => e.continuidad)).size, 2)
})

// === La fase: el juego de campos que se alterna ================================================

test('la fase alterna con el reloj y siempre vale 0 o 1', () => {
  assert.equal(faseDeDato(0), 0)
  assert.equal(faseDeDato(PERIODO_DE_DATO_MS - 1), 0)
  assert.equal(faseDeDato(PERIODO_DE_DATO_MS), 1)
  assert.equal(faseDeDato(PERIODO_DE_DATO_MS * 2), 0)
  assert.equal(faseDeDato(PERIODO_DE_DATO_MS * 3 + 10), 1)
})

test('sin reloj —antes de hidratar— se muestra el juego principal', () => {
  assert.equal(faseDeDato(null), 0)
  assert.equal(faseDeDato(Number.NaN), 0)
  assert.equal(faseDeDato(-5000), 0, 'un reloj imposible no puede dejar la fase en negativo')
  assert.equal(faseDeDato(1234, 0), 0, 'ni un periodo en cero puede dividir por cero')
})

test('la fase es la MISMA para toda la pared: no la decide cada escena', () => {
  // Sale del reloj de pared y no de cuanto lleva la escena, asi que dos escenas distintas miradas en
  // el mismo instante alternan a la vez, como un panel de aeropuerto de verdad.
  const instante = Date.parse('2026-09-15T09:00:03-03:00')

  assert.equal(faseDeDato(instante), faseDeDato(instante))
})
