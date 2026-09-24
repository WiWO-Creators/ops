'use client'

import { useRouter } from 'next/navigation'
import { useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { AreaTexto } from '@/componentes/formularios/Entrada'
import { Dialogo, ContenidoDialogo } from '@/componentes/superposiciones/Dialogo'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import type { SolicitudDeEliminacion } from '@/datos/recursos'

/**
 * Aprobar o rechazar una solicitud de eliminación, desde la bandeja del administrador.
 *
 * Las dos decisiones abren el mismo diálogo y se diferencian en una cosa que no es cosmética: al
 * RECHAZAR la respuesta es obligatoria. Un rechazo sin texto deja a quien pidió sin saber si hay que
 * insistir, corregir algo o dejarlo estar, y garantiza que el pedido vuelva por chat, que es de
 * donde se lo quiso sacar. Al aprobar es opcional porque el archivado ya es la respuesta.
 *
 * Aprobar ARCHIVA el Proyecto: sale de los listados diarios y conserva sus tareas, sus horas y su
 * facturación. El diálogo lo dice con esas palabras, porque "eliminar" es lo que el equipo escribió
 * en el pedido y no es lo que va a pasar.
 */

/** Tope de la respuesta. Coincide con el `varchar(1000)` de la migración 0950. */
const RESPUESTA_MAXIMA = 1000

export function ResolverSolicitud ({ solicitud }: { solicitud: SolicitudDeEliminacion }): ReactElement {
  const router = useRouter()
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null)
  const [respuesta, setRespuesta] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  const aprobando = decision === 'approve'
  const nombre = solicitud.project?.name ?? `#${solicitud.project_id}`

  /** Abre el diálogo limpio: un fallo o un texto de la decisión anterior no se arrastran. */
  function abrir (cual: 'approve' | 'reject'): void {
    setRespuesta('')
    setFallo(null)
    setDecision(cual)
  }

  /** Manda la decisión. Nunca lanza: el fallo se muestra dentro del diálogo. */
  async function resolver (): Promise<void> {
    if (decision === null) return

    const texto = respuesta.trim()

    if (!aprobando && texto === '') {
      setFallo('Para rechazar hay que decir por qué.')
      return
    }

    setEnviando(true)
    setFallo(null)

    const resultado = await escribirEnBff(
      `deletion-requests/${solicitud.id}/actions/${decision}`,
      'POST',
      texto === '' ? {} : { respuesta: texto }
    )

    setEnviando(false)

    if (!resultado.ok) {
      setFallo(resultado.mensaje)
      return
    }

    setDecision(null)
    router.refresh()
  }

  return (
    <>
      <span className="flex justify-end gap-2">
        <Boton variante="sutil" tamano="chico" onClick={() => { abrir('reject') }}>Rechazar</Boton>
        <Boton variante="primario" tamano="chico" onClick={() => { abrir('approve') }}>Aprobar</Boton>
      </span>

      <Dialogo open={decision !== null} onOpenChange={(abierto) => { if (!abierto) setDecision(null) }}>
        <ContenidoDialogo
          titulo={aprobando ? 'Aprobar y archivar' : 'Rechazar la solicitud'}
          descripcion={aprobando
            ? `"${nombre}" se archiva: sale de los listados y conserva sus tareas, sus horas y su facturación.`
            : `"${nombre}" sigue como está. Quien lo pidió va a leer tu respuesta.`}
          ancho="chico"
        >
          <div className="flex flex-col gap-4">
            <div className="rounded-chico bg-superficie-hundida p-3 text-sm">
              <p className="text-texto-tenue text-xs">Lo que se pidió</p>
              <p className="mt-1 whitespace-pre-wrap">{solicitud.motivo}</p>
            </div>

            <label className="flex flex-col gap-1 text-sm">
              <span>{aprobando ? 'Respuesta (opcional)' : 'Por qué se rechaza'}</span>
              <AreaTexto
                value={respuesta}
                maxLength={RESPUESTA_MAXIMA}
                autoFocus
                onChange={(evento) => { setRespuesta(evento.target.value) }}
                placeholder={aprobando
                  ? 'Si querés dejar dicho algo más…'
                  : 'El contrato sigue vigente, falta facturar, hablalo con el cliente…'}
              />
            </label>

            {fallo !== null && <p role="alert" className="text-texto-peligro text-sm">{fallo}</p>}

            <div className="flex justify-end gap-2">
              <Boton variante="sutil" onClick={() => { setDecision(null) }}>Cancelar</Boton>
              <Boton
                variante={aprobando ? 'primario' : 'peligro'}
                cargando={enviando}
                onClick={() => { void resolver() }}
              >
                {aprobando ? 'Aprobar y archivar' : 'Rechazar'}
              </Boton>
            </div>
          </div>
        </ContenidoDialogo>
      </Dialogo>
    </>
  )
}
