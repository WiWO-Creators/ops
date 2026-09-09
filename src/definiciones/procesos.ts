import type { DefinicionRecurso } from './tipos.ts'
import type { Proceso } from '../datos/recursos.ts'
import { GLOSARIO } from '../dominio/glosario.ts'
import { formatearFecha, formatearVencimiento } from '../lib/fechas.ts'
import { formatearDesviacion, SIN_DATO, SLA } from '../lib/sla.ts'

/**
 * Definicion del recurso Procesos.
 *
 * Las tres listas de whitelist —`filtros`, `ordenables` e `includes`— son **las del backend**, no una
 * eleccion de diseño: un valor que no este declarado alli devuelve `422` en vez de ignorarse. Cuando
 * el backend agregue uno, se agrega aca; hasta entonces `construirConsulta` lo poda antes de que
 * viaje.
 *
 * Fuente: `docs/modulos/01-procesos.md`.
 */
/**
 * Valor sintetico del filtro de Cliente: los Procesos sueltos de quien mira.
 *
 * No es el id de un cliente. El backend lo interpreta como "sin cliente Y asignado a mi"
 * (`RecursoProcesos::CLIENTE_PERSONALES`), y viaja como una opcion mas del mismo desplegable porque
 * es la misma pregunta —de quien es este Proceso— y no una casilla aparte que se pueda combinar con
 * un cliente.
 */
export const CLIENTE_PERSONALES = 'personales'

