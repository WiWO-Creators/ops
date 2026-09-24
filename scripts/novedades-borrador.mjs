/**
 * Lista los merges que todavía no tienen novedad, como materia prima para redactar las nuevas.
 *
 * Lee la fecha de la novedad más reciente de `src/dominio/novedades.ts` y muestra los merges de
 * `main` desde ese día, en ops-v2 y en el board, salvo los que ya figuran en alguna entrada. No
 * escribe nada: la novedad la redacta una persona (o un agente) en lenguaje simple.
 *
 * Uso:
 *   node scripts/novedades-borrador.mjs [--desde YYYY-MM-DD]
 *
 * El clon del board se busca en `WIWO_BOARD_REPO`, o en `../wiwo-board` si no está definida.
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NOVEDADES, fechaMasReciente } from '../src/dominio/novedades.ts'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPOS = [
  { nombre: 'ops-v2', ruta: RAIZ },
  { nombre: 'board', ruta: process.env.WIWO_BOARD_REPO ?? resolve(RAIZ, '..', 'wiwo-board') }
]

/**
 * Lee `--desde` de la línea de comandos, o cae a la fecha de la novedad más reciente.
 *
 * @returns la fecha desde la que se listan merges, `YYYY-MM-DD`
 * @throws si `--desde` no tiene forma de fecha o no hay novedades de las que partir
 */
function fechaDeInicio () {
  const indice = process.argv.indexOf('--desde')

  if (indice !== -1) {
    const valor = process.argv[indice + 1] ?? ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw new Error(`--desde espera YYYY-MM-DD y recibió "${valor}"`)
    return valor
  }

  const masReciente = fechaMasReciente(NOVEDADES)
  if (masReciente === null) throw new Error('No hay novedades de las que partir: usa --desde YYYY-MM-DD')

  return masReciente
}

/**
 * Los merges de `main` de un repo desde una fecha, sin los que ya tienen novedad.
 *
 * @param repo nombre y ruta del clon
 * @param desde fecha de inicio, `YYYY-MM-DD`
 * @param yaCubiertos hashes `repo@hash` que ya figuran en alguna novedad
 * @returns líneas `fecha repo@hash asunto`
 */
function mergesPendientes (repo, desde, yaCubiertos) {
  const salida = execFileSync(
    'git',
    ['-C', repo.ruta, 'log', 'main', '--first-parent', '--merges', `--since=${desde}T00:00:00`, '--format=%ad %h %s', '--date=short'],
    { encoding: 'utf8' }
  )

  return salida
    .split('\n')
    .filter(linea => linea.trim() !== '')
    .map(linea => {
      const [fecha, hash, ...asunto] = linea.split(' ')
      return { fecha, clave: `${repo.nombre}@${hash}`, asunto: asunto.join(' ') }
    })
    .filter(merge => !yaCubiertos.has(merge.clave))
    .map(merge => `${merge.fecha}  ${merge.clave}  ${merge.asunto}`)
}

const desde = fechaDeInicio()
const yaCubiertos = new Set(NOVEDADES.flatMap(novedad => novedad.commits))

console.log(`Merges desde ${desde} sin novedad:\n`)

for (const repo of REPOS) {
  if (!existsSync(repo.ruta)) {
    console.log(`[${repo.nombre}] no se encontró el clon en ${repo.ruta}\n`)
    continue
  }

  const pendientes = mergesPendientes(repo, desde, yaCubiertos)
  console.log(`[${repo.nombre}]`)
  console.log(pendientes.length === 0 ? '  (nada pendiente)' : pendientes.map(linea => `  ${linea}`).join('\n'))
  console.log('')
}
