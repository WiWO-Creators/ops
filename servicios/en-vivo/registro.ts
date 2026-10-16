/**
 * Registro del servicio: una línea JSON por evento, a la salida estándar (PM2 le antepone la hora).
 *
 * Solo viajan campos escalares y cortos: ni secretos, ni cuerpos de petición, ni contenido de
 * documentos. Quien llama pasa identificadores (`documento: 'acta:12'`, `estado: 502`), no datos.
 *
 * `EN_VIVO_REGISTRO=0` lo calla (lo usan las pruebas para no mezclar su salida con la del servicio).
 */

const LARGO_MAXIMO_DE_TEXTO = 200

type Campo = string | number | boolean | null

/**
 * Escribe una línea de registro.
 *
 * @param campos los campos del evento; `evento` es obligatorio. Los textos se recortan a 200 caracteres
 */
export function registrar (campos: { evento: string } & Record<string, Campo | undefined>): void {
  if (process.env.EN_VIVO_REGISTRO === '0') return

  const limpio: Record<string, Campo> = {}

  for (const [clave, valor] of Object.entries(campos)) {
    if (valor === undefined) continue
    limpio[clave] = typeof valor === 'string' ? valor.slice(0, LARGO_MAXIMO_DE_TEXTO) : valor
  }

  process.stdout.write(`${JSON.stringify(limpio)}\n`)
}
