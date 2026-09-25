import { normalizar } from './salas.ts'
import type { StaffReferencia } from '@/datos/tipos'

/**
 * Tareas recurrentes: como termina una regla, como se lee una planilla y como se cuenta lo que la
 * API contesto.
 *
 * Todo puro y sin React, para que el runner de Node lo pruebe. Lo que NO vive aca, a proposito:
 * interpretar la frecuencia ("quincenal", "cada 10 dias") y calcular la proxima copia. Las dos cosas
 * las decide la API (`Automatizacion\Frecuencia` y `Recurrencia::proximaCopia()`), que es la misma
 * que despues copia las Tareas; una segunda cuenta en el navegador discutiria con el cron.
 */

/** Como termina una recurrencia: nunca, tras N copias, o un dia concreto. */
export type ModoFin = 'nunca' | 'ciclos' | 'fecha'

/** Las tres opciones, en el orden en que se ofrecen. */
export const OPCIONES_FIN: ReadonlyArray<{ valor: ModoFin, etiqueta: string }> = [
  { valor: 'nunca', etiqueta: 'Nunca' },
  { valor: 'ciclos', etiqueta: 'Tras N veces' },
  { valor: 'fecha', etiqueta: 'El día' }
]

/** Tope de copias, el mismo que la API (`ParcheProceso::CICLOS_MAXIMOS`). */
const CICLOS_MAXIMOS = 365

/**
 * El modo con que se abre una Tarea ya guardada.
 *
 * La fecha manda sobre los ciclos cuando hay las dos: la API termina con lo primero que se cumpla, y
 * el formulario solo sabe mostrar una. Es el caso raro de una regla escrita por fuera del formulario.
 *
 * @param cycles tope de copias; 0 es sin tope
 * @param until ultimo dia en que puede nacer una copia, o null
 * @returns el modo que representa esa combinacion
 */
export function modoDeFin (cycles: number | undefined, until: string | null | undefined): ModoFin {
  if (typeof until === 'string' && until !== '') return 'fecha'

  return (cycles ?? 0) > 0 ? 'ciclos' : 'nunca'
}

/**
 * Las claves del cuerpo que dicen como termina, para el alta y para el PATCH.
 *
 * `recurring_until` viaja solo con el modo fecha: la API lo trata como ausente = sin fecha, igual que
 * `cycles` ausente = sin tope. Mandarlo siempre en `null` no cambia nada y ensucia el parche.
 *
 * @param modo el modo elegido
 * @param ciclos el numero de copias, como texto del formulario
 * @param hasta la fecha `YYYY-MM-DD`, como texto del formulario
 * @returns `cycles` siempre, y `recurring_until` si termina por fecha
 */
export function cuerpoDeFin (modo: ModoFin, ciclos: string, hasta: string): { cycles: number, recurring_until?: string } {
  if (modo === 'ciclos') return { cycles: Number(ciclos) }
  if (modo === 'fecha') return { cycles: 0, recurring_until: hasta }

  return { cycles: 0 }
}

/**
 * El primer problema de como termina, o null si esta bien.
 *
 * @param modo el modo elegido
 * @param ciclos texto del campo de veces
 * @param hasta texto del campo de fecha
 * @param inicio fecha de inicio de la Tarea, si se sabe, para no aceptar un fin anterior
 * @returns el mensaje para la persona, o null
 */
export function errorDeFin (modo: ModoFin, ciclos: string, hasta: string, inicio = ''): string | null {
  if (modo === 'ciclos') {
    const numero = Number(ciclos)

    return ciclos.trim() === '' || !Number.isInteger(numero) || numero < 1 || numero > CICLOS_MAXIMOS
      ? `Las veces deben ser un entero entre 1 y ${CICLOS_MAXIMOS}.`
      : null
  }

  if (modo === 'fecha') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return 'Elige el día en que termina.'
    if (inicio !== '' && hasta < inicio) return 'La recurrencia no puede terminar antes del inicio.'
  }

  return null
}

/** Estado de una regla, tal como lo calcula la API (`RecursoRecurrentes::estado()`). */
export type EstadoRegla = 'activa' | 'atrasada' | 'pausada' | 'terminada' | 'suspendida' | 'sin_calcular'

/** Una fila de `GET /tasks/recurrentes`. */
export interface ReglaRecurrente {
  id: number
  name: string
  status: number
  start_date: string | null
  project: { id: number, name: string } | null
  client: { id: number, name: string } | null
  repeat_every: number
  recurring_type: string | null
  frequency_label: string | null
  cycles: number
  total_cycles: number
  recurring_until: string | null
  /** Dias ISO (1 = lunes .. 7 = domingo) en que no nace copia. Vacio: todos los dias sirven. */
  skip_weekdays: number[]
  /** Pausada: la regla se conserva pero no genera copias. `next_date` llega en null. */
  paused: boolean
  paused_at: string | null
  next_date: string | null
  state: EstadoRegla
  last_copy: { id: number, created_at: string, start_date: string | null, status: number } | null
  copies_count: number
  assignees: StaffReferencia[]
}

