/**
 * La lógica del organigrama: el árbol de un área, los jefes que se pueden ofrecer y el color.
 *
 * Lo que se prueba acá es lo que mirando la pantalla no se nota hasta que falla: un árbol al que le
 * falta una rama parece un área chica, y un selector que ofrece a un subordinado propio termina en
 * un 422 que nadie se explica.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  arbolDelArea, areasDelMapa, colorDeArea, cuantasCajas, cuantosSinArea, descendenciaDe,
  candidatasParaArea, filasDeLista, filtrarFilas, jefesElegibles, nombreDeArea, ordenarFilas,
  partirAreasPorPoblacion, personasDelArbol, personasDelArea, resumirMapa
} from '../src/dominio/organigrama.ts'

/** Una persona del organigrama con lo mínimo, para no repetir seis campos en cada caso. */
function persona (staffid, nombre, jefe, area, escalon = 'staff') {
  return {
    staffid,
    nombre,
    correo: `${nombre.toLowerCase()}@wiwo.me`,
    avatar: null,
    escalon,
    jefe_staffid: jefe,
    area_id: area,
    activo: true
  }
}

/**
 * Un organigrama chico pero con los cuatro casos que importan:
 *
 *   - Ana (área 1) conduce a Bruno (área 1) y a Carla (área 2): una rama que SALE del área 1;
 *   - Diego (área 2) cuelga de Bruno, que es de otra área: una caja de área 2 con jefe de área 1;
 *   - Elena no tiene área;
 *   - el área 3 no tiene a nadie.
 */
const PERSONAS = [
  persona(1, 'Ana', null, 1, 'gerencia'),
  persona(2, 'Bruno', 1, 1, 'lead'),
  persona(3, 'Carla', 1, 2, 'lead'),
  persona(4, 'Diego', 2, 2),
  persona(5, 'Elena', null, null)
]

const ORGANIGRAMA = {
  yo: { staffid: 3, puede_editar: true, areas: [2] },
  areas: [
    { id: 1, nombre: 'Wiwo', area_superior_id: null, jefe_staffid: 1, personas: 2, leads: 1 },
    { id: 2, nombre: 'Analytics', area_superior_id: 1, jefe_staffid: 3, personas: 2, leads: 1 },
    { id: 3, nombre: 'Retail', area_superior_id: null, jefe_staffid: null, personas: 0, leads: 0 }
  ],
  personas: PERSONAS
}

test('el árbol de un área arrastra las ramas que salen de ella', () => {
  const raices = arbolDelArea(PERSONAS, 1)

  assert.equal(raices.length, 1)
  assert.equal(raices[0].persona.nombre, 'Ana')
  // Carla es de otra área pero cuelga de Ana: cortar ahí dibujaría a Ana conduciendo a una sola
  // persona cuando conduce a dos.
  assert.deepEqual(raices[0].hijos.map((n) => n.persona.nombre), ['Bruno', 'Carla'])
  // Diego es de otra área y cuelga de Bruno: la rama sigue hasta el final en vez de cortarse en el
  // borde del área, que dejaría a Bruno dibujado como hoja cuando conduce a alguien.
  assert.deepEqual(raices[0].hijos[0].hijos.map((n) => n.persona.nombre), ['Diego'])
  assert.equal(cuantasCajas(raices), 4)
})

test('quien es de otra área queda marcado como ajeno, y quien es del área no', () => {
  const raices = arbolDelArea(PERSONAS, 1)

  assert.equal(raices[0].ajeno, false)
  assert.equal(raices[0].hijos[0].ajeno, false)
  assert.equal(raices[0].hijos[1].ajeno, true)
})

test('el jefe de otra área aparece como enganche, con su propio color', () => {
  const raices = arbolDelArea(PERSONAS, 2)

  // Carla y Diego son del área 2 pero ninguno tiene jefe adentro: sin los enganches se dibujarían
  // como dos raíces sueltas y no se vería que reportan fuera del área.
  assert.equal(raices.length, 1)
  assert.equal(raices[0].persona.nombre, 'Ana')
  assert.equal(raices[0].ajeno, true)
  assert.deepEqual(raices[0].hijos.map((n) => n.persona.nombre), ['Bruno', 'Carla'])
  assert.equal(raices[0].hijos[0].ajeno, true)
  assert.equal(raices[0].hijos[1].ajeno, false)
  assert.deepEqual(raices[0].hijos[0].hijos.map((n) => n.persona.nombre), ['Diego'])
  assert.notEqual(colorDeArea(1), colorDeArea(2))
})

