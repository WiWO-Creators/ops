import { mensajeDeRespuesta } from './cliente.ts'
import type { CuerpoRedaccion } from '../dominio/descripcion-tarea.ts'

/**
 * El cliente de red del asistente que redacta la descripcion de una Tarea.
 *
 * Son dos llamadas a la misma ruta y las dos viven aca —y no en `datos/cliente.ts` ni en
 * `componentes/datos/mutaciones.ts`— por dos motivos que el resto del panel no comparte:
 *
 *  1. **La sonda no puede avisar nada.** `pedirRespuesta()` levanta el aviso flotante de "se perdio
 *     la conexion" cuando el `fetch` lanza, y esta consulta la hace TODO formulario de Tarea al
 *     abrirse, con la IA contratada o sin ella. Un panel que saluda con un cartel rojo porque una
 *     funcion opcional no esta disponible es peor que no tener la funcion.
 *  2. **La redaccion necesita poder abortarse.** `escribirEnBff()` no acepta señal: una vez lanzada
 *     no hay forma de soltarla, y esta es la unica escritura del panel que espera a un modelo. Sin
 *     aborto, el unico final posible de una llamada que no vuelve es un spinner eterno.
 *
 * Ninguna de las dos guarda nada: el POST devuelve texto para que la persona lo lea, lo corrija o lo
 * tire. Lo que decide si el texto entra al campo es el formulario, nunca esta capa.
 */

/** La ruta del asistente en la API, sin la base del BFF. La misma para la sonda y la redaccion. */
export const RUTA_DESCRIPCION = 'ia/tareas/describir'

/**
 * Techo de espera de la redaccion, en milisegundos.
 *
 * Sale de lo que la API puede tardar en el peor caso legitimo, no de un numero redondo: `IA\Cliente`
 * usa 45 s de tope total sin streaming y se permite **un** reintento a 1 s, o sea 91 s de respuesta
 * valida todavia en vuelo. Cortar antes de eso tiraria trabajo ya pagado al proveedor. Los 9 s de
 * margen cubren el salto por el BFF.
 *
 * Es un techo de seguridad, no el camino normal de salida: quien no quiere esperar tiene el boton de
 * cancelar, que aborta en el acto.
 */
export const ESPERA_MAXIMA_MS = 100_000

/** Lo que devuelve un intento de redaccion. `motivo` distingue los tres finales que la pantalla muestra distinto. */
export type ResultadoRedaccion =
  | { ok: true, descripcion: string }
  | { ok: false, motivo: 'cancelada' }
  | { ok: false, motivo: 'espera' | 'error', mensaje: string }

/** Lo que contesta el `GET` de la ruta. */
interface SobreDisponibilidad {
  data?: { disponible?: unknown }
}

/** Lo que contesta el `POST` de la ruta. */
interface SobreRedaccion {
  data?: { descripcion?: unknown }
}

/**
 * `GET /ia/tareas/describir`: si esta persona puede usar el asistente.
 *
 * Todo lo que no sea un `disponible: true` explicito es un `false`. Los tres motivos por los que
 * puede no venir —capa de IA apagada (404 de la puerta comun de `/ia/*`), persona sin permiso para
 * escribir Tareas, o la red caida— terminan en lo mismo: el boton no se ofrece. Distinguirlos solo
 * serviria para mostrar tres carteles sobre una funcion que igual no va a estar.
 *
 * @param senal señal del componente, para soltar la consulta si se desmonta
 * @returns `true` solo cuando la API lo afirma
 */
export async function consultarDisponibilidad (senal: AbortSignal): Promise<boolean> {
  try {
    const respuesta = await fetch(`/api/bff/${RUTA_DESCRIPCION}`, { signal: senal })

    if (!respuesta.ok) return false

    const sobre = await respuesta.json() as SobreDisponibilidad

    return sobre.data?.disponible === true
  } catch {
    return false
  }
}

/**
 * `POST /ia/tareas/describir`: redacta la descripcion con lo que se contesto.
 *
 * No lanza: cada final tiene su `motivo`, porque los tres se muestran distinto. Un fallo no toca
 * nada de lo que la persona escribio —ni el cuestionario ni el campo del formulario—, asi que
 * reintentar es apretar el boton de nuevo.
 *
 * @param cuerpo el pedido que arma `cuerpoDeRedaccion()`
 * @param senal señal del dialogo, para que cancelar o cerrar aborte la llamada en el acto
 * @param esperaMs techo de espera; solo se baja en las pruebas, donde esperar 100 s no es una prueba
 * @returns el texto redactado, o el motivo por el que no hay texto
 */
export async function redactarDescripcion (
  cuerpo: CuerpoRedaccion,
  senal: AbortSignal,
  esperaMs: number = ESPERA_MAXIMA_MS
): Promise<ResultadoRedaccion> {
  // Dos señales en una: la del dialogo (cancelar, cerrar, desmontar) y el techo de espera. Sin el
  // techo, una respuesta que no llega nunca deja el "Redactando…" para siempre.
  const vigilada = AbortSignal.any([senal, AbortSignal.timeout(esperaMs)])
  let respuesta: Response

  try {
    respuesta = await fetch(`/api/bff/${RUTA_DESCRIPCION}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: vigilada
    })
  } catch {
    // Quien aborto decide el mensaje: si la señal de afuera ya estaba abortada fue la persona, y a
    // una accion que uno mismo cancela no se le pone un cartel de error encima.
    if (senal.aborted) return { ok: false, motivo: 'cancelada' }

    if (vigilada.aborted) {
      return {
        ok: false,
        motivo: 'espera',
        mensaje: `El asistente no respondió en ${Math.max(1, Math.round(esperaMs / 1000))} segundos. `
          + 'Lo que contestaste sigue acá: puedes intentarlo de nuevo.'
      }
    }

    return {
      ok: false,
      motivo: 'error',
      mensaje: 'No se pudo contactar al servidor. Revisa tu conexión e inténtalo de nuevo.'
    }
  }

  if (!respuesta.ok) return { ok: false, motivo: 'error', mensaje: await mensajeDeRespuesta(respuesta) }

  try {
    const sobre = await respuesta.json() as SobreRedaccion

    if (typeof sobre.data?.descripcion !== 'string' || sobre.data.descripcion.trim() === '') {
      return {
        ok: false,
        motivo: 'error',
        mensaje: 'El asistente devolvió una respuesta vacía. Inténtalo de nuevo.'
      }
    }

    return { ok: true, descripcion: sobre.data.descripcion }
  } catch {
    return {
      ok: false,
      motivo: 'error',
      mensaje: 'El asistente devolvió una respuesta que no se pudo leer. Inténtalo de nuevo.'
    }
  }
}
