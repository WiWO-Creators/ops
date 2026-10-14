import { escribirEnBff } from '@/componentes/datos/mutaciones'
import {
  destinoDeImagenRica, motivoParaNoSubirImagen, nombreDeCaptura, srcDeImagenRica, textoAlternativoDe
} from '@/dominio/imagenes-ricas'

/** A donde se ata la imagen y por que puerta entra. */
export interface DestinoDeImagenes {
  /** `true` si quien escribe es un contacto del portal: sube por `portal/imagenes-texto`. */
  portal: boolean
  /**
   * El Espacio del texto. Obligatorio en el portal; en el panel, `null` para un ticket sin Espacio.
   * La API mide el alcance de la imagen contra este Espacio.
   */
  proyectoId: number | null
}

/** Lo que devuelve la subida: el `src` y el `alt` para el `<img>`, o el motivo legible. */
export type ResultadoDeSubida =
  | { ok: true, src: string, alt: string }
  | { ok: false, mensaje: string }

/** El `data` de `POST imagenes-texto`. */
interface RespuestaDeImagen {
  codigo: string
  src: string
}

/**
 * Sube una imagen pegada o arrastrada y devuelve lo que hay que insertar en el texto.
 *
 * Nunca lanza: el motivo (formato, tamaño, permisos, tope por hora) vuelve como mensaje. Valida antes
 * del viaje con las mismas reglas que la API, que vuelve a validar mirando los bytes.
 *
 * @param archivo la imagen
 * @param destino quien sube y a que Espacio se ata
 * @returns `src` y `alt`, o el mensaje de error
 */
export async function subirImagenRica (archivo: File, destino: DestinoDeImagenes): Promise<ResultadoDeSubida> {
  const motivo = motivoParaNoSubirImagen(archivo)

  if (motivo !== null) return { ok: false, mensaje: motivo }

  const { ruta, proyecto } = destinoDeImagenRica(destino.portal, destino.proyectoId)

  if (destino.portal && proyecto === null) {
    return { ok: false, mensaje: 'No se puede subir la imagen: falta elegir el proyecto.' }
  }

  const nombre = nombreDeCaptura(archivo)
  const formulario = new FormData()

  formulario.append('image', archivo, nombre)
  if (proyecto !== null) formulario.append('project_id', proyecto)

  const resultado = await escribirEnBff<RespuestaDeImagen>(ruta, 'POST', formulario)

  if (!resultado.ok) return { ok: false, mensaje: resultado.mensaje }

  // El `src` se reconstruye desde el codigo y no se toma de la red tal cual: lo que no tenga la forma
  // esperada no entra al documento.
  const src = srcDeImagenRica(resultado.datos.codigo)

  return src === null
    ? { ok: false, mensaje: 'El servidor devolvió una imagen que no se puede usar.' }
    : { ok: true, src, alt: textoAlternativoDe(nombre) }
}