/** Como se nombra y se pinta cada estado. El tono es un nombre de token, no un color. */
export const ESTADOS_REGLA: Record<EstadoRegla, { etiqueta: string, tono: 'exito' | 'aviso' | 'peligro' | 'neutro', ayuda: string }> = {
  activa: { etiqueta: 'Activa', tono: 'exito', ayuda: 'Se copia sola en la próxima fecha.' },
  atrasada: {
    tono: 'aviso',
    etiqueta: 'Copia atrasada',
    ayuda: 'La copia de esa fecha todavía no se generó. El programador copia a las 9:00; si mañana sigue así, avisa a soporte.'
  },
  pausada: {
    tono: 'neutro',
    etiqueta: 'Pausada',
    ayuda: 'La regla se conserva, pero no genera copias hasta que la reanudes. Al reanudar no se crean las copias que correspondían mientras estuvo pausada.'
  },
  terminada: { etiqueta: 'Terminada', tono: 'neutro', ayuda: 'Ya cumplió sus veces o pasó su fecha de término.' },
  suspendida: {
    tono: 'neutro',
    etiqueta: 'Completada',
    ayuda: 'La tarea se marcó como completada y por eso ya no genera copias. Si debe seguir repitiéndose, cambia su estado desde la ficha de la tarea.'
  },
  sin_calcular: {
    tono: 'peligro',
    etiqueta: 'Mal configurada',
    ayuda: 'Le falta la frecuencia o la fecha de inicio. Ábrela y vuelve a guardar la recurrencia.'
  }
}

/**
 * Como termina una regla, en una frase corta para la tabla.
 *
 * @param regla la fila de la API
 * @param formatear como se escribe una fecha (se inyecta para no atar esto al formato de pantalla)
 */
export function textoDeFin (regla: Pick<ReglaRecurrente, 'cycles' | 'total_cycles' | 'recurring_until'>, formatear: (fecha: string) => string): string {
  const partes: string[] = []

  if (regla.cycles > 0) partes.push(`${regla.total_cycles} de ${regla.cycles} veces`)
  if (regla.recurring_until !== null) partes.push(`hasta el ${formatear(regla.recurring_until)}`)

  return partes.length === 0 ? `Sin fin · ${regla.total_cycles} ${regla.total_cycles === 1 ? 'copia' : 'copias'}` : partes.join(' · ')
}

/**
 * Como termina una regla guardada, para la ficha: ahi no hay cuenta de copias hechas, solo la regla.
 *
 * @param cycles tope de copias; 0 es sin tope
 * @param until ultimo dia, o null
 * @param formatear como se escribe una fecha
 * @returns "Sin fin", "Tras 12 veces", "Hasta el ..." o las dos cosas
 */
export function textoDeFinDeRegla (cycles: number | undefined, until: string | null | undefined, formatear: (fecha: string) => string): string {
  const veces = (cycles ?? 0) > 0 ? `tras ${cycles ?? 0} ${cycles === 1 ? 'vez' : 'veces'}` : null
  const fecha = typeof until === 'string' && until !== '' ? `el ${formatear(until)}` : null

  if (veces !== null && fecha !== null) return `Termina ${veces} o ${fecha}, lo que ocurra primero`
  if (veces !== null) return `Termina ${veces}`
  if (fecha !== null) return `Termina ${fecha}`

  return 'Sin fecha de término'
}

/**
 * Cuanto falta para una fecha sin hora, en dias y en palabras: "hoy", "mañana", "en 5 días".
 *
 * No se usa `formatearRelativo` porque ese mide instantes: una fecha sin hora la ancla al mediodia y
 * a las 16:00 escribe "hace 4 horas" para la copia de hoy, que es justo la que todavia no salio.
 *
 * @param dias lo que devolvio `diasHasta` (negativo si ya paso)
 * @returns la frase corta
 */
export function textoDeDistancia (dias: number): string {
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'mañana'
  if (dias === -1) return 'ayer'

  return dias > 0 ? `en ${dias} días` : `hace ${-dias} días`
}

/** Filtros de la pantalla. Vacio es "todos". */
export interface FiltrosRecurrentes {
  proyecto: string
  responsable: string
  area: string
}

/**
 * La ruta del BFF para el listado con sus filtros, en el formato `filter[...]` del resto de la API.
 *
 * @param filtros lo elegido en la barra
 * @returns ruta sin barra inicial
 */
