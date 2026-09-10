'use client'

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { AreaTexto } from '@/componentes/formularios/Entrada'
import { Boton } from '@/componentes/formularios/Boton'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { CargandoConOrbe, Orbe } from '@/componentes/estado/Orbe'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { pedirSobre } from '@/datos/cliente'
import { leerSSE } from '@/datos/sse'
import { leerEventoIA, type AccionIA, type Cita, type PasoIA, type PreguntaIA } from '@/dominio/ia'
import {
  conAccionResuelta,
  guardarHilo,
  hrefDeCita,
  LARGO_MAXIMO_PREGUNTA,
  leerHilo,
  leerMensajesGuardados,
  partirConCitas,
  respuestaAPreguntas,
  type FaseMensaje,
  type Mensaje
} from '@/dominio/ia-chat'
import { pantallaDeRuta } from '@/dominio/pantalla'
import { TarjetaPreguntaIA } from './TarjetaPreguntaIA'
import { TarjetaPropuestaIA } from './TarjetaPropuestaIA'
import { ASISTENTE, GLOSARIO } from '@/dominio/glosario'

/**
 * El chat de WiBot: se le pregunta por el estado de Ops y contesta citando.
 *
 * **Responde, cita, navega y —con las escrituras encendidas— propone o pregunta.** Preguntar es lo
 * que hace cuando le falta un dato que cambia el efecto de la escritura: deja opciones, ese turno no
 * trae tarjeta para esa accion, y elegir una manda su etiqueta por el mismo camino que una pregunta
 * escrita a mano. No hay endpoint de respuesta. Proponer no es escribir: lo
 * que llega es una tarjeta con un id, y `TarjetaPropuestaIA` la confirma mandando SOLO ese id. Este
 * archivo no arma un cuerpo de escritura en ningun lado: el QUE vive congelado en el servidor desde
 * que se propuso.
 *
 * Con el interruptor de escrituras apagado no llega ningun `event: propuesta` ni ningun
 * `event: paso`, y esta pantalla es exactamente la de antes. No hace falta preguntar por el
 * interruptor: la ausencia de los eventos ES el interruptor.
 *
 * === POR QUE EL CHAT NO ES DE UN ESPACIO ===
 *
 * Vivia dentro de la ficha de un Espacio, como pestaña y como orbe, y el hilo era por Espacio. Ahora
 * lo monta el armazon del panel: hay uno solo, la conversacion es de la persona y sigue viva
 * mientras ella cambia de pantalla. Lo que reemplaza al Espacio de la ruta es `pantalla`: donde esta
 * parada quien pregunta, para que "esta tarea" signifique algo. Es la misma cadena que manda el
 * latido de presencia, y por eso las dos salen de `pantallaDeRuta()`.
 *
 * El hilo no vive aca sino en `dominio/ia-chat.ts`, porque cerrar el chat desmonta este componente
 * entero. Lo que si vive aca es el `AbortController` del stream en curso: al desmontar se aborta, y
 * lo que llego queda marcado `interrumpido`. Se aborta y no se deja correr porque un stream que
 * escribe cuando nadie mira igual quema tokens del proveedor.
 *
 * No monta `ModalTarea`: las pantallas que listan Tareas ya montan la suya, y dos modales sobre el
 * mismo `?tarea={id}` serian dos dialogos, dos peticiones del detalle y dos trampas de foco. Por eso
 * una cita a una Tarea es un salto al listado global, que la abre por id venga del Espacio que venga.
 */

/** Ruta del chat en el BFF. La misma para el GET del hilo, el POST de la pregunta y el DELETE. */
const RUTA = 'ia/chat'

/**
 * Preguntas de arranque del estado vacio.
 *
 * Enseñan el alcance mejor que un parrafo de instrucciones: las tres se contestan leyendo, ninguna
 * pide una accion. Rellenan el campo y no envian: la persona ve lo que va a preguntar antes de pagar
 * la llamada.
 */
const SUGERENCIAS = [
  `¿Qué ${GLOSARIO.proceso.plural.toLowerCase()} están atrasadas y de quién son?`,
  '¿Qué vence esta semana?',
  '¿Qué se movió en la última semana?'
]

/** Lo que se dice cuando el fallo no trae mensaje propio. */
const MENSAJE_GENERICO = 'No se pudo completar la respuesta.'

/**
 * El chat en si, sin envase: lo monta el orbe flotante del armazon.
 *
 * @param desplazable en el orbe el alto esta acotado, asi que la conversacion scrollea sola y el
 *   campo queda fijo abajo. Sin esto scrollea lo que lo contenga.
 */
