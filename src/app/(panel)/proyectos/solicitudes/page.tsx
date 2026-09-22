import Link from 'next/link'
import { CeldaEncabezado, CeldaTabla, CuerpoTabla, EncabezadoTabla, FilaTabla, Tabla } from '@/componentes/datos/Tabla'
import { ErrorEstado, SinPermiso, Vacio } from '@/componentes/estado/Estados'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { ResolverSolicitud } from '@/componentes/proyecto/ResolverSolicitud'
import { ErrorApi } from '@/datos/errores'
import { pedir } from '@/datos/servidor'
import { GLOSARIO } from '@/dominio/glosario'
import type { EstadoDeSolicitud, SolicitudDeEliminacion } from '@/datos/recursos'
import type { Paginacion, Yo } from '@/datos/tipos'
import { cn } from '@/lib/clases'

export const metadata = { title: 'Solicitudes de eliminación · WiWO Ops' }

/** Filas por página. Fijo a propósito: esta pantalla no tiene tamaño de página que elegir. */
const POR_PAGINA = 25

/**
 * Las dos vistas de la bandeja.
 *
 * `pendientes` es la que se abre: es lo que hay que decidir. `historial` trae todo, incluidas las ya
 * resueltas, y existe porque "qué se pidió y qué se contestó" es una pregunta que se hace después,
 * cuando alguien discute una decisión vieja.
 */
const VISTAS = {
  pendientes: { etiqueta: 'Pendientes', filtro: 'pendiente' },
  historial: { etiqueta: 'Historial', filtro: null }
} as const

type ClaveDeVista = keyof typeof VISTAS

/** Cómo se pinta cada estado. El tono es la lectura rápida; la palabra es la precisa. */
const TONOS: Record<EstadoDeSolicitud, { etiqueta: string, tono: 'neutro' | 'exito' | 'peligro' | 'aviso' }> = {
  pendiente: { etiqueta: 'Pendiente', tono: 'aviso' },
  aprobada: { etiqueta: 'Aprobada', tono: 'exito' },
  rechazada: { etiqueta: 'Rechazada', tono: 'peligro' },
  cancelada: { etiqueta: 'Retirada', tono: 'neutro' }
}

interface Cargado {
  solicitudes: SolicitudDeEliminacion[]
  paginacion: Paginacion | undefined
}

/**
 * Qué página pidió la URL.
 *
 * Todo lo que no sea un entero mayor o igual a uno vuelve a la primera: el número viaja en la query
 * y lo puede escribir cualquiera.
 */
function paginaPedida (crudo: string | string[] | undefined): number {
  const valor = Array.isArray(crudo) ? crudo[0] : crudo
  const numero = Number(valor)

  if (!Number.isInteger(numero) || numero < 1) return 1

  return numero
}

/** Qué vista pidió la URL. Cualquier otra cosa es la bandeja de pendientes. */
function vistaPedida (crudo: string | string[] | undefined): ClaveDeVista {
  const valor = Array.isArray(crudo) ? crudo[0] : crudo

  return valor === 'historial' ? 'historial' : 'pendientes'
}

/**
 * Trae una página de solicitudes, o el error de la API como valor.
 *
 * Separada de la página para no construir JSX dentro del `try`: el lint del proyecto rechaza un
 * `catch` que envuelva render.
 */
