import { Vacio } from '@/componentes/estado/Estados'
import { EntradaEscalonada } from '@/componentes/estructura/EntradaEscalonada'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { TONO_NOVEDAD } from '@/componentes/presentadores/tono-novedad'
import { NOVEDADES, ROTULO_TIPO, agruparPorDia, fechaMasReciente, novedadesDelRecorrido } from '@/dominio/novedades'
import { AbrirRecorrido } from './AbrirRecorrido'
import { MarcaNovedadesVistas } from './MarcaNovedadesVistas'

export const metadata = { title: 'Novedades · WiWO Ops' }

/**
 * Qué cambió en Ops, día por día y en lenguaje simple.
 *
 * Sin permiso: es de todo el equipo, igual que el perfil. La lista viene del repo
 * (`dominio/novedades.ts`), así que no hay pedido a la API que pueda fallar.
 */
export default function NovedadesPage () {
  const dias = agruparPorDia(NOVEDADES)
  const masReciente = fechaMasReciente(NOVEDADES)
  const recorrido = novedadesDelRecorrido(NOVEDADES)

  return (
    <EntradaEscalonada trasEntradaDePagina>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        {masReciente !== null && <MarcaNovedadesVistas fecha={masReciente} />}

        <TituloModulo
          titulo="Novedades"
          descripcion="Lo que fue cambiando en Ops, contado en simple. Lo más reciente va arriba."
          acciones={recorrido.length > 0 ? <AbrirRecorrido novedades={recorrido} /> : undefined}
        />

        {dias.length === 0
          ? <Vacio titulo="Todavía no hay novedades publicadas" descripcion="Cuando Ops cambie, lo contamos acá, día por día." />
          : dias.map(dia => (
            <section key={dia.fecha} className="flex flex-col gap-3" aria-labelledby={`dia-${dia.fecha}`}>
              <h2 id={`dia-${dia.fecha}`} className="text-texto-tenue text-sm font-semibold">
                <Fecha valor={dia.fecha} />
              </h2>

              <ul className="border-linea bg-superficie-elevada divide-linea-suave flex flex-col divide-y rounded-tarjeta border">
                {dia.novedades.map(novedad => (
                  <li
                    key={`${novedad.fecha}-${novedad.titulo}`}
                    data-entrada="item"
                    className="flex flex-col gap-1.5 p-4 sm:flex-row sm:gap-4"
                  >
                    <Insignia tono={TONO_NOVEDAD[novedad.tipo]} tamano="chico" className="w-fit shrink-0 sm:mt-0.5 sm:w-16 sm:justify-center">
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
    </EntradaEscalonada>
  )
}
