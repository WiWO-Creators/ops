import type { Metadata } from 'next'
import { Vacio } from '@/componentes/estado/Estados'
import { formatearFecha } from '@/lib/fechas'
import { pedirPortal } from '@/datos/servidor'
import type { ArchivoPortal } from '@/datos/portal'

export const metadata: Metadata = { title: 'Archivos · Portal de clientes' }

/**
 * Archivos que compartimos con el cliente.
 *
 * La descarga va por `<a href>` directo al BFF: el binario lo sirve la API con `attachment`, asi que
 * el navegador lo guarda sin que haya que interceptar nada.
 */
export default async function ArchivosPagina () {
  const { data } = await pedirPortal<ArchivoPortal[]>('/portal/files')

  if (data.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-texto text-xl font-semibold">Archivos</h1>
        <Vacio titulo="Sin archivos" descripcion="Todavía no compartimos archivos con vos." />
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-texto text-xl font-semibold">Archivos</h1>

      <ul className="flex flex-col gap-2">
        {data.map((archivo) => (
          <li
            key={archivo.id}
            className="rounded-tarjeta border-linea bg-superficie-elevada shadow-1 flex flex-wrap items-center gap-3 border p-4"
          >
            <a
              href={enlaceDeDescarga(archivo)}
              className="text-texto hover:text-acento text-sm font-medium underline-offset-4 hover:underline"
            >
              {archivo.file_name}
            </a>
            <span className="text-texto-tenue ml-auto text-sm">{formatearFecha(archivo.date_added)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * A donde apunta la descarga.
 *
 * La API devuelve rutas propias (`/api/v1/files/...`) para lo que vive en el servidor y URLs enteras
 * para los adjuntos externos. Las primeras pasan por el BFF, que es el unico que tiene el token; las
 * segundas van tal cual, porque no hay nada nuestro que autorizar.
 */
function enlaceDeDescarga (archivo: ArchivoPortal): string {
  const url = archivo.url ?? ''

  return url.startsWith('/api/v1/') ? `/api/bff${url.slice('/api/v1'.length)}` : url
}
