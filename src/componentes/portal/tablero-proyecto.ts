import { formatearFecha } from '../../lib/fechas.ts'
import type {
  AvanceDelProyecto,
  HitoDelTablero,
  HitosDelTablero,
  SemanaDeCierres,
  TareasDelTablero
} from '../../datos/portal.ts'

/**
 * Las cuentas del tablero de UN {espacio} del portal.
 *
 * Vive en un `.ts` sin React ni `fetch` para que `pruebas/tablero-proyecto.test.js` la pueda
 * recorrer, igual que `tablero.ts` con los gráficos de la portada. Los imports son relativos y con
 * extensión porque el runner de Node no resuelve el alias `@/` fuera de `import type`.
 *
 * === LA REGLA DE TODO EL ARCHIVO ===
 *
 * `null` nunca se convierte en 0. La API manda `null` cuando no hay denominador —un {espacio} sin
 * {procesos} visibles no está al 0 % de avance—, y cada función de acá lo propaga en vez de
 * aplanarlo. La pantalla tiene que poder escribir «todavía no lo sabemos» en vez de dibujar una
 * barra vacía que se lee «no hicieron nada».
 *
 * **Acá no se calcula ninguna fecha.** El día sale de `formatearFecha`, el mismo formateador que usa
 * el resto del producto: derivar el día con otra zona horaria haría que una entrada de las 22:00
 * cayera en un día distinto según quién la pinte.
 */

/** Lo que se escribe cuando un gráfico no tiene ni una fila. Misma frase que la portada. */
export const SIN_NADA_QUE_MOSTRAR = 'Todavía no hay nada que mostrar acá.'

/** Mínimo de semanas con algún cierre para que la serie valga como serie y no como anécdota. */
export const SEMANAS_CON_DATO_MINIMAS = 3

/** Tope de personas en el gráfico de carga. Más filas que esto no se comparan, se hojean. */
export const TOPE_DE_PERSONAS = 12

// =================================================================================================
// AVANCE
// =================================================================================================

/** Una lectura del avance, ya decidida: o hay porcentaje, o hay un motivo por el que no lo hay. */
export interface LecturaDeAvance {
  /** `null` cuando no hay {procesos} visibles que contar. */
  porcentaje: number | null
  cerradas: number
  abiertas: number
  total: number
  /** Qué escribir cuando `porcentaje` es `null`. Vacío cuando sí hay porcentaje. */
  motivo: string
}

/**
 * Lee el bloque de avance y decide qué se puede afirmar.
 *
 * El motivo NO es decoración: es lo único que separa «no hay {procesos} compartidas» de «no se hizo
 * nada», que es exactamente la confusión que un 0 % provocaría.
 */
export function leerAvance (avance: AvanceDelProyecto): LecturaDeAvance {
  return {
    porcentaje: avance.porcentaje,
    cerradas: avance.cerradas,
    abiertas: avance.abiertas,
    total: avance.tareas,
    motivo: avance.porcentaje === null
      ? 'Todavía no hay tareas compartidas en este proyecto, así que no hay avance que medir.'
      : ''
  }
}

// =================================================================================================
// PRIORIDADES Y CONTEOS
// =================================================================================================

/** Una barra del gráfico de prioridades. */
export interface BarraDePrioridad {
  priority: number
  etiqueta: string
  total: number
  /** 0-1 sobre la prioridad más poblada, no sobre el total: lo que se compara es entre barras. */
  fraccion: number
}

/**
 * Las prioridades como barras de un solo tono.
 *
 * La escala es la prioridad más poblada y no el total de {procesos}: con 74 de 82 en «Medio», medir
 * contra el total dejaría las otras tres barras en un píxel y no se podrían comparar entre ellas,
 * que es la única comparación que el gráfico ofrece.
 *
 * Las cuatro salen siempre, también las que están en cero: una lista que cambia de largo según el
 * {espacio} obliga a releer los rótulos en cada pantalla.
 */
export function barrasDePrioridad (tareas: TareasDelTablero): BarraDePrioridad[] {
  const mayor = tareas.por_prioridad.reduce(
    (alto, prioridad) => Math.max(alto, prioridad.total),
    0
  )

  return tareas.por_prioridad.map((prioridad) => ({
    priority: prioridad.priority,
    etiqueta: prioridad.name,
    total: prioridad.total,
    fraccion: mayor === 0 ? 0 : prioridad.total / mayor
  }))
}

