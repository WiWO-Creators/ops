'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { mensajeDeRespuesta, pedirRespuesta } from '@/datos/cliente'
import { leerSSE } from '@/datos/sse'
import { leerEventoIA, type Regeneracion } from '@/dominio/ia'
import { crearCola, motivoDeBloqueo, type ColaDeEscritura } from '@/dominio/ia-resumen'
import type { Sobre } from '@/datos/tipos'
import { formatearFecha, formatearRelativo } from '@/lib/fechas'
import { GLOSARIO } from '@/dominio/glosario'
import { Orbe } from '@/componentes/estado/Orbe'
import { Boton } from '@/componentes/formularios/Boton'

/**
 * La ruta del resumen semanal del cliente, en los dos verbos.
 *
 * Va por `portal/`, que es lo unico que el BFF reenvia con la sesion de un contacto
 * (`datos/rutas.ts`, `PREFIJOS_PORTAL`). La ruta del panel —`ia/inicio`— no esta en esa lista y
 * responde 404 antes de salir a la red: un contacto no tiene sesion de staff, y esa barrera es a
 * proposito.
 */
const RUTA = 'portal/ia/resumen-semana'

/** Cada cuanto la cola suelta su proximo trozo. 16 ms es un cuadro a 60 Hz: mas rapido no se ve. */
const MS_TICK = 16

/** Cuanto dura el destello de exito al cerrar el stream, igual que en el Inicio del equipo. */
const MS_EXITO = 1200

/** Lo que se dice mientras el modelo lee y todavia no escribio nada. */
const MENSAJE_PENSANDO = `Revisando cómo avanzaron tus ${GLOSARIO.espacio.plural.toLowerCase()}…`

/** Lo que se dice cuando el proveedor no respondio. El detalle tecnico va en el `title`. */
const MENSAJE_ERROR = 'No pudimos armar tu resumen ahora.'

/**
 * Lo que se dice cuando el proveedor de IA no esta configurado (`503`).
 *
 * No es un error de esta pantalla ni algo que el cliente pueda arreglar, asi que no lleva
 * "Reintentar": lleva una frase tranquila y nada mas.
 */
const MENSAJE_SIN_PROVEEDOR = 'El resumen de la semana no está disponible por ahora.'

/**
 * Lo que se dice cuando el resumen anterior todavia no cumplio la hora (`429`).
 *
 * El tope lo fija el backend —uno por hora— y acá solo se pone en palabras. Es el respaldo para el
 * `429` crudo: el camino normal es el bloque `regeneracion`, que `motivoDeBloqueo()` traduce con
 * mas detalle, diciendo a que hora se va a poder.
 */
const MENSAJE_SIN_CUPO = 'Tu resumen se actualiza una vez por hora.'

/**
 * En que anda la tarjeta.
 *
 * `apagada` y `sin_proveedor` no son estados de carga: son las dos respuestas que la API da cuando
 * la capa de IA no puede trabajar —`404` con el kill-switch bajado, `503` sin clave del proveedor—.
 * Ninguna rompe la pantalla: la primera hace que la tarjeta no exista y la segunda la deja con una
 * sola linea que lo explica.
 */
type Fase = 'cargando' | 'apagada' | 'sin_proveedor' | 'reposo' | 'pensando' | 'escribiendo' | 'exito'

/** Como cerro el stream. Decide si al terminar de escribir hay destello de exito o no. */
type Cierre = 'fin' | 'error'

/**
 * Lo que devuelve `GET /portal/ia/resumen-semana`.
 *
 * Se declara acá y no en `datos/portal.ts` porque es el contrato de la capa de IA del portal, no el
 * de `/portal/resumen`: comparte forma con `ResumenIA` de `dominio/ia.ts` —el espejo del Inicio del
 * equipo— pero sin `tareas`. El resumen del cliente no lista {procesos}: eso ya lo dibuja
 * «Próximos días» al lado, y repetirlo seria la misma informacion dos veces con distinta redaccion.
 *
 * `texto: null` significa que no hay resumen fresco: o nunca se genero, o el ultimo ya cumplio la
 * hora. No es un texto vacio, y los dos casos se resuelven igual —generando—.
 */
