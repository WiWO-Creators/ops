'use client'

import { Suspense, useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AreaTexto } from '@/componentes/formularios/Entrada'
import { Boton } from '@/componentes/formularios/Boton'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { CargandoConOrbe, Orbe } from '@/componentes/estado/Orbe'
import { pedirSobre } from '@/datos/cliente'
import { leerSSE } from '@/datos/sse'
import { leerEventoIA, type Cita } from '@/dominio/ia'
import {
  guardarHilo,
  hrefDeCita,
  LARGO_MAXIMO_PREGUNTA,
  leerHilo,
  leerMensajesGuardados,
  partirConCitas,
  type FaseMensaje,
  type Mensaje
} from '@/dominio/ia-chat'
import { GLOSARIO } from '@/dominio/glosario'
import { ModalTarea } from './ModalTarea'

/**
 * Pestaña de IA de un Proyecto: se le pregunta por el estado y contesta citando.
 *
 * **Solo responde y cita.** No propone acciones y no escribe nada, y esa garantia no la da el prompt:
 * la da que este archivo no importa una sola funcion de escritura. El unico `POST` que hace es el de
 * la pregunta.
 *
 * Es una pestaña y no un cajon a proposito. El cajon es modal —Radix pone `inert` lo de atras—, asi
 * que la supuesta ventaja de "seguir viendo el Proyecto" es falsa, y una cita a una Tarea abriria un
 * `Dialog` sobre otro `Dialog` con el foco peleando. La pestaña, en cambio, no cuesta nada hasta que
 * se abre (`Pestanas` monta solo la activa), viaja en la URL —un hilo se comparte por enlace— y deja
 * que `?tarea={id}` abra el modal **encima**, sin conflicto.
 *
 * El hilo no vive aca sino en `dominio/ia-chat.ts`, porque cambiar de pestaña desmonta este
 * componente entero. Lo que si vive aca es el `AbortController` del stream en curso: al desmontar se
 * aborta, y lo que llego queda marcado `interrumpido`. Se aborta y no se deja correr porque un
 * stream que escribe cuando nadie mira igual quema tokens del proveedor.
 */

/** Ruta del chat en el BFF. La misma para el GET del hilo y el POST de la pregunta. */
const ruta = (proyectoId: number): string => `ia/proyectos/${encodeURIComponent(String(proyectoId))}/chat`

/**
 * Preguntas de arranque del estado vacio.
 *
 * Enseñan el alcance mejor que un parrafo de instrucciones: las tres se contestan leyendo, ninguna
 * pide una accion. Rellenan el campo y no envian: la persona ve lo que va a preguntar antes de pagar
 * la llamada.
 */
const SUGERENCIAS = [
  `¿Qué ${GLOSARIO.proceso.plural.toLowerCase()} están atrasadas y de quién son?`,
  `¿Cómo viene el ${GLOSARIO.hito.singular.toLowerCase()} más próximo?`,
  '¿Qué se movió en la última semana?'
]

/** Lo que se dice cuando el fallo no trae mensaje propio. */
const MENSAJE_GENERICO = 'No se pudo completar la respuesta.'

export function PanelChatIA ({ proyectoId }: { proyectoId: number }): ReactElement {
  // Lee `useSearchParams`: sin este limite de Suspense el build de la pagina falla.
  return (
    <Suspense fallback={<Cargando mensaje="Cargando el chat…" />}>
      <ChatDelProyecto proyectoId={proyectoId} />
    </Suspense>
  )
}

