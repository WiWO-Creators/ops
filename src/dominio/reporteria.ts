/**
 * El cierre del periodo de reportes: cuando termina el mes y cuanto falta.
 *
 * Todo se calcula en la zona del negocio y no en la del televisor, que a menudo arrastra UTC: sin
 * eso, la cuenta regresiva terminaria unas horas antes o despues del 30.
 */

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
] as const

/** Zona de respaldo mientras no llega `meta.timezone`. */
const ZONA_DE_RESPALDO = 'America/Santiago'

export interface CierreDeMes {
  /** Instante en que empieza el mes siguiente, en ms. */
  finMs: number
  /** Ultimo dia del mes, 1 a 31. */
  dia: number
  /** Nombre del mes en minusculas. */
  mes: string
}

/**
 * Cuanto se adelanta la hora de pared de `zona` respecto de UTC en un instante.
 *
 * @param instante ms desde la epoca
 * @param zona     zona IANA valida
 * @returns el desfase en ms
 * @throws RangeError si la zona no existe
 */
function desfaseDeZona (instante: number, zona: string): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric'
  }).formatToParts(new Date(instante))
  const valor = (tipo: string): number => Number(partes.find((parte) => parte.type === tipo)?.value ?? 0)
  const local = Date.UTC(valor('year'), valor('month') - 1, valor('day'), valor('hour'), valor('minute'), valor('second'))

  return local - Math.floor(instante / 1000) * 1000
}

/**
 * El fin del mes en curso segun el reloj del negocio.
 *
 * @param ahora instante actual en ms
 * @param zona  zona IANA del negocio; con `null` o una zona invalida usa la de respaldo
 * @returns el instante de cierre y el ultimo dia y mes en palabras
 */
export function cierreDeMes (ahora: number, zona: string | null): CierreDeMes {
  const zonaValida = zonaUsable(zona)
  const local = new Date(ahora + desfaseDeZona(ahora, zonaValida))
  const anio = local.getUTCFullYear()
  const mes = local.getUTCMonth()
  const mediaNoche = Date.UTC(anio, mes + 1, 1)
  // Se corrige dos veces por si el desfase cambia entre "ahora" y fin de mes (horario de verano).
  const primera = mediaNoche - desfaseDeZona(mediaNoche, zonaValida)
  const finMs = mediaNoche - desfaseDeZona(primera, zonaValida)

  return { finMs, dia: new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate(), mes: MESES[mes] ?? '' }
}

/** La zona pedida si el navegador la conoce; si no, la de respaldo. */
function zonaUsable (zona: string | null): string {
  if (zona === null) return ZONA_DE_RESPALDO

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zona })

    return zona
  } catch {
    return ZONA_DE_RESPALDO
  }
}

/**
 * La cuenta regresiva como `DD:HH:MM:SS`.
 *
 * @param restanteMs lo que falta, en ms; lo negativo o no finito cuenta como cero
 */
export function cuentaRegresiva (restanteMs: number): string {
  const total = Number.isFinite(restanteMs) ? Math.max(Math.floor(restanteMs / 1000), 0) : 0
  const par = (n: number): string => String(n).padStart(2, '0')

  return [
    Math.floor(total / 86400),
    Math.floor((total % 86400) / 3600),
    Math.floor((total % 3600) / 60),
    total % 60
  ].map(par).join(':')
}
