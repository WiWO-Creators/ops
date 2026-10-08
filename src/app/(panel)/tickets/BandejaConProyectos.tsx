import { Suspense, type ReactElement } from 'react'
import { Cargando } from '@/componentes/estado/Estados'
import { cargarYo, pedirOpcional } from '@/datos/servidor'
import type { Espacio } from '@/datos/recursos'
import { GLOSARIO } from '@/dominio/glosario'
import { BandejaTickets } from './BandejaTickets'

/**
 * Tope de Proyectos para nombrar la columna y armar el filtro. El mismo que usa Tareas: la instalacion
 * tiene unos 280 y el filtro los necesita todos.
 */
const TOPE_PROYECTOS = 500

/**
 * La bandeja con lo que decide su forma, resuelto en el servidor.
 *
 * Es un componente aparte para que la pagina lo envuelva en `Suspense`: el titulo sale de inmediato
 * y solo la bandeja espera a quien mira (sin eso los filtros de departamento y asignado son un 422) y
 * a los nombres de los Proyectos.
 *
 * Los Proyectos van con `pedirOpcional`: un catalogo que no carga deja la columna con el `#id` y el
 * filtro con solo "Sin Proyecto", pero la bandeja sigue abriendo.
 */
export async function BandejaConProyectos (): Promise<ReactElement> {
  const [yo, proyectos] = await Promise.all([
    cargarYo(),
    pedirOpcional<Espacio[]>(`/projects?per_page=${TOPE_PROYECTOS}`)
  ])

  const referencias = (proyectos.datos ?? []).map((p) => ({ id: p.id, name: p.name, clienteId: p.client?.id ?? null }))

  return (
    <Suspense fallback={<Cargando alto="min-h-36" mensaje={`Cargando ${GLOSARIO.ticket.plural.toLowerCase()}…`} />}>
      <BandejaTickets esAdmin={yo.data.is_admin || yo.data.is_superadmin} proyectos={referencias} />
    </Suspense>
  )
}
