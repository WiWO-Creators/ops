import Link from 'next/link'
import { CeldaEncabezado, CeldaTabla, CuerpoTabla, EncabezadoTabla, FilaTabla, Tabla } from '@/componentes/datos/Tabla'
import { ErrorEstado, SinPermiso, Vacio } from '@/componentes/estado/Estados'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { AccionesPapelera } from '@/componentes/papelera/AccionesPapelera'
import { ErrorApi } from '@/datos/errores'
import { pedir } from '@/datos/servidor'
import {
  VISTAS_DE_PAPELERA,
  nombreDeEntidad,
  paginaDePapelera,
  textoDeDiasRestantes,
  tonoDeDiasRestantes,
  vistaDePapelera,
  type VistaDePapelera
} from '@/dominio/papelera'
import type { ElementoEnPapelera } from '@/datos/recursos'
import type { Paginacion, Yo } from '@/datos/tipos'
import { cn } from '@/lib/clases'

export const metadata = { title: 'Papelera · WiWO Ops' }

/** Filas por página. Fijo a propósito: esta pantalla no tiene tamaño de página que elegir. */
const POR_PAGINA = 25

interface Cargado {
  elementos: ElementoEnPapelera[]
  paginacion: Paginacion | undefined
}

/**
 * Trae una página de la papelera, o el error de la API como valor.
 *
 * Separada de la página para no construir JSX dentro del `try`: el lint del proyecto rechaza un
 * `catch` que envuelva render.
 */
