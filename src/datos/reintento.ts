import type { Resultado } from '../componentes/datos/mutaciones.ts'
import { claveDeIdempotencia } from './red.ts'

/**
 * Escrituras que sobreviven a una red lenta.
 *
 * Cuando una escritura sale y no vuelve respuesta, el servidor pudo haberla aplicado. Revertir la
 * pantalla a ciegas dice "no se guardó" sobre algo que sí se guardó; repetirla a ciegas duplica. Aca
 * se hace lo seguro: reintentar con la MISMA clave de idempotencia —el servidor devuelve lo ya hecho
 * en vez de repetirlo—, y antes de rendirse comprobar el estado real.
 */

/** Esperas entre un intento y el siguiente, en milisegundos. */
export const ESPERAS_DE_REINTENTO_MS: readonly number[] = [1000, 3000]

/** Cómo terminó una mutación. */
export type ResultadoDeMutacion<T> = Resultado<T> & {
  /** `true` si no hubo respuesta pero la comprobación del estado real confirmó que se aplicó. */
  verificada?: boolean
}

/** Opciones de {@link mutarConReintento}. */
export interface OpcionesDeReintento {
  /** Verbo de la escritura: un `POST` sin idempotencia en el servidor no se reintenta. */
  metodo: 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  /** Lee el estado real; `true` si ya refleja lo pedido. Sin esto una escritura incierta queda incierta. */
  yaAplicada?: () => Promise<boolean>
  /** Esperas entre intentos; por defecto {@link ESPERAS_DE_REINTENTO_MS}. */
  esperas?: readonly number[]
  /** Espera inyectable, para probar sin reloj. */
  esperar?: (ms: number) => Promise<void>
  /** Si el servidor ya soporta `Idempotency-Key` en los `POST`; por defecto lo dice el entorno. */
  servidorIdempotente?: boolean
}

/** `true` si el servidor desplegado repite en vez de duplicar un `POST` con la misma clave. */
export function servidorIdempotente (): boolean {
  return process.env.NEXT_PUBLIC_IDEMPOTENCIA_SERVIDOR === '1'
}

/** Espera real. */
async function dormir (ms: number): Promise<void> {
  await new Promise<void>((resolver) => setTimeout(resolver, ms))
}

/**
 * Ejecuta una escritura y, si no llega respuesta, comprueba y reintenta con la misma clave.
 *
 * @param enviar manda la escritura con la clave que recibe; debe usarla en cada intento
 * @param opciones ver {@link OpcionesDeReintento}
 * @returns el resultado definitivo; `incierta` solo si ni reintentar ni verificar lo aclararon
 */
export async function mutarConReintento<T> (
  enviar: (clave: string) => Promise<Resultado<T>>,
  opciones: OpcionesDeReintento
): Promise<ResultadoDeMutacion<T>> {
  const { metodo, yaAplicada, esperas = ESPERAS_DE_REINTENTO_MS, esperar = dormir } = opciones
  const reintentable = metodo !== 'POST' || (opciones.servidorIdempotente ?? servidorIdempotente())
  const clave = claveDeIdempotencia()
  let ultimo = await enviar(clave)

  for (const espera of esperas) {
    if (ultimo.ok || ultimo.incierta !== true) return ultimo

    await esperar(espera)

    if (yaAplicada !== undefined && await yaAplicada().catch(() => false)) {
      return { ok: true, datos: undefined as T, verificada: true }
    }

    if (!reintentable) return ultimo

    ultimo = await enviar(clave)
  }

  return ultimo
}