test('"Sin área" es un destino más y se arma con las mismas reglas', () => {
  const raices = arbolDelArea(PERSONAS, null)

  assert.deepEqual(raices.map((n) => n.persona.nombre), ['Elena'])
  assert.equal(raices[0].ajeno, false)
  assert.equal(cuantosSinArea(ORGANIGRAMA), 1)
})

test('un área sin nadie devuelve un árbol vacío en vez de romperse', () => {
  assert.deepEqual(arbolDelArea(PERSONAS, 3), [])
  assert.equal(cuantasCajas([]), 0)
})

test('la descendencia sube por toda la cadena, no sólo un salto', () => {
  assert.deepEqual([...descendenciaDe(PERSONAS, 1)].sort(), [2, 3, 4])
  assert.deepEqual([...descendenciaDe(PERSONAS, 2)], [4])
  assert.deepEqual([...descendenciaDe(PERSONAS, 4)], [])
})

test('no se ofrece como jefe a nadie de la propia descendencia', () => {
  const candidatos = jefesElegibles(PERSONAS, 1).map((p) => p.nombre)

  // Ana no puede colgar de Bruno, ni de Carla, ni de Diego: sería el ciclo que la API rechaza.
  assert.deepEqual(candidatos, ['Elena'])
  assert.deepEqual(jefesElegibles(PERSONAS, 4).map((p) => p.nombre), ['Ana', 'Bruno', 'Carla', 'Elena'])
})

test('un ciclo ya guardado se promueve a raíz en vez de desaparecer del dibujo', () => {
  // Ana cuelga de Bruno y Bruno de Ana: sin la guarda, ninguno sería raíz y el área se vería vacía.
  const ciclado = [persona(1, 'Ana', 2, 9), persona(2, 'Bruno', 1, 9)]
  const raices = arbolDelArea(ciclado, 9)

  assert.equal(cuantasCajas(raices), 2)
  assert.deepEqual(raices.map((n) => n.persona.nombre).sort(), ['Ana', 'Bruno'])
})

test('el mapa pone primero las áreas propias y después ordena por nombre', () => {
  assert.deepEqual(areasDelMapa(ORGANIGRAMA).map((a) => a.nombre), ['Analytics', 'Retail', 'Wiwo'])
})

test('el color de un área depende de su id y no de la lista: entrar como otra persona no lo repinta', () => {
  assert.equal(colorDeArea(1), colorDeArea(1))
  assert.match(colorDeArea(7), /^var\(--grafico-[1-8]\)$/)
})

test('los colores son los tokens CRUDOS, que son los únicos que existen en :root', () => {
  // El tema de Tailwind es `@theme inline`: resuelve los valores dentro de cada utilidad y NO
  // publica los `--color-*` como variables. Un `var(--color-grafico-4)` en un `style` no resuelve a
  // nada, el borde cae al color heredado y todas las cajas quedan iguales, sin un solo error.
  const css = readFileSync(new URL('../src/estilos/neo-tokens.css', import.meta.url), 'utf8') +
    readFileSync(new URL('../src/estilos/neo.css', import.meta.url), 'utf8')

  for (const id of [null, 1, 2, 3, 4, 5, 6, 7, 8, 17]) {
    const token = colorDeArea(id).slice('var('.length, -1)

    assert.ok(css.includes(`${token}:`), `${token} tiene que estar definido en los estilos`)
  }
})

// --- La vista de lista ------------------------------------------------------
//
// Es la otra lectura de los MISMOS datos, así que lo que se prueba acá es que no invente un
// conjunto propio: una lista que muestra más o menos gente que el árbol del que salió convierte el
// conmutador en dos pantallas que se contradicen.

/** Las personas indexadas como las pasa el componente. */
const POR_ID = new Map(PERSONAS.map((una) => [una.staffid, una]))

