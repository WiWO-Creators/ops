import type { Metadata } from 'next'
import Link from 'next/link'
import { ResumenDelPortal } from '@/componentes/portal/ResumenDelPortal'
import { BarraProgreso } from '@/componentes/proyecto/CabeceraProyecto'
import { formatearFecha } from '@/lib/fechas'
import { ErrorApi } from '@/datos/errores'
import { pedirPortal } from '@/datos/servidor'
import type { AnuncioPortal, EspacioPortal, ResumenPortal } from '@/datos/portal'
import type { YoPortal } from '@/datos/tipos'
import { saludar, seccionesDelPortal } from '@/dominio/portal'
import { GLOSARIO } from '@/dominio/glosario'
import { Bloque } from './detalle'

export const metadata: Metadata = { title: 'Inicio · Portal de clientes' }

/** Cuantos {espacios} entran en la lista de abajo. Una lista corta no miente; un total sí. */
const ULTIMOS = 5

/**
 * Inicio del portal, que es tambien el dashboard del cliente.
 *
 * Resume lo que el cliente vino a ver —que espera su respuesta, como van sus proyectos y si hay algo
 * nuevo que contarle— y ademas deja los accesos a las secciones habilitadas.
 *
 * Cada bloque se pide con `sinFallar`: una seccion que este apagada para este contacto responde 403
 * o 404, y eso no puede tumbar la portada entera. Un inicio a medias es mejor que una pantalla de
 * error.
 *
 * === LOS NUMEROS Y LA LISTA SON DOS PEDIDOS DISTINTOS, Y A PROPOSITO ===
 *
 * Los NUMEROS salen de `/portal/resumen`, que los suma en el servidor sobre TODOS los {espacios} del
 * cliente. Antes los sumaba esta pagina sobre `/portal/projects?per_page=100`, asi que un cliente
 * con mas de cien {espacios} veia un total menor que el real y sin ninguna señal de que faltaba
 * algo. Un agregado no se pagina: o se calcula sobre el conjunto entero o no es el agregado.
 *
 * La LISTA sigue viniendo paginada y corta, y eso esta bien: se presenta como "los ultimos", no como
 * "todos". El pedido baja de cien filas a cinco —las unicas que se dibujan—, que es lo que se podia
 * hacer recien cuando los totales dejaron de depender de ella.
 */
export default async function PortalInicio () {
  const { data: yo } = await pedirPortal<YoPortal>('/portal/me')
  const secciones = seccionesDelPortal(yo.secciones_habilitadas)

  const [resumen, proyectos, anuncios] = await Promise.all([
    sinFallar<ResumenPortal>('/portal/resumen'),
    sinFallar<EspacioPortal[]>(`/portal/projects?per_page=${ULTIMOS}`),
    sinFallar<AnuncioPortal[]>('/portal/announcements')
  ])

  const nuevos = (anuncios ?? []).filter((a) => !a.dismissed)

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-texto text-xl font-semibold">Hola, {saludar(yo)}</h1>
        <p className="text-texto-tenue mt-1 text-sm">
          Acá vas a encontrar todo lo que compartimos contigo.
        </p>
      </div>

      {resumen !== null && <ResumenDelPortal resumen={resumen} />}

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

          {/* Solo cuando la pagina vino llena, que es cuando puede haber mas: sin el enlace, un
              cliente con doce {espacios} se queda creyendo que tiene cinco. A quien los ve todos no
              se le ofrece "ver todos", que ya los esta viendo. */}
          {proyectos.length === ULTIMOS && (
            <Link
              href="/portal/proyectos"
              className="text-acento mt-4 inline-block text-sm font-medium underline-offset-4 hover:underline"
            >
              Ver todos mis {GLOSARIO.espacio.plural.toLowerCase()}
            </Link>
          )}
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
