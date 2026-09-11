'use client'

import type { ReactElement, ReactNode } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { urlConParametro } from '@/componentes/datos/tabla'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import type { Acta } from '@/datos/recursos'
import { temaDeMarca } from '@/dominio/marcas-acta'
import { cn } from '@/lib/clases'

/**
 * Un Meeting Paper como tarjeta, para la presentación en rejilla del listado del Proyecto.
 *
 * La tabla compara actas entre sí —dos fechas, dos autores, una debajo de la otra—; la tarjeta sirve
 * para reconocer una de un vistazo, y por eso muestra lo que la tabla no puede: de qué marca del
 * holding es el documento y si lo escribió un modelo.
 *
 * Solo pinta lo que el listado ya trae. Los adjuntos y el contenido no vienen en la lista —la API los
 * omite a propósito, ver el tipo `Acta`—, así que la tarjeta no los muestra: pedirlos sería una
 * petición por tarjeta para un dato que cabe en el detalle.
 *
 * @param acta fila tal como la devuelve `GET /projects/{id}/actas`
 */
export function TarjetaActa ({ acta, className }: { acta: Acta, className?: string }): ReactElement {
  const tema = temaDeMarca(acta.brand)

  return (
    <article
      // El filete de marca va en el borde del propio `article` y no en un elemento encima: así lo
      // recorta el redondeo de la tarjeta sin un `overflow-hidden`, que taparía el `::after` con el
      // que el título se estira sobre toda la superficie.
      style={{ borderTopColor: tema.color }}
      className={cn(
        'border-linea bg-superficie-elevada rounded-tarjeta shadow-1 relative flex h-full flex-col gap-2 border border-t-2 p-4',
        'ease-neo transition-[transform,box-shadow] duration-150',
        'hover:shadow-2 hover:scale-[1.01] focus-within:shadow-2 active:scale-[0.99]',
        className
      )}
    >
      <header className="flex items-start justify-between gap-2">
        {/* Mismo criterio que en la tarjeta de Proyecto: el recorte del título vive en un `span`
            interno, porque un `overflow-hidden` más arriba recortaría también el `::after`. */}
        <h3 className="min-w-0 flex-1 text-base leading-tight font-semibold">
          <EnlaceActa acta={acta} className="hover:text-acento block after:absolute after:inset-0 after:content-['']">
            <span className="block truncate">{acta.title}</span>
          </EnlaceActa>
        </h3>

        {acta.source === 'ia' && (
          <Insignia tono="acento" tamano="chico">Escrito con IA</Insignia>
        )}
      </header>

      <p className="text-texto-tenue truncate text-xs">
        {acta.client === '' ? 'Sin cliente' : acta.client}
        {acta.meeting_date !== null && <> · <Fecha valor={acta.meeting_date} /></>}
      </p>

      <p className="text-texto-sutil mt-auto flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
        {/* El punto repite el color del filete porque el filete se pierde cuando la tarjeta está
            sola en una columna angosta; el nombre va escrito al lado porque el color solo no es un
            dato para quien no lo distingue. */}
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tema.color }} />
        {tema.nombre}
        <span aria-hidden="true">·</span>
        <span className="truncate">{acta.author === null ? 'Sin autor' : acta.author.full_name}</span>
        <span aria-hidden="true">·</span>
        <Fecha valor={acta.date_added} />
      </p>
    </article>
  )
}

/**
 * El título del acta como enlace a su detalle, conservando el resto de la vista.
 *
 * Es un enlace de verdad y no un `onClick` porque qué acta se está mirando vive en la URL (`?acta=`):
 * así se comparte, se abre en otra pestaña y "atrás" la cierra. Lo usan las dos presentaciones del
 * listado, la tabla y la tarjeta, para que las dos abran exactamente lo mismo.
 *
 * @param acta el acta a la que se entra
 * @param className estilo del enlace; por defecto, el de una celda de la tabla
 * @param children qué se pinta dentro; por defecto, el título del acta
 */
export function EnlaceActa ({
  acta,
  className = 'text-texto hover:text-acento font-medium underline-offset-4 hover:underline',
  children
}: {
  acta: Acta
  className?: string
  children?: ReactNode
}): ReactElement {
  const params = useSearchParams()

  return (
    <Link
      href={urlConParametro(new URLSearchParams(params.toString()), 'acta', String(acta.id))}
      scroll={false}
      className={className}
    >
      {children ?? acta.title}
    </Link>
  )
}
