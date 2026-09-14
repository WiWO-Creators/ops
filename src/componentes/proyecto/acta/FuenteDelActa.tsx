'use client'

import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto } from '@/componentes/formularios/Entrada'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import {
  ACEPTA,
  LIMITE_AUDIO_BYTES,
  LIMITE_BYTES,
  LIMITE_DOCUMENTO_BYTES,
  MAXIMO_ARCHIVOS,
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

/** Etiqueta del campo de archivo, por modo. Plural: desde ahora se puede elegir más de uno. */
const ETIQUETA_ARCHIVO: Record<'audio' | 'imagen' | 'documento', string> = {
  audio: 'Archivos de audio',
  imagen: 'Fotos de la pizarra o del cuaderno',
  documento: 'Meeting Paper ya redactado'
}

/**
 * Qué se acepta en cada modo de archivo. Se dice en el campo, no en un aviso aparte: el peso máximo
 * solo importa mientras se elige el archivo.
 *
 * Ya no dice "el archivo no se guarda": ahora se guarda. Es la frase que la auditoría encontró y que
 * describía el comportamiento viejo, donde los tres modos de archivo eran la fuente de entrada del
 * modelo y nada más.
 */
function ayudaDeArchivo (modo: 'audio' | 'imagen' | 'documento'): string {
  if (modo === 'documento') {
    return `PDF, DOCX, TXT, MD o HTML, hasta ${formatoPeso(LIMITE_DOCUMENTO_BYTES)} cada uno. Quedan adjuntos al Meeting Paper.`
  }

  const tope = formatoPeso(modo === 'audio' ? LIMITE_AUDIO_BYTES : LIMITE_BYTES)

  return `Hasta ${tope} cada uno, ${MAXIMO_ARCHIVOS} como máximo. Quedan adjuntos al Meeting Paper.`
}

interface PropsFuente {
  modo: ModoEntrada
  onModo: (modo: ModoEntrada) => void
  texto: string
  onTexto: (texto: string) => void
  archivos: File[]
  errorArchivo: string | null
  onArchivos: (archivos: File[]) => void
}

export function FuenteDelActa ({
  modo,
  onModo,
  texto,
  onTexto,
  archivos,
  errorArchivo,
  onArchivos
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
            onGrabado={(grabado) => { onArchivos([grabado]) }}
            onDescartado={() => { onArchivos([]) }}
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
                multiple
                accept={ACEPTA[modo]}
                // El `<input type="file">` no acumula: cada elección reemplaza a la anterior, que es
                // lo que el control nativo ya le muestra a la persona. Acumular obligaría a inventar
                // un botón de quitar por fila para deshacer un clic de más.
                onChange={(evento) => { onArchivos(Array.from(evento.target.files ?? [])) }}
                className="text-texto-tenue file:rounded-control file:border-control-borde file:bg-control file:text-texto hover:file:bg-hover w-full cursor-pointer text-sm file:mr-3 file:cursor-pointer file:border file:px-3 file:py-1.5 file:text-sm file:font-semibold"
              />
            )}
          </Campo>
        )}

        {archivos.length > 0 && modo !== 'grabar' && (
          <Elegidos archivos={archivos} />
        )}
      </div>
    </div>
  )
}

/**
 * Lo que se eligió, con el peso de cada archivo y cuál de ellos lee el asistente.
 *
 * Decir cuál se lee no es un detalle de implementación que se pueda callar: el modelo trabaja con
 * UNA fuente, y quien sube tres fotos de una pizarra tiene que saber que la segunda y la tercera
 * quedan guardadas pero no se leen. Callarlo produce un acta incompleta que nadie sabe por qué lo
 * está.
 */
function Elegidos ({ archivos }: { archivos: File[] }): ReactElement {
  const total = archivos.reduce((suma, archivo) => suma + archivo.size, 0)

  return (
    <div className="flex flex-col gap-1">
      <ul className="flex flex-col gap-0.5">
        {archivos.map((archivo, posicion) => (
          <li
            key={`${archivo.name}-${archivo.lastModified}-${posicion}`}
            className="text-texto-tenue flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs"
          >
            {/* `break-all`: un nombre de archivo sin espacios desborda la tarjeta a 400 px. */}
            <span className="text-texto font-medium break-all">{archivo.name}</span>
            <span>{formatoPeso(archivo.size)}</span>
            {posicion === 0 && archivos.length > 1 && (
              <span className="text-acento font-semibold">Este es el que se lee</span>
            )}
          </li>
        ))}
      </ul>

      {archivos.length > 1 && (
        <p className="text-texto-sutil text-xs">
          {archivos.length} archivos, {formatoPeso(total)} en total. Los demás quedan adjuntos al
          Meeting Paper sin pasar por el asistente.
        </p>
      )}
    </div>
  )
}
