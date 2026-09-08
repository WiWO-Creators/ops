import { sumarDias } from '../lib/fechas.ts'

/**
 * Logica de la vista de calendario de Procesos.
 *
 * Vive en un `.ts` aparte del componente porque es todo lo que se puede romper en silencio: armar la
 * semana, ubicar una tarea en su celda y decidir el rango que se le pide a la API. Un error aca no da
 * pantalla rota, da una tarea que aparece el dia equivocado o que no aparece.
 *
 * Sin dependencias de React ni de Next: se prueba con el runner de Node (`pruebas/calendario.test.js`).
 *
 * **Fechas sin hora, siempre.** `due_date` y `start_date` llegan como `YYYY-MM-DD`. Toda la
 * aritmetica va en UTC —igual que `lib/fechas.ts`— porque `new Date('2026-09-10')` es medianoche UTC
 * y sumarle dias en hora local devuelve el dia anterior en cualquier huso al oeste de Greenwich.
 */

const FECHA_SOLA = /^\d{4}-\d{2}-\d{2}$/

/** Las dos lecturas del calendario. El cliente pidio dia y semana; no hay mes. */
export type VistaCalendario = 'dia' | 'semana'

/** Cuantos dias mueve el boton anterior/siguiente en cada vista. */
export const SALTO_DE_VISTA: Record<VistaCalendario, number> = { dia: 1, semana: 7 }

/**
 * Tope de filas que se le piden a la API por vista.
 *
 * Es el maximo que acepta `per_page` del backend. Una semana con mas de 500 vencimientos no existe
 * hoy en la base, pero si algun dia existe la pantalla lo dice en vez de recortar en silencio.
 */
export const TOPE_POR_VISTA = 500

/**
 * Convierte `YYYY-MM-DD` en el instante UTC de esa medianoche, rechazando lo que no sea un dia real.
 *
 * `Date.UTC(2026, 1, 30)` no falla: rueda al 2 de marzo. La API contesta `422` ante un dia que no
 * existe, asi que se descarta aca antes de que viaje.
 *
 * @param dia Fecha sin hora.
 * @returns El instante, o `null` si el texto no es un dia valido.
 */
function instanteDeDia (dia: string | null | undefined): Date | null {
  if (typeof dia !== 'string' || !FECHA_SOLA.test(dia)) return null

  const [anio, mes, fecha] = dia.split('-').map(Number)

  if (anio === undefined || mes === undefined || fecha === undefined) return null

  const instante = new Date(Date.UTC(anio, mes - 1, fecha))

  return instante.toISOString().slice(0, 10) === dia ? instante : null
}

/** `true` si el texto es un dia calendario que existe. */
export function esDiaValido (dia: string | null | undefined): boolean {
  return instanteDeDia(dia) !== null
}

/**
 * Lee la vista de la URL.
 *
 * La semana es el reposo: es la lectura que el cliente pidio primero ("la vista diaria y semanal"),
 * y la que contesta la pregunta de planificacion. Un valor desconocido cae ahi en vez de romper.
 *
 * @param crudo Valor del parametro `vista`.
 * @returns La vista pedida, o `semana`.
 */
export function leerVista (crudo: string | null | undefined): VistaCalendario {
  return crudo === 'dia' ? 'dia' : 'semana'
}

/**
 * Lunes de la semana que contiene el dia.
 *
 * Lunes y no domingo: es el primer dia laboral, y el calendario mensual de Salas ya arranca ahi.
 *
 * @param dia Fecha sin hora.
 * @returns El lunes en `YYYY-MM-DD`, o `null` si el dia no es valido.
 */
export function inicioDeSemana (dia: string): string | null {
  const instante = instanteDeDia(dia)

  if (instante === null) return null

  // `getUTCDay()` da 0 el domingo; con `+6 % 7` el lunes queda en 0 y el domingo en 6.
  return sumarDias(dia, -((instante.getUTCDay() + 6) % 7))
}

