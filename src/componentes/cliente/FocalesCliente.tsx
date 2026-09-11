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

/** `GET`/`PUT /clients/{id}/focales`, con el id ya escapado. La ruta conserva el nombre de la API. */
function rutaDeFocales (clienteId: number): string {
  return `clients/${encodeURIComponent(String(clienteId))}/focales`
}

/** `GET /clients/{id}/areas`, con el id ya escapado. */
function rutaDeAreas (clienteId: number): string {
  return `clients/${encodeURIComponent(String(clienteId))}/areas`
}

/** Los mismos ids, sin importar el orden en que se eligieron. */
function mismasPersonas (unos: number[], otros: number[]): boolean {
  if (unos.length !== otros.length) return false

  const ordenados = [...otros].sort((a, b) => a - b)

  return [...unos].sort((a, b) => a - b).every((id, i) => id === ordenados[i])
}

/**
 * Pestaña Focals del Cliente: quién responde por la cuenta, y en qué áreas se la atiende.

 * El nombre visible sale del glosario (`GLOSARIO.focal`) y nunca escrito a mano: la sección propia
 * de esta gente se llama igual, y dos lugares que escriben la misma palabra son dos lugares que
 * pueden terminar diciendo cosas distintas.
 *
 * **Nombrar a alguien {@link GLOSARIO.focal} reparte acceso.** Quien esté acá ve todos los {@link GLOSARIO.espacio} y
 * todas las {@link GLOSARIO.proceso} del cliente, aunque no sea miembro de ninguno. La pantalla lo
 * dice con esas palabras a propósito: una lista de personas al lado de un cliente se lee como un
 * dato de contacto, y esto no lo es.
 *
 * Las áreas **no se editan acá ni en ningún lado**: salen de las Tareas del cliente, del campo "Área
 * de la compañía" de cada una. Se muestran porque son la respuesta a "qué le hacemos a este cliente"
 * y nadie la tenía a mano; se muestran en gris y sin control porque un campo editable prometería una
 * escritura que no existe.
 *
 * Sin `customers.edit` la pestaña sigue visible en solo lectura, igual que la de Equipo: saber quién
 * responde por una cuenta no es información reservada.
 *
 * @param clienteId el cliente que se esta mirando
 * @param capacidades capacidades sobre `customers`, de `permissions` de `/me`
 */
