import { avisarError } from '../lib/aviso-de-error.ts'
import {
  incidenteDe,
  leerCuerpoDeError,
  mensajeConDetalles,
  registrarFallaSinIncidente,
  type PeticionFallida
} from './errores.ts'
import type { Sobre } from './tipos'

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
  try {
    return await fetch(`/api/bff/${ruta}`, { signal: senal })
  } catch (fallo) {
    // Un `fetch` que lanza es la red, no la API: el servidor no contesto, asi que no hay incidente
    // que registrar —el reporte viajaria por la misma red que acaba de fallar— y el aviso sale sin
    // codigo. Se avisa igual porque quien pierde la conexion a mitad de una accion necesita saber
    // que la accion no ocurrio.
    //
    // El aborto no es un error: lo dispara el propio componente al desmontarse, y avisar de eso
    // llenaria la pantalla de avisos cada vez que alguien cambia de pestaña.
    if (!esAborto(fallo)) {
      avisarError({ mensaje: 'Se perdió la conexión con el servidor. La acción no se completó.' })
    }

    throw fallo
  }
}

/** `true` si el fallo lo causo un `AbortController` y no un problema de red. */
function esAborto (fallo: unknown): boolean {
  return fallo instanceof DOMException && fallo.name === 'AbortError'
}

/**
 * Mensaje legible de una respuesta con error.
 *
 * Cae a un generico cuando el cuerpo no es el envelope: un 502 del proxy devuelve HTML, y mostrar ese
 * HTML es peor que decir el codigo. Ese 502 ademas se registra desde aca como incidente, porque el
 * BFF nunca lo vio —ver {@link registrarFallaSinIncidente}—.
 *
 * @param respuesta La respuesta fallida.
 * @param peticion Metodo y ruta de la peticion, para el incidente si hay que registrarlo.
 * @returns El mensaje del contrato, o uno propio con el codigo de estado.
 */
export async function mensajeDeRespuesta (respuesta: Response, peticion: PeticionFallida = {}): Promise<string> {
  const cuerpo = await leerCuerpoDeError(respuesta)
  const error = cuerpo.sobre?.error
  const incidente = incidenteDe(error?.details)

  if (error?.message === undefined) {
    const mensaje = `El servidor respondió ${respuesta.status}`
    await registrarFallaSinIncidente(respuesta, cuerpo, mensaje, peticion)

    return mensaje
  }

  const mensaje = mensajeConDetalles({ message: error.message, details: error.details })

  // El aviso flotante sale ademas del mensaje que muestre la pantalla, y no en su lugar: el mensaje
  // explica que paso ahi mismo, donde la persona estaba mirando, y el aviso es el unico lugar donde
  // aparece el codigo del incidente para poder reportarlo. Solo sale cuando hay codigo, y el codigo
  // lo pone el BFF unicamente en los errores que valia la pena registrar: un 422 de formulario o un
  // 401 de sesion no llegan aca con uno. Un 5xx que llega sin codigo lo registra el navegador.
  if (incidente !== undefined) {
    avisarError({ mensaje, incidente })
  } else {
    await registrarFallaSinIncidente(respuesta, cuerpo, mensaje, peticion)
  }

  return mensaje
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

  if (!respuesta.ok) throw new Error(await mensajeDeRespuesta(respuesta, { metodo: 'GET', ruta: `/api/bff/${ruta}` }))

  return await respuesta.json() as Sobre<T>
}

/** El tope de `per_page` que acepta la API (`Consulta::POR_PAGINA_MAXIMO`): pedir mas no trae mas. */
const POR_PAGINA_MAXIMO = 500

/**
 * Pide un listado entero, pagina por pagina, hasta agotar `meta.pagination.total_pages`.
 *
 * Existe para los combos que tienen que ofrecer el catalogo completo: con una sola pagina, lo que
 * cae despues del tope simplemente no esta, y quien lo busca concluye que no existe. Si la respuesta
 * no trae paginacion se queda con la primera, que entonces es todo.
 *
 * @param ruta Ruta sin la base del BFF ni barra inicial; puede traer ya su query string.
 * @param senal Señal para abortar cuando el componente se desmonta.
 * @returns Todas las filas, en el orden en que la API las pagino.
 * @throws Error con el mensaje ya legible si alguna pagina falla.
 */
export async function pedirTodasLasPaginas<T> (ruta: string, senal: AbortSignal): Promise<T[]> {
  const union = ruta.includes('?') ? '&' : '?'
  const filas: T[] = []
  let pagina = 1
  let ultima = 1

  do {
    const sobre = await pedirSobre<T[]>(`${ruta}${union}per_page=${POR_PAGINA_MAXIMO}&page=${pagina}`, senal)
    filas.push(...sobre.data)
    ultima = sobre.meta?.pagination?.total_pages ?? 1
    pagina++
  } while (pagina <= ultima)

  return filas
}
