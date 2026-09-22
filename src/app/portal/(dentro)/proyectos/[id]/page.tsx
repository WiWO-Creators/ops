import type { Metadata } from 'next'
import { cache } from 'react'
import { Pestanas, type Panel } from '@/componentes/proyecto/Pestanas'
import { ErrorApi } from '@/datos/errores'
import type { EspacioPortal, TableroDelProyecto as Tablero, TareaPortal } from '@/datos/portal'
import { pestaniasDelProyecto } from '@/definiciones/portal-proyectos'
import { CabeceraProyecto } from '@/componentes/proyecto/CabeceraProyecto'
import { PanelActas } from '@/componentes/proyecto/PanelActas'
import { PanelActividad } from '@/componentes/proyecto/PanelActividad'
import { PanelArchivos } from '@/componentes/proyecto/PanelArchivos'
import { PanelCalendario } from '@/componentes/proyecto/PanelCalendario'
import { PanelDescripcion } from '@/componentes/proyecto/PanelDescripcion'
import { PanelGantt } from '@/componentes/proyecto/PanelGantt'
import { PanelHitos } from '@/componentes/proyecto/PanelHitos'
import { PanelTareas } from '@/componentes/proyecto/PanelTareas'
import { PanelTiempos } from '@/componentes/proyecto/PanelTiempos'
import { Vacio } from '@/componentes/estado/Estados'
import { aTextoPlano } from '@/componentes/proyecto/formatos'
import { cargarLookupsDelPortal, listaDe } from '@/datos/lookups'
import { pedirPortal } from '@/datos/servidor'
import type { EmpresaPortal } from '@/datos/tipos'
import { GLOSARIO } from '@/dominio/glosario'
import { fuenteDelPortal, type FuenteDeProyecto } from '@/dominio/fuente-proyecto'
import { proyectoDelPortal } from '@/dominio/proyecto'
import { TableroDelProyecto } from '@/componentes/portal/TableroDelProyecto'
import { cargarDetalle, EstadoDeError, estadoDelPortal, sinFallar } from '../../detalle'
import { AprobacionesPendientes } from './AprobacionesPendientes'

/**
 * Detalle de un proyecto, con las pestañas que el equipo compartio.
 *
 * `cache()` evita que `generateMetadata` y la pagina pidan el proyecto dos veces en la misma
 * peticion.
 */
const cargarProyecto = cache(async (id: string) => await cargarDetalle<EspacioPortal>(`/portal/projects/${id}`))

export async function generateMetadata (props: PageProps<'/portal/proyectos/[id]'>): Promise<Metadata> {
  const { id } = await props.params
  const sobre = await cargarProyecto(id)
  const nombre = sobre instanceof ErrorApi ? 'Proyecto' : sobre.data.name

  return { title: `${nombre} · Portal de clientes` }
}

