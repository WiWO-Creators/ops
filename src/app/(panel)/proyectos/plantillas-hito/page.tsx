import { Suspense } from 'react'
import { Cargando } from '@/componentes/estado/Estados'
import { PantallaPlantillasHito } from '@/componentes/proyecto/PantallaPlantillasHito'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { RUTA_DE_ASIGNABLES } from '@/datos/asignables'
import { cargarLookups } from '@/datos/lookups'
import { pedir, pedirOpcional } from '@/datos/servidor'
import type { PersonaAsignable, PlantillaHito } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'
import { TITULO_PLANTILLAS_HITO } from '@/definiciones/plantillas-hito'
import { GLOSARIO } from '@/dominio/glosario'
import { tiposDeProcesoUnicos } from '@/lib/plantillas'

export const metadata = { title: `${TITULO_PLANTILLAS_HITO} · WiWO Ops` }

/**
 * Plantillas de {hito}: armarlas, editarlas y borrarlas.
 *
 * Vive al lado de las plantillas de {espacio} (`/proyectos/plantillas`) porque son la misma idea a
 * dos escalas y la persona que arma una arma la otra. La diferencia es cuando se aplican: la de
 * {espacio} al crear el {espacio}, esta al crear un {hito} dentro de uno que ya existe.
 *
 * Se resuelve en el servidor para que la lista no parpadee al montar. El `Suspense` no es
 * decorativo: el motor de tabla usa `useSearchParams` y sin ese limite **falla el build**, no el
 * runtime.
 */
export default async function PlantillasHitoPage () {
  const [lista, yo, lookups, equipo] = await Promise.all([
    pedir<PlantillaHito[]>('/hito-plantillas'),
    pedir<Yo>('/me'),
    cargarLookups(),
    // Misma fuente que el selector de asignados de la tarea: `/staff` exige `staff.view` —lo tienen
    // 19 de 184 personas— y cortaba en 100, asi que el filtro "Creada por" no seria el mismo para
    // todos ni estaria completo para nadie.
    pedirOpcional<PersonaAsignable[]>(`/${RUTA_DE_ASIGNABLES}`)
  ])

  return (
    <section className="flex flex-col gap-4">
      <TituloModulo
        titulo={TITULO_PLANTILLAS_HITO}
        descripcion={`La lista de ${GLOSARIO.proceso.plural.toLowerCase()} que un ${GLOSARIO.hito.singular.toLowerCase()} repite mes a mes. No guarda fechas: guarda a cuántos días del inicio del ${GLOSARIO.hito.singular.toLowerCase()} cae cada una, así que al crear el ${GLOSARIO.hito.singular.toLowerCase()} eligiendo la plantilla las ${GLOSARIO.proceso.plural.toLowerCase()} nacen solas con sus fechas.`}
      />

      <Suspense fallback={<Cargando alto="min-h-36" mensaje="Cargando las plantillas…" />}>
        <PantallaPlantillasHito
          inicial={{ filas: lista.data, paginacion: lista.meta?.pagination }}
          capacidades={yo.data.permissions.projects}
          tiposDeProceso={tiposDeProcesoUnicos(lookups.task_types)}
          autores={(equipo.datos ?? []).map((persona) => ({ valor: String(persona.id), etiqueta: persona.full_name }))}
        />
      </Suspense>
    </section>
  )
}
