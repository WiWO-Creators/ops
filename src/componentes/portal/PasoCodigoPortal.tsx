'use client'

import { useEffect, useRef, useState } from 'react'
import { AvisoEnLinea } from '@/componentes/estado/Estados'
import type { EstadoOrbe } from '@/componentes/estado/Orbe'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { conLimite, TIEMPO_ESCRITURA_MS } from '@/datos/red'
import {
  esCodigoCompleto, interpretarErrorDeCodigo, LARGO_CODIGO, normalizarCodigo, notaDeEntrega
} from '@/dominio/segundo-factor-portal'

/** Lo que `/api/sesion` devuelve cuando el cliente del contacto exige el codigo por correo. */
export interface DesafioDelPortal {
  /** El correo con el medio oculto, para decirle donde mirar. */
  pista: string
  /** Segundos que vive cada codigo. */
  venceEn: number
  /** Segundos que faltan para poder pedir otro. */
  espera: number
  reenvios: number
  entrega: string
}

interface RespuestaDelPaso {
  ok?: boolean
  mensaje?: string
  codigo?: string
  destino?: unknown
  pista?: string
  venceEn?: number
  espera?: number
  reenvios?: number
  entrega?: string
}

interface Props {
  desafio: DesafioDelPortal
  /** Vuelve al primer paso; con texto cuando la verificacion murio y hay que explicarlo. */
  alVolver: (motivo?: string) => void
  /** La sesion quedo abierta: el padre navega. */
  alEntrar: (destino: unknown) => void
  alCambiarOrbe: (estado: EstadoOrbe | undefined) => void
}

/**
 * Segundo paso del portal: el codigo de 6 digitos que llego al correo del contacto.
 *
 * Lo comparten el acceso con contraseña y el canje del enlace de un solo uso, porque los dos terminan
 * en el mismo desafio. El desafio vive en una cookie `httpOnly` del servidor: este componente nunca
 * ve el token, solo manda el codigo y pide reenvios.
 *
 * Los envios no son gratis: la API da 5 intentos por desafio, y por eso no se envia solo al llegar a
 * seis digitos sino con el boton, y se descartan los espacios y guiones del codigo pegado antes de
 * enviarlo. Los reenvios tienen una espera que se cuenta aca para no mostrar un boton que falla.
 *
 * @param desafio lo que la API informo al abrir el desafio
 * @param alVolver regreso al primer paso
 * @param alEntrar sesion abierta; recibe el destino resuelto por el servidor
 * @param alCambiarOrbe el orbe del padre refleja el progreso
 */
