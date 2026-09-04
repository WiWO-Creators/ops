'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { mensajeDeRespuesta, pedirRespuesta } from '@/datos/cliente'
import { leerSSE } from '@/datos/sse'
import { leerEventoIA, type Regeneracion, type ResumenIA } from '@/dominio/ia'
import { crearCola, motivoDeBloqueo, type ColaDeEscritura } from '@/dominio/ia-resumen'
import type { Sobre } from '@/datos/tipos'
import { formatearFecha, formatearRelativo } from '@/lib/fechas'
import { Orbe } from '@/componentes/estado/Orbe'
import { Boton } from '@/componentes/formularios/Boton'

/**
 * Cada cuanto la cola suelta su proximo trozo. 16 ms es un cuadro a 60 Hz: mas rapido no se ve.
 */
const MS_TICK = 16

/**
 * Cuanto dura el destello de exito al cerrar el stream.
 *
 * Es el mismo gesto que usa el acceso (`colab/FormularioEntrar.tsx`): el orbe avisa que termino y se
 * apaga. Sostenerlo mas seria una animacion infinita disfrazada de confirmacion.
 */
const MS_EXITO = 1200

/** Lo que se dice mientras el modelo lee y todavia no escribio nada. */
const MENSAJE_PENSANDO = 'Leyendo tus proyectos y tus tareas…'

/** Lo que se dice cuando el proveedor no respondio. El detalle tecnico va en el `title`. */
const MENSAJE_ERROR = 'No se pudo generar el resumen ahora.'

/**
 * En que anda la tarjeta.
 *
 * `apagada` no es un estado de carga: es la respuesta a un `404`, que es lo que devuelve la API
 * cuando la capa de IA esta apagada. Ahi la tarjeta no se muestra rota, no se muestra.
 */
type Fase = 'cargando' | 'apagada' | 'reposo' | 'pensando' | 'escribiendo' | 'exito'

/** Como cerro el stream. Decide si al terminar de escribir hay destello de exito o no. */
type Cierre = 'fin' | 'error'

/**
 * El resumen del dia, escrito por la capa de IA.
 *
 * Es el unico componente cliente del Inicio, y lo es por una sola razon: **se tiene que ver como se
 * genera**. Un resumen que aparece entero no se distingue de un texto guardado, y la diferencia
 * importa —uno describe el presente y el otro puede tener horas—.
 *
 * La escritura no es una animacion de CSS: el texto avanza porque **esta llegando** por el stream.
 * Los `delta` del proveedor llegan en rafagas de largo irregular; pintarlos tal cual se ve como
 * tartamudeo. `crearCola()` los aplana en ~3 caracteres cada 16 ms y este componente los concatena.
 * El cursor es el Orbe en `generating`, que es el estado que el sistema de diseño creo para "sale
 * contenido hacia la interfaz" y evita el caret parpadeante que el guardrail prohibe.
 *
 * **La regla de 2 por dia con 4 horas de espera no se calcula aca.** Llega resuelta en el bloque
 * `regeneracion` del backend y `motivoDeBloqueo()` solo la pone en palabras.
 */