/** El resumen accesible del gráfico de prioridades: el mismo dato, en una frase. */
export function resumenDePrioridades (barras: BarraDePrioridad[]): string {
  const conFilas = barras.filter((barra) => barra.total > 0)

  if (conFilas.length === 0) return 'Sin tareas para repartir por prioridad.'

  const total = conFilas.reduce((suma, barra) => suma + barra.total, 0)

  return `${total} tareas: ` + conFilas.map((b) => `${b.total} en ${b.etiqueta}`).join(', ') + '.'
}

// =================================================================================================
// LA SERIE DE CIERRES
// =================================================================================================

/** Un punto de la serie de cierres, listo para dibujar. */
export interface PuntoDeCierres {
  /** `YYYY-MM-DD`, el lunes de la semana. */
  semana: string
  /** El día formateado, para el rótulo del eje. */
  etiqueta: string
  cerradas: number
  /** 0-1 sobre la mejor semana de la propia serie. */
  fraccion: number
  parcial: boolean
}

/** La serie completa, con la decisión de si vale dibujarla. */
export interface LecturaDeCierres {
  puntos: PuntoDeCierres[]
  /**
   * `false` cuando hay menos de {@link SEMANAS_CON_DATO_MINIMAS} semanas con algún cierre.
   *
   * Dos barras sueltas sobre doce semanas vacías no son una tendencia: son dos hechos, y el gráfico
   * los presentaría como una caída. En ese caso la pantalla escribe los números y no dibuja.
   */
  valeDibujarla: boolean
  /** Cuántas de las doce semanas tuvieron algún cierre. */
  semanasConDato: number
  total: number
}

/**
 * Lee la serie de cierres y decide si se puede dibujar.
 *
 * La escala es la mejor semana de la propia serie: lo que el cliente necesita saber es si el ritmo
 * sube o baja, no cuánto es «mucho» en abstracto. Una escala absoluta aplastaría todas las semanas
 * de un {espacio} tranquilo contra el piso.
 *
 * La semana parcial entra a la serie con su valor real y marcada: no se extrapola —sería inventar
 * trabajo que no ocurrió— y tampoco se esconde, porque es la semana que el cliente está viviendo.
 */
export function leerCierres (cierres: SemanaDeCierres[]): LecturaDeCierres {
  const mayor = cierres.reduce((alto, semana) => Math.max(alto, semana.cerradas), 0)
  const semanasConDato = cierres.filter((semana) => semana.cerradas > 0).length

  return {
    puntos: cierres.map((semana) => ({
      semana: semana.semana,
      etiqueta: formatearFecha(semana.semana),
      cerradas: semana.cerradas,
      fraccion: mayor === 0 ? 0 : semana.cerradas / mayor,
      parcial: semana.parcial
    })),
    valeDibujarla: semanasConDato >= SEMANAS_CON_DATO_MINIMAS,
    semanasConDato,
    total: cierres.reduce((suma, semana) => suma + semana.cerradas, 0)
  }
}

/** El resumen accesible de la serie: el mismo dato, en una frase. */
export function resumenDeCierres (lectura: LecturaDeCierres): string {
  if (lectura.total === 0) return 'Ninguna tarea cerrada en las últimas doce semanas.'

  const conDato = lectura.puntos.filter((punto) => punto.cerradas > 0)
  const mejor = conDato.reduce(
    (alto, punto) => (punto.cerradas > alto.cerradas ? punto : alto),
    conDato[0] as PuntoDeCierres
  )

  return `${lectura.total} tareas cerradas en doce semanas, repartidas en ${lectura.semanasConDato}`
    + ` de ellas. La mejor fue la del ${mejor.etiqueta}, con ${mejor.cerradas}.`
}

// =================================================================================================
// LOS HITOS
// =================================================================================================