export function ChatWiBot ({ desplazable = false }: { desplazable?: boolean } = {}): ReactElement {
  const router = useRouter()
  const ruta = usePathname()
  const [mensajes, setMensajes] = useState<Mensaje[]>(() => leerHilo().mensajes)
  const [carga, setCarga] = useState<'cargando' | 'listo' | 'error'>(
    () => leerHilo().cargado ? 'listo' : 'cargando'
  )
  const [errorCarga, setErrorCarga] = useState('')
  const [errorRespuesta, setErrorRespuesta] = useState('')
  const [destino, setDestino] = useState('')
  const [pregunta, setPregunta] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [intento, setIntento] = useState(0)
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const enCurso = useRef<AbortController | null>(null)
  const desplazador = useRef<HTMLDivElement>(null)

  /** Escribe el hilo en el store de modulo y en el estado local a la vez: una sola fuente. */
  const escribir = useCallback((siguientes: Mensaje[]) => {
    guardarHilo({ mensajes: siguientes, cargado: true })
    setMensajes(siguientes)
  }, [])

  // El hilo guardado se pide UNA vez y no cada vez que se abre el chat: repetir el GET pisaria lo
  // que hay en memoria, incluida una respuesta interrumpida que el servidor no guardo.
  useEffect(() => {
    if (leerHilo().cargado) return

    const abortador = new AbortController()

    void pedirSobre<unknown>(RUTA, abortador.signal)
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
  }, [intento, escribir])

  // Al desmontar —cerrar el chat— se corta el stream en curso.
  useEffect(() => {
    return () => { enCurso.current?.abort() }
  }, [])

  // Solo en el orbe: el alto esta acotado, asi que sin esto la respuesta crece fuera de la vista y
  // hay que perseguirla con la rueda. Sin acotar scrollea la pagina y moverla seria arrebatarle el
  // scroll a quien esta leyendo mas arriba.
  useEffect(() => {
    if (!desplazable) return

    const caja = desplazador.current
    if (caja === null) return

    caja.scrollTop = caja.scrollHeight
  }, [desplazable, mensajes])

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
    setDestino('')

    let acumulado = ''
    let citas: Cita[] = []
    let paso: PasoIA | null = null
    let acciones: AccionIA[] = []
    let preguntas: PreguntaIA[] = []
    let fallo = false

    /** Repinta la burbuja de la IA con lo que se lleva acumulado. */
    const pintar = (fase: FaseMensaje): void => {
      escribir([...previos, { rol: 'ia', texto: acumulado, citas, paso, acciones, preguntas, fase }])
    }

    pintar('generando')

    try {
      // `pantalla` es lo que le dice al servidor donde esta parada la persona, para que "esta tarea"
      // se pueda resolver. Si el pathname no pasa la validacion no viaja a medias: se pregunta sin
      // pantalla y el servidor responde sin ese contexto.
      const pantalla = pantallaDeRuta(ruta)
      const cuerpo = pantalla === null ? { pregunta: texto } : { pregunta: texto, pantalla }

      for await (const crudo of leerSSE(RUTA, { cuerpo, senal: abortador.signal })) {
        const evento = leerEventoIA(crudo)

        // Un evento que este parser no conoce vuelve como `null` y se saltea: es lo que hace que
        // un backend mas nuevo no rompa esta pantalla, y al reves.
        if (evento === null || evento.tipo === 'fin') continue
        if (evento.tipo === 'delta') acumulado += evento.texto
        if (evento.tipo === 'citas') citas = evento.citas
        // La fase `fin` de un paso no se limpia: dejar el ultimo puesto evita el parpadeo entre una
        // herramienta y la siguiente, y el paso entero desaparece cuando la burbuja deja de generar.
        if (evento.tipo === 'paso') paso = evento.paso
        if (evento.tipo === 'propuesta') acciones = [...acciones, evento.accion]
        if (evento.tipo === 'pregunta') preguntas = [...preguntas, evento.pregunta]
        if (evento.tipo === 'navegar') {
          // El `href` ya lo valido `leerEventoIA()` como ruta interna; aca no se toca. Se dice a
          // donde se fue porque la pantalla cambia sola debajo de quien esta leyendo.
          setDestino(evento.etiqueta)
          router.push(evento.href)
        }
        if (evento.tipo === 'error') {
          setErrorRespuesta(evento.mensaje)
          fallo = true
          break
        }

        pintar('generando')
      }

      pintar(fallo ? 'error' : 'listo')
    } catch (error: unknown) {
      // Abortado es lo que pasa al cerrar el chat: no es un fallo y lo que llego se conserva.
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

  /**
   * Borra el hilo entero, en el servidor y en memoria.
   *
   * Es un borron de verdad y no un "ocultar": el contexto que el modelo recibe en la proxima
   * pregunta es el hilo guardado, asi que limpiarlo solo en pantalla dejaria a la IA respondiendo
   * sobre una conversacion que la persona ya no ve. Por eso pega el `DELETE` primero y solo vacia
   * la pantalla si el servidor confirmo.
   *
   * El hilo es de la persona: la ruta no lleva a quien, lo pone la sesion.
   */
  async function borrar (): Promise<void> {
    setBorrando(true)

    const resultado = await escribirEnBff(RUTA, 'DELETE')

    setBorrando(false)

    if (!resultado.ok) {
      setErrorRespuesta(resultado.mensaje)

      return
    }

    setConfirmandoBorrado(false)
    setErrorRespuesta('')
    escribir([])
  }

  /**
   * Manda un texto como mensaje de la persona.
   *
   * Es el unico camino que existe, y por eso lo comparten el campo de abajo y las tarjetas de
   * pregunta: contestar una pregunta ES mandar el mensaje siguiente, no una operacion aparte. Si
   * cada uno tuviera el suyo, el hilo terminaria con dos formas de crecer y una sola probada.
   *
   * @param texto lo que se manda, ya recortado
   */
  function enviarTexto (texto: string): void {
    if (texto === '' || enviando) return

    void preguntar(texto, [
      ...mensajes,
      { rol: 'persona', texto, citas: [], paso: null, acciones: [], preguntas: [], fase: 'listo' }
    ])
  }

  /** Manda lo que hay escrito en el campo como pregunta nueva. */
  function enviar (): void {
    const texto = pregunta.trim()

    if (texto === '' || enviando) return

    setPregunta('')
    enviarTexto(texto)
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

  const conversacion = (
    <>
      {mensajes.length === 0
        ? (
          <Vacio
            titulo={`Pregúntale a ${ASISTENTE}`}
            descripcion="Responde con lo que hay cargado en Ops y cita de dónde lo sacó."
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
                    error={errorRespuesta}
                    respuesta={respuestaAPreguntas(mensajes, indice)}
                    onReintentar={() => reintentar(indice)}
                    onResponder={enviarTexto}
                    onAccionResuelta={(accion) => { escribir(conAccionResuelta(mensajes, accion)) }}
                  />
                  )
            ))}
          </ol>
          )}
    </>
  )

  return (
    <div className={desplazable ? 'flex min-h-0 flex-1 flex-col gap-4' : 'flex flex-col gap-4'}>
      {/* Fuera del desplazador: en el orbe, un boton que se va con el scroll no se encuentra cuando
          la conversacion es larga, que es justo cuando se quiere borrar. */}
      {mensajes.length > 0 && (
        <div className="flex flex-col items-end gap-1">
          {confirmandoBorrado && (
            <p className="text-texto-sutil text-xs">
              Se borra la conversación entera, también la que {ASISTENTE} recuerda.
            </p>
          )}

          <div className="flex items-center gap-2">
            {confirmandoBorrado
              ? (
                <>
                  <Boton tamano="chico" variante="sutil" onClick={() => { setConfirmandoBorrado(false) }}>
                    Cancelar
                  </Boton>
                  <Boton tamano="chico" variante="peligro" cargando={borrando} onClick={() => { void borrar() }}>
                    Borrar
                  </Boton>
                </>
                )
              : (
                <Boton
                  tamano="chico"
                  variante="sutil"
                  disabled={enviando}
                  onClick={() => { setConfirmandoBorrado(true) }}
                >
                  Borrar chat
                </Boton>
                )}
          </div>
        </div>
      )}

      {desplazable
        ? <div ref={desplazador} className="min-h-0 flex-1 overflow-y-auto pr-1">{conversacion}</div>
        : conversacion}

      {/* La pantalla de atras cambio sola: quien estaba leyendo el chat tiene que enterarse de que
          lo que hay detras ya no es lo que estaba mirando. */}
      {destino !== '' && (
        <p role="status" className="text-texto-tenue text-xs">Te llevé a {destino}.</p>
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
          placeholder="Pregunta lo que necesites…"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Siempre visible, tambien con el hilo lleno: es el limite de la funcion, no un aviso de
              bienvenida que se lee una vez. La frase vale en los dos estados del interruptor: con
              las escrituras apagadas no cambia nada nunca, y con ellas encendidas no cambia nada
              hasta que alguien aprieta Confirmar. */}
          <p className="text-texto-sutil text-xs">
            Responde con lo que hay cargado en Ops. No cambia nada sin que lo confirmes.
          </p>
          <Boton type="submit" variante="primario" disabled={pregunta.trim() === '' || enviando}>
            Preguntar
          </Boton>
        </div>
      </form>
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
 * Una cita sin destino —`hrefDeCita()` devuelve `null`— se pinta igual, pero sin enlace: el numero y
 * el titulo siguen diciendo de donde salio la frase, y un enlace al lugar equivocado seria peor.
 *
 * @param mensaje el mensaje a pintar, con su fase
 * @param error mensaje del fallo, cuando la fase es `error`
 * @param respuesta lo que la persona ya contesto a las preguntas de este mensaje, o `null`
 * @param onReintentar vuelve a mandar la misma pregunta
 * @param onResponder manda una respuesta a una pregunta como mensaje de la persona
 * @param onAccionResuelta recibe la propuesta ya resuelta por el servidor
 */
function BurbujaIA ({
  mensaje,
  error,
  respuesta,
  onReintentar,
  onResponder,
  onAccionResuelta
}: {
  mensaje: Mensaje
  error: string
  respuesta: string | null
  onReintentar: () => void
  onResponder: (texto: string) => void
  onAccionResuelta: (accion: AccionIA) => void
}): ReactElement {
  const esperando = mensaje.fase === 'generando' && mensaje.texto === ''

  // El indicador sale de lo que el servidor mando en `event: paso`. Sin paso —backend viejo,
  // escrituras apagadas, o el modelo que no consulto nada— se queda con el texto fijo de siempre.
  const indicador = mensaje.fase === 'generando' && mensaje.paso !== null
    ? { mensaje: mensaje.paso.etiqueta, estado: mensaje.paso.orbe }
    : { mensaje: 'Buscando en Ops…', estado: 'thinking' as const }

  return (
    <li className="border-linea bg-superficie-hundida rounded-tarjeta flex flex-col gap-2 border p-3">
      {esperando
        ? <CargandoConOrbe mensaje={indicador.mensaje} estado={indicador.estado} retardoMs={0} />
        : (
          <p className="text-texto whitespace-pre-wrap text-sm">
            {partirConCitas(mensaje.texto, mensaje.citas).map((tramo, indice) => (
              'cita' in tramo
                ? <Marcador key={indice} cita={tramo.cita} numero={mensaje.citas.indexOf(tramo.cita) + 1} />
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
                <Fuente cita={cita} numero={indice + 1} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {mensaje.acciones.length > 0 && (
        <ul aria-label="Acciones propuestas" className="flex flex-col gap-2">
          {mensaje.acciones.map((accion) => (
            <li key={accion.id}>
              <TarjetaPropuestaIA accion={accion} onResuelta={onAccionResuelta} />
            </li>
          ))}
        </ul>
      )}

      {mensaje.preguntas.length > 0 && (
        <ul aria-label={`Preguntas de ${ASISTENTE}`} className="flex flex-col gap-2">
          {mensaje.preguntas.map((pregunta, indice) => (
            <li key={indice}>
              <TarjetaPreguntaIA pregunta={pregunta} respuesta={respuesta} onResponder={onResponder} />
            </li>
          ))}
        </ul>
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

/** El superindice en medio de la frase: enlace si la cita tiene destino, texto si no. */
function Marcador ({ cita, numero }: { cita: Cita, numero: number }): ReactElement {
  const href = hrefDeCita(cita)
  const superindice = <sup className="font-semibold">[{numero}]</sup>

  if (href === null) return <span className="text-texto-sutil">{superindice}</span>

  return (
    <Link href={href} aria-label={`Ver ${cita.titulo}`} className="text-acento hover:underline">
      {superindice}
    </Link>
  )
}

/** Una fuente del pie: la misma regla que el marcador, con el titulo al lado del numero. */
function Fuente ({ cita, numero }: { cita: Cita, numero: number }): ReactElement {
  const href = hrefDeCita(cita)
  const clases = 'border-linea bg-superficie text-texto-tenue rounded-control inline-flex items-center gap-1 border px-2 py-0.5 text-xs'
  const contenido = (
    <>
      <span className="text-texto-sutil">[{numero}]</span>
      {cita.titulo}
    </>
  )

  if (href === null) return <span className={clases}>{contenido}</span>

  return <Link href={href} className={`${clases} hover:bg-hover hover:text-texto`}>{contenido}</Link>
}
