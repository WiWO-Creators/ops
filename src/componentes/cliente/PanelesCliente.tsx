'use client'

import { useMemo, type ReactElement } from 'react'
import { PanelRecurso } from '@/componentes/proyecto/PanelRecurso'
import { ARCHIVOS } from '@/definiciones/archivos'
import { NOTAS_CLIENTE } from '@/definiciones/clientes'
import { PROCESOS } from '@/definiciones/procesos'
import { GLOSARIO } from '@/dominio/glosario'
import type { ArchivoProyecto, NotaCliente, Proceso } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import type { DefinicionRecurso } from '@/definiciones/tipos'

/**
 * Las pestañas de listado del detalle de Cliente.
 *
 * Ninguna escribe una tabla: todas montan `PanelRecurso`, el mismo motor que usa el detalle de
 * Proyecto, con la definicion que ya existe y la ruta apuntando al subrecurso del cliente.
 *
 * Viven todas en un archivo porque cada una son cinco lineas: tres archivos de cinco lineas es
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

/** Nombre visible de la pestaña Tareas, para que la pagina no escriba "Tareas" a mano. */
export const ETIQUETA_TAREAS = GLOSARIO.proceso.plural
