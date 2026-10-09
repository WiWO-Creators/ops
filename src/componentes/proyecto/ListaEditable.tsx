'use client'

import { startTransition, useState, ViewTransition, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'

/** Lo minimo que necesita una fila para vivir en una lista editable: una clave estable. */
interface FilaConClave {
  clave: string | number
}

/** Lo que devuelve `useFilasEditables`. */
export interface FilasEditables<F> {
  filas: F[]
  /** Aplica un cambio a una fila sin tocar las demas. */
  cambiar: (indice: number, parcial: Partial<F>) => void
  /** Mueve una fila un lugar arriba o abajo; fuera de rango no hace nada. */
  mover: (indice: number, salto: -1 | 1) => void
  quitar: (indice: number) => void
  agregar: (fila: F) => void
}

/**
 * Estado de una lista ordenada que se edita fila por fila (los editores de plantillas).
 *
 * Mover, quitar y agregar van en una transicion para que el `<ViewTransition>` de cada fila anime la
 * entrada, la salida y el cambio de lugar. Cambiar un campo no: es escritura, y animarla atrasaria
 * lo que se tipea.
 *
 * @param inicial filas de arranque, o la funcion que las calcula una sola vez
 * @returns las filas y las cuatro operaciones
 */
export function useFilasEditables<F> (inicial: F[] | (() => F[])): FilasEditables<F> {
  const [filas, setFilas] = useState<F[]>(inicial)

  function cambiar (indice: number, parcial: Partial<F>) {
    setFilas((previas) => previas.map((fila, i) => (i === indice ? { ...fila, ...parcial } : fila)))
  }

  function mover (indice: number, salto: -1 | 1) {
    const destino = indice + salto

    startTransition(() => {
      setFilas((previas) => {
        if (destino < 0 || destino >= previas.length) return previas

        const siguientes = [...previas]
        const [movida] = siguientes.splice(indice, 1)

        if (movida === undefined) return previas

        siguientes.splice(destino, 0, movida)

        return siguientes
      })
    })
  }

  function quitar (indice: number) {
    startTransition(() => { setFilas((previas) => previas.filter((_, i) => i !== indice)) })
  }

  function agregar (fila: F) {
    startTransition(() => { setFilas((previas) => [...previas, fila]) })
  }

  return { filas, cambiar, mover, quitar, agregar }
}

interface PropsListaEditable<F extends FilaConClave> {
  /** Titulo de la seccion; el contador se agrega solo. */
  titulo: ReactNode
  /** Botones de alta, a la derecha del titulo. */
  acciones: ReactNode
  /** Nota bajo el encabezado (p. ej. el tope alcanzado). */
  nota?: ReactNode
  /** Texto cuando no hay filas. Sin marco: la lista vacia es un paso que falta, no un error. */
  vacio: ReactNode
  filas: F[]
  /** Prefijo del `name` de cada `<ViewTransition>`; tiene que ser unico en la pantalla. */
  prefijoTransicion: string
  /** Dibuja una fila; tiene que devolver un `<li>`. */
  renderFila: (fila: F, indice: number) => ReactNode
}

/**
 * Esqueleto de lista ordenada editable: encabezado con contador y altas, vacio o `<ol>` con cada
 * fila envuelta en su `<ViewTransition>` (entrar, salir y reordenar).
 *
 * @param props.titulo titulo de la seccion
 * @param props.acciones botones de alta
 * @param props.nota aviso opcional bajo el encabezado
 * @param props.vacio texto sin filas
 * @param props.filas filas a dibujar, con `clave` estable
 * @param props.prefijoTransicion prefijo unico del nombre de transicion
 * @param props.renderFila dibuja el `<li>` de una fila
 * @returns la seccion completa
 */
export function ListaEditable<F extends FilaConClave> ({
  titulo,
  acciones,
  nota,
  vacio,
  filas,
  prefijoTransicion,
  renderFila
}: PropsListaEditable<F>) {
  return (
    <section className="flex flex-col gap-2">
      <div className="border-linea-suave flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <h3 className="text-texto font-titular text-sm font-semibold">
          {titulo}
          {filas.length > 0 && <span className="text-texto-sutil ml-2 font-normal">{filas.length}</span>}
        </h3>
        {acciones}
      </div>

      {nota}

      {filas.length === 0
        ? <p className="text-texto-sutil text-sm">{vacio}</p>
        : (
          <ol className="divide-linea-suave border-linea rounded-tarjeta divide-y border">
            {filas.map((fila, indice) => (
              <ViewTransition key={fila.clave} name={`${prefijoTransicion}-${fila.clave}`} enter="fila-entrar" exit="fila-salir" update="auto" default="none">
                {renderFila(fila, indice)}
              </ViewTransition>
            ))}
          </ol>
          )}
    </section>
  )
}

interface PropsControlesDeOrden {
  indice: number
  ultima: boolean
  /** Nombre accesible del boton de quitar, p. ej. "Quitar ítem". */
  etiquetaQuitar: string
  onMover: (indice: number, salto: -1 | 1) => void
  onQuitar: (indice: number) => void
}

/**
 * Subir, bajar y quitar de una fila de lista editable.
 *
 * @param props.indice posicion de la fila
 * @param props.ultima si es la ultima (deshabilita "Bajar")
 * @param props.etiquetaQuitar nombre accesible de "Quitar"
 * @param props.onMover se llama con el indice y el salto
 * @param props.onQuitar se llama con el indice
 * @returns los tres botones
 */
export function ControlesDeOrden ({ indice, ultima, etiquetaQuitar, onMover, onQuitar }: PropsControlesDeOrden) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Boton
        variante="sutil"
        tamano="chico"
        soloIcono
        aria-label="Subir"
        disabled={indice === 0}
        onClick={() => { onMover(indice, -1) }}
      >
        <ArrowUp size={14} aria-hidden />
      </Boton>
      <Boton
        variante="sutil"
        tamano="chico"
        soloIcono
        aria-label="Bajar"
        disabled={ultima}
        onClick={() => { onMover(indice, 1) }}
      >
        <ArrowDown size={14} aria-hidden />
      </Boton>
      <Boton
        variante="sutil"
        tamano="chico"
        soloIcono
        aria-label={etiquetaQuitar}
        onClick={() => { onQuitar(indice) }}
      >
        <Trash2 size={14} aria-hidden />
      </Boton>
    </div>
  )
}
