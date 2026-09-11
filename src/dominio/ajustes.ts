import { AJUSTE_AVISOS_LICITACION, GRUPO_AVISOS_LICITACION } from './alertas-licitacion.ts'
import { GLOSARIO, nombrar } from './glosario.ts'
import type { AjusteEditable, Ajustes, Lookups } from '../datos/recursos.ts'

/**
 * Reglas de los ajustes de la instalacion (`GET|PATCH /settings`), sin nada de React ni de Next.
 *
 * Dos cosas viven aca. La primera es la lectura del error del `PATCH`: el mensaje que devuelve la
 * API es uno solo para el cuerpo entero («Hay ajustes que no se pueden escribir»), asi que sin el
 * `details` traducido quien administra no sabe cual de las claves fue.
 *
 * La segunda es el catalogo legible: la API contesta con las claves tecnicas de `tbloptions`
 * (`tasks_kanban_limit`, `ia_dias_reconstruccion`) y con dominios que a veces son ids de `/lookups`.
 * Traducir eso es responsabilidad de la interfaz, no del backend — la misma clave la consumen el
 * panel viejo y esta pantalla—, y vive aparte del formulario para que Node lo pueda ejecutar tal
 * cual en `pruebas/ajustes.test.js`.
 */

/** Los dos motivos que devuelve `Escritura\Ajuste::escribir()` en el `details` del 422. */
const MOTIVO_DE_RECHAZO: Record<string, string> = {
  no_editable: 'la API no acepta escribir esta opción',
  invalid: 'el valor no pasó la validación del backend'
}

/**
 * Traduce el `details` del 422 a lineas legibles.
 *
 * Un motivo o una clave que no esten en los mapas se muestran crudos: inventar un texto para algo
 * que no se conoce esconde justamente el caso que hay que investigar.
 *
 * @param detalles el `details` del 422, `{ clave: ['no_editable' | 'invalid'] }`
 * @param etiquetas nombre legible de cada clave; la API contesta con el nombre tecnico
 * @returns una linea por clave rechazada, en el orden en que vinieron
 */
export function detallesDeAjustesLegibles (
  detalles: Record<string, string[]>,
  etiquetas: Record<string, string>
): string[] {
  return Object.entries(detalles).map(([clave, motivos]) => {
    const razones = motivos.map((motivo) => MOTIVO_DE_RECHAZO[motivo] ?? motivo).join(', ')

    return `${etiquetas[clave] ?? clave}: ${razones}`
  })
}

/**
 * Nombre y ayuda de cada grupo de `GET /settings`.
 *
 * Los grupos los decide el backend (`Escritura\Ajuste::EDITABLES`, campo `grupo`) y viajan en cada
 * opcion. Aca solo se les pone nombre en castellano y un orden de lectura: primero lo que toca el
 * trabajo diario, despues lo que toca la instalacion entera.
 *
 * Un grupo que la API agregue y que no este aca igual se dibuja: `grupoDeAjustes()` cae al nombre
 * tecnico. Esconderlo seria peor — una opcion nueva quedaria invisible sin que nadie se entere.
 */
export const GRUPOS_DE_AJUSTES: Record<string, { titulo: string, ayuda: string }> = {
  procesos: {
    titulo: `${nombrar('proceso', 2)}`,
    ayuda: `Con que valores nace una ${nombrar('proceso').toLowerCase()} y cuanto se ve del tablero.`
  },
  cronometro: {
    titulo: 'Cronómetro',
    ayuda: 'Como se comportan los temporizadores y como se redondea el tiempo registrado.'
  },
  listados: {
    titulo: 'Listados y búsqueda',
    ayuda: 'Tamaño de las tablas, del buscador y qué rol recibe quien entra nuevo al equipo.'
  },
  ia: {
    titulo: 'Inteligencia artificial',
    ayuda: 'El interruptor de toda la capa de IA y los dos límites que la gobiernan.'
  },
  acceso: {
    titulo: 'Acceso',
    ayuda: 'Quién puede entrar a Ops y con qué cuenta.'
  },
  correo: {
    titulo: 'Correo',
    ayuda: 'Los motores de correo y su modo de operación.'
  },
  // No es un grupo de `GET /settings`: es el titulo de la caja que dibuja el interruptor de avisos
  // de Licitaciones dentro de la pestaña «Avisos por correo». `FormularioDeAjustes` usa el grupo
  // solo para el encabezado; las claves que pinta se le pasan por separado.
  [GRUPO_AVISOS_LICITACION]: {
    titulo: `Avisos de ${GLOSARIO.licitacion.plural}`,
    ayuda: `Si el aviso de plazo de una ${GLOSARIO.licitacion.singular.toLowerCase()} —su vencimiento o una ${GLOSARIO.hito.singular}— además sale por correo. La banda de la pantalla se muestra igual: esto gobierna solo lo que sale de Ops.`
  }
}

