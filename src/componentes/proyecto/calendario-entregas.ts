import { sumarDias } from '../../lib/fechas.ts'
import { diasDeVista, esDiaValido, inicioDeSemana } from '../../dominio/calendario.ts'
import { ESTADO_COMPLETO } from './tareas.ts'

/**
 * Aritmetica del calendario de entregas de un Espacio.
 *
 * Vive en un `.ts` aparte del componente por el mismo motivo que `dominio/calendario.ts`: es todo lo
 * que se puede romper sin que la pantalla se rompa. Un error aca no da error visible, da una entrega
 * dibujada el dia equivocado.
 *
 * **No duplica `dominio/calendario.ts`**: lo extiende. El dia y la semana salen de alli tal cual
 * —misma `diasDeVista`, mismo lunes como primer dia—, y lo unico propio de este modulo son las dos
 * lecturas que aquel no tiene: el MES (rejilla de semanas completas) y la LISTA (agenda del mes).
 * Aquel modulo lo comparten el calendario global y la pestaña Tareas, y no se toca desde aca.
 *
 * **Fechas sin hora, siempre.** `due_date` llega como `YYYY-MM-DD`. Toda la aritmetica va en UTC:
 * `new Date('2026-09-01')` es medianoche UTC y leerla en hora de Santiago devuelve el 31 de agosto,
 * que es exactamente como una entrega del dia 1 termina pintada en el mes anterior.
 */

/** Las cuatro lecturas del calendario de entregas. */
export type VistaEntregas = 'mes' | 'semana' | 'dia' | 'lista'

/**
 * Cuantas entregas entran en una celda del mes antes de resumir en "+N mas".
 *
 * Tres y no cinco: con seis filas de semana en pantalla, la quinta tarjeta empuja la rejilla fuera
 * del alto visible y obliga a scrollear para ver el final del mes, que es justo lo que la vista de
 * mes viene a evitar.
 */
export const TOPE_CELDA_MES = 3

/**
 * Tope de Procesos que se le piden a la API para armar el calendario.
 *
 * Es el maximo que acepta `per_page`. Se bajan **todos** los del Espacio de una sola vez en lugar de
 * pedir el rango de cada periodo: asi moverse entre meses no cuesta una peticion por clic, la lista
 * puede ordenar de punta a punta y el bloque "sin fecha" es exacto en vez de aproximado. Un Espacio
 * con mas de 500 Procesos existe; cuando pasa, la pantalla lo dice en vez de recortar en silencio.
 */
export const TOPE_DE_PROCESOS = 500

/** Dias de una semana. Se nombra para que la aritmetica de la rejilla se lea. */
const DIAS_POR_SEMANA = 7

/**
 * Lee la vista de la URL.
 *
 * El mes es el reposo: es la lectura que contesta "como viene el mes de entregas", que es la pregunta
 * por la que existe la pestaña. Un valor desconocido cae ahi en vez de romper.
 *
 * @param crudo Valor del parametro de la URL.
 * @returns La vista pedida, o `mes`.
 */
export function leerVistaEntregas (crudo: string | null | undefined): VistaEntregas {
  if (crudo === 'semana' || crudo === 'dia' || crudo === 'lista') return crudo

  return 'mes'
}

/**
 * Lee el dia ancla de la URL.
 *
 * @param crudo Valor del parametro de la URL.
 * @param respaldo Dia que se usa cuando el parametro falta o no es un dia real.
 * @returns Un dia `YYYY-MM-DD` que existe en el calendario.
 */
export function leerDiaAncla (crudo: string | null | undefined, respaldo: string): string {
  return esDiaValido(crudo) && typeof crudo === 'string' ? crudo : respaldo
}

/**
 * Primer dia del mes que contiene la fecha.
 *
 * @param dia Fecha sin hora.
 * @returns El dia 1 en `YYYY-MM-DD`, o `null` si la fecha no es valida.
 */
export function inicioDeMes (dia: string): string | null {
  if (!esDiaValido(dia)) return null

  return `${dia.slice(0, 7)}-01`
}

/**
 * Corre una fecha una cantidad de meses, quedando siempre en el dia 1.
 *
 * Se ancla en el dia 1 a proposito: sumar un mes al 31 de enero desborda al 2 o 3 de marzo, y esa es
 * la forma clasica de que el boton "siguiente" se saltee febrero.
 *
 * @param dia Cualquier dia del mes de partida.
 * @param meses Cuantos meses correr. Puede ser negativo.
 * @returns El dia 1 del mes destino, o `null` si la fecha de partida no era valida.
 */
export function sumarMeses (dia: string, meses: number): string | null {
  if (!esDiaValido(dia) || !Number.isFinite(meses)) return null

  const anio = Number(dia.slice(0, 4))
  const mes = Number(dia.slice(5, 7))
  const instante = new Date(Date.UTC(anio, mes - 1 + Math.trunc(meses), 1))

  return instante.toISOString().slice(0, 10)
}

