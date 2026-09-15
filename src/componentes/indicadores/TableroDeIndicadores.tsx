import { formatearFecha } from '@/lib/fechas'
import { cn } from '@/lib/clases'
import { filasDelTablero, type TonoDeDelta } from '@/dominio/indicadores'
import type { ComparacionDeIndicadores } from '@/datos/recursos'

/**
 * El tablero de la línea base: cada indicador en dos fechas y la diferencia.
 *
 * === Por qué no es un componente de cliente ===
 *
 * Porque no necesita serlo. Los dos desplegables de fecha son un `<form method="get">` de toda la
 * vida: al enviarlo cambia la URL, el servidor vuelve a pedir y la pantalla se repinta. Sin estado,
 * sin `useEffect`, y el resultado se comparte por enlace, que es justo lo que alguien quiere hacer
 * con una comparación antes de una reunión.
 *
 * === Por qué la diferencia lleva color Y palabra ===
 *
 * El número se va a leer para juzgar el trabajo de una cuenta. `−99` en verde y `+4` en rojo dicen
 * lo mismo dos veces —el signo y el tono—, y el `aria-label` lo dice una tercera para quien no ve el
 * color. La misma regla que el semáforo de clientes y la nota de calidad.
 *
 * === Por qué el sentido de cada indicador está declarado y no se deduce del signo ===
 *
 * Porque bajar no siempre es mejorar: menos Proyectos en el corte puede ser una cuenta cerrada. El
 * mapa vive en `dominio/indicadores.ts`, donde se puede probar.
 */

/** Cómo se pinta cada tono de la diferencia. La palabra viaja aparte, en el `aria-label`. */
const TONOS: Record<TonoDeDelta, { clase: string, lectura: string }> = {
  mejora: { clase: 'text-texto-exito', lectura: 'mejora' },
  retroceso: { clase: 'text-texto-peligro', lectura: 'empeora' },
  igual: { clase: 'text-texto-sutil', lectura: 'sin cambio' }
}

export function TableroDeIndicadores ({
  comparacion,
  clienteId
}: {
  comparacion: ComparacionDeIndicadores
  /** El Cliente elegido, para que el formulario no lo pierda al cambiar de fecha. */
  clienteId: string | null
}) {
  const filas = filasDelTablero(comparacion)

  return (
    <section className="flex flex-col gap-4" aria-label="Indicadores de la cuenta">
      <form method="get" className="flex flex-wrap items-end gap-3">
        {clienteId !== null && <input type="hidden" name="filter[client_id]" value={clienteId} />}

        <SelectorDeFecha
          nombre="base"
          etiqueta="Línea base"
          valor={comparacion.base.fecha}
          fechas={comparacion.fechas}
        />
        <SelectorDeFecha
          nombre="corte"
          etiqueta="Corte"
          valor={comparacion.corte.fecha}
          fechas={comparacion.fechas}
        />

        <button
          type="submit"
          className="border-linea rounded-medio bg-superficie-elevada text-texto hover:bg-hover h-9 cursor-pointer border px-4 text-sm font-medium"
        >
          Comparar
        </button>
      </form>

      {/* La tabla es lo único que puede pasarse de ancho en un teléfono: va en su propio scroller
          para que el cuerpo de la página nunca scrollee en horizontal. */}
      <div data-lenis-prevent className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr className="border-linea border-b">
              <th scope="col" className="text-texto-tenue px-2 py-2 text-left text-xs font-medium">
                Indicador
              </th>
              <th scope="col" className="text-texto-tenue px-2 py-2 text-right text-xs font-medium">
                {formatearFecha(comparacion.base.fecha)}
              </th>
              <th scope="col" className="text-texto-tenue px-2 py-2 text-right text-xs font-medium">
                {formatearFecha(comparacion.corte.fecha)}
              </th>
              <th scope="col" className="text-texto-tenue px-2 py-2 text-right text-xs font-medium">
                Diferencia
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={fila.clave} className="border-linea-suave border-b last:border-b-0">
                <th scope="row" className="px-2 py-2 text-left font-normal">
                  <span className="text-texto block">{fila.etiqueta}</span>
                  <span className="text-texto-sutil block text-xs">{fila.detalle}</span>
                </th>
                <td className="text-texto-tenue px-2 py-2 text-right tabular-nums">{fila.base}</td>
                <td className="text-texto px-2 py-2 text-right font-semibold tabular-nums">{fila.corte}</td>
                <td
                  className={cn('px-2 py-2 text-right font-semibold tabular-nums', TONOS[fila.tono].clase)}
                  aria-label={`${fila.delta}, ${TONOS[fila.tono].lectura}`}
                >
                  {fila.delta}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-texto-sutil text-xs">
        Las dos columnas son fotos guardadas, no cuentas hechas ahora: cada noche se escribe una por
        proyecto. Por eso el desplegable solo ofrece días en los que el cálculo corrió.
      </p>
    </section>
  )
}

/** Un desplegable de fecha. Solo ofrece días con foto: el resto devolvería ceros. */
function SelectorDeFecha ({
  nombre,
  etiqueta,
  valor,
  fechas
}: {
  nombre: string
  etiqueta: string
  valor: string
  fechas: string[]
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-texto-tenue text-xs font-medium">{etiqueta}</span>
      <select
        name={nombre}
        defaultValue={valor}
        className="border-linea rounded-medio bg-superficie text-texto h-9 border px-2 text-sm"
      >
        {fechas.map((fecha) => (
          <option key={fecha} value={fecha}>{formatearFecha(fecha)}</option>
        ))}
      </select>
    </label>
  )
}
