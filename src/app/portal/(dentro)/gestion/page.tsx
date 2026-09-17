import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SinPermiso, Vacio } from '@/componentes/estado/Estados'
import { SelectorDeMes } from '@/componentes/gestion/SelectorDeMes'
import { TableroDeGestion } from '@/componentes/gestion/TableroDeGestion'
import { ErrorApi } from '@/datos/errores'
import { cargarDetalle } from '../detalle'
import type { TableroGestion } from '@/datos/portal'
import { mesEnCurso, mesesOfrecidos, resolverMesPedido } from '@/dominio/gestion'

export const metadata: Metadata = { title: 'Control de gestión · Portal de clientes' }

/**
 * El tablero de control de gestión mensual, tal como lo abre la gerencia del cliente.
 *
 * Server Component puro: lee `?mes=` y `?project_id=` de la URL, pide `/portal/gestion` y dibuja.
 * No hay un solo `useState` en toda la pantalla, y no es ascetismo: el estado de este tablero es el
 * mes, el mes vive en la URL, y por eso el resultado se comparte por enlace — que es exactamente lo
 * que alguien hace con un tablero antes de una reunión mensual.
 *
 * === Los tres errores, y por qué cada uno se trata distinto ===
 *
 *   - **404** → `notFound()`, el 404 estándar de la aplicación. La API responde 404 cuando el
 *     contacto no tiene ningún {espacio} con el interruptor del tablero encendido, y lo hace a
 *     propósito en vez de un 403: la sección no existe para él, y tiene que ser indistinguible de
 *     una ruta inventada. Dibujar acá un «no tenés acceso al tablero» delataría que el tablero
 *     existe, que es justo lo que la API decidió no contar. Hoy éste es el camino normal: el
 *     interruptor nace apagado en los 279 {espacios}.
 *   - **403** → `SinPermiso`. Es el contacto sin el permiso de {espacios}, que sí es una sección que
 *     existe y que alguien le puede habilitar.
 *   - **422** → un mes mal escrito o fuera del tope de 24 meses, que sólo se consigue escribiendo la
 *     URL a mano. Se explica y se ofrece el selector, para que el camino de vuelta sea un clic y no
 *     editar la barra de direcciones.
 */
export default async function GestionPagina (props: PageProps<'/portal/gestion'>) {
  const parametros = await props.searchParams
  const actual = mesEnCurso()
  const meses = mesesOfrecidos(actual)

  const pedido = typeof parametros.mes === 'string' ? parametros.mes : null
  const espacioId = typeof parametros.project_id === 'string' ? parametros.project_id : undefined
  const { mes } = resolverMesPedido(pedido, actual)

  const consulta = new URLSearchParams({ mes })
  if (espacioId !== undefined) consulta.set('project_id', espacioId)

  // La respuesta se resuelve ANTES de construir cualquier JSX: React no renderiza en el `return`, así
  // que un `try` alrededor del componente no atraparía nada de lo que pase al dibujarlo. `cargarDetalle`
  // es la misma pieza que usan los detalles del portal, y devuelve el error como valor.
  const respuesta = await cargarDetalle<TableroGestion>(`/portal/gestion?${consulta.toString()}`)

  if (!(respuesta instanceof ErrorApi)) {
    return <TableroDeGestion tablero={respuesta.data} meses={meses} espacioId={espacioId} />
  }

  if (respuesta.estado === 404) notFound()
  if (respuesta.estado === 403) return <SinPermiso />

  if (respuesta.estado === 422) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <Vacio
          titulo="Ese mes no se puede mirar"
          descripcion={
            'El tablero llega hasta 24 meses hacia atrás y no muestra meses que todavía no '
            + 'pasaron. Elegí uno de la lista.'
          }
          accion={<SelectorDeMes mes={actual} meses={meses} espacioId={espacioId} />}
        />
      </div>
    )
  }

  throw respuesta
}
