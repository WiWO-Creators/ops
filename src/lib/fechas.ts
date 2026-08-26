/**
 * Formateo de fechas.
 *
 * La API manda dos formas distintas y confundirlas produce corrimientos de un dia:
 *   - instantes en ISO-8601 UTC (`2026-08-24T14:03:00Z`) -> `date_added`, `date_finished`
 *   - fechas sin hora (`2026-08-24`)                      -> `due_date`, `start_date`, `deadline`
 *
 * Una fecha sin hora NO se pasa por `new Date('2026-08-24')`: eso la interpreta como medianoche UTC y
 * en cualquier huso al oeste de Greenwich muestra el dia anterior. Es el bug clasico de "el
 * vencimiento aparece un dia antes".
 */

const ZONA = 'America/Argentina/Buenos_Aires'
const LOCALE = 'es-AR'

/**
 * Arma "24 ago 2026" (o "24 ago 2026 14:03") a partir de las partes de un formato.
 *
 * `Intl` en español intercala literales — "24 de ago. de 2026" — y esa forma larga parte la fecha en
 * dos lineas dentro de una celda de tabla, lo que sube el alto de la fila entera. El orden
 * dia-mes-año es el de `es-AR`, el unico locale que usa este modulo.
 *
 * Las partes se unen con espacio duro (U+00A0) y no con espacio comun: una fecha es una sola unidad
 * de lectura, y en una columna angosta el navegador la partiria igual aunque ya no diga "de". Hacerlo
 * aca y no columna por columna vale para las 38 columnas de fecha del proyecto, el portal incluido.
 *
 * @param formato formateador ya configurado con dia, mes corto y año
 * @param instante fecha a formatear
 * @returns el texto compacto, siempre en una sola linea
 */
function compactar (formato: Intl.DateTimeFormat, instante: Date): string {
  const partes = new Map(
    formato.formatToParts(instante).filter(parte => parte.type !== 'literal').map(parte => [parte.type, parte.value])
  )

  const dia = partes.get('day') ?? ''
  const mes = (partes.get('month') ?? '').replace('.', '')
  const anio = partes.get('year') ?? ''
  const hora = partes.get('hour')

  const fecha = `${dia}\u00a0${mes}\u00a0${anio}`

  return hora ? `${fecha}\u00a0${hora}:${partes.get('minute') ?? '00'}` : fecha
}

/** True si el texto tiene la forma `YYYY-MM-DD`, sin hora. */
const esFechaSola = (valor: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(valor)

/**
 * Formatea una fecha de la API para mostrar.
 *
 * @param valor instante ISO o fecha `YYYY-MM-DD`; `null` devuelve el guion largo
 * @param conHora si se muestra la hora (se ignora en fechas sin hora)
 * @returns el texto listo para mostrar
 */
export function formatearFecha (valor: string | null | undefined, conHora = false): string {
  if (!valor) return '—'

  if (esFechaSola(valor)) {
    // Se parte el texto en vez de construir un Date: sin hora no hay instante que convertir, y
    // cualquier conversion introduce un huso que el dato no tiene.
    const [anio, mes, dia] = valor.split('-')
    if (!anio || !mes || !dia) return '—'
    return compactar(
      new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: 'short', year: 'numeric' }),
      new Date(Number(anio), Number(mes) - 1, Number(dia))
    )
  }

  const instante = new Date(valor)
  if (Number.isNaN(instante.getTime())) return '—'

  return compactar(
    new Intl.DateTimeFormat(LOCALE, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: ZONA,
      ...(conHora ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {})
    }),
    instante
  )
}

/**
 * Formatea una fecha como distancia al presente ("hace 3 días", "en 2 semanas").
 *
 * @param valor instante ISO o fecha `YYYY-MM-DD`
 * @param ahora momento de referencia; inyectable para poder probarlo sin depender del reloj
 * @returns el texto relativo, o el guion largo si no hay valor
 */
export function formatearRelativo (
  valor: string | null | undefined,
  ahora: Date = new Date()
): string {
  if (!valor) return '—'

  const instante = esFechaSola(valor) ? new Date(`${valor}T12:00:00`) : new Date(valor)
  if (Number.isNaN(instante.getTime())) return '—'

  const formato = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })
  const segundos = (instante.getTime() - ahora.getTime()) / 1000

  const escalas: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60]
  ]

  for (const [unidad, tamano] of escalas) {
    if (Math.abs(segundos) >= tamano) {
      return formato.format(Math.round(segundos / tamano), unidad)
    }
  }
  return formato.format(Math.round(segundos), 'second')
}

/**
 * Clasifica un vencimiento respecto de hoy.
 *
 * Compara por dia calendario y no por instante: una tarea que vence hoy a las 09:00 sigue siendo "de
 * hoy" a las 18:00, no "vencida". Marcarla en rojo a media tarde es ruido, no informacion.
 *
 * @param vencimiento fecha `YYYY-MM-DD`
 * @param hoy dia de referencia, inyectable para pruebas
 * @returns `'vencido'`, `'hoy'`, `'proximo'` (dentro de 3 dias), `'lejano'` o `'sin-fecha'`
 */
export function estadoVencimiento (
  vencimiento: string | null | undefined,
  hoy: Date = new Date()
): 'vencido' | 'hoy' | 'proximo' | 'lejano' | 'sin-fecha' {
  if (!vencimiento || !esFechaSola(vencimiento)) return 'sin-fecha'

  const [anio, mes, dia] = vencimiento.split('-').map(Number)
  if (anio === undefined || mes === undefined || dia === undefined) return 'sin-fecha'

  const objetivo = Date.UTC(anio, mes - 1, dia)
  const referencia = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const dias = Math.round((objetivo - referencia) / 86400000)

  if (dias < 0) return 'vencido'
  if (dias === 0) return 'hoy'
  if (dias <= 3) return 'proximo'
  return 'lejano'
}

// frente: listado
/**
 * Fecha del dia en el formato `YYYY-MM-DD` que espera la API, tomada en hora local.
 *
 * `toISOString().slice(0, 10)` a secas devuelve el dia en UTC: en Buenos Aires, cualquier momento
 * despues de las 21:00 daria mañana, y un formulario que se abre con la fecha equivocada la guarda
 * equivocada.
 *
 * @param ahora Instante de referencia; parametro para poder probarlo.
 * @returns La fecha local en `YYYY-MM-DD`.
 */
export function hoyLocal (ahora: Date = new Date()): string {
  const anio = ahora.getFullYear()
  const mes = String(ahora.getMonth() + 1).padStart(2, '0')
  const dia = String(ahora.getDate()).padStart(2, '0')

  return `${anio}-${mes}-${dia}`
}
