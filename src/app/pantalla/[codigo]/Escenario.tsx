'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import {
  construirGuion, firmaDelGuion, frescuraDe, intervaloConBackoff, proximaEscenaViva,
  proximoRecargado
} from '@/dominio/pantalla-area'
import type { Escena, Orientacion, ParametrosDePantalla } from '@/dominio/pantalla-area'
import type { MetaDePantalla, PaqueteDePantalla } from '@/datos/pantalla-area'
import { MarcoDePantalla } from './MarcoDePantalla'
import { EscenaPortada } from './escenas/EscenaPortada'
import { EscenaTrabajando } from './escenas/EscenaTrabajando'
import { EscenaCronometros } from './escenas/EscenaCronometros'
import { EscenaProcesos } from './escenas/EscenaProcesos'
import { EscenaEspacios } from './escenas/EscenaEspacios'

/** Cada cuanto se comprueba si la escena actual ya vencio. */
const TIC_DE_ROTACION_MS = 250

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
  const guion = useMemo(
    () => construirGuion(datos, parametros, orientacion),
    [datos, parametros, orientacion]
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

  useSondeo({ codigo, intervaloMs, fallos, setFallos, setDatos, setMeta, setLeidoEn })

  // -- El reloj de la rotacion. Se crea al montar y no se recrea nunca. -------------------------
  useEffect(() => {
    const tic = (): void => {
      const actual = guionRef.current

      if (actual.length <= 1 || performance.now() < vence.current) return

      const siguiente = (indiceDe(actual, escenaActual.current) + 1) % actual.length
      const escena = actual[siguiente]

      if (escena === undefined) return

      escenaActual.current = escena.id
      vence.current = performance.now() + escena.duracionMs
      setIndice(siguiente)
    }

    const latido = globalThis.setInterval(tic, TIC_DE_ROTACION_MS)

    return () => { globalThis.clearInterval(latido) }
  }, [])

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

  // -- El reloj de pared. No se renderiza en el servidor: el mismatch seria seguro. -------------
  //
  // El primer tic va por `setTimeout` y no llamando a `tic()` en el cuerpo del efecto: ahi seria un
  // `setState` sincrono, que encadena renders y que el linter de React rechaza con razon.
  useEffect(() => {
    const tic = (): void => {
      const cuando = Date.now()

      setAhora(cuando)
      // La primera lectura buena es la que trajo el servidor; su antigüedad se cuenta desde que la
      // pantalla se monto, que es lo unico que este reloj puede medir con honestidad.
      setLeidoEn((previo) => previo ?? (inicial === null ? null : cuando))
    }

    const arranque = globalThis.setTimeout(tic, 0)
    const latido = globalThis.setInterval(tic, 1000)

    return () => {
      globalThis.clearTimeout(arranque)
      globalThis.clearInterval(latido)
    }
  }, [inicial])

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
      frescura={frescura}
      esperando={datos === null}
      ahora={ahora}
      zona={meta?.timezone ?? null}
      orientacion={orientacion}
      zoom={parametros.zoom}
      tema={parametros.tema}
      transicion={parametros.transicion}
    >
      {escena === null
        ? null
        : (
          <Dibujo
            escena={escena}
            area={datos?.area.name ?? ''}
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

/** Elige el componente de la escena. Un `switch` y no un mapa: el tipo se estrecha solo. */
function Dibujo (
  { escena, area, ahora, congelado }:
  { escena: Escena, area: string, ahora: number | null, congelado: boolean }
): ReactElement | null {
  const origen = escena.origen

  switch (origen.kind) {
    case 'portada':
      return <EscenaPortada area={area} contadores={origen.counts} />

    case 'trabajando':
      return <EscenaTrabajando items={escena.items as never} ocultos={escena.ocultos} ahora={ahora} congelado={congelado} />

    case 'cronometros':
      return <EscenaCronometros items={escena.items as never} ocultos={escena.ocultos} ahora={ahora} congelado={congelado} />

    case 'procesos':
      return <EscenaProcesos items={escena.items as never} ocultos={escena.ocultos} total={origen.total} />

    case 'espacios':
      return <EscenaEspacios items={escena.items as never} ocultos={escena.ocultos} />

    default:
      return null
  }
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
function useSondeo (opciones: OpcionesDeSondeo): void {
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

  useEffect(() => {
    const latido = globalThis.setInterval(() => { void pedir() }, conBackoff)

    return () => { globalThis.clearInterval(latido) }
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
