'use client'

import { MatrizAsignacion } from '@/componentes/formularios/MatrizAsignacion'
import { SelectorPersonas } from '@/componentes/formularios/SelectorPersonas'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { cargarAsignables } from '@/datos/asignables'
import { pedirSobre } from '@/datos/cliente'
import { rutaDeSupervisoresDeCliente, type SupervisorDeCliente } from '@/datos/supervision'
import type { Capacidad, StaffReferencia } from '@/datos/tipos'
import { etiquetaDeEscalon } from '@/dominio/escalon'
import { alcanzaParaSupervisar, mensajeDeRechazo, nombreDeSupervisor } from '@/dominio/supervision'

/** Un supervisor en la forma que dibuja el selector de personas. */
function comoReferencia (supervisor: SupervisorDeCliente): StaffReferencia {
  return { id: supervisor.staffid, full_name: nombreDeSupervisor(supervisor), profile_image_url: null }
}

/**
 * Las personas que se pueden elegir: lead o superior, según el `escalon` de `staff/asignables`.
 *
 * Sale de la misma fuente cacheada que los demás selectores de personas, que pide solo sesión: quien
 * edita clientes puede elegir supervisores aunque no tenga acceso a Equipo.
 */
async function cargarCandidatos (): Promise<StaffReferencia[]> {
  const personas = await cargarAsignables()

  return personas
    .filter((persona) => alcanzaParaSupervisar(persona.escalon))
    .map((persona) => ({ id: persona.id, full_name: persona.full_name, profile_image_url: persona.profile_image_url }))
}

/**
 * Pestaña Supervisión del Cliente: quiénes revisan cada día las Tareas vencidas de esta cuenta.
 *
 * Cada supervisor recibe una hoja diaria con las Tareas de sus clientes que vencen ese día o ya
 * vencieron, la revisa y la firma (`/supervision`). Solo pueden supervisar personas de escalón Lead,
 * Director o Gerencia, y el selector ofrece solo a esas; si igual la API rechaza (alguien cambió de
 * escalón mientras tanto), el motivo se muestra en palabras.
 *
 * Mismo molde y mismo permiso que la pestaña de Focals: `customers.edit` para guardar, y sin él la
 * lista se ve en solo lectura.
 *
 * @param clienteId el cliente que se está mirando
 * @param nombreCliente su nombre, para el aviso al guardar
 * @param capacidades capacidades sobre `customers`, de `permissions` de `/me`
 */
export function PanelSupervisoresCliente ({ clienteId, nombreCliente, capacidades }: {
  clienteId: number
  nombreCliente: string
  capacidades: Capacidad[]
}) {
  const puedeEditar = capacidades.includes('edit')

  return (
    <MatrizAsignacion<StaffReferencia, SupervisorDeCliente>
      clave={`${clienteId}:${puedeEditar}`}
      puedeEditar={puedeEditar}
      cargar={async (senal) => {
        const [opciones, actuales] = await Promise.all([
          // `cargarAsignables` no acepta señal —la promesa es compartida—; la matriz descarta si se abortó.
          puedeEditar ? cargarCandidatos() : Promise.resolve([]),
          pedirSobre<SupervisorDeCliente[]>(rutaDeSupervisoresDeCliente(clienteId), senal)
        ])

        return { opciones, asignados: actuales.data }
      }}
      guardar={(ids) => escribirEnBff<SupervisorDeCliente[]>(rutaDeSupervisoresDeCliente(clienteId), 'PUT', { staff_ids: ids })}
      idDe={(supervisor) => supervisor.staffid}
      comoOpcion={comoReferencia}
      explicarRechazo={(rechazo) => mensajeDeRechazo(rechazo.mensaje, rechazo.estado, rechazo.detalles)}
      textos={{
        cargando: 'Cargando los supervisores…',
        falloDeCarga: 'No se pudieron cargar los supervisores.',
        leyenda: 'Supervisores de la cuenta',
        descripcion: (
          <p className="text-texto-tenue mb-2 text-xs">
            Cada supervisor recibe una hoja diaria con las tareas de este cliente que vencen ese día o ya
            vencieron, y la firma al revisarla. Solo aparecen personas de escalón Lead, Director o Gerencia.
          </p>
        ),
        sinNinguno: 'El cliente quedará sin supervisión diaria.',
        guardar: 'Guardar supervisores',
        exito: `Supervisores de «${nombreCliente}» actualizados.`,
        vacio: {
          titulo: 'Este cliente no tiene supervisores',
          descripcion: 'Un supervisor revisa cada día las tareas vencidas del cliente y firma la hoja.'
        }
      }}
      selector={(personas, elegidas, onCambiar) => (
        <SelectorPersonas personas={personas} elegidas={elegidas} onCambiar={onCambiar} />
      )}
      chip={(supervisor) => (
        <>
          {nombreDeSupervisor(supervisor)}
          <span className="ml-1 opacity-70">· {etiquetaDeEscalon(supervisor.escalon)}</span>
        </>
      )}
    />
  )
}
