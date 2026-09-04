import type { Metadata } from 'next'
import Link from 'next/link'
import { Metrica } from '@/componentes/proyecto/ResumenProyecto'
import { BarraProgreso } from '@/componentes/proyecto/CabeceraProyecto'
import { formatearFecha } from '@/lib/fechas'
import { ErrorApi } from '@/datos/errores'
import { pedirPortal } from '@/datos/servidor'
import type { AnuncioPortal, EspacioPortal } from '@/datos/portal'
import type { YoPortal } from '@/datos/tipos'
import { seccionesDelPortal } from '@/dominio/portal'
import { GLOSARIO } from '@/dominio/glosario'
import { Bloque } from './detalle'

export const metadata: Metadata = { title: 'Inicio · Portal de clientes' }

/**
 * Inicio del portal.
 *
 * Resume lo que el cliente vino a ver —como van sus proyectos y si hay algo nuevo que contarle— y
 * ademas deja los accesos a las secciones habilitadas.
 *
 * Cada bloque se pide con `sinFallar`: una seccion que este apagada para este contacto responde 403
 * o 404, y eso no puede tumbar la portada entera. Un inicio a medias es mejor que una pantalla de
 * error.
 */
export default async function PortalInicio () {
  const { data: yo } = await pedirPortal<YoPortal>('/portal/me')
  const secciones = seccionesDelPortal(yo.secciones_habilitadas)

  const [proyectos, anuncios] = await Promise.all([
    sinFallar<EspacioPortal[]>('/portal/projects?per_page=5'),
    sinFallar<AnuncioPortal[]>('/portal/announcements')
  ])

  const activos = (proyectos ?? []).filter((p) => p.counts.tasks_open > 0)
  const nuevos = (anuncios ?? []).filter((a) => !a.dismissed)

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-texto text-xl font-semibold">Hola, {yo.firstname.trim()}</h1>
        <p className="text-texto-tenue mt-1 text-sm">
          Acá vas a encontrar todo lo que compartimos contigo.
        </p>
      </div>

      {proyectos !== null && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Metrica etiqueta={GLOSARIO.espacio.plural} valor={String(proyectos.length)} />
          <Metrica etiqueta="En curso" valor={String(activos.length)} />
          <Metrica
            etiqueta={`${GLOSARIO.proceso.plural} pendientes`}
            valor={String(proyectos.reduce((suma, p) => suma + p.counts.tasks_open, 0))}
          />
        </div>
      )}

      {nuevos.length > 0 && (
        <Bloque titulo="Novedades">
          <ul className="flex flex-col gap-2">
            {nuevos.slice(0, 3).map((anuncio) => (
              <li key={anuncio.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <Link href="/portal/anuncios" className="text-texto hover:text-acento underline-offset-4 hover:underline">
                  {anuncio.name}
                </Link>
                <span className="text-texto-tenue">{formatearFecha(anuncio.date_added)}</span>
              </li>
            ))}
          </ul>
        </Bloque>
      )}

      {proyectos !== null && proyectos.length > 0 && (
        <Bloque titulo={GLOSARIO.espacio.plural}>
          <ul className="flex flex-col gap-4">
            {proyectos.map((proyecto) => (
              <li key={proyecto.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link
                    href={`/portal/proyectos/${proyecto.id}`}
                    className="text-texto hover:text-acento text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {proyecto.name}
                  </Link>
                  <span className="text-texto-tenue text-sm tabular-nums">{proyecto.progress}%</span>
                </div>
                <BarraProgreso porcentaje={proyecto.progress} className="mt-2" />
              </li>
            ))}
          </ul>
        </Bloque>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {secciones.map((seccion) => (
          <li key={seccion.clave}>
            <Link
              href={seccion.href}
              className="rounded-tarjeta border-linea bg-superficie-elevada shadow-1 hover:border-acento block border p-5 transition-colors"
            >
              <span className="font-titular text-texto font-semibold">{seccion.etiqueta}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Pide un bloque del inicio y devuelve `null` si el contacto no tiene acceso.
 *
 * Un 403 o un 404 aca significan "esta seccion no es para vos", que en la portada es un bloque que
 * no se dibuja y no un error. Cualquier otro fallo si se propaga: si la API esta caida, hay que
 * verlo.
 */
async function sinFallar<T> (ruta: string): Promise<T | null> {
  try {
    const { data } = await pedirPortal<T>(ruta)

    return data
  } catch (error) {
    if (error instanceof ErrorApi && (error.estado === 403 || error.estado === 404)) return null

    throw error
  }
}
