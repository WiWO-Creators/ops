import { Bloque } from '@/app/portal/(dentro)/detalle'
import { GLOSARIO } from '@/dominio/glosario'
import { Nota } from './piezas'
import { formatearPorcentaje } from '@/dominio/gestion'
import type { EspacioDeGestion } from '@/datos/portal'

/**
 * El cierre del tablero: los mismos conteos, repartidos por {espacio}.
 *
 * Sólo se dibuja cuando hay más de uno. Con un solo {espacio} esta tabla repetiría fila por fila lo
 * que ya se leyó arriba, y una repetición al final de un tablero se lee como si fuera otro dato.
 *
 * Trae SÓLO conteos, y no por olvido: los conteos son lo único aditivo. La mediana de dos {espacios}
 * no es el promedio de sus medianas ni su suma, así que repartir los tiempos por {espacio}
 * publicaría un número que no es la mediana de nada. El porcentaje en plazo sí se puede calcular
 * acá, porque sale de dos conteos de la misma fila.
 */
export function PorEspacio ({ espacios }: { espacios: EspacioDeGestion[] }) {
  if (espacios.length <= 1) return null

  return (
    <Bloque titulo={`Por ${GLOSARIO.espacio.singular}`}>
      <div data-lenis-prevent className="overflow-x-auto">
        <table className="w-full min-w-[38rem] border-collapse text-sm">
          <thead>
            <tr className="border-linea border-b">
              <th scope="col" className="text-texto-tenue px-2 py-2 text-left text-xs font-medium">
                {GLOSARIO.espacio.singular}
              </th>
              <th scope="col" className="text-texto-tenue px-2 py-2 text-right text-xs font-medium">Recibidas</th>
              <th scope="col" className="text-texto-tenue px-2 py-2 text-right text-xs font-medium">Cerradas</th>
              <th scope="col" className="text-texto-tenue px-2 py-2 text-right text-xs font-medium">Abiertas</th>
              <th scope="col" className="text-texto-tenue px-2 py-2 text-right text-xs font-medium">Bloqueadas</th>
              <th scope="col" className="text-texto-tenue px-2 py-2 text-right text-xs font-medium">Vencidas</th>
              <th scope="col" className="text-texto-tenue px-2 py-2 text-right text-xs font-medium">En plazo</th>
            </tr>
          </thead>
          <tbody>
            {espacios.map((espacio) => (
              <tr key={espacio.id} className="border-linea-suave border-b last:border-b-0">
                <th scope="row" className="text-texto px-2 py-2 text-left font-normal">{espacio.name}</th>
                <td className="text-texto-tenue px-2 py-2 text-right tabular-nums">{espacio.recibidas}</td>
                <td className="text-texto-tenue px-2 py-2 text-right tabular-nums">{espacio.cerradas}</td>
                <td className="text-texto-tenue px-2 py-2 text-right tabular-nums">{espacio.abiertas_al_cierre}</td>
                <td className="text-texto-tenue px-2 py-2 text-right tabular-nums">{espacio.bloqueadas}</td>
                <td className="text-texto-tenue px-2 py-2 text-right tabular-nums">{espacio.vencidas_al_cierre}</td>
                <td className="text-texto px-2 py-2 text-right font-semibold tabular-nums">
                  {formatearPorcentaje(
                    espacio.comprometidas === 0
                      ? null
                      : Math.round((espacio.en_plazo * 100) / espacio.comprometidas)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3">
        <Nota>
          Acá van sólo conteos. Los tiempos de respuesta no se reparten por {GLOSARIO.espacio.singular}:
          la mediana de dos {GLOSARIO.espacio.plural.toLowerCase()} no es el promedio de sus medianas,
          y publicarla como si lo fuera sería publicar un número que no es la mediana de nada. Un
          guion en «en plazo» es un {GLOSARIO.espacio.singular} sin nada comprometido en el mes, no un
          cero.
        </Nota>
      </div>
    </Bloque>
  )
}
