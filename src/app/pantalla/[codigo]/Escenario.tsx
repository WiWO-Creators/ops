'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import {
  TABLA_AREA, TABLA_EMPRESA, construirGuion, faseDeDato, firmaDelGuion, frescuraDe,
  intervaloConBackoff, proximaEscenaViva, proximoRecargado, tablaDeEscena
} from '@/dominio/pantalla-area'
import type { Escena, Orientacion, ParametrosDePantalla, TablaDePantalla } from '@/dominio/pantalla-area'
import { franjaDelMomento } from '@/dominio/momento-del-dia'
import type { FranjaDelDia } from '@/dominio/momento-del-dia'
import type { MetaDePantalla, PaqueteDePantalla, PersonaTrabajando } from '@/datos/pantalla-area'
import { useLatido, useNoApagarPantalla } from './proyeccion'
import { MarcoDePantalla } from './MarcoDePantalla'
import { EscenaPortada } from './escenas/EscenaPortada'
import { EscenaTrabajando } from './escenas/EscenaTrabajando'
import type { TablaDeGente } from './escenas/EscenaTrabajando'
import { EscenaCronometros } from './escenas/EscenaCronometros'
import { EscenaProcesos } from './escenas/EscenaProcesos'
import { EscenaEspacios } from './escenas/EscenaEspacios'
import { EscenaMomento } from './escenas/EscenaMomento'
import { EscenaAnuncios } from './escenas/EscenaAnuncios'

interface Props {
  codigo: string
  inicial: PaqueteDePantalla | null
  metaInicial: MetaDePantalla | null
  parametros: ParametrosDePantalla
}

/**
 * El motor de la pantalla: dos relojes que no se conocen.
 *
 * === EL PROBLEMA QUE RESUELVE ESTE ARCHIVO ===
 *
 * La pantalla hace dos cosas a la vez: vuelve a pedir los datos cada tantos segundos, y pasa de una
 * escena a la siguiente cada tantos otros. Lo dificil es que **un refresco de datos no reinicie la
 * rotacion**. Si lo hiciera, el televisor se quedaria clavado en la primera escena para siempre, y el
 * fallo solo se nota si alguien se queda mirando la pared un minuto entero — nadie lo hace.
 *
 * La solucion tiene tres piezas que hay que mantener juntas:
 *
 * 1. **El sondeo no toca `indice` y la rotacion no lee `datos`.** No comparten una sola variable de
 *    estado. El unico puente es el guion, y ese puente esta cortado por la firma.
 * 2. **La rotacion depende de `firma`, un string**, y no del arreglo del guion — que es nuevo en cada
 *    render y dispararia el efecto en cada sondeo. La firma solo cambia cuando aparece o desaparece
 *    una escena, que es justo cuando la rotacion tiene que enterarse.
 * 3. **El reloj vive en una `ref` con vencimiento absoluto**, en un efecto que se crea UNA vez y no
 *    se recrea jamas (`deps: []`). Un tic corto comprueba si ya vencio, en vez de un `setTimeout`
 *    largo: cuando el televisor se suspende —HDMI-CEC, ahorro de energia— y vuelve tres horas
 *    despues, una cadena de timeouts despierta con cientos de transiciones encoladas y recorre el
 *    guion entero en un segundo. Con vencimiento absoluto, el primer tic avanza UNA vez.
 *
 * === POR QUE NO SE USA `router.refresh()` ===
 *
 * Es el patron del proyecto para pantallas colgadas (`sala/[token]/Refrescador.tsx`), y aca no sirve:
 * si la API no responde, el Server Component tira, Next reemplaza el arbol por `error.tsx` y la
 * pantalla se queda ahi hasta que alguien la recargue a mano. Un `fetch` del cliente se puede atrapar
 * e ignorar, que es lo unico aceptable en una pared.
 */
