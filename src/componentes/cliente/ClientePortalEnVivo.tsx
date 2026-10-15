'use client'

import { useEffect, useState } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { useConfigEnVivo } from '@/componentes/en-vivo/ProveedorEnVivo'
import { AvisoEnLinea } from '@/componentes/estado/Estados'
import { useAviso } from '@/componentes/estado/useAviso'
import { Boton } from '@/componentes/formularios/Boton'
import { CLASES_CASILLA } from '@/componentes/formularios/Entrada'
import { pedirSobre } from '@/datos/cliente'
import { GLOSARIO } from '@/dominio/glosario'
import type { Capacidad } from '@/datos/tipos'

/** Lo que guarda y devuelve `GET|PUT /clients/{id}/portal-en-vivo`. */
interface EnVivoDelPortal {
  habilitado: boolean
}

/** `GET|PUT /clients/{id}/portal-en-vivo`, con el id ya escapado. */
function rutaDeEnVivo (clienteId: number): string {
  return `clients/${encodeURIComponent(String(clienteId))}/portal-en-vivo`
}

interface Props {
  clienteId: number
  /** Capacidades sobre `customers`, de `permissions` de `/me`. */
  capacidades: Capacidad[]
}

/**
 * Si el portal de este cliente se actualiza en vivo.
 *
 * === QUE DECIDE ===
 *
 * Nace apagado para todo cliente. Con la casilla marcada (y «Ops en vivo» encendido para el portal en
 * Ajustes), el portal de sus contactos se entera por aviso cuando cambia una tarea o un ticket suyo
 * y se refresca solo, en vez de esperar al sondeo de un minuto. El aviso no lleva datos ni ids: cada
 * contacto vuelve a pedir sus pantallas con su propio permiso, así que no ve nada más que antes.
 *
 * Sin `customers.edit` se dibuja en solo lectura. Si «Ops en vivo» está apagado en esta instalación no
 * se dibuja nada: no hay nada que decidir y el panel queda idéntico a antes.
 *
 * @param clienteId el cliente que se está mirando
 * @param capacidades capacidades sobre `customers`
 */
export function ClientePortalEnVivo ({ clienteId, capacidades }: Props) {
  const { activo } = useConfigEnVivo()

  if (!activo) return null

  return <InterruptorDelCliente clienteId={clienteId} capacidades={capacidades} />
}

/** El interruptor propiamente dicho; solo se monta con «Ops en vivo» activo, así no pide nada apagado. */
function InterruptorDelCliente ({ clienteId, capacidades }: Props) {
  const puedeEditar = capacidades.includes('edit')
  const avisar = useAviso()

  const [guardado, setGuardado] = useState<EnVivoDelPortal | null>(null)
  const [habilitado, setHabilitado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const aborto = new AbortController()

    void pedirSobre<EnVivoDelPortal>(rutaDeEnVivo(clienteId), aborto.signal)
      .then((sobre) => {
        if (aborto.signal.aborted) return

        setGuardado(sobre.data)
        setHabilitado(sobre.data.habilitado)
      })
      .catch((fallo: unknown) => {
        if (aborto.signal.aborted) return

        setError(fallo instanceof Error
          ? fallo.message
          : 'No se pudo cargar si su portal se actualiza en vivo.')
      })

    return () => { aborto.abort() }
  }, [clienteId])

  /** Guarda la casilla con un PUT y se queda con lo que devuelve la API, no con lo que se mando. */
  async function guardar (evento: React.FormEvent) {
    evento.preventDefault()
    if (enviando) return

    setEnviando(true)
    setError(null)

    const resultado = await escribirEnBff<EnVivoDelPortal>(rutaDeEnVivo(clienteId), 'PUT', { habilitado })

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
          <label htmlFor="cliente-portal-en-vivo" className="text-texto flex items-center gap-2 text-sm">
            <input
              id="cliente-portal-en-vivo"
              type="checkbox"
              checked={habilitado}
              onChange={(evento) => { setHabilitado(evento.target.checked) }}
              aria-describedby="cliente-portal-en-vivo-ayuda"
              className={CLASES_CASILLA}
            />
            El portal de este cliente se actualiza en vivo
          </label>
          <p id="cliente-portal-en-vivo-ayuda" className="text-texto-tenue text-xs">
            Sus contactos ven los cambios de sus {GLOSARIO.proceso.plural.toLowerCase()} y tickets al instante, sin
            recargar. El aviso no lleva datos: cada contacto sigue viendo solo lo que ya podía ver.
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
  return habilitado
    ? 'El portal de este cliente se actualiza en vivo.'
    : 'El portal de este cliente se actualiza solo por sondeo, cada minuto.'
}

/** El marco de la seccion, uno solo para los tres estados en que se dibuja. */
function Seccion ({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-tarjeta border-linea bg-superficie-elevada shadow-1 flex flex-col gap-3 border p-5">
      <div>
        <h3 className="font-titular text-texto text-sm font-semibold">Portal: avisos en vivo</h3>
        <p className="text-texto-tenue mt-1 text-xs">
          Si el portal de los contactos de este cliente se actualiza solo cuando algo cambia.
        </p>
      </div>

      {children}
    </section>
  )
}
