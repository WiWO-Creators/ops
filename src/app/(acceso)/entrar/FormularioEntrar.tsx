'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'

type Paso = 'clave' | 'codigo'

interface RespuestaEntrar {
  ok?: boolean
  segundoFactor?: boolean
  method?: 'email' | 'app'
  mensaje?: string
  codigo?: string
}

/**
 * Formulario de acceso, en dos pasos.
 *
 * El segundo paso aparece solo si la cuenta tiene segundo factor. El `challenge_token` no pasa por
 * aca: queda en una cookie que escribe `/api/sesion`, asi que este componente nunca toca un secreto.
 */
export function FormularioEntrar () {
  const router = useRouter()
  const [paso, establecerPaso] = useState<Paso>('clave')
  const [metodo, establecerMetodo] = useState<'email' | 'app'>('email')
  const [error, establecerError] = useState<string | null>(null)
  const [enviando, establecerEnviando] = useState(false)

  async function enviar (evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    establecerError(null)
    establecerEnviando(true)

    const datos = new FormData(evento.currentTarget)

    try {
      const respuesta = await fetch('/api/sesion', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(datos))
      })

      const cuerpo = await respuesta.json() as RespuestaEntrar

      if (!respuesta.ok) {
        establecerError(mensajeDeError(cuerpo, respuesta.status))

        return
      }

      if (cuerpo.segundoFactor === true) {
        establecerMetodo(cuerpo.method ?? 'email')
        establecerPaso('codigo')

        return
      }

      router.replace('/')
      router.refresh()
    } catch {
      establecerError('No se pudo contactar al servidor. Revisá tu conexión.')
    } finally {
      establecerEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="flex w-full max-w-sm flex-col gap-4">
      {paso === 'clave'
        ? (
          <>
            <Campo etiqueta="Correo" requerido>
              {(props) => (
                <Entrada {...props} name="email" type="email" autoComplete="username" autoFocus required />
              )}
            </Campo>
            <Campo etiqueta="Contraseña" requerido>
              {(props) => (
                <Entrada {...props} name="password" type="password" autoComplete="current-password" required />
              )}
            </Campo>
          </>
          )
        : (
          <Campo
            etiqueta="Código de verificación"
            ayuda={metodo === 'email' ? 'Te lo enviamos por correo.' : 'Está en tu aplicación de autenticación.'}
            requerido
          >
            {(props) => (
              <Entrada
                {...props}
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
                required
              />
            )}
          </Campo>
          )}

      {error !== null && (
        <p role="alert" className="text-sm text-relleno-peligro">{error}</p>
      )}

      <Boton type="submit" variante="primario" cargando={enviando}>
        {paso === 'clave' ? 'Entrar' : 'Verificar'}
      </Boton>
    </form>
  )
}

/**
 * Traduce el error de la API a algo accionable.
 *
 * Los codigos del contrato son estables; los mensajes del servidor no siempre estan en español ni
 * dicen que hacer.
 */
function mensajeDeError (cuerpo: RespuestaEntrar, estado: number): string {
  if (cuerpo.codigo === 'rate_limited') {
    return 'Demasiados intentos fallidos. Esperá unos minutos antes de volver a probar.'
  }

  if (cuerpo.codigo === 'forbidden') {
    return 'Tu cuenta está desactivada. Hablá con un administrador.'
  }

  if (estado === 401) {
    return 'Correo o contraseña incorrectos.'
  }

  return cuerpo.mensaje ?? 'No se pudo entrar. Intentá de nuevo.'
}
