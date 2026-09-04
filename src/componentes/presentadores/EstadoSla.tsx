import { TriangleAlert } from 'lucide-react'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { esEstadoSla, formatearDesviacion, SLA } from '@/lib/sla'

/**
 * La senal de plazo, en sus dos formas.
 *
 * Aparece en cinco superficies —detalle del Proceso, tabla, tarjeta del tablero, Inicio y el resumen
 * del Espacio—. Si cada una eligiera su tono no habria sistema, solo cinco decisiones parecidas: por
 * eso el mapa de estado a color vive una sola vez, en `lib/sla.ts`, y las dos formas aca.
 *
 * Un archivo con dos exports sigue el precedente de `CabeceraProyecto.tsx`, que exporta tambien
 * `BarraProgreso`: son la misma idea vista de dos maneras, no dos componentes que se cruzaron.
 */

/**
 * Estado del SLA como insignia.
 *
 * `en_plazo` va en contorno: lo normal no lleva color. Un valor ausente o desconocido **no dibuja
 * nada** — el vacio es vacio, y una insignia gris que dice "sin datos" ocupa el lugar de la que si
 * importa.
 */
export function EstadoSla ({ estado }: { estado: string | null | undefined }) {
  if (!esEstadoSla(estado)) return null

  const { etiqueta, tono } = SLA[estado]

  return <Insignia tono={tono} tamano="chico">{etiqueta}</Insignia>
}

/**
 * Dias de atraso o de adelanto contra el vencimiento comprometido.
 *
 * **No es una insignia, y es a proposito.** La pildora ya esta ocupada por prioridad y estado; una
 * tercera en la misma fila convierte cada linea en un semaforo. El atraso es tipografia roja con un
 * icono de 12px: se distingue de un vistazo sin subir el volumen.
 *
 * El adelanto va en texto tenue y nunca en verde: el verde de marca no puede ser color de texto
 * (`pruebas/marca.test.js` lo verifica).
 *
 * @param dias Positivo = tarde. `null` o ausente no dibuja nada.
 */
export function Desviacion ({ dias }: { dias: number | null | undefined }) {
  const texto = formatearDesviacion(dias)

  if (texto === null) return null

  const tarde = typeof dias === 'number' && dias > 0

  return (
    <span
      className={
        tarde
          ? 'text-texto-peligro inline-flex items-center gap-1 text-xs font-medium tabular-nums'
          : 'text-texto-tenue inline-flex items-center gap-1 text-xs font-medium tabular-nums'
      }
      title={tarde ? 'Días de atraso contra la fecha de entrega' : 'Días contra la fecha de entrega'}
    >
      {tarde && <TriangleAlert size={12} aria-hidden="true" />}
      {texto}
    </span>
  )
}