export function PanelFocalesCliente ({ clienteId, capacidades }: {
  clienteId: number
  capacidades: Capacidad[]
}) {
  const puedeEditar = capacidades.includes('edit')

  const [personas, setPersonas] = useState<StaffReferencia[]>([])
  const [asignadas, setAsignadas] = useState<StaffReferencia[]>([])
  const [elegidas, setElegidas] = useState<number[]>([])
  const [areas, setAreas] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)
  const [cargado, setCargado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const aborto = new AbortController()

    void Promise.all([
      cargarAsignables(),
      pedirSobre<StaffReferencia[]>(rutaDeFocales(clienteId), aborto.signal),
      pedirSobre<string[]>(rutaDeAreas(clienteId), aborto.signal)
    ]).then(([disponibles, focales, deAreas]) => {
      if (aborto.signal.aborted) return
      // Conserva a quien ya es Focal aunque no figure en el catalogo de asignables: si se dio de
      // baja, el selector lo mostraria vacio y guardar lo sacaria sin que nadie lo pidiera.
      setPersonas([...new Map([...disponibles, ...focales.data].map((p) => [p.id, p])).values()])
      setAsignadas(focales.data)
      setElegidas(focales.data.map((persona) => persona.id))
      setAreas(deAreas.data)
      setCargado(true)
    }).catch((fallo: unknown) => {
      if (!aborto.signal.aborted) {
        setError(fallo instanceof Error
          ? fallo.message
          : `No se pudieron cargar los ${GLOSARIO.focal.plural.toLowerCase()}.`)
      }
    }).finally(() => {
      if (!aborto.signal.aborted) setCargando(false)
    })

    return () => aborto.abort()
  }, [clienteId])

  /** Reemplaza la lista entera; una lista vacia deja al cliente sin Focal. */
  async function guardar (evento: React.FormEvent) {
    evento.preventDefault()
    if (!cargado || enviando) return

    setEnviando(true)
    setError(null)
    setGuardado(false)

    const resultado = await escribirEnBff<StaffReferencia[]>(rutaDeFocales(clienteId), 'PUT', { focales: elegidas })
    setEnviando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }

    setAsignadas(resultado.datos)
    setElegidas(resultado.datos.map((persona) => persona.id))
    setGuardado(true)
  }

  if (cargando) return <Cargando alto="min-h-36" mensaje={`Cargando los ${GLOSARIO.focal.plural.toLowerCase()}…`} />

  if (!cargado) {
    return (
      <p role="alert" className="text-texto-peligro text-sm">
        {error ?? `No se pudieron cargar los ${GLOSARIO.focal.plural.toLowerCase()}.`} Recarga la página si el problema continúa.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {puedeEditar
        ? (
          <form onSubmit={guardar} className="flex w-full max-w-md flex-col gap-3">
            <fieldset disabled={enviando} className="min-w-0">
              <legend className="mb-1 text-sm font-medium">{GLOSARIO.focal.plural} de la cuenta</legend>
              <p className="text-texto-tenue mb-2 text-xs">
                El {GLOSARIO.focal.singular} responde por el cliente y ve todos
                sus {GLOSARIO.espacio.plural.toLowerCase()} y todas sus {GLOSARIO.proceso.plural.toLowerCase()}.
              </p>
              <SelectorPersonas personas={personas} elegidas={elegidas} onCambiar={setElegidas} />
              {elegidas.length === 0 && (
                <p className="text-texto-tenue mt-2 text-xs">
                  El cliente quedará sin {GLOSARIO.focal.singular.toLowerCase()}.
                </p>
              )}
            </fieldset>

            {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}
            {guardado && (
              <p role="status" className="text-texto-tenue text-xs">
                {GLOSARIO.focal.plural} actualizados.
              </p>
            )}

            <div>
              <Boton
                type="submit"
                tamano="chico"
                variante="primario"
                disabled={enviando || mismasPersonas(elegidas, asignadas.map((persona) => persona.id))}
                cargando={enviando}
              >
                Guardar {GLOSARIO.focal.plural.toLowerCase()}
              </Boton>
            </div>
          </form>
          )
        : <ListaFocales personas={asignadas} />}

      <AreasDelCliente areas={areas} />
    </div>
  )
}

/** Quiénes responden hoy por la cuenta, para quien no puede cambiarlo. */
function ListaFocales ({ personas }: { personas: StaffReferencia[] }) {
  if (personas.length === 0) {
    return (
      <Vacio
        titulo={`Este cliente no tiene ${GLOSARIO.focal.singular.toLowerCase()}`}
        descripcion={`Quien sea ${GLOSARIO.focal.singular.toLowerCase()} verá todos los ${GLOSARIO.espacio.plural.toLowerCase()} y todas las ${GLOSARIO.proceso.plural.toLowerCase()} del cliente.`}
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

/** Las áreas que atienden al cliente, derivadas de sus Tareas. Solo lectura, siempre. */
function AreasDelCliente ({ areas }: { areas: string[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Áreas que lo atienden</h3>
      <p className="text-texto-tenue text-xs">
        Salen del área declarada en cada {GLOSARIO.proceso.singular.toLowerCase()} del cliente. No se editan acá:
        cambian solas cuando cambia el trabajo.
      </p>

      {areas.length === 0
        ? (
          <p className="text-texto-tenue text-sm">
            Todavía no hay ninguna {GLOSARIO.proceso.singular.toLowerCase()} con área declarada.
          </p>
          )
        : (
          <ul className="flex flex-wrap gap-2">
            {areas.map((area) => (
              <li
                key={area}
                className="bg-relleno-neutro text-relleno-neutro-contenido rounded-control px-3 py-1 text-sm"
              >
                {area}
              </li>
            ))}
          </ul>
          )}
    </section>
  )
}