export function rutaDeRecurrentes (filtros: FiltrosRecurrentes): string {
  const parametros = new URLSearchParams()

  if (filtros.proyecto !== '') parametros.set('filter[project_id]', filtros.proyecto)
  if (filtros.responsable !== '') parametros.set('filter[assignee]', filtros.responsable)
  if (filtros.area !== '') parametros.set('filter[area]', filtros.area)

  const consulta = parametros.toString()

  return consulta === '' ? 'tasks/recurrentes' : `tasks/recurrentes?${consulta}`
}

// --- Dias en que no se genera -----------------------------------------------------------------

/** Un dia de la semana en la numeracion ISO de la API: 1 = lunes .. 7 = domingo. */
export interface DiaSemana {
  iso: number
  /** La letra del boton. Miercoles es "X", como en los calendarios en castellano. */
  inicial: string
  nombre: string
}

/** Los siete dias, de lunes a domingo. */
export const DIAS_SEMANA: readonly DiaSemana[] = [
  { iso: 1, inicial: 'L', nombre: 'lunes' },
  { iso: 2, inicial: 'M', nombre: 'martes' },
  { iso: 3, inicial: 'X', nombre: 'miércoles' },
  { iso: 4, inicial: 'J', nombre: 'jueves' },
  { iso: 5, inicial: 'V', nombre: 'viernes' },
  { iso: 6, inicial: 'S', nombre: 'sábado' },
  { iso: 7, inicial: 'D', nombre: 'domingo' }
]

/** Sabado y domingo: lo que excluye el atajo "Sin fines de semana". */
const FIN_DE_SEMANA = [6, 7]

/**
 * Los dias sin repetidos, ordenados y solo los validos (enteros de 1 a 7).
 *
 * @param dias lo que venga: de la API, del formulario o de un clic
 * @returns la lista limpia, lista para comparar o mandar
 */
export function normalizarDias (dias: readonly number[] | null | undefined): number[] {
  if (!Array.isArray(dias)) return []

  return [...new Set(dias.filter((dia) => Number.isInteger(dia) && dia >= 1 && dia <= 7))].sort((a, b) => a - b)
}

/**
 * Marca o desmarca un dia.
 *
 * @param dias los excluidos actuales
 * @param iso el dia tocado
 * @returns la lista nueva, normalizada
 */
export function alternarDia (dias: readonly number[], iso: number): number[] {
  return dias.includes(iso) ? normalizarDias(dias.filter((dia) => dia !== iso)) : normalizarDias([...dias, iso])
}

/** True si sabado y domingo estan los dos excluidos. */
export function excluyeFinesDeSemana (dias: readonly number[]): boolean {
  return FIN_DE_SEMANA.every((dia) => dias.includes(dia))
}

/**
 * El atajo "Sin fines de semana": si ya estan los dos, los quita; si no, agrega los que falten.
 *
 * @param dias los excluidos actuales
 * @returns la lista nueva, normalizada
 */
export function alternarFinesDeSemana (dias: readonly number[]): number[] {
  return excluyeFinesDeSemana(dias)
    ? normalizarDias(dias.filter((dia) => !FIN_DE_SEMANA.includes(dia)))
    : normalizarDias([...dias, ...FIN_DE_SEMANA])
}

/** True si las dos listas excluyen los mismos dias, sin importar el orden. */
export function mismosDias (unos: readonly number[], otros: readonly number[]): boolean {
  const a = normalizarDias(unos)
  const b = normalizarDias(otros)

  return a.length === b.length && a.every((dia, posicion) => dia === b[posicion])
}

/**
 * El problema de los dias excluidos, o null. Excluir los siete es una regla que nunca genera nada:
 * la API la rechaza (`excluye_todos`) y aca se avisa antes de mandarla.
 */
export function errorDeDiasExcluidos (dias: readonly number[]): string | null {
  return normalizarDias(dias).length >= DIAS_SEMANA.length
    ? 'No puedes excluir los siete días: la tarea nunca se generaría.'
    : null
}

