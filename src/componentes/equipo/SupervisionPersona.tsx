'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Boton } from '@/componentes/formularios/Boton'
import { SelectorClientes, type ClienteElegible } from '@/componentes/formularios/SelectorClientes'
import { Cargando, Vacio } from '@/componentes/estado/Estados'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { pedirSobre } from '@/datos/cliente'
import type { Cliente } from '@/datos/recursos'
import { rutaDeSupervisionDePersona, type ClienteSupervisado } from '@/datos/supervision'
import type { Capacidad } from '@/datos/tipos'
import { enlaceDeHoja, hoyEnSantiago, mensajeDeRechazo } from '@/dominio/supervision'

/** El tope de la API por página: con cien, la cartera se cortaba a mitad del alfabeto. */
const CLIENTES_A_TRAER = 500

/** Los mismos ids, sin importar el orden en que se eligieron. */
function mismosClientes (unos: number[], otros: number[]): boolean {
  if (unos.length !== otros.length) return false

  const ordenados = [...otros].sort((a, b) => a - b)

  return [...unos].sort((a, b) => a - b).every((id, i) => id === ordenados[i])
}

/** Un cliente supervisado en la forma que dibuja el selector. */
function comoElegible (cliente: ClienteSupervisado): ClienteElegible {
  return { id: cliente.client_id, company: cliente.company, image_url: null }
}

/**
 * Pestaña Supervisión de la ficha de una persona: qué clientes supervisa cada día.
 *
 * Es la misma relación que la pestaña Supervisión del Cliente, mirada desde la persona: sirve para
 * repartirle de una vez las cuentas a un lead nuevo. La ficha solo la muestra a personas de escalón
 * Lead o superior, que son las únicas que la API acepta como supervisoras.
 *
 * Edita con `customers.edit`, el mismo permiso que la pestaña del Cliente; sin él se ve en solo
 * lectura.
 *
 * @param personaId la persona que se está mirando
 * @param nombre su nombre de pila, para los textos
 * @param capacidades capacidades sobre `customers`, de `permissions` de `/me`
 */
export function SupervisionPersona ({ personaId, nombre, capacidades }: {
  personaId: number
  nombre: string
  capacidades: Capacidad[]
}) {
  const puedeEditar = capacidades.includes('edit')

  const [catalogo, setCatalogo] = useState<ClienteElegible[]>([])
  const [asignados, setAsignados] = useState<ClienteElegible[]>([])
  const [elegidos, setElegidos] = useState<number[]>([])
  const [cargando, setCargando] = useState(true)
  const [cargado, setCargado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const aborto = new AbortController()

    void Promise.all([
      puedeEditar ? pedirSobre<Cliente[]>(`clients?per_page=${CLIENTES_A_TRAER}`, aborto.signal) : Promise.resolve({ data: [] }),
      pedirSobre<ClienteSupervisado[]>(rutaDeSupervisionDePersona(personaId), aborto.signal)
    ]).then(([disponibles, supervisados]) => {
      if (aborto.signal.aborted) return

      const suyos = supervisados.data.map(comoElegible)

      // Conserva los que ya supervisa aunque no entren en la página pedida: si no, guardar los
      // sacaría sin que nadie lo pidiera.
      setCatalogo([...new Map([
        ...disponibles.data.map((c) => ({ id: c.id, company: c.company, image_url: c.image_url })),
        ...suyos
      ].map((c) => [c.id, c])).values()])
      setAsignados(suyos)
      setElegidos(suyos.map((c) => c.id))
      setCargado(true)
    }).catch((fallo: unknown) => {
      if (!aborto.signal.aborted) setError(fallo instanceof Error ? fallo.message : 'No se pudo cargar la supervisión.')
    }).finally(() => {
      if (!aborto.signal.aborted) setCargando(false)
    })

    return () => aborto.abort()
  }, [personaId, puedeEditar])

  /** Reemplaza la lista entera; vacía, la persona deja de supervisar. */
  async function guardar (evento: React.FormEvent) {
    evento.preventDefault()
    if (!cargado || enviando) return

    setEnviando(true)
    setError(null)
    setGuardado(false)

    const resultado = await escribirEnBff<ClienteSupervisado[]>(
      rutaDeSupervisionDePersona(personaId), 'PUT', { client_ids: elegidos }
    )
    setEnviando(false)

    if (!resultado.ok) {
      setError(mensajeDeRechazo(resultado.mensaje, resultado.estado, resultado.detalles))

      return
    }

    const suyos = resultado.datos.map(comoElegible)

    setAsignados(suyos)
    setElegidos(suyos.map((c) => c.id))
    setGuardado(true)
  }

  if (cargando) return <Cargando alto="min-h-36" mensaje="Cargando la supervisión…" />

  if (!cargado) {
    return (
      <p role="alert" className="text-texto-peligro text-sm">
        {error ?? 'No se pudo cargar la supervisión.'} Recarga la página si el problema continúa.
      </p>
    )
  }

  const enlace = (
    <Link href={enlaceDeHoja(hoyEnSantiago(), personaId)} className="text-acento text-sm font-semibold underline underline-offset-4">
      Ver la hoja de hoy
    </Link>
  )

  if (!puedeEditar) return <ListaSupervisados clientes={asignados} nombre={nombre} enlace={enlace} />

  return (
    <form onSubmit={guardar} className="flex w-full max-w-md flex-col gap-3">
      <fieldset disabled={enviando} className="min-w-0">
        <legend className="mb-1 text-sm font-medium">Clientes que {nombre} supervisa</legend>
        <p className="text-texto-tenue mb-2 text-xs">
          Cada día recibe una hoja con las tareas de estos clientes que vencen ese día o ya vencieron, la
          revisa y la firma.
        </p>
        <SelectorClientes clientes={catalogo} elegidos={elegidos} onCambiar={setElegidos} />
        {elegidos.length === 0 && (
          <p className="text-texto-tenue mt-2 text-xs">{nombre} no supervisará ningún cliente.</p>
        )}
      </fieldset>

      {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}
      {guardado && <p role="status" className="text-texto-tenue text-xs">Supervisión actualizada.</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Boton
          type="submit"
          tamano="chico"
          variante="primario"
          disabled={enviando || mismosClientes(elegidos, asignados.map((c) => c.id))}
          cargando={enviando}
        >
          Guardar clientes
        </Boton>
        {asignados.length > 0 && enlace}
      </div>
    </form>
  )
}

/** Qué clientes supervisa, para quien no puede cambiarlo. */
function ListaSupervisados ({ clientes, nombre, enlace }: { clientes: ClienteElegible[], nombre: string, enlace: React.ReactNode }) {
  if (clientes.length === 0) {
    return (
      <Vacio
        titulo={`${nombre} no supervisa ningún cliente`}
        descripcion="Los supervisores se asignan en la ficha del cliente, pestaña Supervisión."
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-2">
        {clientes.map((cliente) => (
          <li key={cliente.id} className="bg-relleno-neutro text-relleno-neutro-contenido rounded-control px-3 py-1 text-sm">
            {cliente.company}
          </li>
        ))}
      </ul>
      <div>{enlace}</div>
    </div>
  )
}
