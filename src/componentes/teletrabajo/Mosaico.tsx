'use client'

import { useRef } from 'react'
import { mosaico } from '@/dominio/teletrabajo'
import { useMedida } from '@/lib/medidas'
import { cn } from '@/lib/clases'
import { FichaParticipante } from './FichaParticipante'
import type { TrackReferenceOrPlaceholder } from '@livekit/components-react'

/**
 * Separacion entre fichas, en pixeles.
 *
 * Tiene que valer lo mismo que la clase `gap-3` de abajo (0.75rem = 12px). El reparto se calcula en
 * JavaScript y se dibuja en CSS: si los dos numeros se separan, el mosaico pide mas espacio del que
 * hay y la ultima fila se corta.
 */
const HUECO = 12

interface PropsMosaico {
  pistas: TrackReferenceOrPlaceholder[]
  /** Identidad de quien mira, para que su ficha se reconozca. */
  miIdentidad: string
  className?: string
}

/**
 * La clave estable de una ficha.
 *
 * Deliberadamente **no** incluye el `trackSid`: una ficha empieza como marcador —alguien con la
 * camara apagada— y se convierte en pista real cuando la prende. Si la clave cambiara en ese
 * momento, React desmontaria la ficha y montaria otra, y el video parpadearia justo al encenderse.
 *
 * @param pista La pista o marcador.
 * @returns Una clave que no cambia mientras la persona siga en la sala.
 */
function claveDe (pista: TrackReferenceOrPlaceholder): string {
  return `${pista.participant.identity}-${pista.source}`
}

/**
 * El mosaico de fichas.
 *
 * Reparte columnas y filas con `mosaico()` sobre la medida real del contenedor, en vez de dejarselo
 * a un `auto-fit` de CSS. La diferencia importa: `auto-fit` sabe cuantas columnas entran a lo ancho
 * pero nunca cuantas filas hay, asi que no puede repartir el alto — y con una sola persona la unica
 * celda se comia el escenario entero y el video salia recortado a pantalla completa.
 */
export function Mosaico ({ pistas, miIdentidad, className }: PropsMosaico) {
  const caja = useRef<HTMLDivElement>(null)
  const { ancho, alto } = useMedida(caja)

  const { columnas, filas, anchoDeFicha } = mosaico(pistas.length, ancho, alto, HUECO)

  return (
    <div
      ref={caja}
      className={cn('grid min-h-0 min-w-0 place-items-center gap-3', className)}
      style={{
        gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${filas}, minmax(0, 1fr))`
      }}
    >
      {pistas.map((pista) => (
        <FichaParticipante
          key={claveDe(pista)}
          pista={pista}
          miIdentidad={miIdentidad}
          // La ficha NO se estira a la celda: mide exactamente la caja 16:9 que `mosaico` calculo y
          // queda centrada. Estirarla es lo que recortaba las caras cuando la celda salia mucho
          // mas ancha que alta. El ancho cero es el primer render, antes de medir.
          style={anchoDeFicha > 0 ? { width: anchoDeFicha } : undefined}
          className="aspect-video"
        />
      ))}
    </div>
  )
}
