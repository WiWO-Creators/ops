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
import type { ClienteDeJornada, EstadoDeJornada } from '@/datos/live'
import { GLOSARIO } from '@/dominio/glosario'
import {
  clienteDeJornada,
  cuerpoDeApertura,
  faltaAbrirJornada,
  fraseDeJornadaSinDestino,
  jornadaPospuestaHoy,
  jornadaSinDestino,
  mensajeDeFalloDeCliente,
  mensajeDeFalloDeJornada,
  mensajeDeFalloDeMedidor,
  olvidarJornadaPospuesta,
  posponerJornadaPorHoy,
  type DestinoDeApertura
} from '@/dominio/live'
import { cn } from '@/lib/clases'
import { hoyLocal } from '@/lib/fechas'
import { CierreJornada } from './CierreJornada'
import { DestinoDeJornada } from './DestinoDeJornada'
import { SelectorCliente } from './SelectorCliente'
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
 * === EL PROYECTO BLOQUEA; LA TAREA SE PIDE ===
 *
 * La reunion del 2026-09-11 hizo obligatorias a las dos y el cliente lo revirtio el mismo dia: quiere
 * poder abrir la jornada eligiendo solo un Proyecto, para demostrar que esta trabajando en el. La API
 * quedo igual: `POST /me/jornada` exige `project_id`, acepta `task_id` opcional y comprueba que la
 * Tarea, cuando viene, sea de ese Proyecto.
 *
 * De ahi los dos arranques de este control. Con Tarea se arranca su cronometro; sin ella, el medidor
 * de Espacio de la migracion `0260` (`POST /projects/{id}/timer`, la fila con `task_id = 0` y
 * `project_id` lleno). Es un `if` y no dos flujos: la eleccion la hace el modal y aca solo se
 * traduce a la ruta que corresponde.
 *
 * === POR QUE LA ELECCION VIVE EN UN MODAL Y NO ACA DENTRO ===
 *
 * Porque un desplegable no interrumpe: se cierra clicando en cualquier parte y quien no queria elegir
 * simplemente no elige. `DestinoDeJornada` es la ventana que se abre **sola** al entrar sin jornada,
 * porque lo que no se elige al empezar ya no se puede elegir despues.
 *
 * Ese modal es tambien el unico sitio donde se elige destino: el control tenia dos copias del
 * selector de Espacio —una para abrir y otra para arrancar— y las dos se fueron con el.
 *
 * === PEDIR NO ES ENCERRAR ===
 *
 * La ventana se abre sola, pero se cierra: con la X, con `Escape` y clicando fuera. Antes no, y el
 * resultado era el contrario del buscado — el estado de "ya dije que ahora no" vivia en React, se
 * perdia en cada recarga, y la misma persona volvia a chocar con el velo en cada navegacion. Una
 * compuerta que no se acuerda de nada deja de leerse como una regla y pasa a leerse como una averia.
 *
 * Por eso posponerla se anota por el dia (`posponerJornadaPorHoy`, en `localStorage`): manana se
 * vuelve a exigir y hoy no se vuelve a preguntar. Lo que no desaparece es la exigencia: el boton de
 * la cabecera sigue diciendo "Abrir jornada" y la trae de vuelta en un clic, y el aviso del Inicio
 * sigue diciendo que falta.
 *
 * Y ni siquiera se pregunta sin saber: la ventana se exige solo con `estado` leido de verdad, porque
 * si la API no contesto `estado` es `null` y no hay forma de saber si esa persona ya abrio su
 * jornada. Un backend caido no puede dejar a media empresa mirando un velo.
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
  /**
   * `true` si hoy ya se cerro la ventana sin abrir la jornada.
   *
   * Se apoya en `localStorage` y no solo en React porque el estado de React es justo lo que no
   * sobrevive a una recarga: ahi nacio el bucle que esto arregla. La marca lleva el dia y el
   * `staffId`, asi que caduca sola a la medianoche y no se hereda entre cuentas del mismo navegador.
   *
   * Se lee en el inicializador y no en un efecto porque un efecto llega tarde: el primer pintado ya
   * traeria la ventana abierta y el segundo la cerraria, o sea un parpadeo del velo justo al entrar.
   * En el servidor no hay `localStorage`, y tampoco hace falta: el dialogo vive en un portal que no
   * existe hasta despues del montaje, asi que esto no entra en el HTML que se hidrata.
   */
  const [pospuestaHoy, setPospuestaHoy] = useState(
    () => typeof window !== 'undefined' && jornadaPospuestaHoy(window.localStorage, staffId, hoyLocal())
  )
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

  /**
   * Se cerro la ventana de apertura sin abrir la jornada. Queda anotado por el dia para no volver a
   * interrumpir, y el boton de la cabecera sigue estando para cuando se quiera.
   */
  function posponerApertura (): void {
    setPospuestaHoy(true)
    setPidiendoDestino(false)
    setAviso(null)
    // El resultado no se mira a proposito: si el navegador no deja guardar —una ventana privada— la
    // decision vale igual en esta pestaña, que es donde se acaba de tomar. Lo unico que se pierde es
    // que la proxima recarga vuelva a preguntar.
    posponerJornadaPorHoy(window.localStorage, staffId, hoyLocal())
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
    metodo: 'POST' | 'PATCH' | 'DELETE',
    cuerpo: Record<string, unknown> = {}
  ): Promise<number> {
    // El `DELETE` queda sin cuerpo a proposito: las dos rutas que lo usan detienen algo por su id en
    // la URL, y mandarles un `{}` con `content-type` solo le daria al proxy un cuerpo que reenviar.
    const conCuerpo = metodo !== 'DELETE'

    try {
      const respuesta = await fetch(`/api/bff/${ruta}`, {
        method: metodo,
        headers: conCuerpo ? { 'content-type': 'application/json' } : undefined,
        body: conCuerpo ? JSON.stringify(cuerpo) : undefined
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
   * Abre la jornada por cualquiera de los tres caminos, en **una sola peticion**.
   *
   * Con Proyecto abre el dia **y** arranca el medidor a la vez. Antes eran dos peticiones
   * —`POST /me/jornada` y despues el arranque— y entre una y otra cabia un corte de red: la jornada
   * quedaba abierta y sin nada que medir. Lo resuelve la API: con el destino en el cuerpo abre las
   * dos cosas o ninguna, y si el medidor falla descarta la jornada que acababa de abrir.
   *
   * Sin Proyecto —con Cliente, o en blanco— abre el dia y **no arranca ningun cronometro**. Eso no
   * es un fallo a medias sino el contrato: la jornada corre y el cronometro se arranca despues,
   * desde el modo `medidor` de esta misma ventana. No hay imputacion retroactiva.
   *
   * El cuerpo lo arma `cuerpoDeApertura()` y no este metodo: es la regla de que ids viajan por cada
   * camino, se prueba sin montar nada, y ademas es lo que impide el cuerpo incoherente —un
   * `task_id` sin su `project_id`, o un `client_id` junto a un `project_id`— que la API rechazaria
   * con un 422 que nadie sabria leer.
   *
   * Aca no hay compensacion ni reintento. Un fallo deja el estado como estaba y el aviso dice por
   * que: 403 si el destino no es suyo, 404 si ya no esta, 422 si el par no se corresponde o si el
   * Cliente ya no existe, 409 si otra pestaña abrio la jornada primero.
   */
  async function abrirJornada (destino: DestinoDeApertura): Promise<void> {
    setEnCurso(true)
    setAviso(null)

    const respuesta = await llamar('me/jornada', 'POST', cuerpoDeApertura(destino))

    setEnCurso(false)

    if (acepto(respuesta)) {
      setPidiendoDestino(false)
      // La jornada quedo abierta: "ahora no" ya no describe nada. Dejar la marca puesta silenciaria
      // la exigencia del rato en que el dia se cierre y haya que volver a abrirlo.
      setPospuestaHoy(false)
      olvidarJornadaPospuesta(window.localStorage, staffId, hoyLocal())
      avisarCambioDeMedidor()
      recargar()
      return
    }

    // El 422 del camino con Cliente no habla de Tareas ni de Proyectos: dice que ese Cliente ya no
    // existe o esta en la papelera. Mandarlo por el traductor de la jornada dejaria a la persona
    // buscando el problema en un combo que ni siquiera llego a tocar.
    setAviso(destino.tipo === 'cliente' && respuesta === 422
      ? mensajeDeFalloDeCliente(422)
      : mensajeDeFalloDeJornada(respuesta, true))

    // El 409 al abrir significa que ya hay una jornada abierta y esta pantalla quedo vieja: otra
    // pestaña la abrio. Se vuelve a leer para que el control lo muestre ahora y no en el proximo
    // intervalo, con la persona mirando un boton que ya no corresponde.
    if (respuesta === 409) recargar()
  }

  /**
   * Fija, cambia o quita el Cliente de la jornada que ya esta abierta.
   *
   * Es la otra mitad de "configurarlo despues": arrancar el medidor le pone destino al rato que
   * viene, y esto le pone nombre al dia entero. Son campos distintos —contra un Cliente no se mide
   * tiempo— asi que no se pisan: se puede tener Cliente sin cronometro, cronometro sin Cliente, o
   * las dos cosas.
   *
   * La clave viaja **siempre**, incluso para quitarlo: un `PATCH` sin `client_id` es un 422
   * `requerido` y no un borrado silencioso, asi que quitar el Cliente se escribe `client_id: null`
   * explicito. Por eso el parametro es `number | null` y no opcional.
   *
   * No toca ningun cronometro, ni del lado de la API ni de este: por eso no avisa un cambio de
   * medidor, solo vuelve a leer el estado del dia.
   */
  async function fijarCliente (clienteId: number | null): Promise<void> {
    setEnCurso(true)
    setAviso(null)

    const respuesta = await llamar('me/jornada', 'PATCH', { client_id: clienteId })

    setEnCurso(false)

    if (!acepto(respuesta)) {
      setAviso(mensajeDeFalloDeCliente(respuesta))
      // El 409 aca es "no tienes ninguna jornada abierta": el dia se cerro solo a la hora de corte,
      // o desde otra pestaña. Volver a leer hace que el control pase a pedir la apertura en vez de
      // dejar a la vista un selector sobre una jornada que ya no existe.
      if (respuesta === 409) recargar()
      return
    }

    recargar()
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
   * Arranca el medidor con la jornada ya abierta. Sirve para elegir a que se le imputa el rato
   * siguiente sin cerrar el dia y volver a abrirlo.
   *
   * Con Tarea va a `tasks/{id}/timer` y el Proyecto no viaja: la fila cuelga de la Tarea y el Espacio
   * se deriva de su `rel_id`. Sin Tarea va a `projects/{id}/timer`, que escribe la fila con
   * `task_id = 0` y el `project_id` lleno —el medidor de Espacio de la `0260`—.
   */
  async function arrancar (espacioId: number, tareaId: number | null): Promise<void> {
    setEnCurso(true)
    setAviso(null)

    const ruta = tareaId === null ? `projects/${espacioId}/timer` : `tasks/${tareaId}/timer`
    const respuesta = await llamar(ruta, 'POST')

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
  const exigeJornada = variante === 'compacta' && !entroSinJornada && !pospuestaHoy &&
    faltaAbrirJornada(estado)
  const destinoAbierto = exigeJornada || pidiendoDestino

  // Para quien es el dia y si ese dia tiene destino. Los dos salen del estado ya leido: la jornada
  // trae `client` con el nombre puesto, asi que la cabecera no pide `/clients/{id}` por una palabra.
  const cliente = clienteDeJornada(estado)
  const sinDestino = jornadaSinDestino(estado)

  const cuerpo = (
    <CuerpoControl
      estado={estado}
      medidor={medidor}
      jornadaAbierta={jornadaAbierta}
      segundosJornada={segundosJornada}
      segundosMedidor={segundosMedidor}
      enCurso={enCurso}
      cliente={cliente}
      sinDestino={sinDestino}
      aviso={confirmandoCierre || destinoAbierto ? null : aviso}
      errorDeRed={errorDeRed}
      onElegirDestino={() => { setAviso(null); setPidiendoDestino(true) }}
      onFijarCliente={(id) => { void fijarCliente(id) }}
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
            void arrancar(espacioId, tareaId)
            return
          }

          void abrirJornada({ tipo: 'espacio', espacioId, procesoId: tareaId })
        }}
        onAbrirConCliente={(clienteId) => { void abrirJornada({ tipo: 'cliente', clienteId }) }}
        onAbrirEnBlanco={() => { void abrirJornada({ tipo: 'en-blanco' }) }}
        onCancelar={() => { setPidiendoDestino(false); setAviso(null) }}
        onPosponer={posponerApertura}
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
          : <span className="truncate">Abrir jornada</span>}
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
  /** Para quien es el dia, o `null` si no tiene Cliente —o si la API no manda el campo—. */
  cliente: ClienteDeJornada | null
  /** `true` con la jornada abierta y ningun cronometro corriendo. */
  sinDestino: boolean
  aviso: string | null
  errorDeRed: string | null
  onElegirDestino: () => void
  /** `null` es quitar el Cliente, no "no hacer nada". Ver `fijarCliente()`. */
  onFijarCliente: (clienteId: number | null) => void
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
  cliente,
  sinDestino,
  aviso,
  errorDeRed,
  onElegirDestino,
  onFijarCliente,
  onCerrar,
  onDetener
}: PropsCuerpo) {
  /**
   * `true` mientras el combo de Clientes esta a la vista.
   *
   * El combo no se monta hasta que alguien lo pide, y eso es el punto: montarlo trae la lista entera
   * de `/clients`, y la variante `panel` vive montada en `/live`. Una peticion mas por cada carga de
   * esa pantalla, para un dato que casi nadie va a tocar, es trafico que no compra nada. Mientras
   * tanto el nombre se lee igual, porque viene dentro de la jornada.
   */
  const [eligiendoCliente, setEligiendoCliente] = useState(false)

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

        {/* Que el día corre sin nada que lo cubra tiene que verse, o alguien descubre al cerrar que
            ocho horas no se imputaron a nada. Dice el mismo hecho que decía el medidor —el reloj
            corre y ningún cronómetro lo alcanza— sin el reproche que tenía ("las horas se están
            yendo sin cubrir"): abrir el día sin destino es una salida que la interfaz ahora ofrece a
            propósito, y regañar por usarla sería contradecirse. Va como `status` para que un lector
            de pantalla lo anuncie sin interrumpir lo que la persona esté haciendo. */}
        {sinDestino && (
          <p role="status" className="text-texto-sutil text-xs text-pretty">
            {fraseDeJornadaSinDestino(cliente)}
          </p>
        )}

        {/* Para quién es el día. Se muestra siempre que haya jornada abierta y no sólo cuando falta
            destino: el Cliente es un campo del día entero y sigue siendo cambiable con el cronómetro
            corriendo — no son lo mismo, contra un Cliente no se mide tiempo.

            El nombre se lee del estado ya traído y el combo sólo se monta al pedirlo, así que la
            pantalla no gasta una petición de `/clients` en dibujar una palabra que ya tenía. */}
        {jornadaAbierta && (
          <div className="flex flex-col gap-1.5">
            <span className="text-texto-tenue text-xs font-semibold">
              {GLOSARIO.cliente.singular}
            </span>

            {eligiendoCliente
              ? (
                <SelectorCliente
                  valor={cliente?.id ?? null}
                  nombreActual={cliente?.name ?? null}
                  // Quitarlo sólo se ofrece donde hay algo que quitar. En la apertura el combo nace
                  // vacío y una opción "Sin Cliente" ahí sería elegir lo que ya está elegido.
                  vaciable={cliente !== null}
                  deshabilitado={enCurso}
                  onElegir={(id) => { setEligiendoCliente(false); onFijarCliente(id) }}
                />
                )
              : (
                <div className="flex items-center justify-between gap-2">
                  <span className={cn('truncate text-sm', cliente === null ? 'text-texto-sutil' : 'text-texto')}>
                    {cliente?.name ?? `Sin ${GLOSARIO.cliente.singular.toLowerCase()}`}
                  </span>
                  <button
                    type="button"
                    disabled={enCurso}
                    className="text-texto-sutil hover:text-texto disabled:hover:text-texto-sutil shrink-0 text-xs underline underline-offset-2"
                    onClick={() => { setEligiendoCliente(true) }}
                  >
                    {cliente === null ? 'Elegir' : 'Cambiar'}
                  </button>
                </div>
                )}
          </div>
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
                  {/* Sin párrafo: lo que pasa ya está dicho arriba, en la jornada, que es de quien
                      se dice. Repetirlo acá bajo el rótulo "Medidor" sería decir dos veces lo mismo
                      en ocho centímetros de desplegable. */}
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

                  {/* Medir el Proyecto entero es una eleccion valida desde que la Tarea volvio a ser
                      opcional, asi que esto informa y no reprocha: tono sutil, y "si quieres".

                      No se ofrece un selector para cambiarlo —eso era un detener-y-arrancar
                      encadenado, con la persona sin medidor si el segundo paso fallaba—: se nombran
                      los dos botones que ya estan en pantalla. */}
                  {medidor.task === null && (
                    <p role="status" className="text-texto-sutil text-xs text-pretty">
                      Se está midiendo el {GLOSARIO.espacio.singular.toLowerCase()} entero, sin{' '}
                      {GLOSARIO.proceso.singular.toLowerCase()}. Si quieres afinarlo, detenlo y vuelve
                      a arrancar eligiendo una.
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
