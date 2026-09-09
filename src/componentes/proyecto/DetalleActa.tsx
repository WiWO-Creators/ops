'use client'

import dynamic from 'next/dynamic'
import { useRef, useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { ContenidoHtml } from '@/componentes/presentadores/ContenidoHtml'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Dialogo, ContenidoDialogo } from '@/componentes/superposiciones/Dialogo'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import type { Acta } from '@/datos/recursos'

/**
 * Un Meeting Paper: se lee, se corrige y se imprime.
 *
 * El editor se carga con `next/dynamic` y `ssr: false`. Son ~100 KB de TipTap, y sin esto entran en
 * el chunk de `/espacios/[id]` —la pantalla más usada del panel— aunque nadie abra un acta. Con la
 * carga diferida, el peso lo paga quien pulsa "Corregir".
 *
 * En lectura el HTML se pinta dentro de `ContenidoHtml`, el iframe con `sandbox=""`. Lo escribió un
 * modelo a partir de lo que se dijo en una reunión, así que es contenido que no controlamos aunque
 * la API ya lo haya saneado: las dos capas son a propósito.
 *
 * Imprimir usa el `print()` del propio iframe, que sale con el formato real del documento. Es un PDF
 * decente y cero dependencias, contra el `jsPDF` de MeetingMatico, que vuelca texto plano y pierde
 * todo el formato.
 */

const EditorDeActa = dynamic(
  async () => (await import('./EditorDeActa')).EditorDeActa,
  { ssr: false, loading: () => <p className="text-texto-tenue text-sm">Cargando el editor…</p> }
)

interface PropsDetalle {
  acta: Acta
  proyectoId: number
  /** Editar lo puede cualquier miembro; borrar, solo el autor o quien administra. */
  puedeBorrar: boolean
  conIa: boolean
  onCambiada: (acta: Acta) => void
  onBorrada: () => void
  onVolver: () => void
}

export function DetalleActa ({
  acta,
  proyectoId,
  puedeBorrar,
  conIa,
  onCambiada,
  onBorrada,
  onVolver
}: PropsDetalle): ReactElement {
  const [editando, setEditando] = useState(false)
  const [html, setHtml] = useState(acta.content ?? '')
  const [sucio, setSucio] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const marco = useRef<HTMLIFrameElement>(null)

  async function guardar (): Promise<void> {
    setGuardando(true)
    setError(null)

    const resultado = await escribirEnBff<Acta>(
      `projects/${proyectoId}/actas/${acta.id}`,
      'PATCH',
      { content: html }
    )

    setGuardando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    setSucio(false)
    setEditando(false)
    onCambiada(resultado.datos)
  }

  async function borrar (): Promise<void> {
    setBorrando(true)

    const resultado = await escribirEnBff(`projects/${proyectoId}/actas/${acta.id}`, 'DELETE')

    setBorrando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    onBorrada()
  }

  /** Salir sin guardar pierde las correcciones, así que se pregunta antes. */
  function volver (): void {
    if (sucio && !confirm('Tienes cambios sin guardar en este Meeting Paper. ¿Salir igual?')) return

    onVolver()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Boton variante="sutil" tamano="chico" onClick={volver}>← Volver a los Meeting Papers</Boton>

        <div className="flex flex-wrap gap-2">
          {!editando && (
            <Boton variante="secundario" tamano="chico" onClick={() => { setEditando(true) }}>
              Corregir
            </Boton>
          )}
          {editando && (
            <>
              <Boton
                variante="sutil"
                tamano="chico"
                onClick={() => {
                  setHtml(acta.content ?? '')
                  setSucio(false)
                  setEditando(false)
                }}
              >
                Descartar cambios
              </Boton>
              <Boton variante="primario" tamano="chico" cargando={guardando} onClick={() => { void guardar() }}>
                Guardar
              </Boton>
            </>
          )}
          <Boton
            variante="secundario"
            tamano="chico"
            onClick={() => { marco.current?.contentWindow?.print() }}
            disabled={editando}
          >
            Imprimir
          </Boton>
          {puedeBorrar && (
            <Boton variante="peligro" tamano="chico" onClick={() => { setConfirmando(true) }}>
              Eliminar
            </Boton>
          )}
        </div>
      </div>

      <header className="flex flex-col gap-1">
        <h2 className="text-texto text-lg font-semibold">{acta.title}</h2>
        <p className="text-texto-tenue text-sm">
          {acta.client === '' ? 'Sin cliente' : acta.client}
          {acta.meeting_date !== null && <> · <Fecha valor={acta.meeting_date} /></>}
          {acta.author !== null && <> · {acta.author.full_name}</>}
          {acta.source === 'ia' && <> · escrito con IA</>}
        </p>
        {acta.attendees.length > 0 && (
          <p className="text-texto-sutil text-xs">Asistentes: {acta.attendees.join(', ')}</p>
        )}
      </header>

      {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}

      {editando
        ? (
          <EditorDeActa
            htmlInicial={acta.content ?? ''}
            proyectoId={proyectoId}
            conIa={conIa}
            onCambio={(siguiente) => {
              setHtml(siguiente)
              setSucio(true)
            }}
          />
          )
        : (
          <ContenidoHtml
            ref={marco}
            html={acta.content ?? ''}
            titulo={`Meeting Paper: ${acta.title}`}
            firma={acta.brand_sign_url}
            // Mas alto que el de un contrato del portal: un acta se lee entera de corrido, y
            // desplazar dentro de un iframe cada dos temas rompe la lectura.
            alto="h-[46rem]"
          />
          )}

      <Dialogo open={confirmando} onOpenChange={setConfirmando}>
        <ContenidoDialogo
          titulo="Eliminar Meeting Paper"
          descripcion={`"${acta.title}" deja de estar disponible para el equipo.`}
          ancho="chico"
        >
          <div className="flex justify-end gap-2">
            <Boton variante="sutil" onClick={() => { setConfirmando(false) }}>Cancelar</Boton>
            <Boton variante="peligro" cargando={borrando} onClick={() => { void borrar() }}>Eliminar</Boton>
          </div>
        </ContenidoDialogo>
      </Dialogo>
    </div>
  )
}
