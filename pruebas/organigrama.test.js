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
  jefesElegibles
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
