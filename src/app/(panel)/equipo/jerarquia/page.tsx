import { Suspense } from 'react'
import { Organigrama } from '@/componentes/organigrama/Organigrama'
import { VistaOrganizacion } from '@/componentes/organizacion/VistaOrganizacion'
import { Cargando, ErrorEstado, SinPermiso } from '@/componentes/estado/Estados'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { ErrorApi } from '@/datos/errores'
import { cargarCatalogosDeTareas } from '@/datos/lookups'
import { cargarOrganigrama } from '@/datos/organigrama-servidor'
import { cargarYo, pedir } from '@/datos/servidor'
import type { CatalogoDeAccesos } from '@/datos/accesos'
import type { Yo } from '@/datos/tipos'

export const metadata = { title: 'Organización · WiWO Ops' }

/**
 * Trae el catálogo de accesos, o el error de la API como valor.
 *
 * Separada de la página para no construir JSX dentro del `try`: el lint del proyecto rechaza un
 * `catch` que envuelva render.
 */
async function cargarCatalogo (): Promise<CatalogoDeAccesos | ErrorApi> {
  try {
    const { data } = await pedir<CatalogoDeAccesos>('/accesos/catalogo')

    return data
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}

/**
 * Organización: el organigrama de la casa y, para superadministración, todo lo que lo administra.
 *
 * Unifica las dos pantallas que había —Jerarquías y `/administracion/accesos`—, que editaban a la
 * misma gente con el mismo endpoint y se veían distinto. Quien no es superadministrador ve el mismo
 * organigrama de siempre, **el mismo componente que `/equipo/mi-area`**: la API ya le recorta lo que
 * le toca (`GET /organigrama`) y no hay una segunda copia de esa regla acá. Quien lo es suma las
 * pestañas de administración (`VistaOrganizacion`).
 *
 * `is_superadmin` decide qué se monta, no qué se autoriza: todas las rutas de `/accesos` exigen
 * superadministrador en la API, que es la compuerta real.
 */
export default async function OrganizacionPage () {
  const [{ data: yo }, cargado, catalogos] = await Promise.all([
    cargarYo(), cargarOrganigrama(), cargarCatalogosDeTareas()
  ])

  const catalogo = yo.is_superadmin ? await cargarCatalogo() : null

  return (
    <section className="flex flex-col gap-4">
      <TituloModulo
        titulo="Organización"
        descripcion={yo.is_superadmin
          ? 'El organigrama y todo lo que lo administra: personas, áreas, cargos, roles e historial de cambios. Cada persona se edita en su panel, con todo junto.'
          : 'El organigrama del equipo: un mapa con todas las áreas y, al entrar en una, el árbol de quién depende de quién. El color del borde de cada caja es su área.'}
      />

      <ContenidoDeOrganizacion yo={yo} cargado={cargado} catalogo={catalogo} catalogos={catalogos} />
    </section>
  )
}

/** Lo que va debajo del título, según quién mira y qué respondió la API. */
function ContenidoDeOrganizacion ({
  yo, cargado, catalogo, catalogos
}: {
  yo: Yo
  cargado: Awaited<ReturnType<typeof cargarOrganigrama>>
  catalogo: CatalogoDeAccesos | ErrorApi | null
  catalogos: Awaited<ReturnType<typeof cargarCatalogosDeTareas>>
}) {
  if (cargado instanceof ErrorApi) {
    return cargado.codigo === 'forbidden' ? <SinPermiso /> : <ErrorEstado detalle={cargado.message} />
  }

  if (catalogo === null || catalogo instanceof ErrorApi) {
    return (
      <>
        {catalogo instanceof ErrorApi && (
          <ErrorEstado detalle={`No se pudo abrir la administración: ${catalogo.message}. Se muestra solo el organigrama.`} />
        )}
        <Organigrama inicial={cargado} catalogos={catalogos} />
      </>
    )
  }

  // El `Suspense` no es decorativo: `Pestanas` usa `useSearchParams`, y sin ese límite el build falla.
  return (
    <Suspense fallback={<Cargando alto="min-h-36" mensaje="Cargando la organización…" />}>
      <VistaOrganizacion catalogo={catalogo} organigrama={cargado} catalogos={catalogos} actorId={yo.id} />
    </Suspense>
  )
}
