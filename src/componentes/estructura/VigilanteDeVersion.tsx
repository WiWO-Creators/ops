'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { ATRIBUTO_BIENVENIDA, CLAVE_BIENVENIDA } from '@/lib/bienvenida'
import { cn } from '@/lib/clases'
import { MonitoConstructor } from './MonitoConstructor'

/** Cuanto dura la obra antes de empezar a irse. */
const OBRA = 2200
/** Lo mismo para quien pidio menos movimiento: se ve el cartel, no se le hace esperar la animacion. */
const OBRA_REDUCIDA = 700
/** El fundido de salida. Tiene que coincidir con `duration-500` de la capa. */
const SALIDA = 500

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
 * la pantalla con la obra del monito y funde hacia el panel ya nuevo. El telon que evita el destello
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
  const [bienvenida, setBienvenida] = useState<'obra' | 'saliendo' | null>(null)

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

    globalThis.location.reload()
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
            'border-linea bg-superficie-flotante fixed bottom-24 left-1/2 z-50 -translate-x-1/2 sm:bottom-4',
            'flex w-[min(30rem,calc(100vw-2rem))] items-center gap-3 rounded-2xl border px-4 py-3 shadow-lg'
          )}
        >
          <div className="min-w-0 flex-1">
            <p className="text-texto text-sm font-semibold">Hay una versión nueva de Ops</p>
            <p className="text-texto-tenue text-xs">
              Esta pestaña sigue con la anterior. Actualiza cuando termines lo que estés haciendo.
            </p>
          </div>
          <Boton variante="primario" tamano="chico" onClick={actualizar}>Actualizar</Boton>
          <Boton
            variante="sutil"
            tamano="chico"
            soloIcono
            aria-label="Descartar el aviso"
            onClick={() => { setDescartada(disponible) }}
          >
            <X className="size-4" />
          </Boton>
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
          <MonitoConstructor />
          <div className="space-y-1 px-6 text-center">
            <p className="text-texto text-base font-semibold">Ops se actualizó</p>
            <p className="text-texto-tenue text-sm">Dejando todo en su lugar…</p>
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
