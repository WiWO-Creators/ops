import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia, type TonoInsignia } from '@/componentes/presentadores/Insignia'
import { NOVEDADES, ROTULO_TIPO, agruparPorDia, fechaMasReciente, type TipoNovedad } from '@/dominio/novedades'
import { MarcaNovedadesVistas } from './MarcaNovedadesVistas'

export const metadata = { title: 'Novedades · WiWO Ops' }

/** Tono de la insignia de cada tipo: lo nuevo resalta, los arreglos avisan. */
const TONO_TIPO: Record<TipoNovedad, TonoInsignia> = {
  nuevo: 'exito',
  mejora: 'acento',
  arreglo: 'aviso'
}

/**
 * Qué cambió en Ops, día por día y en lenguaje simple.
 *
 * Sin permiso: es de todo el equipo, igual que el perfil. La lista viene del repo
 * (`dominio/novedades.ts`), así que no hay pedido a la API que pueda fallar.
 */
export default function NovedadesPage () {
  const dias = agruparPorDia(NOVEDADES)
  const masReciente = fechaMasReciente(NOVEDADES)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      {masReciente !== null && <MarcaNovedadesVistas fecha={masReciente} />}

      <TituloModulo
        titulo="Novedades"
        descripcion="Lo que fue cambiando en Ops, contado en simple. Lo más reciente va arriba."
      />

      {dias.length === 0
        ? <p className="text-texto-tenue text-sm">Todavía no hay novedades publicadas.</p>
        : dias.map(dia => (
          <section key={dia.fecha} className="flex flex-col gap-3" aria-labelledby={`dia-${dia.fecha}`}>
            <h2 id={`dia-${dia.fecha}`} className="text-texto-tenue text-sm font-semibold">
              <Fecha valor={dia.fecha} />
            </h2>

            <ul className="border-linea bg-superficie-elevada divide-linea-suave flex flex-col divide-y rounded-tarjeta border">
              {dia.novedades.map(novedad => (
                <li key={`${novedad.fecha}-${novedad.titulo}`} className="flex flex-col gap-1.5 p-4 sm:flex-row sm:gap-4">
                  <Insignia tono={TONO_TIPO[novedad.tipo]} tamano="chico" className="w-fit shrink-0 sm:mt-0.5 sm:w-16 sm:justify-center">
                    {ROTULO_TIPO[novedad.tipo]}
                  </Insignia>

                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="text-texto text-sm font-semibold text-pretty">{novedad.titulo}</p>
                    {novedad.detalle !== undefined && (
                      <p className="text-texto-tenue text-sm text-pretty">{novedad.detalle}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  )
}
