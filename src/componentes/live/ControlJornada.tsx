'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Clock, Play, Square, Timer } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import {
  ContenidoMenu,
  DisparadorMenu,
  MenuContextual
} from '@/componentes/superposiciones/MenuContextual'
import { formatearDuracion } from '@/componentes/proyecto/cronometro'
import type { EstadoDeJornada } from '@/datos/live'
import { GLOSARIO } from '@/dominio/glosario'
import { mensajeDeFalloDeJornada, mensajeDeFalloDeMedidor } from '@/dominio/live'
import { cn } from '@/lib/clases'
import { avisarCambioDeMedidor, escucharMedidor } from './medidor'
import { SelectorEspacio } from './SelectorEspacio'

/**
 * Jornada y medidor, en un solo control.
 *
 * === POR QUE UNO SOLO Y EN LA CABECERA ===
 *
 * La jornada no es de una pantalla: es del dia. Vivia en el Inicio (`CronometroAbierto`) y por eso
 * solo se veia al entrar; quien pasaba la mañana en la ficha de un proceso no tenia forma de saber
 * que dejo un medidor corriendo. En la cabecera esta en las ocho pantallas.
 *
 * No va en la barra lateral porque la barra se abate a un riel de 4.5rem y en movil desaparece
 * dentro de un cajon: el control quedaria escondido justo donde mas se necesita. La cabecera mide
 * `h-14` fijos, asi que el control colapsado **no puede crecer mas que un boton** — todo lo demas
 * vive en el desplegable.
 *
 * === LAS DOS VARIANTES SON EL MISMO COMPONENTE ===
 *
 * `compacta` es el boton de la cabecera; `panel` es el mismo cuerpo abierto dentro de `/live`. Un
 * segundo componente para la pantalla grande seria una segunda copia de la logica de arranque, y con
 * ella la segunda forma de que los dos numeros digan cosas distintas.
 *
 * === EL CONTADOR NO LEE EL RELOJ DEL NAVEGADOR ===
 *
 * Los segundos los calcula el servidor y llegan en `seconds`; aca solo se les suma **el tiempo
 * transcurrido desde la lectura**. Restar `Date.now()` contra `started_at` meteria el desfase de
 * reloj de quien mira dentro del dato, que es de donde salen los "hace -3 minutos" de siempre.
 *
 * Y arranca en cero: el primer pintado del cliente tiene que dar el mismo texto que el del servidor,
 * o React reporta un error de hidratacion. El contador empieza a correr despues del montaje.
 */

interface PropsControlJornada {
  variante: 'compacta' | 'panel'
  /** Cada cuantos segundos se vuelve a preguntar. Lo resuelve el servidor (`intervaloDeLive()`). */
  segundos: number
  /** El estado ya resuelto en el servidor, para que el control no nazca en blanco. */
  inicial: EstadoDeJornada | null
  /** Mensaje si el servidor no pudo leer la jornada al pintar. */
  errorInicial?: string | null
  className?: string
}

