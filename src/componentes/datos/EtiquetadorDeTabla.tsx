'use client'

import { useLayoutEffect, useRef } from 'react'
import { repartirColumnas, ubicarCeldas, type ColumnaDeTabla, type PrioridadDeColumna } from './tarjetasDeTabla'

/**
 * Le escribe a cada celda de la tabla su rol y la etiqueta de su columna, para el modo tarjetas.
 *
 * No pinta nada: es un marcador oculto que busca la tabla de su contenedor. Va aparte de `Tabla`
 * para que `Tabla` siga siendo un componente de servidor —la usan pantallas que no son cliente— y
 * lo único que corre en el navegador sea esto.
 *
 * Se trabaja sobre el DOM y no sobre los hijos de React porque las celdas llegan armadas por cada
 * pantalla, con componentes propios en el medio: leer su estructura desde `children` obligaría a
 * que todas pasaran por un mismo formato. El `th` de cada columna ya dice todo lo necesario.
 *
 * Un `MutationObserver` repite el trabajo cuando cambian las filas (paginar, filtrar, refrescar) o
 * las columnas (el selector de columnas de `TablaRecurso`). Escribir atributos no dispara el
 * observador, que solo mira hijos, así que no hay bucle.
 *
 * @param principales cuántas columnas forman el título de la tarjeta
 */
export function EtiquetadorDeTabla ({ principales }: { principales: number }) {
  const marcador = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const tabla = marcador.current?.parentElement?.querySelector(':scope > table')
    if (!(tabla instanceof HTMLTableElement)) return

    const etiquetar = () => { etiquetarTabla(tabla, principales) }
    etiquetar()

    const observador = new MutationObserver(etiquetar)
    observador.observe(tabla, { childList: true, subtree: true })
    return () => { observador.disconnect() }
  }, [principales])

  return <span ref={marcador} hidden />
}

/**
 * Escribe `data-rol`, `data-etiqueta` y el índice de entrada en todas las filas del cuerpo.
 *
 * @param tabla la tabla a etiquetar
 * @param principales cuántas columnas forman el título
 */
function etiquetarTabla (tabla: HTMLTableElement, principales: number): void {
  const encabezados = [...(tabla.tHead?.rows[0]?.cells ?? [])]
  const columnas = encabezados.map(leerColumna)
  const roles = repartirColumnas(columnas, principales)

  for (const cuerpo of tabla.tBodies) {
    [...cuerpo.rows].forEach((fila, indice) => {
      fila.style.setProperty('--indice-tarjeta', String(indice))
      const celdas = [...fila.cells]
      const ubicadas = ubicarCeldas(celdas.map((celda) => celda.colSpan), roles)

      celdas.forEach((celda, posicion) => {
        const ubicada = ubicadas[posicion]
        if (ubicada === undefined) return
        escribir(celda, 'rol', ubicada.rol)
        escribir(celda, 'etiqueta', columnas[ubicada.columna]?.etiqueta ?? '')
      })
    })
  }
}

/** Escribe un atributo `data-*` solo si cambió, para no repintar la tabla entera en cada pasada. */
function escribir (celda: HTMLTableCellElement, clave: 'rol' | 'etiqueta', valor: string): void {
  if (celda.dataset[clave] !== valor) celda.dataset[clave] = valor
}

/**
 * Lee lo que el reparto necesita de un encabezado.
 *
 * La etiqueta es el texto VISIBLE: el `sr-only` de "Acciones" existe para el lector de pantalla y
 * no convierte a esa columna en un dato con título. `data-etiqueta` en el `th` gana si está.
 */
function leerColumna (encabezado: HTMLTableCellElement): ColumnaDeTabla {
  const copia = encabezado.cloneNode(true) as HTMLElement
  for (const oculto of copia.querySelectorAll('.sr-only')) oculto.remove()

  const prioridad = encabezado.dataset.prioridad
  return {
    etiqueta: (encabezado.dataset.etiqueta ?? copia.textContent ?? '').trim(),
    angosta: encabezado.hasAttribute('data-angosta'),
    prioridad: esPrioridad(prioridad) ? prioridad : null
  }
}

function esPrioridad (valor: string | undefined): valor is PrioridadDeColumna {
  return valor === 'principal' || valor === 'secundaria' || valor === 'oculta'
}
