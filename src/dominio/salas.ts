import { ZONA_NEGOCIO } from '../lib/fechas.ts'

/**
 * Logica de la agenda de salas.
 *
 * Vive en un `.ts` y no dentro del componente porque es todo lo que se puede romper en silencio:
 * la conversion entre la hora que ve la persona y el instante UTC que viaja a la API, la posicion de
 * una reserva en la grilla y la deteccion de choques. Los `.tsx` solo la consumen.
 *
 * **La API es la que decide.** El choque tambien se comprueba aca, pero solo para no ofrecer una
 * franja que ya esta tomada; quien rechaza de verdad una reserva superpuesta es el backend, bajo
 * lock. Duplicar la regla en el navegador y confiar en ella seria volver al problema original.
 */

/** Primera hora que muestra la grilla. Antes de esto la oficina esta cerrada. */
export const HORA_APERTURA = 7

/** Ultima hora que muestra la grilla. */
export const HORA_CIERRE = 21

/** Alto de una franja, en minutos. Es tambien el salto al arrastrar o al elegir una hora. */
export const PASO_MINUTOS = 30

/** Duracion que trae por defecto el formulario al abrirlo desde una franja vacia. */
export const DURACION_POR_DEFECTO_MINUTOS = 60

const MINUTO_INICIAL = HORA_APERTURA * 60
const MINUTO_FINAL = HORA_CIERRE * 60

/**
 * Desfase de una zona respecto de UTC, en milisegundos, en un instante dado.
 *
 * Se calcula formateando el instante EN la zona y volviendo a leer esas partes como si fueran UTC:
 * la diferencia entre las dos lecturas es el desfase. Es la unica forma de obtenerlo sin librerias,
 * y es exacta tambien en zonas con horario de verano, donde el desfase depende de la fecha.
 *
 * @param instante momento a medir
 * @param zona zona IANA
 * @returns milisegundos que hay que sumarle a UTC para obtener la hora local
 */
function desfaseDeZona (instante: Date, zona: string): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(instante)

  const parte = (tipo: string): number => Number(partes.find((p) => p.type === tipo)?.value ?? 0)

  // `hour` puede venir como 24 en el limite de medianoche segun el motor; el modulo lo normaliza.
  const comoSiFueraUtc = Date.UTC(
    parte('year'), parte('month') - 1, parte('day'),
    parte('hour') % 24, parte('minute'), parte('second')
  )

  return comoSiFueraUtc - instante.getTime()
}

/**
 * Instante UTC de una hora de pared de un dia, en la zona del negocio.
 *
 * Es la operacion que no se puede hacer con `new Date('2026-09-02T09:00')`: eso interpreta la hora
 * en la zona de QUIEN MIRA, asi que alguien conectado desde otro huso reservaria a otra hora que la
 * que eligio en pantalla.
 *
 * Se resuelve en dos pasadas porque el desfase depende del instante y el instante depende del
 * desfase. La segunda corrige el caso —solo posible en zonas con horario de verano— en que la
 * primera estimacion cae del otro lado del salto.
 *
 * @param dia fecha local `YYYY-MM-DD`
 * @param minutos minutos desde la medianoche local
 * @returns el instante, o `null` si el dia no tiene la forma esperada
 */
export function instanteDe (dia: string, minutos: number): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null

  const [anio, mes, fecha] = dia.split('-').map(Number)
  if (anio === undefined || mes === undefined || fecha === undefined) return null

  const comoUtc = Date.UTC(anio, mes - 1, fecha) + minutos * 60_000

  let instante = new Date(comoUtc)
  for (let pasada = 0; pasada < 2; pasada++) {
    instante = new Date(comoUtc - desfaseDeZona(instante, ZONA_NEGOCIO))
  }

  return instante
}

/**
 * Ventana que hay que pedirle a la API para dibujar un dia entero.
 *
 * Va de medianoche a medianoche y no del horario de apertura al de cierre: una reunion que arranca a
 * las 06:30 igual ocupa la sala a las 07:00, y si no viene en la respuesta la grilla la pinta libre.
 *
 * @param dia fecha local `YYYY-MM-DD`
 * @returns los dos extremos en ISO-8601 UTC, o `null` si el dia es invalido
 */
