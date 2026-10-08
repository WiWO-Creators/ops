import type { CSSProperties, ReactElement } from 'react'
import { Personaje } from '@/componentes/estructura/bienvenida/Personaje'
import { Arana, Calabaza, Fantasma } from '@/componentes/modos/Dibujos'

/** Lo que el escriba está haciendo. */
export type FaseDelEscriba = 'subiendo' | 'escuchando' | 'redactando'

interface PropsEscena {
  fase: FaseDelEscriba
  /** Avance de la subida, 0-100. Solo se usa en la fase `subiendo`. */
  porcentaje: number
}

/** Barras de la onda de audio: son el avance mismo, cada una se enciende al llegar la subida. */
const BARRAS = Array.from({ length: 26 }, (_, i) => 4 + Math.round(Math.abs(Math.sin(i * 0.83) * Math.cos(i * 0.31)) * 15))
const ONDA = { x: 84, paso: 5, y: 66 }
/** Donde apoya la mano el escriba: de ahí sale la soga. */
const MANO = { x: 57, y: 66 }
/** Renglones de la hoja: ancho de cada uno. */
const RENGLONES = [48, 40, 52, 34, 44]

/**
 * El escriba: alguien que tira de la onda de audio mientras sube, la escucha con audífonos y la
 * va escribiendo en una hoja.
 *
 * La onda ES la barra de avance: cada barra se enciende cuando la subida la alcanza y el escriba
 * tira de la soga hasta el borde encendido. Con la subida completa pasa a escuchar —las barras
 * laten— y cuando el modelo empieza a escribir, la pluma recorre la hoja renglón por renglón.
 *
 * Todo el movimiento es CSS (`estilos/escriba.css`) y el atributo `data-fase` lo elige. El dibujo
 * está escrito en su pose final y quieta, así que con `prefers-reduced-motion` se ve completo y
 * sin moverse. En Halloween (`data-modo` de `<html>`) la hoja la redacta una calabaza con una
 * araña en el nudo y un fantasma mirando, sin que este componente sepa nada del modo.
 *
 * @param fase qué hace el escriba ahora
 * @param porcentaje avance de la subida, 0-100
 * @returns escena SVG decorativa; el estado accesible lo dice quien la monta
 */
export function EscenaDelEscriba ({ fase, porcentaje }: PropsEscena): ReactElement {
  const avance = Math.max(0, Math.min(100, porcentaje)) / 100
  const encendidas = fase === 'subiendo' ? Math.floor(avance * BARRAS.length) : BARRAS.length
  const borde = ONDA.x + avance * BARRAS.length * ONDA.paso

  return (
    <svg
      aria-hidden
      viewBox="0 0 300 110"
      className="escriba mx-auto block h-auto w-full max-w-[22rem]"
      data-fase={fase}
    >
      <g className="escriba-tiron">
        <g className="escriba-normal">
          <Personaje x={36} y={100} escala={1.6} camisa="fill-acento-suave" />
        </g>
        <g className="escriba-halloween">
          <Personaje x={36} y={100} escala={1.6} camisa="fill-acento-suave" sinCabeza />
          <Calabaza x={21} y={19} width={30} height={28} />
        </g>
        <path className="escriba-diadema" d="M24 33 a12 12 0 0 1 24 0" fill="none" strokeWidth="2.4" strokeLinecap="round" />
        <ellipse className="escriba-copa" cx="23.5" cy="35" rx="2.8" ry="4.4" />
        <ellipse className="escriba-copa" cx="48.5" cy="35" rx="2.8" ry="4.4" />
      </g>

      <line
        className="escriba-soga"
        x1={MANO.x}
        y1={MANO.y}
        x2={borde}
        y2={ONDA.y}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray="1 3"
      />

      <g>
        {BARRAS.map((alto, i) => (
          <line
            key={i}
            className="escriba-barra"
            data-encendida={i < encendidas ? '' : undefined}
            style={{ '--i': i } as CSSProperties}
            x1={ONDA.x + i * ONDA.paso}
            x2={ONDA.x + i * ONDA.paso}
            y1={ONDA.y - alto}
            y2={ONDA.y + alto}
            strokeWidth="3"
            strokeLinecap="round"
          />
        ))}
      </g>

      <g className="escriba-nudo">
        <circle className="escriba-normal" cx={borde} cy={ONDA.y} r="4.5" />
        <Arana className="escriba-halloween" x={borde - 8} y={ONDA.y - 8} width={16} height={16} />
      </g>

      <rect className="escriba-hoja" x="226" y="22" width="68" height="78" rx="6" strokeWidth="1.6" />
      {RENGLONES.map((ancho, i) => (
        <g key={i}>
          <rect className="escriba-renglon" x="236" y={38 + i * 13} width={ancho} height="4" rx="2" />
          <rect
            className="escriba-tinta"
            style={{ '--i': i } as CSSProperties}
            x="236"
            y={38 + i * 13}
            width={ancho}
            height="4"
            rx="2"
          />
        </g>
      ))}
      <path className="escriba-pluma" d="M236 40 l6 -9 l2 1.4 l-6 9 z" />

      <Fantasma className="escriba-halloween escriba-fantasma" x={262} y={2} width={26} height={26} />
    </svg>
  )
}