async function cargar (vista: VistaDePapelera, pagina: number): Promise<Cargado | ErrorApi> {
  const filtro = vista === 'todo' ? '' : `filter[entidad]=${vista}&`

  try {
    const lista = await pedir<ElementoEnPapelera[]>(`/trash?${filtro}page=${pagina}&per_page=${POR_PAGINA}`)

    return { elementos: lista.data, paginacion: lista.meta?.pagination }
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}

/** La dirección de una vista y una página, sin parámetros de más para la vista por defecto. */
function hrefDe (vista: VistaDePapelera, pagina = 1): string {
  const parametros = new URLSearchParams()

  if (vista !== 'todo') parametros.set('vista', vista)
  if (pagina > 1) parametros.set('page', String(pagina))

  const consulta = parametros.toString()

  return consulta === '' ? '/papelera' : `/papelera?${consulta}`
}

/**
 * Papelera: lo que se eliminó y todavía se puede recuperar.
 *
 * Eliminar un Proyecto, una Tarea o un Cliente no borra: lo manda acá, y desde ese momento no
 * aparece en ningún listado, contador ni portal. Pasa 30 días en la papelera; después la purga
 * automática lo borra, si está encendida. El borrado definitivo antes de tiempo solo se pide desde
 * esta pantalla.
 *
 * Se listan solo las raíces: si se eliminó un Proyecto, sus Tareas vuelven con él y no aparecen
 * como filas propias, porque restaurarlas sueltas las dejaría colgando de algo que no se ve.
 *
 * La llave es `is_admin`, que incluye al superadministrador: la API deja eliminar, restaurar y
 * purgar a cualquier administrador. Revisarlo antes de pedir ahorra un viaje que vuelve 403.
 */
export default async function PapeleraPage (props: PageProps<'/papelera'>) {
  const { data: yo } = await pedir<Yo>('/me')

  if (!yo.is_admin && !yo.is_superadmin) return <SinPermiso className="mt-10" />

  const parametros = await props.searchParams
  const vista = vistaDePapelera(parametros.vista)
  const pagina = paginaDePapelera(parametros.page)
  const cargado = await cargar(vista, pagina)

  if (cargado instanceof ErrorApi) {
    if (cargado.codigo === 'forbidden') return <SinPermiso className="mt-10" />

    return <ErrorEstado detalle={cargado.message} className="mt-10" />
  }

  const { elementos, paginacion } = cargado

  return (
    <section className="flex flex-col gap-6">
      <TituloModulo
        titulo="Papelera"
        descripcion="Lo eliminado queda acá 30 días, invisible para todo el equipo y los clientes. Restaurarlo lo devuelve entero, con sus tareas, comentarios, archivos y horas."
      />

      <Pestanas vista={vista} />

      {elementos.length === 0
        ? (
          <Vacio
            titulo="La papelera está vacía"
            descripcion="Cada vez que alguien elimina un proyecto, una tarea o un cliente, aparece acá y se puede recuperar durante 30 días."
          />
          )
        : (
          <>
            <TablaDePapelera elementos={elementos} />
            <Paginador paginacion={paginacion} vista={vista} />
          </>
          )}
    </section>
  )
}

/** Todo y una pestaña por entidad. Son enlaces: la vista vive en la URL y se puede compartir. */
function Pestanas ({ vista }: { vista: VistaDePapelera }) {
  return (
    <nav aria-label="Qué mostrar" className="flex flex-wrap gap-2 text-sm">
      {VISTAS_DE_PAPELERA.map((clave) => (
        <Link
          key={clave}
          href={hrefDe(clave)}
          aria-current={clave === vista ? 'page' : undefined}
          className={cn(
            'rounded-control px-3 py-1.5',
            clave === vista ? 'bg-superficie-hundida text-texto font-medium' : 'text-texto-tenue hover:bg-hover'
          )}
        >
          {clave === 'todo' ? 'Todo' : nombreDeEntidad(clave, true)}
        </Link>
      ))}
    </nav>
  )
}

/** El listado: qué es, quién lo eliminó y cuándo, cuánto le queda y las dos acciones. */
function TablaDePapelera ({ elementos }: { elementos: ElementoEnPapelera[] }) {
  return (
    <Tabla>
      <EncabezadoTabla>
        <tr>
          <CeldaEncabezado>Qué</CeldaEncabezado>
          <CeldaEncabezado>Eliminado por</CeldaEncabezado>
          <CeldaEncabezado angosta>Cuándo</CeldaEncabezado>
          <CeldaEncabezado angosta>Quedan</CeldaEncabezado>
          <CeldaEncabezado angosta><span className="sr-only">Acciones</span></CeldaEncabezado>
        </tr>
      </EncabezadoTabla>
      <CuerpoTabla>
        {elementos.map((elemento) => (
          <FilaTabla key={`${elemento.entidad}-${elemento.id}`}>
            <CeldaTabla>
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-texto font-medium">{elemento.nombre}</span>
                <Insignia tono="neutro" tamano="chico">{nombreDeEntidad(elemento.entidad)}</Insignia>
              </span>
            </CeldaTabla>

            <CeldaTabla>
              {elemento.eliminado_por === null
                ? <span className="text-texto-sutil">Sin registro</span>
                : elemento.eliminado_por.full_name}
            </CeldaTabla>

            <CeldaTabla angosta><Fecha valor={elemento.eliminado_en} conHora /></CeldaTabla>

            <CeldaTabla angosta>
              <Insignia tono={tonoDeDiasRestantes(elemento.dias_restantes)} tamano="chico">
                {textoDeDiasRestantes(elemento.dias_restantes)}
              </Insignia>
            </CeldaTabla>

            <CeldaTabla angosta><AccionesPapelera elemento={elemento} /></CeldaTabla>
          </FilaTabla>
        ))}
      </CuerpoTabla>
    </Tabla>
  )
}

/** Anterior y siguiente. Sin `meta.pagination`, o con una sola página, no se dibuja nada. */
function Paginador ({ paginacion, vista }: { paginacion: Paginacion | undefined, vista: VistaDePapelera }) {
  if (paginacion === undefined || paginacion.total_pages <= 1) return null

  const { page, total, total_pages: totalPaginas } = paginacion

  return (
    <nav aria-label="Paginación de la papelera" className="text-texto-tenue flex flex-wrap items-center justify-between gap-2 text-xs">
      <p aria-live="polite">Página {page} de {totalPaginas} · {total} en total</p>

      <div className="flex items-center gap-4">
        {page > 1
          ? <Link href={hrefDe(vista, page - 1)} className="text-acento font-semibold underline underline-offset-4">Anterior</Link>
          : <span className="text-texto-sutil">Anterior</span>}
        {page < totalPaginas
          ? <Link href={hrefDe(vista, page + 1)} className="text-acento font-semibold underline underline-offset-4">Siguiente</Link>
          : <span className="text-texto-sutil">Siguiente</span>}
      </div>
    </nav>
  )
}
