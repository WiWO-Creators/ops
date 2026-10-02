/**
 * Cobertura del rastreo: todo boton de las pantallas propias del portal tiene que poder
 * identificarse sin leer su texto (`data-rastreo`, `aria-label` o `title`).
 *
 * El texto interior de un boton no se registra nunca —puede ser el nombre de una tarea o de una
 * persona—, asi que un boton sin clave caeria a `boton.sin-rotulo` y se perderia justo lo que se
 * quiere saber. Los enlaces no entran: se identifican por su destino.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const ARCHIVOS = [
  'src/app/portal/BotonSalirPortal.tsx',
  'src/app/portal/(dentro)/soporte/NuevaSolicitud.tsx',
  'src/app/portal/(dentro)/proyectos/[id]/AprobacionesPendientes.tsx',
  'src/componentes/portal/ResumenDeLaSemana.tsx',
  'src/componentes/portal/TableroDelProyecto.tsx',
  'src/componentes/estructura/SelectorTema.tsx',
  'src/componentes/ia/OrbeChatIA.tsx'
]

/** Las etiquetas de apertura de `<button` y `<Boton`, con su texto completo (las flechas traen `>`). */
function aperturasDeBoton (codigo) {
  const salida = []
  const inicio = /<(button|Boton)\b/g
  let m

  while ((m = inicio.exec(codigo)) !== null) {
    let profundidad = 0
    let i = m.index

    for (; i < codigo.length; i++) {
      const c = codigo[i]

      if (c === '{') profundidad++
      else if (c === '}') profundidad--
      else if (c === '>' && profundidad === 0 && codigo[i - 1] !== '=') break
    }

    salida.push(codigo.slice(m.index, i + 1))
  }

  return salida
}

for (const archivo of ARCHIVOS) {
  test(`todo boton de ${archivo} se identifica`, () => {
    const botones = aperturasDeBoton(readFileSync(archivo, 'utf8'))

    assert.ok(botones.length > 0, 'el archivo ya no tiene botones: sacalo de la lista')

    for (const boton of botones) {
      assert.match(boton, /data-rastreo=|aria-label=|title=/, `boton sin clave: ${boton.slice(0, 120)}`)
    }
  })
}

test('las claves data-rastreo cumplen el formato cerrado de la API', () => {
  for (const archivo of ARCHIVOS) {
    for (const [, clave] of readFileSync(archivo, 'utf8').matchAll(/data-rastreo="([^"]*)"/g)) {
      assert.match(clave, /^[a-z0-9_.-]{1,64}$/, `${archivo}: ${clave}`)
    }
  }
})
