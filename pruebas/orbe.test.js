/**
 * El contrato del orbe: lo que `Orbe.tsx` promete y `thinking-orb.css` tiene que cumplir.
 *
 * El CSS del orbe no se escribe a mano —lo genera `herramientas/construir-orbe-css.mjs` a partir del
 * extraido de https://neo.wiwo.me—, asi que las dos piezas pueden separarse sin que nadie lo note:
 * alguien agrega un estado en el componente, o regenera la hoja desde otro CSS, y el orbe queda
 * mudo. Estas pruebas son el punto donde eso falla temprano.
 *
 * No dibujan nada: no hay navegador. Lo que se verifica es el contrato —nombres de estado, clases de
 * tamaño, estructura del markup y las dos reglas duras del proyecto—, que es justamente lo que una
 * captura de pantalla no ve.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')

const css = leer('../src/estilos/thinking-orb.css')
const componente = leer('../src/componentes/estado/Orbe.tsx')
const estados = leer('../src/componentes/estado/Estados.tsx')

/** Los comentarios del proyecto nombran lo que esta prohibido para explicar por que: hay que sacarlos. */
const sinComentarios = (fuente) => fuente.replace(/\/\*[\s\S]*?\*\//g, '')

/** Los siete estados de neo, que son los que declara `EstadoOrbe`. */
const ESTADOS = ['idle', 'listening', 'thinking', 'generating', 'routing', 'success', 'error']

/** Los cuatro tamaños discretos, en las clases que los fijan. */
const TAMANOS = ['orbe-chico', 'orbe-medio', 'orbe-grande', 'orbe-marca']

test('los siete estados del componente tienen reglas en la hoja', () => {
  const declarados = [...componente.matchAll(/^\s*\|\s*'([a-z]+)'$/gm)].map(([, estado]) => estado)

  assert.deepEqual(declarados, ESTADOS, 'EstadoOrbe dejo de ser los siete estados de neo')

  for (const estado of ESTADOS) {
    assert.ok(
      css.includes(`[data-thinking-state="${estado}"]`),
      `el estado "${estado}" no tiene ninguna regla: se veria igual que el reposo`
    )
  }
})

test('el estado viaja en el contenedor, no en el orbe', () => {
  // Todo el CSS de neo se escribe como `.orbe-wiwo[data-thinking-state="x"] .wiwo-thinking-orb`. Si
  // el atributo se pusiera sobre el orbe, no matchearia ni una sola regla de estado.
  assert.match(
    componente,
    /className={cn\('orbe-wiwo'[\s\S]{0,400}?<span className="orbe-escenario">/,
    'el contenedor `.orbe-wiwo` dejo de ser el que envuelve al escenario'
  )
  assert.match(componente, /data-thinking-state={estado}[\s\S]{0,200}?'orbe-wiwo'/,
    'el atributo de estado tiene que ir en el contenedor `.orbe-wiwo`')
  assert.ok(
    !/data-orb-state/.test(componente),
    '`data-orb-state` era el selector manual del showcase de neo y no lo lee ninguna regla'
  )
})

test('las particulas y los destellos son hermanas del orbe, no hijas', () => {
  // Dentro de `.wiwo-thinking-orb` se recortan: el orbe tiene su propio radio y sus capas heredan el
  // `border-radius`, asi que una particula que orbita por fuera desaparece.
  const orbe = componente.slice(
    componente.indexOf('<span className="wiwo-thinking-orb">'),
    componente.indexOf('</span>\n\n        <span className="orb-particle')
  )

  assert.ok(orbe.length > 0, 'las particulas dejaron de venir despues de cerrar el orbe')
  assert.ok(!orbe.includes('orb-particle'), 'una particula quedo dentro del orbe: se va a recortar')
  assert.ok(!orbe.includes('orb-spark'), 'un destello quedo dentro del orbe: se va a recortar')
})

test('cada tamaño fija el ancho, y de ahi sale todo lo demas', () => {
  for (const tamano of TAMANOS) {
    assert.match(
      css,
      new RegExp(`\\.${tamano}\\s*\\{[^}]*--orbe-ancho:`),
      `${tamano} no define --orbe-ancho, que es de donde salen el alto y la unidad del orbe`
    )
    assert.ok(componente.includes(`'${tamano}'`), `${tamano} no lo usa el componente`)
  }

  assert.match(css, /--orbe-u:\s*calc\(var\(--orbe-ancho\) \* var\(--orbe-nucleo\) \/ 245\)/,
    'la unidad del orbe tiene que derivar del ancho: es lo que hace que el orbe escale entero')
  assert.match(css, /--orbe-nucleo:\s*\.\d+/,
    'sin el nucleo el cuerpo del orbe ocupa todo el hueco y el halo se le sale encima al texto')
})

test('el tamaño le gana a los clamp() de cada estado', () => {
  // Cada estado de neo redefine `--orb-w`/`--orb-h` con su propio clamp. En un producto eso significa
  // que el boton cambia de ancho al pasar a "success", y el texto salta.
  const indiceEstado = css.lastIndexOf('[data-thinking-state="error"] .wiwo-thinking-orb')
  const indiceTamano = css.indexOf('.orbe-wiwo[data-thinking-state] .wiwo-thinking-orb')

  assert.ok(indiceTamano > indiceEstado,
    'la regla de tamaño quedo antes que las de estado: con el mismo peso de selector, gana la ultima')
})

test('en reposo el orbe chico y el mediano quedan quietos', () => {
  // La regla del proyecto: nada de animacion infinita en elementos siempre visibles. `chico` va en 31
  // botones y `medio` se repite por fila.
  assert.match(
    sinComentarios(css),
    /\.orbe-quieto[\s\S]{0,160}?animation:\s*none\s*!important/,
    'desaparecio el apagado del reposo'
  )
  assert.match(
    componente,
    /const quieto = estado === undefined && medida === undefined && \(tamano === 'chico' \|\| tamano === 'medio'\)/,
    'cambio quien queda quieto en reposo: revisar la regla de rendimiento antes de tocarlo'
  )
})

test('reduced motion conserva una respiracion minima', () => {
  const bloque = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))

  assert.ok(bloque.length > 0, 'el orbe dejo de respetar prefers-reduced-motion')
  assert.match(bloque, /orbe-respiracion-minima/,
    'la marca pide congelar la rotacion pero conservar la respiracion, no apagar todo')
})

test('el orbe se compone consigo mismo y no con la pagina', () => {
  // Sin aislar, las capas se suman a lo que tengan detras: sobre una superficie clara el orbe
  // desaparece, y una correccion por tema lo ensucia justo al reves en el degradado del acceso.
  assert.match(
    css,
    /\.orbe-escenario \{\s*isolation: isolate/,
    'el escenario dejo de aislar la mezcla: el orbe pasa a depender de la superficie que tenga debajo'
  )
  assert.ok(
    !/--orbe-mezcla/.test(css),
    'volvio la mezcla por tema: el problema no era el tema de la pagina sino la superficie de abajo'
  )
})

test('las medidas del orbe estan en unidades de orbe y no en pixeles', () => {
  // Un halo de 150px alrededor de un orbe de 28px no es un halo: es la pantalla pintada de verde.
  const portado = sinComentarios(css.slice(0, css.indexOf('Capa del producto')))
  const crudos = portado
    .split('\n')
    .filter((linea) => !/^\s*@media/.test(linea) && /-?[\d.]+px\b/.test(linea))

  assert.deepEqual(crudos, [], 'quedaron longitudes fijas en el CSS portado: no van a escalar')
})

test('toda variable que el orbe usa esta definida', () => {
  /*
   * El halo del orbe es `box-shadow: 0 0 150u color-mix(in srgb, var(--orb-light-blue) 30%, ...)`.
   * Si esa variable no esta definida, el `color-mix` no es invalido "un poco": el navegador tira la
   * declaracion ENTERA y el orbe se queda sin halo. No hay error, no hay aviso — solo una mancha
   * donde tendria que haber una silueta. Paso: los tres `--orb-light-*` viven en la tarjeta que
   * envuelve al orbe en neo, asi que la extraccion los descarto por cromo de la pagina.
   *
   * Por eso la prueba no mira esas tres: comprueba que NINGUNA variable del orbe quede sin definir.
   */
  const limpio = sinComentarios(css)
  const definidas = new Set([...limpio.matchAll(/(--[A-Za-z0-9-]+)\s*:/g)].map(([, n]) => n))
  // Las que llegan de afuera: los tokens del proyecto y las que el componente escribe en el `style`.
  const externas = /^--(wiwo|control-|s[xy]$|spark-(size|color|speed|delay)$|orbe-ancho$)/

  const faltantes = [...new Set([...limpio.matchAll(/var\(\s*(--[A-Za-z0-9-]+)/g)].map(([, n]) => n))]
    .filter((nombre) => !definidas.has(nombre) && !externas.test(nombre))

  assert.deepEqual(faltantes, [], 'el orbe usa variables que nadie define: las declaraciones que las ' +
    'contengan se descartan enteras y el efecto desaparece sin dar error')
})

test('no quedan rastros del showcase de donde salio', () => {
  assert.ok(!css.includes('.thinking-orb-demo'),
    '`.thinking-orb-demo` era el contenedor de la demo: aca el orbe es un componente de producto')
})

test('cargar se comunica de una sola forma: el orbe en su ventana', () => {
  /*
   * Antes `Cargando` hacia las dos cosas a la vez —filas de esqueleto Y el orbe superpuesto encima—,
   * y el halo se derramaba sobre las filas y sobre el texto de al lado. Se eligio un solo lenguaje:
   * el orbe, siempre dentro de una ventana que lo recorta. Sin esta prueba, la primera vez que
   * alguien quiera "reservar el alto" vuelve a aparecer una fila gris debajo del orbe.
   */
  const bloque = estados.slice(estados.indexOf('export function Cargando'))

  assert.ok(
    !/bg-relleno-neutro/.test(bloque),
    'volvieron las filas de esqueleto: el producto comunica la carga con el orbe, no con las dos cosas'
  )
  assert.match(bloque, /overflow-hidden/,
    'la ventana dejo de recortar: sin recorte el halo se derrama sobre lo que tiene al lado')
  assert.match(bloque, /bg-superficie-hundida/,
    'la ventana dejo de usar la superficie del sistema, que es la que sigue al tema de la aplicacion')
})

test('el orbe queda fuera del arbol de accesibilidad', () => {
  // Lo que se anuncia es el texto que lo acompaña: un adorno anunciado es ruido para un lector.
  assert.match(componente, /aria-hidden="true"\s*\n\s*data-thinking-state={estado}/,
    'el orbe dejo de ser aria-hidden')

  for (const envoltorio of ['SuperposicionOrbe', 'CargandoConOrbe']) {
    const desde = componente.indexOf(`export function ${envoltorio}`)
    assert.match(componente.slice(desde), /role="status"/,
      `${envoltorio} perdio su role="status": el orbe solo no anuncia nada`)
  }
})
