'use client'

import dynamic from 'next/dynamic'
import { useRef, useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { ContenidoHtml } from '@/componentes/presentadores/ContenidoHtml'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Dialogo, ContenidoDialogo } from '@/componentes/superposiciones/Dialogo'
import {
  ContenidoMenu,
  DisparadorMenu,
  ItemMenu,
  MenuContextual
} from '@/componentes/superposiciones/MenuContextual'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import type { Acta } from '@/datos/recursos'

/**
 * Un Meeting Paper: se lee, se corrige y se imprime.
 *
 * === LAS ACCIONES TIENEN PESOS DISTINTOS PORQUE NO VALEN LO MISMO ===
 *
 * Eran seis botones en fila —Volver, Corregir, Guardar, Descartar, Imprimir, Eliminar— todos del
 * mismo tamaño y del mismo tono, así que encontrar el que se quería costaba leerlos los seis. Ahora
 * el regreso es navegación y va solo arriba; de las acciones del acta queda a la vista la probable
 * como primaria —Corregir leyendo, Guardar editando—, su acompañante como secundaria, y Eliminar
 * vive en el menú de `⋯`: es destructiva y rarísima, y un botón rojo permanente en la cabecera de
 * algo que se abre para leer es ruido con riesgo.
 *
 * `Imprimir` ya no se dibuja deshabilitada mientras se corrige: un control apagado que aparece solo
 * para decir que no se puede usar ocupa el mismo lugar que uno que sí.
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
      {/* El regreso va solo y arriba de todo: es navegación, no una de las acciones del acta, y
          mezclado con ellas competía por la misma mirada. */}
      <Boton variante="sutil" tamano="chico" onClick={volver} className="-ml-3 self-start">
        ← Volver a los Meeting Papers
      </Boton>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <header className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-texto text-lg font-semibold">{acta.title}</h2>
            {acta.source === 'ia' && (
              <Insignia tono="acento" tamano="chico">Escrito con IA</Insignia>
            )}
          </div>
          <p className="text-texto-tenue text-sm">
            {acta.client === '' ? 'Sin cliente' : acta.client}
            {acta.meeting_date !== null && <> · <Fecha valor={acta.meeting_date} /></>}
            {acta.author !== null && <> · {acta.author.full_name}</>}
          </p>
          {acta.attendees.length > 0 && (
            <p className="text-texto-sutil text-xs">Asistentes: {acta.attendees.join(', ')}</p>
          )}
        </header>

        {/* Una acción probable con peso de primaria, una de apoyo y lo destructivo guardado. Las seis
            en fila y con el mismo peso obligaban a leerlas todas para encontrar la que se quería. */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {editando
            ? (
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
              )
            : (
              <>
                <Boton
                  variante="secundario"
                  tamano="chico"
                  onClick={() => { marco.current?.contentWindow?.print() }}
                >
                  Imprimir
                </Boton>
                <Boton variante="primario" tamano="chico" onClick={() => { setEditando(true) }}>
                  Corregir
                </Boton>
              </>
              )}

          {puedeBorrar && (
            <MenuContextual>
              <DisparadorMenu asChild>
                <Boton variante="sutil" tamano="chico" soloIcono aria-label="Más acciones del Meeting Paper">
                  <span aria-hidden="true">⋯</span>
                </Boton>
              </DisparadorMenu>
              <ContenidoMenu align="end">
                <ItemMenu peligroso onSelect={() => { setConfirmando(true) }}>Eliminar</ItemMenu>
              </ContenidoMenu>
            </MenuContextual>
          )}
        </div>
      </div>

      {error !== null && (
        <p role="alert" className="bg-superficie-peligro text-texto-peligro rounded-chico px-3 py-2 text-sm">
          {error}
        </p>
      )}

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
