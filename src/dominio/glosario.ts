/**
 * Glosario de dominio.
 *
 * WiWO renombro varios conceptos y los nombres de la interfaz no son negociables: son los que el
 * equipo usa para hablar entre si. Ningun componente escribe "Proceso" a mano; todos leen de acá, asi
 * que un renombre futuro es un archivo y no una busqueda global.
 *
 * Los nombres de campo de la API conservan los de Perfex (`task`, `project`, `rel_type`): la
 * traduccion ocurre UNA vez, al presentar.
 *
 * Las dos trampas del glosario:
 *   - `Issue` -> Proceso, pero `Process` -> Automatizacion. Traducir `Process` como "Proceso" es el
 *     error mas facil de cometer y el mas confuso de leer.
 *   - `Project` -> Espacio, mientras que `Component` -> Proyecto. El nombre "Proyecto" existe, pero
 *     no apunta a lo que uno esperaria.
 */

export const GLOSARIO = {
  proceso: { singular: 'Proceso', plural: 'Procesos' },
  proyecto: { singular: 'Proyecto', plural: 'Proyectos' },
  espacio: { singular: 'Espacio', plural: 'Espacios' },
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
