import { Suspense } from 'react'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { EsqueletoRecurrentes } from '@/componentes/recurrencia/EsqueletoRecurrentes'
import { VistaRecurrentes } from '@/componentes/recurrencia/VistaRecurrentes'
import { RUTA_DE_ASIGNABLES } from '@/datos/asignables'
import { cargarLookups } from '@/datos/lookups'
import { pedir, pedirOpcional } from '@/datos/servidor'
import type { Espacio, PersonaAsignable } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'

export const metadata = { title: 'Tareas recurrentes · WiWO Ops' }

/**
 * Tareas recurrentes: las reglas que Ops copia solas, y la carga inicial desde una planilla.
 *
 * El servidor trae solo los catalogos —Proyectos, personas y areas—, que no cambian mientras se mira
 * la pantalla y que el filtro y el importador necesitan desde el primer pintado. La lista de reglas la
 * pide el cliente (`VistaRecurrentes`), porque cambia con cada filtro y cada pausa y se revalida al
 * volver a la pestaña.
 *
 * El `Suspense` no es decorativo: `VistaRecurrentes` monta `ModalTarea`, que lee `useSearchParams`,
 * y sin ese limite el build de la ruta falla.
 */
export default async function RecurrentesPage () {
  const [yo, espacios, equipo, lookups] = await Promise.all([
    pedir<Yo>('/me'),
    pedir<Espacio[]>('/projects?per_page=500'),
    pedirOpcional<PersonaAsignable[]>(`/${RUTA_DE_ASIGNABLES}`),
    cargarLookups()
  ])

  const proyectos = espacios.data.map((espacio) => ({ id: espacio.id, name: espacio.name }))
  const personas = (equipo.datos ?? []).map((persona) => ({ id: persona.id, name: persona.full_name }))

  return (
    <section className="flex flex-col gap-4">
      <TituloModulo
        titulo="Tareas recurrentes"
        descripcion="Define una vez la tarea y cada cuánto se repite: Ops crea cada copia sola, en su fecha."
      />
      <Suspense fallback={<EsqueletoRecurrentes />}>
        <VistaRecurrentes
          proyectos={proyectos}
          personas={personas}
          areas={lookups.areas ?? []}
          capacidades={yo.data.permissions.tasks}
          esAdmin={yo.data.is_admin || yo.data.is_superadmin}
        />
      </Suspense>
    </section>
  )
}
