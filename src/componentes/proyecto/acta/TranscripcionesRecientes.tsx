'use client'

import { useState, type ReactElement } from 'react'
import { Trash2 } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { useAviso } from '@/componentes/estado/useAviso'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { IDIOMAS_TRANSCRIPCION, formatoDeVencimiento, type ResumenTranscripcion } from '@/dominio/transcripcion'
import { useRecurso } from '../carga'

/**
 * Las transcripciones vigentes de quien está mirando, para retomarlas sin volver a grabar ni a subir
 * nada.
 *
 * Solo lista las PROPIAS: `GET /projects/{id}/transcripciones` ya las recorta por autor del lado del
 * servidor, así que acá no hay ningún filtro que aplicar — mostrar la lista completa sin más es
 * mostrar exactamente lo que la persona puede ver.
 *
 * La API devuelve un RESUMEN (`ResumenTranscripcion`, con `extracto` y `caracteres`), nunca el texto
 * completo ni los segmentos: el detalle se pide aparte, al abrir una fila, con
 * `GET /projects/{id}/transcripciones/{tid}`.
 */

interface PropsRecientes {
  proyectoId: number
  /** Cambiar este número fuerza a volver a pedir la lista, ej. al terminar una transcripción nueva. */
  revision: number
  onAbrir: (transcripcionId: number) => void
}

/** Etiqueta legible del idioma, o el código crudo si no es de los cuatro conocidos. */
function etiquetaDeIdioma (idioma: string): string {
  return IDIOMAS_TRANSCRIPCION.find((o) => o.valor === idioma)?.etiqueta ?? idioma
}

export function TranscripcionesRecientes ({ proyectoId, revision, onAbrir }: PropsRecientes): ReactElement | null {
  const ruta = `projects/${proyectoId}/transcripciones${revision > 0 ? `?v=${revision}` : ''}`
  const { estado, recargar } = useRecurso<ResumenTranscripcion[]>(ruta, 'No se pudieron cargar las transcripciones.')

  if (estado.fase === 'cargando') return <Cargando alto="min-h-24" mensaje="Cargando las transcripciones…" />
  if (estado.fase === 'error') return <ErrorEstado detalle={estado.mensaje} onReintentar={recargar} className="min-h-24" />

  const transcripciones = estado.datos
  if (transcripciones.length === 0) return null

  return <ListaTranscripciones transcripciones={transcripciones} proyectoId={proyectoId} onAbrir={onAbrir} onBorrada={recargar} />
}

function ListaTranscripciones ({
  transcripciones,
  proyectoId,
  onAbrir,
  onBorrada
}: {
  transcripciones: ResumenTranscripcion[]
  proyectoId: number
  onAbrir: (transcripcionId: number) => void
  onBorrada: () => void
}): ReactElement {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-texto-tenue text-xs antetitulo">Transcripciones recientes</h3>
      <ul className="flex flex-col gap-1.5">
        {transcripciones.map((transcripcion) => (
          <FilaTranscripcion
            key={transcripcion.id}
            transcripcion={transcripcion}
            proyectoId={proyectoId}
            onAbrir={() => { onAbrir(transcripcion.id) }}
            onBorrada={onBorrada}
          />
        ))}
      </ul>
    </div>
  )
}

function FilaTranscripcion ({
  transcripcion,
  proyectoId,
  onAbrir,
  onBorrada
}: {
  transcripcion: ResumenTranscripcion
  proyectoId: number
  onAbrir: () => void
  onBorrada: () => void
}): ReactElement {
  const [borrando, setBorrando] = useState(false)
  const aviso = useAviso()
  const [error, setError] = useState<string | null>(null)

  async function borrar (): Promise<void> {
    if (borrando) return

    setBorrando(true)
    setError(null)

    const resultado = await escribirEnBff(`projects/${proyectoId}/transcripciones/${transcripcion.id}`, 'DELETE')

    if (!resultado.ok) {
      setError(resultado.mensaje)
      setBorrando(false)

      return
    }

    aviso.exito('Transcripción eliminada.')
    onBorrada()
  }

  return (
    <li className="border-linea bg-superficie flex flex-col gap-1 rounded-chico border p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onAbrir}
          className="text-texto min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline"
        >
          {transcripcion.extracto === '' ? 'Transcripción sin texto' : transcripcion.extracto.slice(0, 80)}
        </button>

        <div className="flex shrink-0 items-center gap-1.5">
          <Insignia tono="contorno" tamano="chico">{etiquetaDeIdioma(transcripcion.idioma)}</Insignia>
          <Boton
            variante="sutil"
            tamano="chico"
            soloIcono
            cargando={borrando}
            onClick={() => { void borrar() }}
            aria-label="Eliminar esta transcripción"
          >
            <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
          </Boton>
        </div>
      </div>

      <p className="text-texto-sutil text-xs">Se borra el {formatoDeVencimiento(transcripcion.expira_en)}.</p>
      {error !== null && <p role="alert" className="text-texto-peligro text-xs">{error}</p>}
    </li>
  )
}
