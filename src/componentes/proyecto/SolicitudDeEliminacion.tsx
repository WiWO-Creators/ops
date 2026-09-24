'use client'

import { useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { AreaTexto } from '@/componentes/formularios/Entrada'
import { Dialogo, ContenidoDialogo } from '@/componentes/superposiciones/Dialogo'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { GLOSARIO } from '@/dominio/glosario'
import type { SolicitudDeEliminacion } from '@/datos/recursos'

/**
 * Pedir que se elimine un Proyecto, y retirar el pedido propio.
 *
 * Archivar exige `projects.edit`, que la mayor parte del equipo no tiene. Hasta ahora eso queria
 * decir que "este Proyecto ya no va" se pedia por chat: el pedido no quedaba asociado a nadie y el
 * admin no tenia forma de saber cuales le estaban pidiendo cerrar. Este dialogo es el reemplazo.
 *
 * La justificacion es obligatoria y el boton no envia sin ella: el backend contesta 422 igual, pero
 * enterarse antes de mandar es la diferencia entre corregir un campo y leer un error.
 *
 * Quien ya tiene la capacidad de archivar no ve este boton: archiva y no pide nada. Esa decision se
 * toma afuera, en quien monta el componente, porque es la misma capacidad que gobierna el resto del
 * menu.
 */

/** Tope del motivo. Coincide con el `varchar(1000)` de la migracion 0950. */
const MOTIVO_MAXIMO = 1000

interface PropsSolicitarEliminacion {
  proyectoId: number
  /** Nombre del Proyecto, para que el dialogo diga de cual habla. */
  proyectoNombre: string
  /** La solicitud viva, si ya hay una. Decide si se pide o se retira. */
  solicitud: SolicitudDeEliminacion | null
  /** Si quien mira es quien la pidio. Solo esa persona —o un admin— puede retirarla. */
  puedeRetirar: boolean
  /** Se llama despues de escribir, para que la pantalla vuelva a pedir los datos. */
  onCambio: () => void
  abierto: boolean
  onAbiertoCambia: (abierto: boolean) => void
}

export function SolicitarEliminacion ({
  proyectoId,
  proyectoNombre,
  solicitud,
  puedeRetirar,
  onCambio,
  abierto,
  onAbiertoCambia
}: PropsSolicitarEliminacion): ReactElement {
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  const hayPendiente = solicitud !== null && solicitud.pendiente
  const espacio = GLOSARIO.espacio.singular.toLowerCase()

  /** Manda el pedido. Nunca lanza: el fallo se muestra dentro del dialogo. */
  async function pedir (): Promise<void> {
    const texto = motivo.trim()

    if (texto === '') {
      setFallo('Escribe por qué hay que eliminarlo.')
      return
    }

    setEnviando(true)
    setFallo(null)

    const resultado = await escribirEnBff(
      `projects/${proyectoId}/actions/request-deletion`,
      'POST',
      { motivo: texto }
    )

    setEnviando(false)

    if (!resultado.ok) {
      setFallo(resultado.mensaje)
      return
    }

    setMotivo('')
    onAbiertoCambia(false)
    onCambio()
  }

  /** Retira el pedido propio. Nunca lanza. */
  async function retirar (): Promise<void> {
    setEnviando(true)
    setFallo(null)

    const resultado = await escribirEnBff(`projects/${proyectoId}/deletion-requests`, 'DELETE')

    setEnviando(false)

    if (!resultado.ok) {
      setFallo(resultado.mensaje)
      return
    }

    onAbiertoCambia(false)
    onCambio()
  }

  return (
    <Dialogo open={abierto} onOpenChange={onAbiertoCambia}>
      <ContenidoDialogo
        titulo={hayPendiente ? 'Solicitud de eliminación enviada' : `Solicitar eliminación del ${espacio}`}
        descripcion={hayPendiente
          ? `"${proyectoNombre}" está esperando que un administrador resuelva.`
          : `Un administrador decide. Si aprueba, "${proyectoNombre}" se archiva: sale de los listados y conserva sus tareas y sus horas.`}
        ancho="chico"
      >
        <div className="flex flex-col gap-4">
          {hayPendiente
            ? (
              <>
                <div className="rounded-chico bg-superficie-hundida p-3 text-sm">
                  <p className="text-texto-tenue text-xs">Lo que se pidió</p>
                  <p className="mt-1 whitespace-pre-wrap">{solicitud?.motivo}</p>
                </div>
                {!puedeRetirar && (
                  <p className="text-texto-tenue text-sm">
                    Solo quien la pidió, o un administrador, puede retirarla.
                  </p>
                )}
              </>
              )
            : (
              <label className="flex flex-col gap-1 text-sm">
                <span>Por qué hay que eliminarlo</span>
                <AreaTexto
                  value={motivo}
                  maxLength={MOTIVO_MAXIMO}
                  autoFocus
                  onChange={(evento) => { setMotivo(evento.target.value) }}
                  placeholder="El cliente canceló el contrato, quedó duplicado, se creó por error…"
                />
                <span className="text-texto-sutil text-xs">
                  Es lo único que el administrador va a tener para decidir.
                </span>
              </label>
              )}

          {fallo !== null && <p role="alert" className="text-texto-peligro text-sm">{fallo}</p>}

          <div className="flex justify-end gap-2">
            <Boton variante="sutil" onClick={() => { onAbiertoCambia(false) }}>Cerrar</Boton>
            {hayPendiente
              ? puedeRetirar && (
                <Boton variante="peligro" cargando={enviando} onClick={() => { void retirar() }}>
                  Retirar solicitud
                </Boton>
              )
              : (
                <Boton variante="primario" cargando={enviando} onClick={() => { void pedir() }}>
                  Enviar solicitud
                </Boton>
                )}
          </div>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}

/**
 * Chip de "este Proyecto tiene un pedido de eliminación esperando".
 *
 * Va donde se lee el nombre del Proyecto —la fila del listado y la cabecera de la ficha— y no en una
 * columna propia: una columna mas obliga a mirar a la derecha para enterarse de algo que cambia como
 * se lee el nombre.
 *
 * Devuelve `null` si no hay solicitud viva, para que quien lo monte no tenga que preguntar.
 */
export function DistintivoSolicitud (
  { solicitud }: { solicitud: SolicitudDeEliminacion | null | undefined }
): ReactElement | null {
  if (solicitud === null || solicitud === undefined || !solicitud.pendiente) return null

  return (
    <span
      title={`Eliminación solicitada: ${solicitud.motivo}`}
      className="shrink-0 rounded-full border border-relleno-peligro px-2 py-0.5 text-xs text-texto-peligro"
    >
      Eliminación solicitada
    </span>
  )
}