function ChatDelProyecto ({ proyectoId }: { proyectoId: number }): ReactElement {
  const params = useSearchParams()
  const [mensajes, setMensajes] = useState<Mensaje[]>(() => leerHilo(proyectoId).mensajes)
  const [carga, setCarga] = useState<'cargando' | 'listo' | 'error'>(
    () => leerHilo(proyectoId).cargado ? 'listo' : 'cargando'
  )
  const [errorCarga, setErrorCarga] = useState('')
  const [errorRespuesta, setErrorRespuesta] = useState('')
  const [pregunta, setPregunta] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [intento, setIntento] = useState(0)
  const enCurso = useRef<AbortController | null>(null)

  /** Escribe el hilo en el store de modulo y en el estado local a la vez: una sola fuente. */
  const escribir = useCallback((siguientes: Mensaje[]) => {
    guardarHilo(proyectoId, { mensajes: siguientes, cargado: true })
    setMensajes(siguientes)
  }, [proyectoId])

  // El hilo guardado se pide UNA vez por Proyecto y no en cada vuelta a la pestaña: repetir el GET
  // pisaria lo que hay en memoria, incluida una respuesta interrumpida que el servidor no guardo.
  useEffect(() => {
    if (leerHilo(proyectoId).cargado) return

    const abortador = new AbortController()

    void pedirSobre<unknown>(ruta(proyectoId), abortador.signal)
      .then((sobre) => {
        if (abortador.signal.aborted) return

        escribir(leerMensajesGuardados(sobre.data))
        setCarga('listo')
      })
      .catch((fallo: unknown) => {
        if (abortador.signal.aborted) return

        setErrorCarga(fallo instanceof Error ? fallo.message : 'No se pudo leer el hilo.')
        setCarga('error')
      })

    return () => { abortador.abort() }
  }, [proyectoId, intento, escribir])

  // Al desmontar —cambiar de pestaña, salir del Proyecto— se corta el stream en curso.
  useEffect(() => {
    return () => { enCurso.current?.abort() }
  }, [])

  /**
   * Manda la pregunta y va escribiendo la respuesta en el hilo.
   *
   * @param texto la pregunta, ya recortada
   * @param previos el hilo sobre el que se apoya la respuesta, con la burbuja de la persona incluida
   */
  async function preguntar (texto: string, previos: Mensaje[]): Promise<void> {
    const abortador = new AbortController()

    enCurso.current = abortador
    setEnviando(true)
    setErrorRespuesta('')

    let acumulado = ''
    let citas: Cita[] = []
    let fallo = false

    /** Repinta la burbuja de la IA con lo que se lleva acumulado. */
    const pintar = (fase: FaseMensaje): void => {
      escribir([...previos, { rol: 'ia', texto: acumulado, citas, fase }])
    }

    pintar('generando')

    try {
      const opciones = { cuerpo: { pregunta: texto }, senal: abortador.signal }

      for await (const crudo of leerSSE(ruta(proyectoId), opciones)) {
        const evento = leerEventoIA(crudo)

        if (evento === null || evento.tipo === 'fin') continue
        if (evento.tipo === 'delta') acumulado += evento.texto
        if (evento.tipo === 'citas') citas = evento.citas
        if (evento.tipo === 'error') {
          setErrorRespuesta(evento.mensaje)
          fallo = true
          break
        }

        pintar('generando')
      }

      pintar(fallo ? 'error' : 'listo')
    } catch (error: unknown) {
      // Abortado es lo que pasa al cambiar de pestaña: no es un fallo y lo que llego se conserva.
      if (abortador.signal.aborted) {
        pintar('interrumpido')
      } else {
        setErrorRespuesta(error instanceof Error ? error.message : MENSAJE_GENERICO)
        pintar('error')
      }
    } finally {
      enCurso.current = null
      setEnviando(false)
    }
  }

  /** Manda lo que hay escrito en el campo como pregunta nueva. */
  function enviar (): void {
    const texto = pregunta.trim()

    if (texto === '' || enviando) return

    setPregunta('')
    void preguntar(texto, [...mensajes, { rol: 'persona', texto, citas: [], fase: 'listo' }])
  }

  /**
   * Vuelve a preguntar lo mismo, reemplazando la respuesta que fallo o quedo a medias.
   *
   * @param indice posicion de la burbuja de la IA a rehacer; la pregunta es la burbuja anterior
   */
  function reintentar (indice: number): void {
    const previa = mensajes[indice - 1]

    if (previa === undefined || enviando) return

    void preguntar(previa.texto, mensajes.slice(0, indice))
  }

  if (carga === 'cargando') return <Cargando mensaje="Cargando el chat…" />
  if (carga === 'error') {
    return <ErrorEstado detalle={errorCarga} onReintentar={() => { setCarga('cargando'); setIntento((n) => n + 1) }} />
  }

  return (
    <div className="flex flex-col gap-4">
      {mensajes.length === 0
        ? (
          <Vacio
            titulo={`Preguntá por el estado de este ${GLOSARIO.espacio.singular}`}
            descripcion="Responde con lo que hay cargado y cita de donde lo sacó."
            accion={
              <div className="flex flex-wrap justify-center gap-2">
                {SUGERENCIAS.map((sugerencia) => (
                  <Boton key={sugerencia} tamano="chico" onClick={() => setPregunta(sugerencia)}>
                    {sugerencia}
                  </Boton>
                ))}
              </div>
            }
          />
          )
        : (
          <ol aria-label="Conversación" className="flex flex-col gap-4">
            {mensajes.map((mensaje, indice) => (
              mensaje.rol === 'persona'
                ? <BurbujaPersona key={indice} texto={mensaje.texto} />
                : (
                  <BurbujaIA
                    key={indice}
                    mensaje={mensaje}
                    params={params}
                    error={errorRespuesta}
                    onReintentar={() => reintentar(indice)}
                  />
                  )
            ))}
          </ol>
          )}

      <form
        className="flex flex-col gap-2"
        onSubmit={(evento) => { evento.preventDefault(); enviar() }}
      >
        <AreaTexto
          value={pregunta}
          onChange={(evento) => setPregunta(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key !== 'Enter' || evento.shiftKey || evento.nativeEvent.isComposing) return

            evento.preventDefault()
            enviar()
          }}
          maxLength={LARGO_MAXIMO_PREGUNTA}
          disabled={enviando}
          aria-label="Tu pregunta"
          placeholder={`Preguntá por el estado de este ${GLOSARIO.espacio.singular}…`}
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Siempre visible, tambien con el hilo lleno: es el limite de la funcion, no un aviso de
              bienvenida que se lee una vez. */}
          <p className="text-texto-sutil text-xs">
            Responde sobre el estado de este {GLOSARIO.espacio.singular}. No crea ni cambia nada.
          </p>
          <Boton type="submit" variante="primario" disabled={pregunta.trim() === '' || enviando}>
            Preguntar
          </Boton>
        </div>
      </form>

      {/* Una cita a una Tarea abre este modal ENCIMA de la pestaña; cerrarlo deja la vista en el chat. */}
      <ModalTarea />
    </div>
  )
}