/** "a", "a y b", "a, b y c". */
function enumerar (partes: string[]): string {
  if (partes.length <= 1) return partes.join('')

  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1] ?? ''}`
}

/**
 * Los dias excluidos en una frase corta: "salvo sábado y domingo". Vacio si no hay ninguno.
 *
 * @param dias los excluidos
 * @returns la frase, sin mayuscula inicial ni punto, para colgarla de otra
 */
export function textoDeDiasExcluidos (dias: readonly number[]): string {
  const nombres = normalizarDias(dias).map((iso) => DIAS_SEMANA[iso - 1]?.nombre ?? '')

  return nombres.length === 0 ? '' : `salvo ${enumerar(nombres)}`
}

const UNIDADES_DE_FRASE: Record<string, [string, string]> = {
  day: ['día', 'días'],
  week: ['semana', 'semanas'],
  month: ['mes', 'meses'],
  year: ['año', 'años']
}

/**
 * La regla en palabras, con la misma forma que el `frequency_label` de la API: "Cada 2 semanas",
 * "Cada día, salvo sábado y domingo".
 *
 * Es solo texto para la ficha, donde `GET /tasks/{id}` no manda la frase ya armada. Las fechas NO se
 * calculan aca: para eso esta `POST /tasks/recurrentes/previa`.
 *
 * @param cada cada cuantas unidades
 * @param unidad `day`, `week`, `month` o `year`
 * @param dias los dias excluidos
 * @returns la frase, o null si la regla no tiene frecuencia valida
 */
export function fraseDeRegla (cada: number | undefined, unidad: string | null | undefined, dias: readonly number[] = []): string | null {
  const nombres = UNIDADES_DE_FRASE[unidad ?? '']
  if (nombres === undefined || cada === undefined || !Number.isInteger(cada) || cada < 1) return null

  const base = cada === 1 ? `Cada ${nombres[0]}` : `Cada ${cada} ${nombres[1]}`
  const salvo = textoDeDiasExcluidos(dias)

  return salvo === '' ? base : `${base}, ${salvo}`
}

/**
 * Una fecha de la vista previa, legible: "lunes 29 de septiembre de 2026".
 *
 * Se lee en UTC a proposito: la fecha llega sin hora, y leerla en la zona del navegador la corre un
 * dia hacia atras en cualquier zona al oeste de Greenwich.
 *
 * @param fecha `YYYY-MM-DD`
 * @returns la fecha con su dia de semana, o el texto tal cual si no es una fecha
 */
export function textoDeFechaDePrevia (fecha: string): string {
  const dia = new Date(`${fecha}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(dia.getTime())) return fecha

  return new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .format(dia)
    .replace(',', '')
}

// --- Editor de la regla -----------------------------------------------------------------------

/** Lo que guarda la API de una Tarea recurrente, tal como llega en `GET /tasks/{id}`. */
export interface ReglaGuardada {
  start_date: string | null
  repeat_every?: number
  recurring_type?: string | null
  cycles?: number
  recurring_until?: string | null
  skip_weekdays?: number[]
}

/** Como termina, en la forma del bloque `FinDeRecurrencia`. Todo texto, como cualquier formulario. */
export interface FinDeRegla {
  modo: ModoFin
  ciclos: string
  hasta: string
}

/** El formulario del editor de la regla. */
export interface CamposRegla {
  inicio: string
  repetirCada: string
  unidad: string
  fin: FinDeRegla
  dias: number[]
}

/** Los campos del editor que pueden tener un error propio. */
export type CampoRegla = 'inicio' | 'repetirCada' | 'unidad' | 'fin' | 'dias'

/** Las unidades que acepta la API, en el orden en que se ofrecen. */
export const UNIDADES_REGLA: ReadonlyArray<{ valor: string, etiqueta: string }> = [
  { valor: 'day', etiqueta: 'Días' },
  { valor: 'week', etiqueta: 'Semanas' },
  { valor: 'month', etiqueta: 'Meses' },
  { valor: 'year', etiqueta: 'Años' }
]

/**
 * El formulario del editor, a partir de la Tarea guardada.
 *
 * @param regla lo que trajo `GET /tasks/{id}`
 * @returns los campos iniciales
 */
export function camposDeRegla (regla: ReglaGuardada): CamposRegla {
  return {
    inicio: regla.start_date ?? '',
    repetirCada: String(regla.repeat_every !== undefined && regla.repeat_every > 0 ? regla.repeat_every : 1),
    unidad: regla.recurring_type ?? 'month',
    fin: {
      modo: modoDeFin(regla.cycles, regla.recurring_until),
      ciclos: String(regla.cycles ?? 0),
      hasta: regla.recurring_until ?? ''
    },
    dias: normalizarDias(regla.skip_weekdays)
  }
}

/**
 * True si la regla guardada termina por las dos vias a la vez: N veces **y** un dia.
 *
 * El bloque "Termina" solo sabe mostrar una. Mientras nadie lo toque, el guardado conserva las dos
 * (ver `cuerpoDeFinConservado`); la pantalla lo avisa para que tocarlo no sea una sorpresa.
 */
export function tieneDosTopes (campos: CamposRegla): boolean {
  return campos.fin.hasta !== '' && Number(campos.fin.ciclos) > 0
}

/** True si el bloque "Termina" quedo como se abrio. */
function finSinTocar (inicial: FinDeRegla, actual: FinDeRegla): boolean {
  return inicial.modo === actual.modo && inicial.ciclos === actual.ciclos && inicial.hasta === actual.hasta
}

