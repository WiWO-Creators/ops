/**
 * De donde bajan los datos de un Proyecto: del panel del colaborador o del portal del cliente.
 *
 * Los paneles de un Proyecto —Tareas, Calendario, Hitos, Tiempos, Actividad, Gantt,
 * Descripcion y Meeting Paper— pedian sus datos con la ruta **escrita dura adentro**
 * (`pedirSobre('projects/7/tasks')`). Eso los ataba al sujeto: el mismo dibujo no podia montarse en
 * el portal, y la unica salida era copiarlo. Se copiaron, y las dos copias se desincronizaron.
 *
 * El BFF ya elige el sujeto mirando el primer segmento de la ruta (`ruta[0] === 'portal'`, ver
 * `app/api/bff/[...ruta]/route.ts`): una peticion a `portal/...` viaja con la sesion del contacto y
 * contra la lista blanca del portal. Asi que para que un panel sirva a los dos **basta inyectarle
 * las rutas**: no hace falta ninguna rama por sujeto adentro.
 *
 * Reglas de esta pieza:
 *
 * - **Solo rutas, y solo texto.** La fuente la arma un Server Component y la recibe un panel, que es
 *   cliente: React no serializa funciones al cruzar ese limite. Por eso las rutas con un id adentro
 *   son **plantillas con `:id`** que se resuelven con `conId`, el mismo idiom que ya usa
 *   `rutaMover: 'tasks/:id/mover'` en los tableros, y el query string se pega con `conConsulta`.
 * - Nada de datos, nada de permisos. Lo que se puede escribir entra por `capacidades`, que es otra
 *   prop; `capacidades={[]}` es lo que apaga la escritura.
 * - **`null` significa "este sujeto no tiene ese recurso"**, y el panel se dibuja igual sin el. No
 *   es un error ni un dato vacio: es una rama menos. El Gantt sin `dependenciasDeTareas` no
 *   arrastra, la tabla sin `camposDeTareas` no tiene columnas personalizadas, y ninguno de los dos
 *   pregunta de que sujeto es.
 * - **Ninguna ruta lleva barra inicial**: es lo que `pedirSobre` y `useRecurso` esperan, porque las
 *   dos le pegan el prefijo `/api/bff/`.
 *
 * Las dos fuentes declaran **las mismas claves**: una clave que exista en una y falte en la otra
 * volveria a obligar al panel a preguntar por el sujeto. `pruebas/fuente-proyecto.test.js` lo
 * verifica, junto con que todas las del portal empiecen con `portal/`.
 */

/**
 * Lo minimo que necesita quien dibuja **el detalle de un Proceso** y nada mas.
 *
 * Existe aparte porque `ModalTarea` se monta en pantallas que no son un Proyecto —el Inicio, Mis
 * Tareas, el calendario global, el listado de Procesos—: pedirles una `FuenteDeProyecto` entera
 * seria pedirles rutas de hitos y de actas que no tienen para que. `FuenteDeProyecto` la satisface,
 * asi que la pestaña de un Proyecto le pasa la suya sin adaptarla.
 */
export interface FuenteDeTarea {
  /** Ficha de un Proceso, con lo que cada sujeto pueda ver de el. Plantilla con `:id`. */
  tarea: string
  /** Catalogos para resolver estado y prioridad. El del portal es un subconjunto del del panel. */
  lookups: string
  /**
   * Raiz de los subrecursos del Proceso (`{raiz}/checklist`, `{raiz}/timers`, `{raiz}/iterations`,
   * `{raiz}/share`, Drive y adjuntos). Plantilla con `:id`.
   *
   * `null` en el portal: alli el detalle llega **con todo adentro** —comentarios, checklist,
   * adjuntos y tiempo registrado, cada uno segun su flag por proyecto—, y esos subrecursos no
   * existen para un contacto. Con `null` el detalle no monta ninguno y no pide nada de mas.
   */
  subrecursosDeTarea: string | null
}