/** La burbuja de la persona: alineada a la derecha, sin citas y sin estados. */
function BurbujaPersona ({ texto }: { texto: string }): ReactElement {
  return (
    <li className="flex justify-end">
      <p className="bg-relleno-neutro text-relleno-neutro-contenido rounded-tarjeta max-w-[85%] whitespace-pre-wrap px-3 py-2 text-sm">
        {texto}
      </p>
    </li>
  )
}

/**
 * La burbuja de la IA: el texto con sus citas en linea, las fuentes al pie y el estado del stream.
 *
 * Las citas se pintan **de dos formas a la vez** a proposito: el superindice deja leer de corrido sin
 * cortar la frase, y la lista de fuentes deja escanear de donde salio todo sin releer el parrafo.
 *
 * @param mensaje el mensaje a pintar, con su fase
 * @param params los parametros vigentes de la URL, para que las citas conserven la vista
 * @param error mensaje del fallo, cuando la fase es `error`
 * @param onReintentar vuelve a mandar la misma pregunta
 */
function BurbujaIA ({
  mensaje,
  params,
  error,
  onReintentar
}: {
  mensaje: Mensaje
  params: URLSearchParams
  error: string
  onReintentar: () => void
}): ReactElement {
  const esperando = mensaje.fase === 'generando' && mensaje.texto === ''

  return (
    <li className="border-linea bg-superficie-hundida rounded-tarjeta flex flex-col gap-2 border p-3">
      {esperando
        ? <CargandoConOrbe mensaje={`Leyendo el ${GLOSARIO.espacio.singular}…`} estado="thinking" retardoMs={0} />
        : (
          <p className="text-texto whitespace-pre-wrap text-sm">
            {partirConCitas(mensaje.texto, mensaje.citas).map((tramo, indice) => (
              'cita' in tramo
                ? (
                  <Link
                    key={indice}
                    href={hrefDeCita(tramo.cita, params)}
                    aria-label={`Ver ${tramo.cita.titulo}`}
                    className="text-acento hover:underline"
                  >
                    <sup className="font-semibold">[{mensaje.citas.indexOf(tramo.cita) + 1}]</sup>
                  </Link>
                  )
                : <span key={indice}>{tramo.texto}</span>
            ))}
            {mensaje.fase === 'generando' && (
              // El cursor es el orbe en `generating`, que es el estado que el sistema de diseño creo
              // para "sale contenido hacia la interfaz". Evita el caret parpadeante, que seria una
              // animacion infinita fuera de `estado/`.
              <Orbe medida="1rem" estado="generating" className="ml-1 inline-block align-text-bottom" />
            )}
          </p>
          )}

      {mensaje.fase === 'generando' && (
        // El texto NO va en una region viva: un `aria-live` que cambia con cada delta es tortura para
        // un lector de pantalla. Se anuncia que hay algo en curso y el texto se lee al terminar.
        <span role="status" className="sr-only">Generando la respuesta…</span>
      )}

      {mensaje.citas.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-texto-sutil text-xs font-medium">Fuentes</p>
          <ul className="flex flex-wrap gap-1.5">
            {mensaje.citas.map((cita, indice) => (
              <li key={indice}>
                <Link
                  href={hrefDeCita(cita, params)}
                  className="border-linea bg-superficie text-texto-tenue rounded-control hover:bg-hover hover:text-texto inline-flex items-center gap-1 border px-2 py-0.5 text-xs"
                >
                  <span className="text-texto-sutil">[{indice + 1}]</span>
                  {cita.titulo}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mensaje.fase === 'error' && (
        <p role="alert" className="text-texto-peligro flex flex-wrap items-center gap-2 text-xs">
          <Orbe medida="1rem" estado="error" className="inline-block align-text-bottom" />
          {error === '' ? MENSAJE_GENERICO : error}
          <button type="button" onClick={onReintentar} className="text-acento font-semibold underline underline-offset-4">
            Reintentar
          </button>
        </p>
      )}

      {mensaje.fase === 'interrumpido' && (
        <p className="text-texto-tenue flex flex-wrap items-center gap-2 text-xs">
          Respuesta interrumpida.
          <button type="button" onClick={onReintentar} className="text-acento font-semibold underline underline-offset-4">
            Volver a preguntar
          </button>
        </p>
      )}
    </li>
  )
}