export function ventanaDelDia (dia: string): { desde: string, hasta: string } | null {
  const desde = instanteDe(dia, 0)
  const hasta = instanteDe(dia, 24 * 60)

  if (desde === null || hasta === null) return null

  return { desde: desde.toISOString(), hasta: hasta.toISOString() }
}

/**
 * Ventana de reservas de un mes calendario en hora local del negocio.
 *
 * @param dia cualquier día del mes que se quiere consultar
 * @returns extremos UTC del mes, o `null` si el día no es válido
 */
export function ventanaDelMes (dia: string): { desde: string, hasta: string } | null {
  const inicio = inicioDelMes(dia)
  if (inicio === null) return null

  const desde = instanteDe(inicio, 0)
  const hasta = instanteDe(sumarMeses(inicio, 1), 0)

  if (desde === null || hasta === null) return null

  return { desde: desde.toISOString(), hasta: hasta.toISOString() }
}

/**
 * Minutos desde la medianoche local que corresponden a un instante.
 *
 * @param iso instante ISO-8601
 * @returns minutos, o `null` si el instante no es valido
 */
export function minutosLocales (iso: string): number | null {
  const instante = new Date(iso)
  if (Number.isNaN(instante.getTime())) return null

  const local = new Date(instante.getTime() + desfaseDeZona(instante, ZONA_NEGOCIO))

  return local.getUTCHours() * 60 + local.getUTCMinutes()
}

/**
 * Dia local (`YYYY-MM-DD`) al que pertenece un instante.
 *
 * @param iso instante ISO-8601
 * @returns la fecha local, o `null` si el instante no es valido
 */
export function diaLocal (iso: string): string | null {
  const instante = new Date(iso)
  if (Number.isNaN(instante.getTime())) return null

  const local = new Date(instante.getTime() + desfaseDeZona(instante, ZONA_NEGOCIO))

  return local.toISOString().slice(0, 10)
}

/** Hora de pared `HH:MM` de un instante, en la zona del negocio. */
export function horaLocal (iso: string): string {
  const minutos = minutosLocales(iso)
  if (minutos === null) return '--:--'

  return formatearMinutos(minutos)
}

/** `540` -> `'09:00'`. Acepta valores fuera del dia y los recorta al rango 00:00-23:59. */
export function formatearMinutos (minutos: number): string {
  const acotado = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutos)))

  return `${String(Math.floor(acotado / 60)).padStart(2, '0')}:${String(acotado % 60).padStart(2, '0')}`
}

/** `'09:30'` -> `570`. Devuelve `null` si el texto no es una hora. */
export function minutosDeHora (hora: string): number | null {
  const partes = /^(\d{1,2}):(\d{2})$/.exec(hora)
  if (partes === null) return null

  const horas = Number(partes[1])
  const minutos = Number(partes[2])

  if (horas > 23 || minutos > 59) return null

  return horas * 60 + minutos
}

/** Las franjas que dibuja la grilla, en minutos desde la medianoche. */
export function franjas (): number[] {
  const filas: number[] = []

  for (let minuto = MINUTO_INICIAL; minuto < MINUTO_FINAL; minuto += PASO_MINUTOS) {
    filas.push(minuto)
  }

  return filas
}

export interface Bloque {
  /** Distancia desde el borde superior de la grilla, en porcentaje. */
  arriba: number
  /** Alto del bloque, en porcentaje de la grilla. */
  alto: number
  /** La reserva empieza antes de la apertura o termina despues del cierre. */
  recortado: boolean
}

/**
 * Posicion de una reserva dentro de la grilla del dia.
 *
 * Se recorta al horario visible en vez de descartarse: una reunion de 06:00 a 08:00 ocupa la sala a
 * las 07:00 y tiene que verse, aunque su comienzo quede fuera de la grilla. `recortado` deja que la
 * tarjeta lo diga en vez de mentir sobre su horario.
 *
 * @param inicio instante ISO del comienzo
 * @param fin instante ISO del final
 * @param dia dia que se esta mirando, `YYYY-MM-DD`
 * @returns la caja en porcentajes, o `null` si la reserva no toca el horario visible de ese dia
 */
