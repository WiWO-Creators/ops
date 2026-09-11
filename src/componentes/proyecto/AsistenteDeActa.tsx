'use client'

import { useEffect, useId, useRef, useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Orbe } from '@/componentes/estado/Orbe'
import { pedirSobre } from '@/datos/cliente'
import { leerSSE } from '@/datos/sse'
import { leerEventoIA } from '@/dominio/ia'
import { validarArchivo } from '@/dominio/actas'
import { cn } from '@/lib/clases'
import { aTextoPlano } from './formatos'
import { DatosDelActa, resumenDeDatos, type DatosDeActa } from './acta/DatosDelActa'
import { FuenteDelActa } from './acta/FuenteDelActa'
import { Paso } from './acta/Paso'
import type { Acta, PrefillActa } from '@/datos/recursos'
import type { PasoIA } from '@/dominio/ia'
import type { ModoEntrada } from '@/dominio/actas'

/**
 * Asistente de creación de un Meeting Paper.
 *
 * === LA PANTALLA SON DOS PASOS, Y UNO ES OPCIONAL ===
 *
 * Tenía cinco modos de entrada, seis campos y el bloque de generación a la vista al mismo tiempo y
 * con el mismo peso, así que no contestaba "¿qué hago primero?". Lo que la ordena no es estética: de
 * todo eso lo único que el asistente exige es el MATERIAL —`listoParaGenerar` mira el archivo y el
 * texto, nada más—, y tres de los seis campos llegan rellenados desde el propio Proyecto.
 *
 * Así que el paso 1 pide el material —se elige el modo y solo aparece el control de ese modo— y el
 * paso 2 son los datos de cabecera, plegados bajo un resumen de lo que ya traen. Ninguna función se
 * fue: los cinco modos, los seis campos, el stream y el orbe siguen estando, a un clic de distancia
 * en vez de todos encima.
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

/** Recipiente de los dos pasos y del bloque de generación: una sola tarjeta, sin tarjetas adentro. */
const TARJETA = 'border-linea bg-superficie-elevada rounded-tarjeta border p-4 sm:p-5'

/**
 * Qué falta para poder generar, según el modo elegido.
 *
 * Enumerar las cinco alternativas —"hace falta un audio, una imagen, un documento o los apuntes"—
 * obligaba a releer la lista entera para encontrar la que aplica. Con el modo ya elegido, la frase
 * habla de una sola cosa.
 */