/** De donde bajan todos los datos de un Proyecto, panel y portal. */
export interface FuenteDeProyecto extends FuenteDeTarea {
  /**
   * Cual de los dos contratos es.
   *
   * **No es para que un panel se bifurque**: los paneles usan las rutas y los `null`. Lo lee la capa
   * de definiciones, que es la que sabe que columnas y que filtros emite cada contrato.
   */
  sujeto: 'panel' | 'portal'
  /** Listado de Procesos, sin query. */
  tareas: string
  /**
   * Procesos para el calendario de entregas.
   *
   * En el panel es el mismo listado; en el portal es la ruta propia de la pestaña Calendario, que la
   * API acota con las mismas dos condiciones que las Tareas pero exige aparte.
   */
  calendario: string
  /** Resumen del Proyecto: contadores, plazos y —solo si corresponde— importes. */
  resumen: string
  /** Hitos del Proyecto, sin query: el tope va como `per_page` desde quien pide. */
  hitos: string
  archivos: string
  actividad: string
  tiempos: string
  gantt: string
  actas: string
  /** Un acta con su contenido. Plantilla con `:id` del acta. */
  acta: string
  /**
   * Un acta en otro idioma. Plantilla con `:id` del acta; el idioma se pega con `conIdioma()`.
   *
   * Es la misma ruta en los dos sujetos y aun asi sale de la fuente, por lo mismo que el resto: el
   * panel la usa con GET, PATCH y DELETE y el portal solo con GET, y quien decide eso son las
   * capacidades, no el dibujo.
   */
  actaTraduccion: string
  /**
   * Las tareas que el modelo propuso a partir de un acta. Plantilla con `:id` del acta.
   *
   * `null` en el portal: proponer y crear Procesos es trabajo del equipo, y la API del contacto no
   * expone el recurso. Con `null` la seccion ni se dibuja, sin una rama por sujeto adentro.
   */
  actaTareas: string | null
  /**
   * Conteo de Procesos por estado, para las tarjetas de arriba de la tabla.
   *
   * `null` cuando el sujeto no tiene ese recurso: el panel se dibuja igual sin el.
   */
  resumenDeTareas: string | null
  /**
   * Definiciones de campos personalizados de Procesos, que se vuelven columnas y filtros.
   *
   * `null` en el portal: los campos personalizados son vocabulario interno y la API del contacto no
   * los emite ni los acepta como filtro.
   */
  camposDeTareas: string | null
  /**
   * Ruta con la que el Gantt guarda las dependencias entre Procesos.
   *
   * `null` en el portal, y eso es lo que lo deja **no arrastrable** sin que el Gantt pregunte por el
   * sujeto: el cliente lee el diagrama, no lo reacomoda.
   */
  dependenciasDeTareas: string | null
  /**
   * El Scope del contrato y su ultimo analisis de Procesos.
   *
   * `null` en el portal: el Scope es trabajo comercial del equipo y el veredicto "fuera de scope"
   * es vocabulario interno. Con `null` la pestaña Tareas no pide nada y no pinta ninguna etiqueta,
   * sin preguntar de que sujeto es.
   */
  scope: string | null
}

/**
 * Resuelve el `:id` de una plantilla de ruta.
 *
 * @param plantilla Ruta con `:id` adentro. Ej: `tasks/:id?include=custom_fields`.
 * @param id El id que va en su lugar.
 * @returns La ruta lista para el BFF.
 */
export function conId (plantilla: string, id: number): string {
  return plantilla.replace(':id', encodeURIComponent(String(id)))
}

/**
 * Pega el idioma al final de una ruta de traduccion.
 *
 * Existe en vez de un `:idioma` en la plantilla porque el idioma no es parte de la identidad del
 * recurso del mismo modo que el id: la misma ruta base sirve para pedir ingles y chino, y quien la
 * usa cambia de idioma sin volver a armar la plantilla.
 */
export function conIdioma (ruta: string, idioma: string): string {
  return `${ruta}/${encodeURIComponent(idioma)}`
}

/**
 * Pega un query string a una ruta.
 *
 * Respeta la ruta que ya trae uno: `projects/7/milestones?per_page=500` mas `page=2` sale con `&`.
 *
 * @param ruta Ruta sin barra inicial.
 * @param consulta Query string ya armado, sin `?`. Vacio devuelve la ruta tal cual.
 * @returns La ruta lista para el BFF.
 */
export function conConsulta (ruta: string, consulta: string): string {
  if (consulta === '') return ruta

  return `${ruta}${ruta.includes('?') ? '&' : '?'}${consulta}`
}

