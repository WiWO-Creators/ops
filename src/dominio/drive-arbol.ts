/**
 * Reglas puras del árbol de Drive: validar un nombre, decidir qué destinos admite un traslado y
 * leer los campos que el backend viejo todavía no emite.
 *
 * Viven aparte del componente para poder probarlas sin navegador, y porque son las mismas que
 * aplica el backend: el cliente las repite para avisar antes del viaje, no para reemplazarlo.
 */

import type { NodoDrive } from '@/datos/recursos'

/** Largo máximo de un nombre de archivo o carpeta. Es el mismo tope que valida la API. */
export const LARGO_MAXIMO_NOMBRE_DRIVE = 255

/**
 * Dice qué tiene de malo un nombre de archivo o carpeta, o `null` si sirve.
 *
 * Mide el nombre ya recortado, que es el que se manda: un nombre de puros espacios cuenta como
 * vacío. La barra se rechaza porque Drive la acepta pero el resto del sistema la lee como ruta.
 *
 * @param nombre lo que escribió la persona, sin recortar
 * @returns el motivo en una frase, o `null` si el nombre es válido
 */
export function motivoNombreInvalido (nombre: string): string | null {
  const limpio = nombre.trim()

  if (limpio === '') return 'Escribe un nombre.'
  if (limpio.length > LARGO_MAXIMO_NOMBRE_DRIVE) return `El nombre no puede pasar de ${LARGO_MAXIMO_NOMBRE_DRIVE} caracteres.`
  if (limpio.includes('/')) return 'El nombre no puede llevar "/".'

  return null
}

/**
 * Dice si una carpeta no puede recibir el traslado de un item, y por qué.
 *
 * La carpeta se describe por su ruta desde la raíz de la entidad, ella incluida: con eso alcanza
 * para saber si es el propio item o cuelga de él, sin conocer el árbol entero. La carpeta actual se
 * descarta porque "mover" ahí no cambia nada.
 *
 * @param rutaDestino ids desde la raíz hasta la carpeta candidata, ambos incluidos
 * @param itemId el archivo o carpeta que se quiere mover
 * @param padreId la carpeta donde está hoy el item
 * @returns el motivo en pocas palabras, o `null` si la carpeta sirve de destino
 */
export function motivoDestinoInvalido (rutaDestino: readonly string[], itemId: string, padreId: string): string | null {
  const destinoId = rutaDestino[rutaDestino.length - 1]

  if (destinoId === undefined) return 'Carpeta desconocida'
  if (destinoId === itemId) return 'Es la misma carpeta'
  if (rutaDestino.includes(itemId)) return 'Está dentro de la carpeta que mueves'
  if (destinoId === padreId) return 'Ya está acá'

  return null
}

/**
 * Si se puede escribir en una carpeta. Un backend anterior al campo no lo manda: vale `true`, que
 * es lo que la pantalla asumía antes de que existiera.
 *
 * @param carpeta la respuesta de `GET /drive/{folder_id}` o el `folder` de la raíz
 */
export function puedeEscribirEn (carpeta: { can_write?: boolean }): boolean {
  return carpeta.can_write ?? true
}

/**
 * Si un nodo admite renombrar, mover y borrar. Un nodo sin `locked` (backend viejo) se trata como
 * libre, igual que un archivo.
 *
 * @param nodo el hijo tal como lo devolvió la API
 */
export function esEditable (nodo: NodoDrive): boolean {
  return nodo.locked !== true
}

/**
 * Reemplaza un nodo de la lista por su versión actualizada, conservando el orden.
 *
 * @param lista los hijos actuales
 * @param actualizado el nodo que devolvió el `PATCH`; se busca por `id`
 * @returns una lista nueva; si el id no estaba, la misma lista sin cambios
 */
export function reemplazarNodo (lista: readonly NodoDrive[], actualizado: NodoDrive): NodoDrive[] {
  return lista.map((nodo) => (nodo.id === actualizado.id ? { ...nodo, ...actualizado } : nodo))
}

/**
 * Saca un nodo de la lista.
 *
 * @param lista los hijos actuales
 * @param id el nodo que se borró o se fue a otra carpeta
 * @returns una lista nueva sin ese nodo
 */
export function quitarNodo (lista: readonly NodoDrive[], id: string): NodoDrive[] {
  return lista.filter((nodo) => nodo.id !== id)
}
