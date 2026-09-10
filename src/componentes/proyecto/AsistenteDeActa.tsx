'use client'

import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada, AreaTexto } from '@/componentes/formularios/Entrada'
import { Orbe } from '@/componentes/estado/Orbe'
import { pedirSobre } from '@/datos/cliente'
import { leerSSE } from '@/datos/sse'
import { leerEventoIA } from '@/dominio/ia'
import { MARCAS, MODALIDADES } from '@/definiciones/actas'
import { ACEPTA, LIMITE_AUDIO_BYTES, LIMITE_BYTES, LIMITE_DOCUMENTO_BYTES, formatoPeso, validarArchivo } from '@/dominio/actas'
import { aTextoPlano } from './formatos'
import { GrabadoraDeAudio } from './GrabadoraDeAudio'
import type { Acta, PrefillActa } from '@/datos/recursos'
import type { ModoEntrada } from '@/dominio/actas'

/**
 * Asistente de creación de un Meeting Paper.
 *
 * === POR QUE NO ES UN `FormularioRecurso` ===
 *
 * Cuatro razones concretas, ninguna de estilo:
 *
 * 1. Sus tipos de campo son `texto|area|fecha|color|booleano|numero|seleccion`. No existe `archivo`,
 *    y agregarlo arrastra `ValoresFormulario = Record<string, string | boolean>` a aceptar `File`,
 *    lo que toca `validarFormulario`, `cuerpoDelFormulario` y `valoresIniciales` — los tres usados
 *    por Hitos, Notas, Discusiones y Clientes.
 * 2. Hace **una** escritura JSON. Esto manda un multipart y consume un stream.
 * 3. Es un `Dialogo` de Radix, o sea modal con trampa de foco. Una generación de minutos dentro de
 *    un modal secuestra la pantalla justo cuando la persona querría irse a mirar otra cosa.
 * 4. Tiene fases, y `FormularioRecurso` no tiene concepto de fase.
 *
 * === EL STREAM TRAE HTML, Y EL HTML A MEDIAS NO ES UN DOCUMENTO ===
 *
 * Un `<h2>` sin cerrar no se puede pintar. Mientras se genera se muestra `aTextoPlano(acumulado)` en
 * un párrafo: da movimiento real y honesto sin tocar el DOM con marcado incompleto. Al llegar `fin`,
 * el acta ya está guardada en el servidor y el panel la abre para editarla.
 *
 * Por eso, además, cambiar de pestaña a mitad de una generación no pierde el trabajo: el backend
 * guarda al cerrar el stream. Se aborta la lectura al desmontar —un stream que nadie mira igual
 * cuesta— y el acta aparece en el listado igual.
 */

interface PropsAsistente {
  proyectoId: number
  /** Se llama con el acta ya guardada. El panel la abre para revisarla. */
  onCreada: (acta: Acta) => void
  onCancelar: () => void
}

