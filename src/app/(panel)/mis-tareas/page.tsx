import { Suspense } from 'react'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { BotonCompletadas } from '@/componentes/mis-tareas/BotonCompletadas'
import { ModalTarea } from '@/componentes/proyecto/ModalTarea'
import { TareasAsignadas } from '@/componentes/mis-tareas/TareasAsignadas'
import { TareasPrivadas } from '@/componentes/mis-tareas/TareasPrivadas'
import { paramsDeUrl } from '@/datos/consulta'
import { cargarLookups, listaDe } from '@/datos/lookups'
import { pedir, pedirOpcional } from '@/datos/servidor'
import type { Licitacion } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'
import { GLOSARIO } from '@/dominio/glosario'
import { seVenCompletadas, SOLO_CON_ESPACIO } from '@/dominio/mis-tareas'

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
 * Completadas fuera **por defecto**: `GET /tasks` las excluye cuando no viaja un filtro de estado.
 * Una hoja de trabajo que arranca con el archivo de lo ya hecho no sirve para trabajar. Pero
 * esconderlas del todo dejaba sin arreglo el error mas comun —marcar Completo lo que no lo estaba—,
 * porque la Tarea desaparecia de la unica pantalla donde su dueño la miraba. Por eso el interruptor
 * "Ver completadas" las SUMA a las dos listas, con el estado en la URL para que sobreviva al
 * refresco, y la insignia de estado de cada fila es un menu para devolverla a donde iba.
 */
export default async function MisTareasPage (props: PageProps<'/mis-tareas'>) {
  const { data: yo } = await pedir<Yo>('/me')
  const [lookups, licitaciones] = await Promise.all([cargarLookups(), licitacionesDeLaCasa(yo)])
  const estados = listaDe(lookups, 'task_statuses')
  const verCompletadas = seVenCompletadas(paramsDeUrl(await props.searchParams))

  return (
    <section className="flex flex-col gap-8">
      <TituloModulo
        titulo={`Mis ${GLOSARIO.proceso.plural}`}
        descripcion={`Todo lo que tienes asignado, con el origen de cada ${GLOSARIO.proceso.singular.toLowerCase()} a la vista.`}
        // El interruptor manda sobre las DOS listas, asi que vive en el encabezado de la pantalla y
        // no en una de ellas. Va en un limite de Suspense por el mismo motivo que el modal: lee
        // `useSearchParams`, y sin el limite el build de esta pagina falla.
        acciones={
          <Suspense fallback={null}>
            <BotonCompletadas />
          </Suspense>
        }
      />

      <TareasAsignadas
        personaId={yo.id}
        titulo={`De ${GLOSARIO.espacio.plural} y ${GLOSARIO.licitacion.plural}`}
        estados={estados}
        consultaExtra={SOLO_CON_ESPACIO}
        licitaciones={licitaciones}
        rutaDetalle="/mis-tareas"
        // Son las Tareas de quien mira: el estado se cambia desde la fila. Ver `estadoEditable`.
        estadoEditable
        verCompletadas={verCompletadas}
        vacio={{
          titulo: `No tienes ${GLOSARIO.proceso.plural.toLowerCase()} asignadas`,
          descripcion: `Cuando te asignen la primera va a aparecer acá, con su estado, su origen y su fecha de entrega.`
        }}
      />

      <TareasPrivadas
        personaId={yo.id}
        estados={estados}
        rutaDetalle="/mis-tareas"
        verCompletadas={verCompletadas}
      />

      {/* El mismo detalle de los listados, con la misma URL (`?tarea={id}`). Va en un limite de
          Suspense porque lee `useSearchParams`: sin el, el build de esta pagina falla. */}
      <Suspense fallback={null}>
        <ModalTarea
          puedeEditar={yo.permissions.tasks.includes('edit')}
          puedeBorrar={yo.permissions.tasks.includes('delete')}
          puedeCrear={yo.permissions.tasks.includes('create')}
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
