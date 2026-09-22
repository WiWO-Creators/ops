/**
 * Recursos que ve el cliente en su portal.
 *
 * Viven aparte de `recursos.ts` a proposito: aunque una factura sea la misma fila de `tblinvoices`,
 * lo que el portal recibe NO es lo que recibe el panel. El portal nunca ve el `hash` publico del
 * documento, ni quien lo cargo, ni el agente de venta. Compartir el tipo invitaria a pintar en el
 * portal un campo que la API no manda, y a descubrirlo recien en pantalla.
 *
 * La excepcion son `Referencia` y `TipoTarea`, que se importan del panel: no son proyecciones
 * distintas del mismo dato sino la MISMA fila de catalogo. `Expuesto::solo()` deja pasar
 * `task_type` entero —esta declarado como valor suelto— y recorta `milestone` a exactamente
 * `{id, name}`, que es lo que ya es `Referencia`. Redeclararlas aca solo abriria la puerta a que
 * las dos copias se desincronicen, que es justamente como `milestone` y `task_type` terminaron
 * declarados como numeros mientras la API mandaba objetos.
 */

import type { Referencia, TipoTarea } from './recursos.ts'

export interface TicketPortal {
  id: number
  subject: string
  date: string | null
  last_reply: string | null
  status: number
  priority: number
  project_id: number | null
  /** `null` cuando el equipo todavia no engancho ninguna {proceso} al ticket. */
  task: TareaDeTicketPortal | null
}

/**
 * La {proceso} que atiende el ticket, en las dos formas que la API distingue.
 *
 * La forma corta —solo `progress`— es una tarea **interna**: el equipo la abrio para trabajar el
 * ticket pero no la compartio con el cliente, y lo unico que le corresponde ver es cuanto avanzo.
 * Llega sin nombre a proposito, asi que la pantalla tampoco puede inventarle uno: un titulo
 * fabricado seria filtrar el tablero interno con palabras nuestras.
 *
 * Se distinguen por la presencia de `id` (`'id' in tarea`) y no por una bandera aparte, porque asi
 * el tipo impide leer `name` donde la API no lo mando.
 */
export type TareaDeTicketPortal =
  | { progress: number }
  | { id: number, name: string, status: number, progress: number }

export interface TicketPortalDetalle extends TicketPortal {
  message: string
  replies: RespuestaTicketPortal[]
}

/**
 * Respuesta de un ticket.
 *
 * `from` viene ya resuelto por la API: el panel distingue autor de staff y de contacto mirando si la
 * columna `admin` esta vacia, y esa convencion no tiene por que cruzar la red.
 */
export interface RespuestaTicketPortal {
  id: number
  message: string
  date: string | null
  from: 'cliente' | 'equipo'
  name: string
}

/**
 * Proyecto tal como lo ve el cliente.
 *
 * Los campos opcionales lo son de verdad: la API **no los emite** cuando el proyecto no los
 * comparte, en vez de mandarlos en null. `undefined` significa "no corresponde mostrarlo", que es
 * distinto de "esta vacio".
 */
export interface EspacioPortal {
  id: number
  name: string
  description: string | null
  status: number
  start_date: string | null
  deadline: string | null
  date_finished: string | null
  progress: number
  counts: { tasks: number, tasks_open: number, milestones: number }
  /** Solo en el detalle: las pestañas que este contacto puede abrir en este proyecto. */
  tabs?: PestaniaPortal[]
  /**
   * Solo en el detalle: los flags de columna de Tarea que este proyecto tiene encendidos.
   *
   * Viaja al lado de `tabs` y por el mismo motivo: es lo que la pestaña de Tareas necesita saber
   * **antes** de pedir la primera tarea. Deducirlo de las filas se equivoca justo donde importa —con
   * el listado vacio no se puede distinguir "la columna esta apagada" de "esta encendida y nadie la
   * lleno"—, y la tabla saldria distinta segun los datos que tocaran caer en esa pagina.
   *
   * La API siempre lo manda, aunque sea `[]`, que es el estado de nacimiento de los 279 proyectos.
   * Opcional acá porque el mismo tipo describe el listado, donde no viaja.
   */
  campos_tareas?: string[]
  /** Solo con `view_finance_overview`. */
  project_cost?: number | null
  project_rate_per_hour?: number | null
  estimated_hours?: number | null
  /** Solo con `view_team_members`. */
  members?: Array<{ id: number, full_name: string, profile_image_url: string | null }>
}