export function ControlJornada ({
  variante,
  segundos,
  inicial,
  errorInicial = null,
  className
}: PropsControlJornada) {
  const [estado, setEstado] = useState<EstadoDeJornada | null>(inicial)
  const [transcurrido, setTranscurrido] = useState(0)
  const [errorDeRed, setErrorDeRed] = useState<string | null>(errorInicial)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enCurso, setEnCurso] = useState(false)
  const [espacioElegido, setEspacioElegido] = useState<number | null>(null)
  /** El Espacio cuyo arranque choco con la falta de jornada, a la espera de "Abrir jornada y arrancar". */
  const [pendiente, setPendiente] = useState<number | null>(null)
  const [intento, setIntento] = useState(0)

  /** Cuando se leyo `estado`. El contador cuenta desde aca, no desde `started_at`. */
  const leidoEn = useRef(0)

  // `Date.now()` no se puede leer durante el render —regla de pureza de React— y tampoco haria falta:
  // el contador arranca en cero para no romper la hidratacion, asi que la marca se sella al montar,
  // que es justo cuando empieza a correr.
  useEffect(() => { leidoEn.current = Date.now() }, [])

  const aplicar = useCallback((nuevo: EstadoDeJornada): void => {
    leidoEn.current = Date.now()
    setEstado(nuevo)
    setTranscurrido(0)
    setErrorDeRed(null)
  }, [])

  const refrescar = useCallback(async (senal: AbortSignal): Promise<void> => {
    const respuesta = await fetch('/api/bff/me/jornada', { signal: senal })

    if (!respuesta.ok) throw new Error('La API no respondió a la consulta de la jornada.')

    const sobre = await respuesta.json() as { data: EstadoDeJornada }

    aplicar(sobre.data)
  }, [aplicar])

  useEffect(() => {
    const control = new AbortController()

    function tic (): void {
      // Con la pestaña oculta no se pregunta: nadie esta mirando, y el control se pone al dia solo
      // en cuanto vuelve al frente. Mismo criterio que `auditoria/PanelEnVivo`.
      if (document.hidden) return

      refrescar(control.signal).catch((fallo: unknown) => {
        if (control.signal.aborted) return

        setErrorDeRed(fallo instanceof Error ? fallo.message : 'No se pudo actualizar la jornada.')
      })
    }

    // Un cambio propio ya trae su refresco: esto sirve para el primer pintado del cliente cuando el
    // servidor no pudo resolver el estado, y para volver a leer tras una accion.
    if (intento > 0) tic()

    const intervalo = globalThis.setInterval(tic, segundos * 1000)
    document.addEventListener('visibilitychange', tic)
    // El medidor tambien se toca desde la ficha del proceso y desde el panel de tiempos. Sin esta
    // suscripcion, detenerlo alla dejaria el contador de la cabecera corriendo hasta el proximo
    // intervalo: dos numeros distintos sobre el mismo hecho, en la misma pantalla.
    const dejarDeEscuchar = escucharMedidor(tic)

    return () => {
      globalThis.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', tic)
      dejarDeEscuchar()
      control.abort()
    }
  }, [refrescar, segundos, intento])

  const jornadaAbierta = estado?.open != null
  const medidor = estado?.timer ?? null
  const corriendo = jornadaAbierta || medidor !== null

  useEffect(() => {
    if (!corriendo) return

    const id = globalThis.setInterval(() => {
      setTranscurrido((Date.now() - leidoEn.current) / 1000)
    }, 1000)

    return () => { globalThis.clearInterval(id) }
  }, [corriendo])

  /** Vuelve a pedirle el estado al servidor: es el unico que sabe como quedo. */
  function recargar (): void {
    setIntento((previo) => previo + 1)
  }

  const segundosJornada = (estado?.seconds ?? 0) + transcurrido
  const segundosMedidor = medidor === null ? 0 : medidor.seconds + transcurrido

  /**
   * Llama al BFF y devuelve el codigo de estado.
   *
   * `0` significa que la peticion no llego a salir: sin respuesta no hay codigo, y
   * `mensajeDeFalloDe*` lo traduce a "revisa la conexion" en vez de a un numero inventado.
   */
  async function llamar (ruta: string, metodo: 'POST' | 'DELETE'): Promise<number> {
    try {
      const respuesta = await fetch(`/api/bff/${ruta}`, {
        method: metodo,
        headers: metodo === 'POST' ? { 'content-type': 'application/json' } : undefined,
        body: metodo === 'POST' ? '{}' : undefined
      })

      return respuesta.status
    } catch {
      return 0
    }
  }

  /** `true` si la API acepto la escritura. `201` en las altas, `200` o `204` en el resto. */
  function acepto (estadoHttp: number): boolean {
    return estadoHttp >= 200 && estadoHttp < 300
  }

  async function abrirJornada (): Promise<boolean> {
    setEnCurso(true)
    setAviso(null)

    const respuesta = await llamar('me/jornada', 'POST')

    setEnCurso(false)

    if (acepto(respuesta)) {
      recargar()
      return true
    }

    setAviso(mensajeDeFalloDeJornada(respuesta, true))
    return false
  }

  async function cerrarJornada (): Promise<void> {
    setEnCurso(true)
    setAviso(null)

    const respuesta = await llamar('me/jornada/cierre', 'POST')

    setEnCurso(false)

    if (!acepto(respuesta)) {
      setAviso(mensajeDeFalloDeJornada(respuesta, false))
      return
    }

    // El cierre detiene los medidores abiertos del lado de la API: las fichas de proceso que esten
    // montadas tienen que enterarse igual que si se hubiera detenido a mano.
    avisarCambioDeMedidor()
    recargar()
  }

  async function arrancar (espacioId: number): Promise<void> {
    setEnCurso(true)
    setAviso(null)
    setPendiente(null)

    const respuesta = await llamar(`projects/${espacioId}/timer`, 'POST')

    setEnCurso(false)

    if (acepto(respuesta)) {
      avisarCambioDeMedidor()
      recargar()
      return
    }

    // La jornada es obligatoria para medir, y la API lo dice con un 409. En vez del error crudo se
    // ofrece la salida — abrir la jornada y volver a intentar—, que es lo que la persona iba a hacer
    // de todas formas.
    if (respuesta === 409 && !jornadaAbierta) {
      setPendiente(espacioId)
      return
    }

    setAviso(mensajeDeFalloDeMedidor(respuesta, true))
  }

  /**
   * Abre la jornada y arranca el medidor. **Un solo reintento**, nunca una cadena: si el segundo
   * arranque tambien falla, el motivo ya no es la jornada y repetirlo solo esconde el error.
   */
  async function abrirYArrancar (espacioId: number): Promise<void> {
    setPendiente(null)

    if (!await abrirJornada()) return

    setEnCurso(true)

    const respuesta = await llamar(`projects/${espacioId}/timer`, 'POST')

    setEnCurso(false)

    if (acepto(respuesta)) avisarCambioDeMedidor()
    else setAviso(mensajeDeFalloDeMedidor(respuesta, true))

    // Se recarga pase lo que pase: la jornada quedo abierta aunque el medidor no arrancara.
    recargar()
  }

  async function detenerMedidor (): Promise<void> {
    if (medidor === null) return

    setEnCurso(true)
    setAviso(null)

    const respuesta = await llamar(`live/timers/${medidor.id}`, 'DELETE')

    setEnCurso(false)

    if (!acepto(respuesta)) {
      setAviso(mensajeDeFalloDeMedidor(respuesta, false))
      return
    }

    avisarCambioDeMedidor()
    recargar()
  }

  const cuerpo = (
    <CuerpoControl
      estado={estado}
      medidor={medidor}
      jornadaAbierta={jornadaAbierta}
      segundosJornada={segundosJornada}
      segundosMedidor={segundosMedidor}
      espacioElegido={espacioElegido}
      onElegirEspacio={setEspacioElegido}
      pendiente={pendiente}
      enCurso={enCurso}
      aviso={aviso}
      errorDeRed={errorDeRed}
      onAbrir={() => { void abrirJornada() }}
      onCerrar={() => { void cerrarJornada() }}
      onArrancar={(id) => { void arrancar(id) }}
      onAbrirYArrancar={(id) => { void abrirYArrancar(id) }}
      onDetener={() => { void detenerMedidor() }}
    />
  )

  if (variante === 'panel') {
    return (
      <section className={cn('border-linea bg-superficie-elevada rounded-tarjeta border p-4', className)}>
        <h2 className="text-texto text-titulo mb-3 font-semibold">Mi jornada</h2>
        {cuerpo}
      </section>
    )
  }

  return (
    // `modal={false}` para que el desplegable no apague los eventos del resto del documento: el
    // selector de Espacio se pinta en su propio portal, y con el menu modal quedaria inerte.
    <MenuContextual modal={false}>
      <DisparadorMenu
        aria-label="Jornada y medidor"
        className={cn(
          'rounded-control border-control-borde bg-control text-texto inline-flex h-8 max-w-44 items-center gap-2 border px-2.5 text-xs font-semibold',
          'hover:bg-hover transition-colors duration-150',
          className
        )}
      >
        <Punto activo={corriendo} midiendo={medidor !== null} />
        {jornadaAbierta
          ? (
            <span data-numerico className="truncate font-mono tabular-nums">
              {formatearDuracion(medidor === null ? segundosJornada : segundosMedidor)}
            </span>
            )
          : <span className="truncate">Iniciar jornada</span>}
      </DisparadorMenu>

      <ContenidoMenu
        align="end"
        className="w-80 p-3"
        // Un clic dentro del desplegable del selector de Espacio ocurre fuera de este menu —vive en
        // otro portal— y lo cerraria justo al elegir. Los popovers propios no cuentan como afuera.
        onInteractOutside={(evento) => {
          const destino = evento.target

          if (destino instanceof Element && destino.closest('[data-radix-popper-content-wrapper]')) {
            evento.preventDefault()
          }
        }}
      >
        {cuerpo}
      </ContenidoMenu>
    </MenuContextual>
  )
}

