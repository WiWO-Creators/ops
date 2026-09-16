/**
 * El contrato de la tarjeta del tablero y la poda que lo produce.
 *
 * Vive en un `.ts` y no dentro de `TarjetaTarea.tsx` porque Node despoja los tipos de un `.ts` pero
 * no el JSX: la poda es la que decide *que* dato llega a la tarjeta, y tiene que poder probarse sin
 * montar React.
 */

import type { Etiqueta, ProcesoAmpliado, Referencia } from '../../datos/recursos.ts'
import type { StaffReferencia } from '../../datos/tipos.ts'

/**
 * Lo minimo que una tarjeta necesita.
 *
 * Todo lo opcional es **tri-estado, y los tres estados significan cosas distintas**:
 *
 *  - `undefined`: el campo no se pinta en esta vista, sea porque el contrato del sujeto no lo manda
 *    o porque su columna arranca apagada. La tarjeta ni lo menciona.
 *  - `null` (o lista vacia): el campo se pinta, pero esta Tarea no lo tiene cargado.
 *  - con valor: se pinta el valor.
 *
 * Sin esa distincion no se puede separar "el cliente no ve hitos" de "esta Tarea no tiene hito", y
 * la tarjeta del portal termina con huecos que no explican nada.
 */
export interface ProcesoDeTarjeta {
  id: number
  name: string
  status: number
  due_date: string | null
  /** Identificador visible (`PAT-001-07`). `null` mientras el backend no lo haya asignado. */
  patente?: string | null
  start_date?: string | null
  milestone?: Referencia | null
  followers?: StaffReferencia[]
  assignees?: StaffReferencia[]
  counts?: ProcesoAmpliado['counts']
  tags?: Etiqueta[]
}

/**
 * Deja en el Proceso solo lo que esta vista de tablero puede pintar.
 *
 * **La tarjeta muestra lo que la tabla muestra por defecto.** La lista de claves sale de
 * `clavesVisiblesPorDefecto(definicion.columnas)`, asi que un campo se pinta cuando la definicion
 * del sujeto declara su columna y no la declara `ocultaPorDefecto`. Eso resuelve dos problemas de un
 * saque: el contrato del contacto no emite hito, asignados, seguidores ni etiquetas —y una tarjeta
 * que los pintara leeria objetos que no llegaron—, y los campos que saturan la tarjeta arrancan
 * apagados sin una segunda lista de excepciones que mantener al lado de la definicion.
 *
 * Reconstruye el objeto en vez de tachar campos sobre el original: lo que la tarjeta no declara no
 * viaja, y agregar una clave al contrato obliga a decidir aca si se pinta.
 *
 * @param proceso La fila del tablero, tal como bajo del BFF.
 * @param visibles Claves de las columnas visibles por defecto en la definicion vigente.
 * @returns El Proceso podado, listo para `<TarjetaTarea>`.
 */
export function podarParaTarjeta (proceso: ProcesoDeTarjeta, visibles: string[]): ProcesoDeTarjeta {
  const claves = new Set(visibles)

  return {
    id: proceso.id,
    name: proceso.name,
    status: proceso.status,
    due_date: proceso.due_date,
    counts: proceso.counts,
    patente: claves.has('patente') ? proceso.patente ?? null : undefined,
    start_date: claves.has('start_date') ? proceso.start_date ?? null : undefined,
    milestone: claves.has('milestone') ? proceso.milestone ?? null : undefined,
    followers: claves.has('followers') ? proceso.followers ?? [] : undefined,
    assignees: claves.has('assignees') ? proceso.assignees ?? [] : undefined,
    tags: claves.has('tags') ? proceso.tags ?? [] : undefined
  }
}