export function Escenario ({ codigo, inicial, metaInicial, parametros }: Props): ReactElement {
  const [datos, setDatos] = useState<PaqueteDePantalla | null>(inicial)
  const [meta, setMeta] = useState<MetaDePantalla | null>(metaInicial)
  const [fallos, setFallos] = useState(0)
  // Arranca en `null` aunque el servidor haya traido datos: el reloj del servidor no es el del
  // televisor, y mezclarlos daria una frescura inventada. Lo fija el primer tic, un instante despues.
  const [leidoEn, setLeidoEn] = useState<number | null>(null)
  const [indice, setIndice] = useState(0)
  const [ahora, setAhora] = useState<number | null>(null)

  const orientacion = useOrientacion()

  /**
   * La zona horaria del negocio, que manda la API.
   *
   * No es la del televisor y no se puede sustituir por ella: un aparato barato arrastra la zona que le
   * dejo puesta quien lo configuro, a menudo UTC. El instante si sale del navegador, que lo sincroniza
   * solo. Ver el docblock de `src/dominio/momento-del-dia.ts`.
   */
  const zona = meta?.timezone ?? null

  /**
   * La franja horaria vigente, o `null` fuera de todas.
   *
   * Se recalcula en cada tic —`ahora` cambia una vez por segundo— pero **devuelve la misma referencia**
   * mientras no se cruce un borde, porque `franjaDelMomento()` entrega un elemento del arreglo
   * constante. Eso es lo que mantiene estable el `useMemo` del guion de abajo: sin esa garantia, el
   * guion se reconstruiria una vez por segundo.
   */
  const franja = useMemo(() => franjaDelMomento(ahora, zona), [ahora, zona])

  const guion = useMemo(
    () => construirGuion(datos, parametros, orientacion, franja),
    [datos, parametros, orientacion, franja]
  )
  const firma = firmaDelGuion(guion)

  // "Latest ref": el reloj de la rotacion lee de acá en vez de depender del guion, que cambia de
  // identidad en cada render.
  const guionRef = useRef(guion)
  const escenaActual = useRef<string>('')
  const vence = useRef(0)

  useEffect(() => {
    guionRef.current = guion
  })

  /**
   * El ritmo, en milisegundos. UNO solo para el sondeo y para la frescura.
   *
   * Manda `meta.poll_after_seconds`, que decide el backend: los televisores estan colgados a tres
   * metros de altura y cambiarles la URL cuesta una escalera, asi que frenar todas las pantallas
   * fuera del horario de oficina tiene que poder hacerse desde el servidor. El `?refresco=` de la URL
   * es el valor mientras no haya llegado ningun `meta` — es decir, el arranque.
   *
   * Que sea uno solo no es prolijidad: la frescura se mide en multiplos del intervalo, asi que dos
   * valores distintos harian que la pantalla se declare vieja antes o despues de lo que corresponde.
   */
  const intervaloMs = (meta?.poll_after_seconds ?? parametros.segundosDeRefresco) * 1000

  const sondearSiToca = useSondeo({ codigo, intervaloMs, fallos, setFallos, setDatos, setMeta, setLeidoEn })

  // -- El unico reloj de la pantalla, fuera del hilo principal. --------------------------------
  //
  // De este tic salen las tres cosas que necesitan tiempo: la rotacion de escenas, el contador de
  // segundos y —dentro de `useSondeo`— cuando toca volver a preguntar. Un solo temporizador, y en un
  // worker, porque el de una pestaña oculta se estrangula a uno por minuto y una pestaña casteada a
  // un televisor esta oculta en cuanto quien la lanzo cambia de pestaña. Ver `proyeccion.ts`.
  // Que el aparato no apague la pantalla mientras se esta proyectando.
  useNoApagarPantalla()

  useLatido((cuando) => {
    sondearSiToca(cuando)

    // El reloj de pared: solo cuando cambia el segundo, para no repintar cuatro veces por segundo.
    setAhora((previo) => previo !== null && Math.floor(previo / 1000) === Math.floor(cuando / 1000)
      ? previo
      : cuando)

    // La primera lectura buena es la que trajo el servidor; su antigüedad se cuenta desde que la
    // pantalla se monto, que es lo unico que este reloj puede medir con honestidad.
    setLeidoEn((previo) => previo ?? (inicial === null ? null : cuando))

    const actual = guionRef.current

    if (actual.length <= 1 || performance.now() < vence.current) return

    const siguiente = (indiceDe(actual, escenaActual.current) + 1) % actual.length
    const escena = actual[siguiente]

    if (escena === undefined) return

    escenaActual.current = escena.id
    vence.current = performance.now() + escena.duracionMs
    setIndice(siguiente)
  })

  // -- El guion cambio: se conserva la posicion por ID, nunca por indice. -----------------------
  //
  // Caso real: son las 18:05, la ultima persona cierra su jornada y la escena "trabajando" se vacia y
  // sale del guion. Con indices, todos se correrian y la pantalla saltaria al principio a mitad de
  // escena. Con ids, si la escena actual sigue viva ni se toca su vencimiento: termina cuando tenia
  // que terminar.
  useEffect(() => {
    const actual = guionRef.current

    if (actual.length === 0) return

    const mismo = actual.findIndex((escena) => escena.id === escenaActual.current)

    if (mismo >= 0) {
      setIndice(mismo)

      return
    }

    const siguiente = escenaActual.current === ''
      ? 0
      : proximaEscenaViva(actual, escenaActual.current)
    const escena = actual[siguiente]

    if (escena === undefined) return

    escenaActual.current = escena.id
    vence.current = performance.now() + escena.duracionMs
    setIndice(siguiente)
  }, [firma])

  // -- Recargado duro de madrugada. -------------------------------------------------------------
  //
  // Lo que ningun `clearInterval` limpia: la memoria que el motor de JS acumula en meses, la cache de
  // imagenes, y el despliegue nuevo que esta pantalla nunca veria porque nadie la recarga.
  useEffect(() => {
    const espera = proximoRecargado(Date.now(), codigo) - Date.now()
    const alarma = globalThis.setTimeout(() => { globalThis.location.reload() }, Math.max(espera, 60_000))

    return () => { globalThis.clearTimeout(alarma) }
  }, [codigo])

  const frescura = leidoEn === null || ahora === null
    ? 'sin-conexion'
    : frescuraDe(ahora - leidoEn, intervaloMs)

  const escena = guion[Math.min(indice, Math.max(guion.length - 1, 0))] ?? null

  return (
    <MarcoDePantalla
      area={datos?.area.name ?? null}
      guion={guion}
      escenaId={escena?.id ?? null}
      continuidad={escena?.continuidad ?? null}
      frescura={frescura}
      esperando={datos === null}
      ahora={ahora}
      zona={zona}
      orientacion={orientacion}
      zoom={parametros.zoom}
      margen={parametros.margen}
      tema={parametros.tema}
      transicion={parametros.transicion}
    >
      {escena === null
        ? null
        : (
          <Dibujo
            escena={escena}
            area={datos?.area.name ?? ''}
            // `area.id` en `null` es la pantalla global: la de toda la compañia. No es un area sin id,
            // asi que los rotulos que dicen "del área" tienen que decir otra cosa. Se pregunta por
            // `=== null` y no por un booleano suelto para que el dia que llegue un paquete sin `area`
            // la pantalla se comporte como una de area, que es la caida conservadora.
            esGlobal={datos?.area.id === null}
            franja={franja}
            zona={zona}
            // El juego de campos que toca. Sale del reloj que ya esta en pantalla y no de un
            // temporizador propio —que se estrangularia con la pestaña oculta—, y `?transicion=ninguna`
            // lo clava en el principal: el televisor que no da abasto no tiene por que alternar nada.
            fase={parametros.transicion === 'ninguna' ? 0 : faseDeDato(ahora)}
            // Con los datos viejos los contadores cuentan contra la ULTIMA LECTURA BUENA y no contra
            // el reloj: se quedan clavados en el valor que era cierto. Un cronometro que sigue
            // trepando con la conexion caida es una mentira, y esta pared la leen jefaturas de area.
            ahora={frescura === 'fresco' ? ahora : leidoEn}
            congelado={frescura !== 'fresco'}
          />
          )}
    </MarcoDePantalla>
  )
}

