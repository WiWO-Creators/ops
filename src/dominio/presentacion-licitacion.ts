/**
 * Reglas del link a la carpeta de la propuesta de una Licitacion (`presentacion_url`, migracion `0990`).
 *
 * Viven en un `.ts` sin JSX para poder probarlas con `node --test`. Espejan la validacion de
 * `Licitacion::enlace()` en la API: si el panel dejara pasar algo que la API rechaza, quien pega el
 * link se enteraria recien con el 422.
 */

/** Largo maximo del link: el de la columna `presentacion_url`. */
export const LARGO_MAXIMO_ENLACE = 2048

/** Resultado de revisar un link: el link limpio, o el motivo del rechazo. */
export type RevisionDeEnlace = { valido: true, url: string | null } | { valido: false, error: string }

/**
 * Revisa el texto que alguien pego como link de la carpeta.
 *
 * Vacio vale `null` (quitar el link). Solo se aceptan `http` y `https`: el link se pinta como
 * `<a href>`, y un `javascript:` ahi seria codigo corriendo con la sesion de quien hace clic.
 *
 * @param texto Lo que se escribio en el campo, sin recortar.
 * @returns El link recortado (o `null`), o el mensaje que se le muestra a la persona.
 */
export function revisarEnlaceDePresentacion (texto: string): RevisionDeEnlace {
  const url = texto.trim()

  if (url === '') return { valido: true, url: null }

  if (url.length > LARGO_MAXIMO_ENLACE) {
    return { valido: false, error: `El link no puede pasar de ${LARGO_MAXIMO_ENLACE} caracteres.` }
  }

  let protocolo: string
  try {
    protocolo = new URL(url).protocol
  } catch {
    return { valido: false, error: 'Pega el link completo, empezando con https://.' }
  }

  if (protocolo !== 'http:' && protocolo !== 'https:') {
    return { valido: false, error: 'El link tiene que empezar con http:// o https://.' }
  }

  return { valido: true, url }
}

/**
 * Nombre del servicio donde vive la carpeta, para rotular el boton.
 *
 * @param url Un link ya validado.
 * @returns "Google Slides", "Google Drive", etc., o `null` si no es un servicio conocido.
 */
export function servicioDelEnlace (url: string): string | null {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }

  if (host === 'docs.google.com') {
    return new URL(url).pathname.startsWith('/presentation') ? 'Google Slides' : 'Google Docs'
  }
  if (host === 'drive.google.com') return 'Google Drive'
  if (host.endsWith('canva.com')) return 'Canva'
  if (host.endsWith('sharepoint.com') || host === 'onedrive.live.com' || host === '1drv.ms') return 'OneDrive'

  return null
}
