'use client'

import { useEffect, useState } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { SelectorPersonas } from '@/componentes/formularios/SelectorPersonas'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Cargando, Vacio } from '@/componentes/estado/Estados'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { cargarAsignables } from '@/datos/asignables'
import { pedirSobre } from '@/datos/cliente'
import { GLOSARIO } from '@/dominio/glosario'
import type { Capacidad, StaffReferencia } from '@/datos/tipos'

/** `GET`/`PUT /clients/{id}/admins`, con el id ya escapado. */
function rutaDeEquipo (clienteId: number): string {
  return `clients/${encodeURIComponent(String(clienteId))}/admins`
}

/** Los mismos ids, sin importar el orden en que se eligieron. */
function mismasPersonas (unos: number[], otros: number[]): boolean {
  if (unos.length !== otros.length) return false

  const ordenados = [...otros].sort((a, b) => a - b)

  return [...unos].sort((a, b) => a - b).every((id, i) => id === ordenados[i])
}

/**
 * Pestaña Equipo del Cliente: quién atiende la cuenta.
 *
 * **No es una etiqueta, reparte acceso.** Quien figura acá ve TODOS los {@link GLOSARIO.espacio} y
 * TODAS las {@link GLOSARIO.proceso} de este cliente, sin ser miembro de cada Proyecto ni asignado
 * de cada Tarea. Por eso la pantalla lo dice con esas palabras: una lista de personas junto a un
 * cliente se lee como un dato de contacto, y esto no lo es.
 *
 * Se guarda la lista entera y no un alta por persona, porque asi es el endpoint: un reemplazo
 * completo no deja al cliente a medio asignar si el navegador se corta.
 *
 * Sin `customers.edit` la pestaña sigue visible en solo lectura: saber quién atiende una cuenta no
 * es información reservada, y esconderla obligaría a preguntar por interno.
 *
 * @param clienteId el cliente que se esta mirando
 * @param capacidades capacidades sobre `customers`, de `permissions` de `/me`
 */
export function PanelEquipoCliente ({ clienteId, capacidades }: {
  clienteId: number
  capacidades: Capacidad[]
}) {
  const puedeEditar = capacidades.includes('edit')

  const [personas, setPersonas] = useState<StaffReferencia[]>([])
  const [asignadas, setAsignadas] = useState<StaffReferencia[]>([])
  const [elegidas, setElegidas] = useState<number[]>([])
  const [cargando, setCargando] = useState(true)
  const [cargado, setCargado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const aborto = new AbortController()

    void Promise.all([
      cargarAsignables(),
      pedirSobre<StaffReferencia[]>(rutaDeEquipo(clienteId), aborto.signal)
    ]).then(([disponibles, equipo]) => {
      if (aborto.signal.aborted) return
      // Conserva a quien ya esta asignado aunque no figure en el catalogo de asignables: si se dio
      // de baja, el selector lo mostraria vacio y guardar lo sacaria sin que nadie lo pidiera.
      setPersonas([...new Map([...disponibles, ...equipo.data].map((p) => [p.id, p])).values()])
      setAsignadas(equipo.data)
      setElegidas(equipo.data.map((persona) => persona.id))
      setCargado(true)
    }).catch((fallo: unknown) => {
      if (!aborto.signal.aborted) setError(fallo instanceof Error ? fallo.message : 'No se pudo cargar el equipo.')
    }).finally(() => {
      if (!aborto.signal.aborted) setCargando(false)
    })

    return () => aborto.abort()
  }, [clienteId])

  /** Reemplaza la lista entera; una lista vacia deja al cliente sin nadie asignado. */
  async function guardar (evento: React.FormEvent) {
    evento.preventDefault()
    if (!cargado || enviando) return

    setEnviando(true)
    setError(null)
    setGuardado(false)

    const resultado = await escribirEnBff<StaffReferencia[]>(rutaDeEquipo(clienteId), 'PUT', { admins: elegidas })
    setEnviando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }

    setAsignadas(resultado.datos)
    setElegidas(resultado.datos.map((persona) => persona.id))
    setGuardado(true)
  }

  if (cargando) return <Cargando alto="min-h-36" mensaje="Cargando el equipo…" />

  if (!cargado) {
    return (
      <p role="alert" className="text-texto-peligro text-sm">
        {error ?? 'No se pudo cargar el equipo.'} Recarga la página si el problema continúa.
      </p>
    )
  }

  // Sin permiso de edicion no hay formulario, y la lista se pinta aparte. Con permiso NO se pinta:
  // el selector ya muestra las elegidas como chips, y dos listas de las mismas personas una debajo
  // de la otra se leen como dos cosas distintas.
  if (!puedeEditar) return <ListaAsignadas personas={asignadas} />

  return (
    <form onSubmit={guardar} className="flex w-full max-w-md flex-col gap-3">
      <fieldset disabled={enviando} className="min-w-0">
        <legend className="mb-1 text-sm font-medium">Personas asignadas</legend>
        <p className="text-texto-tenue mb-2 text-xs">
          Quien esté acá ve todos los {GLOSARIO.espacio.plural.toLowerCase()} y todas las{' '}
          {GLOSARIO.proceso.plural.toLowerCase()} de este cliente.
        </p>
        <SelectorPersonas personas={personas} elegidas={elegidas} onCambiar={setElegidas} />
        {elegidas.length === 0 && (
          <p className="text-texto-tenue mt-2 text-xs">El cliente quedará sin nadie asignado.</p>
        )}
      </fieldset>

      {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}
      {guardado && <p role="status" className="text-texto-tenue text-xs">Equipo actualizado.</p>}

      <div>
        <Boton
          type="submit"
          tamano="chico"
          variante="primario"
          disabled={enviando || mismasPersonas(elegidas, asignadas.map((persona) => persona.id))}
          cargando={enviando}
        >
          Guardar equipo
        </Boton>
      </div>
    </form>
  )
}

/** Quiénes atienden hoy la cuenta, para quien no puede cambiarlo. */
function ListaAsignadas ({ personas }: { personas: StaffReferencia[] }) {
  if (personas.length === 0) {
    return (
      <Vacio
        titulo="Nadie asignado a este cliente"
        descripcion={`Quien se asigne verá todos los ${GLOSARIO.espacio.plural.toLowerCase()} y todas las ${GLOSARIO.proceso.plural.toLowerCase()} del cliente.`}
      />
    )
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {personas.map((persona) => (
        <li
          key={persona.id}
          className="bg-relleno-neutro text-relleno-neutro-contenido rounded-control flex items-center gap-2 py-1 pl-1 pr-3 text-sm"
        >
          <Avatar nombre={persona.full_name} imagen={persona.profile_image_url} tamano="chico" />
          <span className="max-w-52 truncate">{persona.full_name}</span>
        </li>
      ))}
    </ul>
  )
}
