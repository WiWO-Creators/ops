'use client'

import { useEffect, useState } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { AvisoEnLinea } from '@/componentes/estado/Estados'
import { useAviso } from '@/componentes/estado/useAviso'
import { Boton } from '@/componentes/formularios/Boton'
import { CLASES_CASILLA } from '@/componentes/formularios/Entrada'
import { pedirSobre } from '@/datos/cliente'
import type { Capacidad } from '@/datos/tipos'

/** El estado del correo que sostiene el codigo: lo informa la API junto con el interruptor. */
interface CorreoDelCodigo {
  disponible: boolean
  /** `apagado`, `prueba` o `real`: el modo del interruptor general de correo. */
  modo: string
  /** `real`, `prueba` o `ninguna`: a donde iria el codigo hoy. */
  entrega: string
  motivo: string | null
}

/** Lo que guarda y devuelve `GET|PUT /clients/{id}/portal-2fa`. */
interface SegundoFactorDelPortal {
  habilitado: boolean
  correo: CorreoDelCodigo
}

/** `GET|PUT /clients/{id}/portal-2fa`, con el id ya escapado. */
function rutaDeSegundoFactor (clienteId: number): string {
  return `clients/${encodeURIComponent(String(clienteId))}/portal-2fa`
}

interface Props {
  clienteId: number
  /** Capacidades sobre `customers`, de `permissions` de `/me`. */
  capacidades: Capacidad[]
}

/**
 * Si los contactos de este cliente necesitan un codigo por correo para entrar al portal.
 *
 * === QUE DECIDE ===
 *
 * Nace apagado para todo cliente: con la casilla marcada, despues de la contraseña (o de canjear su
 * enlace de acceso) el contacto recibe un codigo de 6 digitos en su correo, que vale 5 minutos, y solo
 * con el entra. "Ver como cliente" no lo pide. La regla la aplica la API; esta casilla solo la enciende.
 *
 * === EL CORREO ES PARTE DE LA REGLA ===
 *
 * Con el correo del sistema apagado el codigo no sale, y un cliente con la regla encendida quedaria
 * fuera del portal. Por eso la API no deja encenderla en ese estado y esta casilla se deshabilita con
 * la explicacion; si el correo se apaga DESPUES, la advertencia lo dice mientras la regla sigue encendida
 * y apagarla siempre se puede.
 *
 * Sin `customers.edit` se dibuja en solo lectura, igual que la creacion de tareas del portal.
 *
 * @param clienteId el cliente que se esta mirando
 * @param capacidades capacidades sobre `customers`
 */
export function ClienteSegundoFactorPortal ({ clienteId, capacidades }: Props) {
  const puedeEditar = capacidades.includes('edit')
  const avisar = useAviso()

  const [guardado, setGuardado] = useState<SegundoFactorDelPortal | null>(null)
  const [habilitado, setHabilitado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const aborto = new AbortController()

    void pedirSobre<SegundoFactorDelPortal>(rutaDeSegundoFactor(clienteId), aborto.signal)
      .then((sobre) => {
        if (aborto.signal.aborted) return

        setGuardado(sobre.data)
        setHabilitado(sobre.data.habilitado)
      })
      .catch((fallo: unknown) => {
        if (aborto.signal.aborted) return

        setError(fallo instanceof Error
          ? fallo.message
          : 'No se pudo cargar si sus contactos necesitan un código por correo.')
      })

    return () => { aborto.abort() }
  }, [clienteId])

  /** Guarda la casilla con un PUT y se queda con lo que devuelve la API, no con lo que se mando. */
  async function guardar (evento: React.FormEvent) {
    evento.preventDefault()
    if (enviando) return

    setEnviando(true)
    setError(null)

    const resultado = await escribirEnBff<SegundoFactorDelPortal>(rutaDeSegundoFactor(clienteId), 'PUT', { habilitado })

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

  const advertencia = advertenciaDeCorreo(guardado)

  if (!puedeEditar) {
    return (
      <Seccion>
        <p className="text-texto text-sm">{frase(guardado.habilitado)}</p>
        {advertencia !== null && <AvisoEnLinea variante="aviso" mensaje={advertencia} className="text-sm" />}
      </Seccion>
    )
  }

  // No se puede ENCENDER sin correo (la API responde 409), pero apagarla siempre se puede.
  const bloqueada = !guardado.correo.disponible && !guardado.habilitado

  return (
    <Seccion>
      <form onSubmit={guardar} className="flex flex-col gap-3">
        <fieldset disabled={enviando || bloqueada} className="flex min-w-0 flex-col gap-1">
          <label htmlFor="cliente-segundo-factor" className="text-texto flex items-center gap-2 text-sm">
            <input
              id="cliente-segundo-factor"
              type="checkbox"
              checked={habilitado}
              onChange={(evento) => { setHabilitado(evento.target.checked) }}
              aria-describedby="cliente-segundo-factor-ayuda"
              className={CLASES_CASILLA}
            />
            Sus contactos necesitan un código por correo para entrar al portal
          </label>
          <p id="cliente-segundo-factor-ayuda" className="text-texto-tenue text-xs">
            Después de la contraseña, o de abrir su enlace de acceso, reciben un código de 6 dígitos que vale 5 minutos.
            Al equipo no se le pide cuando usa «Ver como cliente».
          </p>
        </fieldset>

        {advertencia !== null && <AvisoEnLinea variante="aviso" mensaje={advertencia} className="text-sm" />}
        {error !== null && <AvisoEnLinea variante="error" mensaje={error} className="text-sm" />}

        <div>
          <Boton
            type="submit"
            tamano="chico"
            variante="primario"
            disabled={enviando || bloqueada || habilitado === guardado.habilitado}
            cargando={enviando}
          >
            Guardar regla
          </Boton>
        </div>
      </form>
    </Seccion>
  )
}

/**
 * Lo que el equipo tiene que saber del correo, o `null` si no hay nada que advertir.
 *
 * Con el correo apagado y la regla encendida es un bloqueo real; apagado y la regla apagada solo
 * explica por que no se puede encender; en modo de prueba avisa que el codigo no llega a las personas.
 */
function advertenciaDeCorreo ({ habilitado, correo }: SegundoFactorDelPortal): string | null {
  if (!correo.disponible) {
    return habilitado
      ? 'El correo del sistema está apagado: los contactos de este cliente no pueden entrar al portal hasta que se encienda o apagues esta regla.'
      : 'No se puede encender mientras el correo del sistema esté apagado: los contactos no recibirían el código. Se enciende en Administración → Avisos por correo.'
  }

  if (correo.entrega === 'prueba') {
    return 'El correo está en modo de prueba: el código llega a la casilla de pruebas y no a los contactos.'
  }

  return null
}

/** La regla escrita, para el aviso de guardado y para quien solo la puede leer. */
function frase (habilitado: boolean): string {
  return habilitado
    ? 'Los contactos de este cliente necesitan un código por correo para entrar al portal.'
    : 'Los contactos de este cliente entran al portal solo con su contraseña.'
}

/** El marco de la seccion, uno solo para los tres estados en que se dibuja. */
function Seccion ({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-tarjeta border-linea bg-superficie-elevada shadow-1 flex flex-col gap-3 border p-5">
      <div>
        <h3 className="font-titular text-texto text-sm font-semibold">Portal: código por correo</h3>
        <p className="text-texto-tenue mt-1 text-xs">
          Un segundo paso al entrar al portal, para los contactos de este cliente.
        </p>
      </div>

      {children}
    </section>
  )
}
