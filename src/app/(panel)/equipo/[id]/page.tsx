import Link from 'next/link'
import { Suspense, cache } from 'react'
import { AccionesPersona } from '@/componentes/equipo/AccionesPersona'
import { BotonSuplantar } from '@/componentes/equipo/BotonSuplantar'
import { CabeceraPersona } from '@/componentes/equipo/CabeceraPersona'
import { DialogoPermisos } from '@/componentes/equipo/DialogoPermisos'
import { DialogoRoles } from '@/componentes/equipo/DialogoRoles'
import { FichaPersona } from '@/componentes/equipo/FichaPersona'
import { PanelArchivosPersona } from '@/componentes/equipo/PanelArchivosPersona'
import { PanelHistorialPersona } from '@/componentes/equipo/PanelHistorialPersona'
import { PanelHorasPersona } from '@/componentes/equipo/PanelHorasPersona'
import { PanelTrabajoPersona } from '@/componentes/equipo/PanelTrabajoPersona'
import { Cargando, ErrorEstado, SinPermiso, Vacio } from '@/componentes/estado/Estados'
import { Pestanas, type Panel } from '@/componentes/proyecto/Pestanas'
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
 * Ficha de una persona del equipo, con sus cinco pestañas.
 *
 * Las tres ultimas —Horas, Archivos e Historial— piden lo suyo al montarse, y `Pestanas` monta solo
 * la activa: la que nadie abre no cuesta ninguna peticion. Por eso la ficha gano pestañas cuando gano
 * esas tres secciones: apiladas, una visita que solo venia a mirar el correo pagaba tres viajes a la
 * API y bajaba mil filas de historial.
 *
 * El `Suspense` no es decorativo: `Pestanas` usa `useSearchParams`, y sin ese limite el build de la
 * ruta falla.
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

  const paneles: Panel[] = [
    {
      clave: 'ficha',
      etiqueta: 'Ficha',
      contenido: <FichaPersona persona={persona} estadosDeTarea={listaDe(lookups, 'task_statuses')} />
    },
    {
      clave: 'trabajo',
      etiqueta: 'Trabajo',
      contenido: (
        <PanelTrabajoPersona
          personaId={persona.id}
          nombre={persona.firstname}
          estadosDeTarea={listaDe(lookups, 'task_statuses')}
          estadosDeProyecto={listaDe(lookups, 'project_statuses')}
        />
      )
    },
    {
      clave: 'horas',
      etiqueta: 'Horas',
      contenido: <PanelHorasPersona personaId={persona.id} tiempo={persona.tiempo} />
    },
    { clave: 'archivos', etiqueta: 'Archivos', contenido: <PanelArchivosPersona personaId={persona.id} /> },
    {
      clave: 'historial',
      etiqueta: 'Historial',
      contenido: <PanelHistorialPersona personaId={persona.id} nombre={persona.firstname} />
    }
  ]

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CabeceraPersona persona={persona} />
        <div className="flex flex-wrap items-center gap-2">
          <AccionesPersona persona={persona} roles={roles} cargos={cargos} areas={areas} capacidades={capacidades} enFicha />
          {/* Solo un superadministrador reparte los roles: la API rechaza al resto con 422. */}
          {yo.is_superadmin && <DialogoRoles persona={persona} actorId={yo.id} />}
          {/* Ver el panel con la sesion de esta persona. Misma puerta que los roles —la API exige
              superadministrador— y sin sentido sobre uno mismo, asi que en la ficha propia no va. */}
          {yo.is_superadmin && persona.id !== yo.id && (
            <BotonSuplantar personaId={persona.id} nombre={persona.firstname} activa={persona.active} />
          )}
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

      <Suspense fallback={<Cargando alto="min-h-36" mensaje="Cargando la ficha…" />}>
        <Pestanas paneles={paneles} etiqueta="Secciones de la persona" />
      </Suspense>
    </section>
  )
}
