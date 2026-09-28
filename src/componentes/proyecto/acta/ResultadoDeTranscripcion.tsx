'use client'

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { Download } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import {
  AVISO_PRIVACIDAD_TRANSCRIPCION,
  IDIOMAS_TRANSCRIPCION,
  formatoDeVencimiento,
  nombreDeArchivoTranscripcion,
  textoDeTranscripcion,
  type Transcripcion
} from '@/dominio/transcripcion'

/**
 * Lo que se ve de una transcripción ya guardada: el texto, el aviso de cuándo se borra y las tres
 * acciones que se pueden hacer con ella.
 *
 * Es un componente aparte de `AsistenteDeTranscripcion` porque se muestra desde DOS lugares que no se
 * llaman entre sí: al terminar de transcribir, y al abrir una de "Transcripciones recientes". En los
 * dos casos lo que hay en pantalla es exactamente lo mismo.
 */

interface PropsResultado {
  transcripcion: Transcripcion
  /** Si viene, ofrece "Crear Meeting Paper con esto". Ausente en el portal o sin permiso de crear. */
  onCrearActa?: () => void
  className?: string
}

/** Etiqueta legible del idioma, o el código crudo si no es de los cuatro conocidos. */
function etiquetaDeIdioma (idioma: string): string {
  return IDIOMAS_TRANSCRIPCION.find((o) => o.valor === idioma)?.etiqueta ?? idioma
}

export function ResultadoDeTranscripcion ({ transcripcion, onCrearActa, className }: PropsResultado): ReactElement {
  const [conMarcas, setConMarcas] = useState(transcripcion.segmentos.length > 0)
  const [copiado, setCopiado] = useState(false)
  const temporizador = useRef<number | undefined>(undefined)

  useEffect(() => () => { window.clearTimeout(temporizador.current) }, [])

  const texto = textoDeTranscripcion(transcripcion, conMarcas)

  const copiar = useCallback(() => {
    navigator.clipboard?.writeText(texto)
      .then(() => {
        setCopiado(true)
        window.clearTimeout(temporizador.current)
        temporizador.current = window.setTimeout(() => { setCopiado(false) }, 1500)
      })
      .catch(() => { setCopiado(false) })
  }, [texto])

  function descargar (): void {
    const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const enlace = document.createElement('a')

    enlace.href = url
    enlace.download = nombreDeArchivoTranscripcion(transcripcion)
    document.body.appendChild(enlace)
    enlace.click()
    enlace.remove()
    setTimeout(() => { URL.revokeObjectURL(url) }, 1000)
  }

  return (
    <div className={className}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Insignia tono="contorno" tamano="chico">{etiquetaDeIdioma(transcripcion.idioma)}</Insignia>
            {transcripcion.duracion_segundos !== null && (
              <span className="text-texto-sutil text-xs">
                {Math.round(transcripcion.duracion_segundos / 60)} min de audio
              </span>
            )}
          </div>

          {transcripcion.segmentos.length > 0 && (
            <Segmentado
              etiqueta="Cómo mostrar el texto"
              opciones={[
                { valor: 'con', etiqueta: 'Con marcas de tiempo' },
                { valor: 'sin', etiqueta: 'Sin marcas' }
              ]}
              activo={conMarcas ? 'con' : 'sin'}
              onElegir={(valor) => { setConMarcas(valor === 'con') }}
              tamano="chico"
            />
          )}
        </div>

        <p className="border-linea bg-superficie-hundida rounded-tarjeta max-h-96 overflow-auto border p-3 text-sm whitespace-pre-wrap">
          {texto === '' ? 'La transcripción quedó vacía.' : texto}
        </p>

        <p className="text-texto-sutil text-xs">
          {AVISO_PRIVACIDAD_TRANSCRIPCION} Se borra el {formatoDeVencimiento(transcripcion.expira_en)}.
        </p>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Boton variante="secundario" tamano="chico" onClick={copiar}>
            {copiado ? 'Copiado' : 'Copiar'}
          </Boton>
          <Boton variante="secundario" tamano="chico" onClick={descargar}>
            <Download size={14} strokeWidth={2} aria-hidden="true" className="shrink-0" />
            Descargar .txt
          </Boton>
          {onCrearActa !== undefined && (
            <Boton variante="primario" tamano="chico" onClick={onCrearActa} className="sm:ml-auto">
              Crear Meeting Paper con esto
            </Boton>
          )}
        </div>

        <span role="status" className="sr-only">{copiado ? 'Copiado' : ''}</span>
      </div>
    </div>
  )
}
