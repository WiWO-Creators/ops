'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { CodigoCopiable } from '@/componentes/presentadores/CodigoCopiable'
import { ATRIBUTO_AVISOS, EVENTO_ERROR, esRuidoDelNavegador, reportarIncidente, type AvisoDeError } from '@/lib/aviso-de-error'
import { duracionPorNivel, EVENTO_AVISO, type AvisoEmitido, type NivelAviso, agregarACola, quitarDeCola } from '@/lib/avisos'
import { NOMBRE_SOPORTE, URL_SOPORTE } from '@/lib/soporte'

/** Cuantos avisos se ven a la vez, sumando incidentes y avisos comunes. Mas que esto tapa la pantalla. */
const MAXIMO_VISIBLES = 3

/** Un aviso de error con incidente: no se cierra solo, porque el codigo hay que poder copiarlo. */
interface AvisoIncidente {
  origen: 'incidente'
  id: number
  mensaje: string
  /** El codigo del incidente. `null` mientras se pide o si no se pudo registrar. */
  incidente: string | null
  /** `true` mientras el servidor registra el reporte. */
  pidiendo: boolean
}

/** Un aviso comun (toast): exito, error liviano, informacion o advertencia. Se cierra solo. */
interface AvisoToast {
  origen: 'toast'
  id: number
  mensaje: string
  nivel: NivelAviso
}

type AvisoEnPila = AvisoIncidente | AvisoToast

/**
 * La pila de avisos del panel, abajo a la derecha: incidentes de error y avisos comunes (toast).
 *
 * === QUE RESUELVE (avisos de error) ===
 *
 * Antes, un error que no tumbaba la pantalla entera se mostraba donde cayera —un `<p>` rojo dentro
 * de un formulario, una fila de tabla que no se actualizaba— y no quedaba registrado en ninguna
 * parte. Quien lo sufria no tenia nada que reportar: «no me deja guardar» no se puede investigar.
 * Ahora cada uno de esos errores tiene una fila en Administración → Incidentes y un codigo de ocho
 * hexadecimales que la persona puede copiar y mandar a {@link URL_SOPORTE}.
 *
 * === POR QUE EL INCIDENTE NO SE CIERRA SOLO ===
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
 * El ruido del navegador tampoco —ver `esRuidoDelNavegador()` en `lib/aviso-de-error.ts`—: hay
 * errores que el navegador emite sin que se rompa nada y que solo tapan a los que si importan.
 *
 * === POR QUE LOS AVISOS COMUNES VIVEN EN LA MISMA PILA ===
 *
 * "Cliente guardado.", "No se pudo copiar el enlace." y el incidente de un error sin atrapar son la
 * misma clase de cosa para quien los ve: un mensaje flotante en la misma esquina. Fusionarlos evita
 * dos capas fijas superpuestas en el mismo rincón —cada una con su propio `view-transition-name`
 * peleandose por el mismo espacio— y deja un unico limite de "cuantos se ven a la vez". El aviso
 * comun se agrega y se cierra por su cuenta (`useAviso()`, en `lib/avisos.ts`); el registro de
 * incidentes de esta pila no lo toca.
 */