/**
 * Nombre y ayuda de cada opcion editable.
 *
 * La API contesta con la clave tecnica de `tbloptions` (`tasks_kanban_limit`), que no es un texto que
 * alguien pueda leer para decidir. Este mapa es la unica traduccion; una clave ausente se muestra
 * cruda, que es lo que hace visible una opcion nueva del backend en vez de esconderla.
 */
export const ETIQUETAS_DE_AJUSTES: Record<string, { etiqueta: string, ayuda?: string }> = {
  // --- procesos ---
  default_task_priority: {
    etiqueta: 'Prioridad por defecto',
    ayuda: `La que trae una ${nombrar('proceso').toLowerCase()} nueva cuando nadie elige otra.`
  },
  default_task_status: {
    etiqueta: 'Estado por defecto',
    ayuda: '«auto» deja que el board elija según quién crea y a quién se asigna.'
  },
  new_task_auto_assign_current_member: {
    etiqueta: 'Asignar a quien la crea',
    ayuda: `Quien crea la ${nombrar('proceso').toLowerCase()} queda como responsable.`
  },
  new_task_auto_follower_current_member: {
    etiqueta: 'Sumar como seguidor a quien la crea',
    ayuda: 'Recibe los avisos aunque no sea el responsable.'
  },
  task_biillable_checked_on_creation: {
    etiqueta: 'Marcar facturable al crear',
    ayuda: 'La casilla de facturable viene marcada de entrada.'
  },
  show_all_tasks_for_project_member: {
    etiqueta: `Ver todas las ${nombrar('proceso', 2).toLowerCase()} del ${nombrar('espacio').toLowerCase()}`,
    ayuda: `Quien es miembro del ${nombrar('espacio').toLowerCase()} las ve todas, no solo las suyas.`
  },
  tasks_kanban_limit: {
    etiqueta: 'Tarjetas por columna en el tablero',
    ayuda: 'Cuántas se cargan de entrada en cada columna antes de pedir más.'
  },

  // --- cronometro ---
  auto_stop_tasks_timers_on_new_timer: {
    etiqueta: 'Detener el cronómetro anterior al empezar otro',
    ayuda: 'Impide que una persona quede con dos relojes corriendo a la vez.'
  },
  timer_started_change_status_in_progress: {
    etiqueta: 'Pasar a «en progreso» al iniciar el cronómetro'
  },
  automatically_stop_task_timer_after_hours: {
    etiqueta: 'Detener solo el cronómetro después de (horas)',
    ayuda: 'Cero lo deja corriendo indefinidamente, incluso toda la noche.'
  },
  round_off_task_timer_option: {
    etiqueta: 'Redondeo del tiempo registrado'
  },
  round_off_task_timer_time: {
    etiqueta: 'Redondear a bloques de (minutos)',
    ayuda: 'Solo tiene efecto si el redondeo de arriba no está en «no redondear».'
  },

  // --- listados ---
  tables_pagination_limit: {
    etiqueta: 'Filas por página en las tablas'
  },
  limit_top_search_bar_results_to: {
    etiqueta: 'Resultados del buscador de arriba'
  },
  save_last_order_for_tables: {
    etiqueta: 'Recordar el orden de cada tabla',
    ayuda: 'Cada persona vuelve a encontrar la tabla como la dejó.'
  },
  staff_access_only_assigned_departments: {
    etiqueta: 'Limitar los tickets al departamento asignado'
  },
  default_staff_role: {
    etiqueta: 'Rol por defecto de quien entra nuevo',
    ayuda: 'El que recibe una cuenta recién creada mientras nadie le asigne otro.'
  },

  // --- ia ---
  ia_habilitada: {
    etiqueta: 'Funciones con IA',
    ayuda: 'Interruptor de toda la capa. Apagado, la API responde 404 a cada función de IA y Ops deja de ofrecerlas.'
  },
  ia_escritura_habilitada: {
    etiqueta: 'Dejar que WiBot proponga cambios',
    ayuda: 'Interruptor aparte del de arriba. Apagado, WiBot solo lee. Encendido, puede dejar propuestas —crear o editar una tarea, comentar, cambiar el equipo, mandar algo a la papelera— que no se ejecutan hasta que alguien las confirma en el chat. Ningún borrado es definitivo: todo va a la papelera y se restaura durante 30 días.'
  },
  ia_tope_tokens: {
    etiqueta: 'Largo máximo de la respuesta (tokens)',
    ayuda: 'Cuánto texto se le pide al modelo. No es el presupuesto que viaja al proveedor: a los modelos que razonan se les suman 1024 tokens por encima de este número.'
  },
  ia_dias_reconstruccion: {
    etiqueta: `Rehacer el análisis del ${nombrar('espacio').toLowerCase()} cada (días)`,
    ayuda: 'Techo contra la deriva: pasados estos días el análisis se arma de cero en vez de actualizarse por incrementos.'
  },

  // --- correo ---
  wiwo_resumen_equipo_envio: {
    etiqueta: 'Enviar el resumen del equipo a las jefaturas',
    ayuda: 'A las 20:00 se arma igual y queda en la pantalla; esto decide si además sale por correo. Apagado de fábrica: es el interruptor de la parte que sale de Ops.'
  },
  wiwo_recordatorio_jornada_envio: {
    etiqueta: 'Recordar a las 10:00 a quien no abrió su jornada',
    ayuda: 'Un correo y un aviso en la campana, de lunes a viernes, a quien todavía no marcó el inicio de su jornada. Apagado de fábrica.'
  },
  wiwo_recordatorio_tareas_envio: {
    etiqueta: 'Recordar a las 15:00 a quien no registró tareas',
    ayuda: 'Un correo y un aviso en la campana, de lunes a viernes, a quien tiene la jornada abierta y todavía no registró tiempo en ninguna tarea. Apagado de fábrica.'
  },
  [AJUSTE_AVISOS_LICITACION]: {
    etiqueta: `Avisar por correo los plazos de ${GLOSARIO.licitacion.plural.toLowerCase()}`,
    ayuda: `El aviso se escribe igual en la campana y la banda de la pantalla se muestra igual; esto decide si además sale por correo a quien sigue la ${GLOSARIO.licitacion.singular.toLowerCase()}. Apagado de fábrica, como todo efecto externo.`
  }
}

