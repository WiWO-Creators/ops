import Link from 'next/link'
import { CeldaEncabezado, CeldaTabla, CuerpoTabla, EncabezadoTabla, FilaTabla, Tabla } from '@/componentes/datos/Tabla'
import { ErrorEstado, SinPermiso, Vacio } from '@/componentes/estado/Estados'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { ErrorApi } from '@/datos/errores'
import { pedir } from '@/datos/servidor'
import { describirSujeto } from '@/dominio/incidentes'
import type { Incidente } from '@/datos/recursos'
import type { Paginacion, Yo } from '@/datos/tipos'

export const metadata = { title: 'Incidentes · WiWO Ops' }

/** Filas por página. Fijo a propósito: esta pantalla no tiene filtros ni tamaño de página que elegir. */
const POR_PAGINA = 25

interface Cargado {
  incidentes: Incidente[]
  paginacion: Paginacion | undefined
}

/**
 * Qué página pidió la URL.
 *
 * Todo lo que no sea un entero mayor o igual a uno vuelve a la primera: el número viaja en la query
 * y lo puede escribir cualquiera, así que `?page=-3` o `?page=hola` tiene que ser la página uno y no
 * una petición inventada a la API.
 *
 * @param crudo el valor tal como vino de `searchParams`
 * @returns el número de página a pedir
 */
function paginaPedida (crudo: string | string[] | undefined): number {
  const valor = Array.isArray(crudo) ? crudo[0] : crudo
  const numero = Number(valor)

  if (!Number.isInteger(numero) || numero < 1) return 1

  return numero
}

/**
 * Trae una página de incidentes, o el error de la API como valor.
 *
 * Separada de la página para no construir JSX dentro del `try`, igual que en `/administracion`: el
 * lint del proyecto rechaza un `catch` que envuelva render.
 */
