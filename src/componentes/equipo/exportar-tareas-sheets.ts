/**
 * Extrae el identificador de una carpeta de Drive, desde su enlace o su ID.
 * @param entrada Enlace copiado de Drive o identificador sin URL.
 * @returns El ID de carpeta, o null si el valor no identifica una carpeta de Google Drive.
 */
export function idCarpetaDrive (entrada: string): string | null {
  const texto = entrada.trim()
  const identificador = /^[a-zA-Z0-9_-]{10,200}$/
  if (identificador.test(texto)) return texto

  try {
    const url = new URL(texto)
    if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com' || url.username || url.password || url.port) return null
    const coincidencia = /^\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)\/?$/.exec(url.pathname)
    const id = coincidencia?.[1] ?? ''
    return identificador.test(id) ? id : null
  } catch {
    return null
  }
}

/** Resultado de la creación de una hoja nueva; compartir puede fallar sin perder la exportación. */
export interface HojaDeTareas {
  id: string
  url: string
  name: string
  total: number
  compartida: boolean
  advertencia?: string
}