test('la lista de un área trae exactamente las cajas que dibuja su árbol', () => {
  const raices = arbolDelArea(PERSONAS, 1)

  assert.equal(personasDelArbol(raices).length, cuantasCajas(raices))
  assert.deepEqual(
    personasDelArbol(raices).map((una) => una.nombre).sort(),
    ['Ana', 'Bruno', 'Carla', 'Diego']
  )
})

test('cada fila resuelve el jefe y el área a texto', () => {
  const filas = filasDeLista(PERSONAS, POR_ID, ORGANIGRAMA.areas)

  assert.deepEqual(filas.map((fila) => `${fila.persona.nombre}: ${fila.jefe} / ${fila.area}`), [
    'Ana: — / Wiwo',
    'Bruno: Ana / Wiwo',
    'Carla: Ana / Analytics',
    'Diego: Bruno / Analytics',
    'Elena: — / Sin área'
  ])
})

test('un jefe o un área que la API no mandó se nombran por id y no dejan la celda en blanco', () => {
  // Una celda vacía se leería como "no tiene jefe", que es justo lo contrario de lo que pasa.
  const suelta = [persona(9, 'Nuria', 77, 88)]
  const [fila] = filasDeLista(suelta, new Map(), ORGANIGRAMA.areas)

  assert.equal(fila.jefe, 'Persona #77')
  assert.equal(fila.area, 'Área #88')
  assert.equal(nombreDeArea(ORGANIGRAMA.areas, null), 'Sin área')
  assert.equal(nombreDeArea(ORGANIGRAMA.areas, 2), 'Analytics')
})

test('el buscador encuentra por nombre, por correo y sin acentos', () => {
  const gente = [persona(1, 'Ana Ríos', null, 1), persona(2, 'Bruno Paz', null, 1)]
  const filas = filasDeLista(gente, new Map(gente.map((u) => [u.staffid, u])), ORGANIGRAMA.areas)
  const nombres = (consulta) => filtrarFilas(filas, consulta).map((fila) => fila.persona.nombre)

  assert.deepEqual(nombres('rios'), ['Ana Ríos'], 'sin tildes tiene que encontrar igual')
  assert.deepEqual(nombres('rios ana'), ['Ana Ríos'], 'el orden de las partes no puede importar')
  assert.deepEqual(nombres('bruno paz@wiwo.me'), ['Bruno Paz'], 'el correo también busca')
  assert.deepEqual(nombres('   '), nombres(''), 'sólo espacios es una búsqueda vacía')
  assert.equal(filtrarFilas(filas, '').length, 2)
  assert.deepEqual(nombres('zeta'), [])
})

test('el orden por escalón sigue la escalera y no el alfabeto', () => {
  const filas = filasDeLista(PERSONAS, POR_ID, ORGANIGRAMA.areas)

  // Alfabéticamente "Director" iría antes que "Lead" y que "Staff": una columna de jerarquía
  // ordenada al azar no informa nada.
  assert.deepEqual(
    ordenarFilas(filas, 'escalon', 'asc').map((fila) => fila.persona.escalon),
    ['staff', 'staff', 'lead', 'lead', 'gerencia']
  )
  assert.equal(ordenarFilas(filas, 'escalon', 'desc')[0].persona.escalon, 'gerencia')
})

test('el orden por nombre y por área se da vuelta, y no toca las filas que recibió', () => {
  const filas = filasDeLista(PERSONAS, POR_ID, ORGANIGRAMA.areas)
  const antes = filas.map((fila) => fila.persona.nombre)

  assert.deepEqual(
    ordenarFilas(filas, 'persona', 'asc').map((fila) => fila.persona.nombre),
    ['Ana', 'Bruno', 'Carla', 'Diego', 'Elena']
  )
  assert.deepEqual(
    ordenarFilas(filas, 'persona', 'desc').map((fila) => fila.persona.nombre),
    ['Elena', 'Diego', 'Carla', 'Bruno', 'Ana']
  )
  // Empatados en área se ordenan por nombre: sin eso, dos repintados seguidos barajan las filas.
  assert.deepEqual(
    ordenarFilas(filas, 'area', 'asc').map((fila) => `${fila.area}/${fila.persona.nombre}`),
    ['Analytics/Carla', 'Analytics/Diego', 'Sin área/Elena', 'Wiwo/Ana', 'Wiwo/Bruno']
  )
  assert.deepEqual(filas.map((fila) => fila.persona.nombre), antes, 'ordenar no muta la entrada')
})

