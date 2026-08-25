import Link from 'next/link'
import { Etiquetas } from '@/componentes/presentadores/Etiqueta'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { GrupoAvatares } from '@/componentes/presentadores/Avatar'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { cn } from '@/lib/clases'
import { GLOSARIO } from '@/dominio/glosario'
import type { Espacio } from '@/datos/recursos'

interface PropsBarraProgreso {
  /** Porcentaje ya calculado, 0-100. Se acota: la API puede mandar 103 en un hito sobrecumplido. */
  porcentaje: number
  className?: string
}

/**
 * Barra de avance del sistema.
 *
 * Vive aca y no en un archivo propio porque nace de la cabecera y el unico otro consumidor es
 * `ListaHitos`, que dibuja exactamente la misma barra a menor escala.
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
  proyecto: Espacio
  /** Nombre y color del estado, ya resueltos contra `lookups` por quien renderiza. */
  estado: { nombre: string, color: string | null }
}

/**
 * Cabecera del detalle de un Proyecto: identidad, estado, plazos, equipo y avance.
 *
 * @param proyecto el espacio ya cargado, con `members` incluido si la API lo trajo
 * @param estado el estado legible; el color viene de `project_statuses` y se pinta como punto
 * @returns el bloque superior de la pantalla de detalle
 */
export function CabeceraProyecto ({ proyecto, estado }: PropsCabecera) {
  return (
    <header className="border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex flex-col gap-4 border p-5">
      <Link
        href="/espacios"
        className="text-texto-tenue hover:text-texto w-fit text-xs font-medium transition-colors"
      >
        ← {GLOSARIO.espacio.plural}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-texto text-titulo font-semibold">{proyecto.name}</h1>
          <p className="text-texto-tenue text-sm">{proyecto.client?.company ?? 'Sin cliente'}</p>
        </div>

        <Insignia color={estado.color}>{estado.nombre}</Insignia>
      </div>

      <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
          <dt className="text-texto-sutil">Inicio</dt>
          <dd className="text-texto"><Fecha valor={proyecto.start_date} /></dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="text-texto-sutil">Entrega</dt>
          <dd><Fecha valor={proyecto.deadline} comoVencimiento /></dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="text-texto-sutil">Equipo</dt>
          <dd><GrupoAvatares personas={proyecto.members ?? []} maximo={5} /></dd>
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
