import Link from 'next/link'
import { cache } from 'react'
import { AccionesPersona } from '@/componentes/equipo/AccionesPersona'
import { CabeceraPersona } from '@/componentes/equipo/CabeceraPersona'
import { DialogoPermisos } from '@/componentes/equipo/DialogoPermisos'
import { FichaPersona } from '@/componentes/equipo/FichaPersona'
import { PanelTrabajoPersona } from '@/componentes/equipo/PanelTrabajoPersona'
import { ErrorEstado, SinPermiso, Vacio } from '@/componentes/estado/Estados'
import type { OpcionCampo } from '@/componentes/proyecto/formulario'
import { listaDe } from '@/datos/catalogos'
import { ErrorApi } from '@/datos/errores'
import { cargarLookups } from '@/datos/lookups'
import { pedir } from '@/datos/servidor'
import type { AreaDeCatalogo, FichaPersona as Persona, Lookups } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'

/**
 * Pide la persona una sola vez por peticion.
 *
 * `generateMetadata` y la pagina corren en la misma peticion y necesitan el mismo recurso; sin
 * `cache` serian dos llamadas a la API por cada visita.
 */
const traerPersona = cache(async (id: string) => {
  return await pedir<Persona>(`/staff/${id}`)
})

/**
 * Titulo de la pestaña del navegador.
 *
 * Un `ErrorApi` no puede tumbar la metadata: la pagina ya muestra el estado que corresponda. Todo lo
 * demas se relanza — `pedir` señaliza la sesion vencida con el `redirect` de Next, que viaja como
 * excepcion y tragarlo dejaria a la persona mirando una pantalla en blanco.
 */
export async function generateMetadata (props: PageProps<'/equipo/[id]'>) {
  const { id } = await props.params

  try {
    const { data } = await traerPersona(id)

    return { title: `${data.full_name} · WiWO Ops` }
  } catch (error) {
    if (!(error instanceof ErrorApi)) throw error

    return { title: 'Equipo · WiWO Ops' }
  }
}

interface Detalle {
  persona: Persona
  lookups: Lookups
  yo: Yo
}

/**
 * Carga lo que la pantalla necesita para pintarse: la ficha, los catalogos y quien mira.
 *
 * Las Tareas y los Proyectos de la persona NO se piden aca: los pide `PanelTrabajoPersona` al
 * montarse, para que una visita que solo venia a mirar el correo no pague dos viajes mas. Los
 * catalogos si, porque de ellos salen los nombres de estado de esas dos tablas y el de los roles del
 * formulario de edicion.
 *
 * @param id id de la persona tal como viene de la ruta
 * @returns el detalle, o el `ErrorApi` que impidio cargarlo
 */
async function cargarDetalle (id: string): Promise<Detalle | ErrorApi> {
  try {
    const [persona, lookups, yo] = await Promise.all([
      traerPersona(id),
      cargarLookups(),
      pedir<Yo>('/me')
    ])

    return { persona: persona.data, lookups, yo: yo.data }
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}

/**
 * Trae el catalogo de permisos, o `null` si esta pantalla no puede ofrecerlo.
 *
 * `GET /roles/catalogo` exige `roles.view`: quien administra gente pero no roles ve la ficha entera y
 * simplemente no ve el boton de permisos. Por eso el error es un `null` y no una pantalla de error —
 * el catalogo es para una accion opcional, no para pintar la ficha.
 *
 * Solo se pide a quien puede editar personas: al resto le sobra el viaje.
 *
 * @param puedeEditar `true` si quien mira tiene `staff.edit`.
 * @returns Las areas del catalogo, o `null` si no se pidio o la API dijo que no.
 */
async function cargarCatalogoDePermisos (puedeEditar: boolean): Promise<AreaDeCatalogo[] | null> {
  if (!puedeEditar) return null

  try {
    const { data } = await pedir<AreaDeCatalogo[]>('/roles/catalogo')

    return data
  } catch (error) {
    if (error instanceof ErrorApi) return null

    throw error
  }
}

/** Estado de persona inexistente: la API respondio 404 o el id de la URL no es de nadie. */
function NoEncontrada () {
  return (
    <Vacio
      titulo="Esa persona no existe"
      descripcion="Puede que hayan borrado su cuenta, o que el enlace esté mal escrito."
      accion={
        <Link href="/equipo" className="text-acento text-sm font-semibold underline underline-offset-4">
          Volver a Equipo
        </Link>
      }
    />
  )
}

/**
 * Ficha de una persona del equipo.
 *
 * Sin pestañas, a diferencia de Cliente y Proyecto: una persona son dos bloques —quien es y que tiene
 * encima—, y repartirlos en pestañas obligaria a hacer clic para ver la mitad de una pantalla corta.
 */
export default async function PersonaPage (props: PageProps<'/equipo/[id]'>) {
  const { id } = await props.params
  const detalle = await cargarDetalle(id)

  if (detalle instanceof ErrorApi) {
    if (detalle.codigo === 'not_found') return <NoEncontrada />
    if (detalle.codigo === 'forbidden') return <SinPermiso />

    return <ErrorEstado detalle={detalle.message} />
  }

  const { persona, lookups, yo } = detalle
  const capacidades = yo.permissions.staff
  const catalogoDePermisos = await cargarCatalogoDePermisos(capacidades.includes('edit'))
  const roles: OpcionCampo[] = listaDe(lookups, 'roles').map((rol) => ({
    valor: String(rol.id),
    etiqueta: rol.name
  }))
  const cargos: OpcionCampo[] = listaDe(lookups, 'cargos').map((cargo) => ({
    valor: String(cargo.id),
    etiqueta: cargo.name
  }))
  const areas: OpcionCampo[] = listaDe(lookups, 'areas').map((area) => ({
    valor: String(area.id),
    etiqueta: area.name
  }))

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CabeceraPersona persona={persona} />
        <div className="flex flex-wrap items-center gap-2">
          <AccionesPersona persona={persona} roles={roles} cargos={cargos} areas={areas} capacidades={capacidades} enFicha />
          {catalogoDePermisos !== null && (
            <DialogoPermisos
              persona={persona}
              catalogo={catalogoDePermisos}
              permisosDelActor={yo.permissions}
              actorEsAdmin={yo.is_admin}
            />
          )}
        </div>
      </div>

      <FichaPersona persona={persona} />

      <PanelTrabajoPersona
        personaId={persona.id}
        nombre={persona.firstname}
        estadosDeTarea={listaDe(lookups, 'task_statuses')}
        estadosDeProyecto={listaDe(lookups, 'project_statuses')}
      />
    </section>
  )
}