/**
 * Nombre legible de cada valor de un `enum` cuyo dominio no sale de `/lookups`.
 *
 * Los dos redondeos del cronometro viajan como `'0'`, `'1'`, `'2'`: numeros que no significan nada
 * fuera de `tasks_helper.php`. El resto de los `enum` —prioridad, estado, rol— si sale de `/lookups`
 * y se resuelve con `dominiosDeAjustes()`.
 *
 * Perfex tambien acepta `'3'` (redondear al mas cercano), pero la whitelist de la API no lo publica,
 * asi que ese valor no aparece: la pantalla dibuja lo que `options` trae y nada mas.
 */
const VALORES_CON_NOMBRE: Record<string, Record<string, string>> = {
  round_off_task_timer_option: {
    0: 'No redondear',
    1: 'Redondear hacia arriba',
    2: 'Redondear hacia abajo',
    3: 'Redondear al más cercano'
  },
  default_task_status: { auto: 'Automático' }
}

/** Titulo y ayuda de un grupo, o el nombre tecnico si el backend agrego uno que no esta mapeado. */
export function grupoDeAjustes (grupo: string): { titulo: string, ayuda: string } {
  return GRUPOS_DE_AJUSTES[grupo] ?? { titulo: grupo, ayuda: '' }
}

/** Nombre y ayuda de una opcion, o su clave tecnica si todavia no esta traducida. */
export function etiquetaDeAjuste (clave: string): { etiqueta: string, ayuda?: string } {
  return ETIQUETAS_DE_AJUSTES[clave] ?? { etiqueta: clave }
}