export function ResumenDelDia () {
  const [texto, establecerTexto] = useState('')
  const [generadoEn, establecerGeneradoEn] = useState<string | null>(null)
  const [regeneracion, establecerRegeneracion] = useState<Regeneracion | null>(null)
  const [fase, establecerFase] = useState<Fase>('cargando')
  const [error, establecerError] = useState<string | null>(null)
  const [aMedias, establecerAMedias] = useState(false)

  const cola = useRef<ColaDeEscritura | null>(null)
  const intervalo = useRef<ReturnType<typeof setInterval> | null>(null)
  const temporizadorExito = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stream = useRef<AbortController | null>(null)

  /**
   * Abre `POST /ia/inicio` y va escribiendo lo que llega.
   *
   * Todo el mecanismo de la escritura vive adentro: la cola, el temporizador que la drena y el
   * cierre. Sacarlo al cuerpo del componente obligaria a envolver cinco funciones mas en
   * `useCallback` para que este no cambie en cada pintada, y el `setInterval` se reiniciaria solo.
   */
  const generar = useCallback(async (): Promise<void> => {
    stream.current?.abort()

    const control = new AbortController()
    // Con `reduce` la cola no dosifica nada y ademas no se drena hasta el final: `porTick: Infinity`
    // por si sola solo quita el goteo propio, y el texto igual creceria al ritmo del proveedor.
    const deUnaVez = prefiereMenosMovimiento()
    const buffer = crearCola(deUnaVez ? { porTick: Infinity } : {})

    stream.current = control
    cola.current = buffer

    let cierre: Cierre | null = null
    let escrito = false

    /** Frena el goteo y deja la tarjeta en su estado final. */
    function terminar (como: Cierre) {
      if (intervalo.current !== null) clearInterval(intervalo.current)
      intervalo.current = null

      // Sin escritura progresiva, todo lo acumulado se pinta aca de una sola vez.
      if (deUnaVez && escrito) establecerTexto(buffer.drenar())

      if (como === 'error') {
        establecerFase('reposo')
        return
      }

      establecerFase('exito')
      temporizadorExito.current = setTimeout(() => { establecerFase('reposo') }, MS_EXITO)
    }

    /** Marca el cierre; si ya no queda nada escribiendose, cierra en el acto. */
    function cerrar (como: Cierre) {
      cierre = como
      if (intervalo.current === null) terminar(como)
    }

    /** Arranca el goteo. Se llama con el primer `delta`, no antes: sin texto no hay nada que drenar. */
    function arrancar () {
      escrito = true

      // Con `reduce` no hay goteo ni cursor: la tarjeta se queda en "pensando" —con el texto viejo,
      // si lo habia— y el resumen aparece entero cuando el stream cierra.
      if (deUnaVez) return

      establecerTexto('')
      establecerFase('escribiendo')

      intervalo.current = setInterval(() => {
        const trozo = buffer.drenar()

        if (trozo !== '') establecerTexto((previo) => previo + trozo)
        if (buffer.terminada && cierre !== null) terminar(cierre)
      }, MS_TICK)
    }

    establecerError(null)
    establecerAMedias(false)
    establecerFase('pensando')

    try {
      for await (const crudo of leerSSE('ia/inicio', { senal: control.signal })) {
        const evento = leerEventoIA(crudo)

        if (evento === null) continue
        if (evento.tipo === 'delta') {
          if (!escrito) arrancar()
          buffer.empujar(evento.texto)
        }
        if (evento.tipo === 'fin') {
          establecerGeneradoEn(evento.generado_en)
          if (evento.regeneracion !== null) establecerRegeneracion(evento.regeneracion)
          cerrar('fin')
        }
        if (evento.tipo === 'error') {
          establecerError(evento.mensaje)
          establecerAMedias(escrito)
          cerrar('error')
        }
      }

      // El stream cerro sin `fin` ni `error`: lo que llego quedo incompleto y hay que decirlo.
      if (cierre === null) {
        establecerAMedias(escrito)
        cerrar('error')
      }
    } catch (fallo) {
      if (control.signal.aborted) return

      establecerError(fallo instanceof Error ? fallo.message : String(fallo))
      establecerAMedias(escrito)
      cerrar('error')
    }
  }, [])

  /**
   * Lee lo guardado con un `GET`, que nunca consume cuota.
   *
   * Si nunca se genero y hay cupo, genera al entrar: eso es lo que hace que el resumen se vea
   * escribirse la primera vez del dia. Si no hay cupo, se queda con lo que haya y el boton explica
   * por que no puede.
   */
  const cargarGuardado = useCallback(async (senal: AbortSignal, generarSiFalta: boolean): Promise<void> => {
    try {
      const respuesta = await pedirRespuesta('ia/inicio', senal)

      // La capa de IA apagada responde 404 en toda la familia `/ia/*`. No es un error que mostrar.
      if (respuesta.status === 404) {
        establecerFase('apagada')
        return
      }
      if (!respuesta.ok) throw new Error(await mensajeDeRespuesta(respuesta))

      const { data } = await respuesta.json() as Sobre<ResumenIA>

      establecerTexto(data.texto ?? '')
      establecerGeneradoEn(data.generado_en)
      establecerRegeneracion(data.regeneracion)
      establecerFase('reposo')

      if (generarSiFalta && data.texto === null && data.regeneracion.puede_ahora) await generar()
    } catch (fallo) {
      if (senal.aborted) return

      establecerFase('reposo')
      establecerError(fallo instanceof Error ? fallo.message : String(fallo))
    }
  }, [generar])

  useEffect(() => {
    const lectura = new AbortController()

    // La lectura va envuelta en una funcion propia porque `set-state-in-effect` no sigue los
    // `await` a traves del `useCallback` y lee la llamada directa como si pintara de inmediato.
    // Toda la escritura de estado ocurre despues de que el servidor conteste.
    async function cargar () { await cargarGuardado(lectura.signal, true) }

    void cargar()

    return () => {
      lectura.abort()
      stream.current?.abort()
      if (intervalo.current !== null) clearInterval(intervalo.current)
      if (temporizadorExito.current !== null) clearTimeout(temporizadorExito.current)
    }
  }, [cargarGuardado])

  // Cuando pasa la hora de espera, el boton se rehabilita sin recargar. Se vuelve a preguntar en vez
  // de dar por buena la espera aca: el veredicto es del backend, y de paso la frase deja de ser vieja.
  useEffect(() => {
    const desde = regeneracion?.puede_ahora === false ? regeneracion.disponible_desde : null

    if (desde === null) return

    const espera = Date.parse(desde) - Date.now()

    if (Number.isNaN(espera) || espera <= 0) return

    const control = new AbortController()
    const id = setTimeout(() => { void cargarGuardado(control.signal, false) }, espera)

    return () => {
      clearTimeout(id)
      control.abort()
    }
  }, [regeneracion, cargarGuardado])

  if (fase === 'apagada') return null

  const escribiendo = fase === 'pensando' || fase === 'escribiendo'
  const bloqueo = regeneracion === null ? null : motivoDeBloqueo(regeneracion)

  return (
    <section className="flex flex-col gap-3 rounded-tarjeta border border-linea bg-superficie-elevada p-5 shadow-1">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="font-titular text-titulo font-bold text-texto">Tu resumen de hoy</h2>

        <div className="flex flex-wrap items-center gap-3">
          {/* Un `disabled` mudo no dice nada: la frase que lo explica va al lado del boton, no en un
              `title` que solo aparece si alguien deja el puntero encima. */}
          {!escribiendo && bloqueo !== null && (
            <span className="text-sm text-texto-sutil">{bloqueo}</span>
          )}

          {fase === 'escribiendo'
            ? (
              <Boton variante="sutil" tamano="chico" onClick={() => cola.current?.saltar()}>
                Saltar
              </Boton>
              )
            : (
              <Boton
                variante="secundario"
                tamano="chico"
                onClick={() => { void generar() }}
                disabled={fase === 'pensando' || bloqueo !== null}
              >
                {texto === '' ? 'Generar' : 'Regenerar'}
              </Boton>
              )}
        </div>
      </div>

      {fase === 'cargando'
        ? <p className="text-sm text-texto-sutil">Buscando tu resumen…</p>
        : <Cuerpo texto={texto} escribiendo={escribiendo} fase={fase} />}

      {/*
        Un live region que cambia sesenta veces por segundo es tortura para un lector de pantalla:
        mientras se escribe anuncia el estado y nada mas, y el texto entra recien cuando termino.
        En reposo queda vacio para no repetir lo que ya se lee en el parrafo de arriba.
      */}
      <p role="status" aria-live="polite" className="sr-only">
        {escribiendo ? 'Generando el resumen…' : (fase === 'exito' ? texto : '')}
      </p>

      <Pie
        generadoEn={generadoEn}
        escribiendo={escribiendo}
        aMedias={aMedias}
        error={error}
        alReintentar={() => { void generar() }}
      />
    </section>
  )
}