/** El punto de estado del boton colapsado. Decorativo: el texto de al lado ya dice que pasa. */
function Punto ({ activo, midiendo }: { activo: boolean, midiendo: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'size-2 shrink-0 rounded-full',
        midiendo ? 'bg-acento' : activo ? 'bg-texto-exito' : 'bg-texto-sutil'
      )}
    />
  )
}

interface PropsCuerpo {
  estado: EstadoDeJornada | null
  medidor: EstadoDeJornada['timer']
  jornadaAbierta: boolean
  segundosJornada: number
  segundosMedidor: number
  espacioElegido: number | null
  onElegirEspacio: (id: number) => void
  pendiente: number | null
  enCurso: boolean
  aviso: string | null
  errorDeRed: string | null
  onAbrir: () => void
  onCerrar: () => void
  onArrancar: (espacioId: number) => void
  onAbrirYArrancar: (espacioId: number) => void
  onDetener: () => void
}

/**
 * El cuerpo compartido por las dos variantes: primero la jornada, despues el medidor.
 *
 * Ese orden no es decorativo: sin jornada no hay medidor, y ponerlo al reves ofreceria arrancar algo
 * que la API va a rechazar.
 */
function CuerpoControl ({
  estado,
  medidor,
  jornadaAbierta,
  segundosJornada,
  segundosMedidor,
  espacioElegido,
  onElegirEspacio,
  pendiente,
  enCurso,
  aviso,
  errorDeRed,
  onAbrir,
  onCerrar,
  onArrancar,
  onAbrirYArrancar,
  onDetener
}: PropsCuerpo) {
  const idSelector = useId()

  return (
    <div className="flex flex-col gap-3">
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <span className="text-texto-tenue flex items-center gap-1.5 text-xs font-semibold">
              <Clock size={14} strokeWidth={2} aria-hidden="true" />
              Jornada
            </span>
            {jornadaAbierta
              ? (
                <span
                  data-numerico
                  className="text-texto font-mono text-titulo font-semibold tabular-nums"
                  aria-label={`Jornada abierta: ${formatearDuracion(segundosJornada)}`}
                >
                  {formatearDuracion(segundosJornada)}
                </span>
                )
              : <span className="text-texto-sutil text-sm">Sin jornada abierta</span>}
          </div>

          <Boton
            variante={jornadaAbierta ? 'secundario' : 'primario'}
            tamano="chico"
            cargando={enCurso}
            onClick={jornadaAbierta ? onCerrar : onAbrir}
          >
            {jornadaAbierta ? 'Cerrar jornada' : 'Abrir jornada'}
          </Boton>
        </div>

        {jornadaAbierta && estado !== null && (
          <p className="text-texto-sutil text-xs tabular-nums">
            Medido {formatearDuracion(estado.measured_seconds)} · sin cubrir{' '}
            {formatearDuracion(estado.uncovered_seconds)}
          </p>
        )}

        {estado?.over_journey === true && (
          <p role="status" className="text-texto-aviso text-xs">
            Llevas más horas abiertas que una jornada completa.
          </p>
        )}
      </section>

      <div className="bg-linea h-px" />

      <section className="flex flex-col gap-2">
        <span className="text-texto-tenue flex items-center gap-1.5 text-xs font-semibold">
          <Timer size={14} strokeWidth={2} aria-hidden="true" />
          Medidor
        </span>

        {medidor === null
          ? (
            <>
              <label htmlFor={idSelector} className="text-texto-sutil text-xs">
                Sobre qué {GLOSARIO.espacio.singular.toLowerCase()} medir
              </label>
              <SelectorEspacio
                id={idSelector}
                valor={espacioElegido}
                onElegir={onElegirEspacio}
                deshabilitado={enCurso}
              />

              {pendiente === null
                ? (
                  <Boton
                    variante="primario"
                    tamano="chico"
                    cargando={enCurso}
                    disabled={espacioElegido === null}
                    onClick={() => { if (espacioElegido !== null) onArrancar(espacioElegido) }}
                    className="self-start"
                  >
                    <Play size={14} strokeWidth={2} aria-hidden="true" />
                    Arrancar
                  </Boton>
                  )
                : (
                  <Boton
                    variante="primario"
                    tamano="chico"
                    cargando={enCurso}
                    onClick={() => { onAbrirYArrancar(pendiente) }}
                    className="self-start"
                  >
                    <Play size={14} strokeWidth={2} aria-hidden="true" />
                    Abrir jornada y arrancar
                  </Boton>
                  )}
            </>
            )
          : (
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col">
                <span className="text-texto truncate text-sm font-medium">
                  {medidor.task?.name ?? medidor.project?.name ?? 'Sin destino'}
                </span>
                <span
                  data-numerico
                  className="text-texto-tenue font-mono text-sm tabular-nums"
                  aria-label={`Medidor corriendo: ${formatearDuracion(segundosMedidor)}`}
                >
                  {formatearDuracion(segundosMedidor)}
                </span>
              </div>

              <Boton variante="secundario" tamano="chico" cargando={enCurso} onClick={onDetener}>
                <Square size={14} strokeWidth={2} aria-hidden="true" />
                Detener
              </Boton>
            </div>
            )}
      </section>

      {aviso !== null && <p role="alert" className="text-texto-peligro text-pretty text-xs">{aviso}</p>}
      {errorDeRed !== null && (
        <p role="status" className="text-texto-sutil text-pretty text-xs">{errorDeRed}</p>
      )}
    </div>
  )
}
