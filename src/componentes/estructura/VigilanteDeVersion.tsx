'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { ATRIBUTO_BIENVENIDA, CLAVE_BIENVENIDA } from '@/lib/bienvenida'
import { cn } from '@/lib/clases'
import { elegirEscena } from './bienvenida/escenas'

/** Cuanto dura la obra antes de empezar a irse. */
const OBRA = 2200
/** Lo mismo para quien pidio menos movimiento: se ve el cartel, no se le hace esperar la animacion. */
const OBRA_REDUCIDA = 700
/** El fundido de salida. Tiene que coincidir con `duration-500` de la capa. */
const SALIDA = 500
/** Lo que tarda el aviso en irse al descartarlo. Es `--wiwo-motion-fast`, el de `animate-aviso-salir`. */
const SALIDA_AVISO = 160

/** Lo que devuelve `/api/version`. */
interface SobreVersion {
  version?: unknown
}

interface PropsVigilante {
  /**
   * La version que sirvio esta pagina. Viaja por prop desde el servidor y no se pide al montar: es el
   * unico valor del que se sabe con certeza que corresponde al JavaScript que el navegador ejecuta.
   */
  version: string
  /** Cada cuantos segundos se vuelve a preguntar. Lo resuelve el servidor. */
  segundos: number
}

/**
 * Avisa cuando el sistema se actualizo y recibe a quien actualiza.
 *
 * === POR QUE HACE FALTA ===
 *
 * Una pestaña abierta desde ayer sigue ejecutando el JavaScript de ayer. Va a seguir andando —hasta
 * que una pantalla nueva pida un dato que la version vieja no sabe leer, y ahi falla sin explicar por
 * que—. El navegador no puede detectarlo solo: su codigo ES el viejo. Por eso pregunta.
 *
 * === POR QUE AVISA Y NO OBLIGA ===
 *
 * El aviso es una barra descartable y no una cortina bloqueante. Recargar tira lo que haya sin
 * guardar, y quien esta a mitad de un acta o de un formulario largo tiene que poder terminar primero.
 * La version vieja funciona; simplemente no es la ultima.
 *
 * === LA BIENVENIDA ===
 *
 * Aceptar deja una marca en `sessionStorage` y recarga. La carga siguiente encuentra la marca, tapa
 * la pantalla con una de las escenas de obra (`bienvenida/escenas.ts`, al azar) y funde hacia
 * el panel ya nuevo. El telon que evita el destello
 * lo pone un script anterior al primer pintado (`lib/bienvenida.ts`); aca solo se levanta, en el
 * momento exacto en que esta capa —opaca y por encima— pasa a taparlo.
 *
 * No pinta nada mientras no haya nada que decir, asi que va montado en el armazon del panel.
 */