interface PropsCuerpo {
  texto: string
  escribiendo: boolean
  fase: Fase
}

/**
 * El texto y, mientras escribe, el orbe que hace de cursor.
 *
 * El parrafo va `aria-hidden` mientras crece porque su contenido cambia por tercios de palabra; lo
 * que se anuncia es el live region hermano.
 *
 * En una regeneracion el texto viejo se queda hasta el primer `delta`: nunca hay caja vacia, que es
 * la unica forma de que la tarjeta no parpadee cada vez que alguien aprieta "Regenerar".
 */
function Cuerpo ({ texto, escribiendo, fase }: PropsCuerpo) {
  return (
    <>
      {texto === ''
        ? fase !== 'pensando' && (
          <p className="text-sm text-texto-tenue">Todavía no hay un resumen de hoy.</p>
          )
        : (
          <p aria-hidden={escribiendo || undefined} className="whitespace-pre-line text-sm leading-relaxed text-texto">
            {texto}
            {fase === 'escribiendo' && (
              <Orbe medida="1.1rem" estado="generating" className="ml-1 inline-flex align-middle" />
            )}
          </p>
          )}

      {fase === 'pensando' && (
        <p className="flex items-center gap-2 text-sm text-texto-tenue">
          <Orbe medida="1.1rem" estado="thinking" className="inline-flex shrink-0 align-middle" />
          {MENSAJE_PENSANDO}
        </p>
      )}
    </>
  )
}

