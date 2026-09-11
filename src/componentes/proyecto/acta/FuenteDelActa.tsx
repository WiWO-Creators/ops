'use client'

import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto } from '@/componentes/formularios/Entrada'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import {
  ACEPTA,
  LIMITE_AUDIO_BYTES,
  LIMITE_BYTES,
  LIMITE_DOCUMENTO_BYTES,
  formatoPeso
} from '@/dominio/actas'
import { GrabadoraDeAudio } from '../GrabadoraDeAudio'
import type { ReactElement } from 'react'
import type { ModoEntrada } from '@/dominio/actas'

/**
 * De dónde sale el Meeting Paper: se elige el modo y se pide SOLO lo que ese modo necesita.
 *
 * Antes los cinco modos y sus controles convivían en la misma vista, así que la pantalla ofrecía a la
 * vez un área de texto, una grabadora y tres campos de archivo para una sola cosa. Ahora el control
 * segmentado es la pregunta y debajo vive una única respuesta.
 *
 * Es lo ÚNICO obligatorio del asistente: sin material no hay nada que escribir. Todo lo demás
 * —cliente, fecha, lugar, modalidad, marca, asistentes— es opcional y vive plegado en el paso 2.
 */

/** Los cinco modos, con la etiqueta corta que cabe en el control a 400 px. */
const MODOS: ReadonlyArray<{ valor: ModoEntrada, etiqueta: string }> = [
  { valor: 'texto', etiqueta: 'Apuntes' },
  { valor: 'grabar', etiqueta: 'Grabar' },
  { valor: 'audio', etiqueta: 'Audio' },
  { valor: 'imagen', etiqueta: 'Foto' },
  { valor: 'documento', etiqueta: 'Documento' }
]

/** Etiqueta del campo de archivo, por modo. */
const ETIQUETA_ARCHIVO: Record<'audio' | 'imagen' | 'documento', string> = {
  audio: 'Archivo de audio',
  imagen: 'Foto de la pizarra o del cuaderno',
  documento: 'Meeting Paper ya redactado'
}

/**
 * Qué se acepta en cada modo de archivo. Se dice en el campo, no en un aviso aparte: el peso máximo
 * solo importa mientras se elige el archivo.
 */
function ayudaDeArchivo (modo: 'audio' | 'imagen' | 'documento'): string {
  if (modo === 'documento') {
    return `PDF, DOCX, TXT, MD o HTML, hasta ${formatoPeso(LIMITE_DOCUMENTO_BYTES)}. El archivo no se guarda: lo que queda es el Meeting Paper que se escriba a partir de él.`
  }

  return `Hasta ${formatoPeso(modo === 'audio' ? LIMITE_AUDIO_BYTES : LIMITE_BYTES)}.`
}

interface PropsFuente {
  modo: ModoEntrada
  onModo: (modo: ModoEntrada) => void
  texto: string
  onTexto: (texto: string) => void
  archivo: File | null
  errorArchivo: string | null
  onArchivo: (archivo: File | null) => void
}

export function FuenteDelActa ({
  modo,
  onModo,
  texto,
  onTexto,
  archivo,
  errorArchivo,
  onArchivo
}: PropsFuente): ReactElement {
  const deArchivo = modo === 'audio' || modo === 'imagen' || modo === 'documento'

  return (
    <div className="flex flex-col gap-4">
      {/* `max-w-full flex-wrap` en vez de un `overflow-x-auto`: a 400 px los cinco modos no entran en
          una línea, y una quinta opción fuera de un carril que hay que descubrir desplazando es una
          opción que no existe. Envuelto, se ven los cinco. */}
      <Segmentado
        etiqueta="De dónde sale el Meeting Paper"
        opciones={MODOS}
        activo={modo}
        onElegir={(valor) => { onModo(valor as ModoEntrada) }}
        tamano="medio"
        className="max-w-full flex-wrap"
      />

      <div className="flex flex-col gap-2">
        {modo === 'texto' && (
          <Campo etiqueta="Apuntes de la reunión" ayuda="Pega lo que anotaste, o la transcripción.">
            {(props) => (
              <AreaTexto
                {...props}
                rows={8}
                value={texto}
                onChange={(evento) => { onTexto(evento.target.value) }}
              />
            )}
          </Campo>
        )}

        {modo === 'grabar' && (
          <GrabadoraDeAudio
            onGrabado={(grabado) => { onArchivo(grabado) }}
            onDescartado={() => { onArchivo(null) }}
          />
        )}

        {deArchivo && (
          <Campo
            etiqueta={ETIQUETA_ARCHIVO[modo]}
            ayuda={ayudaDeArchivo(modo)}
            error={errorArchivo ?? undefined}
          >
            {(props) => (
              <input
                {...props}
                type="file"
                accept={ACEPTA[modo]}
                onChange={(evento) => { onArchivo(evento.target.files?.[0] ?? null) }}
                className="text-texto-tenue file:rounded-control file:border-control-borde file:bg-control file:text-texto hover:file:bg-hover w-full cursor-pointer text-sm file:mr-3 file:cursor-pointer file:border file:px-3 file:py-1.5 file:text-sm file:font-semibold"
              />
            )}
          </Campo>
        )}

        {archivo !== null && modo !== 'grabar' && (
          <p className="text-texto-tenue flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
            {/* `break-all`: un nombre de archivo sin espacios desborda la tarjeta a 400 px. */}
            <span className="text-texto font-medium break-all">{archivo.name}</span>
            <span>{formatoPeso(archivo.size)}</span>
          </p>
        )}
      </div>
    </div>
  )
}