export function bloqueDeReserva (inicio: string, fin: string, dia: string): Bloque | null {
  const comienzo = minutosAbsolutos(inicio, dia)
  const final = minutosAbsolutos(fin, dia)

  if (comienzo === null || final === null || final <= comienzo) return null

  const visibleDesde = Math.max(comienzo, MINUTO_INICIAL)
  const visibleHasta = Math.min(final, MINUTO_FINAL)

  if (visibleHasta <= visibleDesde) return null

  const total = MINUTO_FINAL - MINUTO_INICIAL

  return {
    arriba: ((visibleDesde - MINUTO_INICIAL) / total) * 100,
    alto: ((visibleHasta - visibleDesde) / total) * 100,
    recortado: comienzo < MINUTO_INICIAL || final > MINUTO_FINAL
  }
}

/**
 * Minutos desde la medianoche del dia mirado, admitiendo dias vecinos.
 *
 * Una reserva que arranca a las 23:00 de ayer y termina a las 01:00 de hoy tiene que dar valores
 * negativos, no volver a empezar en 0: sin eso el bloque se dibuja al principio del dia en vez de
 * antes de la apertura.
 */
function minutosAbsolutos (iso: string, dia: string): number | null {
  const propio = diaLocal(iso)
  const minutos = minutosLocales(iso)

  if (propio === null || minutos === null) return null

  const inicioDia = instanteDe(dia, 0)
  const inicioPropio = instanteDe(propio, 0)

  if (inicioDia === null || inicioPropio === null) return null

  const diferenciaDias = Math.round((inicioPropio.getTime() - inicioDia.getTime()) / 86_400_000)

  return minutos + diferenciaDias * 24 * 60
}

interface RangoOcupado {
  start: string
  end: string
}

/**
 * `true` si un rango se pisa con alguna de las reservas dadas.
 *
 * Los extremos que se tocan NO chocan: 10:00-11:00 y 11:00-12:00 conviven. Es la misma regla que
 * aplica el backend, y tiene que serlo — si fueran distintas, la pantalla ofreceria franjas que la
 * API rechaza, o esconderia franjas que acepta.
 *
 * @param reservas reservas vigentes de esa sala
 * @param inicio instante ISO del comienzo propuesto
 * @param fin instante ISO del final propuesto
 * @param excluir id de una reserva que no cuenta (la que se esta editando)
 */
export function seSuperpone (
  reservas: Array<RangoOcupado & { id: number }>,
  inicio: string,
  fin: string,
  excluir?: number
): boolean {
  const desde = new Date(inicio).getTime()
  const hasta = new Date(fin).getTime()

  if (Number.isNaN(desde) || Number.isNaN(hasta)) return false

  return reservas.some((reserva) => {
    if (reserva.id === excluir) return false

    return new Date(reserva.start).getTime() < hasta && new Date(reserva.end).getTime() > desde
  })
}

export interface EntradaReserva {
  titulo: string
  /** Minutos desde la medianoche local. */
  desde: number
  hasta: number
  asistentes: string
  capacidad: number
}

export interface RevisionReserva {
  /** Errores por campo. Vacio significa que el formulario se puede enviar. */
  errores: Record<string, string>
  /** Avisos que NO impiden reservar. Hoy solo uno: mas gente que sillas. */
  avisos: string[]
}

/**
 * Revisa el formulario antes de mandarlo.
 *
 * Distingue error de aviso a proposito. Superar la capacidad de la sala **no bloquea**: la persona
 * puede saber que dos se quedan parados, y un sistema que se lo prohibe termina empujandola a
 * reservar la sala grande "por las dudas", que es peor. Lo que si bloquea es lo que la API va a
 * rechazar igual, para no gastar un viaje al servidor en decir lo mismo.
 *
 * @returns errores por campo y avisos; `errores` vacio habilita el envio
 */
