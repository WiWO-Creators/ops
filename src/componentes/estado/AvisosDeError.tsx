'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { CodigoCopiable } from '@/componentes/presentadores/CodigoCopiable'
import { EVENTO_ERROR, reportarIncidente, type AvisoDeError } from '@/lib/aviso-de-error'
import { NOMBRE_SOPORTE, URL_SOPORTE } from '@/lib/soporte'

/** Cuantos avisos se ven a la vez. Mas que esto tapa la pantalla que la persona intenta usar. */
const MAXIMO_VISIBLES = 3

/** Lo que se muestra en la esquina: un aviso ya con su codigo, o esperandolo. */
interface AvisoEnPila {
  id: number
  mensaje: string
  /** El codigo del incidente. `null` mientras se pide o si no se pudo registrar. */
  incidente: string | null
  /** `true` mientras el servidor registra el reporte. */
  pidiendo: boolean
}

/**
 * La pila de avisos de error, abajo a la derecha.
 *
 * === QUE RESUELVE ===
 *
 * Antes, un error que no tumbaba la pantalla entera se mostraba donde cayera —un `<p>` rojo dentro
 * de un formulario, una fila de tabla que no se actualizaba— y no quedaba registrado en ninguna
 * parte. Quien lo sufria no tenia nada que reportar: «no me deja guardar» no se puede investigar.
 * Ahora cada uno de esos errores tiene una fila en Administración → Incidentes y un codigo de ocho
 * hexadecimales que la persona puede copiar y mandar a {@link URL_SOPORTE}.
 *
 * === POR QUE NO SE CIERRA SOLO ===
 *
 * Porque el codigo hay que poder copiarlo. Un aviso que se desvanece a los cinco segundos deja a la
 * persona mirando el lugar donde estaba el numero que necesitaba. Se cierra cuando ella lo cierra.
 *
 * === POR QUE ESCUCHA AL `window` ===
 *
 * Ademas de los avisos que emite el codigo del panel, engancha `error` y `unhandledrejection`: son
 * los errores que nadie atrapo —un `undefined` al pintar una lista, una promesa que nadie espero— y
 * son justamente los que antes no dejaban ningun rastro. Un error de carga de un recurso (una imagen
 * que no esta) no cuenta: llega como el mismo evento pero no corta lo que la persona estaba haciendo.
 */
export function AvisosDeError () {
  const [avisos, establecerAvisos] = useState<AvisoEnPila[]>([])

  /**
   * Los mensajes que ya estan en la pila.
   *
   * La deduplicacion se decide aca y no dentro del `setState` porque no basta con no dibujar la
   * copia: si el aviso repetido llegara al reporte, cada vuelta de un `setInterval` que falla
   * escribiria una fila nueva en Incidentes con el mismo problema.
   */
  const mostrados = useRef(new Set<string>())

  const cerrar = useCallback((id: number) => {
    establecerAvisos((actuales) => {
      const aviso = actuales.find((previo) => previo.id === id)

      if (aviso !== undefined) mostrados.current.delete(aviso.mensaje)

      return actuales.filter((previo) => previo.id !== id)
    })
  }, [])

  useEffect(() => {
    // El id lo lleva el efecto y no un `useRef` porque tambien lo usa el `then` del reporte: hace
    // falta el mismo numero en los dos momentos para poder actualizar la fila que ya se dibujo.
    let ultimoId = 0
    // La pila vive en el layout raiz y no se desmonta navegando, pero el modo estricto de React si
    // la desmonta y la vuelve a montar: sin esta bandera, el reporte que estaba en vuelo escribiria
    // estado sobre el efecto viejo.
    let vivo = true
    const activos = mostrados.current

    /**
     * Agrega un aviso y, si hace falta, pide su codigo.
     *
     * Repetido no se agrega: un fetch que falla dentro de un `setInterval` emite el mismo aviso cada
     * pocos segundos, y la esquina se llenaria de copias del mismo problema.
     */
    const agregar = (aviso: AvisoDeError): void => {
      if (activos.has(aviso.mensaje)) return

      activos.add(aviso.mensaje)

      const id = ++ultimoId

      establecerAvisos((actuales) => {
        const pila = [
          ...actuales,
          {
            id,
            mensaje: aviso.mensaje,
            incidente: aviso.incidente ?? null,
            pidiendo: aviso.incidente === undefined && aviso.reporte !== undefined
          }
        ]

        // Lo que se cae de la pila deja de estar mostrado: si el mismo error vuelve a pasar mas
        // tarde, tiene que poder avisar de nuevo.
        for (const caido of pila.slice(0, Math.max(0, pila.length - MAXIMO_VISIBLES))) {
          activos.delete(caido.mensaje)
        }

        return pila.slice(-MAXIMO_VISIBLES)
      })

      if (aviso.incidente !== undefined || aviso.reporte === undefined) return

      void reportarIncidente(aviso.reporte).then((incidente) => {
        if (!vivo) return

        establecerAvisos((actuales) => actuales.map(
          (previo) => previo.id === id ? { ...previo, incidente, pidiendo: false } : previo
        ))
      })
    }

    const alAvisar = (evento: Event): void => {
      agregar((evento as CustomEvent<AvisoDeError>).detail)
    }

    /** Un `ErrorEvent` sin `error` es un recurso que no cargo, no codigo que se rompio. */
    const alRomperse = (evento: ErrorEvent): void => {
      if (evento.error === undefined || evento.error === null) return

      agregar({
        mensaje: 'Algo falló en esta pantalla. Ya quedó registrado.',
        reporte: {
          tipo: nombreDelError(evento.error),
          mensaje: textoDelError(evento.error),
          metodo: 'VISTA',
          traza: trazaDelError(evento.error)
        }
      })
    }

    const alRechazarse = (evento: PromiseRejectionEvent): void => {
      agregar({
        mensaje: 'Una acción quedó a medias por un error. Ya quedó registrado.',
        reporte: {
          tipo: nombreDelError(evento.reason),
          mensaje: textoDelError(evento.reason),
          metodo: 'PROMESA',
          traza: trazaDelError(evento.reason)
        }
      })
    }

    window.addEventListener(EVENTO_ERROR, alAvisar)
    window.addEventListener('error', alRomperse)
    window.addEventListener('unhandledrejection', alRechazarse)

    return () => {
      vivo = false
      window.removeEventListener(EVENTO_ERROR, alAvisar)
      window.removeEventListener('error', alRomperse)
      window.removeEventListener('unhandledrejection', alRechazarse)
    }
  }, [])

  if (avisos.length === 0) return null

  return (
    <div
      // `z-[55]` queda sobre los dialogos y los cajones —z-50, el mayor en uso— porque un error al
      // guardar desde un dialogo tiene que verse; y bajo el telon de la bienvenida, que es 60.
      //
      // `view-transition-name` propio, igual que la capa de bienvenida: el panel envuelve cada pagina
      // en `<ViewTransition>`, y mientras la transicion corre el navegador pinta la pagina en la capa
      // superior, por encima de cualquier `z-index`. Sin un nombre propio, el aviso desaparece
      // durante los primeros fotogramas de cada navegacion. Ver `src/estilos/monito.css`.
      style={{ viewTransitionName: 'avisos-de-error' }}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex flex-col items-end gap-2 p-4 sm:left-auto sm:max-w-sm"
    >
      {avisos.map((aviso) => (
        <Aviso key={aviso.id} aviso={aviso} onCerrar={cerrar} />
      ))}
    </div>
  )
}