/**
 * Claves de pestaña que la API puede devolver en `tabs`.
 *
 * Es el contrato de la API, no la lista de lo que el portal dibuja: `VisibilidadContacto::PESTANIAS`
 * sigue emitiendo `contracts`, `proposals`, `estimates` e `invoices`, y el portal las ignora a
 * proposito porque produccion no usa el modulo de ventas. Se declaran para que el tipo describa lo
 * que llega y no lo que nos gustaria que llegara.
 */
export type PestaniaPortal =
  | 'overview'
  | 'tasks'
  | 'timesheets'
  | 'milestones'
  | 'files'
  | 'discussions'
  | 'gantt'
  /** Calendario de entregas. Exige las mismas dos condiciones que `tasks`, pero se exige aparte. */
  | 'calendar'
  /** Meeting Paper. Su flag por proyecto (`wiwo_portal_actas`) nace apagado y se enciende a mano. */
  | 'actas'
  | 'activity'
  | 'tickets'
  | 'contracts'
  | 'proposals'
  | 'estimates'
  | 'invoices'

/**
 * Tarea de un proyecto, ya podada de todo lo interno.
 *
 * Sin `tags`: el portal no publica etiquetas. Son vocabulario interno de gestion y ninguna pantalla
 * del cliente las pinta; declararlas hacia que viajaran en el payload para nada.
 */
export interface TareaPortal {
  id: number
  /** Identificador visible del Proceso. Ver `Proceso.patente`. */
  patente: string | null
  name: string
  description: string | null
  status: number
  priority: number
  start_date: string | null
  due_date: string | null
  date_finished: string | null
  /**
   * Hito de la tarea, o `null` cuando no cuelga de ninguno.
   *
   * Es un OBJETO, no el id: `RecursoProcesos::presentarLote()` resuelve el nombre contra
   * `tblmilestones` y `FormasDelPortal::PROCESOS` lo recorta a `{id, name}`. Estuvo declarado como
   * `number` y por eso la columna Hito no se ofrecia al cliente.
   */
  milestone: Referencia | null
  milestone_order: number
  /**
   * Tipo de Proceso (`tbltask_types`), o `null` cuando la tarea no tiene tipo.
   *
   * Tambien es un OBJETO, y con sus dos colores: la forma del portal lo declara como valor suelto,
   * asi que pasa entero tal como lo arma el presentador del panel.
   */
  task_type: TipoTarea | null
  counts: Record<string, number>
  /**
   * Aprobacion del cliente, **podada**: sin quien la pidio ni el id del contacto que respondio.
   *
   * Opcional porque el guard de tabla del backend omite el bloque entero cuando `wiwo_core` no esta
   * instalado. El ETA, la desviacion y el estado de SLA **no viajan al portal**: miden al equipo
   * contra su propio compromiso interno y no son asunto del cliente.
   */
  approval?: AprobacionPortal
  /** Solo con `view_task_total_logged_time`. */
  total_logged_seconds?: number
  duration_hm?: string
}

/** El bloque de aprobacion tal como lo ve un contacto. */
export interface AprobacionPortal {
  requerida: boolean
  estado: 'pendiente' | 'aprobada' | 'rechazada' | null
  solicitada_en: string | null
  resuelta_en: string | null
  comentario: string | null
}

export interface HitoPortal {
  id: number
  name: string
  /** `null` cuando el equipo no marco la descripcion como compartible. */
  description: string | null
  start_date: string | null
  due_date: string | null
  project_id: number
  color: string | null
  order: number
  date_created: string | null
  counts: { tasks: number, tasks_done: number }
  vencido: boolean
  total_logged_seconds?: number
}

export interface ArchivoPortal {
  id: number
  file_name: string
  original_file_name: string | null
  subject: string | null
  filetype: string | null
  date_added: string | null
  url: string | null
  thumbnail_url: string | null
}

/** Anuncio dirigido a clientes. */
export interface AnuncioPortal {
  id: number
  name: string
  message: string
  date_added: string | null
  /** Si el contacto ya lo descarto en el portal viejo. Se usa para bajarle el tono, no para ocultarlo. */
  dismissed: boolean
}

