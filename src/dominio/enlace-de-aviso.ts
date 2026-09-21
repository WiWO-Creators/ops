import { PARAMETRO_TAREA } from '../componentes/datos/tabla.ts'

/**
 * A donde lleva un aviso de la campana.
 *
 * `tblnotifications.link` lo escribe el **panel clasico** y habla su idioma: un fragmento de hash
 * (`#taskid=512`) que alla abria un modal sobre la pagina de Tareas. Pegado tal cual en un `href` de
 * Ops no lleva a ninguna parte — el navegador se queda en la pantalla vigente y solo cambia el hash—,
 * y por eso hasta ahora la campana lo descartaba entero.
 *
 * Descartarlo entero tambien era el problema: un aviso que dice "se acerca la fecha tope" y no deja
 * ir a la tarea obliga a buscarla a mano. Lo que se traduce se enlaza; lo que no, se sigue pintando
 * como texto. Es la misma regla de `hrefDeCita()` en `dominio/ia-chat.ts`: nunca un enlace prolijo
 * que lleva a otro lado, porque ese es el fallo al que la gente le cree.
 *
 * Vive en `dominio/` y no junto al componente porque `pruebas/enlace-de-aviso.test.js` la corre con
 * `node --test`, que quita tipos de un `.ts` pero no sabe leer un `.tsx`.
 */

/**
 * El unico formato del panel clasico que hoy se sabe traducir.
 *
 * Anclado a los dos extremos a proposito: `#taskid=512&foo` o `#leadid=7` no son enlaces a una
 * Tarea, y adivinarles un destino seria inventarlo.
 */
const ENLACE_DE_TAREA = /^#taskid=(\d+)$/

/**
 * La pantalla que monta el unico detalle de Tarea del producto y lo pide por id.
 *
 * Es el mismo destino que usa una cita de Thinking Orb: el listado global con `?tarea={id}`, que
 * abre la que es sirva quien sirva de Proyecto. Mandarlo a la ficha de un Proyecto exigiria saber
 * cual, y el aviso no lo trae.
 */
const RUTA_DE_TAREAS = '/procesos'

/**
 * Traduce el `link` de un aviso a una ruta de Ops.
 *
 * @param link el `link` que sirve la API, que puede venir `null` cuando el aviso no apunta a nada
 * @returns la ruta relativa de Ops, o `null` si el enlace falta o no es uno que se sepa traducir —
 *          y entonces la fila se pinta sin enlace, igual que antes
 */
export function rutaDeAviso (link: string | null): string | null {
  if (typeof link !== 'string') return null

  const coincidencia = ENLACE_DE_TAREA.exec(link.trim())

  if (coincidencia === null) return null

  const id = Number(coincidencia[1])

  // `#taskid=0` y un id que no entra en un entero seguro no nombran ninguna fila: el detalle abriria
  // vacio y el enlace habria mentido igual que si apuntara a otra pantalla.
  if (!Number.isSafeInteger(id) || id <= 0) return null

  return `${RUTA_DE_TAREAS}?${PARAMETRO_TAREA}=${id}`
}
