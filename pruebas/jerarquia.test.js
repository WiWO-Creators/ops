/**
 * Pruebas del árbol de áreas.
 *
 * Se prueban acá y no en el navegador porque son las tres cosas que se rompen en silencio: el
 * anidado (un área mal colgada se ve como raíz y nadie nota que perdió su lugar), el `alcance` (que
 * es el número por el que existe la pantalla: a cuánta gente ve quien dirige un área) y la lista de
 * superiores elegibles, que es lo único que impide ofrecer un ciclo que la API va a rechazar.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aplanarArbol,
  areasElegiblesComoSuperior,
  areasSinJefatura,
  construirArbol,
  cuantosEn,
  descendenciaDe,
  loQueRetieneElArea
} from '../src/dominio/jerarquia.ts'

/**
 * Un área con la forma que sirve `GET /jerarquia`.
 *
 * @param id id del área
 * @param name nombre
 * @param superior de qué área cuelga, o `null` si es raíz
 * @param jefe staffid de quien la dirige, o `null`
 * @param nombres la gente propia del área, por nombre
 */
function area (id, name, superior, jefe, nombres = []) {
  return {
    id,
    name,
    area_superior_id: superior,
    jefe_staffid: jefe,
    editable: true,
    en_tareas: true,
    personas: nombres.map((full_name, i) => ({ id: id * 100 + i, full_name, active: true }))
  }
}

/**
 * El caso real que la pantalla existe para resolver.
 *
 * Polo arriba de todo; debajo Alberto; debajo Franz; y colgando de Franz dos equipos hermanos, uno
 * de Tomás con tres personas y otro de Juan Luis con cuatro. Franz tiene que ver a los nueve.
 */
const ARBOL_REAL = [
  area(1, 'Dirección', null, 10, ['Polo']),
  area(2, 'Gerencia', 1, 11, ['Alberto']),
  area(3, 'Operaciones', 2, 12, ['Franz']),
  area(4, 'Analytics', 3, 13, ['Juan Luis', 'JL 1', 'JL 2', 'JL 3', 'JL 4']),
  area(5, 'Producción', 3, 14, ['Tomás', 'T 1', 'T 2', 'T 3'])
]

/** El nodo de un área por nombre, buscando en el árbol ya aplanado. */
function nodo (raices, nombre) {
  const encontrado = aplanarArbol(raices).find((n) => n.area.name === nombre)

  assert.ok(encontrado !== undefined, `no se encontró el área "${nombre}"`)

  return encontrado
}

test('anida cada área bajo la suya y deja una sola raíz', () => {
  const raices = construirArbol(ARBOL_REAL)

  assert.equal(raices.length, 1)
  assert.equal(raices[0].area.name, 'Dirección')
  assert.equal(nodo(raices, 'Operaciones').hijas.length, 2)
  assert.equal(nodo(raices, 'Analytics').hijas.length, 0)
})

test('el nivel indenta según la profundidad', () => {
  const raices = construirArbol(ARBOL_REAL)

  assert.equal(nodo(raices, 'Dirección').nivel, 0)
  assert.equal(nodo(raices, 'Gerencia').nivel, 1)
  assert.equal(nodo(raices, 'Operaciones').nivel, 2)
  assert.equal(nodo(raices, 'Analytics').nivel, 3)
})

test('el alcance suma la gente de las áreas que cuelgan', () => {
  const raices = construirArbol(ARBOL_REAL)

  // Franz dirige Operaciones. El alcance cuenta a la persona dentro de su propia área, así que son
  // los nueve que ve —Tomás con sus tres y Juan Luis con sus cuatro— más él mismo.
  assert.equal(nodo(raices, 'Operaciones').alcance, 10)
  // Tomás ve a sus tres, y también se cuenta.
  assert.equal(nodo(raices, 'Producción').alcance, 4)
  // Y el `cuantos` de cada una sigue siendo el suyo propio, sin las hijas.
  assert.equal(cuantosEn(nodo(raices, 'Operaciones').area), 1)
})

test('una hoja sin gente tiene alcance cero: quien la dirige se ve solo a sí mismo', () => {
  const raices = construirArbol([
    area(1, 'Suelta', null, null)
  ])

  assert.equal(raices[0].alcance, 0)
})

test('las hermanas salen ordenadas por nombre, no por id', () => {
  const raices = construirArbol(ARBOL_REAL)

  assert.deepEqual(nodo(raices, 'Operaciones').hijas.map((h) => h.area.name), ['Analytics', 'Producción'])
})

test('un área cuyo superior no vino en el listado se dibuja como raíz, no se pierde', () => {
  const raices = construirArbol([
    area(1, 'Presente', null, null, ['Una', 'Otra']),
    area(9, 'Huérfana', 404, null, ['Sola'])
  ])

  assert.equal(raices.length, 2)
  assert.equal(nodo(raices, 'Huérfana').nivel, 0)
})

test('un ciclo en los datos no cuelga el recorrido', () => {
  // A cuelga de B y B de A: imposible de dibujar anidado, pero las dos áreas existen y su gente
  // también, así que las dos tienen que aparecer.
  const raices = construirArbol([
    area(1, 'A', 2, null, ['Alguien']),
    area(2, 'B', 1, null, ['Otro'])
  ])

  assert.equal(aplanarArbol(raices).length, 2)
})

