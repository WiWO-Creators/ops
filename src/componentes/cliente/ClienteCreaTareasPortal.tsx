'use client'

import { useEffect, useState } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { AvisoEnLinea } from '@/componentes/estado/Estados'
import { useAviso } from '@/componentes/estado/useAviso'
import { Boton } from '@/componentes/formularios/Boton'
import { CLASES_CASILLA } from '@/componentes/formularios/Entrada'
import { pedirSobre } from '@/datos/cliente'
import { GLOSARIO } from '@/dominio/glosario'
import type { Capacidad } from '@/datos/tipos'

/** Lo que guarda y devuelve `GET|PUT /clients/{id}/portal-crea-tareas`. */
interface CreaTareasDelPortal {
  habilitado: boolean
}

/** `GET|PUT /clients/{id}/portal-crea-tareas`, con el id ya escapado. */
function rutaDeCreaTareas (clienteId: number): string {
  return `clients/${encodeURIComponent(String(clienteId))}/portal-crea-tareas`
}

interface Props {
  clienteId: number
  /** Capacidades sobre `customers`, de `permissions` de `/me`. */
  capacidades: Capacidad[]
}

/**
 * Si los contactos de este cliente pueden crear Tareas desde el portal.
 *
 * === QUE DECIDE ===
 *
 * Nace apagado para todo cliente: el portal es de lectura salvo lo que se enciende a proposito. Con la
 * casilla marcada, los contactos que ven las Tareas de un Proyecto
 * suyo pueden crear una desde ahi, y el Thinking Orb del portal puede proponerles crearla. Entra al
 * flujo normal, marcada como creada por el cliente.
 *
 * La regla la aplica la API: ahi se revisa tambien que el contacto vea el Proyecto y
 * que lo asignado sea del equipo del Proyecto. Esta casilla solo la enciende.
 *
 * Sin `customers.edit` se dibuja en solo lectura, igual que la fecha de vencimiento.
 *
 * @param clienteId el cliente que se esta mirando
 * @param capacidades capacidades sobre `customers`
 */
export function ClienteCreaTareasPortal ({ clienteId, capacidades }: Props) {
  const puedeEditar = capacidades.includes('edit')
  const avisar = useAviso()

  const [guardado, setGuardado] = useState<CreaTareasDelPortal | null>(null)
  const [habilitado, setHabilitado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const aborto = new AbortController()

    void pedirSobre<CreaTareasDelPortal>(rutaDeCreaTareas(clienteId), aborto.signal)
      .then((sobre) => {
        if (aborto.signal.aborted) return

        setGuardado(sobre.data)
        setHabilitado(sobre.data.habilitado)
      })
      .catch((fallo: unknown) => {
        if (aborto.signal.aborted) return

        setError(fallo instanceof Error
          ? fallo.message
          : `No se pudo cargar si sus contactos crean ${GLOSARIO.proceso.plural.toLowerCase()}.`)
      })

    return () => { aborto.abort() }
  }, [clienteId])

  /** Guarda la casilla con un PUT y se queda con lo que devuelve la API, no con lo que se mando. */
  async function guardar (evento: React.FormEvent) {
    evento.preventDefault()
    if (enviando) return

    setEnviando(true)
    setError(null)

    const resultado = await escribirEnBff<CreaTareasDelPortal>(rutaDeCreaTareas(clienteId), 'PUT', { habilitado })

    setEnviando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    setGuardado(resultado.datos)
    setHabilitado(resultado.datos.habilitado)
    avisar.exito(frase(resultado.datos.habilitado))
  }

  if (error !== null && guardado === null) {
    return (
      <Seccion>
        <AvisoEnLinea variante="error" mensaje={error} className="text-sm" />
      </Seccion>
    )
  }

  if (guardado === null) {
    return (
      <Seccion>
        <p className="text-texto-tenue text-sm">Cargando la regla…</p>
      </Seccion>
    )
  }

  if (!puedeEditar) {
    return (
      <Seccion>
        <p className="text-texto text-sm">{frase(guardado.habilitado)}</p>
      </Seccion>
    )
  }

  return (
    <Seccion>
      <form onSubmit={guardar} className="flex flex-col gap-3">
        <fieldset disabled={enviando} className="flex min-w-0 flex-col gap-1">
          <label htmlFor="cliente-crea-tareas" className="text-texto flex items-center gap-2 text-sm">
            <input
              id="cliente-crea-tareas"
              type="checkbox"
              checked={habilitado}
              onChange={(evento) => { setHabilitado(evento.target.checked) }}
              aria-describedby="cliente-crea-tareas-ayuda"
              className={CLASES_CASILLA}
            />
            Sus contactos pueden crear {GLOSARIO.proceso.plural} desde el portal
          </label>
          <p id="cliente-crea-tareas-ayuda" className="text-texto-tenue text-xs">
            Aplica a todos sus {GLOSARIO.espacio.plural.toLowerCase()}. La {GLOSARIO.proceso.singular.toLowerCase()} entra
            al flujo normal y queda marcada como creada por el cliente.
          </p>
        </fieldset>

        {error !== null && <AvisoEnLinea variante="error" mensaje={error} className="text-sm" />}

        <div>
          <Boton
            type="submit"
            tamano="chico"
            variante="primario"
            disabled={enviando || habilitado === guardado.habilitado}
            cargando={enviando}
          >
            Guardar regla
          </Boton>
        </div>
      </form>
    </Seccion>
  )
}

/** La regla escrita, para el aviso de guardado y para quien solo la puede leer. */
function frase (habilitado: boolean): string {
  const tareas = GLOSARIO.proceso.plural

  return habilitado
    ? `Los contactos de este cliente pueden crear ${tareas} desde el portal.`
    : `Los contactos de este cliente no pueden crear ${tareas} desde el portal.`
}

/** El marco de la seccion, uno solo para los tres estados en que se dibuja. */
function Seccion ({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-tarjeta border-linea bg-superficie-elevada shadow-1 flex flex-col gap-3 border p-5">
      <div>
        <h3 className="font-titular text-texto text-sm font-semibold">Portal: crear {GLOSARIO.proceso.plural}</h3>
        <p className="text-texto-tenue mt-1 text-xs">
          Si los contactos de este cliente pueden crear {GLOSARIO.proceso.plural.toLowerCase()} en sus{' '}
          {GLOSARIO.espacio.plural.toLowerCase()} desde el portal.
        </p>
      </div>

      {children}
    </section>
  )
}
