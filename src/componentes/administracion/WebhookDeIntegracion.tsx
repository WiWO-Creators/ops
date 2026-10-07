'use client'

import { useEffect, useState, type ReactElement } from 'react'
import { BotonCopiar } from '@/componentes/datos/BotonCopiar'
import { ConfirmarBorrado, useConfirmarBorrado } from '@/componentes/datos/ConfirmarBorrado'
import { escribirEnBff, leerDelBff } from '@/componentes/datos/mutaciones'
import { Cargando } from '@/componentes/estado/Estados'
import { useAviso } from '@/componentes/estado/useAviso'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { Fecha } from '@/componentes/presentadores/Fecha'

/** El webhook de una integración, tal como lo devuelve la API (nunca con el secreto, salvo al emitirlo). */
interface Webhook {
  url: string
  secret_start: string
  last_attempt_at: string | null
  last_status: number | null
  last_error: string | null
  last_success_at: string | null
  consecutive_failures: number
  enabled: boolean
  secret?: string
}

function leerWebhook (valor: unknown): Webhook | null {
  if (typeof valor !== 'object' || valor === null) return null

  const w = valor as Record<string, unknown>

  if (typeof w.url !== 'string') return null

  return {
    url: w.url,
    secret_start: typeof w.secret_start === 'string' ? w.secret_start : '',
    last_attempt_at: typeof w.last_attempt_at === 'string' ? w.last_attempt_at : null,
    last_status: typeof w.last_status === 'number' ? w.last_status : null,
    last_error: typeof w.last_error === 'string' ? w.last_error : null,
    last_success_at: typeof w.last_success_at === 'string' ? w.last_success_at : null,
    consecutive_failures: typeof w.consecutive_failures === 'number' ? w.consecutive_failures : 0,
    enabled: w.enabled === true,
    secret: typeof w.secret === 'string' ? w.secret : undefined
  }
}

/**
 * El webhook por el que Ops le avisa al otro sistema. Si no hay ninguno, la API contesta 404 y acá se
 * lee como «sin webhook». El secreto con el que se firman los avisos se muestra una sola vez.
 */
export function WebhookDeIntegracion ({ integracionId }: { integracionId: number }): ReactElement {
  const aviso = useAviso()
  const borrar = useConfirmarBorrado()
  const ruta = `accesos/integraciones/${integracionId}/webhook`
  const [cargado, setCargado] = useState(false)
  const [webhook, setWebhook] = useState<Webhook | null>(null)
  const [secreto, setSecreto] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let vigente = true

    void leerDelBff<unknown>(ruta).then((resultado) => {
      if (!vigente) return

      const leido = resultado.ok ? leerWebhook(resultado.datos) : null

      setWebhook(leido)
      setUrl(leido?.url ?? '')
      setCargado(true)
    })

    return () => { vigente = false }
  }, [ruta])

  async function guardar (): Promise<void> {
    if (enviando || !url.startsWith('https://')) {
      if (!url.startsWith('https://')) setError('La dirección tiene que empezar con https://')

      return
    }

    setEnviando(true)
    setError(null)

    const resultado = await escribirEnBff<unknown>(ruta, 'PUT', { url: url.trim() })

    setEnviando(false)

    const leido = resultado.ok ? leerWebhook(resultado.datos) : null

    if (leido === null) {
      setError(resultado.ok ? 'No se pudo leer lo guardado.' : resultado.mensaje)

      return
    }

    setWebhook(leido)
    if (leido.secret !== undefined) setSecreto(leido.secret)
    aviso.exito('Webhook guardado.')
  }

  async function accion (sub: 'secreto' | 'prueba'): Promise<void> {
    setEnviando(true)

    const resultado = await escribirEnBff<unknown>(`${ruta}/${sub}`, 'POST')

    setEnviando(false)

    const leido = resultado.ok ? leerWebhook(resultado.datos) : null

    if (leido === null) {
      aviso.error(resultado.ok ? 'No se pudo leer la respuesta.' : resultado.mensaje)

      return
    }

    setWebhook(leido)
    if (leido.secret !== undefined) setSecreto(leido.secret)
    aviso.exito(sub === 'secreto' ? 'Secreto regenerado.' : 'Aviso de prueba enviado.')
  }

  async function quitar (): Promise<void> {
    const resultado = await escribirEnBff<undefined>(ruta, 'DELETE')

    if (!resultado.ok) throw new Error(resultado.mensaje)

    setWebhook(null)
    setSecreto(null)
    setUrl('')
    aviso.exito('Webhook eliminado.')
  }

  if (!cargado) return <Cargando />

  return (
    <div className="border-linea flex flex-col gap-4 border-t pt-4">
      <Campo etiqueta="Dirección que recibe los avisos" error={error ?? undefined}
        ayuda="Ops la llama con un POST firmado (X-Wiwo-Firma). Solo https.">
        {(props) => <Entrada {...props} type="url" value={url} onChange={(e) => { setUrl(e.target.value) }} />}
      </Campo>

      {secreto !== null && (
        <div role="status" className="flex flex-col gap-2">
          <p className="text-texto text-sm font-medium">Secreto de firma</p>
          <code className="border-linea bg-superficie text-texto block break-all rounded-md border px-3 py-2 font-mono text-sm">{secreto}</code>
          <p className="text-texto-tenue text-sm">Guárdalo en el otro sistema: no se vuelve a mostrar.</p>
          <div><BotonCopiar valor={() => secreto} etiqueta="Copiar secreto" etiquetaCopiado="Copiado" mensajeError="No pudimos copiar. Selecciona el secreto y cópialo a mano." /></div>
        </div>
      )}

      {webhook !== null && (
        <p className="text-texto-tenue text-sm">
          {!webhook.enabled && 'Los avisos están apagados en la instalación, así que por ahora no sale ninguno. '}
          {webhook.last_attempt_at === null
            ? 'Sin intentos todavía.'
            : <>Último intento: <Fecha valor={webhook.last_attempt_at} conHora />{webhook.last_status !== null && ` · HTTP ${webhook.last_status}`}</>}
          {webhook.consecutive_failures > 0 && ` · ${webhook.consecutive_failures} fallos seguidos`}
          {webhook.last_error !== null && webhook.consecutive_failures > 0 && ` (${webhook.last_error})`}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Boton variante="primario" tamano="chico" cargando={enviando} disabled={enviando} onClick={() => { void guardar() }}>
          {webhook === null ? 'Crear webhook' : 'Guardar dirección'}
        </Boton>
        {webhook !== null && (
          <>
            <Boton variante="secundario" tamano="chico" disabled={enviando} onClick={() => { void accion('prueba') }}>Enviar prueba</Boton>
            <Boton variante="secundario" tamano="chico" disabled={enviando} onClick={() => { void accion('secreto') }}>Regenerar secreto</Boton>
            <Boton variante="sutil" tamano="chico" disabled={enviando} onClick={borrar.abrir}>Eliminar</Boton>
          </>
        )}
      </div>

      <ConfirmarBorrado
        abierto={borrar.abierto}
        onCerrar={borrar.cerrar}
        titulo="Eliminar el webhook"
        advertencia="Ops dejará de avisarle a este sistema. Podrás crear otro, con un secreto nuevo."
        onConfirmar={quitar}
      />
    </div>
  )
}