export function AvisosDeError () {
  const [avisos, establecerAvisos] = useState<AvisoEnPila[]>([])

  /**
   * Los mensajes de INCIDENTE que ya estan en la pila.
   *
   * La deduplicacion se decide aca y no dentro del `setState` porque no basta con no dibujar la
   * copia: si el aviso repetido llegara al reporte, cada vuelta de un `setInterval` que falla
   * escribiria una fila nueva en Incidentes con el mismo problema. Los avisos comunes no se dedupan:
   * dos "Guardado." seguidos son dos guardados distintos.
   */
  const mostrados = useRef(new Set<string>())

  /** Temporizadores de auto-cierre de los avisos comunes, por id, para poder cancelarlos. */
  const temporizadores = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const cerrar = useCallback((id: number) => {
    const temporizador = temporizadores.current.get(id)

    if (temporizador !== undefined) {
      clearTimeout(temporizador)
      temporizadores.current.delete(id)
    }

    establecerAvisos((actuales) => {
      const aviso = actuales.find((previo) => previo.id === id)

      if (aviso !== undefined && aviso.origen === 'incidente') mostrados.current.delete(aviso.mensaje)

      return quitarDeCola(actuales, id)
    })
  }, [])

  useEffect(() => {
    // El id lo lleva el efecto y no un `useRef` porque tambien lo usa el `then` del reporte: hace
    // falta el mismo numero en los dos momentos para poder actualizar la fila que ya se dibujo. Es
    // compartido entre incidentes y avisos comunes para que nunca choquen dos ids.
    let ultimoId = 0
    // La pila vive en el layout raiz y no se desmonta navegando, pero el modo estricto de React si
    // la desmonta y la vuelve a montar: sin esta bandera, el reporte que estaba en vuelo escribiria
    // estado sobre el efecto viejo.
    let vivo = true
    const activos = mostrados.current
    const timers = temporizadores.current

    /**
     * Agrega un incidente y, si hace falta, pide su codigo.
     *
     * Repetido no se agrega: un fetch que falla dentro de un `setInterval` emite el mismo aviso cada
     * pocos segundos, y la esquina se llenaria de copias del mismo problema.
     */
    const agregarIncidente = (aviso: AvisoDeError): void => {
      if (activos.has(aviso.mensaje)) return

      activos.add(aviso.mensaje)

      const id = ++ultimoId

      establecerAvisos((actuales) => {
        const nuevo: AvisoIncidente = {
          origen: 'incidente',
          id,
          mensaje: aviso.mensaje,
          incidente: aviso.incidente ?? null,
          pidiendo: aviso.incidente === undefined && aviso.reporte !== undefined
        }
        const pila = agregarACola(actuales, nuevo, MAXIMO_VISIBLES)
        const cayeron = actuales.length + 1 - pila.length

        // Lo que se cae de la pila deja de estar mostrado: si el mismo error vuelve a pasar mas
        // tarde, tiene que poder avisar de nuevo.
        if (cayeron > 0) {
          for (const caido of actuales.slice(0, cayeron)) {
            if (caido.origen === 'incidente') activos.delete(caido.mensaje)
          }
        }

        return pila
      })

      if (aviso.incidente !== undefined || aviso.reporte === undefined) return

      void reportarIncidente(aviso.reporte).then((incidente) => {
        if (!vivo) return

        establecerAvisos((actuales) => actuales.map(
          (previo) => previo.id === id && previo.origen === 'incidente' ? { ...previo, incidente, pidiendo: false } : previo
        ))
      })
    }

    /** Agrega un aviso comun y programa su cierre solo. */
    const agregarToast = (aviso: AvisoEmitido): void => {
      const id = ++ultimoId
      const duracion = aviso.duracionMs ?? duracionPorNivel(aviso.nivel)

      establecerAvisos((actuales) => agregarACola(actuales, { origen: 'toast', id, mensaje: aviso.mensaje, nivel: aviso.nivel }, MAXIMO_VISIBLES))

      timers.set(id, setTimeout(() => { cerrar(id) }, duracion))
    }

    const alAvisarIncidente = (evento: Event): void => {
      agregarIncidente((evento as CustomEvent<AvisoDeError>).detail)
    }

    const alAvisarToast = (evento: Event): void => {
      agregarToast((evento as CustomEvent<AvisoEmitido>).detail)
    }

    /** Un `ErrorEvent` sin `error` es un recurso que no cargo, no codigo que se rompio. */
    const alRomperse = (evento: ErrorEvent): void => {
      if (evento.error === undefined || evento.error === null) return

      const reporte = {
        tipo: nombreDelError(evento.error),
        mensaje: textoDelError(evento.error),
        metodo: 'VISTA',
        traza: trazaDelError(evento.error)
      }

      if (esRuidoDelNavegador(reporte)) return

      agregarIncidente({ mensaje: 'Algo falló en esta pantalla. Ya quedó registrado.', reporte })
    }

    const alRechazarse = (evento: PromiseRejectionEvent): void => {
      const reporte = {
        tipo: nombreDelError(evento.reason),
        mensaje: textoDelError(evento.reason),
        metodo: 'PROMESA',
        traza: trazaDelError(evento.reason)
      }

      if (esRuidoDelNavegador(reporte)) return

      agregarIncidente({ mensaje: 'Una acción quedó a medias por un error. Ya quedó registrado.', reporte })
    }

    window.addEventListener(EVENTO_ERROR, alAvisarIncidente)
    window.addEventListener(EVENTO_AVISO, alAvisarToast)
    window.addEventListener('error', alRomperse)
    window.addEventListener('unhandledrejection', alRechazarse)

    return () => {
      vivo = false
      window.removeEventListener(EVENTO_ERROR, alAvisarIncidente)
      window.removeEventListener(EVENTO_AVISO, alAvisarToast)
      window.removeEventListener('error', alRomperse)
      window.removeEventListener('unhandledrejection', alRechazarse)

      for (const temporizador of timers.values()) clearTimeout(temporizador)
      timers.clear()
    }
  }, [cerrar])

  if (avisos.length === 0) return null

  return (
    <div
      // El atributo marca la pila para las superposiciones: estando por encima de ellas, un clic aca
      // le llega a Radix como «clic fuera» y le cerraria el dialogo a quien solo queria descartar el
      // aviso. Ver `naceEnLosAvisos()` en `lib/aviso-de-error.ts`.
      {...{ [ATRIBUTO_AVISOS]: '' }}
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

/** Icono y clase de color de cada nivel de aviso comun. */
const PRESENTACION_POR_NIVEL: Record<NivelAviso, { Icono: typeof CheckCircle2, clase: string }> = {
  exito: { Icono: CheckCircle2, clase: 'text-texto-exito' },
  error: { Icono: AlertTriangle, clase: 'text-texto-peligro' },
  advertencia: { Icono: AlertTriangle, clase: 'text-texto-aviso' },
  info: { Icono: Info, clase: 'text-acento' }
}

/**
 * Un aviso de la pila: un incidente (con codigo, se cierra a mano) o un toast comun (se cierra solo).
 *
 * `role="alert"` en el incidente y en los niveles error/advertencia: cortan algo que la persona
 * estaba haciendo, asi que el lector de pantalla los anuncia de inmediato. `role="status"` en
 * exito/informacion: confirman algo, no interrumpen.
 */
function Aviso ({ aviso, onCerrar }: { aviso: AvisoEnPila, onCerrar: (id: number) => void }) {
  if (aviso.origen === 'toast') {
    const { Icono, clase } = PRESENTACION_POR_NIVEL[aviso.nivel]
    const urgente = aviso.nivel === 'error' || aviso.nivel === 'advertencia'

    return (
      <div
        role={urgente ? 'alert' : 'status'}
        aria-live={urgente ? 'assertive' : 'polite'}
        className="border-linea bg-superficie-flotante shadow-flotante rounded-tarjeta pointer-events-auto flex w-full items-start gap-3 border p-4"
      >
        <Icono size={18} strokeWidth={2.5} aria-hidden="true" className={`mt-0.5 shrink-0 ${clase}`} />
        <p className="text-texto min-w-0 flex-1 text-sm font-semibold text-pretty">{aviso.mensaje}</p>
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

  return (
    <div
      role="alert"
      className="border-linea bg-superficie-flotante shadow-flotante rounded-tarjeta pointer-events-auto flex w-full gap-3 border p-4"
    >
      <AlertTriangle size={18} strokeWidth={2.5} aria-hidden="true" className="text-texto-peligro mt-0.5 shrink-0" />

      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-texto text-sm font-semibold text-pretty">{aviso.mensaje}</p>

        {/* Una sola línea de pie, no tres. El código y a dónde mandarlo son el mismo gesto —copiar
            y reportar— y partidos en dos frases hacían que el aviso ocupara media pantalla para
            decir algo que se lee de un vistazo. Mientras el código se pide, el hueco se anuncia en
            vez de quedar en blanco: si apareciera después, parecería que se agregó solo. */}
        <p className="text-texto-tenue flex flex-wrap items-center gap-1 text-xs">
          {aviso.pidiendo && <span className="text-texto-sutil">Guardando el código…</span>}

          {aviso.incidente !== null && (
            <>
              <CodigoCopiable valor={aviso.incidente} className="bg-superficie-hundida" />
              <span aria-hidden="true">·</span>
            </>
          )}

          <a
            href={URL_SOPORTE}
            target="_blank"
            rel="noopener noreferrer"
            className="text-acento font-semibold underline underline-offset-2"
          >
            {aviso.incidente === null ? `Avisar a ${NOMBRE_SOPORTE}` : `Reportar a ${NOMBRE_SOPORTE}`}
          </a>
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
