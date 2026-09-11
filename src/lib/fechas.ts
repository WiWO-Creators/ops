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

/**
 * Zona horaria del negocio.
 *
 * Se exporta porque la agenda de salas la necesita para lo contrario que hace este modulo: convertir
 * una hora de pared elegida en pantalla al instante UTC que viaja a la API. Con dos copias de la
 * constante, un cambio de zona corregiria lo que se muestra y no lo que se guarda.
 */
export const ZONA_NEGOCIO = 'America/Argentina/Buenos_Aires'

const ZONA = ZONA_NEGOCIO
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
 * Texto que ocupa el lugar de un vencimiento que nadie fijo.
 *
 * No es el guion largo del resto de las fechas a proposito: una tarea sin fecha de entrega es una
 * decision valida —hay trabajo que no tiene plazo— y el guion se lee como "falta el dato". "Sin
 * fecha" dice que no hay plazo, que es lo que efectivamente pasa.
 */
export const SIN_VENCIMIENTO = 'Sin fecha'

/**
 * Formatea un vencimiento para mostrar.
 *
 * Se separa de `formatearFecha` porque solo el vencimiento tiene esta lectura: en `date_added` o en
 * `last_login` la ausencia si es un dato que falta, y ahi el guion es correcto.
 *
 * @param valor fecha `YYYY-MM-DD` de entrega, o `null` si la tarea no tiene plazo
 * @returns la fecha compacta, o `Sin fecha` si no hay plazo
 */
export function formatearVencimiento (valor: string | null | undefined): string {
  if (!valor) return SIN_VENCIMIENTO

  return formatearFecha(valor)
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
 * Dias calendario que faltan para una fecha, contados contra hoy.
 *
 * Se cuenta por dia calendario y no por instante: los dos extremos se llevan a medianoche UTC antes
 * de restar, asi que el resultado no depende de la hora a la que se mire ni del huso de quien mira.
 * Es la misma cuenta que ya hacia `estadoVencimiento`, extraida porque la banda de alertas de
 * Licitaciones necesita el numero y no solo el tramo: dos copias de esta resta son dos formas de
 * equivocarse en un dia.
 *
 * @param fecha fecha `YYYY-MM-DD`
 * @param hoy dia de referencia, inyectable para pruebas
 * @returns dias enteros —negativo si ya paso, `0` si es hoy—, o `null` si no es una fecha sin hora
 */
export function diasHasta (
  fecha: string | null | undefined,
  hoy: Date = new Date()
): number | null {
  if (!fecha || !esFechaSola(fecha)) return null

  const [anio, mes, dia] = fecha.split('-').map(Number)
  if (anio === undefined || mes === undefined || dia === undefined) return null

  const objetivo = Date.UTC(anio, mes - 1, dia)
  const referencia = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())

  return Math.round((objetivo - referencia) / 86400000)
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
  const dias = diasHasta(vencimiento, hoy)

  if (dias === null) return 'sin-fecha'

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

/** Separador de la fecha escrita a mano. Es el de Chile y el de Argentina: `31/12/2026`. */
const SEPARADOR_LOCAL = '/'

/**
 * Pasa una fecha del contrato al orden en que se lee y se escribe acá: `2026-12-31` -> `31/12/2026`.
 *
 * Existe porque `<input type="date">` **no** respeta el `lang` del documento: el navegador dibuja el
 * orden de dia, mes y año segun el idioma del sistema operativo, asi que en un equipo en ingles el
 * mismo formulario pide MM/DD/AAAA sin avisar. Quien escribe 03/09 queriendo el 3 de septiembre
 * guarda el 9 de marzo, y no hay nada en pantalla que lo delate.
 *
 * Lo que no reconoce se devuelve tal cual, sin inventar: mientras se tipea, el valor pasa por formas
 * incompletas (`31/1`) que no son una fecha todavia y que no hay que borrar de abajo del cursor.
 *
 * @param valor Fecha `YYYY-MM-DD`, o lo que haya escrito a medio escribir.
 * @returns La fecha en `DD/MM/AAAA`, o la entrada intacta si no tenia la forma del contrato.
 */
export function aFechaLocal (valor: string | null | undefined): string {
  if (typeof valor !== 'string') return ''
  if (!esFechaSola(valor)) return valor

  const [anio = '', mes = '', dia = ''] = valor.split('-')

  return [dia, mes, anio].join(SEPARADOR_LOCAL)
}

/**
 * Pasa lo escrito en `DD/MM/AAAA` a la fecha `YYYY-MM-DD` que espera la API.
 *
 * Comprueba que el dia exista de verdad —el 31 de febrero no pasa— construyendo la fecha en UTC y
 * viendo si sobrevive: `Date` desborda en silencio y convierte el 31/02 en el 3 de marzo, que es
 * exactamente el tipo de dato que despues nadie entiende de donde salio. El calculo va en UTC por el
 * mismo motivo que el resto de este modulo: una fecha sin hora no tiene huso que aplicarle.
 *
 * @param texto Lo que hay escrito en el campo.
 * @returns La fecha en `YYYY-MM-DD`, o `null` si esta incompleta o no existe en el calendario.
 */
export function aFechaDelContrato (texto: string | null | undefined): string | null {
  if (typeof texto !== 'string') return null

  const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto.trim())
  if (partes === null) return null

  const [, dia = '', mes = '', anio = ''] = partes
  const instante = new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia)))

  // Si el dia no existia, `Date.UTC` lo corrio al mes siguiente y el texto que vuelve ya no es el que
  // entro. Comparar el resultado es mas barato y mas exacto que una tabla de dias por mes con el
  // caso bisiesto a mano.
  const iso = instante.toISOString().slice(0, 10)

  return iso === `${anio}-${mes}-${dia}` ? iso : null
}

