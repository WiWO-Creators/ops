import Link from 'next/link'
import type { ReactNode } from 'react'
import { Etiquetas } from '@/componentes/presentadores/Etiqueta'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { ImagenEntidad } from '@/componentes/presentadores/ImagenEntidad'
import { Insignia } from '@/componentes/presentadores/Insignia'
import type { Cliente } from '@/datos/recursos'
import { cn } from '@/lib/clases'
import { enlaceDeSitio } from './cliente'

/**
 * Tarjeta de un Cliente en el listado.
 *
 * Muestra **exactamente los campos de la tabla** —empresa, RUT, teléfono, ciudad, activo y alta— mas
 * las etiquetas: la vista de tarjetas es otra lectura de la misma fila, no una fila con mas datos.
 * Pedir campos extra la desincronizaria de la tabla y del CSV, que salen de la misma definicion.
 *
 * El enlace vive en el titulo y no en la tarjeta entera, igual que en `TarjetaProyecto`: un `div`
 * clickeable no se alcanza con teclado, y envolver toda la tarjeta en un `<a>` mete el estado y las
 * etiquetas dentro del nombre del enlace.
 *
 * @param cliente fila tal como la devuelve `GET /clients`
 */
export function TarjetaCliente ({ cliente, className }: { cliente: Cliente, className?: string }) {
  const sitio = enlaceDeSitio(cliente.website)
  const lugar = [cliente.city, cliente.state].filter((parte) => parte !== null && parte !== '').join(', ')

  const datos: Array<{ etiqueta: string, contenido: ReactNode }> = [
    { etiqueta: 'RUT', contenido: cliente.vat },
    { etiqueta: 'Teléfono', contenido: cliente.phonenumber },
    { etiqueta: 'Ciudad', contenido: lugar },
    { etiqueta: 'Alta', contenido: <Fecha valor={cliente.datecreated} className="text-xs" /> }
  ].filter((dato) => dato.contenido !== null && dato.contenido !== '')

  return (
    <article
      className={cn(
        'border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex h-full flex-col gap-3 border p-4',
        'ease-neo transition-[transform,box-shadow] duration-150',
        'hover:shadow-2 hover:scale-[1.01] focus-within:shadow-2 active:scale-[0.99]',
        className
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <ImagenEntidad nombre={cliente.company} imagenPropia={cliente.image_url} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="truncate text-base leading-tight font-semibold">
            <Link href={`/clientes/${cliente.id}`} className="hover:text-acento">
              {cliente.company}
            </Link>
          </h3>

          {/* Sin sitio no se escribe "Sin sitio web": en la base real la mayoria no lo tiene, y esa
              leyenda repetida en cada tarjeta ocupa mas lugar que los datos que si hay. */}
          {sitio !== null && (
            <a
              href={sitio}
              target="_blank"
              rel="noreferrer"
              className="text-texto-tenue hover:text-acento truncate text-xs underline-offset-4 hover:underline"
            >
              {cliente.website}
            </a>
          )}
        </div>

        {/* Contorno y no `exito` para el activo: el verde de marca es relleno, y un cliente activo es
            el caso normal — pintarlo de color haria que la mayoria de las tarjetas gritaran lo mismo. */}
        <Insignia tono={cliente.active ? 'contorno' : 'aviso'} tamano="chico">
          {cliente.active ? 'Activo' : 'Inactivo'}
        </Insignia>
      </header>

      {/* Solo los pares que traen dato. En la instalacion real casi ningun cliente tiene RUT, telefono
          ni ciudad: pintar los cuatro pares siempre convierte la tarjeta en una grilla de guiones que
          pesa mas que la informacion. El guion tiene sentido en una tabla, donde la columna existe
          igual y hay que sostener la alineacion; en una tarjeta suelta, no. */}
      {datos.length > 0 && (
        <dl className="grid grid-cols-2 gap-2 text-xs">
          {datos.map((dato) => (
            <Dato key={dato.etiqueta} etiqueta={dato.etiqueta}>{dato.contenido}</Dato>
          ))}
        </dl>
      )}

      <Etiquetas etiquetas={cliente.tags} maximo={3} className="mt-auto" />
    </article>
  )
}

/** Par etiqueta/valor de la tarjeta. La etiqueta va en versalita, como en `TarjetaProyecto`. */
function Dato ({ etiqueta, children }: { etiqueta: string, children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-texto-sutil truncate text-[0.6875rem] font-medium tracking-[0.08em] uppercase">
        {etiqueta}
      </dt>
      <dd className="text-texto truncate">{children}</dd>
    </div>
  )
}
