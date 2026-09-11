import { Segmentado } from '@/componentes/formularios/Segmentado'
import { construirConsulta, leerConsulta, paramsDeUrl } from '@/datos/consulta'
import { RUTA_DE_ASIGNABLES } from '@/datos/asignables'
import { pedir, pedirOpcional } from '@/datos/servidor'
import { esDiaValido, leerVista, rangoDeVista, TOPE_POR_VISTA } from '@/dominio/calendario'
import { hoyLocal } from '@/lib/fechas'
import { PROCESOS } from '@/definiciones/procesos'
import type { Espacio, PersonaAsignable, Proceso, ProcesoConAviso } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'
import { VistaCalendario } from '@/componentes/datos/VistaCalendario'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'

export const metadata = { title: 'Calendario de Tareas · WiWO Ops' }

/**
 * Calendario de Tareas: dia y semana.
 *
 * Todo se resuelve en el servidor, como la agenda de Salas: la grilla no tiene estado propio que
 * valga la pena hidratar, y pedir las tareas desde el navegador agregaria un parpadeo a una pantalla
 * que se mira de paso.
 *
 * **No hay endpoint nuevo.** El periodo se resuelve con los rangos que `GET /tasks` ya acepta
 * (`filter[date_from]` / `filter[date_to]` sobre el vencimiento), y las alertas con
 * `GET /me/vencimientos`. La paginacion de esta API se pide con `per_page`, no con `limit`.
 *
 * **Dos peticiones de tareas y no una.** La segunda pregunta por lo que EMPIEZA en el periodo
 * (`filter[start_from]` / `filter[start_to]`) y se queda con lo que no tiene vencimiento: los rangos
 * de fecha comparan contra una columna, asi que una tarea con `duedate` en NULL no entra en la
 * primera consulta y desapareceria sin decir nada. Pedir los cuatro filtros juntos no sirve: se
 * combinan con AND y acotarian a lo que empieza **y** vence dentro del rango.
 *
 * **Nada tumba la pantalla.** Los cuatro pedidos van con `pedirOpcional`: si la API falla, la vista lo
 * dice —el listado con su estado de error, las alertas con una linea— en vez de quedar en blanco.
 */
export default async function CalendarioProcesosPage (props: PageProps<'/procesos/calendario'>) {
  const params = paramsDeUrl(await props.searchParams)
  const estado = leerConsulta(params, PROCESOS)
  const vista = leerVista(params.get('vista'))

  const pedido = params.get('dia') ?? ''
  const dia = esDiaValido(pedido) ? pedido : hoyLocal()

  // `dia` ya paso por `esDiaValido`, asi que el rango nunca es null; el `??` es para el tipo.
  const rango = rangoDeVista(dia, vista) ?? { desde: dia, hasta: dia }

  const espacioElegido = estado.filtros.project_id?.[0] ?? null
  // `assignee` es un parametro suelto de la API, no un `filter[...]`: no pasa por `construirConsulta`
  // y por eso se lee y se valida aca. Un valor no numerico devuelve 422, asi que se descarta antes.
  const crudoAsignado = params.get('assignee') ?? ''
  const asignadoElegido = /^\d+$/.test(crudoAsignado) ? crudoAsignado : null

  const comunes = new URLSearchParams({ per_page: String(TOPE_POR_VISTA) })
  if (espacioElegido !== null) comunes.set('filter[project_id]', espacioElegido)
  if (asignadoElegido !== null) comunes.set('assignee', asignadoElegido)

  const porVencer = new URLSearchParams(comunes)
  porVencer.set('filter[date_from]', rango.desde)
  porVencer.set('filter[date_to]', rango.hasta)
  porVencer.set('sort', 'due_date')

  const porEmpezar = new URLSearchParams(comunes)
  porEmpezar.set('filter[start_from]', rango.desde)
  porEmpezar.set('filter[start_to]', rango.hasta)
  porEmpezar.set('sort', 'start_date')

  const [tareas, arrancan, avisos, espacios, equipo, yo] = await Promise.all([
    pedirOpcional<Proceso[]>(`/tasks?${porVencer.toString()}`),
    pedirOpcional<Proceso[]>(`/tasks?${porEmpezar.toString()}`),
    pedirOpcional<ProcesoConAviso[]>('/me/vencimientos'),
    // El mismo catalogo que llena el filtro de Espacio en la tabla y en el tablero.
    pedirOpcional<Espacio[]>('/projects?per_page=500'),
    // `/staff/asignables` y no `/staff`: el segundo exige `staff.view` y le contesta 403 a casi todo
    // el equipo, que veria el filtro de persona vacio.
    pedirOpcional<PersonaAsignable[]>(`/${RUTA_DE_ASIGNABLES}`),
    pedir<Yo>('/me')
  ])

  const delPeriodo = tareas.datos ?? []
  // La API no ofrece "vencimiento vacio" como filtro, asi que se separa aca sobre lo que arranca en
  // el periodo. Es una lista corta: ya viene acotada por el rango y por los filtros de la vista.
  const sinVencimiento = (arrancan.datos ?? []).filter((tarea) => tarea.due_date === null)

  // Los filtros viajan de vuelta a la tabla y al tablero, sin orden ni pagina: es lo mismo que hacen
  // esas dos pantallas entre si. `assignee` no viaja porque ninguna de las dos lo tiene.
  //
  // El filtro "Vence" de la tabla se descarta: en el calendario ese rango ES el periodo, y dejarlo
  // en la URL pondria un `filter[date_from]` que no filtra nada de lo que se ve y que ademas volveria
  // a la tabla como si la persona lo hubiera puesto aca.
  const { vence: _vence, ...filtrosSinRango } = estado.filtros
  const consulta = construirConsulta({ ...estado, filtros: filtrosSinRango, orden: [], pagina: 1 }, PROCESOS)

  return (
    <section className="flex flex-col gap-4">
      <TituloModulo
        titulo={`Calendario de ${PROCESOS.titulo.plural}`}
        acciones={
          <Segmentado
            etiqueta={`Presentación de ${PROCESOS.titulo.plural.toLowerCase()}`}
            tamano="medio"
            activo="calendario"
            opciones={[
              { valor: 'tabla', etiqueta: 'Tabla', icono: 'tabla', href: `/procesos${consulta === '' ? '' : `?${consulta}`}` },
              {
                valor: 'tablero',
                etiqueta: 'Tablero',
                icono: 'tablero',
                href: `/procesos/tablero${consulta === '' ? '' : `?${consulta}`}`
              },
              { valor: 'calendario', etiqueta: 'Calendario', icono: 'calendario', href: '/procesos/calendario' }
            ]}
          />
        }
      />

      <VistaCalendario
        dia={dia}
        vista={vista}
        tareas={delPeriodo}
        sinVencimiento={sinVencimiento}
        errorSinVencimiento={arrancan.error}
        avisos={avisos.datos ?? []}
        errorTareas={tareas.error}
        errorAvisos={avisos.error}
        espacios={(espacios.datos ?? []).map((espacio) => ({ valor: String(espacio.id), etiqueta: espacio.name }))}
        personas={(equipo.datos ?? []).map((persona) => ({ valor: String(persona.id), etiqueta: persona.full_name }))}
        espacioElegido={espacioElegido}
        asignadoElegido={asignadoElegido}
        truncado={delPeriodo.length >= TOPE_POR_VISTA}
        capacidades={yo.data.permissions.tasks}
      />
    </section>
  )
}