/**
 * `cycles` y `recurring_until` para el cuerpo, sin perder un tope que nadie toco.
 *
 * `cuerpoDeFin` arma lo que muestra el bloque, y el bloque muestra un solo modo: con una regla que
 * tiene veces y fecha, mandarlo tal cual reenviaria `cycles: 0` y borraria el tope de veces en un
 * guardado donde solo se cambio, por ejemplo, la frecuencia. Si el bloque no se toco, viaja lo que
 * estaba guardado; si se toco, manda lo que se eligio.
 *
 * @param inicial el fin tal como se abrio
 * @param actual el fin tal como quedo
 * @returns `cycles` siempre y `recurring_until` si hay fecha
 */
export function cuerpoDeFinConservado (inicial: FinDeRegla, actual: FinDeRegla): { cycles: number, recurring_until?: string } {
  if (!finSinTocar(inicial, actual)) return cuerpoDeFin(actual.modo, actual.ciclos, actual.hasta)

  const ciclos = Number(inicial.ciclos)

  return {
    cycles: Number.isInteger(ciclos) && ciclos > 0 ? ciclos : 0,
    ...(inicial.hasta === '' ? {} : { recurring_until: inicial.hasta })
  }
}

/**
 * Los errores del formulario, uno por campo. Vacio si se puede guardar.
 *
 * @param campos lo que hay en el formulario
 * @returns mensaje por campo
 */
export function erroresDeRegla (campos: CamposRegla): Partial<Record<CampoRegla, string>> {
  const errores: Partial<Record<CampoRegla, string>> = {}
  const cada = Number(campos.repetirCada)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(campos.inicio)) errores.inicio = 'Elige la fecha de inicio: desde ahí se cuentan las copias.'
  if (campos.repetirCada.trim() === '' || !Number.isInteger(cada) || cada < 1 || cada > 365) {
    errores.repetirCada = 'Debe ser un entero entre 1 y 365.'
  }
  if (!UNIDADES_REGLA.some((unidad) => unidad.valor === campos.unidad)) errores.unidad = 'Elige días, semanas, meses o años.'

  const fin = errorDeFin(campos.fin.modo, campos.fin.ciclos, campos.fin.hasta, campos.inicio)
  if (fin !== null) errores.fin = fin

  const dias = errorDeDiasExcluidos(campos.dias)
  if (dias !== null) errores.dias = dias

  return errores
}

/** El cuerpo del `PATCH /tasks/{id}` que manda el editor. */
export interface ParcheRegla {
  recurring?: true
  repeat_every?: number
  recurring_type?: string
  cycles?: number
  recurring_until?: string
  skip_weekdays?: number[]
  start_date?: string
}

/**
 * El `PATCH` del editor: solo lo que cambio de la regla.
 *
 * Si cambia algo de la regla (frecuencia, fin o dias) viaja `recurring: true` con la regla entera,
 * porque asi lo pide el contrato: con `recurring: true`, una `recurring_until` ausente vale null y un
 * `cycles` ausente vale 0. `skip_weekdays` va solo si cambio (ausente = no se toca). El inicio va
 * solo si cambio, y solo, si es lo unico: cambiarlo re-ancla la regla en la API.
 *
 * @param inicial los campos tal como se abrieron
 * @param actual los campos tal como quedaron
 * @returns el cuerpo; vacio si no cambio nada
 */
export function parcheDeRegla (inicial: CamposRegla, actual: CamposRegla): ParcheRegla {
  const parche: ParcheRegla = {}
  const cambiaDias = !mismosDias(inicial.dias, actual.dias)
  const cambiaRegla = cambiaDias || inicial.repetirCada.trim() !== actual.repetirCada.trim() ||
    inicial.unidad !== actual.unidad || !finSinTocar(inicial.fin, actual.fin)

  if (cambiaRegla) {
    parche.recurring = true
    parche.repeat_every = Number(actual.repetirCada)
    parche.recurring_type = actual.unidad
    Object.assign(parche, cuerpoDeFinConservado(inicial.fin, actual.fin))
    if (cambiaDias) parche.skip_weekdays = normalizarDias(actual.dias)
  }
  if (inicial.inicio !== actual.inicio) parche.start_date = actual.inicio

  return parche
}

/** Cuantas fechas pide la vista previa. La API acepta hasta 12. */
export const FECHAS_DE_PREVIA = 5

/** El cuerpo de `POST /tasks/recurrentes/previa`. */
export interface CuerpoPrevia {
  task_id?: number
  start_date?: string
  repeat_every: number
  recurring_type: string
  cycles: number
  recurring_until?: string
  skip_weekdays: number[]
  cantidad: number
}

/** Lo que contesta `POST /tasks/recurrentes/previa`. */
export interface Previa {
  frequency_label: string | null
  dates: string[]
  none: boolean
}

/**
 * El cuerpo de la vista previa para lo que hay en el formulario.
 *
 * Con Tarea, el inicio viaja solo si cambio: sin el, la API cuenta desde la ultima copia real, que
 * es lo que va a pasar si se guarda sin tocar el inicio. Sin Tarea, el inicio es obligatorio.
 *
 * @param inicial los campos como se abrieron
 * @param actual los campos como estan
 * @param tareaId la Tarea que se edita, o null si todavia no existe
 * @returns el cuerpo listo para mandar
 */
