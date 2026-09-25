'use client'

import Link from 'next/link'
import { useSyncExternalStore } from 'react'
import { ArrowRight, X } from 'lucide-react'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { Boton } from '@/componentes/formularios/Boton'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia, type TonoInsignia } from '@/componentes/presentadores/Insignia'
import { ROTULO_TIPO, hayNovedadesSinVer, type Novedad, type TipoNovedad } from '@/dominio/novedades'
import { EVENTO_NOVEDADES_OCULTAS_INICIO, leerNovedadesOcultasEnInicio, ocultarNovedadesEnInicio } from '@/lib/novedades-vistas'

/** Tono de la insignia de cada tipo, el mismo de la página de novedades. */
const TONO_TIPO: Record<TipoNovedad, TonoInsignia> = {
  nuevo: 'exito',
  mejora: 'acento',
  arreglo: 'aviso'
}

/**
 * Escucha los cambios de la marca: el botón de esta pestaña y los de otras pestañas abiertas.
 *
 * @param avisar lo que React llama para volver a leer la marca
 * @returns la función que deja de escuchar
 */
function suscribirNovedadesOcultas (avisar: () => void): () => void {
  window.addEventListener(EVENTO_NOVEDADES_OCULTAS_INICIO, avisar)
  window.addEventListener('storage', avisar)

  return () => {
    window.removeEventListener(EVENTO_NOVEDADES_OCULTAS_INICIO, avisar)
    window.removeEventListener('storage', avisar)
  }
}

interface PropsNovedadesDelInicio {
  /** Las últimas novedades, ya recortadas, de la más reciente a la más vieja. */
  novedades: Novedad[]
  /** La fecha de la novedad más reciente de toda la lista, `YYYY-MM-DD`. */
  masReciente: string
}

/**
 * "Lo nuevo en Ops": las últimas novedades en la portada, para que el equipo vea que el sistema se
 * mueve sin tener que buscarlo en el menú.
 *
 * Cada persona lo puede ocultar. Ocultar guarda la fecha de la novedad más reciente, y el bloque
 * vuelve solo cuando se publica una posterior: se esconde lo ya leído, no las novedades para
 * siempre.
 *
 * En el servidor se pinta como oculto (la marca vive solo en el navegador): pintarlo de entrada lo
 * haría parpadear a quien ya lo ocultó.
 *
 * @param novedades las que se muestran
 * @param masReciente la fecha que se guarda al ocultar
 */
export function NovedadesDelInicio ({ novedades, masReciente }: PropsNovedadesDelInicio) {
  const ocultasHasta = useSyncExternalStore(suscribirNovedadesOcultas, leerNovedadesOcultasEnInicio, () => masReciente)

  if (novedades.length === 0 || !hayNovedadesSinVer(ocultasHasta, masReciente)) return null

  return (
    <section className="flex flex-col gap-5">
      <TituloModulo
        nivel="h2"
        titulo="Lo nuevo en Ops"
        acciones={
          <div className="flex items-center gap-1">
            <Link
              href="/novedades"
              className="flex items-center gap-1.5 rounded-control px-3 py-2 text-base font-semibold text-acento transition-colors duration-150 ease-neo hover:bg-hover"
            >
              Ver todas
              <ArrowRight size={18} strokeWidth={2.25} aria-hidden="true" />
            </Link>
            <Boton variante="sutil" soloIcono onClick={() => ocultarNovedadesEnInicio(masReciente)} aria-label="Ocultar novedades hasta que haya una nueva" title="Ocultar hasta que haya algo nuevo">
              <X size={18} aria-hidden="true" />
            </Boton>
          </div>
        }
      />

      <ul className="border-linea bg-superficie-elevada divide-linea-suave rounded-tarjeta flex flex-col divide-y border">
        {novedades.map(novedad => (
          <li key={`${novedad.fecha}-${novedad.titulo}`} className="flex flex-col gap-1.5 p-4 sm:flex-row sm:gap-4">
            <Insignia tono={TONO_TIPO[novedad.tipo]} tamano="chico" className="w-fit shrink-0 sm:mt-0.5 sm:w-16 sm:justify-center">
              {ROTULO_TIPO[novedad.tipo]}
            </Insignia>

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-texto text-sm font-semibold text-pretty">{novedad.titulo}</p>
              {novedad.detalle !== undefined && (
                <p className="text-texto-tenue text-sm text-pretty">{novedad.detalle}</p>
              )}
            </div>

            <span className="text-texto-sutil shrink-0 text-xs sm:mt-0.5">
              <Fecha valor={novedad.fecha} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