/**
 * Va poniendo las barras mientras se escribe, para que el campo se lea `31/12/2026` sin tipearlas.
 *
 * Solo deja pasar digitos y corta en ocho, asi que al valor nunca llega otra cosa: ni una letra, ni
 * una barra de mas, ni un noveno digito. Pegar `31-12-2026` o `31 12 2026` termina igual de bien que
 * tipearlo porque los separadores se descartan y quedan los ocho digitos en orden.
 *
 * ponytail: el cursor salta al final si se edita en medio del texto. Se arregla con
 * `setSelectionRange` el dia que alguien lo pida; escribir de corrido, que es el caso normal, no lo
 * nota.
 *
 * @param texto Lo que acaba de quedar en el input.
 * @returns El mismo texto con la mascara puesta.
 */
export function enmascararFechaLocal (texto: string): string {
  const digitos = texto.replace(/\D/g, '').slice(0, 8)

  return [digitos.slice(0, 2), digitos.slice(2, 4), digitos.slice(4, 8)]
    .filter((parte) => parte !== '')
    .join(SEPARADOR_LOCAL)
}

/**
 * Suma dias a una fecha `YYYY-MM-DD` sin pasar por el huso local.
 *
 * La aritmetica va en UTC por el mismo motivo que el resto de este modulo: `new Date('2026-09-10')`
 * es medianoche UTC y sumarle dias con `setDate()` en Buenos Aires devuelve el dia anterior.
 *
 * @param fecha Fecha del contrato, sin hora.
 * @param dias Cuantos dias sumar. Puede ser negativo. Se trunca a entero.
 * @returns La fecha resultante en `YYYY-MM-DD`, o `null` si la entrada no tiene esa forma.
 */
export function sumarDias (fecha: string | null | undefined, dias: number): string | null {
  if (typeof fecha !== 'string' || !esFechaSola(fecha)) return null
  if (!Number.isFinite(dias)) return null

  const [anio, mes, dia] = fecha.split('-').map(Number)

  if (anio === undefined || mes === undefined || dia === undefined) return null

  const instante = new Date(Date.UTC(anio, mes - 1, dia + Math.trunc(dias)))

  return instante.toISOString().slice(0, 10)
}
