import Link from 'next/link'
import { Filas, Seccion, type Dato } from '@/componentes/presentadores/Ficha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { PARAMETRO_TAREA } from '@/componentes/proyecto/CajonTarea'
import { Metrica } from '@/componentes/proyecto/ResumenProyecto'
import { ResumenTareasPersona } from './ResumenTareasPersona'
import { formatearImporte, segundosAHoraMinuto } from '@/componentes/proyecto/formatos'
import { formatearFecha } from '@/lib/fechas'
import type { EstadoLookup, FichaPersona as Persona } from '@/datos/recursos'

/**
 * Nombre en español de cada area de permisos.
 *
 * Las claves son las features de la API (`helpers/staff_helper.php`), y se traducen aca porque son lo
 * unico de la ficha que llega en ingles. Una feature que la API agregue y este mapa no conozca se
 * muestra con su clave cruda: es feo, pero es cierto, y no esconde un permiso que la persona tiene.
 */
const AREAS: Record<string, string> = {
  tasks: 'Tareas',
  projects: 'Proyectos',
  customers: 'Clientes',
  staff: 'Equipo',
  invoices: 'Facturas',
  payments: 'Pagos',
  estimates: 'Cotizaciones',
  proposals: 'Propuestas',
  expenses: 'Gastos',
  contracts: 'Contratos',
  leads: 'Prospectos',
  tickets: 'Tickets',
  items: 'Ítems',
  // Estas cuatro no estan en el catalogo de la API: las escriben modulos del panel viejo, y aparecen
  // igual en `tblstaff_permissions` de gente real.
  knowledge_base: 'Base de conocimiento',
  reports: 'Reportes',
  goals: 'Metas',
  prchat: 'Chat interno'
}

/** Nombre en español de cada capacidad. Misma regla que `AREAS` con las que no estan. */
const CAPACIDADES: Record<string, string> = {
  view: 'ver',
  view_own: 'ver lo propio',
  create: 'crear',
  edit: 'editar',
  delete: 'borrar',
  create_milestones: 'crear hitos',
  edit_milestones: 'editar hitos',
  delete_milestones: 'borrar hitos',
  edit_timesheet: 'editar horas',
  edit_own_timesheet: 'editar sus horas',
  delete_timesheet: 'borrar horas',
  delete_own_timesheet: 'borrar sus horas',
  view_all_templates: 'ver todas las plantillas',
  'view-timesheets': 'ver hojas de horas'
}

/**
 * Todo lo que la API sabe de una persona, agrupado por para que sirve.
 *
 * Los cuatro bloques de arriba son metricas porque son numeros que se comparan entre si —cuanto
 * trabajo tiene encima y cuanto tiempo registro—; el resumen por estado los abre, y lo de abajo son
 * datos de legajo, que se leen de a uno.
 *
 * Las secciones sin datos no se dibujan, salvo Permisos: una persona sin ninguno es justamente el
 * caso que hay que poder ver, porque explica por que no encuentra nada al entrar.
 *
 * @param persona La ficha ya cargada.
 * @param estadosDeTarea Catalogo `task_statuses`, para nombrar y colorear el resumen por estado.
 * @returns Las metricas y las secciones de la ficha.
 */