test('el mapa parte las áreas con gente de las que no tienen a nadie', () => {
  const { pobladas, vacias } = partirAreasPorPoblacion(areasDelMapa(ORGANIGRAMA))

  // Las pobladas van de la más grande a la más chica: es el orden en que se busca a alguien. Empate
  // en dos, así que manda el nombre.
  assert.deepEqual(pobladas.map((una) => una.nombre), ['Analytics', 'Wiwo'])
  assert.deepEqual(vacias.map((una) => una.nombre), ['Retail'])
})

test('un área propia vacía se queda entre las vacías', () => {
  // Subirla al primer bloque diría que ahí hay alguien, y no lo hay. Que sea propia se dice con la
  // insignia, no con el lugar.
  const propiaVacia = { ...ORGANIGRAMA, yo: { ...ORGANIGRAMA.yo, areas: [3] } }
  const { pobladas, vacias } = partirAreasPorPoblacion(areasDelMapa(propiaVacia))

  assert.deepEqual(vacias.map((una) => una.id), [3])
  assert.equal(pobladas.some((una) => una.id === 3), false)
})

test('el resumen del mapa no cuenta como "sin jefatura" a un área vacía', () => {
  const resumen = resumirMapa(ORGANIGRAMA)

  assert.equal(resumen.personas, 5)
  assert.equal(resumen.areasConGente, 2)
  assert.equal(resumen.areasVacias, 1)
  assert.equal(resumen.sinArea, 1)
  // Retail no tiene jefatura, pero tampoco tiene a quién dirigir: contarla inflaría el número que se
  // mira para saber qué falta arreglar.
  assert.equal(resumen.sinJefatura, 0)
})

test('el resumen marca el área con gente que se quedó sin jefatura', () => {
  const huerfana = {
    ...ORGANIGRAMA,
    areas: ORGANIGRAMA.areas.map((una) => una.id === 1 ? { ...una, jefe_staffid: null } : una)
  }

  assert.equal(resumirMapa(huerfana).sinJefatura, 1)
})

test('las caras de un área salen con la jefatura primero', () => {
  // Ana es gerencia y Bruno lead: la cara que sirve para reconocer el área va antes.
  assert.deepEqual(personasDelArea(PERSONAS, 1).map((una) => una.nombre), ['Ana', 'Bruno'])
  assert.deepEqual(personasDelArea(PERSONAS, null).map((una) => una.nombre), ['Elena'])
  assert.deepEqual(personasDelArea(PERSONAS, 3), [])
})

test('las candidatas a un área son todas menos las que ya están, y las sin área van primero', () => {
  const candidatas = candidatasParaArea(PERSONAS, 1, '')

  // Ana y Bruno ya son del área 1: agregarlos sería un cambio que no cambia nada.
  assert.deepEqual(candidatas.map((una) => una.nombre), ['Elena', 'Carla', 'Diego'])
})

test('el buscador de candidatas encuentra por correo y sin acentos', () => {
  assert.deepEqual(candidatasParaArea(PERSONAS, 1, 'ELENA@').map((una) => una.nombre), ['Elena'])
  assert.deepEqual(candidatasParaArea(PERSONAS, 2, 'bruno').map((una) => una.nombre), ['Bruno'])
  assert.deepEqual(candidatasParaArea(PERSONAS, 1, 'nadie').map((una) => una.nombre), [])
})

test('poblar "Sin área" ofrece a quien tiene área y no a quien ya está suelto', () => {
  // Elena no aparece: ya no tiene área, y mandarla ahí no la movería a ningún lado.
  const candidatas = candidatasParaArea(PERSONAS, null, '')

  assert.equal(candidatas.some((una) => una.nombre === 'Elena'), false)
  assert.equal(candidatas.length, 4)
})

test('candidatasParaArea no toca el arreglo de entrada', () => {
  const antes = PERSONAS.map((una) => una.nombre)

  candidatasParaArea(PERSONAS, 1, '')

  assert.deepEqual(PERSONAS.map((una) => una.nombre), antes)
})
