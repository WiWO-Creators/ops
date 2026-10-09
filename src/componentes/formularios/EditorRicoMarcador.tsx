import { AreaTexto } from './Entrada'

/**
 * Altura minima del editor en funcion de `--filas-rico`, que fija el contenedor de `EditorRico`.
 *
 * Una sola formula para el marcador y el editor real: el alto no salta cuando termina de cargar el
 * bundle. `1.625em` es el interlineado de `text-sm leading-relaxed` y `1rem` el relleno vertical.
 */
export const ALTO_MINIMO_RICO = 'calc(var(--filas-rico, 4) * 1.625em + 1rem)'

/**
 * Lo que se ve mientras el editor carga: un area de texto deshabilitada del mismo alto.
 *
 * Sin `'use client'` ni hooks: lo dibuja `next/dynamic` como `loading` y el propio editor mientras
 * Tiptap monta.
 */
export function EditorRicoMarcador ({ etiqueta }: { etiqueta?: string }) {
  return (
    <AreaTexto
      disabled
      aria-label={etiqueta === undefined ? 'Cargando el editor' : `${etiqueta} (cargando el editor)`}
      style={{ minHeight: ALTO_MINIMO_RICO }}
    />
  )
}
