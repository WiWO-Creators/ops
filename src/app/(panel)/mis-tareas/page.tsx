import { Suspense } from 'react'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { ModalTarea } from '@/componentes/proyecto/ModalTarea'
import { TareasAsignadas } from '@/componentes/mis-tareas/TareasAsignadas'
import { TareasPrivadas } from '@/componentes/mis-tareas/TareasPrivadas'
import { cargarLookups, listaDe } from '@/datos/lookups'
import { pedir, pedirOpcional } from '@/datos/servidor'
import type { Licitacion } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'
import { GLOSARIO } from '@/dominio/glosario'
import { SOLO_CON_ESPACIO } from '@/dominio/mis-tareas'

export const metadata = { title: 'Mis Tareas · WiWO Ops' }

/** Cuantas Licitaciones se traen para poder distinguirlas de un Proyecto. Ver `licitacionesDeLaCasa`. */
const LICITACIONES_A_TRAER = 500

/**
 * Mis Tareas: la hoja de todas las asignaciones de quien mira.
 *
 * Es lo que el bloque "Mi trabajo" de `/inicio` no podia ser: ahi entran los proximos vencimientos
 * con un tope y sin paginar, porque es una portada. Aca entra **todo** lo que esta asignado, en dos
 * listas que paginan por separado.
 *
 * Las dos listas responden al reclamo que le dio origen al modulo —"las tareas de clientes y las de
 * licitaciones estaban mezcladas"— de la unica forma en que se puede: la agregacion sale gratis
 * porque una Licitacion **es** un Espacio, asi que lo que hay que agregar no es la suma sino la
 * distincion. La hace la columna "Origen", que dice de cada fila si viene de una Licitacion, de un
 * Proyecto o de ningun lado.
 *
 * Completadas fuera: `GET /tasks` las excluye por defecto cuando no viaja un filtro de estado. Una
 * hoja de trabajo que arranca con el archivo de lo ya hecho no sirve para trabajar; lo terminado se
 * consulta en `/procesos`, que si tiene el filtro.
 */
export default async function MisTareasPage () {
  const { data: yo } = await pedir<Yo>('/me')
  const [lookups, licitaciones] = await Promise.all([cargarLookups(), licitacionesDeLaCasa(yo)])
  const estados = listaDe(lookups, 'task_statuses')

  return (
    <section className="flex flex-col gap-8">
      <TituloModulo
        titulo={`Mis ${GLOSARIO.proceso.plural}`}
        descripcion={`Todo lo que tienes asignado, con el origen de cada ${GLOSARIO.proceso.singular.toLowerCase()} a la vista.`}
      />

      <TareasAsignadas
        personaId={yo.id}
        titulo={`De ${GLOSARIO.espacio.plural} y ${GLOSARIO.licitacion.plural}`}
        estados={estados}
        consultaExtra={SOLO_CON_ESPACIO}
        licitaciones={licitaciones}
        rutaDetalle="/mis-tareas"
        vacio={{
          titulo: `No tienes ${GLOSARIO.proceso.plural.toLowerCase()} asignadas`,
          descripcion: `Cuando te asignen la primera va a aparecer acá, con su estado, su origen y su fecha de entrega.`
        }}
      />

      <TareasPrivadas personaId={yo.id} estados={estados} rutaDetalle="/mis-tareas" />

      {/* El mismo detalle de los listados, con la misma URL (`?tarea={id}`). Va en un limite de
          Suspense porque lee `useSearchParams`: sin el, el build de esta pagina falla. */}
      <Suspense fallback={null}>
        <ModalTarea
          puedeEditar={yo.permissions.tasks.includes('edit')}
          puedeBorrar={yo.permissions.tasks.includes('delete')}
        />
      </Suspense>
    </section>
  )
}

/**
 * Que ids de Espacio son Licitaciones.
 *
 * Es la unica forma de distinguirlas: una Licitacion y su Espacio son la misma fila, asi que sus
 * Tareas llegan indistinguibles de las de un Proyecto. Se pide entero y no paginado porque lo que
 * hace falta es el conjunto, no una pagina de el — con media lista, media hoja diria "Proyecto"
 * sobre una Licitacion, que es peor que no distinguir nada.
 *
 * Va por `pedirOpcional` y detras de la bandera de instalacion: sin el modulo de Prospectos la API
 * responde 404 o 403, y eso no puede tumbar la hoja de trabajo de nadie. Sin la lista todo se lee
 * como Proyecto, que es como se leia antes de que este modulo existiera.
 *
 * @param yo La sesion, por su lista de secciones habilitadas.
 * @returns Los ids de Espacio de las Licitaciones, o una lista vacia.
 */
async function licitacionesDeLaCasa (yo: Yo): Promise<number[]> {
  if (!yo.secciones_habilitadas.includes('prospectos')) return []

  const { datos } = await pedirOpcional<Licitacion[]>(`/licitaciones?per_page=${LICITACIONES_A_TRAER}`)

  // `licitacion.id` ES el id del Espacio: son la misma fila vista desde dos lados.
  return (datos ?? []).map((licitacion) => licitacion.id)
}