/** Grupo de la base de conocimiento, con sus articulos visibles. */
export interface GrupoAyudaPortal {
  id: number
  name: string
  slug: string
  description: string | null
  color: string | null
  articles: Array<{ id: number, subject: string, slug: string, date: string | null }>
}

export interface ArticuloAyudaPortal {
  id: number
  subject: string
  /** HTML redactado en el panel. Se muestra aislado, nunca inyectado en la pagina. */
  description: string
  slug: string
  date: string | null
  group: { id: number, name: string, slug: string }
}

/**
 * Discusion compartida con el cliente.
 *
 * Sin `show_to_customer`: al portal solo llegan las que la tienen, asi que el campo seria siempre
 * `true` y delataria que existe la distincion.
 */
export interface DiscusionPortal {
  id: number
  subject: string
  description: string | null
  date_created: string | null
  last_activity: string | null
  counts: { comments: number }
  staff: { id: number, full_name: string } | null
  contact: { id: number, full_name: string } | null
}

/*
 * Los comentarios de una discusion NO estan aca: llegan en la misma forma que al panel
 * (`ComentarioDiscusion` de `recursos.ts`), y el mismo panel los dibuja para los dos sujetos. Una
 * segunda declaracion de la misma forma solo para el portal es lo que hacia que las dos pantallas
 * se pudieran separar sin que nadie se enterara.
 */

/** Entrada del registro de actividad, sin la marca de visibilidad. */
export interface ActividadPortal {
  id: number
  description: string
  additional_data: string | null
  date_added: string | null
  staff: { id: number, full_name: string } | null
  contact: { id: number, full_name: string } | null
}

/** Registro de horas, sin tarifa ni banderas de edicion. */
export interface TiempoPortal {
  id: number
  staff: { id: number, full_name: string } | null
  task: { id: number, name: string }
  start_time: string
  end_time: string | null
  note: string | null
  duration_seconds: number
  duration_hm: string
}

/*
 * Los grupos del gantt tampoco estan aca, y por lo mismo: `RecursoGantt::paraContacto()` arma las
 * columnas con el mismo presentador que el del equipo, asi que lo que llega es un `GrupoGantt` de
 * `recursos.ts` y lo dibuja el mismo `PanelGantt`. La declaracion que vivia aca decia `grupo:
 * string` y `dependencies: number[]`, que no es lo que la API manda: dos formas del mismo dato se
 * separan, y la que nadie ejecuta se separa primero.
 */

/**
 * El inicio del portal en un solo viaje: `GET /portal/resumen`.
 *
 * Es el agregado de TODOS los {espacios} del cliente, sumado en el servidor. Existe porque antes lo
 * sumaba el navegador sobre `/portal/projects?per_page=100`: con más de cien {espacios} la portada
 * mentía hacia abajo y en silencio. Un agregado no se pagina.
 *
 * Las dos ausencias del tipo son el contrato, no comodidad:
 *
 *   - `procesos` es **opcional de verdad**: la API no manda la clave cuando ningún {espacio}
 *     comparte la pestaña de {procesos}. No llega en `null` ni en cero, no llega. Un contador sobre
 *     una lista que la pantalla le niega al cliente le cuenta en forma de número justo lo que se
 *     decidió no mostrarle.
 *   - `esperando_tu_respuesta` es `number | null` y el `null` NUNCA es 0. Vale `null` cuando no se
 *     puede saber —ningún {espacio} con la pestaña de {procesos}, o la tabla de aprobaciones sin
 *     migrar—, y un 0 ahí se leería «no te falta nada», que es lo contrario de «no sé».
 *   - `bloqueados` es la tercera, y es **la misma ausencia que `procesos`**: la clave no llega si
 *     ningún {espacio} comparte la pestaña de {procesos}, ni en una instalación sin la tabla de
 *     bloqueos (migración `0620`). Ahí `[]` se leería «no tenés nada trabado» y la verdad es «no
 *     sé»: son dos pantallas distintas y las dos existen.
 *
 * `proximos_hitos`, en cambio, viaja SIEMPRE, también en `[]`: es el detalle del contador `hitos` y
 * comparte su puerta —ninguna—, así que la lista vacía significa «no hay ninguno comprometido».
 */