const FALTA: Record<ModoEntrada, string> = {
  texto: 'Pega los apuntes de la reunión para poder escribirla.',
  grabar: 'Graba la reunión para poder escribirla.',
  audio: 'Elige el archivo de audio de la reunión.',
  imagen: 'Elige la foto de la pizarra o del cuaderno.',
  documento: 'Elige el Meeting Paper ya redactado.'
}

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

  const [datos, setDatos] = useState<DatosDeActa>({
    cliente: '',
    fecha: '',
    lugar: '',
    modalidad: '',
    marca: 'wiwo',
    asistentes: ''
  })
  const [datosALaVista, setDatosALaVista] = useState(false)
  const idDatos = useId()

  const [fase, setFase] = useState<'entrada' | 'generando' | 'error'>('entrada')
  // Lo que el servidor dice que está haciendo antes de escribir. Transcribir una reunión de una
  // hora son varios minutos sin un solo `delta`, y sin esto la pantalla no dice nada en todo ese
  // rato: la persona no puede distinguir "está escuchando" de "se colgó".
  const [paso, setPaso] = useState<PasoIA | null>(null)
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
        setDatos((previos) => ({
          ...previos,
          cliente: sobre.data.client,
          fecha: sobre.data.meeting_date,
          asistentes: sobre.data.attendees.join('\n')
        }))
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
    setPaso(null)
    setAvance('')
    setError(null)
    setSegundos(0)

    const cuerpo = new FormData()
    if (archivo !== null) cuerpo.append('file', archivo)
    if (texto.trim() !== '') cuerpo.append('texto', texto.trim())
    cuerpo.append('cliente', datos.cliente)
    cuerpo.append('fecha', datos.fecha)
    cuerpo.append('lugar', datos.lugar)
    cuerpo.append('modalidad', datos.modalidad)
    cuerpo.append('marca', datos.marca)
    cuerpo.append('asistentes', datos.asistentes)

    let acumulado = ''

    try {
      for await (const crudo of leerSSE(`ia/proyectos/${proyectoId}/acta`, { cuerpo, senal: control.signal })) {
        const evento = leerEventoIA(crudo)
        if (evento === null) continue

        if (evento.tipo === 'delta') {
          acumulado += evento.texto
          setAvance(acumulado)
        }

        // El paso se limpia cuando termina: a partir del primer `delta` lo que se ve es el texto.
        if (evento.tipo === 'paso') {
          setPaso(evento.paso.fase === 'fin' ? null : evento.paso)
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
      <div className={cn(TARJETA, 'flex flex-col gap-4')}>
        <div className="flex items-start gap-3">
          <Orbe medida="2.5rem" estado={paso?.orbe ?? 'generating'} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-texto text-sm font-semibold">
              {paso?.etiqueta ?? (modo === 'documento'
                ? 'Leyendo el Meeting Paper y dejándolo en el formato del sistema…'
                : 'Escribiendo el Meeting Paper…')}
            </p>
            <p className="text-texto-sutil text-xs">
              {archivo === null || modo === 'documento'
                ? `Van ${segundos} s.`
                : `Van ${segundos} s. Escuchar una reunión larga puede tardar varios minutos.`}
            </p>
          </div>
        </div>

        {avance !== '' && (
          <p className="border-linea text-texto-tenue max-w-prose border-t pt-4 text-sm whitespace-pre-wrap">
            {aTextoPlano(avance)}
          </p>
        )}

        <span role="status" className="sr-only">Generando el Meeting Paper</span>

        <p className="text-texto-sutil text-xs">
          {modo === 'documento'
            ? 'El archivo no se guarda: lo que queda es este Meeting Paper. Puedes cambiar de pestaña, se guarda solo al terminar.'
            : 'Puedes cambiar de pestaña: el acta se guarda sola al terminar.'}
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

      <div className={cn(TARJETA, 'flex flex-col')}>
        <Paso numero={1} titulo="El material de la reunión" className="pb-5">
          <FuenteDelActa
            modo={modo}
            onModo={(siguiente) => {
              setModo(siguiente)
              elegirArchivo(null)
            }}
            texto={texto}
            onTexto={setTexto}
            archivo={archivo}
            errorArchivo={errorArchivo}
            onArchivo={elegirArchivo}
          />
        </Paso>

        <Paso
          numero={2}
          titulo="Datos del acta"
          insignia={<Insignia tono="contorno" tamano="chico">Opcional</Insignia>}
          resumen={resumenDeDatos(datos)}
          plegable={{
            abierto: datosALaVista,
            idPanel: idDatos,
            onAlternar: () => { setDatosALaVista((visible) => !visible) }
          }}
          /* `pt-6` y no `pt-5`: el encabezado plegable sube 1.5 por su propio margen negativo —el
             que agranda el área de clic—, así que el aire real sobre él queda igual al de abajo. */
          className="border-linea border-t pt-6"
        >
          <DatosDelActa
            valores={datos}
            onCambio={(parcial) => { setDatos((previos) => ({ ...previos, ...parcial })) }}
          />
        </Paso>
      </div>

      {error !== null && (
        <p role="alert" className="bg-superficie-peligro text-texto-peligro rounded-chico px-3 py-2 text-sm">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        {!listoParaGenerar && error === null && (
          <p className="text-texto-sutil text-xs sm:mr-auto">{FALTA[modo]}</p>
        )}

        <Boton
          variante="primario"
          onClick={() => { void generar() }}
          disabled={!listoParaGenerar}
          className="w-full sm:w-auto"
        >
          Escribir el Meeting Paper
        </Boton>
      </div>
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
