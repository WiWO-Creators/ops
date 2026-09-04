/**
 * Enlaces al panel clasico (Perfex).
 *
 * Toda pantalla nueva de Ops ofrece la salida al panel viejo mientras la migracion no termine: hay
 * operaciones que todavia solo viven alli, y esconder esa puerta obliga a buscar la URL a mano.
 *
 * El dominio **no se escribe aca**: sale de `NEXT_PUBLIC_BOARD_URL`, porque cambia entre local,
 * staging y produccion, y hardcodearlo es lo que la regla del proyecto prohibe. Es publica a
 * proposito: el enlace se pinta en el navegador. Sin la variable la funcion devuelve `null` y quien
 * la llama no dibuja el enlace — uno que lleva a un 404 promete una salida que no existe.
 *
 * Sin dependencias de Next ni de React: se prueba con el runner de Node.
 */

/** Entidades del panel clasico a las que hoy se puede saltar. */
export type EntidadClasica = 'espacios' | 'espacio' | 'proceso' | 'espacio-cliente'

/**
 * Rutas de Perfex, sin barra inicial. Un solo mapa: agregar una entidad es una linea.
 *
 * `espacio-cliente` es la ficha del Proyecto en el area de clientes, que es lo que ve un contacto.
 */
const RUTAS: Record<EntidadClasica, (id: number) => string> = {
  espacios: () => 'admin/projects',
  espacio: (id) => `admin/projects/view/${id}`,
  proceso: (id) => `admin/tasks/view/${id}`,
  'espacio-cliente': (id) => `clients/project/${id}`
}

/**
 * URL de una entidad en el panel clasico.
 *
 * @param entidad Que se quiere abrir alla.
 * @param id Id de la entidad, el mismo que usa la API. Se ignora en las rutas de listado.
 * @param base Origen del panel clasico, sin barra final. Por defecto, `NEXT_PUBLIC_BOARD_URL`.
 * @returns La URL absoluta, o `null` si no hay dominio configurado o el id no sirve.
 */
export function urlClasica (
  entidad: EntidadClasica,
  id?: number | null,
  base: string | undefined = process.env.NEXT_PUBLIC_BOARD_URL
): string | null {
  if (typeof base !== 'string' || base.trim() === '') return null

  const identificador = Number(id ?? 0)

  if (entidad !== 'espacios' && (!Number.isInteger(identificador) || identificador <= 0)) return null

  return `${base.trim().replace(/\/+$/, '')}/${RUTAS[entidad](identificador)}`
}