export interface ResumenPortal {
  espacios: EspaciosDelResumen
  /** Ver arriba: la clave **falta** si ningún {espacio} comparte la pestaña de {procesos}. */
  procesos?: ProcesosDelResumen
  /** {Procesos} que esperan una decisión del cliente. `null` es «no se puede saber», jamás 0. */
  esperando_tu_respuesta: number | null
  hitos: HitosDelResumen
  /** Los {hitos} que vienen, ya ordenados por fecha. Viaja siempre; `[]` es «no hay ninguno». */
  proximos_hitos: HitoProximoDelResumen[]
  /** Ver arriba: la clave **falta** cuando no se puede saber. Ausente no es `[]`. */
  bloqueados?: BloqueoDelResumen[]
  /** Ver arriba: la clave **falta** si ningún {espacio} comparte la pestaña de {procesos}. */
  proximos_dias?: ProximosDiasDelResumen
  /** Ver arriba: la clave **falta** si el contacto no tiene la sección de soporte. */
  tickets?: TicketsDelResumen
}

/**
 * Lo que le viene encima al cliente, repartido en los mismos tres tramos que el Inicio del panel.
 *
 * Es el equivalente de «Mi trabajo» del colaborador y comparte su forma a propósito: un cliente y
 * un colaborador miran la misma pregunta —qué hay que hacer y para cuándo— y no hay razón para que
 * la respuesta se vea distinta en cada pantalla.
 *
 * Los tramos vienen **ya armados y ya ordenados por el servidor**, que es lo que los distingue de
 * `agruparPorVencimiento()` del panel: ahí el navegador reparte lo que le llegó paginado, y acá no
 * puede, porque un cliente con más {espacios} que una página vería tramos incompletos sin ninguna
 * señal. `total` existe para lo mismo: dice cuántos hay de verdad, y con eso la pantalla escribe
 * «y N más» en vez de mentir por omisión.
 */
export interface ProximosDiasDelResumen {
  /** Pasados de fecha y sin terminar. Encabezan la pantalla porque son los que ya fallaron. */
  vencido: FilaDeProximosDias[]
  /** Vencen hoy. */
  hoy: FilaDeProximosDias[]
  /** Vencen dentro de los próximos siete días. */
  proximo: FilaDeProximosDias[]
  /** Cuántos {procesos} abiertos y visibles hay en total, contados sobre TODOS los {espacios}. */
  total: number
}

/**
 * Un {proceso} en la lista de los próximos días, con lo que hace falta para decidir sin abrirlo.
 *
 * `espera_tu_respuesta` y `en_progreso` no son decoración: son la clave del orden. El servidor
 * ordena cada tramo poniendo primero lo que espera al cliente, después lo que el equipo está
 * moviendo, y recién ahí por fecha. Una lista ordenada sólo por fecha entierra la aprobación que
 * desbloquea el trabajo debajo de cinco {procesos} que no dependen de nadie.
 *
 * `due_date` es `YYYY-MM-DD` sin hora, o `null` cuando la fila guarda la fecha cero de MySQL.
 */
export interface FilaDeProximosDias {
  id: number
  name: string
  due_date: string | null
  status: EstadoDeProceso
  project: ReferenciaDeEspacio
  /** Hay una aprobación pendiente de este contacto. Es lo único de la lista que él puede resolver. */
  espera_tu_respuesta: boolean
  /** El equipo ya lo está haciendo. Informa, no pide nada. */
  en_progreso: boolean
}

/**
 * Los tickets del contacto, resumidos para la portada.
 *
 * La clave falta —no viaja en ceros— cuando el contacto no tiene la sección de soporte: contarle
 * sus tickets a quien no puede abrir ninguno es la misma clase de fuga que el resumen ya evita con
 * `procesos`.
 *
 * `esperando_tu_respuesta` cuenta los tickets cuyo último mensaje es del equipo: son los que están
 * detenidos del lado del cliente, y por eso es el número que la portada destaca.
 */
export interface TicketsDelResumen {
  abiertos: number
  esperando_tu_respuesta: number
  /** Hasta cinco, los abiertos primero y por última respuesta descendente. */
  ultimos: TicketDelResumen[]
}