/**
 * Los dias que dibuja la rejilla del mes: semanas completas de lunes a domingo.
 *
 * Arranca en el lunes anterior o igual al dia 1 y termina en el domingo posterior o igual al ultimo,
 * asi que devuelve 28, 35 o 42 dias. Los de relleno pertenecen al mes vecino y la rejilla los pinta
 * apagados, pero se dibujan igual: una semana partida a la que le faltan tres columnas se lee como
 * una semana rota.
 *
 * @param dia Cualquier dia del mes.
 * @returns Los dias en orden, o lista vacia si la fecha no es valida.
 */
export function diasDeMes (dia: string): string[] {
  const primero = inicioDeMes(dia)

  if (primero === null) return []

  const siguiente = sumarMeses(primero, 1)
  const desde = inicioDeSemana(primero)

  if (siguiente === null || desde === null) return []

  const ultimo = sumarDias(siguiente, -1)
  const lunesFinal = ultimo === null ? null : inicioDeSemana(ultimo)

  if (lunesFinal === null) return []

  const dias: string[] = []

  for (let fecha: string | null = desde; fecha !== null && fecha <= lunesFinal;) {
    for (let paso = 0; paso < DIAS_POR_SEMANA; paso += 1) {
      const celda = sumarDias(fecha, paso)

      if (celda !== null) dias.push(celda)
    }

    fecha = sumarDias(fecha, DIAS_POR_SEMANA)
  }

  return dias
}

/**
 * Los dias que ocupa el periodo visible.
 *
 * La lista comparte periodo con el mes: es la misma tanda de entregas leida en columna, asi que
 * alternar entre las dos no cambia lo que se esta mirando. La rejilla de la lista, en cambio, solo
 * dibuja los dias que tienen algo; por eso este resultado es el rango, no lo que se pinta.
 *
 * @param dia Cualquier dia del periodo.
 * @param vista Cual de las cuatro lecturas.
 * @returns Los dias en orden, o lista vacia si la fecha no es valida.
 */
export function diasDelPeriodo (dia: string, vista: VistaEntregas): string[] {
  if (vista === 'mes' || vista === 'lista') return diasDeMes(dia)

  return diasDeVista(dia, vista === 'semana' ? 'semana' : 'dia')
}

/**
 * Mueve el periodo un paso hacia adelante o hacia atras.
 *
 * En mes y lista salta de mes en mes desde el dia 1; en semana, de siete en siete desde el lunes. En
 * los dos casos el salto parte del inicio del periodo y no del dia recibido: partiendo de un jueves,
 * sumar siete dibujaria la misma semana siguiente pero la fecha de la URL se iria corriendo, y "hoy"
 * dejaria de caer donde corresponde al volver.
 *
 * @param dia Cualquier dia del periodo actual.
 * @param vista Cual de las cuatro lecturas.
 * @param sentido `-1` hacia atras, `1` hacia adelante.
 * @returns El dia ancla del periodo destino, o el mismo dia si no era valido.
 */
export function moverPeriodoEntregas (dia: string, vista: VistaEntregas, sentido: -1 | 1): string {
  if (vista === 'mes' || vista === 'lista') return sumarMeses(dia, sentido) ?? dia
  if (vista === 'dia') return sumarDias(dia, sentido) ?? dia

  const lunes = inicioDeSemana(dia)

  return lunes === null ? dia : sumarDias(lunes, sentido * DIAS_POR_SEMANA) ?? dia
}

/**
 * `true` si los dos dias caen en el mismo mes calendario.
 *
 * Lo usa la rejilla para apagar los dias de relleno de la semana partida.
 *
 * @param dia Dia de la celda.
 * @param ancla Cualquier dia del mes que se esta mirando.
 * @returns Si pertenecen al mismo mes.
 */
export function esDelMismoMes (dia: string, ancla: string): boolean {
  return dia.slice(0, 7) === ancla.slice(0, 7)
}

/**
 * Titulo del periodo visible.
 *
 * @param dia Cualquier dia del periodo.
 * @param vista Cual de las cuatro lecturas.
 * @returns El texto de la cabecera, o el dia crudo si no era valido.
 */