export function FichaPersona ({
  persona,
  estadosDeTarea
}: {
  persona: Persona
  estadosDeTarea: EstadoLookup[]
}) {
  const { tiempo, counts } = persona
  const corriendo = tiempo.corriendo

  return (
    <div className="flex flex-col gap-6">
      <div className="grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metrica etiqueta="Tareas abiertas" valor={String(counts.tareas_abiertas)} />
        <Metrica etiqueta="Proyectos" valor={String(counts.espacios)} />
        <Metrica etiqueta="Horas este mes" valor={segundosAHoraMinuto(tiempo.este_mes_segundos)} />
        <Metrica etiqueta="Horas registradas" valor={segundosAHoraMinuto(tiempo.total_segundos)} />
      </div>

      {corriendo !== null && (
        <p className="text-texto flex flex-wrap items-center gap-2 text-sm">
          <Insignia tono="aviso">Cronómetro corriendo</Insignia>
          <span className="text-texto-tenue">
            desde hace {segundosAHoraMinuto(corriendo.segundos)} en{' '}
            <Link
              href={`/procesos?${PARAMETRO_TAREA}=${corriendo.task_id}`}
              className="text-acento underline underline-offset-4"
            >
              {corriendo.task_name ?? `#${corriendo.task_id}`}
            </Link>
          </span>
        </p>
      )}

      <ResumenTareasPersona contadores={counts} estados={estadosDeTarea} />

      <div className="grid max-w-5xl gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
        <Seccion titulo="Cuenta">
          <Filas datos={datosDeCuenta(persona)} />
        </Seccion>

        <Seccion titulo="Tiempo registrado">
          <Filas
            datos={[
              { etiqueta: 'Esta semana', valor: segundosAHoraMinuto(tiempo.esta_semana_segundos) },
              { etiqueta: 'Este mes', valor: segundosAHoraMinuto(tiempo.este_mes_segundos) },
              { etiqueta: 'Total', valor: segundosAHoraMinuto(tiempo.total_segundos) }
            ]}
          />
        </Seccion>

        {persona.departments.length > 0 && (
          <Seccion titulo="Departamentos">
            <Filas
              datos={persona.departments.map((departamento) => ({
                etiqueta: departamento.name,
                valor: ''
              }))}
            />
          </Seccion>
        )}

        <div className="sm:col-span-2 lg:col-span-3">
          <Seccion titulo="Permisos">
            <Permisos persona={persona} />
          </Seccion>
        </div>
      </div>
    </div>
  )
}

/**
 * Las filas del bloque Cuenta.
 *
 * `last_activity` la escribe solo el panel viejo: se rotula como tal para que un guion no se lea como
 * "no trabaja", cuando lo que dice es "no entra al panel".
 *
 * @param persona La ficha cargada.
 * @returns Las filas con valor ya formateado.
 */
function datosDeCuenta (persona: Persona): Dato[] {
  return [
    { etiqueta: 'Rol', valor: persona.role?.name ?? 'Sin rol' },
    { etiqueta: 'Cargo', valor: persona.cargo?.name ?? 'Sin cargo' },
    { etiqueta: 'Área', valor: persona.area?.name ?? 'Sin área' },
    { etiqueta: 'Valor hora', valor: formatearImporte(persona.hourly_rate) },
    { etiqueta: 'Cuenta creada', valor: formatearFecha(persona.date_created) },
    { etiqueta: 'Último acceso', valor: persona.last_login === null ? 'Nunca' : formatearFecha(persona.last_login, true) },
    { etiqueta: 'Última actividad en el panel', valor: persona.last_activity === null ? 'Nunca' : formatearFecha(persona.last_activity, true) },
    { etiqueta: 'Segundo factor', valor: persona.two_factor_enabled ? 'Activado' : 'Desactivado' }
  ]
}

/**
 * Los permisos efectivos de la persona, un area por linea.
 *
 * A un administrador la API le devuelve el catalogo completo, y por eso se lo dice con todas las
 * letras en vez de dejar creer que alguien se los cargo uno por uno.
 */
function Permisos ({ persona }: { persona: Persona }) {
  const areas = Object.entries(persona.permissions).filter(([, capacidades]) => capacidades.length > 0)

  if (areas.length === 0) {
    return (
      <p className="text-texto-tenue text-sm">
        No tiene ningún permiso cargado: al entrar no va a ver ninguna sección.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {persona.is_admin && (
        <p className="text-texto-sutil text-xs">Es administrador: tiene todo, sin depender de su rol.</p>
      )}

      {/* En tres columnas, y no en una: son doce areas, y apiladas convierten la ficha en una torre
          de permisos con el resto de los datos perdido arriba. */}
      <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map(([area, capacidades]) => (
          <Filas
            key={area}
            datos={[{
              etiqueta: AREAS[area] ?? area,
              valor: capacidades.map((capacidad) => CAPACIDADES[capacidad] ?? capacidad).join(', ')
            }]}
          />
        ))}
      </div>
    </div>
  )
}