export function cuerpoDePrevia (inicial: CamposRegla, actual: CamposRegla, tareaId: number | null): CuerpoPrevia {
  return {
    ...(tareaId === null ? {} : { task_id: tareaId }),
    ...(tareaId === null || inicial.inicio !== actual.inicio ? { start_date: actual.inicio } : {}),
    repeat_every: Number(actual.repetirCada),
    recurring_type: actual.unidad,
    ...cuerpoDeFinConservado(inicial.fin, actual.fin),
    skip_weekdays: normalizarDias(actual.dias),
    cantidad: FECHAS_DE_PREVIA
  }
}

/** A que campo del editor corresponde cada clave del contrato. */
const CAMPO_DE_CLAVE: Record<string, CampoRegla> = {
  start_date: 'inicio',
  repeat_every: 'repetirCada',
  recurring_type: 'unidad',
  cycles: 'fin',
  recurring_until: 'fin',
  skip_weekdays: 'dias'
}

/** Frases de cada `clave.codigo` de un 422 de la regla. Lo que no esta cae en una generica. */
const MENSAJES_DE_REGLA: Record<string, string> = {
  'skip_weekdays.excluye_todos': 'No puedes excluir los siete días: la tarea nunca se generaría.',
  'skip_weekdays.repetido': 'Hay un día repetido.',
  'skip_weekdays.invalid': 'Los días deben ir de lunes (1) a domingo (7).',
  'skip_weekdays.no_es_lista': 'Los días deben ser una lista.',
  'repeat_every.fuera_de_rango': 'Debe ser un entero entre 1 y 365.',
  'recurring_type.no_soportado': 'Elige días, semanas, meses o años.',
  'cycles.fuera_de_rango': 'Las veces deben ser un entero entre 1 y 365.',
  'recurring_until.invalid': 'La fecha de término no es válida.',
  'recurring_until.anterior_al_inicio': 'La recurrencia no puede terminar antes del inicio.',
  'start_date.requerido': 'Falta la fecha de inicio.',
  'start_date.formato_invalido': 'La fecha de inicio no es válida.',
  'start_date.invalid': 'La fecha de inicio no es válida.'
}

/**
 * Los `details` de un 422 de la regla, repartidos por campo del editor.
 *
 * Lo que no es de la regla (un permiso, una clave ajena) no se reparte: queda para el mensaje
 * general que ya arma `mensajeConDetalles`.
 *
 * @param detalles el `error.details` del sobre, si vino
 * @returns mensaje por campo
 */
export function erroresDeApiEnRegla (detalles: Record<string, unknown> | undefined): Partial<Record<CampoRegla, string>> {
  const errores: Partial<Record<CampoRegla, string>> = {}
  if (detalles === undefined) return errores

  for (const [clave, codigos] of Object.entries(detalles)) {
    const campo = CAMPO_DE_CLAVE[clave]
    const codigo = Array.isArray(codigos) && typeof codigos[0] === 'string' ? codigos[0] : null
    if (campo === undefined || codigo === null || errores[campo] !== undefined) continue

    errores[campo] = MENSAJES_DE_REGLA[`${clave}.${codigo}`] ?? `No es válido (${codigo.replace(/_/g, ' ')}).`
  }

  return errores
}

// --- Importador -------------------------------------------------------------------------------

/** Las columnas que entiende `POST /tasks/recurrentes/importar`, en el orden de la plantilla. */
export const COLUMNAS_PLANILLA = [
  'tarea', 'frecuencia', 'responsable', 'proyecto_id', 'fecha_inicio', 'vencimiento_dias', 'fin'
] as const

export type ColumnaPlanilla = typeof COLUMNAS_PLANILLA[number]

/** Una fila leida de la planilla, como texto. Lo que no vino queda en cadena vacia. */
export type FilaPlanilla = Record<ColumnaPlanilla, string>

/** Encabezados que se reconocen para cada columna, ya normalizados (sin tildes ni mayusculas). */
const ALIAS: Record<ColumnaPlanilla, string[]> = {
  tarea: ['tarea', 'nombre', 'titulo'],
  frecuencia: ['frecuencia', 'cada', 'periodicidad'],
  responsable: ['responsable', 'asignado', 'correo', 'email'],
  proyecto_id: ['proyecto', 'proyecto_id', 'cliente/proyecto', 'cliente / proyecto', 'id proyecto'],
  fecha_inicio: ['inicio', 'fecha_inicio', 'fecha inicio', 'desde'],
  vencimiento_dias: ['vencimiento', 'vencimiento_dias', 'plazo', 'plazo dias', 'dias de plazo'],
  fin: ['fin', 'termina', 'hasta']
}

