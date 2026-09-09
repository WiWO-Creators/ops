import { Suspense, type ReactNode } from 'react'
import { CabeceraProyecto } from '@/componentes/proyecto/CabeceraProyecto'
import { PanelActividad } from '@/componentes/proyecto/PanelActividad'
import { PanelArchivos } from '@/componentes/proyecto/PanelArchivos'
import { PanelDescripcion } from '@/componentes/proyecto/PanelDescripcion'
import { PanelDiscusiones } from '@/componentes/proyecto/PanelDiscusiones'
import { PanelHitos } from '@/componentes/proyecto/PanelHitos'
import { PanelTareas } from '@/componentes/proyecto/PanelTareas'
import { PanelTiempos } from '@/componentes/proyecto/PanelTiempos'
import { Pestanas, type Panel } from '@/componentes/proyecto/Pestanas'
import { Cargando } from '@/componentes/estado/Estados'
import { listaDe, nombreDe } from '@/datos/catalogos'
import type { Espacio, Lookups } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import { GLOSARIO } from '@/dominio/glosario'

/**
 * Cabecera y pestañas de trabajo de un Espacio que se mira desde otra seccion.
 *
 * Una Licitacion y un Upsell **son** Espacios vistos desde otro angulo: su id ES el del Espacio, y
 * sus tareas, hitos, tiempos, archivos, discusiones y actividad ya viven en los endpoints de Espacio.
 * Las dos secciones montaban —o iban a montar— exactamente la misma lista de siete pestañas con
 * exactamente los mismos componentes; lo unico propio de cada una es la primera pestaña (la ficha con
 * sus datos comerciales) y la botonera de la cabecera. Eso es lo que se recibe por parametro.
 *
 * Se extrae **sin cambiar comportamiento**: los paneles, su orden, sus props y el `Suspense` son los
 * que tenia `app/(panel)/licitaciones/[id]/page.tsx`.
 *
 * El `Suspense` no es decorativo: `Pestanas` usa `useSearchParams`, y sin ese limite el build de
 * cualquier ruta que lo monte falla.
 *
 * Sin Gantt, Notas, capa de IA ni Configuracion: son del Espacio adjudicado, no de la oportunidad.
 */
interface PropsDetalleDeEspacio {
  /** La ficha completa del Espacio, tal como la devuelve `GET /projects/{id}`. */
  espacio: Espacio
  lookups: Lookups
  /** Capacidades sobre `projects`, de `permissions` de `/me`. */
  capacidadesProyecto: Capacidad[]
  /** Capacidades sobre `tasks`, de `permissions` de `/me`. */
  capacidadesTareas: Capacidad[]
  volverA: { href: string, etiqueta: string }
  /** Segunda linea de la cabecera: la empresa a la que pertenece la oportunidad. */
  subtitulo?: string
  /** Botonera propia de la seccion (editar, ganar, perder, enlaces al resultado). */
  acciones?: ReactNode
  /**
   * Contenido propio de la pestaña Ficha. Va **encima** de `PanelDescripcion`, que es del Espacio y
   * por eso se pinta siempre: los plazos y montos no cambian segun quien mire el Espacio.
   */
  ficha: ReactNode
  /** Nombre accesible del grupo de pestañas: "Secciones de la licitación". */
  etiquetaPestanas: string
}

export function DetalleDeEspacio ({
  espacio,
  lookups,
  capacidadesProyecto,
  capacidadesTareas,
  volverA,
  subtitulo,
  acciones,
  ficha,
  etiquetaPestanas
}: PropsDetalleDeEspacio) {
  const estado = estadoDelEspacio(lookups, espacio.status)

  const paneles: Panel[] = [
    {
      clave: 'ficha',
      etiqueta: 'Ficha',
      contenido: (
        <div className="flex flex-col gap-6">
          {ficha}
          <PanelDescripcion
            proyecto={espacio}
            estado={estado}
            tipoFacturacion={nombreDe(listaDe(lookups, 'billing_types'), espacio.billing_type)}
            puedeVerMontos={capacidadesProyecto.includes('edit')}
          />
        </div>
      )
    },
    {
      clave: 'tareas',
      etiqueta: GLOSARIO.proceso.plural,
      // Sin IA: el chat de proyecto es del detalle de Espacio, y aca todavia no hay proyecto cerrado.
      contenido: <PanelTareas proyectoId={espacio.id} capacidades={capacidadesTareas} conIa={false} />
    },
    {
      clave: 'hitos',
      etiqueta: GLOSARIO.hito.plural,
      contenido: (
        <PanelHitos
          proyecto={espacio}
          capacidades={capacidadesProyecto}
          capacidadesTareas={capacidadesTareas}
        />
      )
    },
    {
      clave: 'tiempos',
      etiqueta: 'Tiempos',
      contenido: <PanelTiempos proyectoId={espacio.id} capacidades={capacidadesTareas} />
    },
    { clave: 'archivos', etiqueta: 'Archivos', contenido: <PanelArchivos proyectoId={espacio.id} /> },
    {
      clave: 'discusiones',
      etiqueta: 'Discusiones',
      contenido: <PanelDiscusiones proyectoId={espacio.id} capacidades={capacidadesProyecto} />
    },
    {
      clave: 'actividad',
      etiqueta: 'Actividad',
      contenido: <PanelActividad proyectoId={espacio.id} capacidades={capacidadesProyecto} />
    }
  ]

  return (
    <section className="flex flex-col gap-4">
      <CabeceraProyecto
        proyecto={espacio}
        estado={estado}
        estados={listaDe(lookups, 'project_statuses')}
        capacidadesProyecto={capacidadesProyecto}
        capacidadesTareas={capacidadesTareas}
        volverA={volverA}
        subtitulo={subtitulo}
        acciones={acciones}
      />

      <Suspense fallback={<Cargando alto="min-h-36" mensaje="Cargando el detalle…" />}>
        <Pestanas paneles={paneles} etiqueta={etiquetaPestanas} />
      </Suspense>
    </section>
  )
}

/**
 * Resuelve el estado del Espacio contra `project_statuses`.
 *
 * @param lookups catalogos ya cargados
 * @param status id del estado que trae el Espacio
 * @returns nombre legible y color; un id que el catalogo no conoce se muestra como `#id` sin color
 */
function estadoDelEspacio (lookups: Lookups, status: number): { nombre: string, color: string | null } {
  const encontrado = listaDe(lookups, 'project_statuses').find((item) => item.id === status)

  return { nombre: encontrado?.name ?? `#${status}`, color: encontrado?.color ?? null }
}