async function cargar (pagina: number): Promise<Cargado | ErrorApi> {
  try {
    const lista = await pedir<Incidente[]>(`/incidentes?page=${pagina}&per_page=${POR_PAGINA}`)

    return { incidentes: lista.data, paginacion: lista.meta?.pagination }
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}

/**
 * Incidentes: los errores 500 que la API guardó en vez de tirar a la basura.
 *
 * Cuando algo se cae, quien lo sufre ve un código de ocho hexadecimales y nada más. Esta pantalla es
 * el otro lado de ese código: con él se encuentra acá la excepción, el archivo y la línea, la
 * petición que la provocó y quién la hizo. El detalle de cada uno suma la traza.
 *
 * Es tabla estática y no `TablaRecurso` por el mismo motivo que la casilla entrante: `TablaRecurso`
 * guarda el estado de la vista en la URL, pide sus páginas contra `/api/bff/...` y exige declarar el
 * prefijo en la lista blanca del BFF. Mientras esto sea una lista de lectura sin filtros, la página
 * que trajo el servidor alcanza y la paginación son dos enlaces.
 *
 * `is_superadmin` se revisa antes de pedir nada: la ruta de la API ya exige superadministrador —ahí
 * está la compuerta real— pero pedirla igual gastaría un viaje que sabemos que vuelve 403.
 */
export default async function IncidentesPage (props: PageProps<'/administracion/incidentes'>) {
  const { data: yo } = await pedir<Yo>('/me')

  if (!yo.is_superadmin) return <SinPermiso className="mt-10" />

  const pagina = paginaPedida((await props.searchParams).page)
  const cargado = await cargar(pagina)

  if (cargado instanceof ErrorApi) {
    if (cargado.codigo === 'forbidden') return <SinPermiso className="mt-10" />

    return <ErrorEstado detalle={cargado.message} className="mt-10" />
  }

  const { incidentes, paginacion } = cargado

  return (
    <section className="flex flex-col gap-6">
      <TituloModulo
        titulo="Incidentes"
        descripcion="Cada vez que la API se cae con un error 500 queda registrado acá, con el código que se le mostró a quien lo sufrió. Es solo lectura: nada de lo que se ve en esta pantalla se puede cambiar."
      />

      {incidentes.length === 0
        ? (
          <Vacio
            titulo="Ningún incidente"
            descripcion="No hay errores 500 registrados. Acá aparece uno por cada petición que la API no pudo terminar."
          />
          )
        : (
          <>
            <TablaDeIncidentes incidentes={incidentes} />
            <Paginador paginacion={paginacion} />
          </>
          )}
    </section>
  )
}

function TablaDeIncidentes ({ incidentes }: { incidentes: Incidente[] }) {
  return (
    <Tabla>
      <EncabezadoTabla>
        <tr>
          <CeldaEncabezado angosta>Código</CeldaEncabezado>
          <CeldaEncabezado>Error</CeldaEncabezado>
          <CeldaEncabezado>Petición</CeldaEncabezado>
          <CeldaEncabezado>Quién</CeldaEncabezado>
          <CeldaEncabezado>Cuándo</CeldaEncabezado>
        </tr>
      </EncabezadoTabla>
      <CuerpoTabla>
        {incidentes.map((incidente) => {
          const sujeto = describirSujeto(incidente)

          return (
            <FilaTabla key={incidente.incidente} interactiva>
              <CeldaTabla angosta>
                {/* El enlace va en el código y no en la fila entera: la pantalla es un Server
                    Component, así que no hay `onClick` que abrir, y el código es justamente lo que
                    la persona trae escrito cuando viene a buscar un incidente. */}
                <Link
                  href={`/administracion/incidentes/${incidente.incidente}`}
                  className="text-acento font-mono text-xs font-semibold underline underline-offset-4"
                >
                  {incidente.incidente}
                </Link>
              </CeldaTabla>

              <CeldaTabla>
                <span className="text-texto block">{incidente.mensaje}</span>
                <span className="text-texto-tenue block font-mono text-xs">{incidente.tipo}</span>
              </CeldaTabla>

              <CeldaTabla>
                <span className="text-texto flex items-center gap-2 text-xs">
                  <Insignia tono="contorno" tamano="chico">{incidente.metodo}</Insignia>
                  {incidente.uri}
                </span>
                <span className="text-texto-tenue block font-mono text-xs">
                  {incidente.archivo}:{incidente.linea}
                </span>
              </CeldaTabla>

              <CeldaTabla>
                {sujeto === null
                  // Sin sujeto NO es un dato que falta: es una petición que se cayó sin sesión o
                  // antes de resolver de quién era.
                  ? <span className="text-texto-sutil">Sin atribuir</span>
                  : sujeto}
              </CeldaTabla>

              <CeldaTabla><Fecha valor={incidente.creado_en} conHora /></CeldaTabla>
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
 * que cada una es una dirección que se puede recargar y pegar en un mensaje. `PaginacionTabla` no
 * sirve acá: es un componente cliente que devuelve el cambio por callback.
 *
 * Sin `meta.pagination` no se dibuja nada: inventar "página 1 de 1" cuando el backend no dijo
 * cuántas hay es afirmar algo que no se sabe.
 */
function Paginador ({ paginacion }: { paginacion: Paginacion | undefined }) {
  if (paginacion === undefined) return null

  const { page, total, total_pages: totalPaginas } = paginacion

  if (totalPaginas <= 1) return null

  return (
    <nav
      aria-label="Paginación de incidentes"
      className="text-texto-tenue flex flex-wrap items-center justify-between gap-2 text-xs"
    >
      <p aria-live="polite">Página {page} de {totalPaginas} · {total} en total</p>

      <div className="flex items-center gap-4">
        <SaltoDePagina pagina={page - 1} etiqueta="Anterior" hayADonde={page > 1} />
        <SaltoDePagina pagina={page + 1} etiqueta="Siguiente" hayADonde={page < totalPaginas} />
      </div>
    </nav>
  )
}

/** Un salto de página, apagado y sin enlace cuando no hay a dónde ir. */
function SaltoDePagina ({ pagina, etiqueta, hayADonde }: { pagina: number, etiqueta: string, hayADonde: boolean }) {
  if (!hayADonde) return <span className="text-texto-sutil">{etiqueta}</span>

  return (
    <Link
      href={`/administracion/incidentes?page=${pagina}`}
      className="text-acento font-semibold underline underline-offset-4"
    >
      {etiqueta}
    </Link>
  )
}