interface Dibujable {
  escena: Escena
  area: string
  /** `true` en la pantalla de toda la compañia, donde no hay area que nombrar. */
  esGlobal: boolean
  /** La franja horaria vigente. Solo la usa `momento`, que no existe fuera de una. */
  franja: FranjaDelDia | null
  /** La zona del negocio: el reloj grande de `momento` y toda hora que se dibuje en una fila. */
  zona: string | null
  ahora: number | null
  congelado: boolean
  /** Cual de los dos juegos de campos toca; ver `faseDeDato()`. */
  fase: 0 | 1
}

/** Elige el componente de la escena. Un `switch` y no un mapa: el tipo se estrecha solo. */
function Dibujo (
  { escena, area, esGlobal, franja, zona, ahora, congelado, fase }: Dibujable
): ReactElement | null {
  const origen = escena.origen
  // Las escenas de una sola tabla leen la primera y no se enteran de que `tablas` es un arreglo.
  const unica = escena.tablas[0] ?? TABLA_VACIA

  switch (origen.kind) {
    case 'portada':
      return <EscenaPortada area={area} contadores={origen.counts} />

    case 'trabajando':
      // La unica escena con dos tablas. Se buscan por clave y nunca por indice: en un area sin gente
      // la primera tabla es la de la compañia, y en la pantalla global tambien — pero en un paquete
      // sin compañia seria la del area, y `tablas[0]` estaria diciendo dos cosas distintas.
      return (
        <EscenaTrabajando
          compania={comoTablaDeGente(tablaDeEscena(escena, TABLA_EMPRESA))}
          area={comoTablaDeGente(tablaDeEscena(escena, TABLA_AREA))}
          nombreDelArea={area}
          zona={zona}
          ahora={ahora}
          congelado={congelado}
          fase={fase}
        />
      )

    case 'cronometros':
      return (
        <EscenaCronometros
          items={unica.items as never}
          ocultos={unica.ocultos}
          ahora={ahora}
          congelado={congelado}
          zona={zona}
          fase={fase}
        />
      )

    case 'procesos':
      return (
        <EscenaProcesos
          items={unica.items as never}
          ocultos={unica.ocultos}
          total={origen.total}
          fase={fase}
          esGlobal={esGlobal}
        />
      )

    case 'espacios':
      return (
        <EscenaEspacios
          items={unica.items as never}
          ocultos={unica.ocultos}
          ahora={ahora}
          zona={zona}
          fase={fase}
        />
      )

    case 'momento':
      return <EscenaMomento franja={franja} ahora={ahora} zona={zona} />

    case 'anuncios':
      return <EscenaAnuncios items={unica.items as never} ocultos={unica.ocultos} />

    default:
      return null
  }
}

