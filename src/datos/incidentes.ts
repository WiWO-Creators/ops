import 'server-only'

import { llamarApiTipado } from './api'
import { leerSesion } from './sesion'
import type { Sujeto } from './sobre-sesion'

/** Topes de la API para cada campo del reporte (`RecursoIncidentes`). Se recorta aca para no gastar un 422. */
const TOPES = { tipo: 190, mensaje: 2000, uri: 255, metodo: 10, traza: 8000 } as const

/**
 * Lo que se cuenta de un error que la API no vio.
 *
 * Es el cuerpo de `POST /incidentes` sin el `origen`, que lo pone quien registra segun la sesion con
 * la que pide: el mismo reporte enviado por un contacto del portal y por alguien del equipo no es el
 * mismo incidente, y adivinarlo desde el navegador seria dejar que el navegador lo declare.
 */
export interface ReporteDeIncidente {
  /** Clase del error: `TypeError`, `PantallaCaida`, `RespuestaDeApi`. */
  tipo: string
  mensaje: string
  /** Donde paso: la ruta de la vista o el endpoint que fallo. */
  uri?: string
  /** Metodo de la accion que fallo, o `VISTA` cuando lo que se cayo es una pantalla. */
  metodo?: string
  traza?: string
}

/** Lo unico que devuelve el alta: el codigo de ocho hexadecimales que la persona ve y reporta. */
interface AltaDeIncidente {
  incidente: string
}

/**
 * Registra un incidente contra la API y devuelve su codigo.
 *
 * Existe porque la API solo se enteraba de sus propios 500. Todo lo demas que corta la accion de una
 * persona —una pantalla que se cae al renderizar, un 403 que nadie esperaba, la API inalcanzable— no
 * dejaba rastro en ningun lado, y quien lo sufria no tenia nada que reportar mas que «no funciona».
 *
 * **Nunca lanza.** Se llama justo cuando algo ya se rompio: si el registro tambien falla, lo que
 * corresponde es mostrar el error sin codigo, no tapar el error original con un segundo error. El
 * fallo queda en el log del servidor, que es el unico rastro que no depende de la API.
 *
 * @param reporte que paso, tal como se va a guardar
 * @param sujeto de quien es la sesion con la que registrar; decide tambien el `origen` de la fila
 * @returns el codigo del incidente, o `null` si no habia sesion o la API no lo pudo guardar
 */
export async function registrarIncidente (
  reporte: ReporteDeIncidente,
  sujeto: Sujeto = 'staff'
): Promise<string | null> {
  const sesion = await leerSesion(sujeto)

  // Sin sesion no hay a quien atribuir el incidente y la API responde 401. Pasa en la pantalla de
  // acceso y en la ficha publica de una Tarea, donde el error igual se muestra, solo sin codigo.
  if (sesion === null) return null

  try {
    const { data } = await llamarApiTipado<AltaDeIncidente>('/incidentes', {
      metodo: 'POST',
      token: sesion.acceso,
      cuerpo: {
        origen: sujeto === 'contacto' ? 'portal' : 'panel',
        tipo: recortar(reporte.tipo, TOPES.tipo),
        mensaje: recortar(reporte.mensaje, TOPES.mensaje),
        uri: recortar(reporte.uri ?? '', TOPES.uri),
        metodo: recortar(reporte.metodo ?? '', TOPES.metodo),
        traza: recortar(reporte.traza ?? '', TOPES.traza)
      }
    })

    return data.incidente
  } catch (fallo) {
    console.error('[incidentes] no se pudo registrar el reporte', fallo)

    return null
  }
}

/** Recorta al tope de la columna. Un reporte de mas no se rechaza: se guarda cortado. */
function recortar (texto: string, largo: number): string {
  return texto.length <= largo ? texto : `${texto.slice(0, largo - 1)}…`
}