/** Titulos de la plantilla descargable: los que una persona reconoce en su planilla. */
const TITULOS: Record<ColumnaPlanilla, string> = {
  tarea: 'Tarea',
  frecuencia: 'Frecuencia',
  responsable: 'Responsable',
  proyecto_id: 'Proyecto',
  fecha_inicio: 'Inicio',
  vencimiento_dias: 'Plazo dias',
  fin: 'Fin'
}

/**
 * Separa una linea de planilla en celdas, respetando comillas (RFC 4180).
 *
 * @param linea una linea sin el salto
 * @param separador tabulador, punto y coma o coma
 * @returns las celdas, sin las comillas de borde y con `""` vuelto `"`
 */
function celdas (linea: string, separador: string): string[] {
  const resultado: string[] = []
  let actual = ''
  let entreComillas = false

  for (let i = 0; i < linea.length; i++) {
    const letra = linea[i]
    if (letra === '"' && entreComillas && linea[i + 1] === '"') {
      actual += '"'
      i++
    } else if (letra === '"') {
      entreComillas = !entreComillas
    } else if (letra === separador && !entreComillas) {
      resultado.push(actual)
      actual = ''
    } else {
      actual += letra
    }
  }
  resultado.push(actual)

  return resultado.map((celda) => celda.trim())
}

/**
 * El separador de la planilla: tabulador si viene pegada de Sheets o Excel, y si no, el que mas
 * aparezca entre `;` (Excel en español guarda asi el CSV) y `,`.
 */
