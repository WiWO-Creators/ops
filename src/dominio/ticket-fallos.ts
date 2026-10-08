/**
 * Que le decimos a la persona cuando la API rechaza una accion sobre un ticket (tope de envios,
 * edicion no permitida, ticket cerrado) y cuanto debe esperar para reintentar.
 */

/** Que se estaba haciendo cuando la API dijo que no. Cambia como se explica el mismo codigo. */
export type AccionDeTicket = 'responder' | 'crear' | 'cerrar' | 'reabrir' | 'editar'

/** Un rechazo de la API, con lo que `escribirEnBff` deja ver de el. */
export interface RechazoDeTicket {
  mensaje: string
  estado?: number
  codigo?: string
  detalles?: Record<string, unknown>
  reintentarEnSegundos?: number | null
}

/**
 * Motivos de un 422 de `PATCH /tickets/{id}` y del vinculo con una Tarea que merecen una frase
 * propia: el generico diria «Proyecto otro cliente», que no explica que hacer.
 */
const MOTIVOS_DE_EDICION: Record<string, string> = {
  otro_cliente: 'Lo elegido es de otro cliente que el del ticket.',
  otro_espacio: 'La Tarea es de otro Proyecto que el del ticket.',
  no_visible: 'No tienes acceso a lo que elegiste.',
  ticket_sin_cliente: 'El ticket no tiene cliente: asígnale uno antes.'
}

/**
 * La primera frase propia que corresponda a los `details` de un 422, si hay alguna.
 *
 * @param detalles `{ campo: [motivo, ...] }`
 * @returns la frase, o `null` para usar el mensaje de la API
 */
function motivoDeEdicion (detalles: Record<string, unknown> | undefined): string | null {
  for (const motivos of Object.values(detalles ?? {})) {
    if (!Array.isArray(motivos)) continue

    for (const motivo of motivos) {
      const frase = typeof motivo === 'string' ? MOTIVOS_DE_EDICION[motivo] : undefined

      if (frase !== undefined) return frase
    }
  }

  return null
}

/** El rechazo explicado para la persona, y cuanto esperar si es un tope. */
export interface FalloDeTicket {
  texto: string
  /** Segundos hasta poder reintentar, en un 429. `null` si no hay que esperar o no se sabe. */
  esperarSegundos: number | null
}

/**
 * Explica un rechazo de la API segun su codigo y lo que se estaba haciendo.
 *
 * Los 409 del contrato son carreras: el ticket cambio mientras la persona miraba. El texto dice que
 * paso y que lo escrito sigue ahi, en vez del mensaje tecnico. El 429 dice cuanto esperar. Todo lo
 * demas usa el mensaje de la API, que ya viene legible.
 *
 * @param rechazo lo que devolvio `escribirEnBff`
 * @param accion lo que se estaba haciendo
 * @returns el texto y, si corresponde, la espera
 */
export function falloDeTicket (rechazo: RechazoDeTicket, accion: AccionDeTicket): FalloDeTicket {
  const sinEspera = (texto: string): FalloDeTicket => ({ texto, esperarSegundos: null })

  switch (rechazo.codigo) {
    case 'ticket_cerrado':
      return sinEspera(accion === 'cerrar'
        ? 'Este ticket ya estaba cerrado.'
        : 'El ticket se cerró mientras escribías. Tu mensaje sigue aquí.')
    case 'ticket_sin_respuesta_del_equipo':
      return sinEspera('El equipo aún no responde tu ticket; podrás responder cuando lo haga. Tu mensaje sigue aquí.')
    case 'ticket_abierto':
      return sinEspera('Este ticket ya está abierto.')
    case 'reapertura_vencida':
      return sinEspera('Pasó demasiado tiempo desde el cierre para reabrirla. Si el problema sigue, abre un ticket nuevo.')
    case 'rate_limited':
      return { texto: textoDeTope(accion, rechazo.reintentarEnSegundos ?? null), esperarSegundos: rechazo.reintentarEnSegundos ?? null }
    default:
      return sinEspera((rechazo.estado === 422 ? motivoDeEdicion(rechazo.detalles) : null) ?? rechazo.mensaje)
  }
}

/**
 * El aviso de un 429, con la espera en palabras.
 *
 * @param accion responder o crear, que son los dos topes del portal
 * @param segundos cuanto falta, si la API lo dijo
 * @returns la frase para la persona
 */
function textoDeTope (accion: AccionDeTicket, segundos: number | null): string {
  const que = accion === 'crear' ? 'Enviaste muchos tickets seguidos.' : 'Enviaste muchas respuestas seguidas.'

  if (segundos === null || segundos <= 0) return `${que} Espera un rato antes de volver a intentarlo.`

  const minutos = Math.ceil(segundos / 60)

  return `${que} Podrás volver a intentarlo en ${minutos === 1 ? '1 minuto' : `${minutos} minutos`}.`
}

/**
 * Segundos de espera de un 429: de `details.reintentar_en_segundos` o, si no, de `Retry-After`.
 *
 * @param detalles los `details` del error
 * @param cabecera el valor de `Retry-After`, si llego
 * @returns los segundos, o `null` si ninguno dice nada util
 */
export function segundosParaReintentar (detalles: unknown, cabecera: string | null): number | null {
  if (detalles !== null && typeof detalles === 'object' && 'reintentar_en_segundos' in detalles) {
    const valor = Number(detalles.reintentar_en_segundos)

    if (Number.isFinite(valor) && valor > 0) return Math.ceil(valor)
  }

  const deCabecera = Number(cabecera)

  return cabecera !== null && Number.isFinite(deCabecera) && deCabecera > 0 ? Math.ceil(deCabecera) : null
}
