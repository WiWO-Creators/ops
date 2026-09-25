/**
 * Las reglas de la Supervisión diaria que la pantalla resuelve sola.
 *
 * La hoja la arma la API —qué Tareas entran, cuántos días de atraso, quién puede editar o
 * confirmar—; lo que queda acá es lo que el panel decide sin preguntar: qué día pedir, qué significa
 * volver a pulsar un botón ya marcado, cómo quedan los totales después de marcar, cómo se agrupa
 * (por cliente o por persona), qué se escribe de cada estado, qué avisar antes de firmar y a quién
 * ofrecerle la sección.
 *
 * Vive en un `.ts` y no dentro del componente por la regla de `docs/convenciones.md`: Node despoja
 * los tipos de un `.ts` pero no el JSX, así que solo lo que está fuera del componente se puede probar.
 */

import { ZONA_NEGOCIO, formatearFecha, sumarDias } from '../lib/fechas.ts'
import { ESCALONES, type Escalon } from './escalon.ts'
import type {
  ConfirmacionDeHoja,
  EstadoDeRevision,
  HojaDeSupervision,
  HojaDelEquipo,
  OrigenDeTarea,
  RevisionDeTarea,
  RevisionDelEquipo,
  SupervisorDeCliente,
  TareaDeLaHoja,
  TotalesDeHoja
} from '../datos/supervision.ts'

/** El escalón mínimo para supervisar: el mismo `Escalon::alcanza($e, LEAD)` de la API. */
export const ESCALON_MINIMO_SUPERVISOR: Escalon = 'lead'

/** Tope de la nota de una revisión, el mismo que valida la API. */
export const LARGO_MAXIMO_NOTA = 500

/**
 * La línea de la pestaña Supervisión de la persona: los clientes donde es Focal ya cuentan para su
 * hoja, así que la lista de esa pestaña es solo para sumar clientes que no son suyos como Focal.
 */
export const AVISO_FOCALES_ENTRAN_SOLOS = 'Los clientes donde es Focal ya entran solos en su hoja: esta lista es solo para sumar clientes extra.'

/** Ruta de la pantalla. */
export const RUTA_PANTALLA_SUPERVISION = '/supervision'

/**
 * El día de hoy en la zona del negocio, `YYYY-MM-DD`.
 *
 * No el reloj local: el contenedor corre en UTC y entre las 20:00 y la medianoche de Santiago "hoy"
 * en UTC ya es mañana. La hoja de mañana está vacía, y el supervisor creería que no tiene nada.
 *
 * @param ahora instante de referencia, inyectable para probar
 * @returns la fecha en Santiago
 */
export function hoyEnSantiago (ahora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_NEGOCIO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(ahora)

  const parte = (tipo: string): string => partes.find((p) => p.type === tipo)?.value ?? ''

  return `${parte('year')}-${parte('month')}-${parte('day')}`
}

/**
 * Si un texto es una fecha de calendario real con la forma `YYYY-MM-DD`.
 *
 * La forma sola no alcanza: `2026-02-31` pasa el patrón y la API la rechaza con 422, que la pantalla
 * mostraría como error cuando lo que hubo fue un enlace mal escrito.
 *
 * @param valor lo que vino en la URL
 * @returns `true` si es una fecha válida
 */
export function esFechaDeHoja (valor: unknown): valor is string {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false

  const [anio, mes, dia] = valor.split('-').map(Number)
  const instante = new Date(Date.UTC(anio ?? 0, (mes ?? 1) - 1, dia ?? 0))

  return instante.toISOString().slice(0, 10) === valor
}

/**
 * La fecha que la pantalla va a pedir, a partir del `?fecha=` de la URL.
 *
 * Una fecha inválida cae a hoy en vez de dar error: el enlace roto se corrige solo y la persona ve
 * su hoja, que es lo que venía a buscar.
 *
 * @param valor el parámetro crudo
 * @param hoy la fecha de hoy en Santiago
 * @returns la fecha a pedir
 */
export function fechaPedida (valor: string | string[] | undefined, hoy: string): string {
  return esFechaDeHoja(valor) ? valor : hoy
}

/**
 * El supervisor pedido en `?staff_id=`, o `null` para uno mismo.
 *
 * @param valor el parámetro crudo
 * @returns un id positivo, o `null`
 */
export function supervisorPedido (valor: string | string[] | undefined): number | null {
  if (typeof valor !== 'string' || !/^\d+$/.test(valor)) return null

  const id = Number(valor)

  return id > 0 ? id : null
}