/** Un ticket en la portada: lo justo para reconocerlo y abrirlo. */
export interface TicketDelResumen {
  id: number
  subject: string
  status: EstadoDeProceso
  /** ISO-8601 de la última respuesta, o `null` si todavía no hay ninguna. Mismo formato que
   *  `bloqueado_en` en este endpoint: el instante viaja en UTC y lo localiza la pantalla. */
  last_reply: string | null
  /** El {espacio} del que cuelga, o `null`: un ticket puede no pertenecer a ninguno. */
  project: ReferenciaDeEspacio | null
}

/**
 * Un estado resuelto: el id, su nombre y su color, tal como se pinta.
 *
 * Viaja resuelto desde el servidor y no como el `status: number` del resto del portal, que la
 * pantalla traduce con `/portal/lookups`. La portada es la única pantalla del portal que mezcla
 * {procesos} y tickets —dos catálogos distintos— y resolverlos en el navegador le costaría dos
 * viajes más a la pantalla que tiene que pintar primero.
 */
export interface EstadoDeProceso {
  id: number
  name: string
  color: string
}

/**
 * Un {hito} de los que vienen, con el {espacio} al que pertenece.
 *
 * Existe porque el contador `hitos` dice CUÁNTOS hay y cuántos están vencidos, y con eso el cliente
 * no sabe qué viene ni cuándo: para averiguarlo tenía que abrir sus {espacios} de a uno.
 *
 * `vencido` lo calcula el servidor con la misma expresión que el contador —fecha pasada **y**
 * {procesos} sin terminar— y no es una resta de fechas del navegador: dos relojes distintos en la
 * misma pantalla es justo el error que el contador ya evita.
 *
 * `due_date` es `YYYY-MM-DD` sin hora y puede llegar en `null` si la fila trae la fecha cero de
 * MySQL. El servidor no lista {hitos} sin fecha, así que el `null` es la excepción, no el caso.
 */
export interface HitoProximoDelResumen {
  id: number
  name: string
  due_date: string | null
  project: ReferenciaDeEspacio
  vencido: boolean
}

/**
 * De quién depende destrabar un {proceso} detenido (enum de la migración `0699`).
 *
 * No es una persona: es el lado que tiene la pelota. `cliente` es el único que quien mira el portal
 * puede resolver solo, y por eso la pantalla lo destaca.
 */
export type ResponsableDelBloqueo = 'cliente' | 'equipo' | 'tercero'

/**
 * Un {proceso} detenido: qué está trabado, por qué, desde cuándo y de quién depende destrabarlo.
 *
 * `accion_necesaria` y `responsable` son las dos columnas de la migración `0699` y por eso son
 * opcionales **y** anulables: una instalación atrasada pierde el dato nuevo, no la fila —el motivo
 * y la fecha llegan igual—, y ahí el servidor tampoco puede ordenar por responsable.
 *
 * `dias_bloqueada` es `number | null` y el `null` NUNCA es 0: significa que la fecha de bloqueo no
 * se pudo leer. «Se trabó hoy» es una afirmación, y una fila sin fecha no la sostiene.
 */
export interface BloqueoDelResumen {
  id: number
  name: string
  project: ReferenciaDeEspacio
  motivo: string
  accion_necesaria?: string | null
  responsable?: ResponsableDelBloqueo | null
  bloqueado_en: string | null
  dias_bloqueada: number | null
}

/**
 * El {espacio} al que pertenece una fila del resumen.
 *
 * Viaja como `{id, name}` y no como `rel_id`: el id polimórfico de la API no sale del portal por
 * ninguna ruta, y el nombre es lo único que la portada necesita para decir de dónde salió la fila.
 */
export interface ReferenciaDeEspacio {
  id: number
  name: string
}

/**
 * Cuántos {espacios} ve el cliente, y en qué estado están.
 *
 * `total` es el conteo real de filas y no la suma del desglose: un estado fuera del catálogo no se
 * pintaría, pero el total seguiría siendo cierto. El desglose lista SIEMPRE todos los estados del
 * catálogo, también los que están en cero, para que la pantalla no cambie de forma según el cliente.
 */
export interface EspaciosDelResumen {
  total: number
  by_status: EstadoDelResumen[]
}

/** Un estado del catálogo de {espacios} con cuántos hay en él. */
export interface EstadoDelResumen {
  status: number
  name: string
  color: string
  order: number
  total: number
}

