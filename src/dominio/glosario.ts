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
  licitacion: { singular: 'Licitación', plural: 'Licitaciones' },
  cliente: { singular: 'Cliente', plural: 'Clientes' },
  ticket: { singular: 'Ticket', plural: 'Tickets' },
  seguimiento: { singular: 'Seguimiento', plural: 'Seguimiento' },
  planificador: { singular: 'Planificador', plural: 'Planificador' },
  teletrabajo: { singular: 'Teletrabajo', plural: 'Teletrabajo' },
  automatizacion: { singular: 'Automatización', plural: 'Automatizaciones' },
  // El acta de una reunion. La clave dice `acta` porque asi se llama el recurso en la API
  // (`/projects/{id}/actas`); el valor es como lo llama el equipo desde antes de que existiera esta
  // pantalla.
  acta: { singular: 'Meeting Paper', plural: 'Meeting Papers' },
  // Las notas privadas. Estaban escritas a mano en la pestaña, que ademas decia "Meeting Paper"
  // porque hasta ahora eran lo mas parecido que habia.
  nota: { singular: 'Nota', plural: 'Notas' }
} as const

/**
 * Como se llama el asistente de IA en la interfaz.
 *
 * Fuera de `GLOSARIO` porque no es un concepto que se cuente: no tiene plural. Aca y no escrito a
 * mano en cada pantalla, para que renombrarlo sea una linea y no una cacería.
 */
export const ASISTENTE = 'WiBot'

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