interface ResumenSemanal {
  texto: string | null
  generado_en: string | null
  regeneracion: Regeneracion
}

/** Que pedirle a una lectura del resumen guardado. */
interface OpcionesLectura {
  /** Generar al entrar si lo guardado ya no esta vigente y la hora de espera se cumplio. */
  generarSiFalta?: boolean
  /** No pisar el texto que ya esta en pantalla. Se usa al releer despues de un fallo del stream. */
  conservarTexto?: boolean
}

/**
 * El resumen de la semana del cliente, escrito por la capa de IA.
 *
 * Reemplaza a «Próximos hitos» en la portada del portal. Aquella lista decia QUE viene; esta dice
 * COMO viene: una sola lectura de la semana sobre todos los {espacios} del cliente, nombrandolos,
 * escrita para alguien que no trabaja acá adentro.
 *
 * === POR QUE ES EL UNICO COMPONENTE CLIENTE DE LA PORTADA ===
 *
 * Porque **se tiene que ver como se genera**. Un texto que aparece entero no se distingue de uno
 * guardado hace tres semanas, y en un resumen semanal esa diferencia es toda la noticia. La
 * escritura no es una animacion de CSS: el texto avanza porque esta llegando por el stream. Los
 * `delta` del proveedor llegan en rafagas de largo irregular y pintarlos tal cual se ve como
 * tartamudeo, asi que `crearCola()` los aplana en ~3 caracteres cada 16 ms. El cursor es el `Orbe`
 * en `generating`, que es el estado del sistema de diseño para "sale contenido hacia la interfaz".
 *
 * === TRES FALLOS QUE NO SON ERRORES DE PROGRAMA ===
 *
 * La capa de IA apagada (`404`), el proveedor sin clave (`503`) y el cupo agotado (`429`) son
 * desenlaces previstos, no fallas. Cada uno tiene su respuesta y ninguno deja la portada rota: el
 * `404` hace desaparecer la tarjeta, el `503` la deja con una linea que lo dice, y el `429` apaga el
 * boton con la frase que explica hasta cuando. Los tres se leen del `GET`, que es donde la tarjeta
 * decide que es; si aparecen a mitad de una generacion, el stream falla y la relectura posterior los
 * encuentra igual.
 *
 * **El cupo no se calcula acá.** Llega resuelto en el bloque `regeneracion` y `motivoDeBloqueo()`
 * solo lo pone en palabras: duplicar la regla seria dos fuentes de verdad, y ademas se saltearia
 * desde la consola del navegador.
 */