/**
 * Los cuatro contadores de {procesos} del resumen, sobre los {espacios} que comparten la pestaña.
 *
 * Sólo cuentan esos {espacios} y no todos: si contaran todos, el número no sería el de ninguna lista
 * que el cliente pueda abrir.
 */
export interface ProcesosDelResumen {
  total: number
  open: number
  completed: number
  completed_percent: number
}

/**
 * {Hitos} del cliente: cuántos hay comprometidos y cuántos ya pasaron de fecha.
 *
 * Sin puerta propia, igual que el bloque de {hitos} de la ficha de un {espacio}: este resumen no
 * publica ni un dato que esa ficha no publique ya.
 */
export interface HitosDelResumen {
  total: number
  overdue: number
}

/**
 * El tablero de control de gestión mensual: `GET /portal/gestion?mes=YYYY-MM`.
 *
 * Los dieciséis bloques que arma `Recursos\RecursoGestion` y recorta `FormasDelPortal::GESTION`. Se
 * declara entero acá —y no por pedazos donde se usa— porque es la ruta que más cifras publica de
 * todo el portal, y la lista de lo que llega tiene que poder leerse de arriba abajo.
 *
 * Los `| null` no son descuido ni comodidad: `null` NUNCA es 0. Un mes sin aprobaciones resueltas
 * devuelve `null` en `porcentaje_primera_ronda`, y un cero ahí se leería «no aprobamos nada a la
 * primera». El tipo obliga a que la pantalla decida qué escribir en ese caso.
 */
export interface TableroGestion {
  alcance: AlcanceGestion
  volumen: VolumenGestion
  abiertas_al_cierre: AbiertasAlCierre
  plazos: PlazosGestion
  tiempos: TiemposGestion
  etapas: EtapasGestion
  calidad: CalidadGestion
  cambios: CambiosGestion
  trabas: TrabaGestion[]
  vencidas: VencidaGestion[]
  estancadas: EstancadaGestion[]
  deuda_de_aprobacion: DeudaDeAprobacion
  por_hito: HitoGestion[]
  antiguedad_abiertas: TramoDeAntiguedad[]
  por_espacio: EspacioDeGestion[]
  /** Los seis meses que terminan en `alcance.mes`, del más viejo al pedido. Ver {@link PuntoDeTendencia}. */
  tendencia: PuntoDeTendencia[]
}

/**
 * Un mes de la serie de seis: las mismas cuentas del tablero, sobre otro rango.
 *
 * Existe porque el resto del tablero es una FOTO y una foto no se puede evaluar: «68% en plazo» no
 * es bueno ni malo hasta que se sabe si el mes pasado fue 55% o 82%.
 *
 * Los tres `| null` son los mismos `null` del resto del archivo y por el mismo motivo: llegan así
 * cuando no hubo denominador —ningún {proceso} comprometido, ninguna aprobación resuelta, nadie
 * esperando— y jamás valen 0. Una línea que baja a cero en esos meses dibuja una caída que no pasó.
 */
export interface PuntoDeTendencia {
  /** `YYYY-MM`. */
  mes: string
  recibidas: number
  cerradas: number
  /** `null` si no había nada comprometido ese mes. */
  porcentaje_en_plazo: number | null
  /** `null` si el mes no resolvió ninguna aprobación. */
  rondas_promedio: number | null
  /** Días esperando al cliente. `null` si no hubo nada esperando, o si todavía no se registraba. */
  deuda_dias: number | null
  /**
   * `true` en el mes en curso: se cortó en AHORA, así que son dieciocho días contra meses de
   * treinta. No se extrapola —sería inventar trabajo que no ocurrió— y por eso la pantalla tiene
   * que marcarlo: comparar un mes a medias contra meses completos sin decirlo es la forma más
   * barata de dibujar una caída que no existe.
   */
  parcial: boolean
}

/**
 * Si los días por etapa son un dato medido o todavía no se registran.
 *
 * `sin_datos` es el valor de hoy en producción: `tblwiwo_task_status_log` está vacía. La pantalla
 * que reciba esto NO puede dibujar ceros —cuatro ceros se leen «el equipo no tarda nada»—; dice que
 * todavía no se registra.
 */
export type MedicionPorEtapa = 'medida' | 'sin_datos'