/**
 * Los dias que dibuja la vista.
 *
 * @param dia Cualquier dia del periodo.
 * @param vista Dia o semana.
 * @returns Uno o siete dias en orden, o lista vacia si el dia no es valido.
 */
export function diasDeVista (dia: string, vista: VistaCalendario): string[] {
  if (vista === 'dia') return esDiaValido(dia) ? [dia] : []

  const lunes = inicioDeSemana(dia)

  if (lunes === null) return []

  const dias: string[] = []

  for (let paso = 0; paso < 7; paso += 1) {
    const fecha = sumarDias(lunes, paso)

    if (fecha !== null) dias.push(fecha)
  }

  return dias
}

/**
 * Rango cerrado que se le pide a la API (`filter[date_from]` / `filter[date_to]`).
 *
 * Los dos extremos son inclusivos y salen de los mismos dias que se dibujan: pedir un rango distinto
 * del que se pinta es como se llega a una tarea que la API devolvio y la grilla no tiene donde poner.
 *
 * @param dia Cualquier dia del periodo.
 * @param vista Dia o semana.
 * @returns Los extremos, o `null` si el dia no es valido.
 */
export function rangoDeVista (dia: string, vista: VistaCalendario): { desde: string, hasta: string } | null {
  const dias = diasDeVista(dia, vista)
  const desde = dias[0]
  const hasta = dias[dias.length - 1]

  if (desde === undefined || hasta === undefined) return null

  return { desde, hasta }
}

/**
 * Mueve el periodo un paso hacia adelante o hacia atras.
 *
 * En vista semanal salta de a siete dias desde el LUNES y no desde el dia recibido: partiendo de un
 * jueves, sumar siete daria el jueves siguiente y la semana se dibujaria igual, pero la fecha de la
 * URL iria corriendose y "hoy" dejaria de caer donde corresponde al volver.
 *
 * @param dia Cualquier dia del periodo actual.
 * @param vista Dia o semana.
 * @param sentido `-1` hacia atras, `1` hacia adelante.
 * @returns El dia ancla del periodo destino, o el mismo dia si no era valido.
 */
export function moverPeriodo (dia: string, vista: VistaCalendario, sentido: -1 | 1): string {
  const base = vista === 'semana' ? inicioDeSemana(dia) : dia

  if (base === null) return dia

  return sumarDias(base, sentido * SALTO_DE_VISTA[vista]) ?? dia
}

/** Lo minimo que el calendario necesita saber de una tarea para ubicarla. */
export interface UbicableEnCalendario {
  due_date: string | null
}

/**
 * Reparte las tareas en la celda de su fecha de VENCIMIENTO.
 *
 * Una tarea ocupa **una sola celda**, la del dia en que vence. Cuando ademas tiene fecha de inicio,
 * el tramo no se dibuja como barra a lo largo de los dias: eso es un Gantt, y el Gantt del Espacio ya
 * existe y se queda. El inicio se lee dentro de la tarjeta ("Desde 3 sep"), que es lo que hace falta
 * para saber si el trabajo ya arranco sin convertir el calendario en una segunda linea de tiempo.
 *
 * Una tarea SIN vencimiento no entra en ninguna celda: no tiene dia. La pantalla la muestra aparte
 * —ver `ListaSinVencimiento` en la vista— en vez de descartarla, porque desaparecer en silencio es
 * peor que no tener lugar.
 *
 * @param tareas Filas del listado, en el orden en que llegaron.
 * @param dias Dias visibles, en orden.
 * @returns Un mapa con **todos** los dias como clave, aunque su lista quede vacia: la grilla necesita
 *          dibujar el dia vacio, no saltearlo.
 */
