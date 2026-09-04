'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Orbe, type EstadoOrbe } from '@/componentes/estado/Orbe'
import { Logo } from '@/componentes/estructura/Logo'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { PanelVidrio } from '@/componentes/superposiciones/PanelVidrio'

interface RespuestaEntrar {
  ok?: boolean
  contacto?: { verificado: boolean }
  mensaje?: string
  codigo?: string
}

/**
 * Acceso al portal del cliente.
 *
 * Un solo paso: los contactos no tienen segundo factor en Perfex, asi que no hay pantalla de codigo
 * que espejar. El `portal: true` del cuerpo es lo que hace que `/api/sesion` llame a
 * `/auth/portal/login` y escriba la cookie del contacto en vez de la del equipo.
 *
 * El orbe es el indicador de progreso, igual que en el acceso del panel: quieto hasta que se envia,
 * en movimiento mientras la API responde.
 */
export function FormularioEntrarPortal () {
  const router = useRouter()
  const [error, establecerError] = useState<string | null>(null)
  const [enviando, establecerEnviando] = useState(false)
  const [estadoOrbe, establecerEstadoOrbe] = useState<EstadoOrbe | undefined>(undefined)
  const temporizadorOrbe = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (temporizadorOrbe.current !== null) clearTimeout(temporizadorOrbe.current)
  }, [])

  function señalarError () {
    establecerEstadoOrbe('error')

    if (temporizadorOrbe.current !== null) clearTimeout(temporizadorOrbe.current)
    temporizadorOrbe.current = setTimeout(() => { establecerEstadoOrbe(undefined) }, 1400)
  }

  async function enviar (evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    establecerError(null)
    establecerEnviando(true)
    establecerEstadoOrbe('thinking')

    const datos = new FormData(evento.currentTarget)

    try {
      const respuesta = await fetch('/api/sesion', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...Object.fromEntries(datos), portal: true })
      })

      const cuerpo = await respuesta.json() as RespuestaEntrar

      if (!respuesta.ok) {
        establecerError(mensajeDeError(cuerpo, respuesta.status))
        establecerEnviando(false)
        señalarError()

        return
      }

      establecerEstadoOrbe('success')
      // La sesion quedo abierta igual: quien no verifico su correo entra a la pantalla que se lo
      // explica, no a un error.
      router.replace(cuerpo.contacto?.verificado === false ? '/portal/verificar' : '/portal')
      router.refresh()
    } catch {
      establecerError('No se pudo contactar al servidor. Revisa tu conexión.')
      establecerEnviando(false)
      señalarError()
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
              El avance de tus proyectos.
              <br />
              <span className="text-texto-tenue">Cuando quieras verlo.</span>
            </p>
            <p aria-hidden="true" className="text-texto-tenue mt-3 h-5 text-sm">
              {enviando ? 'Verificando…' : ''}
            </p>
          </div>
        </aside>

        <div className="flex items-center gap-3 lg:hidden">
          <Orbe tamano="marca" medida="3.5rem" estado={estadoOrbe} />
          <Logo />
        </div>

        <PanelVidrio className="w-full max-w-sm p-6 sm:p-8">
          <header className="mb-8">
            <h1 className="font-titular text-texto text-xl font-semibold">Portal de clientes</h1>
            <p className="text-texto-tenue mt-1 text-sm">
              Entra con el correo con el que trabajamos.
            </p>
          </header>

          <form onSubmit={(e) => { void enviar(e) }} className="flex flex-col gap-4">
            <Campo etiqueta="Correo" requerido>
              {(props) => (
                <Entrada
                  {...props}
                  name="email"
                  type="email"
                  autoComplete="username"
                  autoFocus
                  required
                />
              )}
            </Campo>

            <Campo etiqueta="Contraseña" requerido>
              {(props) => (
                <Entrada
                  {...props}
                  name="password"
                  type="password"
                  autoComplete="current-password"
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
              Entrar
            </Boton>
          </form>
        </PanelVidrio>
      </div>
    </main>
  )
}

/** Traduce el error de la API a algo accionable. */
function mensajeDeError (cuerpo: RespuestaEntrar, estado: number): string {
  if (cuerpo.codigo === 'rate_limited') {
    return 'Demasiados intentos fallidos. Espera unos minutos antes de volver a probar.'
  }

  if (cuerpo.codigo === 'forbidden') {
    return 'Tu acceso está desactivado. Escríbenos y lo revisamos.'
  }

  if (estado === 401) {
    return 'Correo o contraseña incorrectos.'
  }

  return cuerpo.mensaje ?? 'No se pudo entrar. Intenta de nuevo.'
}