async function cargar (vista: ClaveDeVista, pagina: number): Promise<Cargado | ErrorApi> {
  const filtro = VISTAS[vista].filtro

  // El historial pide `filter[estado]` con los cuatro valores y no omite el filtro: sin él la API
  // aplica su propio default, que es `pendiente`. Omitirlo devolvería la misma lista que la otra
  // pestaña, y la diferencia entre las dos sería invisible.
  const consulta = filtro === null
    ? 'filter[estado]=pendiente,aprobada,rechazada,cancelada'
    : `filter[estado]=${filtro}`

  try {
    const lista = await pedir<SolicitudDeEliminacion[]>(
      `/deletion-requests?${consulta}&page=${pagina}&per_page=${POR_PAGINA}`
    )

    return { solicitudes: lista.data, paginacion: lista.meta?.pagination }
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}

/**
 * Bandeja de solicitudes de eliminación: qué Proyectos el equipo está pidiendo cerrar.
 *
 * Archivar un Proyecto exige `projects.edit`, que la mayor parte del equipo no tiene. Antes de esta
 * pantalla, "este Proyecto ya no va" se pedía por chat: el pedido no quedaba asociado a nadie y no
 * había forma de listar lo que estaba esperando decisión. Acá está cada pedido con su justificación,
 * quién lo escribió y cuándo, y las dos decisiones al lado.
 *
 * `is_admin` se revisa antes de pedir nada: la ruta de la API ya exige administrador —ahí está la
 * compuerta real— pero pedirla igual gastaría un viaje que sabemos que vuelve 403.
 *
 * Es tabla estática y no `TablaRecurso` por lo mismo que Incidentes: mientras sea una lista de
 * lectura con dos pestañas, la página que trajo el servidor alcanza y la paginación son dos enlaces.
 */
export default async function SolicitudesDeEliminacionPage (props: PageProps<'/proyectos/solicitudes'>) {
  const { data: yo } = await pedir<Yo>('/me')

  if (!yo.is_admin) return <SinPermiso className="mt-10" />

  const parametros = await props.searchParams
  const vista = vistaPedida(parametros.vista)
  const pagina = paginaPedida(parametros.page)
  const cargado = await cargar(vista, pagina)

  if (cargado instanceof ErrorApi) {
    if (cargado.codigo === 'forbidden') return <SinPermiso className="mt-10" />

    return <ErrorEstado detalle={cargado.message} className="mt-10" />
  }

  const { solicitudes, paginacion } = cargado
  const espacios = GLOSARIO.espacio.plural.toLowerCase()

  return (
    <section className="flex flex-col gap-6">
      <TituloModulo
        titulo="Solicitudes de eliminación"
        descripcion={`Lo que el equipo pide dar de baja, con la justificación de cada pedido. Aprobar archiva el ${GLOSARIO.espacio.singular.toLowerCase()}: sale de los listados y no se borra nada.`}
      />

      <Pestanas vista={vista} />

      {solicitudes.length === 0
        ? (
          <Vacio
            titulo={vista === 'pendientes' ? 'Nada que decidir' : 'Ninguna solicitud todavía'}
            descripcion={vista === 'pendientes'
              ? `No hay pedidos esperando. Acá aparece uno por cada vez que alguien del equipo pide dar de baja uno de sus ${espacios}.`
              : `Todavía nadie pidió dar de baja un ${GLOSARIO.espacio.singular.toLowerCase()}.`}
          />
          )
        : (
          <>
            <TablaDeSolicitudes solicitudes={solicitudes} />
            <Paginador paginacion={paginacion} vista={vista} />
          </>
          )}
    </section>
  )
}

/** Pendientes e historial. Son enlaces: la vista vive en la URL y se puede compartir. */
function Pestanas ({ vista }: { vista: ClaveDeVista }) {
  return (
    <nav aria-label="Vistas de la bandeja" className="flex gap-2 text-sm">
      {(Object.keys(VISTAS) as ClaveDeVista[]).map((clave) => (
        <Link
          key={clave}
          href={clave === 'pendientes' ? '/proyectos/solicitudes' : `/proyectos/solicitudes?vista=${clave}`}
          aria-current={clave === vista ? 'page' : undefined}
          className={cn(
            'rounded-control px-3 py-1.5',
            clave === vista ? 'bg-superficie-hundida text-texto font-medium' : 'text-texto-tenue hover:bg-hover'
          )}
        >
          {VISTAS[clave].etiqueta}
        </Link>
      ))}
    </nav>
  )
}

/**
 * El listado, en cuatro columnas.
 *
 * El motivo NO se recorta a una línea: es lo único que el administrador tiene para decidir, y
 * obligarlo a abrir cada fila para leerlo convertiría una bandeja de tres pedidos en tres viajes.
 */
function TablaDeSolicitudes ({ solicitudes }: { solicitudes: SolicitudDeEliminacion[] }) {
  return (
    <Tabla>
      <EncabezadoTabla>
        <tr>
          <CeldaEncabezado>{GLOSARIO.espacio.singular} y motivo</CeldaEncabezado>
          <CeldaEncabezado>Quién</CeldaEncabezado>
          <CeldaEncabezado angosta>Cuándo</CeldaEncabezado>
          <CeldaEncabezado angosta>Decisión</CeldaEncabezado>
        </tr>
      </EncabezadoTabla>
      <CuerpoTabla>
        {solicitudes.map((solicitud) => {
          const estado = TONOS[solicitud.estado]

          return (
            <FilaTabla key={solicitud.id}>
              <CeldaTabla>
                <span className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/proyectos/${solicitud.project_id}`}
                    className="text-texto font-medium underline-offset-4 hover:underline"
                  >
                    {solicitud.project?.name ?? `#${solicitud.project_id}`}
                  </Link>
                  {!solicitud.pendiente && (
                    <Insignia tono={estado.tono} tamano="chico">{estado.etiqueta}</Insignia>
                  )}
                  {solicitud.project?.archived === true && (
                    <Insignia tono="neutro" tamano="chico">Archivado</Insignia>
                  )}
                </span>

                <span className="text-texto-tenue mt-1 block whitespace-pre-wrap text-xs">
                  {solicitud.motivo}
                </span>

                {solicitud.respuesta !== null && (
                  <span className="text-texto-sutil mt-1 block whitespace-pre-wrap text-xs">
                    Respuesta: {solicitud.respuesta}
                  </span>
                )}
              </CeldaTabla>

              <CeldaTabla>
                {solicitud.solicitado_por === null
                  // No es un dato que falte: es alguien que ya no está en el staff. El pedido sigue
                  // siendo válido y la fila tiene que poder leerse igual.
                  ? <span className="text-texto-sutil">Ya no está en el equipo</span>
                  : solicitud.solicitado_por.full_name}
              </CeldaTabla>

              <CeldaTabla angosta><Fecha valor={solicitud.solicitado_en} conHora /></CeldaTabla>

              <CeldaTabla angosta>
                {solicitud.pendiente
                  ? <ResolverSolicitud solicitud={solicitud} />
                  : (
                    <span className="text-texto-sutil text-xs">
                      {solicitud.resuelto_por?.full_name ?? '—'}
                    </span>
                    )}
              </CeldaTabla>
            </FilaTabla>
          )
        })}
      </CuerpoTabla>
    </Tabla>
  )
}

/**
 * Anterior y siguiente, nada más.
 *
 * Son enlaces y no botones porque la pantalla se pinta en el servidor: la página vive en la URL, así
 * que cada una es una dirección que se puede recargar y pegar en un mensaje.
 *
 * Sin `meta.pagination` no se dibuja nada: inventar "página 1 de 1" cuando el backend no dijo
 * cuántas hay es afirmar algo que no se sabe.
 */
function Paginador ({ paginacion, vista }: { paginacion: Paginacion | undefined, vista: ClaveDeVista }) {
  if (paginacion === undefined) return null

  const { page, total, total_pages: totalPaginas } = paginacion

  if (totalPaginas <= 1) return null

  return (
    <nav
      aria-label="Paginación de solicitudes"
      className="text-texto-tenue flex flex-wrap items-center justify-between gap-2 text-xs"
    >
      <p aria-live="polite">Página {page} de {totalPaginas} · {total} en total</p>

      <div className="flex items-center gap-4">
        <SaltoDePagina pagina={page - 1} etiqueta="Anterior" hayADonde={page > 1} vista={vista} />
        <SaltoDePagina pagina={page + 1} etiqueta="Siguiente" hayADonde={page < totalPaginas} vista={vista} />
      </div>
    </nav>
  )
}

/** Un salto de página, apagado y sin enlace cuando no hay a dónde ir. */
function SaltoDePagina (
  { pagina, etiqueta, hayADonde, vista }:
  { pagina: number, etiqueta: string, hayADonde: boolean, vista: ClaveDeVista }
) {
  if (!hayADonde) return <span className="text-texto-sutil">{etiqueta}</span>

  return (
    <Link
      href={`/proyectos/solicitudes?vista=${vista}&page=${pagina}`}
      className="text-acento font-semibold underline underline-offset-4"
    >
      {etiqueta}
    </Link>
  )
}