export const PROCESOS: DefinicionRecurso<Proceso> = {
  ruta: 'tasks',
  titulo: GLOSARIO.proceso,

  columnas: [
    // Va primera y no se puede ordenar: el backend no la declara en `ordenables`, y su orden util
    // —por Espacio y despues por numero— ya lo da ordenar por Espacio.
    { clave: 'patente', encabezado: 'ID', sinCortar: true, presentar: (p) => p.patente || `#${p.id}` },
    { clave: 'name', encabezado: 'Nombre', ordenPor: 'name', presentar: (p) => p.name },
    { clave: 'status', encabezado: 'Estado', ordenPor: 'status', comoInsignia: 'task_statuses', presentar: (p) => p.status },
    { clave: 'priority', encabezado: 'Prioridad', ordenPor: 'priority', comoInsignia: 'task_priorities', presentar: (p) => p.priority },
    // El tipo de Proceso lo configura cada Espacio en Perfex y es de donde sale el ETA comprometido:
    // leerlo al lado de la prioridad explica por que una tarea tiene la fecha que tiene. En pantalla
    // se pinta con los dos colores del catalogo; este texto es el que baja al CSV.
    { clave: 'task_type', encabezado: 'Tipo', presentar: (p) => p.task_type?.name ?? SIN_DATO },
    { clave: 'project', encabezado: GLOSARIO.espacio.singular, presentar: (p) => p.project?.name ?? '' },
    // Pegada al Espacio porque el hito cuelga de el: leidos juntos dicen en que tramo del Espacio
    // va la tarea. No es ordenable — el backend no declara `milestone` en su whitelist de orden, y
    // pedirlo devolveria 422. Una tarea sin hito es lo normal, no un dato que falta, pero en la
    // planilla la raya se lee mejor que una celda vacia.
    { clave: 'milestone', encabezado: GLOSARIO.hito.singular, presentar: (p) => p.milestone?.name ?? SIN_DATO },
    { clave: 'assignees', encabezado: 'Asignados', presentar: (p) => nombresAsignados(p) },
    // `formatearVencimiento` y no `formatearFecha`: una tarea puede no tener fecha de entrega a
    // proposito, y el guion la hace pasar por un dato que falta. En pantalla lo dice el presentador
    // `Fecha`; este texto es el que baja al CSV.
    { clave: 'due_date', encabezado: 'Vence', ordenPor: 'due_date', presentar: (p) => formatearVencimiento(p.due_date) },
    // Las tres del compromiso de plazo, juntas y despues de "Vence" porque se leen contra ella.
    // Cuando `wiwo_core` no esta instalado el backend ni siquiera manda las claves, asi que la celda
    // muestra el guion en vez de un cero que nadie conto — mismo criterio que Iteraciones.
    { clave: 'eta', encabezado: 'ETA', ordenPor: 'eta', presentar: (p) => formatearFecha(p.eta ?? null) },
    {
      clave: 'desviacion',
      encabezado: 'Desviación',
      ordenPor: 'desviacion',
      numerica: true,
      presentar: (p) => formatearDesviacion(p.desviacion_dias) ?? SIN_DATO
    },
    {
      clave: 'estado_sla',
      encabezado: 'SLA',
      presentar: (p) => (p.estado_sla == null ? SIN_DATO : SLA[p.estado_sla].etiqueta)
    },
    { clave: 'tags', encabezado: 'Etiquetas', presentar: (p) => p.tags.map((etiqueta) => etiqueta.name).join(', ') },
    {
      clave: 'iterations',
      encabezado: 'Iteraciones',
      numerica: true,
      // Contador propio de Wiwo (`tblwiwo_task_iterations`). Arranca oculta porque sin `wiwo_core` el
      // backend no manda la clave y la columna seria una fila de guiones ocupando ancho.
      ocultaPorDefecto: true,
      presentar: (p) => p.counts.iterations ?? SIN_DATO
    },
    {
      clave: 'start_date',
      encabezado: 'Inicio',
      ordenPor: 'start_date',
      ocultaPorDefecto: true,
      presentar: (p) => formatearFecha(p.start_date)
    },
    {
      clave: 'date_added',
      encabezado: 'Creado',
      ordenPor: 'date_added',
      ocultaPorDefecto: true,
      presentar: (p) => formatearFecha(p.date_added)
    }
  ],

  filtros: [
    { clave: 'status', etiqueta: 'Estado', tipo: 'multiple', desdeLookup: 'task_statuses' },
    { clave: 'priority', etiqueta: 'Prioridad', tipo: 'seleccion', desdeLookup: 'task_priorities' },
    { clave: 'clientid', etiqueta: GLOSARIO.cliente.singular, tipo: 'seleccion', desdeLookup: 'clients' },
    // Los dos catalogos los arma la pantalla, no `/lookups`: los Espacios salen de `GET /projects` y
    // los Hitos de `GET /projects/{id}/milestones`, que exige saber de que Espacio se habla. El
    // `dependeDe` del Hito es lo que hace que, sin Espacio elegido, `ControlesTabla` lo dibuje
    // deshabilitado con la pista en vez de esconderlo.
    { clave: 'project_id', etiqueta: GLOSARIO.espacio.singular, tipo: 'seleccion', desdeLookup: 'projects' },
    { clave: 'milestone_id', etiqueta: GLOSARIO.hito.singular, tipo: 'seleccion', desdeLookup: 'milestones', dependeDe: 'project_id' },
    // Las dos areas van pegadas para que se lean como par. Son preguntas distintas: la primera es
    // el area de la compañía que el Proceso lleva marcada (campo personalizado), la segunda es el
    // area del equipo a la que pertenece quien lo tiene asignado. Sin el apellido en la etiqueta
    // quedan dos "Área" indistinguibles en la barra.
    { clave: 'area', etiqueta: 'Área de la compañía', tipo: 'seleccion', desdeLookup: 'task_areas' },
    { clave: 'area_asignado', etiqueta: 'Área del asignado', tipo: 'seleccion', desdeLookup: 'areas' },
    { clave: 'billable', etiqueta: 'Facturable', tipo: 'booleano' },
    { clave: 'vence', etiqueta: 'Vence', tipo: 'rangoFechas', clavesRango: ['date_from', 'date_to'] },
    {
      clave: 'estado_sla',
      etiqueta: 'SLA',
      tipo: 'multiple',
      opciones: [
        { valor: 'en_plazo', etiqueta: SLA.en_plazo.etiqueta },
        { valor: 'en_riesgo', etiqueta: SLA.en_riesgo.etiqueta },
        { valor: 'incumplido', etiqueta: SLA.incumplido.etiqueta }
      ]
    },
    {
      clave: 'aprobacion',
      etiqueta: 'Aprobación',
      tipo: 'seleccion',
      // `no_requiere` es un valor sintetico del backend: cubre los Procesos sin fila de aprobacion y
      // los que la tienen apagada. Un filtro contra `null` no coincidiria con ninguno.
      opciones: [
        { valor: 'no_requiere', etiqueta: 'No requiere' },
        { valor: 'pendiente', etiqueta: 'Pendiente' },
        { valor: 'aprobada', etiqueta: 'Aprobada' },
        { valor: 'rechazada', etiqueta: 'Rechazada' }
      ]
    }
  ],

  // `eta` y `desviacion` van aca ademas de en su columna: sin declararlos, `construirConsulta` poda
  // el `sort` en silencio y la cabecera queda ordenando nada.
  ordenables: ['name', 'due_date', 'start_date', 'date_added', 'priority', 'status', 'completed', 'eta', 'desviacion'],
  ordenPorDefecto: ['completed', '-date_added'],
  busqueda: true,
  includes: ['custom_fields', 'description'],

  tablero: {
    // Las columnas llegan ordenadas por `order`, NO por `id`: el orden real es 1, 4, 3, 2, 5.
    columnasDesde: 'task_statuses',
    rutaMover: 'tasks/:id/mover',
    presentarTarjeta: (fila) => (fila as Proceso).name
  },

  // `status` no esta en el PATCH: se cambia por acciones, porque arrastra cascadas.
  acciones: [
    {
      clave: 'completar',
      etiqueta: 'Marcar completado',
      ruta: 'tasks/:id/actions/mark-complete',
      metodo: 'POST',
      requiere: 'edit'
    },
    { clave: 'reabrir', etiqueta: 'Reabrir', ruta: 'tasks/:id/actions/reopen', metodo: 'POST', requiere: 'edit' },
    { clave: 'arrancarTimer', etiqueta: 'Arrancar cronómetro', ruta: 'tasks/:id/timer', metodo: 'POST' },
    { clave: 'detenerTimer', etiqueta: 'Detener cronómetro', ruta: 'tasks/:id/timer', metodo: 'DELETE' }
  ]
}

