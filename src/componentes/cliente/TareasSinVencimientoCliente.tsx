'use client'

import { useEffect, useState } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Boton } from '@/componentes/formularios/Boton'
import { CLASES_CASILLA } from '@/componentes/formularios/Entrada'
import { pedirSobre } from '@/datos/cliente'
import { GLOSARIO } from '@/dominio/glosario'
import type { Capacidad } from '@/datos/tipos'

/** Lo que guarda y devuelve `GET|PUT /clients/{id}/tareas-sin-vencimiento`. */
interface TareasSinVencimiento {
  sin_vencimiento: boolean
}

/** `GET|PUT /clients/{id}/tareas-sin-vencimiento`, con el id ya escapado. */
function rutaDeSinVencimiento (clienteId: number): string {
  return `clients/${encodeURIComponent(String(clienteId))}/tareas-sin-vencimiento`
}

interface Props {
  clienteId: number
  /** Capacidades sobre `customers`, de `permissions` de `/me`. */
  capacidades: Capacidad[]
}

/**
 * Si las {@link GLOSARIO.proceso} de este cliente pueden quedar sin fecha de vencimiento.
 *
 * === QUE DECIDE ===
 *
 * Por defecto todo cliente exige fecha: una tarea suya sin vencimiento es un `422` de la API, tanto
 * en el alta como al moverla a uno de sus {@link GLOSARIO.espacio}. Esta casilla lo afloja para este
 * cliente y nada mas. Las tareas sin cliente —internas, de prospecto— no dependen de esto: esas
 * pueden ir sin fecha siempre.
 *
 * La regla la aplica la API. El formulario de alta y el de edicion la consultan para marcar el campo
 * antes de guardar, pero es la API la que decide.
 *
 * Sin `customers.edit` se dibuja en solo lectura, igual que la apertura del portal.
 *
 * @param clienteId el cliente que se esta mirando
 * @param capacidades capacidades sobre `customers`
 */
export function TareasSinVencimientoCliente ({ clienteId, capacidades }: Props) {
  const puedeEditar = capacidades.includes('edit')

  const [guardado, setGuardado] = useState<TareasSinVencimiento | null>(null)
  const [permitido, setPermitido] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [avisoDeGuardado, setAvisoDeGuardado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const aborto = new AbortController()

    void pedirSobre<TareasSinVencimiento>(rutaDeSinVencimiento(clienteId), aborto.signal)
      .then((sobre) => {
        if (aborto.signal.aborted) return

        setGuardado(sobre.data)
        setPermitido(sobre.data.sin_vencimiento)
      })
      .catch((fallo: unknown) => {
        if (aborto.signal.aborted) return

        setError(fallo instanceof Error ? fallo.message : 'No se pudo cargar la regla de vencimiento.')
      })

    return () => { aborto.abort() }
  }, [clienteId])

  /** Guarda la casilla con un PUT y se queda con lo que devuelve la API, no con lo que se mando. */
  async function guardar (evento: React.FormEvent) {
    evento.preventDefault()
    if (enviando) return

    setEnviando(true)
    setError(null)
    setAvisoDeGuardado(false)

    const resultado = await escribirEnBff<TareasSinVencimiento>(rutaDeSinVencimiento(clienteId), 'PUT', {
      sin_vencimiento: permitido
    })

    setEnviando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    setGuardado(resultado.datos)
    setPermitido(resultado.datos.sin_vencimiento)
    setAvisoDeGuardado(true)
  }

  if (error !== null && guardado === null) {
    return (
      <Seccion>
        <p role="alert" className="text-texto-peligro text-sm">{error}</p>
      </Seccion>
    )
  }

  if (guardado === null) {
    return (
      <Seccion>
        <p className="text-texto-tenue text-sm">Cargando la regla de vencimiento…</p>
      </Seccion>
    )
  }

  if (!puedeEditar) {
    return (
      <Seccion>
        <p className="text-texto text-sm">{frase(guardado.sin_vencimiento)}</p>
      </Seccion>
    )
  }

  return (
    <Seccion>
      <form onSubmit={guardar} className="flex flex-col gap-3">
        <fieldset disabled={enviando} className="flex min-w-0 flex-col gap-1">
          <label htmlFor="tareas-sin-vencimiento" className="text-texto flex items-center gap-2 text-sm">
            <input
              id="tareas-sin-vencimiento"
              type="checkbox"
              checked={permitido}
              onChange={(evento) => { setPermitido(evento.target.checked) }}
              aria-describedby="tareas-sin-vencimiento-ayuda"
              className={CLASES_CASILLA}
            />
            Permitir tareas sin fecha de vencimiento
          </label>
          <p id="tareas-sin-vencimiento-ayuda" className="text-texto-tenue text-xs">
            Si está apagado, toda tarea de este cliente exige fecha de vencimiento.
          </p>
        </fieldset>

        {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}
        {avisoDeGuardado && (
          <p role="status" className="text-texto-tenue text-xs">{frase(guardado.sin_vencimiento)}</p>
        )}

        <div>
          <Boton
            type="submit"
            tamano="chico"
            variante="primario"
            disabled={enviando || permitido === guardado.sin_vencimiento}
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
function frase (sinVencimiento: boolean): string {
  return sinVencimiento
    ? 'Las tareas de este cliente pueden quedar sin fecha de vencimiento.'
    : 'Toda tarea de este cliente exige fecha de vencimiento.'
}

/** El marco de la seccion, uno solo para los tres estados en que se dibuja. */
function Seccion ({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-tarjeta border-linea bg-superficie-elevada shadow-1 flex flex-col gap-3 border p-5">
      <div>
        <h3 className="font-titular text-texto text-sm font-semibold">Fecha de vencimiento</h3>
        <p className="text-texto-tenue mt-1 text-xs">
          Si las {GLOSARIO.proceso.plural.toLowerCase()} de este cliente pueden cargarse sin fecha de
          vencimiento.
        </p>
      </div>

      {children}
    </section>
  )
}
