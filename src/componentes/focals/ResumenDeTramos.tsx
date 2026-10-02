import { TRAMOS } from '@/componentes/clientes/SemaforoCliente'
import { contarPorTramo, type ScoreEspacio } from '@/datos/focals'
import { textoDeRecuento } from '@/dominio/cartera'
import { ORDEN_DE_TRAMOS } from '@/dominio/tramos-de-semaforo'
import { cn } from '@/lib/clases'

/**
 * Cómo se reparten los Proyectos de una cuenta entre los cuatro tramos.
 *
 * Es el recuento de al lado, dibujado. Existe porque "6 Proyectos · 5 críticos" obliga a leer dos
 * números y dividirlos mentalmente, y la misma información como una barra casi entera en rojo no
 * obliga a nada. El texto queda igual al lado: la barra sola sería color sin palabras, que es
 * ilegible para quien no distingue el rojo del verde y en una captura en blanco y negro.
 *
 * `aria-hidden` porque el recuento escrito ya lo dice con todas las letras.
 *
 * @param espacios los Proyectos de la cuenta; sin ninguno no se dibuja nada
 */
export function BarraDeReparto ({ espacios }: { espacios: ScoreEspacio[] }) {
  if (espacios.length === 0) return null

  const cuenta = contarPorTramo(espacios)

  return (
    <span
      aria-hidden="true"
      className="bg-superficie-hundida flex h-1.5 w-20 shrink-0 gap-px overflow-hidden rounded-full"
    >
      {ORDEN_DE_TRAMOS
        .filter((tramo) => cuenta[tramo] > 0)
        .map((tramo) => (
          <span
            key={tramo}
            className={TRAMOS[tramo].fondo}
            style={{ width: `${(cuenta[tramo] / espacios.length) * 100}%` }}
          />
        ))}
    </span>
  )
}

/**
 * El recuento escrito de los Proyectos de una cuenta, que permite descartarla sin abrirla.
 *
 * El texto lo arma `textoDeRecuento`: acá solo se pinta.
 *
 * @param espacios los Proyectos de la cuenta
 */
export function RecuentoDeTramos ({ espacios }: { espacios: ScoreEspacio[] }) {
  const sinEspacios = espacios.length === 0

  return (
    <span className={cn('text-xs', sinEspacios ? 'text-texto-sutil' : 'text-texto-tenue')}>
      {textoDeRecuento(espacios)}
    </span>
  )
}
