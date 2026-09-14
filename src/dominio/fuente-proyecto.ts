/**
 * De donde bajan los datos de un Proyecto: del panel del colaborador o del portal del cliente.
 *
 * Los paneles de un Proyecto —Tareas, Calendario, Hitos, Tiempos, Discusiones, Actividad, Gantt,
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
 * - **Solo rutas.** Nada de datos, nada de permisos. Lo que se puede escribir entra por
 *   `capacidades`, que es otra prop; `capacidades={[]}` es lo que apaga la escritura.
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
  /** Ficha de un Proceso, con lo que cada sujeto pueda ver de el. */
  tarea: (tareaId: number) => string
  /** Catalogos para resolver estado y prioridad. El del portal es un subconjunto del del panel. */
  lookups: string
  /**
   * Raiz de los subrecursos del Proceso (`{raiz}/checklist`, `{raiz}/timers`, `{raiz}/iterations`,
   * `{raiz}/share`, Drive y adjuntos).
   *
   * `null` en el portal: alli el detalle llega **con todo adentro** —comentarios, checklist,
   * adjuntos y tiempo registrado, cada uno segun su flag por proyecto—, y esos subrecursos no
   * existen para un contacto. Con `null` el detalle no monta ninguno y no pide nada de mas.
   */
  subrecursosDeTarea: ((tareaId: number) => string) | null
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
  /** Listado de Procesos. `consulta` es el query string ya armado, sin `?`; vacio no agrega nada. */
  tareas: (consulta: string) => string
  /**
   * Procesos para el calendario de entregas.
   *
   * En el panel es el mismo listado; en el portal es la ruta propia de la pestaña Calendario, que la
   * API acota con las mismas dos condiciones que las Tareas pero exige aparte.
   */
  calendario: (consulta: string) => string
  /** Resumen del Proyecto: contadores, plazos y —solo si corresponde— importes. */
  resumen: string
  /** Hitos del Proyecto. `tope` va como `per_page`. */
  hitos: (tope: number) => string
  archivos: string
  discusiones: string
  /** Comentarios de un hilo de discusion. */
  comentarios: (hiloId: number) => string
  actividad: string
  tiempos: string
  gantt: string
  actas: string
  acta: (actaId: number) => string
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
}

/**
 * Pega un query string a una ruta.
 *
 * @param ruta Ruta sin barra inicial ni `?`.
 * @param consulta Query string ya armado, sin `?`. Vacio devuelve la ruta tal cual.
 * @returns La ruta lista para el BFF.
 */
function conConsulta (ruta: string, consulta: string): string {
  return consulta === '' ? ruta : `${ruta}?${consulta}`
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
  tarea: (tareaId) => `tasks/${seg(tareaId)}?include=custom_fields`,
  lookups: 'lookups',
  subrecursosDeTarea: (tareaId) => `tasks/${seg(tareaId)}`
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
    tareas: (consulta) => conConsulta(`${raiz}/tasks`, consulta),
    // El panel no tiene una ruta propia de calendario: su calendario de entregas es una lectura mas
    // del mismo listado de Procesos.
    calendario: (consulta) => conConsulta(`${raiz}/tasks`, consulta),
    resumen: `${raiz}/overview`,
    hitos: (tope) => `${raiz}/milestones?per_page=${seg(tope)}`,
    archivos: `${raiz}/files`,
    discusiones: `${raiz}/discussions`,
    // Cuelgan del hilo y no del Proyecto: asi los expone la API.
    comentarios: (hiloId) => `discussions/${seg(hiloId)}/comments?tipo=regular`,
    actividad: `${raiz}/activity`,
    tiempos: `${raiz}/timesheets`,
    gantt: `${raiz}/gantt`,
    actas: `${raiz}/actas`,
    acta: (actaId) => `${raiz}/actas/${seg(actaId)}`,
    resumenDeTareas: `${raiz}/tasks/summary`,
    camposDeTareas: 'custom-fields?para=tasks',
    dependenciasDeTareas: `${raiz}/tasks/dependencies`
  }
}

/**
 * Las rutas del Proyecto para el cliente (`/portal/projects/{id}/...`).
 *
 * Los tres `null` no son huecos que haya que tapar: son los recursos que un contacto no tiene, y son
 * lo que deja cada panel en solo lectura sin una sola rama por sujeto. `subrecursosDeTarea` es el
 * cuarto, y viene de `FuenteDeTarea`.
 *
 * @param proyectoId El Proyecto que el cliente esta mirando.
 * @returns La fuente lista para pasarle a cualquier panel del Proyecto.
 */
export function fuenteDelPortal (proyectoId: number): FuenteDeProyecto {
  const raiz = `portal/projects/${seg(proyectoId)}`

  return {
    sujeto: 'portal',
    tarea: (tareaId) => `${raiz}/tasks/${seg(tareaId)}`,
    lookups: 'portal/lookups',
    subrecursosDeTarea: null,
    tareas: (consulta) => conConsulta(`${raiz}/tasks`, consulta),
    calendario: (consulta) => conConsulta(`${raiz}/calendar`, consulta),
    resumen: `${raiz}/overview`,
    hitos: (tope) => `${raiz}/milestones?per_page=${seg(tope)}`,
    archivos: `${raiz}/files`,
    discusiones: `${raiz}/discussions`,
    comentarios: (hiloId) => `${raiz}/discussions/${seg(hiloId)}/comments`,
    actividad: `${raiz}/activity`,
    tiempos: `${raiz}/timesheets`,
    gantt: `${raiz}/gantt`,
    actas: `${raiz}/actas`,
    acta: (actaId) => `${raiz}/actas/${seg(actaId)}`,
    resumenDeTareas: null,
    camposDeTareas: null,
    dependenciasDeTareas: null
  }
}