/**
 * Un aviso de la pila.
 *
 * `role="alert"` y no `status`: corta una accion de la persona, asi que el lector de pantalla lo
 * anuncia en cuanto aparece.
 */
function Aviso ({ aviso, onCerrar }: { aviso: AvisoEnPila, onCerrar: (id: number) => void }) {
  return (
    <div
      role="alert"
      className="border-linea bg-superficie-flotante shadow-flotante rounded-tarjeta pointer-events-auto flex w-full gap-3 border p-4"
    >
      <AlertTriangle size={18} strokeWidth={2.5} aria-hidden="true" className="text-texto-peligro mt-0.5 shrink-0" />

      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-texto text-sm font-semibold">{aviso.mensaje}</p>

        {aviso.incidente !== null && (
          <p className="text-texto-tenue flex flex-wrap items-center gap-1 text-xs">
            Código del error:
            <CodigoCopiable valor={aviso.incidente} className="bg-superficie-hundida" />
          </p>
        )}

        {/* Mientras el codigo se pide, el hueco se anuncia en vez de quedar en blanco: si el aviso
            apareciera sin el numero y el numero llegara despues, parece que se agrego solo. */}
        {aviso.pidiendo && <p className="text-texto-sutil text-xs">Guardando el código del error…</p>}

        <p className="text-texto-tenue text-xs">
          {aviso.incidente === null && !aviso.pidiendo
            ? `Si vuelve a pasar, cuéntanoslo en `
            : `Repórtalo con ese código en `}
          <a
            href={URL_SOPORTE}
            target="_blank"
            rel="noopener noreferrer"
            className="text-acento font-semibold underline underline-offset-2"
          >
            {NOMBRE_SOPORTE}
          </a>
          .
        </p>
      </div>

      <button
        type="button"
        onClick={() => { onCerrar(aviso.id) }}
        aria-label="Cerrar el aviso"
        className="text-texto-sutil hover:text-texto hover:bg-superficie ml-auto size-7 shrink-0 rounded transition-colors"
      >
        <X size={15} strokeWidth={2.5} aria-hidden="true" className="mx-auto" />
      </button>
    </div>
  )
}

/** Clase del error, para agrupar incidentes parecidos. Lo que no sea un `Error` se anota como tal. */
function nombreDelError (causa: unknown): string {
  return causa instanceof Error ? causa.name : 'ValorLanzado'
}

/** El mensaje tecnico, que va al incidente y **no** a la pantalla: puede nombrar rutas del servidor. */
function textoDelError (causa: unknown): string {
  if (causa instanceof Error) return causa.message

  return typeof causa === 'string' ? causa : `Se lanzó un ${typeof causa}`
}

/** La traza, cuando el error la trae. Sin ella el incidente dice el sintoma y no el camino. */
function trazaDelError (causa: unknown): string | undefined {
  return causa instanceof Error ? causa.stack : undefined
}