export default async function ProyectoPagina (props: PageProps<'/portal/proyectos/[id]'>) {
  const { id } = await props.params
  const sobre = await cargarProyecto(id)

  if (sobre instanceof ErrorApi) {
    return <EstadoDeError error={sobre} volverA="/portal/proyectos" etiqueta="Proyectos" />
  }

  const proyecto = sobre.data
  // La empresa es la del propio contacto y la cabecera la pinta como subtitulo, igual que el panel
  // pinta el cliente del Espacio.
  const { data: empresa } = await pedirPortal<EmpresaPortal>('/portal/company')
  // La API devuelve la descripcion como HTML del panel viejo: sin despojarla, el cliente lee los
  // `<p>` en pantalla. Es el mismo tratamiento que le da el panel a la descripcion de una tarea.
  const descripcion = aTextoPlano(proyecto.description ?? '')
  // Las pestañas salen de lo que dijo la API, nunca de una lista fija: cada proyecto comparte cosas
  // distintas, y adivinar significaria dibujar pestañas que responden 403 al abrirlas.
  const pestanias = pestaniasDelProyecto(proyecto.tabs ?? [])
  // La descripcion la lleva la pestaña Descripcion, como en el panel. Se dibuja suelta solo cuando
  // esa pestaña no esta compartida: un proyecto que no la comparte igual tiene derecho a contar de
  // que se trata, y ahi es el unico lugar donde cabe.
  const descripcionSuelta = !pestanias.some((p) => p.clave === 'overview')
  const pendientes = await cargarPendientes(proyecto)
  const tablero = await cargarTablero(proyecto)
  // Las aprobaciones viven DENTRO de la pestaña Descripcion, que es la primera y la que se abre al
  // entrar. Sueltas sobre las pestañas se repetian encima de las diez y se llevaban ~190 px del
  // primer viewport en todas, incluidas las que no tienen nada que ver con una Tarea. Cuando el
  // Proyecto no comparte esa pestaña se dibujan sueltas, como antes: es lo unico que el cliente
  // puede escribir en todo el portal y no se esconde, se resitua.
  const aprobaciones = pendientes.length === 0
    ? null
    : (
      <AprobacionesPendientes
        proyectoId={proyecto.id}
        tareas={pendientes}
        // El catalogo se pide aca y no dentro del panel: `cargarLookupsDelPortal` es `server-only`
        // y el panel es cliente. `cache()` lo comparte con la pestaña de Tareas, asi que la pagina
        // no pide `/portal/lookups` dos veces por pintar la insignia.
        estados={listaDe(await cargarLookupsDelPortal(), 'task_statuses')}
      />
      )
  // El estado, resuelto una vez: lo pinta la cabecera y lo repite la ficha de la pestaña Descripcion.
  const estado = await estadoDelPortal('project_statuses', proyecto.status)
  // De donde bajan los datos de cada pestaña. Es lo unico que distingue esta pantalla de la del
  // colaborador, que monta los mismos paneles con `fuenteDelPanel`. Ver `dominio/fuente-proyecto.ts`.
  const fuente = fuenteDelPortal(proyecto.id)

  const paneles: Panel[] = pestanias.map(({ clave, etiqueta }) => ({
    clave,
    etiqueta,
    contenido: contenidoDePestania(clave, proyecto, fuente, {
      empresa: empresa.company,
      estado,
      aprobaciones,
      tablero,
      // El dia del negocio, no el del navegador. `sv-SE` da `YYYY-MM-DD` sin armarlo a mano.
      hoy: new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' })
    })
  }))

  return (
    <div className="flex flex-col gap-4">
      {/* La MISMA cabecera que ve un colaborador: el componente, no una copia con las mismas
          clases. Lo que cambia es lo que se le pasa —una `ProyectoVista` armada desde el contrato
          del portal, sin capacidades y sin botonera—, no el dibujo. */}
      <CabeceraProyecto
        proyecto={proyectoDelPortal(proyecto, empresa)}
        estado={estado}
        volverA={{ href: '/portal/proyectos', etiqueta: GLOSARIO.espacio.plural }}
        // Sin la barra de avance: el tablero de la pestaña Descripcion ya pinta un porcentaje, y es
        // otro. Ver `conAvance` en `CabeceraProyecto`.
        conAvance={false}
      />

      {/* La descripcion vive en la pestaña Descripcion, como en el panel. Suelta acá solo cuando esa
          pestaña no esta compartida: es el unico caso en que si no, no se leeria en ningun lado. */}
      {descripcionSuelta && descripcion !== '' && (
        <p className="text-texto-tenue max-w-prose text-sm whitespace-pre-line">{descripcion}</p>
      )}

      {/* Sueltas solo cuando no hay pestaña Descripcion donde ponerlas: sin ella no habria ningun
          sitio en la pantalla desde donde el cliente pueda dar el visto bueno. */}
      {descripcionSuelta && aprobaciones}

      {paneles.length > 0
        ? <Pestanas paneles={paneles} />
        : (
          <Vacio
            titulo="Todavía no hay nada compartido"
            descripcion="Cuando el equipo comparta algo de este proyecto, aparece acá."
          />
          )}
    </div>
  )
}