/**
 * Nombres de quienes tienen la tarea asignada, recortados para que no rompan la fila.
 *
 * La tabla mostraba la cantidad, que no dice nada: dos tareas con "2" pueden ser de personas
 * distintas. Se muestran los dos primeros y el resto se cuenta.
 *
 * @param proceso La tarea.
 * @returns Los nombres separados por coma, o "Sin asignar" si no hay nadie.
 */
function nombresAsignados (proceso: Proceso): string {
  if (proceso.assignees.length === 0) return 'Sin asignar'

  const visibles = proceso.assignees.slice(0, 2).map((persona) => persona.full_name)
  const restantes = proceso.assignees.length - visibles.length

  return restantes > 0 ? `${visibles.join(', ')} +${restantes}` : visibles.join(', ')
}

/**
 * Columnas de `PROCESOS` que no significan nada dentro de un Espacio.
 *
 * Todas las tareas del listado son de ese Espacio: la columna repetiria el titulo de la pantalla en
 * cada fila.
 */
const COLUMNAS_FUERA_DEL_ESPACIO = ['project']

/**
 * Filtros de `PROCESOS` que no significan nada dentro de un Espacio.
 *
 * `project_id` ofreceria cambiar de Espacio sin cambiar de pantalla. `clientid` es peor: un Espacio
 * es de un solo cliente, asi que el desplegable solo puede devolver todo o nada. Se podan a
 * proposito y no por accidente —el catalogo de clientes ni siquiera baja en esta pantalla—, para que
 * agregarlos vuelva a ser una decision y no un descuido.
 */
const FILTROS_FUERA_DEL_ESPACIO = ['project_id', 'clientid']

/**
 * `PROCESOS` acotado a la pestaña Tareas de un Espacio.
 *
 * **Acotar por la ruta y no por un filtro.** `GET /projects/{id}/tasks` inyecta `filter[project_id]`
 * del lado del backend y acepta el resto de los parametros del listado. Un filtro en la URL quedaria
 * visible, editable y borrable por quien mira: sacarlo dejaria el panel de un Espacio mostrando las
 * tareas de todos.
 *
 * Las columnas son las mismas de la vista global —mismo orden, mismos encabezados— menos las que no
 * aplican: las dos vistas se derivan de una sola lista para que no vuelvan a separarse.
 *
 * @param proyectoId el Espacio que se esta mirando
 * @returns la definicion acotada, sin las celdas ricas todavia
 */
export function procesosDelEspacio (proyectoId: number): DefinicionRecurso<Proceso> {
  return {
    ...PROCESOS,
    ruta: `projects/${encodeURIComponent(String(proyectoId))}/tasks`,
    columnas: PROCESOS.columnas.filter((columna) => !COLUMNAS_FUERA_DEL_ESPACIO.includes(columna.clave)),
    filtros: PROCESOS.filtros.filter((filtro) => !FILTROS_FUERA_DEL_ESPACIO.includes(filtro.clave)),
    // Los campos personalizados son columnas: sin el include, sus celdas llegan vacias.
    incluirSiempre: ['custom_fields']
  }
}
