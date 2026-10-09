import Link from 'next/link'
import { Boton, boton } from '@/componentes/formularios/Boton'
import { ContenidoSelector, DisparadorSelector, Opcion, Selector } from '@/componentes/formularios/Selector'
import { POR_PAGINA_MAXIMO } from '@/datos/consulta'
import type { Paginacion } from '@/datos/tipos'
import type { EstadoConsulta } from '@/definiciones/tipos'
import { cn } from '@/lib/clases'
import { opcionesPorPagina } from './tabla'

interface PropsPaginacion {
  paginacion: Paginacion | undefined
  /** Modo controlado: devuelve la pagina (o el tamaño de pagina) elegida por callback. */
  onCambiar?: (parcial: Partial<EstadoConsulta>) => void
  /**
   * Modo enlaces: la URL de la pagina anterior y de la siguiente. Es el de las pantallas que se pintan
   * en el servidor, donde la pagina vive en la URL y un callback no puede cruzar al cliente.
   */
  enlaces?: { anterior: string, siguiente: string }
  /** Ofrece elegir las filas por pagina. Solo en modo controlado; por defecto, si. */
  conPorPagina?: boolean
  /** Si viene, el bloque es un `nav` con este nombre accesible. */
  etiqueta?: string
  className?: string
}

/**
 * Paginacion de un listado, leida de `meta.pagination`.
 *
 * Sin `meta` no se dibuja nada: inventar "pagina 1 de 1" cuando el backend no dijo cuantas hay es
 * afirmar algo que no se sabe.
 *
 * Con una sola pagina que ademas entra holgada tampoco se dibuja nada: "Pagina 1 de 1" repite el total
 * que ya esta en la cabecera del listado, y el selector de filas por pagina y los dos botones no
 * llevan a ningun lado. Se vuelven a mostrar en cuanto hay una segunda pagina o el tamaño de pagina
 * empieza a recortar.
 *
 * @param props la paginacion y, segun el modo, el callback o las dos URLs
 * @returns el pie con el conteo y los saltos, o nada
 */
export function PaginacionTabla ({ paginacion, onCambiar, enlaces, conPorPagina = true, etiqueta, className }: PropsPaginacion) {
  if (paginacion === undefined) return null

  const { page, per_page: porPagina, total, total_pages: totalPaginas } = paginacion
  const eligePorPagina = conPorPagina && enlaces === undefined && onCambiar !== undefined

  if (totalPaginas <= 1 && (!eligePorPagina || total <= porPagina)) return null

  const Contenedor = etiqueta === undefined ? 'div' : 'nav'

  return (
    <Contenedor
      aria-label={etiqueta}
      className={cn('text-texto-tenue flex flex-wrap items-center justify-between gap-2 text-xs', className)}
    >
      <p aria-live="polite">
        Página {page} de {Math.max(1, totalPaginas)} · {total} en total
      </p>

      <div className="flex items-center gap-2">
        {eligePorPagina && (
          <Selector
            value={String(porPagina)}
            onValueChange={(valor) => onCambiar?.({ porPagina: Number(valor), pagina: 1 })}
          >
            <DisparadorSelector aria-label="Filas por página" className="w-24" />
            <ContenidoSelector>
              {opcionesPorPagina(POR_PAGINA_MAXIMO, porPagina).map((cantidad) => (
                <Opcion key={cantidad} value={String(cantidad)}>{cantidad}</Opcion>
              ))}
            </ContenidoSelector>
          </Selector>
        )}

        <SaltoDePagina
          etiqueta="Anterior"
          hayADonde={page > 1}
          href={enlaces?.anterior}
          onIr={() => onCambiar?.({ pagina: page - 1 })}
        />
        <SaltoDePagina
          etiqueta="Siguiente"
          hayADonde={page < totalPaginas}
          href={enlaces?.siguiente}
          onIr={() => onCambiar?.({ pagina: page + 1 })}
        />
      </div>
    </Contenedor>
  )
}

interface PropsSaltoDePagina {
  etiqueta: string
  hayADonde: boolean
  /** Con URL es un enlace; sin ella, un boton que llama a `onIr`. */
  href?: string
  onIr: () => void
}

/**
 * Un salto de pagina con el aspecto de boton chico, apagado cuando no hay a donde ir.
 *
 * @param props etiqueta, si hay pagina de destino y como llegar a ella
 * @returns el boton, el enlace o su version apagada
 */
function SaltoDePagina ({ etiqueta, hayADonde, href, onIr }: PropsSaltoDePagina) {
  if (href === undefined) {
    return <Boton tamano="chico" disabled={!hayADonde} onClick={onIr}>{etiqueta}</Boton>
  }

  if (!hayADonde) {
    return (
      <span
        aria-disabled="true"
        className={cn(boton({ tamano: 'chico' }), 'bg-relleno-neutro text-texto-sutil hover:bg-relleno-neutro cursor-not-allowed border-transparent')}
      >
        {etiqueta}
      </span>
    )
  }

  return <Link href={href} className={boton({ tamano: 'chico' })}>{etiqueta}</Link>
}