/** Lo que la pagina ya resolvio y alguna pestaña necesita: no se vuelve a pedir dentro del panel. */
interface DatosDeLaPagina {
  /** Nombre de la empresa del contacto, de `GET /portal/company`. */
  empresa: string
  /** Estado del proyecto, ya resuelto contra `project_statuses` del portal. */
  estado: { nombre: string, color: string | null }
  /**
   * Las {procesos} que esperan el visto bueno del contacto, o `null` si no hay ninguna.
   *
   * Las monta la pestaña Descripcion, arriba del resumen. Llegan armadas desde la pagina porque el
   * catalogo de estados sale de `cargarLookupsDelPortal`, que es `server-only`.
   */
  aprobaciones: React.ReactNode
  /**
   * El tablero de la pestaña Descripcion, o `null` si la API no lo dio.
   *
   * `null` es un caso normal y no un fallo: `sinFallar` traduce el 403 y el 404 a «este bloque no es
   * para este contacto», y sin tablero la pestaña se dibuja como antes, con la ficha sola. Un
   * tablero caido no puede dejar sin descripcion a un proyecto.
   */
  tablero: Tablero | null
  /**
   * HOY en `YYYY-MM-DD`, resuelto UNA vez en el servidor.
   *
   * El eje de los hitos se mide contra este valor. Calcularlo dentro del componente lo dejaria a
   * merced de la zona del navegador: el servidor y el cliente pueden estar en dias distintos, y un
   * eje que se corre al hidratar es un salto visible en la pantalla.
   */
  hoy: string
}

/**
 * Que dibuja cada pestaña.
 *
 * Todas son **el mismo panel que abre un colaborador**, con la fuente del contacto y
 * `capacidades={[]}`: con eso pierden el alta, las acciones masivas, la edicion en linea y los
 * botones de la ficha, y no pierden ninguna lectura.
 *
 * @param clave La pestaña, tal como la nombra la API.
 * @param proyecto El proyecto ya cargado.
 * @param fuente Las rutas del contacto para este proyecto.
 * @param pagina Lo que la pagina ya resolvio y algun panel necesita.
 * @returns El contenido de esa pestaña.
 */