export function PasoCodigoPortal ({ desafio, alVolver, alEntrar, alCambiarOrbe }: Props) {
  const [codigo, establecerCodigo] = useState('')
  const [error, establecerError] = useState<string | null>(null)
  const [info, establecerInfo] = useState<string | null>(null)
  const [enviando, establecerEnviando] = useState(false)
  const [reenviando, establecerReenviando] = useState(false)
  const [pista, establecerPista] = useState(desafio.pista)
  const [espera, establecerEspera] = useState(desafio.espera)
  const [reenvios, establecerReenvios] = useState(desafio.reenvios)
  const [entrega, establecerEntrega] = useState(desafio.entrega)
  const temporizadorOrbe = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (temporizadorOrbe.current !== null) clearTimeout(temporizadorOrbe.current)
  }, [])

  // Una cuenta regresiva: cada segundo agenda el siguiente descuento y se detiene sola en cero.
  useEffect(() => {
    if (espera <= 0) return

    const temporizador = setTimeout(() => { establecerEspera(espera - 1) }, 1000)

    return () => { clearTimeout(temporizador) }
  }, [espera])

  function señalarError () {
    alCambiarOrbe('error')

    if (temporizadorOrbe.current !== null) clearTimeout(temporizadorOrbe.current)
    temporizadorOrbe.current = setTimeout(() => { alCambiarOrbe(undefined) }, 1400)
  }

  /** Manda una de las dos llamadas del paso y devuelve el cuerpo, o `null` si no hubo red. */
  async function llamar (cuerpo: Record<string, unknown>): Promise<{ ok: boolean, estado: number, datos: RespuestaDelPaso } | null> {
    try {
      const respuesta = await fetch('/api/sesion', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...cuerpo, portal: true }),
        signal: conLimite(undefined, TIEMPO_ESCRITURA_MS)
      })

      return { ok: respuesta.ok, estado: respuesta.status, datos: await respuesta.json() as RespuestaDelPaso }
    } catch {
      return null
    }
  }

  /** Aplica el error de la API: muestra el texto y ejecuta la accion que el codigo pide. */
  function manejarError (datos: RespuestaDelPaso, estado: number) {
    const { mensaje, accion } = interpretarErrorDeCodigo(datos.codigo, estado, datos.mensaje)

    señalarError()

    if (accion === 'reiniciar') {
      alVolver(mensaje)

      return
    }

    establecerInfo(null)
    establecerError(mensaje)
    if (accion === 'reintentar' || accion === 'pedir-otro') establecerCodigo('')
  }

  async function verificar (evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    if (enviando || !esCodigoCompleto(codigo)) return

    establecerError(null)
    establecerInfo(null)
    establecerEnviando(true)
    alCambiarOrbe('thinking')

    const resultado = await llamar({ code: codigo })

    establecerEnviando(false)

    if (resultado === null) {
      establecerError('No se pudo contactar al servidor. Revisa tu conexión.')
      señalarError()

      return
    }

    if (!resultado.ok) {
      manejarError(resultado.datos, resultado.estado)

      return
    }

    alCambiarOrbe('success')
    alEntrar(resultado.datos.destino)
  }

  async function pedirOtro (): Promise<void> {
    if (reenviando || espera > 0 || reenvios <= 0) return

    establecerError(null)
    establecerInfo(null)
    establecerReenviando(true)

    const resultado = await llamar({ reenviar: true })

    establecerReenviando(false)

    if (resultado === null) {
      establecerError('No se pudo contactar al servidor. Revisa tu conexión.')

      return
    }

    if (!resultado.ok) {
      // Un 429 por espera trae los segundos en el mensaje; el contador local ya cubre el caso normal.
      manejarError(resultado.datos, resultado.estado)

      return
    }

    establecerCodigo('')
    establecerPista(resultado.datos.pista ?? pista)
    establecerEspera(resultado.datos.espera ?? 0)
    establecerReenvios(resultado.datos.reenvios ?? 0)
    establecerEntrega(resultado.datos.entrega ?? entrega)
    establecerInfo('Te enviamos un código nuevo. El anterior ya no sirve.')
  }

  const nota = notaDeEntrega(entrega)
  const minutos = Math.max(1, Math.round(desafio.venceEn / 60))

  return (
    <>
      <header className="mb-6">
        <h1 className="font-titular text-texto text-2xl font-bold tracking-tight">Revisa tu correo</h1>
        <p className="text-texto-tenue mt-2 text-sm">
          Te enviamos un código de {LARGO_CODIGO} dígitos a <strong className="text-texto">{pista}</strong>.
          Vale {minutos} {minutos === 1 ? 'minuto' : 'minutos'}.
        </p>
        {nota !== null && <p className="text-texto-aviso mt-2 text-xs">{nota}</p>}
      </header>

      <form onSubmit={(e) => { void verificar(e) }} className="flex flex-col gap-4">
        <Campo etiqueta="Código de verificación" requerido>
          {(props) => (
            <Entrada
              {...props}
              name="code"
              value={codigo}
              onChange={(e) => { establecerCodigo(normalizarCodigo(e.target.value)) }}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={LARGO_CODIGO + 4}
              placeholder="000000"
              className="text-center font-mono text-lg tracking-[0.4em]"
              autoFocus
              required
            />
          )}
        </Campo>

        {info !== null && error === null && (
          <p role="status" className="text-texto-exito text-sm">{info}</p>
        )}

        {error !== null && (
          <AvisoEnLinea
            variante="error"
            mensaje={error}
            className="rounded-chico border-relleno-peligro/40 bg-superficie-peligro border px-3 py-2 text-sm"
          />
        )}

        <Boton
          type="submit"
          variante="primario"
          disabled={!esCodigoCompleto(codigo)}
          cargando={enviando}
          className="mt-1 w-full"
        >
          Verificar y entrar
        </Boton>

        <div className="flex flex-col gap-2">
          <Boton
            type="button"
            variante="secundario"
            onClick={() => { void pedirOtro() }}
            disabled={espera > 0 || reenvios <= 0}
            cargando={reenviando}
            className="w-full"
          >
            {textoDeReenvio(espera, reenvios)}
          </Boton>
          <Boton type="button" variante="sutil" onClick={() => { alVolver() }} className="w-full">
            Volver
          </Boton>
        </div>
      </form>
    </>
  )
}

/** El rotulo del boton de reenvio segun cuanto falte y cuantos queden. */
function textoDeReenvio (espera: number, reenvios: number): string {
  if (reenvios <= 0) return 'Ya no hay más reenvíos'
  if (espera > 0) return `Pedir otro código en ${espera} s`

  return 'Pedir otro código'
}
