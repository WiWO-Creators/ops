/**
 * Lleva un texto a su forma comparable: sin acentos, en minusculas y sin espacios en los bordes.
 *
 * Sin esto, "nunez" no encuentra a "Núñez" y quien busca concluye que la persona no esta en el
 * sistema. Es el caso normal, no el borde: nadie escribe los acentos al filtrar una lista.
 *
 * @param texto lo que se escribio o el nombre a comparar
 * @returns el texto comparable
 */
export function normalizar (texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

/**
 * Las opciones donde aparece TODO lo que se escribio en el buscador de un selector.
 *
 * `normalizar` saca acentos y mayusculas antes de comparar: sin eso "nunez" no encuentra "Núñez" ni
 * "logistica" encuentra "Logística". Nadie escribe los acentos al filtrar; es el caso normal.
 *
 * Se parte lo escrito en palabras y cada una tiene que aparecer en ALGUNO de los textos de la
 * opcion, en cualquier orden: "rios ana" encuentra a "Ana Ríos", y "campaña consalud" encuentra la
 * campaña aunque "Consalud" venga del Cliente y no del nombre. Cada palabra se busca dentro de un
 * texto, nunca a caballo entre dos, para que el final del nombre y el principio del Cliente no
 * inventen una coincidencia.
 *
 * Busca por subcadena y no por prefijo porque los nombres del catalogo empiezan casi todos igual
 * ("Proyecto ACME", "Proyecto DELCO"): con prefijo habria que escribir el nombre entero para llegar
 * a lo que lo distingue. Una busqueda vacia —o de solo espacios— devuelve todo.
 *
 * @param opciones la lista completa, tal como llego de la API
 * @param busqueda lo tipeado
 * @param textosDe los textos donde se busca en cada opcion; los ausentes o `null` se saltan
 * @returns las que coinciden, en el mismo orden en que llegaron
 */
export function filtrarPorPalabras <T> (
  opciones: readonly T[],
  busqueda: string,
  textosDe: (opcion: T) => ReadonlyArray<string | null | undefined>
): T[] {
  const palabras = normalizar(busqueda).split(/\s+/).filter((palabra) => palabra !== '')

  if (palabras.length === 0) return [...opciones]

  return opciones.filter((opcion) => {
    const textos = textosDe(opcion)
      .filter((texto): texto is string => typeof texto === 'string' && texto !== '')
      .map(normalizar)

    return palabras.every((palabra) => textos.some((texto) => texto.includes(palabra)))
  })
}

/**
 * Filtra una lista de personas del equipo por su nombre. Ver `filtrarPorPalabras`.
 *
 * @param personas lista completa
 * @param busqueda lo tipeado
 * @returns las que coinciden, en el mismo orden que llegaron
 */
export function filtrarPersonas <T extends { full_name: string }> (personas: readonly T[], busqueda: string): T[] {
  return filtrarPorPalabras(personas, busqueda, (persona) => [persona.full_name])
}