function contenidoDePestania (
  clave: string,
  proyecto: EspacioPortal,
  fuente: FuenteDeProyecto,
  pagina: DatosDeLaPagina
): React.ReactNode {
  switch (clave) {
    case 'overview':
      return (
        <div className="flex flex-col gap-4">
          {pagina.aprobaciones}
          {/* El tablero va ARRIBA de la ficha y no abajo: es lo que el cliente viene a mirar, y la
              descripcion del proyecto la lee una vez. Si la API no lo dio —403 o 404, o sea «esta
              seccion no es para este contacto»— la pestaña queda como estaba. */}
          {pagina.tablero !== null && (
            <TableroDelProyecto tablero={pagina.tablero} hoy={pagina.hoy} />
          )}
          <PanelDescripcion
            proyecto={proyecto}
            estado={pagina.estado}
            // `href` en `null`: el cliente no tiene pantalla de clientes a donde ir, y el nombre es
            // el de su propia empresa —la API del contacto no publica el cliente del proyecto—.
            cliente={{ nombre: pagina.empresa, href: null }}
            // Sin tipo de facturacion: el contrato del contacto no lo publica, asi que la fila no
            // va. Los importes si, cuando la API los mando: `view_finance_overview` ya decidio del
            // otro lado.
            puedeVerMontos
            fuente={fuente}
            // El grafico de horas por dia es un subrecurso del resumen que el contacto no tiene.
            rutaDelGrafico={null}
            // Sin la fila de indicadores: el tablero de arriba ya publica esos cuatro numeros con
            // su forma. Dibujar los dos dejaba al cliente con dos lecturas del mismo dato y una de
            // ellas rota — un «— DIAS RESTANTES» sin valor, y un «1 vencido» al lado de un hito que
            // dice «sin tareas».
            conIndicadores={pagina.tablero === null}
          />
        </div>
      )
    case 'tasks':
      // `conIa={false}`: la capa de IA es del panel, y el alta por texto que habilita ni se ofrece
      // con `capacidades={[]}`.
      return (
        <PanelTareas
          proyectoId={proyecto.id}
          fuente={fuente}
          capacidades={[]}
          conIa={false}
          camposDeTareas={proyecto.campos_tareas ?? []}
        />
      )
    case 'calendar':
      return <PanelCalendario proyectoId={proyecto.id} fuente={fuente} capacidades={[]} />
    case 'milestones':
      return <PanelHitos proyecto={proyecto} fuente={fuente} capacidades={[]} />
    case 'timesheets':
      return <PanelTiempos proyectoId={proyecto.id} fuente={fuente} capacidades={[]} />
    case 'gantt':
      return <PanelGantt proyectoId={proyecto.id} fuente={fuente} />
    case 'actas':
      // El Meeting Paper del cliente. `capacidades={[]}` se lleva el alta, el asistente, Corregir,
      // Eliminar y el selector de estilo; queda el documento con sus datos y sus adjuntos.
      //
      // Sin `ia` y sin `yo`: los dos solo gobiernan escrituras que acá no existen, y salen de
      // `GET /settings` y `GET /me`, que son rutas del equipo. Pasarles un valor inventado seria
      // escribir dos veces una decision que `capacidades` ya tomo.
      return <PanelActas proyectoId={proyecto.id} fuente={fuente} capacidades={[]} />
    case 'activity':
      return <PanelActividad fuente={fuente} capacidades={[]} />
    case 'files':
      // El MISMO panel del colaborador. Con `fuente` del portal monta solo los adjuntos, sin el
      // arbol de Drive: ver el porque en `PanelesProyecto.tsx`.
      return <PanelArchivos proyectoId={proyecto.id} fuente={fuente} />
    default:
      // `pestaniasDelProyecto` ya filtro contra `PESTANIAS_PROYECTO`, y hoy todas las que esa lista
      // declara tienen su caso: acá no cae ninguna. Queda como red para la pestaña que se declare
      // mañana y todavia no se construya — nada, antes que el panel equivocado, que es lo que
      // pasaba con `actas` antes de tener su caso: caia acá y la persona veia otra cosa.
      return null
  }
}

/**
 * El tablero de la pestaña Descripcion.
 *
 * Sin guarda de pestaña: la puerta del tablero ES la pestaña Descripcion, y si la pagina llego hasta
 * aca es porque el proyecto se pudo abrir. `sinFallar` cubre el resto — un contacto sin esa pestaña
 * recibe 403 y el bloque no se dibuja.
 */
async function cargarTablero (proyecto: EspacioPortal): Promise<Tablero | null> {
  return await sinFallar<Tablero>(`/portal/projects/${proyecto.id}/tablero`)
}

/**
 * Las tareas de este proyecto que esperan el visto bueno del contacto.
 *
 * Se pide solo si el proyecto comparte la pestaña de tareas: sin ella la API responde 403, y un error
 * por un bloque que probablemente este vacio no puede tumbar la pantalla entera. Cualquier fallo
 * —incluido el 404 del guard de tabla, cuando `wiwo_core` no esta instalado— devuelve lista vacia y
 * el bloque no se dibuja.
 *
 * El filtro `aprobacion` es del backend: filtrar en el cliente traeria las cien tareas del proyecto
 * para mostrar dos.
 */
async function cargarPendientes (proyecto: EspacioPortal): Promise<TareaPortal[]> {
  if (!(proyecto.tabs ?? []).includes('tasks')) return []

  const sobre = await cargarDetalle<TareaPortal[]>(
    `/portal/projects/${proyecto.id}/tasks?filter[aprobacion]=pendiente&per_page=50`
  )

  return sobre instanceof ErrorApi ? [] : sobre.data
}
