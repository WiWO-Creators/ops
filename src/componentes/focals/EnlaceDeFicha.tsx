import type { ReactNode } from 'react'

/**
 * Una línea "Ficha de…" con su destino: el enlace canónico de la entidad (`EnlaceCliente`,
 * `EnlaceProyecto`) precedido de la etiqueta que dice a dónde lleva.
 *
 * Vive en el detalle de cada fila y no en la fila: la fila entera abre y cierra, y un enlace dentro
 * de un botón no existe. La etiqueta es la que nombra el destino y el enlace subrayado, el que lo
 * ofrece; si quien mira no puede entrar a esa ficha, el enlace canónico se degrada a texto plano y
 * la línea sigue leyéndose bien.
 *
 * @param etiqueta lo que se abre, p. ej. "Ficha del cliente"
 * @param children el enlace canónico de la entidad, con `className={CLASES_DE_ENLACE_DE_FICHA}`
 */
export function EnlaceDeFicha ({ etiqueta, children }: { etiqueta: string, children: ReactNode }) {
  return (
    <p className="text-texto-tenue flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs pointer-coarse:min-h-11">
      <span>{etiqueta}:</span>
      {children}
    </p>
  )
}

/** Cómo se pinta el enlace de {@link EnlaceDeFicha}: subrayado siempre, para que se vea que lleva a otra parte. */
export const CLASES_DE_ENLACE_DE_FICHA = 'text-acento inline-block max-w-full text-xs underline underline-offset-4 pointer-coarse:py-3'
