import { Suspense } from 'react'
import { ExternalLink } from 'lucide-react'
import { Cargando } from '@/componentes/estado/Estados'
import { PantallaPlantillas } from '@/componentes/proyecto/PantallaPlantillas'
import { cargarLookups } from '@/datos/lookups'
import { pedir, pedirOpcional } from '@/datos/servidor'
import type { MiembroEquipo, PlantillaEspacio } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'
import { TITULO_PLANTILLAS } from '@/definiciones/plantillas'
import { GLOSARIO } from '@/dominio/glosario'
import { urlClasica } from '@/lib/panel-clasico'
import { tiposDeProcesoUnicos } from '@/lib/plantillas'

export const metadata = { title: `${TITULO_PLANTILLAS} · WiWO Ops` }

/**
 * Tope de personas que se traen para elegir responsables.
 *
 * Es el maximo que acepta la API en una pagina. Con mas equipo que eso el selector deja de ser
 * exhaustivo, y el reemplazo es un buscador contra el servidor, no subir el numero.
 */
const TOPE_DE_EQUIPO = 100

/**
 * Plantillas de {espacio}: armarlas, editarlas y borrarlas.
 *
 * Se resuelve en el servidor para que la lista no parpadee al montar. El `Suspense` no es decorativo:
 * el motor de tabla usa `useSearchParams` y sin ese limite **falla el build**, no el runtime.
 */
export default async function PlantillasPage () {
  const [lista, yo, lookups, equipo] = await Promise.all([
    pedir<PlantillaEspacio[]>('/project-templates'),
    pedir<Yo>('/me'),
    cargarLookups(),
    pedirOpcional<MiembroEquipo[]>(`/staff?per_page=${TOPE_DE_EQUIPO}`)
  ])

  const clasico = urlClasica('espacios')

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-texto text-xl font-semibold">{TITULO_PLANTILLAS}</h1>
        <p className="text-texto-tenue max-w-prose text-sm">
          Un esqueleto de {GLOSARIO.hito.plural.toLowerCase()} y {GLOSARIO.proceso.plural.toLowerCase()} que
          se reusa. No guarda fechas: guarda a cuántos días del inicio cae cada cosa, así que al crear
          el {GLOSARIO.espacio.singular.toLowerCase()} las fechas salen solas de la duración que se pida.
        </p>
      </header>

      <Suspense fallback={<Cargando alto="min-h-36" mensaje="Cargando las plantillas…" />}>
        <PantallaPlantillas
          inicial={{ filas: lista.data, paginacion: lista.meta?.pagination }}
          capacidades={yo.data.permissions.projects}
          tiposDeProceso={tiposDeProcesoUnicos(lookups.task_types)}
          equipo={(equipo.datos ?? []).map((persona) => ({ valor: String(persona.id), etiqueta: persona.full_name }))}
        />
      </Suspense>

      {/* Salida de emergencia al panel viejo, discreta y al pie: no es una accion del producto. No se
          dibuja si falta `NEXT_PUBLIC_BOARD_URL`, porque un enlace a un dominio inventado es peor. */}
      {clasico !== null && (
        <a
          href={clasico}
          target="_blank"
          rel="noreferrer"
          className="text-texto-sutil hover:text-texto inline-flex w-fit items-center gap-1 text-xs underline-offset-4 hover:underline"
        >
          <ExternalLink size={12} aria-hidden />
          Abrir en el panel clásico
        </a>
      )}
    </section>
  )
}