/**
 * Las claves editables de un grupo, en el orden en que las publica la API.
 *
 * `Object.entries` conserva el orden de insercion del JSON, que es el de `Ajuste::EDITABLES`: el
 * backend ya las agrupo pensando en como se leen, y reordenarlas aca seria una segunda opinion que
 * se desincroniza sola.
 *
 * @param ajustes el cuerpo de `GET /settings`
 * @param grupo el grupo a filtrar (`procesos`, `cronometro`, `listados`, `ia`, `acceso`, `correo`)
 * @returns las claves de ese grupo; vacio si la instalacion no publica ninguna
 */
export function clavesDelGrupo (ajustes: Ajustes, grupo: string): string[] {
  return Object.entries(ajustes.editable)
    .filter(([, opcion]) => opcion.group === grupo)
    .map(([clave]) => clave)
}

/**
 * Nombres legibles de las opciones de cada `enum` y de cada `rol`.
 *
 * Los dominios de `default_task_priority`, `default_task_status` y `default_staff_role` son ids de
 * `/lookups`: la API publica `["1","2","3"]` y sin esto el formulario mostraria numeros. Se arma en
 * el servidor y viaja como dato plano porque el formulario es un componente de cliente.
 *
 * Una opcion sin nombre en `/lookups` —una fila borrada que quedo referenciada— conserva su id en
 * vez de desaparecer: hay que poder ver que quedo apuntando a algo que ya no existe.
 *
 * @param lookups el cuerpo de `GET /lookups`
 * @returns `clave de ajuste -> valor -> nombre`, listo para pasarle al formulario
 */
export function dominiosDeAjustes (lookups: Lookups): Record<string, Record<string, string>> {
  const porId = (filas: Array<{ id: number, name: string }>): Record<string, string> =>
    Object.fromEntries(filas.map((fila) => [String(fila.id), fila.name]))

  return {
    ...VALORES_CON_NOMBRE,
    default_task_priority: porId(lookups.task_priorities),
    default_task_status: { ...VALORES_CON_NOMBRE.default_task_status, ...porId(lookups.task_statuses) },
    default_staff_role: porId(lookups.roles)
  }
}

/**
 * Por que la capa de IA esta o no disponible.
 *
 * Los tres motivos de "no" se arreglan en lugares distintos: `apagada` es un interruptor del panel,
 * `ausente` una instalacion a la que nunca se le escribio el ajuste, y `no_se_pudo_leer` la API que
 * no contesta. Colapsarlos en un booleano deja a quien mira una pantalla sin boton y sin forma de
 * saber a quien reclamarle.
 */
export type MotivoIa = 'encendida' | 'apagada' | 'ausente' | 'no_se_pudo_leer'

/**
 * El estado de la capa de IA tal como lo leyo el servidor, con su motivo.
 *
 * Vive aca y no en `datos/ajustes.ts` porque lo leen componentes de cliente, y ese archivo es
 * `server-only`: un `import type` se borra al compilar, pero deja puesta la trampa para el primer
 * `import` de valor que alguien agregue despues.
 */
export interface EstadoIa {
  activa: boolean
  motivo: MotivoIa
  /** El mensaje de la API cuando `motivo` es `no_se_pudo_leer`. Vacio en el resto de los casos. */
  detalle?: string
}

/**
 * Traduce el valor de `ia_habilitada` tal como viaja en `GET /settings` a su motivo.
 *
 * `GET /settings` presenta las opciones de tipo `bool` como booleano o como `null` —`null` es que la
 * opcion viaja sin fila detras en `tbloptions`—, y `undefined` es que no viaja en absoluto. Esos dos
 * ultimos casos no son "apagada": nadie la apago, nunca se guardo, y encenderla es escribir el
 * ajuste una vez en vez de buscar quien lo desactivo.
 *
 * @param valor lo que trae `editable.ia_habilitada?.value`
 * @returns el motivo; `no_se_pudo_leer` no sale de aca, lo pone quien atrapa el fallo de red
 */
export function motivoDeIa (valor: AjusteEditable['value'] | undefined): Exclude<MotivoIa, 'no_se_pudo_leer'> {
  if (valor === true) return 'encendida'
  if (valor === undefined || valor === null) return 'ausente'

  return 'apagada'
}
