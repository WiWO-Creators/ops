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
 * Los campos que la tarjeta sabe pintar, en el orden en que los dibuja.
 *
 * Es la lista corta y cerrada de lo que `<TarjetaTarea>` tiene presentacion para mostrar: la tabla
 * declara diecinueve columnas, y encender en la tarjeta una que no esta aca no cambiaria nada de lo
 * que se ve. `id`, `name`, `status`, `due_date` y los contadores no estan porque son el esqueleto:
 * se pintan siempre y no se pueden apagar.
 */
export const CAMPOS_DE_TARJETA = ['patente', 'start_date', 'milestone', 'assignees', 'followers', 'tags']

/**
 * Los campos que una tarjeta enciende al abrirse, para la definicion vigente.
 *
 * **Interseca lo que la tarjeta sabe pintar con lo que la definicion declara como columna.** Eso es
 * lo que protege al portal sin una lista de excepciones escrita a mano: la definicion del contacto
 * no declara hito, asignados, seguidores ni etiquetas —su contrato tampoco los emite—, asi que esos
 * campos se caen solos y la tarjeta del cliente nunca los ofrece. Al equipo, en cambio, le llegan
 * los seis, incluidos Inicio y Seguidores, que en la tabla arrancan `ocultaPorDefecto` porque ahi
 * pagan una columna de ancho y en la tarjeta no agregan ni un renglon.
 *
 * El tipo es estructural a proposito: solo se necesita la clave, y pedir `Columna<T>` ataria esta
 * funcion —que se prueba sin React— al modulo de definiciones entero.
 *
 * @param columnas Las columnas de la definicion vigente.
 * @returns Las claves encendidas, en el orden de dibujo de la tarjeta.
 */
export function camposPorDefectoDeTarjeta (columnas: Array<{ clave: string }>): string[] {
  const declaradas = new Set(columnas.map((columna) => columna.clave))

  return CAMPOS_DE_TARJETA.filter((campo) => declaradas.has(campo))
}

/**
 * Deja en el Proceso solo lo que esta vista de tablero puede pintar.
 *
 * La lista de claves sale de `camposPorDefectoDeTarjeta(definicion.columnas)`, y despues de quien
 * mira: el menu "Campos de la tarjeta" del tablero la edita. Un campo se pinta cuando la definicion
 * del sujeto declara su columna y el menu lo tiene encendido. Eso resuelve el problema de fondo: el
 * contrato del contacto no emite hito, asignados, seguidores ni etiquetas —y una tarjeta que los
 * pintara leeria objetos que no llegaron—, asi que esos campos no entran en el set ni se pueden
 * encender desde el menu.
 *
 * Reconstruye el objeto en vez de tachar campos sobre el original: lo que la tarjeta no declara no
 * viaja, y agregar una clave al contrato obliga a decidir aca si se pinta.
 *
 * @param proceso La fila del tablero, tal como bajo del BFF.
 * @param visibles Claves de los campos encendidos en esta tarjeta.
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
