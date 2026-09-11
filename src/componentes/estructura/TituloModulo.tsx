import { cn } from '@/lib/clases'

/**
 * El encabezado de una pantalla del panel: titulo con gradiente, barra de marca y descripcion.
 *
 * === POR QUE UN COMPONENTE Y NO UN `h1` EN CADA PAGINA ===
 *
 * Porque hasta ahora eran catorce `h1` sueltos con la misma cadena de clases copiada, y ya habian
 * divergido: unas paginas decian `text-xl font-semibold` y otras `font-titular text-pantalla
 * font-extrabold`. Un cambio de estilo del encabezado era una busqueda global; ahora es un archivo.
 *
 * El titulo comparte el degradado de marca y el ciclo de brillo del saludo de Inicio.
 * La preferencia de movimiento reducido se respeta desde los estilos globales.
 *
 * === SERVIDOR, NO CLIENTE ===
 *
 * No tiene estado ni eventos. La animacion es CSS, asi que no hay motivo para mandar este arbol al
 * navegador ni para envolverlo en `'use client'`.
 */
interface PropsTituloModulo {
  /** El nombre de la pantalla. Va en el `h1` y es lo unico obligatorio. */
  titulo: string
  /** Una linea que explica para que sirve la pantalla. Se omite si no aporta. */
  descripcion?: string
  /** Botones o filtros que viven a la derecha del titulo, en la misma fila. */
  acciones?: React.ReactNode
  className?: string
}

export function TituloModulo ({ titulo, descripcion, acciones, className }: PropsTituloModulo) {
  return (
    <header className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="font-titular text-pantalla text-balance font-extrabold tracking-tight">
            {/*
              El gradiente va en un `span` interior y no en el `h1`: `background-clip: text` sobre el
              bloque entero recorta tambien la caja, y con ella el espacio de linea. Sobre el texto
              en linea recorta solo las letras.
            */}
            <span className="texto-gradiente-animado">{titulo}</span>
          </h1>

          {/* La barra es decorativa: el `h1` de arriba ya nombra la pantalla para quien no la ve. */}
          <span
            aria-hidden="true"
            className="bg-gradiente-marca h-1 w-16 shrink-0 rounded-full"
          />
        </div>

        {acciones !== undefined && <div className="flex shrink-0 flex-wrap items-center gap-2">{acciones}</div>}
      </div>

      {descripcion !== undefined && (
        <p className="text-texto-tenue max-w-prose text-pretty text-sm">{descripcion}</p>
      )}
    </header>
  )
}