/** Un hito en la línea de tiempo. */
export interface MarcaDeHito {
  id: number
  nombre: string
  /** La fecha tal como está guardada. `null` si el hito no tiene. */
  fecha: string | null
  /** El día formateado. Cadena vacía si no hay fecha. */
  etiqueta: string
  /** 0-1 sobre la ventana de la línea. `null` cuando el hito no tiene fecha y no va al eje. */
  posicion: number | null
  tareas: number
  cerradas: number
  /** `null` cuando el hito no tiene ni una {proceso} visible. */
  porcentaje: number | null
  /** `true` cuando quedan {procesos} abiertas y la fecha ya pasó. */
  atrasado: boolean
  /** `true` cuando todas sus {procesos} están cerradas. Con 0 {procesos} es `false`. */
  cumplido: boolean
}

/** La línea de tiempo de hitos, con su ventana y su salvedad. */
export interface LineaDeHitos {
  marcas: MarcaDeHito[]
  /** Días de hoy al extremo izquierdo de la ventana. Negativo cuando hay hitos vencidos. */
  desde: number
  /** Días de hoy al extremo derecho. */
  hasta: number
  /** 0-1: dónde cae HOY en la ventana. */
  hoy: number
  /** Cuántos hitos quedaron fuera del eje por no tener fecha. */
  sinFecha: number
  /**
   * La salvedad de las fechas, cuando `fechas_confiables` llegó en `false`.
   *
   * Cadena vacía cuando las fechas aguantan el eje. No esconde el gráfico: el usuario decidió el
   * 22/09 dibujarlo igual, y esto es lo que evita que el cliente lea una promesa donde hay un
   * placeholder.
   */
  salvedad: string
}

/** La salvedad que se escribe cuando las fechas de hito son de relleno. */
export const SALVEDAD_DE_FECHAS =
  'Varios hitos están fechados al último día del mes, así que esas fechas son de referencia y no '
  + 'una entrega comprometida.'

/**
 * Arma la línea de tiempo de hitos.
 *
 * La ventana se calcula sobre los datos y SIEMPRE incluye HOY, que es la marca contra la que se lee
 * todo lo demás. Es la misma decisión que `lineaDeEntregas()` en `tablero.ts`, y por el mismo
 * motivo: una lista de fechas obliga a restar de cabeza para saber qué está cerca.
 *
 * Los hitos sin fecha no se descartan: no van al eje —no tienen dónde ir— pero se cuentan en
 * `sinFecha` para que la pantalla los pueda nombrar. Esconderlos le restaría hitos al cliente.
 *
 * @param hitos el bloque tal como llegó de la API
 * @param hoyISO `YYYY-MM-DD`. Se pasa en vez de leerse del reloj para que la prueba sea determinista.
 */
export function lineaDeHitos (hitos: HitosDelTablero, hoyISO: string): LineaDeHitos {
  const vacia: LineaDeHitos = {
    marcas: [],
    desde: 0,
    hasta: 0,
    hoy: 0,
    sinFecha: 0,
    salvedad: hitos.fechas_confiables ? '' : SALVEDAD_DE_FECHAS
  }

  if (hitos.lista.length === 0) return vacia

  const hoy = Date.parse(`${hoyISO}T00:00:00Z`)
  const dias = (fecha: string): number =>
    Math.round((Date.parse(`${fecha}T00:00:00Z`) - hoy) / 86400000)

  const conFecha = hitos.lista.filter((hito) => hito.due_date !== null)
  const sinFecha = hitos.lista.length - conFecha.length

  // La ventana incluye hoy (el 0) y los extremos de los datos. El `+ 1` del tope evita que un hito
  // que cae exactamente en el extremo quede pegado al borde, donde su punto se recorta a la mitad.
  const distancias = conFecha.map((hito) => dias(hito.due_date as string))
  const desde = Math.min(0, ...distancias)
  const hasta = Math.max(1, ...distancias)
  const ancho = hasta - desde

  return {
    marcas: hitos.lista.map((hito) => marcaDeHito(hito, hito.due_date === null ? null : dias(hito.due_date), desde, ancho)),
    desde,
    hasta,
    hoy: (0 - desde) / ancho,
    sinFecha,
    salvedad: hitos.fechas_confiables ? '' : SALVEDAD_DE_FECHAS
  }
}