/**
 * De dónde salió el estado que tenía cada {proceso} al cierre del mes.
 *
 * Con `estimado` el estado se dedujo del `status` de hoy, y los cuatro cubos PUEDEN NO SUMAR el
 * total: una {proceso} que hoy dice Completo pero al cierre seguía abierta no se clasifica en
 * ninguno, porque se sabe que el cubo es falso y no cuál era el verdadero.
 */
export type EstadoAlCierre = 'medido' | 'estimado'

/** De quién depende destrabar un {proceso} bloqueado. Enum de la migración 0699, no una persona. */
export type ResponsableDeTraba = 'cliente' | 'equipo' | 'tercero'

/**
 * Una mediana con su tamaño de muestra.
 *
 * `n` viaja al lado por una sola razón: para que la pantalla pueda decidir NO dibujar la mediana.
 * Una mediana de dos {procesos} no es una mediana, es una anécdota.
 */
export interface ResumenEstadistico {
  n: number
  mediana: number | null
  p90: number | null
}

export interface AlcanceGestion {
  /** `YYYY-MM`. */
  mes: string
  /** `YYYY-MM-DD`, primer día del mes. */
  desde: string
  /** `YYYY-MM-DD`, último día del mes. */
  hasta: string
  /** `false` en el mes en curso: lo que se ve todavía se puede mover. */
  cerrado: boolean
  /** Instante hasta el que se midió: el fin del mes, o ahora si el mes está en curso. */
  medido_hasta: string
  dias_del_mes: number
  medicion_por_etapa: MedicionPorEtapa
  espacios: Array<{ id: number, name: string }>
}

export interface VolumenGestion {
  recibidas: number
  cerradas: number
  abiertas_al_cierre: number
}

/**
 * Los cuatro cubos de estado más `bloqueadas`.
 *
 * `bloqueadas` es ORTOGONAL a los cubos —una {proceso} bloqueada sigue teniendo su estado y ya se
 * contó en su cubo—, así que los cinco números no suman el total y no se pueden apilar.
 */
export interface AbiertasAlCierre {
  produccion: number
  revision_interna: number
  revision_vp: number
  terminado: number
  bloqueadas: number
  estado_al_cierre: EstadoAlCierre
}

export interface PlazosGestion {
  comprometidas: number
  en_plazo: number
  /** `null` si no había nada comprometido. No es 0: «cero en plazo» es lo contrario de «nada». */
  porcentaje_en_plazo: number | null
  vencidas_al_cierre: number
  atraso_dias: { n: number, mediana: number | null, suma: number | null }
}

export interface TiemposGestion {
  /** Días que el cliente tardó en responder una aprobación. */
  respuesta_cliente: ResumenEstadistico
  /** Días hasta la primera solicitud de aprobación. */
  entrega_equipo: ResumenEstadistico
  /** Otra población: {procesos} sin aprobación requerida. No se mezcla con la anterior. */
  entrega_equipo_sin_aprobacion: ResumenEstadistico
  punta_a_punta: ResumenEstadistico
}

export interface EtapasGestion {
  medicion: MedicionPorEtapa
  /** El «tiempo acordado» del ciclo completo, en días HÁBILES. `null` si nadie acordó ninguno. */
  compromiso_dias: number | null
  /** Siempre `true`: recuerda que el compromiso no está en la misma unidad que los cubos. */
  compromiso_dias_habiles: boolean
  /** Días CORRIDOS del ciclo completo. Es lo único comparable contra `compromiso_dias`. */
  ciclo: ResumenEstadistico
  cubos: CuboDeEtapa[]
}

export interface CuboDeEtapa extends ResumenEstadistico {
  cubo: string
  rotulo: string
}

export interface CalidadGestion {
  resueltas: number
  aprobadas_primera_ronda: number
  porcentaje_primera_ronda: number | null
  rondas_promedio: number | null
  /**
   * El retrabajo del mes partido por categoría, o `null` si no hay con qué calcularlo.
   *
   * `null` es «no lo registramos» —sin la tabla de iteraciones, sin la migración 0682 o sin ninguna
   * iteración en el mes— y NO «no hubo retrabajo». Cuatro ceros ahí se leen como un mes impecable.
   */
  motivos: MotivosDeRetrabajo | null
}

