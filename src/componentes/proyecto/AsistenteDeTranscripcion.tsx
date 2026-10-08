'use client'

import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Orbe } from '@/componentes/estado/Orbe'
import { leerDelBff } from '@/componentes/datos/mutaciones'
import { leerSSE } from '@/datos/sse'
import { ACEPTA, formatoPeso } from '@/dominio/actas'
import {
  AVISO_PRIVACIDAD_TRANSCRIPCION,
  IDIOMAS_TRANSCRIPCION,
  IDIOMA_POR_DEFECTO,
  leerEventoTranscripcion,
  validarAudioDeTranscripcion,
  type IdiomaTranscripcion,
  type Transcripcion
} from '@/dominio/transcripcion'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import { AvisoEnLinea, Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { GrabadoraDeAudio } from './GrabadoraDeAudio'
import { Paso } from './acta/Paso'
import { ResultadoDeTranscripcion } from './acta/ResultadoDeTranscripcion'
import type { PasoIA } from '@/dominio/ia'

/**
 * Asistente de "Solo transcribir": el mismo material de una reunión, pero sin escribir un acta.
 *
 * === POR QUE NO ES `AsistenteDeActa` CON UN INTERRUPTOR ===
 *
 * El contrato del endpoint es más chico —solo `paso`, `error` y `fin`, sin `delta`: nadie redacta,
 * así que no hay texto que ir mostrando mientras se genera— y el resultado no es un documento que se
 * guarda y se abre en otra pestaña: es un texto que se copia, se descarga o se usa para crear un
 * acta. Forzarlo dentro del asistente del acta hubiera significado una fase más, un tipo de resultado
 * más y una condición nueva en cada rama de aquel componente para un flujo que en los hechos no
 * comparte ni el disparo de la generación ni la forma de la respuesta.
 *
 * Lo que SÍ se reutiliza, tal cual: `GrabadoraDeAudio` para grabar, `datos/sse.ts` para leer el
 * stream, y `AsistenteDeActa` en sí mismo —vía su prop `transcripcionId`— para el botón "Crear
 * Meeting Paper con esto": no hay una segunda llamada a `/ia/proyectos/{id}/acta` escrita acá.
 */

/** Recipiente de una sola tarjeta, igual que en el asistente del acta. */
const TARJETA = 'border-linea bg-superficie-elevada rounded-tarjeta border p-4 sm:p-5'

interface PropsAsistenteTranscripcion {
  proyectoId: number
  /**
   * Id de una transcripción ya guardada, para abrir directo en el resultado en vez del formulario.
   * Es lo que dispara "Abrir" desde `TranscripcionesRecientes`.
   */
  transcripcionAbiertaId?: number | null
  /**
   * Se llama con el id de la transcripción cuando la persona pide crear un Meeting Paper con ella.
   * Quien lo escucha navega al asistente del acta con ese id — ver `PanelActas`.
   */
  onCrearActa?: (transcripcionId: number) => void
  onCancelar: () => void
}

type Fase = 'cargando' | 'entrada' | 'generando' | 'resultado' | 'error'

export function AsistenteDeTranscripcion ({
  proyectoId,
  transcripcionAbiertaId = null,
  onCrearActa,
  onCancelar
}: PropsAsistenteTranscripcion): ReactElement {
  const [fase, setFase] = useState<Fase>(transcripcionAbiertaId === null ? 'entrada' : 'cargando')
  const [modo, setModo] = useState<'grabar' | 'audio'>('grabar')
  const [idioma, setIdioma] = useState<IdiomaTranscripcion>(IDIOMA_POR_DEFECTO)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null)
  const [paso, setPaso] = useState<PasoIA | null>(null)
  const [contestoElServidor, setContestoElServidor] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [transcripcion, setTranscripcion] = useState<Transcripcion | null>(null)

  const enCurso = useRef<AbortController | null>(null)

  // Abre directo en el resultado cuando llega con un id: "Abrir" de las recientes.
  useEffect(() => {
    if (transcripcionAbiertaId === null) return

    const control = new AbortController()

    void leerDelBff<Transcripcion>(`projects/${proyectoId}/transcripciones/${transcripcionAbiertaId}`)
      .then((resultado) => {
        if (control.signal.aborted) return

        if (resultado.ok) {
          setTranscripcion(resultado.datos)
          setFase('resultado')
        } else {
          setError(resultado.mensaje)
          setFase('error')
        }
      })

    return () => { control.abort() }
  }, [proyectoId, transcripcionAbiertaId])

  useEffect(() => () => { enCurso.current?.abort() }, [])

  useEffect(() => {
    if (fase !== 'generando') return

    const desde = Date.now()
    const temporizador = setInterval(() => { setSegundos(Math.floor((Date.now() - desde) / 1000)) }, 1000)

    return () => { clearInterval(temporizador) }
  }, [fase])

  function elegirArchivo (elegido: File | null): void {
    setErrorArchivo(null)

    if (elegido === null) {
      setArchivo(null)

      return
    }

    const problema = validarAudioDeTranscripcion(elegido)
    if (problema !== null) {
      setArchivo(null)
      setErrorArchivo(problema)

      return
    }

    setArchivo(elegido)
  }

  const listoParaTranscribir = archivo !== null && fase !== 'generando'

  async function transcribir (): Promise<void> {
    if (!listoParaTranscribir || archivo === null) return

    const control = new AbortController()
    enCurso.current = control

    setFase('generando')
    setPaso(null)
    setContestoElServidor(false)
    setError(null)
    setSegundos(0)

    const cuerpo = new FormData()
    cuerpo.append('audio', archivo)
    cuerpo.append('idioma', idioma)

    try {
      for await (const crudo of leerSSE(`ia/proyectos/${proyectoId}/transcripcion`, { cuerpo, senal: control.signal })) {
        setContestoElServidor(true)

        const evento = leerEventoTranscripcion(crudo)
        if (evento === null) continue

        if (evento.tipo === 'paso') {
          setPaso(evento.paso.fase === 'fin' ? null : evento.paso)
        }

        if (evento.tipo === 'error') {
          setError(evento.mensaje)
          setFase('error')

          return
        }

        if (evento.tipo === 'fin') {
          setTranscripcion(evento.transcripcion)
          setFase('resultado')

          return
        }
      }

      setError('La conexión se cortó antes de terminar. Vuelve a intentarlo.')
      setFase('error')
    } catch (fallo: unknown) {
      if (control.signal.aborted) return

      setError(fallo instanceof Error ? fallo.message : 'No se pudo transcribir el audio.')
      setFase('error')
    }
  }

  if (fase === 'cargando') return <Cargando alto="min-h-48" mensaje="Cargando la transcripción…" />

  if (fase === 'error' && transcripcion === null) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-texto text-base font-semibold">Solo transcribir</h2>
          <Boton variante="sutil" tamano="chico" onClick={onCancelar}>Volver</Boton>
        </div>
        <ErrorEstado detalle={error ?? 'No se pudo transcribir el audio.'} onReintentar={() => { setFase('entrada') }} />
      </div>
    )
  }

  if (fase === 'resultado' && transcripcion !== null) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-texto text-base font-semibold">Transcripción</h2>
          <Boton variante="sutil" tamano="chico" onClick={onCancelar}>Volver</Boton>
        </div>
        <ResultadoDeTranscripcion
          transcripcion={transcripcion}
          className={TARJETA}
          onCrearActa={onCrearActa === undefined ? undefined : () => { onCrearActa(transcripcion.id) }}
        />
      </div>
    )
  }

  const subiendo = archivo !== null && !contestoElServidor

  if (fase === 'generando') {
    return (
      <div className={`${TARJETA} flex flex-col gap-4`}>
        <div className="flex items-start gap-3">
          <Orbe medida="2.5rem" estado={subiendo ? 'routing' : (paso?.orbe ?? 'thinking')} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-texto text-sm font-semibold">
              {subiendo
                ? `Subiendo el audio… (${formatoPeso(archivo?.size ?? 0)})`
                : paso?.etiqueta ?? 'Transcribiendo el audio…'}
            </p>
            <p className="text-texto-sutil text-xs">
              Van {segundos} s. Escuchar una reunión larga puede tardar varios minutos.
            </p>
          </div>
        </div>

        <span role="status" className="sr-only">Transcribiendo el audio</span>

        <p className="text-texto-sutil text-xs">
          Puedes cambiar de pestaña: la transcripción se guarda sola al terminar.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-texto text-base font-semibold">Solo transcribir</h2>
        <Boton variante="sutil" tamano="chico" onClick={onCancelar}>Cancelar</Boton>
      </div>

      <p className="text-texto-sutil text-xs">{AVISO_PRIVACIDAD_TRANSCRIPCION}</p>

      <div className={`${TARJETA} flex flex-col`}>
        <Paso numero={1} titulo="El audio de la reunión" className="pb-5">
          <div className="flex flex-col gap-3">
            <Segmentado
              etiqueta="Cómo llega el audio"
              opciones={[
                { valor: 'grabar', etiqueta: 'Grabar' },
                { valor: 'audio', etiqueta: 'Subir un archivo' }
              ]}
              activo={modo}
              onElegir={(valor) => {
                setModo(valor as 'grabar' | 'audio')
                elegirArchivo(null)
              }}
              tamano="medio"
            />

            {modo === 'grabar'
              ? (
                <GrabadoraDeAudio
                  onGrabado={elegirArchivo}
                  onDescartado={() => { elegirArchivo(null) }}
                />
                )
              : (
                <div className="flex flex-col gap-1.5">
                  <input
                    type="file"
                    accept={ACEPTA.audio}
                    onChange={(evento) => { elegirArchivo(evento.target.files?.[0] ?? null) }}
                    className="text-texto-tenue file:rounded-control file:border-control-borde file:bg-control file:text-texto hover:file:bg-hover w-full cursor-pointer text-sm file:mr-3 file:cursor-pointer file:border file:px-3 file:py-1.5 file:text-sm file:font-semibold"
                  />
                  {errorArchivo !== null && <AvisoEnLinea variante="error" mensaje={errorArchivo} />}
                  {archivo !== null && (
                    <p className="text-texto-tenue text-xs">{archivo.name} ({formatoPeso(archivo.size)})</p>
                  )}
                </div>
                )}
          </div>
        </Paso>

        <Paso numero={2} titulo="Idioma de la reunión" className="border-linea border-t pt-6">
          <Segmentado
            etiqueta="Idioma"
            opciones={IDIOMAS_TRANSCRIPCION.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }))}
            activo={idioma}
            onElegir={(valor) => { setIdioma(valor as IdiomaTranscripcion) }}
            tamano="medio"
            className="max-w-full flex-wrap"
          />
        </Paso>
      </div>

      {error !== null && (
        <AvisoEnLinea variante="error" mensaje={error} className="bg-superficie-peligro rounded-chico px-3 py-2 text-sm" />
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        {!listoParaTranscribir && error === null && (
          <p className="text-texto-sutil text-xs sm:mr-auto">Graba o sube el audio de la reunión para transcribirlo.</p>
        )}

        <Boton
          variante="primario"
          onClick={() => { void transcribir() }}
          disabled={!listoParaTranscribir}
          className="w-full sm:w-auto"
        >
          Transcribir
        </Boton>
      </div>
    </div>
  )
}
