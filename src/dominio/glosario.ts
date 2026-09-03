/**
 * Glosario de dominio.
 *
 * Los nombres de la interfaz no son negociables: son los que el equipo usa para hablar entre si.
 * Ningun componente escribe "Tarea" a mano; todos leen de acá, asi que un renombre futuro es un
 * archivo y no una busqueda global.
 *
 * Los nombres de campo de la API conservan los de Perfex (`task`, `project`, `rel_type`): la
 * traduccion ocurre UNA vez, al presentar. Por eso las claves internas siguen diciendo `proceso` y
 * `espacio` aunque la interfaz muestre "Tarea" y "Proyecto": la clave nombra el recurso de la API,
 * el valor nombra lo que ve la persona.
 */

export const GLOSARIO = {
  proceso: { singular: 'Tarea', plural: 'Tareas' },
  espacio: { singular: 'Proyecto', plural: 'Proyectos' },
  hito: { singular: 'Hito', plural: 'Hitos' },
  prospecto: { singular: 'Prospecto', plural: 'Prospectos' },
  cliente: { singular: 'Cliente', plural: 'Clientes' },
  ticket: { singular: 'Ticket', plural: 'Tickets' },
  seguimiento: { singular: 'Seguimiento', plural: 'Seguimiento' },
  planificador: { singular: 'Planificador', plural: 'Planificador' },
  teletrabajo: { singular: 'Teletrabajo', plural: 'Teletrabajo' },
  automatizacion: { singular: 'Automatización', plural: 'Automatizaciones' }
} as const

export type ClaveGlosario = keyof typeof GLOSARIO

/**
 * Devuelve el nombre de un concepto, en singular o plural segun la cantidad.
 *
 * @param clave concepto del glosario
 * @param cantidad cantidad de elementos; 1 da singular, cualquier otra cosa da plural
 * @returns el nombre listo para mostrar
 */
export function nombrar (clave: ClaveGlosario, cantidad = 1): string {
  const entrada = GLOSARIO[clave]
  return cantidad === 1 ? entrada.singular : entrada.plural
}