/**
 * El desglose del retrabajo: por qué se rehízo el trabajo, no cuánto.
 *
 * Es lo que convierte «2,3 rondas» en un argumento: esa cifra no dice si se rehizo porque nos
 * equivocamos, porque al cliente le gustó otra cosa, o porque apareció alcance que no estaba
 * pedido. Las tres categorías las fija el negocio en la migración 0680.
 *
 * `sin_motivo` NO es una cuarta categoría: son las iteraciones sin clasificar —las anteriores al
 * catálogo y las que se registraron sin elegirlo—. Viaja aparte, y `total` al lado, para que la
 * pantalla pueda decir «de 40 iteraciones, 12 sin clasificar» en vez de presentar un desglose que
 * no suma.
 */
export interface MotivosDeRetrabajo {
  /** Lo que rehicimos por un error nuestro. Es la única categoría que nos acusa. */
  error_evitable: number
  ajuste_de_contenido: number
  cambio_de_alcance: number
  /** Iteraciones sin categoría asignada. No es una categoría: es lo que falta clasificar. */
  sin_motivo: number
  /** Todas las iteraciones del mes. Deja el desglose auditable: las cuatro claves suman esto. */
  total: number
}

export interface CambiosGestion {
  entradas_no_planificadas: number
  /** Siempre `true`. Califica SÓLO a `entradas_no_planificadas`: los tres de abajo son dato medido. */
  estimado: boolean
  /** Movimientos de la fecha de entrega. `null` si la instalación no tiene la migración 0770. */
  reprogramaciones: CambioDeCompromiso | null
  cambios_de_prioridad: CambioDeCompromiso | null
  cambios_de_hito: CambioDeCompromiso | null
}

/**
 * Cuánto se movió lo que ya estaba acordado, en un campo.
 *
 * Son DOS números y no uno porque uno solo no se puede leer: treinta reprogramaciones sobre treinta
 * {procesos} y treinta sobre dos son dos problemas opuestos, y el segundo no se deriva del primero.
 */
export interface CambioDeCompromiso {
  /** Movimientos registrados. */
  cambios: number
  /** Cuántos {procesos} distintos se movieron. Nunca es derivable de `cambios`. */
  procesos: number
}

/** Los campos que comparten las tres listas de {procesos} del tablero. */
export interface ProcesoDeGestion {
  id: number
  patente: string | null
  name: string
  status: number
  project: { id: number, name: string | null }
  date_added: string | null
  due_date: string | null
  date_finished: string | null
}

export interface TrabaGestion extends ProcesoDeGestion {
  /** Escrito para que el cliente lo lea: es el motivo del bloqueo, no una nota interna. */
  motivo: string
  accion_necesaria: string | null
  responsable: ResponsableDeTraba | null
  bloqueado_en: string | null
  dias_bloqueada: number | null
}

export interface VencidaGestion extends ProcesoDeGestion {
  /** Contra `due_date`, que es la fecha que el cliente ya tiene en pantalla. */
  dias_de_atraso: number
}

export interface EstancadaGestion extends ProcesoDeGestion {
  /** La ventana con la que se preguntó «se movió», no la fecha del último movimiento. */
  dias_sin_movimiento: number
  dias_abierta: number | null
}

/**
 * Los días que el trabajo pasó esperando al PROPIO cliente.
 *
 * `porcentaje_del_mes` es sobre el tiempo disponible de los {procesos} que esperaron (`n` × días
 * del mes), no sobre los días del mes a secas: con cinco esperando daría 400%.
 */
export interface DeudaDeAprobacion {
  dias: number | null
  n: number
  dias_del_mes: number
  porcentaje_del_mes: number | null
}

/** `id` y `name` en `null` es la fila de lo que no cuelga de ningún {hito}. */
export interface HitoGestion {
  id: number | null
  name: string | null
  project_id: number | null
  comprometidas: number
  en_plazo: number
  cerradas: number
  abiertas_al_cierre: number
}

export interface TramoDeAntiguedad {
  rango: string
  desde_dias: number
  /** `null` es el tramo abierto de la derecha. */
  hasta_dias: number | null
  total: number
}

/** Sólo conteos: son lo único aditivo. Una mediana por {espacio} no se compone con la de otro. */
export interface EspacioDeGestion {
  id: number
  name: string
  recibidas: number
  cerradas: number
  abiertas_al_cierre: number
  bloqueadas: number
  comprometidas: number
  en_plazo: number
  vencidas_al_cierre: number
}
