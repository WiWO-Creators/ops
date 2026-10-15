'use client'

import type { ReactElement, ReactNode } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import type { CambioDeUnidad, SegmentoDePalabras } from '@/dominio/diff-acta'
import type { TramoDeDiferencias, TramoSuelto } from '@/dominio/historial-acta'
import { cn } from '@/lib/clases'

interface PropsDiferencias {
  tramos: readonly TramoDeDiferencias[]
  /** La persona pidió ver un tramo plegado; recibe su posición (`desde`). */
  onAbrirPlegado: (desde: number) => void
}

/**
 * La lista cerrada de etiquetas con que se dibuja el documento.
 *
 * El HTML del acta nunca se inyecta: se leyó a bloques de texto plano (`dominio/diff-acta.ts`) y acá
 * cada bloque se dibuja con una etiqueta de esta lista y su texto entra como hijo de React, que lo
 * escapa. Una etiqueta que no esté en la lista no existe para el dibujo, sea lo que sea que traiga el
 * documento.
 */
const ETIQUETA_DE_BLOQUE = {
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  p: 'p',
  blockquote: 'blockquote'
} as const

/** El aspecto de cada bloque; compacto, porque el panel es angosto. */
const ESTILO_DE_BLOQUE: Readonly<Record<keyof typeof ETIQUETA_DE_BLOQUE | 'li', string>> = {
  h1: 'text-base font-extrabold leading-snug',
  h2: 'text-sm font-bold leading-snug pt-2',
  h3: 'text-sm font-semibold leading-snug',
  p: 'text-sm leading-relaxed',
  blockquote: 'text-sm leading-relaxed italic border-l-2 border-linea pl-3',
  li: 'text-sm leading-relaxed'
}

/** Cómo se distingue cada tipo de cambio: color de fondo, borde lateral y tinta, nunca solo el color. */
const ESTILO_DE_CAMBIO: Readonly<Record<CambioDeUnidad['tipo'], string>> = {
  igual: 'text-texto-tenue',
  eliminado: 'bg-superficie-peligro text-texto-peligro border-texto-peligro rounded-r-chico border-l-2 px-2 py-1',
  insertado: 'bg-superficie-exito text-texto border-texto-exito rounded-r-chico border-l-2 px-2 py-1',
  modificado: 'text-texto border-linea rounded-r-chico border-l-2 px-2 py-1'
}

const ESTILO_BORRADO = 'bg-superficie-peligro text-texto-peligro rounded-sm px-0.5 line-through'
const ESTILO_AGREGADO = 'bg-superficie-exito text-texto rounded-sm px-0.5 font-medium no-underline'

/**
 * El texto de un bloque según cómo cambió.
 *
 * @param cambio el cambio de la unidad
 * @returns el contenido: texto plano, tachado, resaltado o el diff por palabras
 */
function contenidoDe (cambio: CambioDeUnidad): ReactNode {
  if (cambio.tipo === 'eliminado') {
    return <><span className="sr-only">Eliminado: </span><del className="line-through">{cambio.anterior?.texto}</del></>
  }
  if (cambio.tipo === 'insertado') {
    return <><span className="sr-only">Agregado: </span><ins className="no-underline">{cambio.nuevo?.texto}</ins></>
  }
  if (cambio.tipo === 'modificado') return <Palabras segmentos={cambio.segmentos ?? []} />

  return cambio.nuevo?.texto
}

/**
 * El diff por palabras de un bloque corregido: lo que sale tachado en rojo, lo que entra en verde.
 *
 * @param segmentos los tramos que devuelve `diferenciasDePalabras`
 * @returns los tramos separados por espacios
 */
function Palabras ({ segmentos }: { segmentos: readonly SegmentoDePalabras[] }): ReactElement {
  return (
    <>
      {segmentos.map((segmento, posicion) => {
        const texto = segmento.palabras.join(' ')
        const espacio = posicion < segmentos.length - 1 ? ' ' : ''

        if (segmento.tipo === 'borrado') return <span key={posicion}><del className={ESTILO_BORRADO}>{texto}</del>{espacio}</span>
        if (segmento.tipo === 'insertado') return <span key={posicion}><ins className={ESTILO_AGREGADO}>{texto}</ins>{espacio}</span>

        return <span key={posicion}>{texto}{espacio}</span>
      })}
    </>
  )
}

/**
 * Un bloque suelto: título, párrafo, cita o filete.
 *
 * @param tramo el bloque y cómo cambió
 * @returns el elemento de la lista cerrada con su texto
 */
function Bloque ({ tramo }: { tramo: TramoSuelto }): ReactElement {
  if (tramo.etiqueta === 'hr') return <hr className="border-linea my-1" />

  const Elemento = ETIQUETA_DE_BLOQUE[tramo.etiqueta]

  return (
    <Elemento className={cn(ESTILO_DE_BLOQUE[tramo.etiqueta], ESTILO_DE_CAMBIO[tramo.cambio.tipo])}>
      {contenidoDe(tramo.cambio)}
    </Elemento>
  )
}

/**
 * La comparación de dos versiones del Meeting Paper, ya compactada.
 *
 * Eliminado en rojo y tachado, agregado en verde, corregido con las palabras marcadas y lo que no
 * cambió atenuado; los tramos largos sin cambios llegan plegados y se abren con un botón. Dentro del
 * panel el documento va en la tipografía de la interfaz y no con la hoja de marca: esto es una
 * comparación para decidir, no el documento para leer.
 *
 * @param tramos los tramos de `agruparEnTramos`
 * @param onAbrirPlegado se llama con la posición del tramo plegado que se quiere ver
 * @returns la comparación
 */
export function DiferenciasDelActa ({ tramos, onAbrirPlegado }: PropsDiferencias): ReactElement {
  return (
    <div className="flex flex-col gap-2">
      {tramos.map((tramo, posicion) => {
        if (tramo.tipo === 'plegado') {
          return (
            <Boton
              key={`plegado-${tramo.desde}`}
              variante="sutil"
              tamano="chico"
              onClick={() => { onAbrirPlegado(tramo.desde) }}
              className="border-linea w-full border border-dashed"
            >
              {tramo.cantidad === 1 ? '1 bloque sin cambios' : `${tramo.cantidad} bloques sin cambios`}
              <span className="sr-only">: mostrar</span>
            </Boton>
          )
        }

        if (tramo.tipo === 'lista') {
          const Lista = tramo.lista

          return (
            <Lista key={`lista-${posicion}`} className={cn('flex flex-col gap-1 pl-5', tramo.lista === 'ul' ? 'list-disc' : 'list-decimal')}>
              {tramo.cambios.map((cambio, orden) => (
                <li key={orden} className={cn(ESTILO_DE_BLOQUE.li, ESTILO_DE_CAMBIO[cambio.tipo])}>
                  {contenidoDe(cambio)}
                </li>
              ))}
            </Lista>
          )
        }

        return <Bloque key={`bloque-${posicion}`} tramo={tramo} />
      })}
    </div>
  )
}
