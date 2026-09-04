import type { DefinicionRecurso } from './tipos.ts'
import type { Proceso } from '../datos/recursos.ts'
import { GLOSARIO } from '../dominio/glosario.ts'
import { formatearFecha } from '../lib/fechas.ts'
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
export const PROCESOS: DefinicionRecurso<Proceso> = {
  ruta: 'tasks',
  titulo: GLOSARIO.proceso,

  columnas: [
    { clave: 'name', encabezado: 'Nombre', ordenPor: 'name', presentar: (p) => p.name },
    { clave: 'status', encabezado: 'Estado', ordenPor: 'status', comoInsignia: 'task_statuses', presentar: (p) => p.status },
    { clave: 'priority', encabezado: 'Prioridad', ordenPor: 'priority', comoInsignia: 'task_priorities', presentar: (p) => p.priority },
    { clave: 'project', encabezado: GLOSARIO.espacio.singular, presentar: (p) => p.project?.name ?? '' },
    { clave: 'assignees', encabezado: 'Asignados', presentar: (p) => nombresAsignados(p) },
    { clave: 'due_date', encabezado: 'Vence', ordenPor: 'due_date', presentar: (p) => formatearFecha(p.due_date) },
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
    { clave: 'project_id', etiqueta: GLOSARIO.espacio.singular, tipo: 'seleccion' },
    { clave: 'milestone_id', etiqueta: 'Hito', tipo: 'seleccion' },
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
