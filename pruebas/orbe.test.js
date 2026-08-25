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

test('no quedan rastros del showcase de donde salio', () => {
  assert.ok(!css.includes('.thinking-orb-demo'),
    '`.thinking-orb-demo` era el contenedor de la demo: aca el orbe es un componente de producto')
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