export function AsistenteDeActa ({ proyectoId, onCreada, onCancelar }: PropsAsistente): ReactElement {
  const [modo, setModo] = useState<ModoEntrada>('texto')
  const [texto, setTexto] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null)

  const [cliente, setCliente] = useState('')
  const [fecha, setFecha] = useState('')
  const [lugar, setLugar] = useState('')
  const [modalidad, setModalidad] = useState('')
  const [marca, setMarca] = useState('wiwo')
  const [asistentes, setAsistentes] = useState('')

  const [fase, setFase] = useState<'entrada' | 'generando' | 'error'>('entrada')
  const [avance, setAvance] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [segundos, setSegundos] = useState(0)

  const enCurso = useRef<AbortController | null>(null)

  // Lo que ya sabe el sistema no se pregunta: cliente, miembros y fecha salen del propio Proyecto.
  useEffect(() => {
    const control = new AbortController()

    void pedirSobre<PrefillActa>(`ia/proyectos/${proyectoId}/acta/prefill`, control.signal)
      .then((sobre) => {
        if (control.signal.aborted) return
        setCliente(sobre.data.client)
        setFecha(sobre.data.meeting_date)
        setAsistentes(sobre.data.attendees.join('\n'))
      })
      .catch(() => {
        // El prefill es una comodidad: si falla, se escribe a mano. No se muestra ningún error.
      })

    return () => { control.abort() }
  }, [proyectoId])

  // Abortar al desmontar. El acta no se pierde: la guarda el servidor al cerrar el stream.
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

    const problema = validarArchivo(elegido, modo)
    if (problema !== null) {
      setArchivo(null)
      setErrorArchivo(problema)

      return
    }

    setArchivo(elegido)
  }

  const listoParaGenerar = (archivo !== null || texto.trim() !== '') && fase !== 'generando'

  async function generar (): Promise<void> {
    if (!listoParaGenerar) return

    const control = new AbortController()
    enCurso.current = control

    setFase('generando')
    setAvance('')
    setError(null)
    setSegundos(0)

    const cuerpo = new FormData()
    if (archivo !== null) cuerpo.append('file', archivo)
    if (texto.trim() !== '') cuerpo.append('texto', texto.trim())
    cuerpo.append('cliente', cliente)
    cuerpo.append('fecha', fecha)
    cuerpo.append('lugar', lugar)
    cuerpo.append('modalidad', modalidad)
    cuerpo.append('marca', marca)
    cuerpo.append('asistentes', asistentes)

    let acumulado = ''

    try {
      for await (const crudo of leerSSE(`ia/proyectos/${proyectoId}/acta`, { cuerpo, senal: control.signal })) {
        const evento = leerEventoIA(crudo)
        if (evento === null) continue

        if (evento.tipo === 'delta') {
          acumulado += evento.texto
          setAvance(acumulado)
        }

        if (evento.tipo === 'error') {
          setError(evento.mensaje)
          setFase('error')

          return
        }

        if (evento.tipo === 'fin') {
          const acta = actaDelFin(crudo)
          if (acta === null) {
            setError('El acta se generó pero no se pudo leer. Búscala en la lista.')
            setFase('error')

            return
          }

          onCreada(acta)

          return
        }
      }

      // El stream terminó sin `fin`: casi siempre es un proxy que cortó. El acta puede haberse
      // guardado igual, así que se dice eso en vez de dar a entender que se perdió.
      setError('La conexión se cortó antes de terminar. Revisa la lista: puede que el acta se haya guardado igual.')
      setFase('error')
    } catch (fallo: unknown) {
      if (control.signal.aborted) return

      setError(fallo instanceof Error ? fallo.message : 'No se pudo generar el Meeting Paper.')
      setFase('error')
    }
  }

  if (fase === 'generando') {
    return (
      <div className="border-linea bg-superficie-hundida rounded-tarjeta flex flex-col gap-3 border p-6">
        <div className="flex items-center gap-3">
          <Orbe medida="2.5rem" estado="generating" />
          <div className="flex flex-col">
            <p className="text-texto text-sm font-medium">
              {modo === 'documento'
                ? 'Leyendo el Meeting Paper y dejándolo en el formato del sistema…'
                : 'Escribiendo el Meeting Paper…'}
            </p>
            <p className="text-texto-sutil text-xs">
              {archivo === null || modo === 'documento'
                ? `Van ${segundos} s.`
                : `Van ${segundos} s. Escuchar una reunión larga puede tardar varios minutos.`}
            </p>
          </div>
        </div>

        <p className="text-texto-tenue max-w-prose text-sm whitespace-pre-wrap">
          {aTextoPlano(avance)}
        </p>

        <span role="status" className="sr-only">Generando el Meeting Paper</span>

        {modo === 'documento' && (
          <p className="text-texto-sutil text-xs">
            El archivo no se guarda: lo que queda es este Meeting Paper. Revísalo antes de cerrar.
          </p>
        )}

        <p className="text-texto-sutil text-xs">
          Puedes cambiar de pestaña: el acta se guarda sola al terminar.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-texto text-base font-semibold">Nuevo Meeting Paper</h2>
        <Boton variante="sutil" tamano="chico" onClick={onCancelar}>Cancelar</Boton>
      </div>

      <SelectorDeModo modo={modo} onCambio={(siguiente) => {
        setModo(siguiente)
        elegirArchivo(null)
      }} />

      {modo === 'documento' && (
        <p className="text-texto-sutil text-xs">
          El archivo no se guarda: lo que queda es el Meeting Paper que se escriba a partir de él.
          Revísalo antes de cerrar.
        </p>
      )}

      {modo === 'texto' && (
        <Campo etiqueta="Apuntes de la reunión" ayuda="Pega lo que anotaste, o la transcripción.">
          {(props) => (
            <AreaTexto
              {...props}
              rows={8}
              value={texto}
              onChange={(evento) => { setTexto(evento.target.value) }}
            />
          )}
        </Campo>
      )}

      {modo === 'grabar' && (
        <GrabadoraDeAudio
          onGrabado={(grabado) => { elegirArchivo(grabado) }}
          onDescartado={() => { elegirArchivo(null) }}
        />
      )}

      {(modo === 'audio' || modo === 'imagen' || modo === 'documento') && (
        <Campo
          etiqueta={ETIQUETA_ARCHIVO[modo]}
          ayuda={modo === 'documento'
            ? `PDF, DOCX, TXT, MD o HTML, hasta ${formatoPeso(LIMITE_DOCUMENTO_BYTES)}.`
            : `Hasta ${formatoPeso(modo === 'audio' ? LIMITE_AUDIO_BYTES : LIMITE_BYTES)}.`}
          error={errorArchivo ?? undefined}
        >
          {(props) => (
            <input
              {...props}
              type="file"
              accept={ACEPTA[modo]}
              onChange={(evento) => { elegirArchivo(evento.target.files?.[0] ?? null) }}
              className="text-texto-tenue file:rounded-control file:border-control-borde file:bg-control file:text-texto text-sm file:mr-3 file:border file:px-3 file:py-1.5 file:text-sm"
            />
          )}
        </Campo>
      )}

      {archivo !== null && modo !== 'grabar' && (
        <p className="text-texto-tenue text-sm">
          {archivo.name} ({formatoPeso(archivo.size)})
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Cliente">
          {(props) => <Entrada {...props} value={cliente} onChange={(e) => { setCliente(e.target.value) }} />}
        </Campo>

        <Campo etiqueta="Fecha de la reunión">
          {(props) => <Entrada {...props} type="date" value={fecha} onChange={(e) => { setFecha(e.target.value) }} />}
        </Campo>

        <Campo etiqueta="Lugar">
          {(props) => <Entrada {...props} value={lugar} onChange={(e) => { setLugar(e.target.value) }} />}
        </Campo>

        <Campo etiqueta="Modalidad">
          {(props) => (
            <select
              {...props}
              value={modalidad}
              onChange={(e) => { setModalidad(e.target.value) }}
              className="rounded-chico border-control-borde bg-control text-texto h-9 w-full border px-3 text-sm"
            >
              <option value="">Sin especificar</option>
              {MODALIDADES.map((opcion) => (
                <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>
              ))}
            </select>
          )}
        </Campo>

        <Campo etiqueta="Marca" ayuda="Decide qué firma se muestra en el acta.">
          {(props) => (
            <select
              {...props}
              value={marca}
              onChange={(e) => { setMarca(e.target.value) }}
              className="rounded-chico border-control-borde bg-control text-texto h-9 w-full border px-3 text-sm"
            >
              {MARCAS.map((opcion) => (
                <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>
              ))}
            </select>
          )}
        </Campo>

        <Campo etiqueta="Asistentes" ayuda="Uno por línea.">
          {(props) => (
            <AreaTexto
              {...props}
              rows={3}
              value={asistentes}
              onChange={(e) => { setAsistentes(e.target.value) }}
            />
          )}
        </Campo>
      </div>

      {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}

      <div className="flex justify-end gap-2">
        <Boton
          variante="primario"
          onClick={() => { void generar() }}
          disabled={!listoParaGenerar}
        >
          Escribir el Meeting Paper
        </Boton>
      </div>

      {!listoParaGenerar && error === null && (
        <p className="text-texto-sutil text-right text-xs">
          Hace falta un audio, una imagen, un documento o los apuntes de la reunión.
        </p>
      )}
    </div>
  )
}

/** Etiqueta del campo de archivo, por modo. */
const ETIQUETA_ARCHIVO: Record<'audio' | 'imagen' | 'documento', string> = {
  audio: 'Archivo de audio',
  imagen: 'Foto de la pizarra o del cuaderno',
  documento: 'Meeting Paper ya redactado'
}

/** Los cinco modos de entrada, como un grupo de radio accesible. */
function SelectorDeModo ({ modo, onCambio }: { modo: ModoEntrada, onCambio: (modo: ModoEntrada) => void }): ReactElement {
  const opciones: Array<{ valor: ModoEntrada, etiqueta: string }> = [
    { valor: 'texto', etiqueta: 'Apuntes' },
    { valor: 'grabar', etiqueta: 'Grabar' },
    { valor: 'audio', etiqueta: 'Subir audio' },
    { valor: 'imagen', etiqueta: 'Foto' },
    { valor: 'documento', etiqueta: 'Subir documento' }
  ]

  return (
    <div role="radiogroup" aria-label="De dónde sale el acta" className="flex flex-wrap gap-1">
      {opciones.map((opcion) => (
        <button
          key={opcion.valor}
          type="button"
          role="radio"
          aria-checked={modo === opcion.valor}
          onClick={() => { onCambio(opcion.valor) }}
          className={
            modo === opcion.valor
              ? 'rounded-control bg-acento text-acento-contenido px-3 py-1.5 text-sm font-semibold'
              : 'rounded-control text-texto-tenue hover:bg-hover px-3 py-1.5 text-sm font-medium'
          }
        >
          {opcion.etiqueta}
        </button>
      ))}
    </div>
  )
}

/**
 * Saca el acta guardada del evento `fin`.
 *
 * `leerEventoIA` conoce las cuatro formas del contrato de IA y descarta lo que no encaja, pero su
 * `fin` está tipado para el chat y el resumen, que no llevan acta. Antes que ensanchar ese tipo para
 * un caso —y obligar a los otros dos a contemplar un campo que nunca tienen—, se relee el frame acá.
 *
 * Solo se exige lo que el panel necesita para abrir el acta: id y título. Si el resto viniera mal, se
 * nota al pintarla, no acá.
 */
function actaDelFin (crudo: string): Acta | null {
  const linea = crudo.split(/\r\n|\r|\n/).find((l) => l.startsWith('data:'))
  if (linea === undefined) return null

  try {
    const datos: unknown = JSON.parse(linea.slice('data:'.length).trim())
    if (typeof datos !== 'object' || datos === null) return null

    const acta = (datos as { acta?: unknown }).acta
    if (typeof acta !== 'object' || acta === null) return null

    const { id, title } = acta as { id?: unknown, title?: unknown }
    if (typeof id !== 'number' || typeof title !== 'string') return null

    return acta as Acta
  } catch {
    return null
  }
}
