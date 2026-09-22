/**
 * Coherencia del bloque «Qué ve el cliente» del panel del Proyecto.
 *
 * El endpoint `PUT /projects/{id}/portal-settings` es de REEMPLAZO TOTAL: una clave que el cuerpo no
 * trae es 422. Y el panel arma ese cuerpo con el objeto entero que le devolvió el GET, no con la
 * lista de casillas que dibuja. De ahí sale el modo de fallo que esta prueba cubre:
 *
 *   - Una clave declarada en la interfaz pero que NO está en ningún grupo viaja en cada PUT y no se
 *     puede tocar desde ninguna parte. Es un interruptor invisible: alguien lo enciende en la base y
 *     nadie entiende por qué el cliente ve algo que el panel no menciona.
 *   - Una clave en un grupo pero NO en la interfaz no compila hoy (`ClavePortal` es `keyof`), pero la
 *     comprobación queda igual para que el día que la interfaz se afloje el hueco no pase gratis.
 *
 * Se lee el archivo como texto y no se importa el componente porque el tipo y los grupos no se
 * exportan: son internos de esa pantalla a propósito, y exportarlos solo para poder probarlos
 * cambiaría el diseño del módulo para acomodar la prueba.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const fuente = readFileSync(
  new URL('../src/componentes/proyecto/PanelConfiguracionEspacio.tsx', import.meta.url),
  'utf8'
)

/** Las claves declaradas en `interface AjustesDelPortal`. */
function clavesDeLaInterfaz () {
  const bloque = fuente.match(/interface AjustesDelPortal \{([\s\S]*?)\n\}/)

  assert.ok(bloque, 'no encontré la interfaz AjustesDelPortal: cambió el nombre o la forma')

  return [...bloque[1].matchAll(/^ {2}([a-z_]+): boolean$/gm)].map(([, clave]) => clave)
}

/** Las claves que los grupos dibujan como casilla. */
function clavesDibujadas () {
  return [...fuente.matchAll(/clave: '([a-z_]+)'/g)].map(([, clave]) => clave)
}

test('el interruptor maestro es la única clave que no se dibuja como casilla', () => {
  const declaradas = clavesDeLaInterfaz()
  const dibujadas = clavesDibujadas()
  const sinCasilla = declaradas.filter((clave) => !dibujadas.includes(clave))

  // El maestro se dibuja aparte y arriba, no dentro de un grupo. Cualquier otra clave sin casilla es
  // un interruptor que viaja en el PUT y nadie puede tocar.
  assert.deepEqual(sinCasilla, ['visible_para_cliente'])
})

test('no se dibuja ninguna casilla que la interfaz no declare', () => {
  const declaradas = clavesDeLaInterfaz()

  for (const clave of clavesDibujadas()) {
    assert.ok(declaradas.includes(clave), `la casilla ${clave} no está declarada en AjustesDelPortal`)
  }
})

test('no hay claves repetidas entre los grupos', () => {
  const dibujadas = clavesDibujadas()

  assert.deepEqual(dibujadas, [...new Set(dibujadas)], 'una casilla aparece en dos grupos')
})

test('están las quince del backend, con las tres propias de este módulo', () => {
  const declaradas = clavesDeLaInterfaz()

  // Quince: el maestro (columna de `tblprojects`) más las catorce filas de `tblproject_settings` que
  // acepta `Escritura\AjustesDelPortal`. Si el backend agrega la dieciséis y el panel no, la casilla
  // nueva no se puede tocar desde ninguna pantalla.
  assert.equal(declaradas.length, 15)

  for (const propia of ['wiwo_portal_actas', 'wiwo_portal_gestion', 'wiwo_portal_tickets']) {
    assert.ok(declaradas.includes(propia), `falta el interruptor propio ${propia}`)
  }
})

test('las solicitudes de soporte se administran desde el grupo de pestañas', () => {
  const grupos = fuente.match(/titulo: 'Pestañas del portal'[\s\S]*?\n {4}\},/)

  assert.ok(grupos, 'no encontré el grupo «Pestañas del portal»')
  assert.match(grupos[0], /clave: 'wiwo_portal_tickets'/)
})
