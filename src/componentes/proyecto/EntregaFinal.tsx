'use client'

import { Paperclip } from 'lucide-react'
import { useEffect, useRef, type ChangeEvent, type ReactElement } from 'react'
import { escribirEnBff, type Resultado } from '@/componentes/datos/mutaciones'
import { AvisoEnLinea, Cargando } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import { rutaDeAdjuntos, nombreDeArchivo } from '@/definiciones/archivos'
import { formatearTamano } from '@/dominio/drive-explorador'
import type { ArchivoProyecto } from '@/datos/recursos'
import { useRecurso } from './carga'
import {
  errorDeEleccion,
  resumenDeEntrega,
  rutaDeSeguidoresDeContacto,
  type EleccionDeEntrega,
  type InfoDeEntrega,
  type SeguidoresDeContacto
} from './entrega-final'

/**
 * El archivo final que se le manda al cliente al completar una Tarea.
 *
 * Al completar, la API manda a los seguidores-contacto de la Tarea el correo «tu tarea terminó» con el
 * archivo **adjunto**, nunca como enlace. Este bloque deja elegir cuál:
 *
 *  - un adjunto que la Tarea ya tiene,
 *  - uno nuevo, que se sube al completar (queda como adjunto de la Tarea), o
 *  - ninguno: la Tarea se completa y no sale correo.
 *
 * **Dice la verdad sobre el correo.** Antes de elegir, la frase de arriba cuenta si el correo va a salir
 * de verdad (interruptor general y «Avisos por correo»), a quién y si el cliente ve la Tarea. Ofrecer un
 * archivo que no va a viajar es peor que no ofrecerlo.
 *
 * Es controlado: la elección vive en quien lo monta (la ficha o el diálogo), que es quien completa.
 */

interface PropsEntregaFinal {
  tareaId: number
  eleccion: EleccionDeEntrega
  onEleccion: (eleccion: EleccionDeEntrega) => void
  /** Se llama con lo que informa la API (tope del adjunto), para que quien completa valide antes de subir. */
  onInfo?: (info: InfoDeEntrega | undefined) => void
  /** `true` mientras se completa: no se cambia lo que ya está saliendo. */
  deshabilitado?: boolean
}

/** Las tres alternativas, en el orden en que se leen. */
const OPCIONES = [
  { valor: 'ninguno', etiqueta: 'Sin correo' },
  { valor: 'existente', etiqueta: 'Adjunto de la tarea' },
  { valor: 'nuevo', etiqueta: 'Subir un archivo' }
] as const