export function VigilanteDeVersion ({ version, segundos }: PropsVigilante) {
  // Congelada al montar. Si una navegacion trajera una version distinta por prop, compararse contra
  // ella diria que todo esta al dia mientras el navegador sigue con el bundle viejo cargado.
  const [versionCargada] = useState(version)
  const [disponible, setDisponible] = useState<string | null>(null)
  const [descartada, setDescartada] = useState<string | null>(null)
  // `cerrando` sostiene el aviso montado mientras dura su salida; `recargando` gira el icono entre el
  // clic y la recarga, que en una conexion lenta puede tardar lo bastante como para dudar del clic.
  const [cerrando, setCerrando] = useState(false)
  const [recargando, setRecargando] = useState(false)
  const [bienvenida, setBienvenida] = useState<'obra' | 'saliendo' | null>(null)
  // Se elige una vez por carga y no en cada render: sortearla dentro del cuerpo cambiaria el dibujo
  // a mitad de la obra si algo mas obliga a repintar. El sorteo en el servidor no importa —esta capa
  // solo se muestra despues de montar, cuando el efecto de abajo encuentra la marca—.
  const [escena] = useState(elegirEscena)

  useEffect(() => {
    const marca = leerMarca()

    if (marca === null) return

    // Se borra antes de decidir: una marca que sobreviva a esta carga volveria a disparar la obra en
    // la proxima recarga, que ya no tiene nada de nueva.
    borrarMarca()

    // La marca dice a que version se venia. Si no es esta, entre el clic y la recarga entro otro
    // despliegue: no hay nada que celebrar, y el chequeo de abajo va a volver a avisar.
    if (marca !== versionCargada) {
      quitarTelon()
      return
    }

    const reducido = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
    const duracion = reducido ? OBRA_REDUCIDA : OBRA

    // Los tres momentos de la bienvenida, en temporizadores y no en el cuerpo del efecto. Leer
    // `sessionStorage` es mirar un sistema externo una vez; convertir esa lectura en un `setState`
    // sincrono encadenaria un render extra sobre el montaje. El telon ya esta puesto, asi que el
    // fotograma de diferencia no se ve.
    //
    // El telon se levanta al empezar la salida y no al montar esta capa: mientras dura la obra queda
    // debajo de ella —misma superficie, invisible— y asi no existe ni un fotograma en que la pagina
    // nueva quede al descubierto. Levantarlo antes dependeria de que React pinte en el mismo cuadro.
    const temporizadores = [
      globalThis.setTimeout(() => { setBienvenida('obra') }, 0),
      globalThis.setTimeout(() => {
        setBienvenida('saliendo')
        quitarTelon()
      }, duracion),
      globalThis.setTimeout(() => { setBienvenida(null) }, duracion + SALIDA)
    ]

    return () => {
      for (const temporizador of temporizadores) globalThis.clearTimeout(temporizador)
    }
  }, [versionCargada])

  useEffect(() => {
    const control = new AbortController()

    function preguntar (): void {
      // Con la pestaña oculta no se pregunta. El `visibilitychange` de abajo la pone al dia en cuanto
      // vuelve al frente, que es justo cuando el aviso le sirve a alguien.
      if (document.hidden) return

      fetch('/api/version', { signal: control.signal })
        .then(async (respuesta) => respuesta.ok ? await respuesta.json() as SobreVersion : null)
        .then((sobre) => {
          const servida = typeof sobre?.version === 'string' ? sobre.version : ''

          if (servida === '' || servida === versionCargada) return

          setDisponible(servida)
        })
        .catch(() => {
          // Que el chequeo falle no se muestra: el servidor caido o la red cortada ya se van a notar
          // en el trabajo real, y un error rojo permanente por esto seria ruido sobre ruido.
        })
    }

    const intervalo = globalThis.setInterval(preguntar, segundos * 1000)
    document.addEventListener('visibilitychange', preguntar)

    return () => {
      globalThis.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', preguntar)
      control.abort()
    }
  }, [versionCargada, segundos])

  /** Deja la marca para la carga siguiente y recarga. */
  function actualizar (): void {
    if (disponible === null) return

    try {
      sessionStorage.setItem(CLAVE_BIENVENIDA, disponible)
    } catch {
      // Sin `sessionStorage` —modo privado, almacenamiento bloqueado— se pierde la bienvenida, no la
      // actualizacion. Recargar igual es lo que importa.
    }

    setRecargando(true)
    globalThis.location.reload()
  }

  /** Deja ir el aviso por donde entro y recien entonces lo da por descartado. */
  function descartar (): void {
    if (disponible === null || cerrando) return

    setCerrando(true)
    globalThis.setTimeout(() => {
      setDescartada(disponible)
      setCerrando(false)
    }, SALIDA_AVISO)
  }

  const avisando = disponible !== null && disponible !== descartada

  return (
    <>
      {avisando && (
        <div
          role="status"
          className={cn(
            // En movil sube por encima del boton del chat (`ia/OrbeChatIA`, `bottom-6 right-4`,
            // 56px): centrada y a 30rem, la barra le llega justo encima en pantallas angostas.
            'fixed bottom-24 left-1/2 z-50 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 sm:bottom-5',
            cerrando ? 'animate-aviso-salir' : 'animate-aviso-entrar'
          )}
        >
          <div
            className={cn(
              'border-linea bg-superficie-flotante shadow-flotante relative flex items-center gap-3 overflow-hidden',
              'rounded-2xl border py-2.5 pr-2.5 pl-2.5',
              // Un hilo de acento en el borde superior: lo distingue de un aviso de error sin gritar.
              'before:via-acento before:pointer-events-none before:absolute before:inset-x-8 before:top-0 before:h-px',
              'before:bg-gradient-to-r before:from-transparent before:to-transparent'
            )}
          >
            <span
              aria-hidden="true"
              className="bg-acento-suave text-acento grid size-10 shrink-0 place-items-center rounded-xl"
            >
              <RefreshCw className={cn('size-[1.125rem]', recargando ? 'animate-spin' : 'animate-aviso-giro')} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-texto text-sm leading-tight font-semibold">Hay una versión nueva de Ops</p>
              <p className="text-texto-tenue mt-0.5 text-xs leading-snug">
                Actualiza cuando termines lo que estás haciendo.
              </p>
            </div>
            <Boton
              variante="primario"
              tamano="chico"
              className="pointer-coarse:min-h-11 shrink-0 active:scale-[0.97]"
              disabled={recargando}
              onClick={actualizar}
            >
              Actualizar
            </Boton>
            <Boton
              variante="sutil"
              tamano="chico"
              soloIcono
              className="pointer-coarse:min-h-11 pointer-coarse:min-w-11 shrink-0"
              aria-label="Descartar el aviso"
              onClick={descartar}
            >
              <X className="size-4" aria-hidden="true" />
            </Boton>
          </div>
        </div>
      )}

      {bienvenida !== null && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'bienvenida-capa bg-superficie fixed inset-0 z-[70] flex flex-col items-center justify-center gap-5',
            'transition-opacity duration-500',
            bienvenida === 'saliendo' && 'opacity-0'
          )}
        >
          <escena.Dibujo />
          <div className="space-y-1 px-6 text-center">
            <p className="text-texto text-base font-semibold">Ops se actualizó</p>
            <p className="text-texto-tenue text-sm">{escena.frase}</p>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Lee la marca que dejo la carga anterior al aceptar actualizar.
 *
 * @returns la version a la que se venia, o `null` si esta carga no viene de una actualizacion
 */
function leerMarca (): string | null {
  try {
    const marca = sessionStorage.getItem(CLAVE_BIENVENIDA)

    return marca === null || marca === '' ? null : marca
  } catch {
    return null
  }
}

/** Borra la marca. Un fallo no importa: sin marca legible tampoco hay bienvenida que disparar. */
function borrarMarca (): void {
  try {
    sessionStorage.removeItem(CLAVE_BIENVENIDA)
  } catch {
    // Ver `leerMarca`.
  }
}

/** Levanta el telon anti-destello que puso el script del `<head>`. */
function quitarTelon (): void {
  document.documentElement.removeAttribute(ATRIBUTO_BIENVENIDA)
}