/** Un id dentro de una ruta. Nunca se interpola en crudo: un id es entrada, no literal. */
function seg (id: number): string {
  return encodeURIComponent(String(id))
}

/**
 * El detalle de un Proceso tal como lo ve el equipo, sin pasar por un Proyecto.
 *
 * Es el valor por defecto de `ModalTarea`: las pantallas del panel que listan Procesos fuera de un
 * Proyecto ya montaban ese modal sin decirle nada, y siguen sin tener que decirle nada.
 *
 * `?include=custom_fields` no es de adorno: sin el, la clave no viene y el "Área de la compañía" y
 * el "Link de Drive" solo se verian entrando a editar.
 */
export const TAREA_DEL_PANEL: FuenteDeTarea = {
  tarea: 'tasks/:id?include=custom_fields',
  lookups: 'lookups',
  subrecursosDeTarea: 'tasks/:id'
}

/**
 * Las rutas del Proyecto para el equipo (`/projects/{id}/...`).
 *
 * @param proyectoId El Proyecto que se esta mirando.
 * @returns La fuente lista para pasarle a cualquier panel del Proyecto.
 */
export function fuenteDelPanel (proyectoId: number): FuenteDeProyecto {
  const raiz = `projects/${seg(proyectoId)}`

  return {
    ...TAREA_DEL_PANEL,
    sujeto: 'panel',
    tareas: `${raiz}/tasks`,
    // El panel no tiene una ruta propia de calendario: su calendario de entregas es una lectura mas
    // del mismo listado de Procesos.
    calendario: `${raiz}/tasks`,
    resumen: `${raiz}/overview`,
    hitos: `${raiz}/milestones`,
    archivos: `${raiz}/files`,
    actividad: `${raiz}/activity`,
    tiempos: `${raiz}/timesheets`,
    gantt: `${raiz}/gantt`,
    actas: `${raiz}/actas`,
    acta: `${raiz}/actas/:id`,
    actaTraduccion: `${raiz}/actas/:id/traducciones`,
    actaTareas: `${raiz}/actas/:id/tareas`,
    resumenDeTareas: `${raiz}/tasks/summary`,
    camposDeTareas: 'custom-fields?para=tasks',
    dependenciasDeTareas: `${raiz}/tasks/dependencies`,
    scope: `${raiz}/scope`
  }
}

/**
 * Las rutas del Proyecto para el cliente (`/portal/projects/{id}/...`).
 *
 * Los cinco `null` no son huecos que haya que tapar: son los recursos que un contacto no tiene, y
 * son lo que deja cada panel en solo lectura sin una sola rama por sujeto. `subrecursosDeTarea` es
 * el quinto, y viene de `FuenteDeTarea`.
 *
 * @param proyectoId El Proyecto que el cliente esta mirando.
 * @returns La fuente lista para pasarle a cualquier panel del Proyecto.
 */
export function fuenteDelPortal (proyectoId: number): FuenteDeProyecto {
  const raiz = `portal/projects/${seg(proyectoId)}`

  return {
    sujeto: 'portal',
    // Nunca `portal/tasks/{id}`: la API del contacto no expone Procesos sueltos, y la pertenencia al
    // Proyecto es lo que la deja decidir si esa Tarea le corresponde.
    tarea: `${raiz}/tasks/:id`,
    lookups: 'portal/lookups',
    subrecursosDeTarea: null,
    tareas: `${raiz}/tasks`,
    calendario: `${raiz}/calendar`,
    resumen: `${raiz}/overview`,
    hitos: `${raiz}/milestones`,
    archivos: `${raiz}/files`,
    actividad: `${raiz}/activity`,
    tiempos: `${raiz}/timesheets`,
    gantt: `${raiz}/gantt`,
    actas: `${raiz}/actas`,
    acta: `${raiz}/actas/:id`,
    actaTraduccion: `${raiz}/actas/:id/traducciones`,
    actaTareas: null,
    // Los contadores por estado de la ficha, los mismos que el panel: la pantalla es la misma y la
    // arma el mismo componente. Cuelga de la pestaña Tareas, asi que un Proyecto que no comparte su
    // lista tampoco publica los numeros de esa lista.
    resumenDeTareas: `${raiz}/tasks/summary`,
    camposDeTareas: null,
    dependenciasDeTareas: null,
    scope: null
  }
}