/** Una marca de la línea, con su estado ya decidido. */
function marcaDeHito (
  hito: HitoDelTablero,
  distancia: number | null,
  desde: number,
  ancho: number
): MarcaDeHito {
  const abiertas = hito.tareas - hito.cerradas

  return {
    id: hito.id,
    nombre: hito.name,
    fecha: hito.due_date,
    etiqueta: hito.due_date === null ? '' : formatearFecha(hito.due_date),
    posicion: distancia === null ? null : (distancia - desde) / ancho,
    tareas: hito.tareas,
    cerradas: hito.cerradas,
    porcentaje: hito.porcentaje,
    // Atrasado exige las DOS cosas: que la fecha haya pasado y que quede trabajo. Un hito con
    // fecha vieja y todo cerrado se entregó, no se atrasó. Es la misma regla que `hitoVencido()`
    // en el panel.
    atrasado: distancia !== null && distancia < 0 && abiertas > 0,
    // Con 0 {procesos} visibles no se puede afirmar que esté cumplido: no hay nada que lo respalde.
    cumplido: hito.tareas > 0 && abiertas === 0
  }
}

/** El resumen accesible de la línea de hitos. */
export function resumenDeHitos (linea: LineaDeHitos): string {
  if (linea.marcas.length === 0) return 'Este proyecto todavía no tiene hitos.'

  const cumplidos = linea.marcas.filter((marca) => marca.cumplido).length
  const atrasados = linea.marcas.filter((marca) => marca.atrasado).length

  const partes = [`${linea.marcas.length} hitos`, `${cumplidos} cumplidos`]

  if (atrasados > 0) partes.push(`${atrasados} atrasados`)
  if (linea.sinFecha > 0) partes.push(`${linea.sinFecha} sin fecha`)

  return partes.join(', ') + '.'
}

// =================================================================================================
// EL EQUIPO
// =================================================================================================

/** Una fila del gráfico de carga del equipo. */
export interface FilaDePersona {
  id: number
  nombre: string
  abiertas: number
  cerradas: number
  /** 0-1 sobre la persona con más {procesos} abiertas. */
  fraccion: number
}

/**
 * El equipo ordenado por trabajo pendiente, y recortado.
 *
 * Ordena por {procesos} ABIERTAS y no por total: la pregunta del cliente es quién tiene trabajo
 * ahora, no quién acumuló más en la historia del {espacio}. Quien no tiene nada abierto va al final
 * pero va: sacarlo dibujaría un equipo más chico que el real.
 *
 * La escala es la persona más cargada de la propia lista, por lo mismo que en el resto del archivo.
 */
export function filasDePersonas (equipo: Array<{ id: number, full_name: string, abiertas: number, cerradas: number }>): FilaDePersona[] {
  const mayor = equipo.reduce((alto, persona) => Math.max(alto, persona.abiertas), 0)

  return [...equipo]
    .sort((a, b) => b.abiertas - a.abiertas || b.cerradas - a.cerradas || a.full_name.localeCompare(b.full_name, 'es'))
    .slice(0, TOPE_DE_PERSONAS)
    .map((persona) => ({
      id: persona.id,
      nombre: persona.full_name,
      abiertas: persona.abiertas,
      cerradas: persona.cerradas,
      fraccion: mayor === 0 ? 0 : persona.abiertas / mayor
    }))
}

// =================================================================================================
// LA ACTIVIDAD
// =================================================================================================

/**
 * Qué dice cada clave del feed, en las palabras del cliente.
 *
 * La API manda la `description_key` de Perfex y no la frase, para no mantener dos traducciones de la
 * misma línea. Acá se traduce SOLO lo que sobrevive al filtro del servidor: las claves internas
 * —asignación de {procesos}, borrados, reaperturas— nunca llegan, y por eso no están en este mapa.
 *
 * Una clave que no esté acá NO se dibuja. Es deliberado: antes que mostrarle al cliente un
 * `not_project_activity_task_status_changed` crudo, o adivinar qué significa una clave nueva de una
 * actualización de Perfex, la línea se omite. El feed completo está en su propia pestaña.
 */
const TEXTO_DE_ACTIVIDAD: Record<string, string> = {
  project_activity_task_marked_complete: 'Se completó una tarea',
  not_project_activity_task_status_changed: 'Cambió el estado de una tarea',
  project_activity_new_task_comment: 'Hay un comentario nuevo en una tarea',
  project_activity_created_milestone: 'Se creó un hito',
  project_activity_added_team_member: 'Se sumó alguien al equipo',
  project_activity_updated: 'Se actualizó el proyecto',
  project_activity_created: 'Se creó el proyecto'
}

