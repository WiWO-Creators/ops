'use client'

import Form from 'next/form'
import { rotularMes } from '@/dominio/gestion'

/**
 * El selector de mes del tablero: aplica al elegir, sin pulsar «Ver mes».
 *
 * Sigue siendo un formulario GET —el mes vive en `?mes=` y el resultado se comparte por enlace—, pero
 * con `next/form` la navegación es del lado del cliente y el servidor vuelve a pedir el tablero sin
 * recargar la página. Sin JavaScript degrada al GET de siempre, y por eso el botón queda dentro de
 * `<noscript>`: solo existe cuando elegir no basta.
 *
 * El formulario reenvía `tab` porque `action=""` descarta el resto de la URL, y sin él cambiar de
 * mes devolvía a la persona a la primera pestaña.
 *
 * @param mes el mes cerrado elegido, o `null` para el tablero vivo
 * @param meses los meses cerrados ofrecidos, del más nuevo al más viejo
 * @param pestania la pestaña abierta, que el cambio de mes no debe perder
 */
export function SelectorDeMesDelTablero (
  { mes, meses, pestania }: { mes: string | null, meses: string[], pestania: string }
) {
  return (
    <Form action="" scroll={false} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="tab" value={pestania} />
      <label className="flex flex-col gap-1">
        <span className="text-texto-tenue text-xs font-medium">Mes</span>
        <select
          name="mes"
          defaultValue={mes ?? ''}
          onChange={(evento) => { evento.currentTarget.form?.requestSubmit() }}
          className="border-linea rounded-medio bg-superficie text-texto h-9 border px-2 text-sm"
        >
          <option value="">Mes en curso</option>
          {meses.map((opcion) => (
            <option key={opcion} value={opcion}>{rotularMes(opcion)}</option>
          ))}
        </select>
      </label>
      <noscript>
        <button
          type="submit"
          className="border-linea rounded-medio bg-superficie-elevada text-texto hover:bg-hover h-9 cursor-pointer border px-4 text-sm font-medium"
        >
          Ver mes
        </button>
      </noscript>
    </Form>
  )
}