export function agruparPorVencimiento<T extends UbicableEnCalendario> (
  tareas: readonly T[],
  dias: readonly string[]
): Map<string, T[]> {
  const grupos = new Map<string, T[]>(dias.map((dia) => [dia, []]))

  for (const tarea of tareas) {
    // La API manda `duedate` como fecha sin hora, pero recortar los diez primeros caracteres cuesta
    // nada y evita que una instalacion que devuelva `2026-09-08 00:00:00` deje la celda vacia.
    const clave = typeof tarea.due_date === 'string' ? tarea.due_date.slice(0, 10) : null

    if (clave === null) continue

    grupos.get(clave)?.push(tarea)
  }

  return grupos
}

/** El bloque `aviso` de `GET /me/vencimientos`. */
export interface AvisoDeVencimiento {
  estado: 'vencido' | 'hoy' | 'final' | 'temprano'
}

/**
 * Cuenta los avisos por gravedad, para el contador de la cabecera.
 *
 * `final` y `temprano` son dos umbrales del cron, no dos mensajes distintos para quien mira: los dos
 * dicen "todavia no vencio". Se suman en uno solo y el detalle queda en la lista.
 *
 * @param filas Lo que devolvio `GET /me/vencimientos`.
 * @returns Las tres cuentas que dibuja el aviso.
 */
export function contarAvisos<T extends { aviso: AvisoDeVencimiento }> (
  filas: readonly T[]
): { vencidos: number, hoy: number, porVencer: number } {
  let vencidos = 0
  let hoy = 0
  let porVencer = 0

  for (const fila of filas) {
    if (fila.aviso.estado === 'vencido') vencidos += 1
    else if (fila.aviso.estado === 'hoy') hoy += 1
    else porVencer += 1
  }

  return { vencidos, hoy, porVencer }
}

/**
 * Titulo del periodo visible.
 *
 * En vista de dia dice el dia de la semana, porque es la unica pista de que dia se esta mirando; en
 * semana dice el rango, con el mes una sola vez cuando los dos extremos caen en el mismo.
 *
 * @param dia Cualquier dia del periodo.
 * @param vista Dia o semana.
 * @returns El texto para la cabecera, o el dia crudo si no era valido.
 */
export function tituloDePeriodo (dia: string, vista: VistaCalendario): string {
  const dias = diasDeVista(dia, vista)
  const desde = dias[0]
  const hasta = dias[dias.length - 1]

  if (desde === undefined || hasta === undefined) return dia

  if (vista === 'dia') {
    return formatear(desde, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
  }

  const mismoMes = desde.slice(0, 7) === hasta.slice(0, 7)

  return `${formatear(desde, mismoMes ? { day: 'numeric' } : { day: 'numeric', month: 'short' })} – ${formatear(hasta, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

/**
 * Formatea un dia sin hora sin pasar por el huso local y sin los literales del español.
 *
 * `timeZone: 'UTC'` no es cosmetico: el instante se construyo en UTC, y formatearlo en Buenos Aires
 * mostraria el dia anterior.
 *
 * Los literales se descartan por el mismo motivo que en `compactar` (`lib/fechas.ts`): `Intl` en
 * español intercala "de" —"13 de sept de 2026"— y esa forma larga no entra en el encabezado de una
 * columna de siete.
 */
function formatear (dia: string, opciones: Intl.DateTimeFormatOptions): string {
  const instante = instanteDeDia(dia)

  if (instante === null) return dia

  return new Intl.DateTimeFormat('es-AR', { ...opciones, timeZone: 'UTC' })
    .formatToParts(instante)
    .filter((parte) => parte.type !== 'literal')
    .map((parte) => parte.value.replace('.', ''))
    .join(' ')
}

/** Nombre corto del dia de la semana, para el encabezado de cada columna. */
export function nombreDeDia (dia: string): string {
  return formatear(dia, { weekday: 'short' })
}

/** Numero del dia dentro del mes, para el encabezado de cada columna. */
export function numeroDeDia (dia: string): string {
  return formatear(dia, { day: 'numeric' })
}