/**
 * La tabla vacia con la que se dibuja una escena sin tablas.
 *
 * No deberia llegar nunca —`paginar()` saca del guion lo que no tiene items— salvo en la ventana de
 * un render entre que la lista se vacia y llega el sondeo siguiente. Una constante y no un objeto
 * nuevo por render: asi no se rompe la memoizacion de nadie.
 */
const TABLA_VACIA: TablaDePantalla = { clave: '', items: [], ocultos: 0, total: null }

/** Una tabla del guion con la forma que espera `EscenaTrabajando`, o `null` si no esta en la pagina. */
function comoTablaDeGente (tabla: TablaDePantalla | null): TablaDeGente | null {
  if (tabla === null) return null

  return { items: tabla.items as PersonaTrabajando[], ocultos: tabla.ocultos, total: tabla.total }
}

/** Donde esta ahora mismo una escena por su id, o 0 si ya no esta. */
function indiceDe (guion: Escena[], id: string): number {
  const encontrado = guion.findIndex((escena) => escena.id === id)

  return encontrado >= 0 ? encontrado : 0
}

interface OpcionesDeSondeo {
  codigo: string
  /** El ritmo base, antes del backoff. Lo decide `meta.poll_after_seconds`; ver `Escenario`. */
  intervaloMs: number
  fallos: number
  setFallos: (actualizar: (previos: number) => number) => void
  setDatos: (paquete: PaqueteDePantalla) => void
  setMeta: (meta: MetaDePantalla | null) => void
  setLeidoEn: (cuando: number) => void
}

/**
 * Vuelve a pedir el paquete cada tantos segundos, para siempre.
 *
 * === LO QUE EVITA QUE ESTO SE COMA EL NAVEGADOR EN UNA SEMANA ===
 *
 * - **Un `AbortController` por vuelta**, abortado al desmontar y antes de cada peticion nueva.
 * - **Un `enVuelo` que salta el tic si la anterior sigue viva.** Con la API lenta y el intervalo
 *   corto, las peticiones se encolan hasta matar la pestaña. Es la fuga mas comun de una pantalla de
 *   kiosco y no se nota hasta que el aparato se congela.
 * - **Nada que crezca**: el paquete se reemplaza, los errores son un contador y no una lista.
 *
 * === EL ETAG ===
 *
 * El ultimo `ETag` se guarda y se manda como `if-none-match`. Un `304` no trae cuerpo y significa
 * "nada cambio": se actualiza la marca de frescura y no se toca `datos`, asi que React no repinta
 * nada. Es lo que hace que un televisor que pregunta cada treinta segundos durante meses no mueva
 * datos mientras el area esta quieta.
 */
