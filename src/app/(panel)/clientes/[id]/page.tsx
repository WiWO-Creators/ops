import Link from 'next/link'
import { Suspense, cache } from 'react'
import { AccionesCliente } from '@/componentes/cliente/AccionesCliente'
import { CabeceraCliente } from '@/componentes/cliente/CabeceraCliente'
import { FichaCliente } from '@/componentes/cliente/FichaCliente'
import { PanelContactos } from '@/componentes/cliente/PanelContactos'
import { PanelProyectosCliente } from '@/componentes/cliente/PanelProyectosCliente'
import {
  PanelArchivosCliente,
  PanelContratosCliente,
  PanelNotasCliente,
  PanelTareasCliente,
  PanelVentasCliente
} from '@/componentes/cliente/PanelesCliente'
import { Pestanas, type Panel } from '@/componentes/proyecto/Pestanas'
import { Cargando, ErrorEstado, SinPermiso, Vacio } from '@/componentes/estado/Estados'
import { listaDe } from '@/datos/catalogos'
import { ErrorApi } from '@/datos/errores'
import { cargarLookups } from '@/datos/lookups'
import { pedir } from '@/datos/servidor'
import type { Yo } from '@/datos/tipos'
import type { ClienteConEnvio, ContactoCompleto, EstadoLookup, Lookups, Moneda } from '@/datos/recursos'
import type { OpcionCampo } from '@/componentes/proyecto/formulario'
import { GLOSARIO } from '@/dominio/glosario'

/**
 * Pide el cliente una sola vez por peticion.
 *
 * `generateMetadata` y la pagina corren en la misma peticion y necesitan el mismo recurso; sin
 * `cache` serian dos llamadas a la API por cada visita.
 *
 * `include=contacts` se sigue pidiendo para la cabecera: es la forma corta y solo trae los activos.
 * La pestaña Contactos NO la usa —necesita tambien los dados de baja y sus permisos de portal— y por
 * eso pide `GET /clients/{id}/contacts` aparte.
 */
const traerCliente = cache(async (id: string) => {
  return await pedir<ClienteConEnvio>(`/clients/${id}?include=contacts,custom_fields`)
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
  cliente: ClienteConEnvio
  contactos: ContactoCompleto[]
  lookups: Lookups
  yo: Yo
}

/**
 * Carga lo minimo que la pantalla necesita para pintarse: el cliente y los catalogos.
 *
 * Los listados de las pestañas NO se piden aca: son ocho, cualquiera puede no abrirse nunca, y
 * bajarlos todos costaria ocho viajes a la API por visita para mostrar uno. Cada panel pide el suyo
 * al montarse y `Pestanas` monta solo el activo. Los catalogos si, porque de ellos salen los nombres
 * de pais y moneda de la ficha, que se pinta de entrada.
 *
 * @param id id del cliente tal como viene de la ruta
 * @returns el detalle, o el `ErrorApi` que impidio cargarlo
 */
async function cargarDetalle (id: string): Promise<Detalle | ErrorApi> {
  try {
    const [cliente, contactos, lookups, yo] = await Promise.all([
      traerCliente(id),
      // Con los dados de baja incluidos: la pestaña los muestra atenuados para poder reactivarlos.
      pedir<ContactoCompleto[]>(`/clients/${id}/contacts`),
      cargarLookups(),
      pedir<Yo>('/me')
    ])

    return { cliente: cliente.data, contactos: contactos.data, lookups, yo: yo.data }
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

  const { cliente, contactos, lookups, yo } = detalle
  const capacidadesTareas = yo.permissions.tasks
  const activos = contactos.filter((contacto) => contacto.active).length

  const paneles: Panel[] = [
    {
      clave: 'ficha',
      etiqueta: 'Ficha',
      contenido: (
        <FichaCliente
          cliente={cliente}
          paises={listaDe(lookups, 'countries')}
          monedas={monedasDe(lookups)}
        />
      )
    },
    {
      clave: 'contactos',
      // El numero cuenta los ACTIVOS: los de baja se ven en la pestaña, pero contarlos en la
      // etiqueta le prometeria al que mira mas gente a la que escribirle de la que hay.
      etiqueta: activos === 0 ? 'Contactos' : `Contactos (${activos})`,
      contenido: (
        <PanelContactos
          clienteId={cliente.id}
          contactos={contactos}
          capacidades={yo.permissions.customers}
        />
      )
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
    {
      clave: 'tareas',
      etiqueta: GLOSARIO.proceso.plural,
      contenido: <PanelTareasCliente clienteId={cliente.id} capacidades={capacidadesTareas} />
    },
    { clave: 'ventas', etiqueta: 'Ventas', contenido: <PanelVentasCliente clienteId={cliente.id} /> },
    { clave: 'contratos', etiqueta: 'Contratos', contenido: <PanelContratosCliente clienteId={cliente.id} /> },
    { clave: 'notas', etiqueta: 'Notas', contenido: <PanelNotasCliente clienteId={cliente.id} /> },
    { clave: 'archivos', etiqueta: 'Archivos', contenido: <PanelArchivosCliente clienteId={cliente.id} /> }
  ]

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CabeceraCliente cliente={cliente} />
        <AccionesCliente
          cliente={cliente}
          paises={comoOpciones(listaDe(lookups, 'countries'))}
          monedas={comoOpciones(listaDe(lookups, 'currencies'))}
          capacidades={yo.permissions.customers}
        />
      </div>

      <Suspense fallback={<Cargando alto="min-h-36" mensaje="Cargando el detalle…" />}>
        <Pestanas paneles={paneles} />
      </Suspense>
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

/**
 * Las monedas de `GET /lookups`.
 *
 * `listaDe` devuelve `EstadoLookup[]`, que no tiene `symbol` ni `is_default`: la ficha necesita los
 * dos, asi que este es el unico punto de la pantalla que conoce la forma real del catalogo.
 *
 * @param lookups Catalogos ya cargados.
 * @returns Las monedas, o vacio si el backend todavia no expone el catalogo.
 */
function monedasDe (lookups: Lookups): Moneda[] {
  const lista = (lookups as unknown as Record<string, unknown>).currencies

  return Array.isArray(lista) ? lista as Moneda[] : []
}
