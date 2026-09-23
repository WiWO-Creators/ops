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
export type EstadoRegla = 'activa' | 'atrasada' | 'terminada' | 'suspendida' | 'sin_calcular'

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
  terminada: { etiqueta: 'Terminada', tono: 'neutro', ayuda: 'Ya cumplió sus veces o pasó su fecha de término.' },
  suspendida: { etiqueta: 'Completada', tono: 'neutro', ayuda: 'La tarea está completada: no genera copias hasta que se reabra.' },
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