test('la lista vacía no es un error: da un árbol vacío', () => {
  assert.deepEqual(construirArbol([]), [])
  assert.deepEqual(aplanarArbol([]), [])
})

test('la descendencia incluye al área misma y baja hasta el fondo', () => {
  assert.deepEqual([...descendenciaDe(ARBOL_REAL, 3)].sort(), [3, 4, 5])
  assert.deepEqual([...descendenciaDe(ARBOL_REAL, 4)], [4])
  assert.deepEqual([...descendenciaDe(ARBOL_REAL, 1)].sort(), [1, 2, 3, 4, 5])
})

test('el selector de superior no ofrece el área ni nada que cuelgue de ella', () => {
  const nombres = areasElegiblesComoSuperior(ARBOL_REAL, 3).map((n) => n.area.name)

  assert.deepEqual(nombres, ['Dirección', 'Gerencia'])
})

test('en un alta todas las áreas sirven como superior', () => {
  assert.equal(areasElegiblesComoSuperior(ARBOL_REAL, null).length, ARBOL_REAL.length)
})

test('nombra lo que ya se ve que retiene a un área, y calla cuando no se ve nada', () => {
  const raices = construirArbol(ARBOL_REAL)

  assert.equal(loQueRetieneElArea(nodo(raices, 'Analytics')), '5 personas asignadas')
  assert.equal(
    loQueRetieneElArea(nodo(raices, 'Operaciones')),
    '1 persona asignada y 2 áreas que cuelgan de ella'
  )

  // Sin gente ni hijas no hay nada que la pantalla pueda anticipar. Que devuelva `null` NO significa
  // que se pueda borrar: los Procesos marcados con ese nombre solo los conoce la API.
  const vacia = construirArbol([area(7, 'Recién creada', null, null)])
  assert.equal(loQueRetieneElArea(vacia[0]), null)
})

test('una rama que llega sola conserva su anidado: solo se corta el eslabón que falta', () => {
  // Es el caso de CUALQUIERA que no administre: la API le manda solo su rama, y la raíz de esa rama
  // cuelga de un área que no le llegó. Si se aplanara la cadena entera, una jefatura vería su
  // organigrama sin niveles y sin el "ve a N con lo que cuelga", que es para lo que entra.
  const raices = construirArbol([area(2, 'Creatividad', 1, 11), area(3, 'Analytics', 2, 12)])

  assert.deepEqual(raices.map((raiz) => raiz.area.name), ['Creatividad'])
  assert.equal(nodo(raices, 'Analytics').nivel, 1)
})

test('un área que dice colgar de sí misma se dibuja como raíz', () => {
  // Si se la colgara de sí misma, `aplanarArbol` bajaría por ella para siempre.
  const raices = construirArbol([{ ...area(1, 'Sola', null, null), area_superior_id: 1 }])

  assert.equal(raices.length, 1)
  assert.equal(raices[0].hijas.length, 0)
})

test('un ciclo corta solo a los suyos: lo que cuelga por debajo conserva su lugar', () => {
  const raices = construirArbol([
    area(1, 'A', 2, null),
    area(2, 'B', 1, null),
    area(3, 'C', 2, null)
  ])

  // A y B están en el ciclo y van a la raíz; C no tiene la culpa y sigue colgando de B.
  assert.deepEqual(raices.map((raiz) => raiz.area.name).sort(), ['A', 'B'])
  assert.deepEqual(nodo(raices, 'B').hijas.map((hija) => hija.area.name), ['C'])
})

test('varias raíces legítimas conviven: el árbol es un bosque', () => {
  const raices = construirArbol([area(1, 'Una', null, null), area(9, 'Otra', null, null)])

  assert.deepEqual(raices.map((raiz) => raiz.area.name), ['Otra', 'Una'])
})

test('un ciclo tampoco cuelga el cálculo de la descendencia', () => {
  assert.deepEqual([...descendenciaDe([area(1, 'A', 2, null), area(2, 'B', 1, null)], 1)].sort(), [1, 2])
})

test('las bajas no se cuentan: siguen colgadas del área pero ya no trabajan', () => {
  const conBaja = {
    ...area(1, 'Con una baja', null, null, ['Activa']),
    personas: [
      { id: 1, full_name: 'Activa', active: true },
      { id: 2, full_name: 'Dada de baja', active: false }
    ]
  }

  // La persona sigue en la lista —hay que poder verla y sacarla— pero no infla el número.
  assert.equal(conBaja.personas.length, 2)
  assert.equal(cuantosEn(conBaja), 1)
  assert.equal(construirArbol([conBaja])[0].alcance, 1)
  assert.equal(loQueRetieneElArea(construirArbol([conBaja])[0]), '1 persona asignada')
})

test('cuenta las áreas que todavía no tienen quién las dirija', () => {
  assert.equal(areasSinJefatura(ARBOL_REAL), 0)
  assert.equal(areasSinJefatura([area(1, 'Huérfana', null, null), area(2, 'Con jefe', null, 5)]), 1)
})
