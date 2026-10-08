import { useRef } from 'react'
import { claveDeIdempotencia } from '../../datos/red.ts'

/** La clave vigente y la huella del cuerpo para el que se genero. */
export interface ClaveConHuella {
  huella: string
  clave: string
}

/**
 * Decide la clave de idempotencia de un envio.
 *
 * Mientras el cuerpo no cambie se reutiliza la clave anterior: si la primera vez no llego respuesta,
 * volver a enviar le dice al servidor que es la misma intencion y no la repite. Un cuerpo distinto es
 * otra intencion y recibe una clave nueva.
 *
 * @param actual lo guardado del envio anterior, o `null`
 * @param cuerpo lo que se va a enviar; se compara por su JSON
 * @param generar fabrica de claves, inyectable para probar
 * @returns la clave a usar y lo que hay que guardar para el proximo envio
 */
export function claveParaCuerpo (
  actual: ClaveConHuella | null,
  cuerpo: unknown,
  generar: () => string = claveDeIdempotencia
): ClaveConHuella {
  const huella = JSON.stringify(cuerpo)

  return actual?.huella === huella ? actual : { huella, clave: generar() }
}

/** Lo que devuelve {@link useClaveEstable}. */
export interface ClaveEstable {
  /** Clave para enviar este cuerpo; la misma mientras el cuerpo no cambie. */
  claveDe: (cuerpo: unknown) => string
  /** Olvida la clave: la intencion termino bien y la proxima es otra. */
  olvidar: () => void
}

/**
 * Clave de idempotencia estable para un formulario de alta.
 *
 * @returns como pedir la clave de un cuerpo y como olvidarla al terminar
 */
export function useClaveEstable (): ClaveEstable {
  const guardada = useRef<ClaveConHuella | null>(null)

  return {
    claveDe: (cuerpo) => {
      guardada.current = claveParaCuerpo(guardada.current, cuerpo)

      return guardada.current.clave
    },
    olvidar: () => { guardada.current = null }
  }
}