export function tituloDeEntregas (dia: string, vista: VistaEntregas): string {
  if (!esDiaValido(dia)) return dia

  if (vista === 'mes' || vista === 'lista') {
    return formatear(dia, { month: 'long', year: 'numeric' })
  }

  if (vista === 'dia') {
    return formatear(dia, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
  }

  const dias = diasDelPeriodo(dia, 'semana')
  const desde = dias[0]
  const hasta = dias[dias.length - 1]

  if (desde === undefined || hasta === undefined) return dia

  const mismoMes = desde.slice(0, 7) === hasta.slice(0, 7)

  return `${formatear(desde, mismoMes ? { day: 'numeric' } : { day: 'numeric', month: 'short' })} – ${formatear(hasta, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

/** Un dia de la agenda: la fecha y lo que se entrega ese dia. Solo se arman los que tienen algo. */
export interface DiaDeAgenda<T> {
  dia: string
  tareas: T[]
}

/** Lo minimo que la agenda necesita saber de un Proceso para ordenarlo y ubicarlo. */
export interface EntregaOrdenable {
  name: string
  due_date: string | null
}

/**
 * Arma la agenda de la vista lista: los dias con entrega, en orden, y nada mas.
 *
 * A diferencia de la rejilla, la lista **no dibuja los dias vacios**: una agenda de treinta lineas de
 * las que veinte dicen "sin vencimientos" no es una agenda. Dentro de cada dia se ordena por nombre
 * para que el orden no dependa de como la API devolvio las filas.
 *
 * @param tareas Procesos del Espacio, en cualquier orden.
 * @param dias Dias del periodo visible, en orden.
 * @returns Los dias con al menos una entrega, en orden ascendente.
 */
export function agendaDeEntregas<T extends EntregaOrdenable> (
  tareas: readonly T[],
  dias: readonly string[]
): Array<DiaDeAgenda<T>> {
  const visibles = new Set(dias)
  const porDia = new Map<string, T[]>()

  for (const tarea of tareas) {
    const clave = diaDeVencimiento(tarea)

    if (clave === null || !visibles.has(clave)) continue

    const grupo = porDia.get(clave)

    if (grupo === undefined) porDia.set(clave, [tarea])
    else grupo.push(tarea)
  }

  return [...porDia.entries()]
    .sort(([unDia], [otroDia]) => unDia.localeCompare(otroDia))
    .map(([dia, tareas]) => ({
      dia,
      tareas: [...tareas].sort((una, otra) => una.name.localeCompare(otra.name, 'es'))
    }))
}

/**
 * El dia en que vence un Proceso, normalizado.
 *
 * La API manda la fecha sin hora, pero recortar los diez primeros caracteres cuesta nada y evita que
 * una instalacion que devuelva `2026-09-08 00:00:00` deje la celda vacia.
 *
 * @param tarea El Proceso.
 * @returns El dia `YYYY-MM-DD`, o `null` si no tiene fecha de entrega.
 */
export function diaDeVencimiento (tarea: { due_date: string | null }): string | null {
  if (typeof tarea.due_date !== 'string' || tarea.due_date === '') return null

  const dia = tarea.due_date.slice(0, 10)

  return esDiaValido(dia) ? dia : null
}

/**
 * Los Procesos sin fecha de entrega.
 *
 * No se inventan en la rejilla: sin fecha no hay celda posible, y ponerlos en "hoy" o en el dia 1
 * seria afirmar un plazo que nadie fijo. Se listan aparte, en la vista lista, porque desaparecer en
 * silencio es peor que no tener lugar.
 *
 * @param tareas Procesos del Espacio.
 * @returns Los que no tienen vencimiento, ordenados por nombre.
 */
export function sinFechaDeEntrega<T extends EntregaOrdenable> (tareas: readonly T[]): T[] {
  return tareas
    .filter((tarea) => diaDeVencimiento(tarea) === null)
    .sort((una, otra) => una.name.localeCompare(otra.name, 'es'))
}

/**
 * `true` cuando el Proceso esta completo.
 *
 * Se pregunta aca y no con `status === 5` suelto para que la rejilla, la agenda y la tarjeta usen la
 * misma constante que el resto de la pestaña.
 *
 * @param tarea El Proceso.
 * @returns Si su estado es "Completo".
 */
export function estaCompleta (tarea: { status: number }): boolean {
  return tarea.status === ESTADO_COMPLETO
}

/**
 * Formatea un dia sin hora sin pasar por el huso local y sin los literales del español.
 *
 * `timeZone: 'UTC'` no es cosmetico: el instante se construye en UTC, y formatearlo en Santiago
 * mostraria el dia anterior. Los literales se descartan porque `Intl` en español intercala "de"
 * —"septiembre de 2026", "13 de sept de 2026"— y esa forma larga no entra en la cabecera.
 *
 * @param dia Fecha `YYYY-MM-DD`, ya validada.
 * @param opciones Partes que se quieren mostrar.
 * @returns El texto compacto.
 */
function formatear (dia: string, opciones: Intl.DateTimeFormatOptions): string {
  const anio = Number(dia.slice(0, 4))
  const mes = Number(dia.slice(5, 7))
  const fecha = Number(dia.slice(8, 10))
  const instante = new Date(Date.UTC(anio, mes - 1, fecha))

  return new Intl.DateTimeFormat('es-AR', { ...opciones, timeZone: 'UTC' })
    .formatToParts(instante)
    .filter((parte) => parte.type !== 'literal')
    .map((parte) => parte.value.replace('.', ''))
    .join(' ')
}