/**
 * El enlace de la pantalla para un día y un supervisor.
 *
 * @param fecha `YYYY-MM-DD`
 * @param staffId el supervisor, o `null` para uno mismo
 * @returns la ruta con su consulta
 */
export function enlaceDeHoja (fecha: string, staffId: number | null): string {
  const parametros = new URLSearchParams({ fecha })

  if (staffId !== null) parametros.set('staff_id', String(staffId))

  return `${RUTA_PANTALLA_SUPERVISION}?${parametros.toString()}`
}

/**
 * El día anterior y el siguiente, para los botones de la cabecera.
 *
 * @param fecha la fecha de la hoja
 * @returns las dos fechas vecinas
 */
export function diasVecinos (fecha: string): { anterior: string, siguiente: string } {
  return { anterior: sumarDias(fecha, -1) ?? fecha, siguiente: sumarDias(fecha, 1) ?? fecha }
}

/**
 * Qué estado se manda al pulsar un botón de revisión.
 *
 * Pulsar el que ya está marcado lo desmarca (`null`, que en la API borra la revisión): es la única
 * forma de deshacer un clic equivocado sin un tercer botón.
 *
 * @param actual el estado guardado
 * @param pulsado el botón que se pulsó
 * @returns el estado a mandar
 */
export function siguienteEstado (actual: EstadoDeRevision | null, pulsado: EstadoDeRevision): EstadoDeRevision | null {
  return actual === pulsado ? null : pulsado
}

/**
 * Recuenta revisadas, OK y No OK de una hoja.
 *
 * `tareas` y `atrasadas` no se tocan: no dependen de lo que se marca.
 *
 * @param hoja la hoja
 * @returns los totales recalculados
 */
export function recontar (hoja: HojaDeSupervision): TotalesDeHoja {
  const revisiones = hoja.clientes.flatMap((cliente) => cliente.tareas)
    .map((tarea) => tarea.revision)
    .filter((revision): revision is RevisionDeTarea => revision !== null)

  return {
    ...hoja.totales,
    revisadas: revisiones.length,
    ok: revisiones.filter((revision) => revision.estado === 'ok').length,
    no_ok: revisiones.filter((revision) => revision.estado === 'no_ok').length
  }
}

/**
 * La hoja con la revisión de una Tarea reemplazada, y los totales al día.
 *
 * Se aplica con lo que devolvió la API y no con lo que se pidió: si la API normalizó la nota, la
 * pantalla muestra lo guardado.
 *
 * @param hoja la hoja actual
 * @param tareaId la Tarea marcada
 * @param revision lo que devolvió la API; `null` si se borró
 * @returns una hoja nueva
 */
export function conRevision (hoja: HojaDeSupervision, tareaId: number, revision: RevisionDeTarea | null): HojaDeSupervision {
  const nueva: HojaDeSupervision = {
    ...hoja,
    clientes: hoja.clientes.map((cliente) => ({
      ...cliente,
      tareas: cliente.tareas.map((tarea) => (tarea.id === tareaId ? { ...tarea, revision } : tarea))
    }))
  }

  return { ...nueva, totales: recontar(nueva) }
}

/**
 * Cuántas Tareas quedan sin revisar.
 *
 * @param totales los totales de la hoja
 * @returns nunca negativo
 */
export function sinRevisar (totales: TotalesDeHoja): number {
  return Math.max(0, totales.tareas - totales.revisadas)
}

/**
 * El aviso del diálogo de firma.
 *
 * Firmar con Tareas sin revisar está permitido —la hoja es del supervisor—, pero no puede pasar sin
 * que lo vea: firmada, ya no se puede volver a marcar nada.
 *
 * @param totales los totales de la hoja
 * @returns la frase del diálogo
 */
export function avisoDeFirma (totales: TotalesDeHoja): string {
  const pendientes = sinRevisar(totales)
  const cierre = 'Una vez firmada no se puede cambiar.'

  if (pendientes === 0) return `Revisaste las ${totales.tareas} tareas. ${cierre}`
  if (pendientes === 1) return `Queda 1 tarea sin revisar. ${cierre}`

  return `Quedan ${pendientes} tareas sin revisar. ${cierre}`
}

/**
 * El atraso en palabras.
 *
 * @param dias `dias_atraso` de la API
 * @returns la frase
 */
export function textoDeAtraso (dias: number): string {
  if (dias <= 0) return 'Vence hoy'
  if (dias === 1) return '1 día de atraso'

  return `${dias} días de atraso`
}

