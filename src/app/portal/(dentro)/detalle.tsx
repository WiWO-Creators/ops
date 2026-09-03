import { ErrorEstado, SinPermiso, Vacio } from '@/componentes/estado/Estados'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { ErrorApi } from '@/datos/errores'
import { pedirPortal } from '@/datos/servidor'
import type { Sobre } from '@/datos/tipos'
import type { ArchivoPortal } from '@/datos/portal'
import { listaDe } from '@/datos/catalogos'
import { cargarLookupsDelPortal } from '@/datos/lookups'
import Link from 'next/link'

/**
 * Piezas compartidas por las pantallas de detalle del portal.
 *
 * Los cinco detalles —factura, presupuesto, propuesta, contrato y ticket— tienen la misma forma:
 * migaja de vuelta, titulo con su estado, una lista de datos y el cuerpo propio de cada uno. Lo que
 * cambia es el cuerpo, y eso es lo que cada pagina escribe.
 */

/**
 * Pide un detalle sin dejar que un 404 tumbe la pantalla.
 *
 * La API responde 404 tanto si el documento no existe como si es de otro cliente o esta en
 * borrador: es deliberado —un 403 confirmaria que existe— y por eso aca los tres se muestran igual.
 *
 * Devuelve el error como valor en vez de lanzarlo, para que la pagina decida que dibujar.
 */
export async function cargarDetalle<T> (ruta: string): Promise<Sobre<T> | ErrorApi> {
  try {
    return await pedirPortal<T>(ruta)
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}

/** Traduce el error de la API a la pantalla que corresponde. */
export function EstadoDeError ({ error, volverA, etiqueta }: { error: ErrorApi, volverA: string, etiqueta: string }) {
  if (error.estado === 404) {
    return (
      <Vacio
        titulo="No encontramos esto"
        descripcion="Puede que ya no esté disponible."
        accion={<Enlace href={volverA}>Volver a {etiqueta}</Enlace>}
      />
    )
  }

  if (error.estado === 403) return <SinPermiso />

  return <ErrorEstado detalle={error.message} />
}

/** Migaja de vuelta al listado. */
export function Volver ({ href, children }: { href: string, children: React.ReactNode }) {
  return (
    <p className="text-texto-tenue text-sm">
      <Enlace href={href}>← {children}</Enlace>
    </p>
  )
}

function Enlace ({ href, children }: { href: string, children: React.ReactNode }) {
  return (
    <Link href={href} className="hover:text-texto underline-offset-4 hover:underline">
      {children}
    </Link>
  )
}

/**
 * Estado de un documento, resuelto contra el catalogo del portal.
 *
 * Se resuelve en el servidor porque el catalogo ya se pide ahi: mandarlo entero al navegador para
 * pintar una insignia seria cargar seis listas para usar una fila.
 */
export async function EstadoDelPortal ({ catalogo, valor }: { catalogo: string, valor: number }) {
  const lookups = await cargarLookupsDelPortal()
  const opcion = listaDe(lookups, catalogo).find((e) => e.id === valor)

  if (opcion === undefined) return null

  return <Insignia color={opcion.color ?? undefined}>{opcion.name}</Insignia>
}

/**
 * A donde apunta la descarga de un archivo del portal.
 *
 * La API devuelve rutas propias (`/api/v1/files/...`) para lo que vive en el servidor y URLs enteras
 * para los adjuntos externos. Las primeras pasan por el BFF, que es el unico que tiene el token; las
 * segundas van tal cual, porque no hay nada nuestro que autorizar.
 */
export function enlaceDeDescarga (archivo: ArchivoPortal): string {
  const url = archivo.url ?? ''

  return url.startsWith('/api/v1/') ? `/api/bff${url.slice('/api/v1'.length)}` : url
}

/** Lista de datos en dos columnas, con los vacios omitidos. */
export function Datos ({ filas }: { filas: Array<[string, React.ReactNode]> }) {
  const visibles = filas.filter(([, valor]) => valor !== null && valor !== undefined && valor !== '')

  if (visibles.length === 0) return null

  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {visibles.map(([rotulo, valor]) => (
        <div key={rotulo}>
          <dt className="text-texto-sutil text-xs tracking-wide uppercase">{rotulo}</dt>
          <dd className="text-texto mt-0.5 text-sm">{valor}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Tarjeta estandar del sistema, para envolver cada bloque del detalle. */
export function Bloque ({ titulo, children }: { titulo?: string, children: React.ReactNode }) {
  return (
    <section className="rounded-tarjeta border-linea bg-superficie-elevada shadow-1 border p-5">
      {titulo !== undefined && (
        <h2 className="font-titular text-texto border-linea-suave mb-4 border-b pb-2 text-sm font-semibold">
          {titulo}
        </h2>
      )}
      {children}
    </section>
  )
}