export function EntregaFinal (
  { tareaId, eleccion, onEleccion, onInfo, deshabilitado = false }: PropsEntregaFinal
): ReactElement {
  const seguidores = useRecurso<SeguidoresDeContacto>(
    rutaDeSeguidoresDeContacto(tareaId, 'panel'),
    'No se pudo leer quién sigue la tarea.'
  )
  const adjuntos = useRecurso<ArchivoProyecto[]>(
    rutaDeAdjuntos('tasks', tareaId),
    'No se pudieron leer los adjuntos de la tarea.'
  )
  const selector = useRef<HTMLInputElement>(null)

  const info = seguidores.estado.fase === 'listo' ? seguidores.estado.datos.delivery : undefined

  useEffect(() => { onInfo?.(info) }, [info, onInfo])

  if (seguidores.estado.fase === 'cargando' || adjuntos.estado.fase === 'cargando') {
    return <Cargando mensaje="Cargando el envío al cliente…" />
  }

  if (seguidores.estado.fase === 'error' || adjuntos.estado.fase === 'error') {
    return (
      <AvisoEnLinea
        variante="error"
        mensaje="No se pudo preparar el envío al cliente. Puedes completar la tarea sin correo."
      />
    )
  }

  const resumen = resumenDeEntrega(seguidores.estado.datos)
  const locales = adjuntos.estado.datos.filter((adjunto) => adjunto.external === null || adjunto.external === '')
  const externos = adjuntos.estado.datos.length - locales.length
  const error = errorDeEleccion(eleccion, info?.max_bytes)

  function alElegirArchivo (evento: ChangeEvent<HTMLInputElement>): void {
    const archivo = evento.target.files?.[0] ?? null

    // Se limpia para que volver a elegir el mismo archivo dispare el cambio.
    evento.target.value = ''
    if (archivo !== null) onEleccion({ modo: 'nuevo', archivo })
  }

  return (
    <div className="flex flex-col gap-3">
      {resumen.saldria
        ? <p className="text-texto-tenue text-sm">{resumen.texto}</p>
        : <AvisoEnLinea variante="aviso" mensaje={resumen.texto} />}

      <Segmentado
        etiqueta="Archivo final para el cliente"
        opciones={OPCIONES}
        activo={eleccion.modo}
        tamano="chico"
        onElegir={(valor) => {
          if (deshabilitado) return
          if (valor === 'ninguno') onEleccion({ modo: 'ninguno' })
          if (valor === 'existente') onEleccion({ modo: 'existente', archivoId: eleccion.modo === 'existente' ? eleccion.archivoId : null })
          if (valor === 'nuevo') onEleccion({ modo: 'nuevo', archivo: eleccion.modo === 'nuevo' ? eleccion.archivo : null })
        }}
      />

      {eleccion.modo === 'existente' && (
        <fieldset className="flex flex-col gap-1.5" disabled={deshabilitado}>
          <legend className="sr-only">Adjunto que se envía al cliente</legend>
          {locales.length === 0 && (
            <p className="text-texto-sutil text-sm">
              La tarea no tiene adjuntos que se puedan enviar. Sube un archivo nuevo.
            </p>
          )}
          {locales.map((adjunto) => (
            <label key={adjunto.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name={`entrega-${tareaId}`}
                className="size-4"
                checked={eleccion.archivoId === adjunto.id}
                onChange={() => { onEleccion({ modo: 'existente', archivoId: adjunto.id }) }}
              />
              <span className="min-w-0 truncate">{nombreDeArchivo(adjunto)}</span>
            </label>
          ))}
          {externos > 0 && (
            <p className="text-texto-sutil text-xs">
              {externos === 1 ? 'Hay 1 adjunto en Drive u otro servicio' : `Hay ${externos} adjuntos en Drive u otro servicio`}
              : no se pueden enviar por correo.
            </p>
          )}
        </fieldset>
      )}

      {eleccion.modo === 'nuevo' && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={selector}
            type="file"
            hidden
            aria-label="Elegir el archivo final"
            onChange={alElegirArchivo}
          />
          <Boton
            type="button"
            tamano="chico"
            disabled={deshabilitado}
            onClick={() => { selector.current?.click() }}
          >
            <Paperclip className="size-3.5" aria-hidden="true" />
            {eleccion.archivo === null ? 'Elegir archivo' : 'Cambiar archivo'}
          </Boton>
          {eleccion.archivo !== null && (
            <span className="min-w-0 truncate text-sm">
              {eleccion.archivo.name}{' '}
              <span className="text-texto-sutil text-xs">{formatearTamano(eleccion.archivo.size)}</span>
            </span>
          )}
          {info !== undefined && (
            <span className="text-texto-sutil text-xs">Máximo {formatearTamano(info.max_bytes)}.</span>
          )}
        </div>
      )}

      {/* Solo cuando el archivo ya elegido no sirve: «elige un archivo» antes de poder elegirlo es ruido. */}
      {eleccion.modo === 'nuevo' && eleccion.archivo !== null && error !== null && (
        <AvisoEnLinea variante="error" mensaje={error} />
      )}
    </div>
  )
}

/**
 * Deja la elección lista para completar: sube el archivo nuevo si hace falta y devuelve el id del
 * adjunto que viajará en el correo, o `null` si no hay archivo.
 *
 * @param tareaId id del Proceso
 * @param eleccion lo elegido
 * @returns el id del adjunto (o `null` sin archivo), o el motivo del fallo ya legible
 */
export async function resolverArchivoDeEntrega (
  tareaId: number,
  eleccion: EleccionDeEntrega
): Promise<Resultado<number | null>> {
  if (eleccion.modo === 'ninguno') return { ok: true, datos: null }
  if (eleccion.modo === 'existente') return { ok: true, datos: eleccion.archivoId }
  if (eleccion.archivo === null) return { ok: false, mensaje: 'Elige el archivo que quieres subir.' }

  const cuerpo = new FormData()
  cuerpo.append('file', eleccion.archivo)

  const subida = await escribirEnBff<ArchivoProyecto[]>(rutaDeAdjuntos('tasks', tareaId), 'POST', cuerpo)

  if (!subida.ok) return subida

  const id = subida.datos[0]?.id

  return typeof id === 'number'
    ? { ok: true, datos: id }
    : { ok: false, mensaje: 'El archivo se subió, pero no se pudo identificar. Elígelo entre los adjuntos de la tarea.' }
}
