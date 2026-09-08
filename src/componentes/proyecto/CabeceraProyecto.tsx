import Link from 'next/link'
import { Etiquetas } from '@/componentes/presentadores/Etiqueta'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { EquipoProyecto } from './EquipoProyecto'
import { ImagenEntidad } from '@/componentes/presentadores/ImagenEntidad'
import { Insignia, type TonoInsignia } from '@/componentes/presentadores/Insignia'
import { cn } from '@/lib/clases'
import { GLOSARIO } from '@/dominio/glosario'
import { BotonNuevaTarea, MenuProyecto } from './MenuProyecto'
import type { EstadoLookup, Espacio } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'

interface PropsBarraProgreso {
  /** Porcentaje ya calculado, 0-100. Se acota: la API puede mandar 103 en un hito sobrecumplido. */
  porcentaje: number
  className?: string
}

/**
 * Barra de avance del sistema.
 *
 * Vive aca y no en un archivo propio porque nace de la cabecera y el unico otro consumidor es
 * la tabla de Hitos, que dibuja exactamente la misma barra a menor escala.
 *
 * @param porcentaje avance en 0-100; se acota a ese rango antes de pintar
 * @returns la barra, anunciada como `progressbar` para lectores de pantalla
 */
export function BarraProgreso ({ porcentaje, className }: PropsBarraProgreso) {
  const valor = Math.max(0, Math.min(100, Math.round(porcentaje)))

  return (
    <span
      role="progressbar"
      aria-valuenow={valor}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('bg-relleno-neutro block h-2 w-full overflow-hidden rounded-full', className)}
    >
      <span className="bg-acento block h-full rounded-full" style={{ width: `${valor}%` }} />
    </span>
  )
}

/**
 * Los dos estados de `project_statuses` que la cabecera pinta con la paleta del sistema.
 *
 * El resto conserva el color que traiga el catalogo: son estados que el panel puede crear y
 * renombrar, y ninguna paleta fija podria seguirles el ritmo. Estos dos si, porque son los que hay
 * que leer sin leer: si el espacio ya esta cerrado o si todavia pide trabajo.
 */
const ESTADO_EN_DESARROLLO = 2
const ESTADO_FINALIZADO = 4

/**
 * Resuelve como se pinta la pildora de estado de la cabecera.
 *
 * Solo dos estados se pintan con la paleta del sistema, y el criterio es "que pide algo de alguien":
 * **finalizado va en verde** porque es el unico que ya no pide nada, y **en desarrollo va en rojo**
 * porque es el que si. Los demas —no iniciado, en espera, cancelado— caen al color del catalogo, que
 * la `Insignia` dibuja como punto y no como fondo: son estados que el panel puede crear y renombrar,
 * y ademas repartir el rojo entre tres estados lo dejaria sin significar nada.
 *
 * @param status id de `project_statuses` que trae el proyecto
 * @param color color del catalogo para ese estado, o `null` si no lo tiene
 * @returns las props de `Insignia` que corresponden a ese estado
 */
function pildoraDeEstado (status: number, color: string | null): {
  tono?: TonoInsignia
  color?: string | null
} {
  if (status === ESTADO_FINALIZADO) return { tono: 'exito' }
  if (status === ESTADO_EN_DESARROLLO) return { tono: 'peligro' }

  return { color }
}

interface PropsCabecera {
  proyecto: Espacio
  /** Nombre y color del estado, ya resueltos contra `lookups` por quien renderiza. */
  estado: { nombre: string, color: string | null }
  /** Estados de proyecto, para las opciones "Marcar como" del menu. */
  estados: EstadoLookup[]
  /** Capacidades sobre `projects`. */
  capacidadesProyecto: Capacidad[]
  /** Capacidades sobre `tasks`: rigen el boton "Nueva tarea". */
  capacidadesTareas: Capacidad[]
  /**
   * A donde vuelve el enlace de arriba. Por defecto, al listado de Espacios.
   *
   * Existe porque el mismo Espacio se mira desde dos secciones: mientras es una Licitacion no vive en
   * `/espacios`, y volver ahi llevaria a un listado donde no esta.
   */
  volverA?: { href: string, etiqueta: string }
  /** Linea bajo el titulo. Por defecto, el cliente del Espacio. */
  subtitulo?: string
  /** Reemplaza "Nueva tarea" y el menu del Espacio, cuyas acciones devuelven a `/espacios`. */
  acciones?: React.ReactNode
}

/**
 * Cabecera del detalle de un Proyecto: identidad, estado, plazos, equipo y avance.
 *
 * @param proyecto el espacio ya cargado, con `members` incluido si la API lo trajo
 * @param estado el estado legible; el color viene de `project_statuses` y se pinta como punto
 * @returns el bloque superior de la pantalla de detalle
 */
export function CabeceraProyecto ({
  proyecto,
  estado,
  estados,
  capacidadesProyecto,
  capacidadesTareas,
  volverA = { href: '/espacios', etiqueta: GLOSARIO.espacio.plural },
  subtitulo,
  acciones
}: PropsCabecera) {
  return (
    <header className="border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex flex-col gap-4 border p-5">
      <Link
        href={volverA.href}
        className="text-texto-tenue hover:text-texto w-fit text-xs font-medium transition-colors"
      >
        ← {volverA.etiqueta}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ImagenEntidad
            nombre={proyecto.name}
            imagenPropia={proyecto.image_url}
            imagenEfectiva={proyecto.image_url ?? proyecto.client?.image_url}
            ruta={`projects/${proyecto.id}`}
            puedeEditar={capacidadesProyecto.includes('edit')}
            tamano="grande"
          />
          <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-texto text-titulo font-semibold">{proyecto.name}</h1>
          <p className="text-texto-tenue text-sm">{subtitulo ?? proyecto.client?.company ?? 'Sin cliente'}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Insignia
            {...pildoraDeEstado(proyecto.status, estado.color)}
            className={[ESTADO_FINALIZADO, ESTADO_EN_DESARROLLO].includes(proyecto.status) ? 'motion-safe:animate-pulse' : undefined}
          >{estado.nombre}</Insignia>
          {acciones ?? (
            <>
              <BotonNuevaTarea capacidades={capacidadesTareas} />
              <MenuProyecto proyecto={proyecto} estados={estados} capacidades={capacidadesProyecto} />
            </>
          )}
        </div>
      </div>

      <dl className="flex flex-wrap items-start gap-x-6 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
          <dt className="text-texto-sutil">Inicio</dt>
          <dd className="text-texto"><Fecha valor={proyecto.start_date} /></dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="text-texto-sutil">Entrega</dt>
          <dd><Fecha valor={proyecto.deadline} comoVencimiento /></dd>
        </div>
        <div className="flex min-w-0 max-w-full items-start gap-2">
          <dt className="text-texto-sutil pt-1">Equipo</dt>
          <dd className="min-w-0"><EquipoProyecto proyectoId={proyecto.id} miembros={proyecto.members ?? []} puedeEditar={capacidadesProyecto.includes('edit')} /></dd>
        </div>
      </dl>

      <Etiquetas etiquetas={proyecto.tags} maximo={6} />

      <div className="flex items-center gap-3">
        <BarraProgreso porcentaje={proyecto.progress} className="min-w-0 flex-1" />
        <span data-numerico className="text-texto text-sm font-semibold">
          {Math.round(proyecto.progress)}%
        </span>
      </div>
    </header>
  )
}