export function revisarReserva (entrada: EntradaReserva): RevisionReserva {
  const errores: Record<string, string> = {}
  const avisos: string[] = []

  if (entrada.titulo.trim() === '') {
    errores.titulo = 'Pon de qué es la reunión.'
  } else if (entrada.titulo.trim().length > 255) {
    errores.titulo = 'El título no puede pasar de 255 caracteres.'
  }

  if (entrada.hasta <= entrada.desde) {
    errores.hasta = 'La hora de fin tiene que ser posterior a la de inicio.'
  } else if (entrada.hasta - entrada.desde < 10) {
    errores.hasta = 'La reserva tiene que durar al menos 10 minutos.'
  } else if (entrada.hasta - entrada.desde > 12 * 60) {
    errores.hasta = 'Una reserva no puede durar más de 12 horas.'
  }

  if (entrada.asistentes.trim() !== '') {
    const cuantos = Number(entrada.asistentes)

    if (!Number.isInteger(cuantos) || cuantos < 1 || cuantos > 500) {
      errores.asistentes = 'Pon un número de personas válido.'
    } else if (cuantos > entrada.capacidad) {
      avisos.push(`La sala entra ${entrada.capacidad} personas y anotaste ${cuantos}.`)
    }
  }

  return { errores, avisos }
}

/**
 * Estado de una reserva respecto de un instante.
 *
 * Lo usa la pantalla de puerta, que es la que tiene que gritar "ocupada" desde el pasillo.
 *
 * @param reserva rango de la reserva
 * @param ahora instante de referencia; parametro para poder probarlo sin depender del reloj
 */
export function estadoDeReserva (
  reserva: RangoOcupado,
  ahora: Date = new Date()
): 'en-curso' | 'proxima' | 'terminada' {
  const referencia = ahora.getTime()

  if (new Date(reserva.end).getTime() <= referencia) return 'terminada'
  if (new Date(reserva.start).getTime() > referencia) return 'proxima'

  return 'en-curso'
}

/**
 * Suma dias a una fecha local sin pasar por `Date`.
 *
 * `new Date('2026-09-02')` es medianoche UTC, asi que sumarle un dia y volver a formatear en local
 * devuelve el mismo dia en cualquier huso al oeste de Greenwich. Aca se opera sobre el numero de dia
 * calendario, que no tiene huso.
 *
 * @param dia fecha `YYYY-MM-DD`
 * @param dias cuantos dias sumar (puede ser negativo)
 * @returns la fecha resultante, o el mismo texto si no tenia la forma esperada
 */
export function sumarDias (dia: string, dias: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return dia

  const [anio, mes, fecha] = dia.split('-').map(Number)
  if (anio === undefined || mes === undefined || fecha === undefined) return dia

  return new Date(Date.UTC(anio, mes - 1, fecha + dias)).toISOString().slice(0, 10)
}

/** Primer día del mes de una fecha local, o `null` si no tiene formato de fecha. */
function inicioDelMes (dia: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null

  return `${dia.slice(0, 7)}-01`
}

/**
 * Mueve una fecha al primer día de otro mes calendario.
 *
 * @param dia fecha local que identifica el mes de partida
 * @param meses desplazamiento, positivo o negativo
 * @returns primer día del mes destino, o el texto original si el día no es válido
 */
export function sumarMeses (dia: string, meses: number): string {
  const inicio = inicioDelMes(dia)
  if (inicio === null) return dia

  const [anio, mes] = inicio.slice(0, 7).split('-').map(Number)
  if (anio === undefined || mes === undefined) return dia

  return new Date(Date.UTC(anio, mes - 1 + meses, 1)).toISOString().slice(0, 10)
}

export interface DiaDeCalendario {
  /** Fecha local `YYYY-MM-DD`. */
  dia: string
  /** Si el día pertenece al mes pedido y se puede consultar. */
  perteneceAlMes: boolean
}

