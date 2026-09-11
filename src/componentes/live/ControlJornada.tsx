'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
import { faltaAbrirJornada, mensajeDeFalloDeJornada, mensajeDeFalloDeMedidor } from '@/dominio/live'
import { cn } from '@/lib/clases'
import { CierreJornada } from './CierreJornada'
import { DestinoDeJornada } from './DestinoDeJornada'
import { avisarCambioDeMedidor, escucharMedidor } from './medidor'

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
 *
 * === EL PROYECTO Y LA TAREA BLOQUEAN LOS DOS ===
 *
 * Ya no hay "el Espacio bloquea y la Tarea se pide". La reunion del 2026-09-11 revirtio la decision
 * de la migracion `0260`: sin Proceso exacto el registro no es util, porque tiempo cargado a un
 * Proyecto entero dice a quien facturarle y no dice en que se fue el dia. La API lo exige
 * (`POST /me/jornada` pide `project_id` Y `task_id`, y comprueba que uno pertenezca al otro) y
 * `POST /projects/{id}/timer` —el unico camino que escribia filas sin Proceso— responde 422.
 *
 * === POR QUE LA ELECCION VIVE EN UN MODAL Y NO ACA DENTRO ===
 *
 * Porque un desplegable no obliga: se cierra clicando en cualquier parte y quien no queria elegir
 * simplemente no elige. `DestinoDeJornada` es la ventana que se abre **sola** al entrar sin jornada
 * y no se va con `Escape` — el mismo trato que ya tenia el cierre, aplicado al lado que mas importa,
 * porque lo que no se elige al empezar ya no se puede elegir despues.
 *
 * Ese modal es tambien el unico sitio donde se elige destino: el control tenia dos copias del
 * selector de Espacio —una para abrir y otra para arrancar— y las dos se fueron con el.
 *
 * === EL BLOQUEO NO PUEDE DEJAR A NADIE ENCERRADO ===
 *
 * La ventana se exige solo con `estado` leido de verdad: si la API no contesto, `estado` es `null` y
 * no se bloquea nada. Un backend caido no puede dejar a media empresa mirando un velo — y ademas no
 * hay forma de saber si esa persona ya tiene la jornada abierta, asi que bloquear seria adivinar.
 *
 * El resto de las salidas —cerrar sesion, o entrar sin jornada por esta vez— vive dentro del modal.
 * Ver `DestinoDeJornada`.
 */

interface PropsControlJornada {
  variante: 'compacta' | 'panel'
  /** Cada cuantos segundos se vuelve a preguntar. Lo resuelve el servidor (`intervaloDeLive()`). */
  segundos: number
  /** El estado ya resuelto en el servidor, para que el control no nazca en blanco. */
  inicial: EstadoDeJornada | null
  /**
   * Quien mira (`/me`). Hace falta para listar sus Tareas: solo se puede arrancar un cronometro
   * sobre una Tarea asignada a uno —la API responde 403 al resto— asi que el combo pide `assignee`.
   */
  staffId: number
  /** Su nombre, primer escalon de la jerarquia del modal. No se elige: la jornada es de quien mira. */
  nombre: string
  /** Mensaje si el servidor no pudo leer la jornada al pintar. */
  errorInicial?: string | null
  className?: string
}