/**
 * Si un escalón alcanza para supervisar.
 *
 * Por el orden de la escalera y no por una lista escrita a mano: si un día se agrega un escalón
 * sobre `gerencia`, supervisa sin tocar esto. Un escalón desconocido no alcanza.
 *
 * @param escalon el escalón de la persona
 * @returns `true` de `lead` hacia arriba
 */
export function alcanzaParaSupervisar (escalon: string | null | undefined): boolean {
  const orden = ESCALONES.find((e) => e.clave === escalon)?.orden
  const minimo = ESCALONES.find((e) => e.clave === ESCALON_MINIMO_SUPERVISOR)?.orden ?? Infinity

  return orden !== undefined && orden >= minimo
}

/**
 * Si se ofrece la sección Supervisión en el menú.
 *
 * Esconder no autoriza: la API contesta 403 a quien mira una hoja ajena que no le toca. Esto solo
 * evita mostrarle a quien es `staff` una pantalla que siempre saldría vacía.
 *
 * @param yo quien mira, de `GET /me`
 * @returns `true` para lead o superior y para la administración
 */
export function puedeVerSupervision (yo: { escalon: string, is_admin: boolean, is_superadmin: boolean }): boolean {
  return yo.is_admin || yo.is_superadmin || alcanzaParaSupervisar(yo.escalon)
}

/** Nombre completo de un supervisor de cliente, que la API manda partido. */
export function nombreDeSupervisor (supervisor: Pick<SupervisorDeCliente, 'firstname' | 'lastname'>): string {
  return `${supervisor.firstname} ${supervisor.lastname}`.trim()
}

/**
 * La frase de un rechazo al guardar supervisores o clientes supervisados.
 *
 * El 422 de la API nombra el campo (`staff_ids`, `client_ids`) y no dice cuál de las tres causas
 * fue; la frase las nombra todas para que quien guarda sepa qué revisar.
 *
 * @param mensaje el mensaje que ya armó el cliente de datos
 * @param estado el código HTTP, si lo hubo
 * @param detalles `error.details` de la API
 * @returns la frase para la pantalla
 */
export function mensajeDeRechazo (mensaje: string, estado: number | undefined, detalles: Record<string, unknown> | undefined): string {
  if (estado === 403) return 'No tienes permiso para cambiar la supervisión de este cliente.'
  if (estado !== 422 || detalles === undefined) return mensaje

  if ('staff_ids' in detalles) {
    return 'Solo se pueden nombrar supervisores a personas activas de escalón Lead, Director o Gerencia.'
  }

  if ('client_ids' in detalles) return 'Alguno de los clientes elegidos ya no existe. Recarga la página y vuelve a elegir.'

  if ('staff_id' in detalles || 'escalon' in detalles) {
    return 'Esta persona no puede supervisar: su escalón tiene que ser Lead o superior.'
  }

  return mensaje
}

/** Cómo se agrupan las Tareas de la hoja en pantalla y en papel. */
export type ModoDeAgrupacion = 'cliente' | 'persona'

/** Las opciones del selector "Agrupar por", en orden. */
export const MODOS_DE_AGRUPACION: { valor: ModoDeAgrupacion, etiqueta: string }[] = [
  { valor: 'cliente', etiqueta: 'Cliente' },
  { valor: 'persona', etiqueta: 'Persona' }
]

/** Título del grupo de las Tareas sin cliente, el mismo que manda la API. */
export const TITULO_SIN_CLIENTE = 'Sin cliente'

/** Título del grupo de las Tareas sin nadie asignado, al agrupar por persona. */
export const TITULO_SIN_ASIGNAR = 'Sin asignar'

/** Un bloque de la hoja: un cliente o una persona, con sus Tareas. */
export interface GrupoDeHoja {
  /** Única dentro de la hoja; sirve de `key` y de id del título. */
  clave: string
  titulo: string
  tareas: TareaDeLaHoja[]
}

/**
 * Las Tareas de la hoja agrupadas por cliente o por persona asignada.
 *
 * Por cliente respeta el orden de la API y deja "Sin cliente" al final aunque la API lo mande en otro
 * lugar. Por persona, una Tarea con varios asignados aparece bajo cada uno —la revisa quien mira a
 * esa persona— y las que no tienen a nadie van en "Sin asignar", al final; las personas, por nombre.
 * Dentro de cada grupo se conserva el orden de la API (cliente, luego vencimiento).
 *
 * @param hoja la hoja
 * @param modo `cliente` o `persona`
 * @returns los grupos, nunca vacíos
 */
