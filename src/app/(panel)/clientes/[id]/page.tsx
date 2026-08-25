import Link from 'next/link'
import { Suspense, cache } from 'react'
import { CabeceraCliente } from '@/componentes/cliente/CabeceraCliente'
import { FichaCliente } from '@/componentes/cliente/FichaCliente'
import { ListaContactos } from '@/componentes/cliente/ListaContactos'
import { PanelProyectosCliente } from '@/componentes/cliente/PanelProyectosCliente'
import { Pestanas, type Panel } from '@/componentes/proyecto/Pestanas'
import { Cargando, ErrorEstado, SinPermiso, Vacio } from '@/componentes/estado/Estados'
import { listaDe } from '@/datos/catalogos'
import { ErrorApi } from '@/datos/errores'
import { cargarLookups } from '@/datos/lookups'
import { pedir } from '@/datos/servidor'
import type { Cliente, Lookups } from '@/datos/recursos'
import { GLOSARIO } from '@/dominio/glosario'

/**
 * Pide el cliente una sola vez por peticion.
 *
 * `generateMetadata` y la pagina corren en la misma peticion y necesitan el mismo recurso; sin
 * `cache` serian dos llamadas a la API por cada visita.
 *
 * Los dos includes se piden siempre: los contactos son una pestaña y los campos personalizados una
 * seccion de la ficha, no extras opcionales.
 */
const traerCliente = cache(async (id: string) => {
  return await pedir<Cliente>(`/clients/${id}?include=contacts,custom_fields`)
})

/**
 * Titulo de la pestaña del navegador.
 *
 * Un `ErrorApi` no puede tumbar la metadata: la pagina ya muestra el estado que corresponda. Todo lo
 * demas se relanza — `pedir` señaliza la sesion vencida con el `redirect` de Next, que viaja como
 * excepcion y tragarlo dejaria a la persona mirando una pantalla en blanco.
 */
export async function generateMetadata (props: PageProps<'/clientes/[id]'>) {
  const { id } = await props.params

  try {
    const { data } = await traerCliente(id)

    return { title: `${data.company} · WiWO Ops` }
  } catch (error) {
    if (!(error instanceof ErrorApi)) throw error

    return { title: `${GLOSARIO.cliente.singular} · WiWO Ops` }
  }
}

interface Detalle {
  cliente: Cliente
  lookups: Lookups
}

/**
 * Carga lo minimo que la pantalla necesita para pintarse: el cliente y los catalogos.
 *
 * Los Proyectos del cliente NO se piden aca: son una pestaña que puede no abrirse, y su panel los
 * pide al montarse. Los catalogos si, porque de ellos sale el color de cada estado y pedirlos desde
 * el navegador haria que las insignias aparecieran despues de la tabla.
 *
 * @param id id del cliente tal como viene de la ruta
 * @returns el detalle, o el `ErrorApi` que impidio cargarlo
 */
async function cargarDetalle (id: string): Promise<Detalle | ErrorApi> {
  try {
    const [cliente, lookups] = await Promise.all([traerCliente(id), cargarLookups()])

    return { cliente: cliente.data, lookups }
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}

/** Estado de cliente inexistente: la API respondio 404 o el id de la URL no es de nadie. */
function NoEncontrado () {
  return (
    <Vacio
      titulo="Ese cliente no existe"
      descripcion="Puede que lo hayan borrado, o que el enlace esté mal escrito."
      accion={
        <Link href="/clientes" className="text-acento text-sm font-semibold underline underline-offset-4">
          Volver a {GLOSARIO.cliente.plural}
        </Link>
      }
    />
  )
}

/**
 * Detalle de un Cliente.
 *
 * El `Suspense` no es decorativo: `Pestanas` usa `useSearchParams`, y sin ese limite el build de la
 * ruta falla.
 */
export default async function ClientePage (props: PageProps<'/clientes/[id]'>) {
  const { id } = await props.params
  const detalle = await cargarDetalle(id)

  if (detalle instanceof ErrorApi) {
    if (detalle.codigo === 'not_found') return <NoEncontrado />
    if (detalle.codigo === 'forbidden') return <SinPermiso />

    return <ErrorEstado detalle={detalle.message} />
  }

  const { cliente, lookups } = detalle
  const contactos = cliente.contacts ?? []

  const paneles: Panel[] = [
    { clave: 'ficha', etiqueta: 'Ficha', contenido: <FichaCliente cliente={cliente} /> },
    {
      clave: 'contactos',
      etiqueta: contactos.length === 0 ? 'Contactos' : `Contactos (${contactos.length})`,
      contenido: <ListaContactos contactos={cliente.contacts} />
    },
    {
      clave: 'proyectos',
      etiqueta: GLOSARIO.espacio.plural,
      contenido: (
        <PanelProyectosCliente
          clienteId={cliente.id}
          estados={listaDe(lookups, 'project_statuses')}
        />
      )
    },
    { clave: 'ventas', etiqueta: 'Ventas y soporte', contenido: <VentasSinApi /> }
  ]

  return (
    <section className="flex flex-col gap-6">
      <CabeceraCliente cliente={cliente} />

      <Suspense fallback={<Cargando />}>
        <Pestanas paneles={paneles} />
      </Suspense>
    </section>
  )
}

/**
 * Lo que el panel clasico muestra por cliente y la API v1 todavia no expone.
 *
 * Facturas, presupuestos, contratos, gastos y tickets existen en la API, pero **colgados de un
 * Proyecto** (`GET /projects/{id}/invoices` y sus hermanos), no de un Cliente. Agregarlos por cliente
 * sumando los de sus Proyectos dejaria fuera los que no estan asociados a ninguno, es decir: seria un
 * total equivocado presentado como total. La seccion dice que falta en vez de mostrar un cero.
 */
function VentasSinApi () {
  return (
    <Vacio
      titulo="Todavía no hay ventas por cliente"
      descripcion="Facturas, presupuestos, contratos, gastos y tickets existen en la API v1 por Proyecto, no por Cliente. Hasta que la API los exponga acá, se consultan entrando a cada Proyecto."
      accion={
        <Link href="/espacios" className="text-acento text-sm font-semibold underline underline-offset-4">
          Ir a {GLOSARIO.espacio.plural}
        </Link>
      }
    />
  )
}
