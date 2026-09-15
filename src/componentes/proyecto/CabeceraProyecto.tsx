import Link from 'next/link'
import { CodigoCopiable } from '@/componentes/presentadores/CodigoCopiable'
import { Etiquetas } from '@/componentes/presentadores/Etiqueta'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { EquipoProyecto } from './EquipoProyecto'
import { ImagenEntidad } from '@/componentes/presentadores/ImagenEntidad'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { MenuEstadoProyecto } from './MenuEstadoProyecto'
import { ESTADOS_DESTACADOS, pildoraDeEstado } from './estado-proyecto'
import { cn } from '@/lib/clases'
import { GLOSARIO } from '@/dominio/glosario'
import type { ProyectoVista } from '@/dominio/proyecto'
import type { EstadoLookup } from '@/datos/recursos'
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

interface PropsCabecera {
  /** El proyecto como vista. El panel y el portal la arman con `dominio/proyecto`. */
  proyecto: ProyectoVista
  /** Nombre y color del estado, ya resueltos contra el catalogo por quien renderiza. */
  estado: { nombre: string, color: string | null }
  /**
   * Capacidades sobre `projects`. Rigen solo lo que la cabecera decide por su cuenta —si la imagen
   * y el equipo se pueden editar—; las acciones de la seccion llegan por `acciones`.
   */
  capacidades?: Capacidad[]
  /**
   * A donde vuelve el enlace de arriba. Por defecto, al listado de Espacios.
   *
   * Existe porque el mismo Espacio se mira desde varias secciones: mientras es una Licitacion no
   * vive en `/proyectos`, y el cliente lo mira desde `/portal/proyectos`.
   */
  volverA?: { href: string, etiqueta: string }
  /** Linea bajo el titulo. Por defecto, el cliente del proyecto. */
  subtitulo?: string
  /**
   * `project_statuses` de `lookups`. Con el catalogo y `edit`, la pildora deja de ser una etiqueta y
   * pasa a ser el control que cambia el estado: es el cambio mas repetido de la ficha y no tiene por
   * que costar un formulario.
   *
   * Vacio —el portal, o un Espacio archivado, al que la API le rechaza cualquier `PATCH`— dibuja la
   * misma pildora de solo lectura de siempre.
   */
  estados?: EstadoLookup[]
  /**
   * Botonera de la seccion. Nada en el portal, que no escribe.
   *
   * `MenuProyecto` y `BotonNuevaTarea` **no** viven acá dentro: necesitan el `Espacio` entero del
   * panel y saben escribir. Tenerlos adentro obligaba a que la cabecera conociera el contrato del
   * equipo, y por eso el portal no podia usarla y termino con una copia. Ahora cada pantalla pasa
   * la suya.
   */
  acciones?: React.ReactNode

  /** Quien mira, si lo hay. Solo lo usa el editor de equipo, para reconocer una salida propia. */
  yoId?: number
}

/**
 * Cabecera del detalle de un Proyecto: identidad, estado, plazos, equipo y avance.
 *
 * La dibujan las cuatro pantallas que muestran un Proyecto —Espacios, Licitaciones, Upselling y el
 * portal del cliente—, y por eso no sabe de ninguna: recibe una `ProyectoVista` y una botonera.
 *
 * @param proyecto el proyecto como vista
 * @param estado el estado legible; el color viene de `project_statuses`
 * @returns el bloque superior de la pantalla de detalle
 */
export function CabeceraProyecto ({
  proyecto,
  estado,
  capacidades = [],
  volverA = { href: '/proyectos', etiqueta: GLOSARIO.espacio.plural },
  subtitulo,
  estados = [],
  acciones,
  yoId
}: PropsCabecera) {
  const puedeEditar = capacidades.includes('edit')

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
            imagenEfectiva={proyecto.image_url ?? proyecto.cliente?.image_url}
            ruta={`projects/${proyecto.id}`}
            puedeEditar={puedeEditar}
            tamano="grande"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-texto text-titulo font-semibold">{proyecto.name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-texto-tenue text-sm">{subtitulo ?? proyecto.cliente?.company ?? 'Sin cliente'}</p>
              {/* Sin patente no se pinta nada: el portal no publica el codigo interno, y un `#12`
                  ahi seria un dato de la base puesto delante del cliente. */}
              {proyecto.patente !== null && <CodigoCopiable valor={proyecto.patente} />}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {puedeEditar && estados.length > 0
            ? (
              <MenuEstadoProyecto
                proyectoId={proyecto.id}
                nombreProyecto={proyecto.name}
                estado={proyecto.status}
                respaldo={{ nombre: estado.nombre, color: estado.color }}
                catalogo={estados}
              />
              )
            : (
              <Insignia
                {...pildoraDeEstado(proyecto.status, estado.color)}
                className={ESTADOS_DESTACADOS.includes(proyecto.status) ? 'motion-safe:animate-pulse' : undefined}
              >{estado.nombre}</Insignia>
              )}
          {acciones}
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
          <dd className="min-w-0"><EquipoProyecto proyectoId={proyecto.id} miembros={proyecto.members} puedeEditar={puedeEditar} yoId={yoId} /></dd>
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
