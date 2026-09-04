import { mensajeConDetalles } from './errores.ts'
import type { Sobre } from './tipos'

/** Forma del envelope de error del contrato, tal como llega al navegador. */
interface SobreError {
  error?: { code?: string, message?: string, details?: Record<string, string[]> }
}

/**
 * Pide una ruta al BFF y devuelve la respuesta cruda.
 *
 * Sirve a quien necesita el codigo de estado —distinguir un 404 de un 500 cambia lo que se muestra—
 * y no solo el dato.
 *
 * @param ruta Ruta sin la base del BFF ni barra inicial. Ej: `tasks/12/timers`.
 * @param senal Señal para abortar cuando el componente se desmonta.
 * @returns La respuesta, con `ok` sin revisar.
 */
export async function pedirRespuesta (ruta: string, senal: AbortSignal): Promise<Response> {
  return await fetch(`/api/bff/${ruta}`, { signal: senal })
}

/**
 * Mensaje legible de una respuesta con error.
 *
 * Cae a un generico cuando el cuerpo no es el envelope: un 502 del proxy devuelve HTML, y mostrar ese
 * HTML es peor que decir el codigo.
 *
 * @param respuesta La respuesta fallida.
 * @returns El mensaje del contrato, o uno propio con el codigo de estado.
 */
export async function mensajeDeRespuesta (respuesta: Response): Promise<string> {
  try {
    const cuerpo = await respuesta.json() as SobreError

    if (cuerpo.error?.message !== undefined) {
      return mensajeConDetalles({ message: cuerpo.error.message, details: cuerpo.error.details })
    }
  } catch {
    // Se cae al mensaje generico de abajo.
  }

  return `El servidor respondió ${respuesta.status}`
}

/**
 * Pide una ruta al BFF y devuelve el envelope ya tipado.
 *
 * @param ruta Ruta sin la base del BFF ni barra inicial. Ej: `lookups`.
 * @param senal Señal para abortar cuando el componente se desmonta.
 * @returns El envelope: `data` y, en los listados, `meta.pagination`.
 * @throws Error con el mensaje ya legible si la respuesta no es correcta.
 */
export async function pedirSobre<T> (ruta: string, senal: AbortSignal): Promise<Sobre<T>> {
  const respuesta = await pedirRespuesta(ruta, senal)

  if (!respuesta.ok) throw new Error(await mensajeDeRespuesta(respuesta))

  return await respuesta.json() as Sobre<T>
}