/**
 * Semanas completas de lunes a domingo para el calendario mensual.
 *
 * @param dia cualquier día del mes que se dibuja
 * @returns 5 o 6 semanas; vacío si el día no es válido
 */
export function diasDeCalendarioMes (dia: string): DiaDeCalendario[] {
  const inicio = inicioDelMes(dia)
  if (inicio === null) return []

  const [anio, mes] = inicio.slice(0, 7).split('-').map(Number)
  if (anio === undefined || mes === undefined) return []

  const primerDia = new Date(Date.UTC(anio, mes - 1, 1))
  const primerDiaSemana = (primerDia.getUTCDay() + 6) % 7
  const cantidadDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
  const cantidadCeldas = primerDiaSemana + cantidadDelMes > 35 ? 42 : 35

  return Array.from({ length: cantidadCeldas }, (_, indice) => {
    const fecha = sumarDias(inicio, indice - primerDiaSemana)

    return { dia: fecha, perteneceAlMes: fecha.slice(0, 7) === inicio.slice(0, 7) }
  })
}

/**
 * Determina si una reserva ocupa al menos un instante de un día local.
 *
 * @param reserva rango UTC de la reserva
 * @param dia día local a comprobar
 * @returns `true` cuando los rangos se cruzan; los extremos contiguos no cuentan
 */
export function reservaTocaDia (reserva: RangoOcupado, dia: string): boolean {
  const ventana = ventanaDelDia(dia)
  if (ventana === null) return false

  const inicioReserva = new Date(reserva.start).getTime()
  const finReserva = new Date(reserva.end).getTime()

  if (Number.isNaN(inicioReserva) || Number.isNaN(finReserva)) return false

  return inicioReserva < new Date(ventana.hasta).getTime() && finReserva > new Date(ventana.desde).getTime()
}

export interface PersonaElegible {
  id: number
  full_name: string
  profile_image_url: string | null
}

/**
 * Normaliza un texto para buscar: sin acentos, sin mayusculas.
 *
 * Sin esto, "nunez" no encuentra a "Núñez" y quien busca concluye que la persona no esta en el
 * sistema. Es el caso normal, no el borde: nadie escribe los acentos al filtrar una lista.
 *
 * @param texto lo que se escribio o el nombre a comparar
 * @returns el texto comparable
 */
export function normalizar (texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

/**
 * Filtra la lista de personas por lo que se escribio.
 *
 * Busca por partes sueltas: "ana rios" encuentra a "Ana Ríos" y "rios ana" tambien, porque quien
 * busca no siempre recuerda el orden. Una busqueda vacia devuelve todo.
 *
 * @param personas lista completa
 * @param busqueda lo tipeado
 * @returns las que coinciden, en el mismo orden que llegaron
 */
export function filtrarPersonas (personas: PersonaElegible[], busqueda: string): PersonaElegible[] {
  const partes = normalizar(busqueda).split(/\s+/).filter((parte) => parte !== '')

  if (partes.length === 0) return personas

  return personas.filter((persona) => {
    const nombre = normalizar(persona.full_name)

    return partes.every((parte) => nombre.includes(parte))
  })
}

/**
 * Decide el numero de asistentes despues de tocar la lista de participantes.
 *
 * La regla: el campo se **sigue solo** mientras nadie lo haya tocado a mano. Apenas alguien escribe
 * un numero propio —porque vienen dos personas de afuera que no estan en el sistema—, deja de
 * moverse. Un campo que se pisa cada vez que se agrega a alguien es un campo que no se puede usar.
 *
 * @param actual lo que hay escrito en el campo
 * @param antes cuantos participantes habia antes del cambio
 * @param ahora cuantos hay despues
 * @returns el valor que debe quedar en el campo
 */
export function sugerirAsistentes (actual: string, antes: number, ahora: number): string {
  const escrito = actual.trim()

  // Vacio, o exactamente lo que valia la sugerencia anterior: nadie lo toco.
  if (escrito === '' || escrito === String(antes)) {
    return ahora === 0 ? '' : String(ahora)
  }

  return actual
}
