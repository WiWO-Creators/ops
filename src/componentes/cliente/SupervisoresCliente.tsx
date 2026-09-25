'use client'

import { useEffect, useState } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { SelectorPersonas } from '@/componentes/formularios/SelectorPersonas'
import { Cargando, Vacio } from '@/componentes/estado/Estados'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { cargarAsignables } from '@/datos/asignables'
import { pedirSobre } from '@/datos/cliente'
import { rutaDeSupervisoresDeCliente, type SupervisorDeCliente } from '@/datos/supervision'
import type { Capacidad, StaffReferencia } from '@/datos/tipos'
import { etiquetaDeEscalon } from '@/dominio/escalon'
import { alcanzaParaSupervisar, mensajeDeRechazo, nombreDeSupervisor } from '@/dominio/supervision'

/** Los mismos ids, sin importar el orden en que se eligieron. */
function mismasPersonas (unos: number[], otros: number[]): boolean {
  if (unos.length !== otros.length) return false

  const ordenados = [...otros].sort((a, b) => a - b)

  return [...unos].sort((a, b) => a - b).every((id, i) => id === ordenados[i])
}

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
 * @param capacidades capacidades sobre `customers`, de `permissions` de `/me`
 */
export function PanelSupervisoresCliente ({ clienteId, capacidades }: {
  clienteId: number
  capacidades: Capacidad[]
}) {
  const [candidatos, setCandidatos] = useState<StaffReferencia[]>([])
  const [asignados, setAsignados] = useState<SupervisorDeCliente[]>([])
  const [elegidas, setElegidas] = useState<number[]>([])
  const [cargando, setCargando] = useState(true)
  const [cargado, setCargado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const puedeEscribir = capacidades.includes('edit')

  useEffect(() => {
    const aborto = new AbortController()

    void Promise.all([
      // `cargarAsignables` no acepta señal —la promesa es compartida—; el `aborted` de abajo descarta.
      puedeEscribir ? cargarCandidatos() : Promise.resolve([]),
      pedirSobre<SupervisorDeCliente[]>(rutaDeSupervisoresDeCliente(clienteId), aborto.signal)
    ]).then(([disponibles, actuales]) => {
      if (aborto.signal.aborted) return
      // Conserva a quien ya supervisa aunque haya bajado de escalón: si no, el selector lo
      // mostraría vacío y guardar lo sacaría sin que nadie lo pidiera.
      setCandidatos([...new Map([...disponibles, ...actuales.data.map(comoReferencia)].map((p) => [p.id, p])).values()])
      setAsignados(actuales.data)
      setElegidas(actuales.data.map((s) => s.staffid))
      setCargado(true)
    }).catch((fallo: unknown) => {
      if (!aborto.signal.aborted) setError(fallo instanceof Error ? fallo.message : 'No se pudieron cargar los supervisores.')
    }).finally(() => {
      if (!aborto.signal.aborted) setCargando(false)
    })

    return () => aborto.abort()
  }, [clienteId, puedeEscribir])

  /** Reemplaza la lista entera; una lista vacía deja al cliente sin supervisión. */
  async function guardar (evento: React.FormEvent) {
    evento.preventDefault()
    if (!cargado || enviando) return

    setEnviando(true)
    setError(null)
    setGuardado(false)

    const resultado = await escribirEnBff<SupervisorDeCliente[]>(
      rutaDeSupervisoresDeCliente(clienteId), 'PUT', { staff_ids: elegidas }
    )
    setEnviando(false)

    if (!resultado.ok) {
      setError(mensajeDeRechazo(resultado.mensaje, resultado.estado, resultado.detalles))

      return
    }

    setAsignados(resultado.datos)
    setElegidas(resultado.datos.map((s) => s.staffid))
    setGuardado(true)
  }

  if (cargando) return <Cargando alto="min-h-36" mensaje="Cargando los supervisores…" />

  if (!cargado) {
    return (
      <p role="alert" className="text-texto-peligro text-sm">
        {error ?? 'No se pudieron cargar los supervisores.'} Recarga la página si el problema continúa.
      </p>
    )
  }

  if (!puedeEscribir) return <ListaSupervisores supervisores={asignados} />

  return (
    <form onSubmit={guardar} className="flex w-full max-w-md flex-col gap-3">
      <fieldset disabled={enviando} className="min-w-0">
        <legend className="mb-1 text-sm font-medium">Supervisores de la cuenta</legend>
        <p className="text-texto-tenue mb-2 text-xs">
          Cada supervisor recibe una hoja diaria con las tareas de este cliente que vencen ese día o ya
          vencieron, y la firma al revisarla. Solo aparecen personas de escalón Lead, Director o Gerencia.
        </p>
        <SelectorPersonas personas={candidatos} elegidas={elegidas} onCambiar={setElegidas} />
        {elegidas.length === 0 && (
          <p className="text-texto-tenue mt-2 text-xs">El cliente quedará sin supervisión diaria.</p>
        )}
      </fieldset>

      {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}
      {guardado && <p role="status" className="text-texto-tenue text-xs">Supervisores actualizados.</p>}

      <div>
        <Boton
          type="submit"
          tamano="chico"
          variante="primario"
          disabled={enviando || mismasPersonas(elegidas, asignados.map((s) => s.staffid))}
          cargando={enviando}
        >
          Guardar supervisores
        </Boton>
      </div>
    </form>
  )
}

/** Quiénes supervisan hoy la cuenta, para quien no puede cambiarlo. */
function ListaSupervisores ({ supervisores }: { supervisores: SupervisorDeCliente[] }) {
  if (supervisores.length === 0) {
    return (
      <Vacio
        titulo="Este cliente no tiene supervisores"
        descripcion="Un supervisor revisa cada día las tareas vencidas del cliente y firma la hoja."
      />
    )
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {supervisores.map((supervisor) => (
        <li
          key={supervisor.staffid}
          className="bg-relleno-neutro text-relleno-neutro-contenido rounded-control px-3 py-1 text-sm"
        >
          {nombreDeSupervisor(supervisor)}
          <span className="ml-1 opacity-70">· {etiquetaDeEscalon(supervisor.escalon)}</span>
        </li>
      ))}
    </ul>
  )
}
