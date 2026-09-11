import type { Metadata } from 'next'
import { Vacio } from '@/componentes/estado/Estados'
import { formatearFecha } from '@/lib/fechas'
import { ErrorApi } from '@/datos/errores'
import type { ArchivoPortal } from '@/datos/portal'
import { cargarDetalle, EstadoDeError, NombreDeArchivo } from '../detalle'

export const metadata: Metadata = { title: 'Archivos · Portal de clientes' }

/**
 * Archivos que compartimos con el cliente.
 *
 * La descarga va por `<a href>` directo al BFF: el binario lo sirve la API con `attachment`, asi que
 * el navegador lo guarda sin que haya que interceptar nada.
 *
 * Se pide con `cargarDetalle` por lo mismo que Ayuda: la seccion se apaga desde el panel y entonces
 * la API responde 403 o 404. La navegacion ya no la muestra, pero la URL se puede escribir a mano, y
 * ahi el error generico no explica nada.
 */
export default async function ArchivosPagina () {
  const sobre = await cargarDetalle<ArchivoPortal[]>('/portal/files')

  if (sobre instanceof ErrorApi) {
    return <EstadoDeError error={sobre} volverA="/portal" etiqueta="el inicio" />
  }

  const { data } = sobre

  if (data.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-texto text-xl font-semibold">Archivos</h1>
        <Vacio titulo="Sin archivos" descripcion="Todavía no compartimos archivos contigo." />
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
            <NombreDeArchivo archivo={archivo} />
            <span className="text-texto-tenue ml-auto text-sm">{formatearFecha(archivo.date_added)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
