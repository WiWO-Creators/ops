import { Bloque } from '@/app/portal/(dentro)/detalle'
import { formatearNumero } from '@/componentes/proyecto/ResumenProyecto'
import { Cifra, Nota } from './piezas'
import type { CambiosGestion } from '@/datos/portal'

/**
 * Lo que entró fuera de lo planificado.
 *
 * El número es un <strong>proxy</strong> y el bloque lo dice en pantalla, no en un comentario: se
 * cuentan las entradas del mes que no cuelgan de ningún hito, más las que se crearon y se
 * comprometieron dentro del mismo mes. Es una aproximación razonable de «esto no estaba previsto» y
 * no una lista de pedidos fuera de alcance, y presentarlo como lo segundo convertiría una
 * estimación en una acusación.
 *
 * Va casi al final del tablero a propósito: es informativo, no accionable. Nadie sale de la reunión
 * a hacer algo con este número.
 */
export function Cambios ({ cambios }: { cambios: CambiosGestion }) {
  return (
    <Bloque titulo="Cambios y urgencias">
      <div className="flex flex-col gap-4">
        <Cifra
          etiqueta="Entradas no planificadas"
          valor={formatearNumero(cambios.entradas_no_planificadas)}
          detalle="Aproximado"
        />

        {cambios.estimado && (
          <Nota tono="aviso">
            Este número es una <strong>estimación</strong>, no un conteo exacto: contamos lo que entró
            sin colgar de ningún hito y lo que se pidió y se comprometió dentro del mismo mes. Sirve
            para ver si el mes tuvo mucha entrada imprevista; no para discutir caso por caso.
          </Nota>
        )}
      </div>
    </Bloque>
  )
}
