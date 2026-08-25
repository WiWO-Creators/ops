'use client'

import { useMemo, type ReactElement } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PanelRecurso } from '@/componentes/proyecto/PanelRecurso'
import { cn } from '@/lib/clases'
import { ARCHIVOS } from '@/definiciones/archivos'
import { CONTRATOS } from '@/definiciones/contratos'
import { NOTAS_CLIENTE } from '@/definiciones/clientes'
import { PROCESOS } from '@/definiciones/procesos'
import { TICKETS } from '@/definiciones/tickets'
import { FACTURAS, GASTOS, PRESUPUESTOS } from '@/definiciones/ventas'
import { GLOSARIO } from '@/dominio/glosario'
import type { ArchivoProyecto, NotaCliente, Proceso } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import type { DefinicionRecurso } from '@/definiciones/tipos'

/**
 * Las pestañas de listado del detalle de Cliente.
 *
 * Ninguna escribe una tabla: todas montan `PanelRecurso`, el mismo motor que usa el detalle de
 * Proyecto, con la definicion que ya existe y la ruta apuntando al subrecurso del cliente. Doce
 * pestañas entre las dos pantallas y una sola implementacion de tabla.
 *
 * Viven todas en un archivo porque cada una son cinco lineas: seis archivos de cinco lineas es
 * ceremonia, no arquitectura.
 */

/** Acota una definicion al subrecurso de un cliente. `GET /clients/{id}/{subruta}`. */
function deCliente<T> (definicion: DefinicionRecurso<T>, clienteId: number, subruta: string): DefinicionRecurso<T> {
  return { ...definicion, ruta: `clients/${encodeURIComponent(String(clienteId))}/${subruta}` }
}

/**
 * Pestaña Tareas del Cliente.
 *
 * Es la unica que no se acota por ruta: `GET /clients/{id}/tasks` no existe, y el backend expone
 * `GET /tasks?filter[clientid]=N` —que incluye tanto las Tareas colgadas del cliente como las de sus
 * Proyectos—. Va como `consultaFija` y no como filtro de la vista justamente para que no aparezca en
 * la URL: ahi seria editable, y cambiar el numero mostraria Tareas de otro cliente bajo este nombre.
 *
 * Se poda el filtro por Proyecto: su selector no tiene catalogo y saldria vacio.
 *
 * @param clienteId el cliente que se esta mirando
 * @param capacidades capacidades sobre `tasks`, de `permissions` de `/me`
 */
export function PanelTareasCliente ({
  clienteId,
  capacidades
}: { clienteId: number, capacidades: Capacidad[] }): ReactElement {
  const definicion = useMemo<DefinicionRecurso<Proceso>>(
    () => ({
      ...PROCESOS,
      consultaFija: `filter[clientid]=${encodeURIComponent(String(clienteId))}`,
      filtros: PROCESOS.filtros.filter((filtro) => filtro.clave !== 'project_id' && filtro.clave !== 'milestone_id'),
      // El tablero mueve tareas por proyecto y no tiene sentido sobre un corte por cliente.
      tablero: undefined
    }),
    [clienteId]
  )

  return <PanelRecurso definicion={definicion} claveFila={(t) => t.id} capacidades={capacidades} />
}

/**
 * Pestaña Tickets del Cliente. Solo lectura, igual que en el detalle de Proyecto.
 *
 * @param clienteId el cliente que se esta mirando
 * @param capacidades capacidades sobre `tasks`, que es el area que rige los tickets
 */
export function PanelTicketsCliente ({
  clienteId,
  capacidades
}: { clienteId: number, capacidades: Capacidad[] }): ReactElement {
  const definicion = useMemo(() => deCliente(TICKETS, clienteId, 'tickets'), [clienteId])

  return <PanelRecurso definicion={definicion} claveFila={(t) => t.ticketid} capacidades={capacidades} />
}

/**
 * Pestaña Contratos del Cliente.
 *
 * Se poda la columna Cliente: bajo el encabezado de este cliente repite su nombre en cada fila.
 *
 * @param clienteId el cliente que se esta mirando
 */
export function PanelContratosCliente ({ clienteId }: { clienteId: number }): ReactElement {
  const definicion = useMemo(
    () => ({
      ...deCliente(CONTRATOS, clienteId, 'contracts'),
      columnas: CONTRATOS.columnas.filter((columna) => columna.clave !== 'client')
    }),
    [clienteId]
  )

  return <PanelRecurso definicion={definicion} claveFila={(c) => c.id} />
}

/**
 * Pestaña Notas del Cliente.
 *
 * **No son las notas privadas de un Espacio**: estas las ve todo el staff, por eso la tabla trae
 * autor. Solo lectura: la API de clientes no tiene escrituras.
 *
 * @param clienteId el cliente que se esta mirando
 */
export function PanelNotasCliente ({ clienteId }: { clienteId: number }): ReactElement {
  const definicion = useMemo<DefinicionRecurso<NotaCliente>>(
    () => deCliente(NOTAS_CLIENTE, clienteId, 'notes'),
    [clienteId]
  )

  return <PanelRecurso definicion={definicion} claveFila={(n) => n.id} />
}