function useSondeo (opciones: OpcionesDeSondeo): (ahora: number) => void {
  const { codigo, intervaloMs, fallos, setFallos, setDatos, setMeta, setLeidoEn } = opciones

  const enVuelo = useRef(false)
  const etag = useRef<string | null>(null)
  const aborto = useRef<AbortController | null>(null)

  const pedir = useCallback(async (): Promise<void> => {
    if (enVuelo.current) return

    enVuelo.current = true
    aborto.current?.abort()
    aborto.current = new AbortController()

    try {
      const cabeceras: Record<string, string> = {}

      if (etag.current !== null) cabeceras['if-none-match'] = etag.current

      const respuesta = await fetch(`/api/pantalla/${encodeURIComponent(codigo)}`, {
        cache: 'no-store',
        headers: cabeceras,
        signal: aborto.current.signal
      })

      if (respuesta.status === 304) {
        setLeidoEn(Date.now())
        setFallos(() => 0)

        return
      }

      if (!respuesta.ok) {
        setFallos((previos) => previos + 1)

        return
      }

      const sobre = await respuesta.json() as { data: PaqueteDePantalla, meta?: MetaDePantalla }

      etag.current = respuesta.headers.get('etag')
      setDatos(sobre.data)
      // En un `304` no viene `meta`; por eso solo se pisa cuando llega de verdad.
      if (sobre.meta !== undefined) setMeta(sobre.meta)
      setLeidoEn(Date.now())
      setFallos(() => 0)
    } catch {
      // Abortada, sin red, o la API caida. Todo cuenta igual: un fallo mas, y el backoff decide.
      setFallos((previos) => previos + 1)
    } finally {
      enVuelo.current = false
    }
  }, [codigo, setDatos, setMeta, setFallos, setLeidoEn])

  const conBackoff = intervaloConBackoff(intervaloMs, fallos)
  const proximo = useRef(0)

  // Cuando toca volver a preguntar, en tiempo de pared.
  //
  // El sondeo NO tiene temporizador propio: lo dispara el mismo latido que mueve las escenas, por el
  // mismo motivo —un `setInterval` en una pestaña casteada se estrangula a uno por minuto, y una
  // pantalla que consulta una vez por minuto no es una pantalla en vivo—.
  const sondearSiToca = useCallback((ahora: number): void => {
    if (ahora < proximo.current) return

    proximo.current = ahora + conBackoff
    void pedir()
  }, [pedir, conBackoff])

  // Una peticion al montar, sin esperar al primer tic.
  //
  // Importa cuando el servidor no pudo traer el paquete —la API estaba caida al cargar la pagina—:
  // sin esto, la pared se queda diciendo "Esperando a Ops" durante un intervalo entero aunque el
  // servicio ya haya vuelto. Va por `setTimeout` para no disparar un `setState` sincrono en el cuerpo
  // del efecto.
  useEffect(() => {
    const arranque = globalThis.setTimeout(() => { void pedir() }, 0)

    return () => { globalThis.clearTimeout(arranque) }
  }, [pedir])

  // Volver de una suspension o recuperar la red no espera al proximo tic: la pared tiene que decir la
  // verdad lo antes posible. La pausa por `document.hidden` del tablero del panel NO se aplica acá —
  // un televisor no tiene pestañas, y cuando "se oculta" es porque se suspendio.
  useEffect(() => {
    const despertar = (): void => { void pedir() }

    globalThis.addEventListener('online', despertar)
    document.addEventListener('visibilitychange', despertar)

    return () => {
      globalThis.removeEventListener('online', despertar)
      document.removeEventListener('visibilitychange', despertar)
    }
  }, [pedir])

  useEffect(() => {
    return () => { aborto.current?.abort() }
  }, [])

  return sondearSiToca
}

/**
 * Como esta puesto el televisor, mirando su proporcion.
 *
 * Lo decide la pantalla y no una configuracion: un aparato girado se ve bien sin que nadie tenga que
 * acordarse de declararlo en el panel, y si alguien lo gira despues, la pagina se acomoda sola.
 *
 * En el servidor no hay proporcion que mirar, asi que la primera pintada sale en horizontal y se
 * corrige al hidratar. Eso es visible solo si el televisor esta en vertical, dura un instante, y la
 * alternativa —adivinar en el servidor por el `user-agent`— acierta menos.
 *
 * `matchMedia` y no `window.innerHeight > innerWidth`: la consulta la reevalua el navegador sola y no
 * hace falta escuchar `resize`, que en un televisor dispara tambien al aparecer el teclado en
 * pantalla.
 */
function useOrientacion (): Orientacion {
  const [orientacion, setOrientacion] = useState<Orientacion>('horizontal')

  useEffect(() => {
    const consulta = globalThis.matchMedia('(orientation: portrait)')
    const mirar = (): void => { setOrientacion(consulta.matches ? 'vertical' : 'horizontal') }

    // Por `setTimeout` y no llamando a `mirar()` acá: en el cuerpo del efecto seria un `setState`
    // sincrono, que encadena renders.
    const arranque = globalThis.setTimeout(mirar, 0)
    consulta.addEventListener('change', mirar)

    return () => {
      globalThis.clearTimeout(arranque)
      consulta.removeEventListener('change', mirar)
    }
  }, [])

  return orientacion
}