export function ControlJornada ({
  variante,
  segundos,
  inicial,
  staffId,
  nombre,
  errorInicial = null,
  className
}: PropsControlJornada) {
  const [estado, setEstado] = useState<EstadoDeJornada | null>(inicial)
  const [transcurrido, setTranscurrido] = useState(0)
  const [errorDeRed, setErrorDeRed] = useState<string | null>(errorInicial)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enCurso, setEnCurso] = useState(false)
  /** `true` mientras el dialogo de cierre esta abierto. Cerrar la jornada ya no es un solo clic. */
  const [confirmandoCierre, setConfirmandoCierre] = useState(false)
  /** `true` cuando el modal de destino se pidio a mano, y no porque falte la jornada. */
  const [pidiendoDestino, setPidiendoDestino] = useState(false)
  /** `true` cuando se uso la salida de emergencia. Dura lo que dure esta pestaña; ver el docblock. */
  const [entroSinJornada, setEntroSinJornada] = useState(false)
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
  async function llamar (
    ruta: string,
    metodo: 'POST' | 'DELETE',
    cuerpo: Record<string, unknown> = {}
  ): Promise<number> {
    try {
      const respuesta = await fetch(`/api/bff/${ruta}`, {
        method: metodo,
        headers: metodo === 'POST' ? { 'content-type': 'application/json' } : undefined,
        body: metodo === 'POST' ? JSON.stringify(cuerpo) : undefined
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

  /**
   * Abre la jornada con su Proyecto y su Tarea, en **una sola peticion**.
   *
   * Antes eran dos —`POST /me/jornada` y despues el arranque del medidor— y entre una y otra cabia
   * un corte de red: la jornada quedaba abierta y sin nada que medir, que es justo lo que la regla
   * quiere impedir. Lo resuelve la API: con `project_id` y `task_id` abre las dos cosas o ninguna, y
   * si el cronometro falla descarta la jornada que acababa de abrir.
   *
   * Por eso aca no hay compensacion ni reintento. Un fallo deja el estado como estaba y el aviso
   * dice por que: 403 si la Tarea no es suya, 404 si ya no esta, 422 si el par no se corresponde,
   * 409 si otra pestaña abrio la jornada primero.
   */
  async function abrirYArrancar (espacioId: number, tareaId: number): Promise<void> {
    setEnCurso(true)
    setAviso(null)

    const respuesta = await llamar('me/jornada', 'POST', {
      project_id: espacioId,
      task_id: tareaId
    })

    setEnCurso(false)

    if (acepto(respuesta)) {
      setPidiendoDestino(false)
      avisarCambioDeMedidor()
      recargar()
      return
    }

    setAviso(mensajeDeFalloDeJornada(respuesta, true))
    // El 409 al abrir significa que ya hay una jornada abierta y esta pantalla quedo vieja: otra
    // pestaña la abrio. Se vuelve a leer para que el control lo muestre ahora y no en el proximo
    // intervalo, con la persona mirando un boton que ya no corresponde.
    if (respuesta === 409) recargar()
  }

  /**
   * Cierra la jornada con el comentario que se escribio en el dialogo.
   *
   * `comentario` viene ya recortado de `<CierreJornada>` y es `null` cuando no se escribio nada: la
   * API lo acepta ausente —este POST se mandaba vacio hasta ahora— y rechaza con 422 lo que pase de
   * su tope, que es el mismo `maxLength` del campo.
   */
  async function cerrarJornada (comentario: string | null): Promise<void> {
    setEnCurso(true)
    setAviso(null)

    const respuesta = await llamar(
      'me/jornada/cierre',
      'POST',
      comentario === null ? {} : { comment: comentario }
    )

    setEnCurso(false)

    if (!acepto(respuesta)) {
      setAviso(mensajeDeFalloDeJornada(respuesta, false))
      return
    }

    setConfirmandoCierre(false)
    // Cerrar la jornada la vuelve a exigir: es el mismo estado que al entrar por la mañana, y la
    // excepcion que se hubiera usado antes no puede sobrevivir al dia que ya se cerro.
    setEntroSinJornada(false)
    // El cierre detiene los medidores abiertos del lado de la API: las fichas de proceso que esten
    // montadas tienen que enterarse igual que si se hubiera detenido a mano.
    avisarCambioDeMedidor()
    recargar()
  }

  /**
   * Arranca el cronometro de una Tarea con la jornada ya abierta.
   *
   * El Proyecto no viaja: la fila cuelga de la Tarea y el Espacio se deriva de su `rel_id`. Sirve
   * para elegir a que se le imputa el rato siguiente sin cerrar el dia y volver a abrirlo.
   */
  async function arrancar (tareaId: number): Promise<void> {
    setEnCurso(true)
    setAviso(null)

    const respuesta = await llamar(`tasks/${tareaId}/timer`, 'POST')

    setEnCurso(false)

    if (acepto(respuesta)) {
      setPidiendoDestino(false)
      avisarCambioDeMedidor()
      recargar()
      return
    }

    setAviso(mensajeDeFalloDeMedidor(respuesta, true))
    // El 409 con la jornada cerrada de por medio —se cerro sola a la hora de corte, o desde otra
    // pestaña— se resuelve volviendo a leer: el control pasa a exigir la apertura otra vez. No se
    // reintenta aca: una cadena de reintentos convierte un 409 legitimo (ya hay un medidor
    // corriendo) en un bucle silencioso.
    if (respuesta === 409) recargar()
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

  // La compuerta de entrada. Solo la monta la variante de la cabecera: es la unica que existe una
  // sola vez en toda la aplicacion, y dos modales con el mismo trabajo se pisarian en `/live`.
  const exigeJornada = variante === 'compacta' && !entroSinJornada && faltaAbrirJornada(estado)
  const destinoAbierto = exigeJornada || pidiendoDestino

  const cuerpo = (
    <CuerpoControl
      estado={estado}
      medidor={medidor}
      jornadaAbierta={jornadaAbierta}
      segundosJornada={segundosJornada}
      segundosMedidor={segundosMedidor}
      enCurso={enCurso}
      aviso={confirmandoCierre || destinoAbierto ? null : aviso}
      errorDeRed={errorDeRed}
      onElegirDestino={() => { setAviso(null); setPidiendoDestino(true) }}
      onCerrar={() => { setConfirmandoCierre(true) }}
      onDetener={() => { void detenerMedidor() }}
    />
  )

  /*
   * Los dos dialogos van fuera del desplegable a proposito. El control compacto vive dentro de un
   * menu de Radix, y un clic en un dialogo ocurre fuera de ese menu: el menu se cierra, y con el se
   * desmontaria el dialogo entero a mitad de la operacion. Como hermanos sobreviven a que el
   * desplegable se cierre.
   */
  const dialogos = (
    <>
      <CierreJornada
        abierto={confirmandoCierre}
        onSeguir={() => { setConfirmandoCierre(false) }}
        staffId={staffId}
        cerrando={enCurso}
        aviso={confirmandoCierre ? aviso : null}
        onConfirmar={(comentario) => { void cerrarJornada(comentario) }}
      />

      <DestinoDeJornada
        abierto={destinoAbierto && !confirmandoCierre}
        modo={jornadaAbierta ? 'medidor' : 'apertura'}
        nombre={nombre}
        staffId={staffId}
        enCurso={enCurso}
        aviso={destinoAbierto && !confirmandoCierre ? aviso : null}
        onElegir={(espacioId, tareaId) => {
          if (jornadaAbierta) {
            void arrancar(tareaId)
            return
          }

          void abrirYArrancar(espacioId, tareaId)
        }}
        onCancelar={() => { setPidiendoDestino(false); setAviso(null) }}
        onEntrarSinJornada={() => {
          setEntroSinJornada(true)
          setPidiendoDestino(false)
          setAviso(null)
        }}
      />
    </>  )

  if (variante === 'panel') {
    return (
      <section className={cn('border-linea bg-superficie-elevada rounded-tarjeta border p-4', className)}>
        <h2 className="text-texto text-titulo mb-3 font-semibold">Mi jornada</h2>
        {cuerpo}
        {dialogos}
      </section>
    )
  }

  return (
    <>
    {/* `modal={false}` para que el desplegable no apague los eventos del resto del documento. */}
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
        // Un clic dentro de un popover propio ocurre fuera de este menu —vive en otro portal— y lo
        // cerraria justo al elegir. Los popovers propios no cuentan como afuera.
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
    {dialogos}
    </>
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
  enCurso: boolean
  aviso: string | null
  errorDeRed: string | null
  onElegirDestino: () => void
  onCerrar: () => void
  onDetener: () => void
}

/**
 * El cuerpo compartido por las dos variantes: primero la jornada, despues el medidor.
 *
 * Ese orden no es decorativo: sin jornada no hay medidor, y ponerlo al reves ofreceria arrancar algo
 * que la API va a rechazar.
 *
 * Ya no lleva selectores. Los dos que tenia —uno para abrir la jornada y otro para arrancar el
 * medidor despues— eran dos copias del mismo combo en el mismo componente, y los dos pedian solo el
 * Proyecto. Ahora los dos botones abren `DestinoDeJornada`, que es el unico sitio donde se elige.
 */
function CuerpoControl ({
  estado,
  medidor,
  jornadaAbierta,
  segundosJornada,
  segundosMedidor,
  enCurso,
  aviso,
  errorDeRed,
  onElegirDestino,
  onCerrar,
  onDetener
}: PropsCuerpo) {
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

          {jornadaAbierta && (
            <Boton variante="secundario" tamano="chico" cargando={enCurso} onClick={onCerrar}>
              Cerrar jornada
            </Boton>
          )}
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

        {/* Sin jornada: el boton no abre nada por si mismo, abre la ventana donde se elige el
            Proyecto y la Tarea. Es el mismo gesto que hace la compuerta al entrar, para que quien
            uso la salida de emergencia tenga por donde volver. */}
        {!jornadaAbierta && (
          <Boton
            variante="primario"
            tamano="chico"
            disabled={enCurso}
            onClick={onElegirDestino}
            className="self-start"
          >
            <Play size={14} strokeWidth={2} aria-hidden="true" />
            Abrir jornada y empezar
          </Boton>
        )}
      </section>

      {(jornadaAbierta || medidor !== null) && (
        <>
          <div className="bg-linea h-px" />

          <section className="flex flex-col gap-2">
            <span className="text-texto-tenue flex items-center gap-1.5 text-xs font-semibold">
              <Timer size={14} strokeWidth={2} aria-hidden="true" />
              Medidor
            </span>

            {medidor === null
              ? (
                <>
                  <p className="text-texto-sutil text-xs">
                    No estás midiendo nada: las horas de tu jornada se están yendo sin cubrir.
                  </p>
                  <Boton
                    variante="primario"
                    tamano="chico"
                    disabled={enCurso}
                    onClick={onElegirDestino}
                    className="self-start"
                  >
                    <Play size={14} strokeWidth={2} aria-hidden="true" />
                    Arrancar
                  </Boton>
                </>
                )
              : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-col">
                      <span className="text-texto truncate text-sm font-medium">
                        {medidor.task?.name ?? medidor.project?.name ?? 'Sin destino'}
                      </span>
                      {/* Los dos escalones, ahora que un medidor de Tarea tambien trae su Espacio:
                          el nombre de una Tarea solo ("Guion") no dice de que Proyecto es. */}
                      {medidor.task !== null && medidor.project !== null && (
                        <span className="text-texto-sutil truncate text-xs">{medidor.project.name}</span>
                      )}
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

                  {/* Un medidor sin Tarea ya no se puede crear: los que quedan son filas viejas del
                      medidor de Espacio de la `0260`. No se ofrece un selector para arreglarlas —eso
                      era un detener-y-arrancar encadenado, con la persona sin medidor si el segundo
                      paso fallaba—: se dice que hay que detener y volver a arrancar, que son los dos
                      botones que ya estan en pantalla. */}
                  {medidor.task === null && (
                    <p role="status" className="text-texto-aviso text-xs text-pretty">
                      Esto se está midiendo sin {GLOSARIO.proceso.singular.toLowerCase()}. Deténlo y
                      vuelve a arrancar eligiendo en cuál trabajas.
                    </p>
                  )}
                </>
                )}
          </section>
        </>
      )}

      {aviso !== null && <p role="alert" className="text-texto-peligro text-pretty text-xs">{aviso}</p>}
      {errorDeRed !== null && (
        <p role="status" className="text-texto-sutil text-pretty text-xs">{errorDeRed}</p>
      )}
    </div>
  )
}