export function agruparHoja (hoja: HojaDeSupervision, modo: ModoDeAgrupacion): GrupoDeHoja[] {
  if (modo === 'persona') return agruparPorPersona(hoja)

  const grupos = hoja.clientes
    .filter((cliente) => cliente.tareas.length > 0)
    .map((cliente) => ({
      clave: `cliente-${cliente.client_id ?? 'sin'}`,
      titulo: cliente.client_id === null ? TITULO_SIN_CLIENTE : cliente.company,
      tareas: cliente.tareas
    }))

  return [
    ...grupos.filter((grupo) => grupo.clave !== 'cliente-sin'),
    ...grupos.filter((grupo) => grupo.clave === 'cliente-sin')
  ]
}

/** El modo `persona` de `agruparHoja`. */
function agruparPorPersona (hoja: HojaDeSupervision): GrupoDeHoja[] {
  const porPersona = new Map<number, GrupoDeHoja>()
  const sinAsignar: TareaDeLaHoja[] = []

  for (const tarea of hoja.clientes.flatMap((cliente) => cliente.tareas)) {
    if (tarea.asignados.length === 0) sinAsignar.push(tarea)

    for (const persona of tarea.asignados) {
      const grupo = porPersona.get(persona.staffid) ?? { clave: `persona-${persona.staffid}`, titulo: persona.nombre, tareas: [] }

      if (!grupo.tareas.includes(tarea)) grupo.tareas.push(tarea)
      porPersona.set(persona.staffid, grupo)
    }
  }

  const grupos = [...porPersona.values()].sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'))

  return sinAsignar.length === 0
    ? grupos
    : [...grupos, { clave: 'persona-sin', titulo: TITULO_SIN_ASIGNAR, tareas: sinAsignar }]
}

/**
 * El modo de agrupación de un texto (un parámetro, un valor guardado); cualquier otra cosa es cliente.
 *
 * @param valor el texto crudo
 * @returns el modo
 */
export function modoDeAgrupacion (valor: unknown): ModoDeAgrupacion {
  return valor === 'persona' ? 'persona' : 'cliente'
}

/** Cómo se pinta el estado de una Tarea: completada, vence hoy o atrasada. */
export interface EstadoDeTarea {
  tipo: 'completada' | 'vence_hoy' | 'atrasada'
  texto: string
}

/**
 * El estado de una Tarea en la hoja: el badge "Completada" con la hora, o el atraso.
 *
 * La hora sale de `completada_en`, que la API manda ya en hora de Santiago y sin huso: se corta el
 * texto en vez de pasarlo por un `Date`, que lo leería en la zona de quien mira. Si se completó otro
 * día que el de la hoja (vencía ese día y se cerró antes), dice qué día.
 *
 * @param tarea la Tarea
 * @param fecha la fecha de la hoja
 * @returns el tipo y la frase
 */
export function estadoDeTarea (tarea: Pick<TareaDeLaHoja, 'completada' | 'completada_en' | 'dias_atraso'>, fecha: string): EstadoDeTarea {
  if (tarea.completada) {
    const dia = tarea.completada_en?.slice(0, 10) ?? null
    const hora = tarea.completada_en?.slice(11, 16) ?? ''

    if (dia === null) return { tipo: 'completada', texto: 'Completada' }
    if (dia === fecha) return { tipo: 'completada', texto: `Completada ${hora}`.trim() }

    return { tipo: 'completada', texto: `Completada el ${formatearFecha(dia)}` }
  }

  return { tipo: tarea.dias_atraso > 0 ? 'atrasada' : 'vence_hoy', texto: textoDeAtraso(tarea.dias_atraso) }
}

/**
 * Por qué la Tarea está en la hoja, en palabras.
 *
 * Un `origen` vacío es legítimo: la Tarea entra solo porque ya tenía revisión de ese día y salió del
 * universo del supervisor. Ahí no hay etiqueta que poner, y la fila se pinta sin ella.
 *
 * @param origen el `origen` de la API
 * @returns "Por cliente", "Por equipo", "Por cliente y equipo", o `null` si viene vacío
 */
export function etiquetaDeOrigen (origen: OrigenDeTarea[]): string | null {
  const porCliente = origen.includes('cliente')
  const porEquipo = origen.includes('equipo')

  if (porCliente && porEquipo) return 'Por cliente y equipo'
  if (porEquipo) return 'Por equipo'

  return porCliente ? 'Por cliente' : null
}

/**
 * Lo que marcó alguien del equipo, en una línea: "✔ OK · Diego Sosa".
 *
 * El contrato no manda el escalón de quien revisó, así que la línea nombra a la persona.
 *
 * @param revision la revisión del equipo
 * @returns la frase, sin la nota
 */
