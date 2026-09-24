/**
 * Quién creó una Tarea y quién asignó a cada responsable (WIW-0441).
 *
 * La API manda `created_by` en la Tarea y `assigned_by` dentro de cada asignado. Acá se agrupan los
 * asignados por quien los asignó, para que la ficha diga "Asignada por Óscar" una sola vez y no una
 * por responsable.
 *
 * Los imports son relativos y con extension porque `pruebas/autoria-tarea.test.js` corre con el
 * runner de Node, que resuelve rutas de archivo y no el alias `@/` de Next.
 */

/** Referencia mínima de una persona del equipo, tal como la manda la API. */
export interface PersonaDeAutoria {
  id: number
  full_name: string
  profile_image_url: string | null
}

/** Un asignado con quien lo asignó. `null` si lo asignó un contacto o esa persona ya no existe. */
export interface AsignadoConAutoria extends PersonaDeAutoria {
  assigned_by?: PersonaDeAutoria | null
}

/** Una persona que asignó y a quiénes asignó. */
export interface GrupoDeAsignacion {
  quien: PersonaDeAutoria
  asignados: PersonaDeAutoria[]
}

/**
 * Agrupa los asignados de una Tarea por quien los asignó, en el orden en que aparecen.
 *
 * Los asignados sin `assigned_by` —asignación desde el portal, persona dada de baja o contrato que no
 * lo manda— quedan fuera: no hay a quién nombrar.
 *
 * @param asignados los `assignees` de la Tarea; `undefined` o vacío dan lista vacía
 * @returns un grupo por cada persona que asignó
 */
export function agruparPorQuienAsigno (asignados: AsignadoConAutoria[] | undefined): GrupoDeAsignacion[] {
  const grupos = new Map<number, GrupoDeAsignacion>()

  for (const asignado of asignados ?? []) {
    const quien = asignado.assigned_by
    if (quien === undefined || quien === null) continue

    const persona = { id: asignado.id, full_name: asignado.full_name, profile_image_url: asignado.profile_image_url }
    const grupo = grupos.get(quien.id)
    if (grupo === undefined) {
      grupos.set(quien.id, { quien, asignados: [persona] })
    } else {
      grupo.asignados.push(persona)
    }
  }

  return [...grupos.values()]
}
