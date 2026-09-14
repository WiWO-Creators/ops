import { Suspense } from 'react'
import { VistaClientes } from '@/componentes/cliente/VistaClientes'
import { Cargando } from '@/componentes/estado/Estados'
import { TotalDelListado } from '@/componentes/datos/TotalDelListado'
import { construirConsulta, leerConsulta, paramsDeUrl } from '@/datos/consulta'
import { listaDe } from '@/datos/catalogos'
import { ErrorApi } from '@/datos/errores'
import { cargarLookups, opcionesDeFiltros } from '@/datos/lookups'
import { pedir } from '@/datos/servidor'
import type { Cliente, ClienteMinimo, EstadoLookup } from '@/datos/recursos'
import type { OpcionCampo } from '@/componentes/proyecto/formulario'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import type { Sobre, Yo } from '@/datos/tipos'
import { CLIENTES } from '@/definiciones/clientes'

export const metadata = { title: 'Clientes · WiWO Ops' }

/**
 * Lista de Clientes, en tabla o en tarjetas.
 *
 * La primera pagina se resuelve en el servidor para que la lista no parpadee al montar; de ahi en
 * adelante el motor pide al BFF. El `Suspense` no es decorativo: la vista usa `useSearchParams`, y sin
 * el limite el build de esta ruta falla.
 *
 * `vista` no pasa por `leerConsulta`: no es parte de la consulta a la API —el motor descarta lo que la
 * definicion no declara— sino de como se presenta el resultado. Misma clave que en `/espacios`.
 */
export default async function ClientesPage (props: PageProps<'/clientes'>) {
  const params = paramsDeUrl(await props.searchParams)

  const estado = leerConsulta(params, CLIENTES)
  const consulta = construirConsulta(estado, CLIENTES)
  const vista = params.get('vista') === 'tarjetas' ? 'tarjetas' : 'tabla'

  const [lista, lookups, yo] = await Promise.all([
    pedirCartera(consulta),
    cargarLookups(),
    pedir<Yo>('/me')
  ])

  // Sin permiso para ver la cartera queda el directorio: los clientes que existen, y nada mas. Es
  // una pantalla distinta a proposito y no la misma con columnas vacias, porque la ruta que la
  // alimenta devuelve otra cosa —cuatro campos— y no admite ni filtros ni orden del legajo.
  if (lista === null) {
    const directorio = await pedir<ClienteMinimo[]>('/clients/minimos?per_page=500&sort=company')

    return <Directorio clientes={directorio.data} />
  }

  return (
    <section className="flex flex-col gap-4">
      <TituloModulo
        titulo={CLIENTES.titulo.plural}
        acciones={<TotalDelListado paginacion={lista.meta?.pagination} />}
      />

      <Suspense fallback={<Cargando alto="min-h-36" mensaje={`Cargando ${CLIENTES.titulo.plural.toLowerCase()}…`} />}>
        <VistaClientes
          inicial={{ filas: lista.data, paginacion: lista.meta?.pagination }}
          capacidades={yo.data.permissions.customers}
          opcionesDeFiltro={opcionesDeFiltros(CLIENTES, lookups)}
          vistaInicial={vista}
          paises={comoOpciones(listaDe(lookups, 'countries'))}
          monedas={comoOpciones(listaDe(lookups, 'currencies'))}
        />
      </Suspense>
    </section>
  )
}

/**
 * La cartera completa, o `null` si esta persona no tiene permiso para verla.
 *
 * El 403 se atrapa acá y no en la vista porque cambia la pantalla entera, no un pedazo. `pedir` ya
 * resuelve por su cuenta los errores de sesion con un `redirect`, asi que lo unico que llega hasta
 * acá es un error de permiso; cualquier otro se relanza y lo muestra el limite de error de la ruta.
 */
async function pedirCartera (consulta: string): Promise<Sobre<Cliente[]> | null> {
  try {
    return await pedir<Cliente[]>(`/clients${consulta === '' ? '' : `?${consulta}`}`)
  } catch (fallo) {
    if (fallo instanceof ErrorApi && fallo.codigo === 'forbidden') return null

    throw fallo
  }
}

/**
 * Los clientes que existen, para quien no puede abrir ninguno.
 *
 * Los nombres NO se enlazan: la ficha sigue exigiendo `customers.view` y un enlace que lleva a una
 * pantalla de "sin permiso" es peor que no tener enlace. Tampoco hay buscador ni filtros —la lista
 * entera entra en una pagina— ni boton de alta.
 */
function Directorio ({ clientes }: { clientes: ClienteMinimo[] }) {
  return (
    <section className="flex flex-col gap-4">
      <TituloModulo
        titulo={CLIENTES.titulo.plural}
        descripcion="Estos son los clientes de la casa. Para entrar a la ficha de uno hace falta permiso."
      />

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {clientes.map((cliente) => (
          <li
            key={cliente.id}
            className="bg-relleno-neutro text-relleno-neutro-contenido rounded-control flex items-baseline justify-between gap-2 px-3 py-2 text-sm"
          >
            <span className="truncate">{cliente.company}</span>
            {!cliente.active && <span className="text-texto-tenue shrink-0 text-xs">Inactivo</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Un catalogo de `GET /lookups` en la forma que espera un campo `seleccion`.
 *
 * El id viaja como cadena porque un `<select>` no conoce otro tipo; `cuerpoDelFormulario` lo vuelve
 * numero antes de mandarlo.
 */
function comoOpciones (lista: EstadoLookup[]): OpcionCampo[] {
  return lista.map((item) => ({ valor: String(item.id), etiqueta: item.name }))
}