export function ResumenDeLaSemana () {
  const [texto, establecerTexto] = useState('')
  const [generadoEn, establecerGeneradoEn] = useState<string | null>(null)
  const [regeneracion, establecerRegeneracion] = useState<Regeneracion | null>(null)
  const [limite, establecerLimite] = useState<string | null>(null)
  const [fase, establecerFase] = useState<Fase>('cargando')
  const [error, establecerError] = useState<string | null>(null)
  const [aMedias, establecerAMedias] = useState(false)
  const [fallos, establecerFallos] = useState(0)

  const cola = useRef<ColaDeEscritura | null>(null)
  const intervalo = useRef<ReturnType<typeof setInterval> | null>(null)
  const temporizadorExito = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stream = useRef<AbortController | null>(null)

  /**
   * Abre `POST /portal/ia/resumen-semana` y va escribiendo lo que llega.
   *
   * Todo el mecanismo de la escritura vive adentro: la cola, el temporizador que la drena y el
   * cierre. Sacarlo al cuerpo del componente obligaria a envolver cinco funciones mas en
   * `useCallback` para que esta no cambie en cada pintada, y el `setInterval` se reiniciaria solo.
   *
   * Un fallo no se interpreta acá: se cuenta en `fallos` y la relectura del `GET` averigua si fue el
   * cupo, el kill-switch o el proveedor. Asi la unica lectura de esos tres estados vive en un solo
   * lugar, que es el `GET`.
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

      // Sin escritura progresiva, todo lo acumulado se pinta acá de una sola vez.
      if (deUnaVez && escrito) establecerTexto(buffer.drenar())

      if (como === 'error') {
        establecerFase('reposo')
        establecerFallos((previo) => previo + 1)
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
      for await (const crudo of leerSSE(RUTA, { senal: control.signal })) {
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
   * Lee lo guardado con un `GET`, que nunca consume cupo.
   *
   * Es tambien el unico lugar donde se leen los tres desenlaces previstos, porque es el unico que ve
   * el codigo de estado: `404` (capa de IA apagada), `503` (proveedor sin clave) y `429` (sin cupo).
   *
   * Si no hay resumen vigente —nunca se genero, o el ultimo ya cumplio la hora— y el cupo lo
   * permite, genera al entrar: eso es lo que hace que el cliente vea su resumen escribirse cada vez
   * que vuelve, en vez de leer uno de hace dias. Si todavia corre la hora, se queda con lo que haya
   * y el boton explica hasta cuando.
   *
   * @param senal señal para abortar cuando el componente se desmonta
   * @param opciones si generar al entrar y si conservar el texto que ya esta en pantalla
   */
  const cargarGuardado = useCallback(async (senal: AbortSignal, opciones: OpcionesLectura = {}): Promise<void> => {
    const { generarSiFalta = false, conservarTexto = false } = opciones

    try {
      const respuesta = await pedirRespuesta(RUTA, senal)

      // La capa de IA apagada responde 404 en toda la familia `/ia/*`, tambien en la del portal. No
      // es un error que mostrar: es una tarjeta que no va.
      if (respuesta.status === 404) {
        establecerFase('apagada')
        return
      }

      // El proveedor sin clave configurada. Tampoco es un error del cliente ni algo que reintentar
      // sirva de nada: se dice en una linea y se deja quieto.
      if (respuesta.status === 503) {
        establecerFase('sin_proveedor')
        return
      }

      // Sin cupo. El camino normal es el bloque `regeneracion` de una respuesta correcta; este es el
      // respaldo para cuando la API corta antes de responder el cuerpo.
      if (respuesta.status === 429) {
        establecerLimite(MENSAJE_SIN_CUPO)
        establecerFase('reposo')
        return
      }

      if (!respuesta.ok) throw new Error(await mensajeDeRespuesta(respuesta))

      const { data } = await respuesta.json() as Sobre<ResumenSemanal>

      if (!conservarTexto) establecerTexto(data.texto ?? '')
      establecerGeneradoEn(data.generado_en)
      establecerRegeneracion(data.regeneracion)
      establecerLimite(null)
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
    async function cargar () { await cargarGuardado(lectura.signal, { generarSiFalta: true }) }

    void cargar()

    return () => {
      lectura.abort()
      stream.current?.abort()
      if (intervalo.current !== null) clearInterval(intervalo.current)
      if (temporizadorExito.current !== null) clearTimeout(temporizadorExito.current)
    }
  }, [cargarGuardado])

  // Un stream que fallo no dice POR QUE fallo: cuando el error viaja antes del primer byte, lo unico
  // que llega es el mensaje del contrato, sin codigo de estado. La relectura —que no gasta cupo— es
  // la que descubre si mientras tanto se apago la IA, se cayo el proveedor o se acabo el cupo, y de
  // paso deja el boton con la frase correcta. El texto de la pantalla no se toca: si quedo a medias,
  // asi se queda, y el pie lo dice.
  useEffect(() => {
    if (fallos === 0) return

    const control = new AbortController()

    async function releer () { await cargarGuardado(control.signal, { conservarTexto: true }) }

    void releer()

    return () => { control.abort() }
  }, [fallos, cargarGuardado])

  // Cuando pasa la hora de espera, el boton se rehabilita sin recargar. Se vuelve a preguntar en vez
  // de dar por buena la espera acá: el veredicto es del backend, y de paso la frase deja de ser vieja.
  useEffect(() => {
    const desde = regeneracion?.puede_ahora === false ? regeneracion.disponible_desde : null

    if (desde === null || desde === undefined) return

    const espera = Date.parse(desde) - Date.now()

    if (Number.isNaN(espera) || espera <= 0) return

    const control = new AbortController()
    const id = setTimeout(() => { void cargarGuardado(control.signal) }, espera)

    return () => {
      clearTimeout(id)
      control.abort()
    }
  }, [regeneracion, cargarGuardado])

  if (fase === 'apagada') return null

  const escribiendo = fase === 'pensando' || fase === 'escribiendo'
  const bloqueo = limite ?? (regeneracion === null ? null : motivoDeBloqueo(regeneracion))

  return (
    <section
      aria-label="Resumen de la semana"
      className="rounded-tarjeta border-linea bg-superficie-elevada shadow-1 flex flex-col gap-4 border p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="font-titular text-texto text-sm font-semibold">Tu semana</h2>

        {fase !== 'sin_proveedor' && (
          <div className="flex flex-wrap items-center gap-3">
            {/* Un `disabled` mudo no dice nada: la frase que lo explica va al lado del boton, no en
                un `title` que solo aparece si alguien deja el puntero encima. */}
            {!escribiendo && bloqueo !== null && (
              <span className="text-texto-tenue text-sm">{bloqueo}</span>
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
                  {texto === '' ? 'Generar' : 'Actualizar'}
                </Boton>
                )}
          </div>
        )}
      </div>

      {fase === 'cargando' && <p className="text-texto-tenue text-sm">Buscando tu resumen…</p>}
      {fase === 'sin_proveedor' && <p className="text-texto-tenue text-sm">{MENSAJE_SIN_PROVEEDOR}</p>}
      {fase !== 'cargando' && fase !== 'sin_proveedor' && (
        <Cuerpo texto={texto} escribiendo={escribiendo} fase={fase} />
      )}

      {/*
        Un live region que cambia sesenta veces por segundo es tortura para un lector de pantalla:
        mientras se escribe anuncia el estado y nada mas, y el texto entra recien cuando termino.
        En reposo queda vacio para no repetir lo que ya se lee en el parrafo de arriba.
      */}
      <p role="status" aria-live="polite" className="sr-only">
        {escribiendo ? 'Armando el resumen de tu semana…' : (fase === 'exito' ? texto : '')}
      </p>

      <Pie
        generadoEn={generadoEn}
        escribiendo={escribiendo}
        aMedias={aMedias}
        error={fase === 'sin_proveedor' ? null : error}
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
 * Al actualizar, el texto viejo se queda hasta el primer `delta`: nunca hay caja vacia, que es la
 * unica forma de que la tarjeta no parpadee cada vez que alguien aprieta el boton.
 */
function Cuerpo ({ texto, escribiendo, fase }: PropsCuerpo) {
  return (
    <>
      {texto === ''
        ? fase !== 'pensando' && (
          <p className="text-texto-tenue text-sm">
            Todavía no generamos tu resumen de esta semana.
          </p>
          )
        : (
          <p
            aria-hidden={escribiendo || undefined}
            className="text-texto max-w-prose text-sm leading-relaxed whitespace-pre-line"
          >
            {texto}
            {fase === 'escribiendo' && (
              <Orbe medida="1.1rem" estado="generating" className="ml-1 inline-flex align-middle" />
            )}
          </p>
          )}

      {fase === 'pensando' && (
        <p className="text-texto-tenue flex items-center gap-2 text-sm">
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
 * El fallo **no** usa una caja de error entera: seria desproporcionado para una comodidad opcional,
 * y sobre todo taparia el resumen guardado, que sigue siendo util aunque el proveedor no conteste.
 * Va como una linea al pie, con el orbe en `error` y el boton para reintentar.
 */
function Pie ({ generadoEn, escribiendo, aMedias, error, alReintentar }: PropsPie) {
  if (escribiendo) return null
  if (generadoEn === null && !aMedias && error === null) return null

  return (
    <div className="text-texto-tenue flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {generadoEn !== null && (
        <span title={formatearFecha(generadoEn, true)}>Generado {formatearRelativo(generadoEn)}</span>
      )}

      {aMedias && <span className="text-texto-aviso">Quedó a medias.</span>}

      {error !== null && (
        <>
          <span className="text-texto-peligro flex items-center gap-1.5" title={error}>
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