export function textoDeRevisionDelEquipo (revision: Pick<RevisionDelEquipo, 'estado' | 'nombre'>): string {
  return `${revision.estado === 'ok' ? '✔ OK' : '✘ No OK'} · ${revision.nombre}`
}

/** Si alguna Tarea de la hoja trae revisiones del equipo: decide la columna del papel. */
export function hayRevisionesDelEquipo (hoja: HojaDeSupervision): boolean {
  return hoja.clientes.some((cliente) => cliente.tareas.some((tarea) => tarea.revisiones_equipo.length > 0))
}

/**
 * La hoja después de confirmarla o devolverla, con lo que devolvió la API.
 *
 * Devolver anula la firma y la hoja vuelve a quedar abierta para su dueño —pero quien confirma no es
 * el dueño, así que `puede_editar` no cambia acá—. Confirmada o devuelta, ya no hay nada que
 * confirmar.
 *
 * @param hoja la hoja actual
 * @param confirmacion lo que devolvió la API
 * @returns una hoja nueva
 */
export function conConfirmacion (hoja: HojaDeSupervision, confirmacion: ConfirmacionDeHoja): HojaDeSupervision {
  return {
    ...hoja,
    confirmacion,
    puede_confirmar: false,
    firma: confirmacion.estado === 'devuelta' ? null : hoja.firma
  }
}

/**
 * Qué falta en la nota de una devolución, o `null` si se puede mandar.
 *
 * @param nota lo escrito
 * @returns el error para el campo, o `null`
 */
export function errorDeNotaDeDevolucion (nota: string): string | null {
  if (nota.trim() === '') return 'Escribe qué hay que corregir: la nota es obligatoria para devolver.'
  if (nota.length > LARGO_MAXIMO_NOTA) return `La nota admite hasta ${LARGO_MAXIMO_NOTA} caracteres.`

  return null
}

/**
 * La hora `HH:MM` de un instante ISO, en Santiago.
 *
 * @param instante ISO 8601 con desfase
 * @returns la hora, o cadena vacía si no se entiende
 */
export function horaEnSantiago (instante: string): string {
  const fecha = new Date(instante)

  if (Number.isNaN(fecha.getTime())) return ''

  return new Intl.DateTimeFormat('es-CL', { timeZone: ZONA_NEGOCIO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(fecha)
}

/**
 * El estado de una hoja del equipo, en palabras: "Sin firmar", "Firmada 18:05", "Confirmada",
 * "Devuelta".
 *
 * @param fila la fila de `GET /supervision/equipo`
 * @returns la frase
 */
export function textoDeEstadoDelEquipo (fila: Pick<HojaDelEquipo, 'estado' | 'firmado_en'>): string {
  if (fila.estado === 'confirmada') return 'Confirmada'
  if (fila.estado === 'devuelta') return 'Devuelta'
  if (fila.estado === 'sin_firmar' || fila.firmado_en === null) return 'Sin firmar'

  return `Firmada ${horaEnSantiago(fila.firmado_en)}`.trim()
}

/** Si una hoja del equipo espera la confirmación de quien mira: firmada y sin confirmar. */
export function esperaConfirmacion (fila: Pick<HojaDelEquipo, 'estado'>): boolean {
  return fila.estado === 'firmada'
}

/** Cuántas hojas del equipo esperan confirmación. */
export function hojasPorConfirmar (filas: Pick<HojaDelEquipo, 'estado'>[]): number {
  return filas.filter(esperaConfirmacion).length
}

/**
 * El vacío de la pantalla cuando la persona no tiene hoja: ni gente a cargo ni clientes.
 *
 * Explica de dónde sale la hoja —la gente a cargo en el árbol, los clientes donde es Focal y los que
 * se suman en la pestaña Supervisión— para que quien la ve vacía sepa qué pedir.
 *
 * @param esPropia si quien mira es el dueño
 * @param nombre el nombre del dueño
 * @returns título y descripción del `Vacio`
 */
export function vacioSinSupervision (esPropia: boolean, nombre: string): { titulo: string, descripcion: string } {
  return {
    titulo: esPropia ? 'No tienes gente a cargo ni clientes' : `${nombre} no tiene gente a cargo ni clientes`,
    descripcion: 'La hoja se arma sola con las tareas de la gente a cargo en el organigrama y con las de los clientes donde se es Focal o que se suman en la pestaña Supervisión de la ficha de la persona.'
  }
}