/** Una novedad del feed, lista para pintar. */
export interface Novedad {
  /** La fecha cruda, que sirve de clave de React: dos novedades del mismo segundo no existen. */
  fecha: string
  etiqueta: string
  texto: string
}

/**
 * Traduce el feed y descarta lo que no se sabe decir.
 *
 * @param actividad el feed tal como llegó
 * @param tope cuántas novedades dibujar
 */
export function novedades (
  actividad: Array<{ fecha: string, clave: string }>,
  tope: number
): Novedad[] {
  return actividad
    .filter((linea) => TEXTO_DE_ACTIVIDAD[linea.clave] !== undefined)
    .slice(0, tope)
    .map((linea) => ({
      fecha: linea.fecha,
      etiqueta: formatearFecha(linea.fecha),
      texto: TEXTO_DE_ACTIVIDAD[linea.clave] as string
    }))
}

// =================================================================================================
// LOS TICKETS
// =================================================================================================

/**
 * El estado «Closed» del catálogo de tickets de Perfex (`tbltickets_status`).
 *
 * Es un número y no un nombre porque la lista de tickets del portal publica `status` como entero
 * desnudo, sin rótulo ni color. El catálogo completo es 1 Open, 2 In progress, 3 Answered,
 * 4 On Hold, 5 Closed, y de los cinco éste es el único del que depende una cuenta.
 */
export const TICKET_CERRADO = 5

/** Cuántos tickets del {espacio} están abiertos y cuántos se cerraron. */
export interface ConteoDeTickets {
  abiertos: number
  cerrados: number
  total: number
}

/**
 * Cuenta los tickets del {espacio}, partidos en abiertos y cerrados.
 *
 * Solo dos números, y no un tiempo de respuesta: el promedio de respuesta del equipo está excluido
 * a propósito del contrato del portal —hay una prueba de paridad del lado de la API que falla si
 * alguien lo agrega—, y derivarlo acá de `date` y `last_reply` sería reponer por la ventana lo que
 * se decidió no publicar. Además `last_reply` es la ÚLTIMA respuesta de cualquiera de los dos lados,
 * así que ni siquiera serviría para medir la primera respuesta del equipo.
 *
 * @param tickets la lista tal como la sirve `GET /portal/projects/{id}/tickets`
 */
export function contarTickets (tickets: Array<{ status: number }>): ConteoDeTickets {
  const cerrados = tickets.filter((ticket) => ticket.status === TICKET_CERRADO).length

  return { abiertos: tickets.length - cerrados, cerrados, total: tickets.length }
}

// =================================================================================================
// LAS CIFRAS
// =================================================================================================

/** Una cifra de la fila de contexto, con lo que significa. */
export interface Cifra {
  clave: string
  etiqueta: string
  valor: number
  /** `true` cuando el número es una mala noticia y hay que poder verlo sin leer el rótulo. */
  alarma: boolean
}

/**
 * Las cifras de contexto del tablero.
 *
 * Son cuatro números, y el pedido fue explícitamente «más que 3 números piñuflas». No se contradice:
 * la diferencia es que estos cuatro se pueden ACCIONAR —hay 16 vencidas, cerramos 3 esta semana— y
 * no son el tablero entero, son el pie de los gráficos. Un número sin forma alrededor es lo que se
 * rechazó; un número al lado de la forma que lo explica es otra cosa.
 *
 * `vencidas` es la única que puede llevar alarma. Las otras tres son hechos: «cerradas esta semana»
 * en 0 no es malo en sí —un {espacio} puede estar entre entregas— y pintarlo de rojo mentiría.
 */
export function cifrasDelTablero (tareas: TareasDelTablero): Cifra[] {
  return [
    { clave: 'vencidas', etiqueta: 'Vencidas', valor: tareas.vencidas, alarma: tareas.vencidas > 0 },
    { clave: 'cerradas_7', etiqueta: 'Cerradas esta semana', valor: tareas.cerradas_7, alarma: false },
    { clave: 'cerradas_30', etiqueta: 'Cerradas en 30 días', valor: tareas.cerradas_30, alarma: false },
    { clave: 'sin_fecha', etiqueta: 'Abiertas sin fecha', valor: tareas.sin_fecha, alarma: false }
  ]
}
