import type { StaffReferencia } from '@/datos/tipos'
import type { Etiqueta, Proceso } from '@/datos/recursos'

/**
 * Lo que se edita de una Tarea desde el detalle, en la forma que usa el formulario.
 *
 * Todo texto, incluidas las listas de ids: el estado de un formulario controlado son cadenas, y
 * convertir a numero recien al armar el cuerpo evita el `NaN` intermedio que aparece cuando alguien
 * borra el contenido de un campo.
 */
export interface CamposEdicion {
  nombre: string
  prioridad: string
  inicio: string
  vencimiento: string
  /** Id del hito, o `''` para "sin hito". */
  hito: string
  asignados: number[]
  seguidores: number[]
  /**
   * Etiquetas elegidas: un numero es un id del catalogo, una cadena es una etiqueta escrita a mano
   * que todavia no existe. La API acepta las dos formas y crea la que falta.
   */
  etiquetas: Array<number | string>
  descripcion: string
}

/** El cuerpo del `PATCH /tasks/{id}`, con solo las claves que cambiaron. */
export interface ParcheTarea {
  name?: string
  priority?: number
  start_date?: string | null
  due_date?: string | null
  milestone?: number
  assignees?: number[]
  followers?: number[]
  tags?: Array<number | string>
  description?: string | null
}

/**
 * Arma el estado inicial del formulario a partir de la Tarea que devolvio la API.
 *
 * Las fechas llegan como `YYYY-MM-DD` o `null`, que es justo lo que espera un `<input type="date">`
 * con cadena vacia por ausencia. No se reformatean: hacerlo obligaria a volver a parsear al guardar.
 *
 * @param tarea la Tarea tal como la trae `GET /tasks/{id}`
 * @param descripcion el texto plano ya extraido del HTML de Perfex, que la Tarea trae como marcado
 */
export function camposDeTarea (tarea: Proceso, descripcion: string): CamposEdicion {
  return {
    nombre: tarea.name,
    prioridad: String(tarea.priority),
    inicio: tarea.start_date ?? '',
    vencimiento: tarea.due_date ?? '',
    hito: tarea.milestone === null ? '' : String(tarea.milestone.id),
    asignados: tarea.assignees.map((persona) => persona.id),
    seguidores: tarea.followers.map((persona) => persona.id),
    etiquetas: tarea.tags.map((etiqueta) => etiqueta.id),
    descripcion
  }
}

/**
 * Arma el cuerpo del parche con lo que cambio, y nada mas.
 *
 * Mandar el formulario entero seria mas corto y esta mal por dos razones concretas, no por estilo:
 *
 *   1. `milestone` y `task_type` se validan contra el Espacio de la Tarea (`ParcheProceso`), asi que
 *      reenviar un hito heredado de otro Espacio devuelve `422` en un guardado donde nadie toco el
 *      hito.
 *   2. `assignees` **reemplaza** la lista y cierra los cronometros de quien sale. Reenviar la misma
 *      lista es una escritura de mas sobre `task_assigned` en cada guardado.
 *
 * Las listas se comparan como conjuntos: reordenar los chips del selector no es un cambio.
 *
 * El vacio de un campo opcional viaja como `null` y no como `''`: la API borra con `null` y rechaza
 * la cadena vacia en las fechas. `milestone` es la excepcion que documenta el contrato — se quita
 * con `0`, porque el campo es un entero en la base.
 *
 * @param inicial los campos tal como se abrieron
 * @param actual los campos tal como quedaron
 * @returns el cuerpo del `PATCH`, vacio si no cambio nada
 */
export function cuerpoDeParche (inicial: CamposEdicion, actual: CamposEdicion): ParcheTarea {
  const parche: ParcheTarea = {}

  if (actual.nombre.trim() !== inicial.nombre.trim()) parche.name = actual.nombre.trim()
  if (actual.prioridad !== inicial.prioridad) parche.priority = Number(actual.prioridad)
  if (actual.inicio !== inicial.inicio) parche.start_date = actual.inicio === '' ? null : actual.inicio
  if (actual.vencimiento !== inicial.vencimiento) {
    parche.due_date = actual.vencimiento === '' ? null : actual.vencimiento
  }
  if (actual.hito !== inicial.hito) parche.milestone = actual.hito === '' ? 0 : Number(actual.hito)
  if (!mismosIds(actual.asignados, inicial.asignados)) parche.assignees = actual.asignados
  if (!mismosIds(actual.seguidores, inicial.seguidores)) parche.followers = actual.seguidores
  if (!mismosIds(actual.etiquetas, inicial.etiquetas)) parche.tags = actual.etiquetas
  if (actual.descripcion.trim() !== inicial.descripcion.trim()) {
    parche.description = actual.descripcion.trim() === '' ? null : actual.descripcion.trim()
  }

  return parche
}

/** True si las dos listas tienen los mismos elementos, sin importar el orden ni las repeticiones. */
function mismosIds (unos: Array<number | string>, otros: Array<number | string>): boolean {
  const conjunto = new Set(otros)

  return new Set(unos).size === conjunto.size && unos.every((id) => conjunto.has(id))
}

/**
 * La lista de personas que puede ofrecer el selector.
 *
 * **Son todas las asignables de la instalacion, no los miembros del Espacio.** Recortar por membresia
 * era lo que hacia que alguien no apareciera al buscarlo: el backend agrega solo al Espacio a quien
 * se asigna (`CrearProceso::asegurarMiembrosDelEspacio()`), asi que exigir que ya sea miembro para
 * poder elegirlo invierte el orden real de las cosas.
 *
 * Aun con la lista completa hace falta la union: `GET /staff/asignables` devuelve solo a las personas
 * activas, y una Tarea puede tener asignado a alguien que despues se dio de baja. Sin el, el selector
 * no dibuja su chip y el proximo guardado lo borra sin que nadie lo haya pedido.
 *
 * @param asignables las de `GET /staff/asignables`, en el orden en que las devolvio la API
 * @param yaEnLaTarea asignados y seguidores actuales
 * @returns la union sin repetidos, con las asignables primero
 */
export function personasElegibles (
  asignables: StaffReferencia[],
  yaEnLaTarea: StaffReferencia[]
): StaffReferencia[] {
  const vistos = new Set(asignables.map((persona) => persona.id))

  return [...asignables, ...yaEnLaTarea.filter((persona) => {
    if (vistos.has(persona.id)) return false
    vistos.add(persona.id)

    return true
  })]
}

/**
 * Nombres de las etiquetas elegidas, para pintarlas como chips sin volver a pedir el catalogo.
 *
 * Un id que ya no esta en el catalogo se omite en vez de mostrarse como un numero suelto: es el caso
 * de la etiqueta que borraron mientras el dialogo estaba abierto. Una etiqueta escrita a mano viaja
 * como su propio nombre y se muestra tal cual: todavia no tiene id porque la crea la API al guardar.
 */
export function nombresDeEtiquetas (catalogo: Etiqueta[], elegidas: Array<number | string>): string[] {
  return elegidas.flatMap((elegida) => {
    if (typeof elegida === 'string') return [elegida]

    const delCatalogo = catalogo.find((etiqueta) => etiqueta.id === elegida)

    return delCatalogo === undefined ? [] : [delCatalogo.name]
  })
}