/**
 * Pestaña Archivos del Cliente.
 *
 * El endpoint no pagina —devuelve `{data: [...]}` sin `meta`—, y el motor de tabla ya no dibuja
 * paginacion cuando falta: inventar "página 1 de 1" seria afirmar algo que el backend no dijo.
 *
 * Los adjuntos internos no se pueden descargar: la API no expone ese endpoint, asi que la columna de
 * origen distingue los externos, que si traen `url` abrible.
 *
 * @param clienteId el cliente que se esta mirando
 */
export function PanelArchivosCliente ({ clienteId }: { clienteId: number }): ReactElement {
  const definicion = useMemo(
    () => ({
      ...deCliente(ARCHIVOS, clienteId, 'files'),
      columnas: ARCHIVOS.columnas.map((columna) => (
        columna.clave === 'external'
          ? { ...columna, presentar: (a: ArchivoProyecto) => <Origen archivo={a} /> }
          : columna
      ))
    }),
    [clienteId]
  )

  return <PanelRecurso definicion={definicion} claveFila={(a) => a.id} />
}

/** Origen del archivo: enlace externo cuando lo hay, o la leyenda de interno. */
function Origen ({ archivo }: { archivo: ArchivoProyecto }): ReactElement {
  const externo = archivo.external !== null && archivo.external !== '' && archivo.url !== null

  if (!externo) return <span className="text-texto-sutil text-xs">Interno</span>

  return (
    <a
      href={archivo.url ?? '#'}
      target="_blank"
      rel="noreferrer"
      className="text-acento text-xs font-semibold underline underline-offset-4"
    >
      Abrir en {archivo.external}
    </a>
  )
}

/** Lo unico que el motor de tabla necesita de una fila de ventas: como identificarla. */
interface FilaVenta {
  id: number
}

/** Las tres listas de la pestaña Ventas, en el orden del panel viejo. */
const VENTAS = [
  { clave: 'facturas', etiqueta: 'Facturas', definicion: FACTURAS, subruta: 'invoices' },
  { clave: 'presupuestos', etiqueta: 'Presupuestos', definicion: PRESUPUESTOS, subruta: 'estimates' },
  { clave: 'gastos', etiqueta: 'Gastos', definicion: GASTOS, subruta: 'expenses' }
] as const

/**
 * Pestaña Ventas del Cliente: facturas, presupuestos y gastos.
 *
 * Tres listas en una pestaña con un selector, igual que en el detalle de Proyecto: tres entradas en
 * la barra principal para tres listas casi siempre vacias empujarian el resto fuera de la pantalla.
 * La elegida viaja en `?ventas=`, como el resto del estado de las vistas.
 *
 * A diferencia del Proyecto, las facturas arrancan primero: en un cliente es lo que se viene a ver.
 *
 * @param clienteId el cliente que se esta mirando
 */
export function PanelVentasCliente ({ clienteId }: { clienteId: number }): ReactElement {
  const router = useRouter()
  const params = useSearchParams()

  const pedida = params.get('ventas')
  const activa = VENTAS.find((lista) => lista.clave === pedida) ?? VENTAS[0]

  // Las tres tienen filas distintas (`GastoEspacio` y `DocumentoVenta`) y el motor solo necesita
  // saber identificarlas: se estrecha a lo unico que comparten en vez de triplicar la pestaña.
  const definicion = useMemo(
    () => deCliente(
      activa.definicion as unknown as DefinicionRecurso<FilaVenta>,
      clienteId,
      activa.subruta
    ),
    [clienteId, activa]
  )

  /** Cambia de lista conservando el resto de la vista, y descarta la paginacion de la anterior. */
  function elegir (clave: string): void {
    const siguientes = new URLSearchParams(params.toString())
    siguientes.set('ventas', clave)
    siguientes.delete('page')
    siguientes.delete('sort')

    router.replace(`?${siguientes.toString()}`, { scroll: false })
  }

  const barra = (
    <div role="group" aria-label="Listas de ventas" className="flex flex-wrap gap-1">
      {VENTAS.map((lista) => (
        <button
          key={lista.clave}
          type="button"
          aria-pressed={lista.clave === activa.clave}
          onClick={() => { elegir(lista.clave) }}
          className={cn(
            'rounded-control px-3 py-1 text-xs font-medium transition-colors',
            lista.clave === activa.clave
              ? 'bg-seleccionado text-texto'
              : 'text-texto-tenue hover:bg-hover hover:text-texto'
          )}
        >
          {lista.etiqueta}
        </button>
      ))}
    </div>
  )

  return (
    <PanelRecurso
      // Remonta al cambiar de lista: las tres tienen columnas y filtros distintos.
      key={activa.clave}
      definicion={definicion}
      claveFila={(fila) => fila.id}
      barra={barra}
    />
  )
}

/** Nombre visible de la pestaña Tareas, para que la pagina no escriba "Tareas" a mano. */
export const ETIQUETA_TAREAS = GLOSARIO.proceso.plural
