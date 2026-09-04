'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Orbe, type EstadoOrbe } from '@/componentes/estado/Orbe'
import { Logo } from '@/componentes/estructura/Logo'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { PanelVidrio } from '@/componentes/superposiciones/PanelVidrio'

interface RespuestaCanje {
  ok?: boolean
  contacto?: { verificado: boolean }
  mensaje?: string
  codigo?: string
}

/** El minimo que exige la API. Se valida acá porque un envio invalido igual quema el enlace. */
const LARGO_MINIMO = 8

/**
 * Fija la contraseña del portal canjeando el enlace de un solo uso.
 *
 * El largo se valida ANTES de enviar, y no es cosmetico: el canje del enlace ocurre en la API antes
 * de mirar la contraseña, asi que un envio con una clave corta gasta el unico uso del token y obliga
 * a pedir uno nuevo. Esta comprobacion es lo que hace que un tipeo no cueste un WhatsApp mas.
 *
 * Las dos claves tienen que coincidir: no hay correo de recuperacion posible —el modulo no manda
 * mail—, asi que equivocarse al tipear significa quedarse afuera hasta pedir otro enlace.
 *
 * Al canjear, la API deja la sesion abierta, igual que un login: de acá se sale directo al portal.
 */
export function FormularioFijarClave ({ token }: { token: string }) {
  const router = useRouter()
  const [error, establecerError] = useState<string | null>(null)
  const [enviando, establecerEnviando] = useState(false)
  const [estadoOrbe, establecerEstadoOrbe] = useState<EstadoOrbe | undefined>(undefined)
  const temporizadorOrbe = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (temporizadorOrbe.current !== null) clearTimeout(temporizadorOrbe.current)
  }, [])

  function señalarError (mensaje: string) {
    establecerError(mensaje)
    establecerEnviando(false)
    establecerEstadoOrbe('error')

    if (temporizadorOrbe.current !== null) clearTimeout(temporizadorOrbe.current)
    temporizadorOrbe.current = setTimeout(() => { establecerEstadoOrbe(undefined) }, 1400)
  }

  async function enviar (evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()

    const datos = new FormData(evento.currentTarget)
    const password = String(datos.get('password') ?? '')
    const repetida = String(datos.get('repetida') ?? '')

    if (password.length < LARGO_MINIMO) {
      señalarError(`La contraseña tiene que tener al menos ${LARGO_MINIMO} caracteres.`)

      return
    }

    if (password !== repetida) {
      señalarError('Las dos contraseñas no coinciden.')

      return
    }

    establecerError(null)
    establecerEnviando(true)
    establecerEstadoOrbe('thinking')

    try {
      const respuesta = await fetch('/api/sesion', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enlace: token, password })
      })

      const cuerpo = await respuesta.json() as RespuestaCanje

      if (!respuesta.ok) {
        señalarError(mensajeDeError(cuerpo, respuesta.status))

        return
      }

      establecerEstadoOrbe('success')
      router.replace('/portal')
      router.refresh()
    } catch {
      señalarError('No se pudo contactar al servidor. Revisa tu conexión.')
    }
  }

  return (
    <main className="fondo-marca h-dvh overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col items-center justify-center gap-10 px-6 py-10 sm:px-10 lg:flex-row lg:justify-between lg:gap-16">
        <aside className="hidden max-w-md flex-col items-start gap-8 lg:flex">
          <Logo tamano="grande" />
          <Orbe tamano="marca" medida="clamp(14rem, 22vw, 21rem)" estado={estadoOrbe} />
          <div>
            <p className="font-titular text-texto text-2xl leading-snug font-semibold">
              Elige tu contraseña.
              <br />
              <span className="text-texto-tenue">La usas tú, no nosotros.</span>
            </p>
            <p aria-hidden="true" className="text-texto-tenue mt-3 h-5 text-sm">
              {enviando ? 'Guardando…' : ''}
            </p>
          </div>
        </aside>

        <div className="flex items-center gap-3 lg:hidden">
          <Orbe tamano="marca" medida="3.5rem" estado={estadoOrbe} />
          <Logo />
        </div>

        <PanelVidrio className="w-full max-w-sm p-6 sm:p-8">
          <header className="mb-8">
            <h1 className="font-titular text-texto text-xl font-semibold">Tu contraseña del portal</h1>
            <p className="text-texto-tenue mt-1 text-sm">
              Este enlace sirve una sola vez. Al guardar, entras directo al portal.
            </p>
          </header>

          <form onSubmit={(e) => { void enviar(e) }} className="flex flex-col gap-4">
            <Campo etiqueta="Contraseña" ayuda="Mínimo 8 caracteres." requerido>
              {(props) => (
                <Entrada
                  {...props}
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={LARGO_MINIMO}
                  autoFocus
                  required
                />
              )}
            </Campo>

            <Campo etiqueta="Repítela" requerido>
              {(props) => (
                <Entrada
                  {...props}
                  name="repetida"
                  type="password"
                  autoComplete="new-password"
                  minLength={LARGO_MINIMO}
                  required
                />
              )}
            </Campo>

            {error !== null && (
              <p
                role="alert"
                className="rounded-chico border-relleno-peligro/40 bg-superficie-peligro text-texto-peligro border px-3 py-2 text-sm"
              >
                {error}
              </p>
            )}

            <Boton type="submit" variante="primario" disabled={enviando} className="mt-1 w-full">
              Guardar y entrar
            </Boton>
          </form>
        </PanelVidrio>
      </div>
    </main>
  )
}

/** Traduce el error de la API a algo accionable. */
function mensajeDeError (cuerpo: RespuestaCanje, estado: number): string {
  if (cuerpo.codigo === 'rate_limited') {
    return 'Demasiados intentos. Espera unos minutos antes de volver a probar.'
  }

  if (estado === 401) {
    return 'Este enlace ya se usó o venció. Pídele uno nuevo a tu contacto en WiWO.'
  }

  if (estado === 422) {
    return 'La contraseña tiene que tener entre 8 y 72 caracteres.'
  }

  return cuerpo.mensaje ?? 'No se pudo guardar la contraseña. Intenta de nuevo.'
}
