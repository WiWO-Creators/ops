/**
 * Lo que se copia al duplicar una Tarea, y como se arma el cuerpo que espera la API.
 *
 * Vive en un `.ts` aparte del componente para poder probarlo: el selector tiene ocho opciones y un
 * "marcar todo", y equivocar un default no rompe la pantalla —copia de menos o de mas en silencio,
 * que es el error caro de esta funcionalidad—.
 *
 * El contrato es `POST /tasks/{id}/duplicar`. Las claves de `copiar` son las del backend y no se
 * traducen: la traduccion al castellano de la interfaz ocurre una sola vez, en `ETIQUETAS`.
 */

/** Largo maximo del nombre que acepta la API (`DuplicarProceso::NOMBRE_MAXIMO`). */
export const LARGO_MAXIMO_NOMBRE = 600

/**
 * Las ocho cosas copiables, en el orden en que se leen en el modal.
 *
 * El orden no es alfabetico ni el del backend: primero lo que describe la Tarea (descripcion,
 * gente), despues lo que cuelga de ella (checklist, adjuntos) y al final lo accesorio. Quien
 * duplica lee de arriba hacia abajo y para de leer cuando ya marco lo que necesitaba.
 */
export const COPIABLES = [
  'descripcion',
  'asignados',
  'seguidores',
  'checklist',
  'adjuntos',
  'campos_personalizados',
  'etiquetas',
  'recordatorios'
] as const

export type ClaveCopiable = typeof COPIABLES[number]

/** Que se copia, opcion por opcion. Todas las claves siempre presentes, como las manda la API. */
export type SeleccionDeCopia = Record<ClaveCopiable, boolean>

/** Como se nombra cada opcion en la interfaz. */
export const ETIQUETAS: Record<ClaveCopiable, string> = {
  descripcion: 'Descripción',
  asignados: 'Asignados',
  seguidores: 'Seguidores',
  checklist: 'Checklist',
  adjuntos: 'Adjuntos',
  campos_personalizados: 'Campos personalizados',
  etiquetas: 'Etiquetas',
  recordatorios: 'Recordatorios'
}

/**
 * Con que arranca el modal: lo mismo que hace la API con el cuerpo vacio.
 *
 * Solo la descripcion viene encendida. Todo lo demas —gente asignada, adjuntos, recordatorios—
 * tiene efectos sobre terceros o sobre el disco, y encenderlo por omision es la clase de default
 * que nadie pidio. Que el modal y la API coincidan importa: si difirieran, duplicar sin tocar nada
 * daria un resultado distinto segun por donde se entre.
 */
export function copiaPorDefecto (): SeleccionDeCopia {
  return seleccionUniforme(false, { descripcion: true })
}

/**
 * Una seleccion con todas las opciones en el mismo valor, salvo las que se pisen.
 *
 * @param valor  valor para todas las claves
 * @param pisar  claves que van con otro valor
 * @returns la seleccion completa: las ocho claves, siempre
 */
export function seleccionUniforme (valor: boolean, pisar: Partial<SeleccionDeCopia> = {}): SeleccionDeCopia {
  const seleccion = {} as SeleccionDeCopia

  for (const clave of COPIABLES) seleccion[clave] = pisar[clave] ?? valor

  return seleccion
}

/** `true` si las ocho opciones estan marcadas. Decide el texto del atajo de marcar/desmarcar todo. */
export function todasMarcadas (seleccion: SeleccionDeCopia): boolean {
  return COPIABLES.every((clave) => seleccion[clave])
}

/** Cuantas opciones estan marcadas. Se muestra junto al atajo para no obligar a contar casillas. */
export function cuantasMarcadas (seleccion: SeleccionDeCopia): number {
  return COPIABLES.filter((clave) => seleccion[clave]).length
}

/** El cuerpo de `POST /tasks/{id}/duplicar`. */
export interface CuerpoDuplicado {
  nombre: string
  copiar: SeleccionDeCopia
}

/**
 * Arma el cuerpo del duplicado a partir de lo que hay en el formulario.
 *
 * El nombre viaja SIEMPRE, aunque sea el mismo del original: el campo esta a la vista y prellenado,
 * asi que lo que la persona lee es lo que tiene que crearse. Omitirlo cuando coincide con el
 * original ahorraria una clave y abriria la puerta a que un espacio de mas cambie el resultado.
 *
 * `copiar` se reconstruye clave por clave en vez de reenviar el objeto del estado: la API rechaza
 * con `copiar.<x>: desconocido` cualquier clave que no conozca, y asi un campo de mas que alguien
 * agregue al estado del formulario no se cuela en el cuerpo.
 *
 * Solo recorta el nombre. El largo lo vuelve a validar la API, que es la que manda: repetir aca sus
 * reglas seria mantener dos validaciones que se desincronizan.
 *
 * @param nombre    lo que hay escrito en el campo
 * @param seleccion las casillas marcadas
 * @returns el cuerpo listo para `escribirEnBff`
 */
export function cuerpoDeDuplicado (nombre: string, seleccion: SeleccionDeCopia): CuerpoDuplicado {
  return { nombre: nombre.trim(), copiar: seleccionUniforme(false, seleccion) }
}