function separadorDe (primera: string): string {
  if (primera.includes('\t')) return '\t'

  return (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ';' : ','
}

/**
 * A que columna corresponde cada posicion, si la primera linea es un encabezado.
 *
 * @returns el mapa posicion -> columna, o null si la linea no parece encabezado (ninguna celda
 *          coincide con un nombre conocido)
 */
function mapaDeEncabezado (encabezado: string[]): Array<ColumnaPlanilla | null> | null {
  const mapa = encabezado.map((celda) => {
    const limpio = normalizar(celda)

    return COLUMNAS_PLANILLA.find((columna) => ALIAS[columna].includes(limpio)) ?? null
  })

  return mapa.some((columna) => columna !== null) ? mapa : null
}

/**
 * Lee lo que se pego o se subio: CSV, CSV con punto y coma, o celdas copiadas de una planilla.
 *
 * Con encabezado, cada columna se ubica por su nombre y el orden no importa. Sin encabezado, se toma
 * el orden de la plantilla. Las lineas en blanco se descartan: una planilla copiada casi siempre
 * trae alguna al final, y mandarlas a la API solo sumaria errores de "fila vacia".
 *
 * @param texto el contenido crudo
 * @returns las filas, en el orden en que venian
 */
export function leerPlanilla (texto: string): FilaPlanilla[] {
  const lineas = texto.replace(/^\uFEFF/, '').split(/\r?\n/).filter((linea) => linea.trim() !== '')
  const primera = lineas[0]
  if (primera === undefined) return []

  const separador = separadorDe(primera)
  const encabezado = mapaDeEncabezado(celdas(primera, separador))
  const mapa = encabezado ?? [...COLUMNAS_PLANILLA]
  const cuerpo = encabezado === null ? lineas : lineas.slice(1)

  return cuerpo
    .map((linea) => {
      const fila = Object.fromEntries(COLUMNAS_PLANILLA.map((columna) => [columna, ''])) as FilaPlanilla
      celdas(linea, separador).forEach((valor, posicion) => {
        const columna = mapa[posicion]
        if (columna !== null && columna !== undefined) fila[columna] = valor
      })

      return fila
    })
    .filter((fila) => Object.values(fila).some((valor) => valor !== ''))
}

/** Algo con id y nombre, para resolver lo que alguien escribio a mano en la planilla. */
interface ConNombre { id: number, name: string }

/**
 * Traduce los nombres escritos a mano a los ids que pide la API.
 *
 * En una planilla nadie escribe "Proyecto 112": escribe "SAC Contact Center". Se busca el nombre
 * exacto (sin tildes ni mayusculas) en los catalogos que la pantalla ya tiene; si hay uno solo, se
 * manda su id. Si no hay ninguno, o hay dos iguales, la celda viaja tal cual y la API la rechaza
 * con su propio error: adivinar entre dos Proyectos homonimos es crear la tarea en el equivocado.
 *
 * Los correos y los numeros no se tocan: la API los entiende directo.
 *
 * @param fila la fila leida
 * @param proyectos catalogo de Proyectos visibles
 * @param personas catalogo de personas asignables
 * @returns la fila lista para mandar
 */
export function resolverNombres (fila: FilaPlanilla, proyectos: ConNombre[], personas: ConNombre[]): FilaPlanilla {
  return {
    ...fila,
    proyecto_id: idPorNombre(fila.proyecto_id, proyectos),
    responsable: fila.responsable.includes('@') ? fila.responsable : idPorNombre(fila.responsable, personas)
  }
}

/** El id del unico elemento con ese nombre, o el texto original si no hay exactamente uno. */
function idPorNombre (texto: string, catalogo: ConNombre[]): string {
  if (texto === '' || /^\d+$/.test(texto)) return texto

  const buscado = normalizar(texto)
  const iguales = catalogo.filter((elemento) => normalizar(elemento.name) === buscado)

  const unico = iguales.length === 1 ? iguales[0] : undefined

  return unico === undefined ? texto : String(unico.id)
}

/** La plantilla CSV descargable, con dos filas de ejemplo que cubren las formas de fin. */
export function plantillaCsv (): string {
  const filas = [
    COLUMNAS_PLANILLA.map((columna) => TITULOS[columna]),
    ['Informe de pauta', 'Mensual', 'nombre.apellido@wiwo.me', 'Nombre exacto del Proyecto', '01/10/2026', '3', '31/12/2026'],
    ['Respaldo del sitio', 'cada 2 semanas', 'nombre.apellido@wiwo.me', '112', '', '', '6 veces']
  ]

  return filas.map((fila) => fila.map((celda) => (/[",;\n]/.test(celda) ? `"${celda.replace(/"/g, '""')}"` : celda)).join(',')).join('\r\n') + '\r\n'
}

/** Lo que contesta `validar` por cada fila. */
export interface FilaValidada {
  indice: number
  valida: boolean
  errores: Record<string, string[]> | null
  avisos: Record<string, string[]> | null
  vista: {
    tarea: string
    frecuencia: string | null
    responsable_id: number
    proyecto_id: number
    fecha_inicio: string
    vencimiento: string | null
    ciclos: number
    hasta: string | null
  } | null
}

/** El parte completo de `modo: validar`. */
export interface ParteDeValidacion {
  modo: 'validar'
  filas: FilaValidada[]
  validas: number
  invalidas: number
}

/** Frases de cada codigo de error o aviso, por columna. Lo que no esta cae en la frase generica. */
const MENSAJES: Record<string, string> = {
  'fila.vacia': 'La fila está vacía.',
  'fila.invalid': 'La fila no se pudo leer.',
  'tarea.requerido': 'Falta el nombre de la tarea.',
  'tarea.ya_existe': 'Ya hay una tarea recurrente con este nombre en el Proyecto.',
  'tarea.repetida': 'Esta tarea aparece dos veces en la planilla.',
  'frecuencia.requerido': 'Falta la frecuencia.',
  'frecuencia.no_soportada': 'Frecuencia no reconocida. Usa semanal, quincenal, mensual, bimestral, trimestral, semestral, anual o "cada N días/semanas/meses/años".',
  'frecuencia.recurrencia_apagada': 'Las tareas recurrentes están apagadas.',
  'responsable.requerido': 'Falta el responsable.',
  'responsable.no_existe': 'No encontramos a esa persona, o está inactiva. Usa su correo.',
  'proyecto_id.requerido': 'Falta el Proyecto.',
  'proyecto_id.invalid': 'No encontramos ese Proyecto. Escribe su nombre exacto o su número.',
  'proyecto_id.sin_acceso': 'Ese Proyecto no existe o no puedes crear tareas en él.',
  'proyecto_id.no_existe': 'Ese Proyecto no existe o no puedes crear tareas en él.',
  'fecha_inicio.invalid': 'Fecha de inicio inválida. Usa DD/MM/AAAA.',
  'vencimiento_dias.fuera_de_rango': 'El plazo debe ser un número de días entre 0 y 365.',
  'vencimiento_dias.anterior_al_inicio': 'El plazo termina antes del inicio.',
  'fin.invalid': 'Fin inválido. Usa una fecha DD/MM/AAAA, un número de veces o déjalo vacío.',
  'fin.fuera_de_rango': 'Las veces deben estar entre 0 y 365.'
}

/**
 * Los mensajes de una fila, en el orden de las columnas, listos para mostrar.
 *
 * @param detalle `errores` o `avisos` de la fila
 * @returns pares columna y frase; vacio si no hay nada
 */
export function mensajesDeFila (detalle: Record<string, string[]> | null): Array<{ columna: string, mensaje: string }> {
  if (detalle === null) return []

  return Object.entries(detalle).flatMap(([columna, codigos]) =>
    codigos.map((codigo) => ({
      columna,
      mensaje: MENSAJES[`${columna}.${codigo}`] ?? (columna === 'fila' ? 'La fila tiene un problema.' : `La columna "${columna}" no es válida (${codigo}).`)
    }))
  )
}
