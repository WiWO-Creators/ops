import { RESPALDO_CONECTADO_MS } from './en-vivo.ts'

/**
 * Reglas puras de la pantalla de oficina cuando escucha el bus de «Ops en vivo».
 *
 * `Escenario.tsx` pone el reloj y el socket; aquí solo se decide cuánto esperar. Import relativo con
 * extensión `.ts` para que Node pueda probarlo sin compilar.
 */

/** Separación mínima entre dos pedidos del paquete disparados por avisos del bus. */
export const ESPERA_MINIMA_ENTRE_PEDIDOS_MS = 5000

/**
 * El ritmo del sondeo de la pantalla.
 *
 * Sin socket manda `poll_after_seconds` como siempre. Con el socket conectado el sondeo es solo un
 * respaldo: no baja de cinco minutos, pero tampoco sube de lo que el board pida si pide más.
 *
 * @param segundosDeSondeo `meta.poll_after_seconds` (o el `?refresco=` mientras no haya `meta`)
 * @param conectado si el bus está conectado y listo
 * @returns milisegundos entre sondeos, antes del backoff por fallos
 */
export function intervaloDeSondeoDePantalla (segundosDeSondeo: number, conectado: boolean): number {
  const base = segundosDeSondeo * 1000

  return conectado ? Math.max(base, RESPALDO_CONECTADO_MS) : base
}

/**
 * Cuánto falta para poder volver a pedir el paquete por un aviso del bus.
 *
 * @param ultimoPedidoMs marca (ms) del último pedido, o `null` si no hubo ninguno
 * @param ahoraMs marca (ms) actual
 * @returns `0` si ya se puede pedir; si no, los milisegundos que faltan
 */
export function esperaParaPedirDeNuevo (ultimoPedidoMs: number | null, ahoraMs: number): number {
  if (ultimoPedidoMs === null) return 0

  return Math.max(0, ultimoPedidoMs + ESPERA_MINIMA_ENTRE_PEDIDOS_MS - ahoraMs)
}

/**
 * Si la pantalla debe conectarse al bus.
 *
 * Exige que el board declare `meta.en_vivo` y que haya URL del servicio; sin una de las dos todo
 * queda como antes (solo sondeo).
 *
 * @param enVivo `meta.en_vivo`, o `undefined` si el paquete no lo trae
 * @param url la URL pública del servicio, `''` si no hay
 * @returns `true` si hay que conectar
 */
export function debeConectarPantalla (enVivo: boolean | undefined, url: string): boolean {
  return enVivo === true && url !== ''
}