interface PropsPie {
  generadoEn: string | null
  escribiendo: boolean
  aMedias: boolean
  error: string | null
  alReintentar: () => void
}

/**
 * La linea de abajo: cuando se genero, si quedo a medias y si fallo.
 *
 * El fallo **no** usa `ErrorEstado`: una caja roja entera por una comodidad opcional es
 * desproporcionado, y sobre todo taparia el resumen guardado, que sigue siendo util aunque el
 * proveedor no conteste. Va como una linea al pie, con el orbe en `error` y el boton para reintentar.
 */
function Pie ({ generadoEn, escribiendo, aMedias, error, alReintentar }: PropsPie) {
  if (escribiendo) return null
  if (generadoEn === null && !aMedias && error === null) return null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-texto-sutil">
      {generadoEn !== null && (
        <span title={formatearFecha(generadoEn, true)}>Generado {formatearRelativo(generadoEn)}</span>
      )}

      {aMedias && <span className="text-texto-aviso">Quedó a medias.</span>}

      {error !== null && (
        <>
          <span className="flex items-center gap-1.5 text-texto-peligro" title={error}>
            <Orbe medida="0.9rem" estado="error" className="inline-flex shrink-0 align-middle" />
            {MENSAJE_ERROR}
          </span>
          <Boton variante="sutil" tamano="chico" onClick={alReintentar}>Reintentar</Boton>
        </>
      )}
    </div>
  )
}

/**
 * Si quien mira pidio menos movimiento.
 *
 * Con `reduce` no hay escritura progresiva: el texto se acumula sin pintarse y aparece completo
 * cuando el stream cierra. Que crezca al ritmo del proveedor sigue siendo movimiento, aunque no sea
 * una animacion de CSS.
 *
 * @returns `true` si el sistema declara `prefers-reduced-motion: reduce`
 */
function prefiereMenosMovimiento (): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
