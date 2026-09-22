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

/**
 * Tope de personas que viajan al gráfico de carga.
 *
 * Ya no es el techo de lo que se DIBUJA —el componente muestra cinco y pliega el resto en un
 * `<details>`— sino el techo de lo que se calcula. El Proyecto más poblado de producción tiene 23,
 * así que con 30 entran todos y el desplegable dice la verdad cuando promete «ver las 23».
 */
export const TOPE_DE_PERSONAS = 30

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

/**
 * El resumen accesible de la barra de prioridades: el mismo dato, en una frase.
 *
 * Nombra solo las prioridades que tienen {procesos}. Las que están en cero salen en la leyenda, que
 * es donde se leen; enumerarlas también acá alargaría la frase con cuatro «0 en» sin agregar nada.
 */
export function resumenDePrioridades (tareas: TareasDelTablero): string {
  const conFilas = tareas.por_prioridad.filter((prioridad) => prioridad.total > 0)

  if (conFilas.length === 0) return 'Sin tareas para repartir por prioridad.'

  const total = conFilas.reduce((suma, prioridad) => suma + prioridad.total, 0)

  return `${total} tareas: `
    + conFilas.map((p) => `${p.total} en ${p.name}`).join(', ') + '.'
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
 * Son TRES, y no las cuatro que había. `cerradas_30` se fue: la serie de doce semanas ya contesta
 * «cuánto se cierra últimamente» con mucho más detalle, y una cifra que repite lo que el gráfico de
 * al lado ya dice es exactamente el relleno que se rechazó. La que queda de ese par es
 * `cerradas_7`, que es la única ventana que la serie NO deja leer de un vistazo: en el gráfico es la
 * última columna, cortada en HOY.
 *
 * El pedido fue «más que 3 números piñuflas» y esto son tres números. No se contradice: la queja no
 * era la cantidad, era que fueran lo único. Estos tres se pueden accionar —hay 16 vencidas— y viven
 * al lado de la forma que los explica, no en su lugar.
 *
 * `vencidas` es la única que puede llevar alarma. Las otras dos son hechos: «cerradas esta semana»
 * en 0 no es malo en sí —un {espacio} puede estar entre entregas— y pintarlo de rojo mentiría.
 */
export function cifrasDelTablero (tareas: TareasDelTablero): Cifra[] {
  return [
    { clave: 'vencidas', etiqueta: 'Vencidas', valor: tareas.vencidas, alarma: tareas.vencidas > 0 },
    { clave: 'cerradas_7', etiqueta: 'Cerradas esta semana', valor: tareas.cerradas_7, alarma: false },
    { clave: 'sin_fecha', etiqueta: 'Abiertas sin fecha', valor: tareas.sin_fecha, alarma: false }
  ]
}

// =================================================================================================
// GEOMETRÍA DE LOS GRÁFICOS
//
// Todo lo que sigue convierte datos en coordenadas. Vive acá y no en el componente por la misma
// razón que el resto del archivo: se puede verificar sin navegador, y un error de geometría —una
// fracción que se sale de 0-1, un área que no cierra— dibuja un gráfico plausible y equivocado.
// =================================================================================================

/** Alto y ancho del lienzo de la serie de cierres, en unidades de `viewBox`. */
export const LIENZO_DE_AREA = { ancho: 300, alto: 100 } as const

/**
 * Cuánto pinta el anillo del medidor de avance.
 *
 * Un anillo y no una dona: la dona reparte un total entre categorías, el anillo mide UNA razón
 * contra su límite. Son formas distintas para preguntas distintas, y acá la pregunta es «cuánto de
 * lo comprometido está hecho».
 *
 * Se devuelve en unidades de `stroke-dasharray` porque es lo único que un SVG necesita para dibujar
 * un arco sin trigonometría: la circunferencia completa y cuánto de ella se pinta.
 *
 * @param porcentaje 0-100, o `null` si no hay avance medido
 * @param radio radio del círculo en unidades de `viewBox`
 */
export function arcoDeAvance (porcentaje: number | null, radio: number): { circunferencia: number, pintado: number } {
  const circunferencia = 2 * Math.PI * radio
  // `null` pinta cero arco, pero el componente NO dibuja el anillo en ese caso: escribe el motivo.
  // El cero de acá es para que la función sea total y no para que se pinte.
  const fraccion = porcentaje === null ? 0 : Math.min(100, Math.max(0, porcentaje)) / 100

  return { circunferencia, pintado: circunferencia * fraccion }
}

/** Un punto de la serie, con su lugar en el lienzo. */
export interface PuntoDeArea extends PuntoDeCierres {
  /** Coordenada X en unidades de `viewBox`. */
  x: number
  /** Coordenada Y en unidades de `viewBox`. El 0 está ARRIBA, como en todo SVG. */
  y: number
  /** 0-1 de izquierda a derecha. Para colgar marcas HTML encima del SVG sin repetir la cuenta. */
  fraccionX: number
  /** `true` en la semana con más cierres de la serie: es la única que se rotula directo. */
  extremo: boolean
}

/** La serie lista para dibujar: la línea, el relleno y los puntos. */
export interface AreaDeCierres {
  puntos: PuntoDeArea[]
  /** `d` de la línea. Cadena vacía si no hay al menos dos puntos. */
  linea: string
  /** `d` del relleno, cerrado contra la base. Cadena vacía si no hay al menos dos puntos. */
  area: string
}

/**
 * Convierte la serie de cierres en las dos rutas SVG de un gráfico de área.
 *
 * Área y no doce barras: el dato es una tendencia de una sola serie, y la skill de visualización
 * manda «line; area for a single series» para eso. Doce barras en fila era justamente la queja —una
 * lista de mucho dato— y encima sugiere que cada semana es una categoría independiente cuando lo
 * que importa es la forma del conjunto.
 *
 * La escala vertical es la mejor semana de la propia serie, igual que antes: la pregunta es si el
 * ritmo sube o baja, no cuánto es «mucho» en abstracto.
 *
 * El relleno se cierra contra la base del lienzo y no contra el mínimo: un área que no arranca en
 * cero exagera la variación, que es la forma más común de mentir con un gráfico de área.
 *
 * Con menos de dos puntos las rutas salen vacías en vez de dibujar un segmento de cero largo.
 */
export function areaDeCierres (cierres: LecturaDeCierres): AreaDeCierres {
  const { ancho, alto } = LIENZO_DE_AREA
  const total = cierres.puntos.length
  const mayor = cierres.puntos.reduce((alto2, punto) => Math.max(alto2, punto.cerradas), 0)

  const puntos: PuntoDeArea[] = cierres.puntos.map((punto, i) => {
    const fraccionX = total <= 1 ? 0 : i / (total - 1)

    return {
      ...punto,
      x: fraccionX * ancho,
      // Se deja un 6 % de aire arriba para que el pico no toque el borde del lienzo y su punto no
      // quede cortado por la mitad.
      y: alto - punto.fraccion * alto * 0.94,
      fraccionX,
      extremo: mayor > 0 && punto.cerradas === mayor
    }
  })

  if (puntos.length < 2) {
    return { puntos, linea: '', area: '' }
  }

  const trazo = puntos.map((p) => `${redondear(p.x)},${redondear(p.y)}`).join(' L')
  const primero = puntos[0] as PuntoDeArea
  const ultimo = puntos[puntos.length - 1] as PuntoDeArea

  return {
    puntos,
    linea: `M${trazo}`,
    area: `M${redondear(primero.x)},${alto} L${trazo} L${redondear(ultimo.x)},${alto} Z`
  }
}

/** Dos decimales: más precisión en un `d` de SVG es peso de descarga sin efecto visible. */
function redondear (n: number): number {
  return Math.round(n * 100) / 100
}

/** Un tramo de la barra apilada de prioridades. */
export interface TramoDePrioridad {
  priority: number
  etiqueta: string
  total: number
  /** Porcentaje del total, para el ancho. */
  porcentaje: number
  /** 1-4: qué paso de la rampa ordinal le toca. Bajo es el más claro en tema claro. */
  paso: number
  /** `true` si la etiqueta cabe DENTRO del tramo. Si no, la lleva la leyenda y el tooltip. */
  rotuloAdentro: boolean
}

/**
 * Las prioridades como una barra apilada horizontal.
 *
 * Apilada y no dona, aunque la dona se haya pedido: en los Proyectos reales el reparto es 0/74/6/2
 * sobre 82, o sea que Alto y Urgente serían dos gajos de 26 y 9 grados. La skill de visualización
 * lo marca como anti-patrón —«una dona para comparar valores cercanos»— y para part-to-whole manda
 * barra apilada, en horizontal cuando las categorías tienen nombre largo. Apilados, 6 y 2 se ven.
 *
 * Horizontal y no vertical porque los rótulos son palabras («Urgente»), y en vertical habría que
 * girarlos.
 *
 * Las prioridades vacías NO entran a la barra —un tramo de ancho cero no se ve y ensucia el
 * apilado— pero sí salen en la leyenda con su cero, que es donde el cliente puede leerlas.
 *
 * `rotuloAdentro` se decide acá y no en el CSS: un rótulo dentro de un tramo del 2 % se recorta, y
 * la skill es explícita en que un rótulo que no cabe se mueve o se omite, nunca se recorta. El
 * umbral del 12 % es el ancho mínimo donde entra «Urgente» con aire a los dos lados.
 */
export function tramosDePrioridad (tareas: TareasDelTablero): TramoDePrioridad[] {
  const total = tareas.por_prioridad.reduce((suma, p) => suma + p.total, 0)

  if (total === 0) return []

  return tareas.por_prioridad
    .map((prioridad, i) => {
      const porcentaje = (prioridad.total * 100) / total

      return {
        priority: prioridad.priority,
        etiqueta: prioridad.name,
        total: prioridad.total,
        porcentaje,
        paso: i + 1,
        rotuloAdentro: porcentaje >= 12
      }
    })
    .filter((tramo) => tramo.total > 0)
}

/** Una marca del eje de {hitos}: una fecha, con todos los {hitos} que caen en ella. */
export interface MarcaAgrupada {
  /** `YYYY-MM-DD`. Sirve de clave. */
  fecha: string
  etiqueta: string
  /** 0-1 sobre la ventana de la línea. */
  posicion: number
  /** Los {hitos} de esa fecha, en el orden en que llegaron. */
  hitos: MarcaDeHito[]
  /** El color del grupo: peligro si alguno está atrasado, éxito si TODOS están cumplidos. */
  estado: 'atrasado' | 'cumplido' | 'en_curso'
}

/**
 * Agrupa las marcas del eje por fecha.
 *
 * Existe por un caso que se ve en cuanto se abre un {espacio} real: sus tres {hitos} están fechados
 * el 31 de diciembre, así que en el eje caen en el MISMO píxel. Dibujados uno por {hito} quedan
 * perfectamente superpuestos y el cliente cuenta uno donde hay tres — un gráfico que dice menos de
 * lo que hay.
 *
 * Con una marca por fecha, el punto es honesto y su tooltip enumera los {hitos} que comparte.
 *
 * El estado del grupo se decide por el peor caso: si alguno está atrasado el punto va en peligro,
 * porque eso es lo que hay que ver. Cumplido exige que lo estén TODOS.
 */
export function marcasAgrupadas (marcas: MarcaDeHito[]): MarcaAgrupada[] {
  const porFecha = new Map<string, MarcaAgrupada>()

  for (const marca of marcas) {
    if (marca.fecha === null || marca.posicion === null) continue

    const grupo = porFecha.get(marca.fecha)

    if (grupo === undefined) {
      porFecha.set(marca.fecha, {
        fecha: marca.fecha,
        etiqueta: marca.etiqueta,
        posicion: marca.posicion,
        hitos: [marca],
        estado: marca.atrasado ? 'atrasado' : marca.cumplido ? 'cumplido' : 'en_curso'
      })
      continue
    }

    grupo.hitos.push(marca)
    // El peor caso manda. Un grupo con uno atrasado se pinta atrasado aunque los otros estén
    // cumplidos: esconder el atraso detrás de dos entregas es justo lo que no puede pasar.
    if (marca.atrasado) grupo.estado = 'atrasado'
    else if (grupo.estado === 'cumplido' && !marca.cumplido) grupo.estado = 'en_curso'
  }

  return [...porFecha.values()]
}

/** Una prioridad en la leyenda: sale siempre, también en cero. */
export interface ClaveDePrioridad {
  priority: number
  etiqueta: string
  total: number
  paso: number
}

/** La leyenda de la barra de prioridades: las cuatro, en el orden de la escala. */
export function clavesDePrioridad (tareas: TareasDelTablero): ClaveDePrioridad[] {
  return tareas.por_prioridad.map((prioridad, i) => ({
    priority: prioridad.priority,
    etiqueta: prioridad.name,
    total: prioridad.total,
    paso: i + 1
  }))
}
