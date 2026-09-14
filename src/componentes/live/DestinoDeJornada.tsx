'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, Play, UserRound } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { GLOSARIO } from '@/dominio/glosario'
import { salidasDeApertura } from '@/dominio/live'
import { SelectorCliente } from './SelectorCliente'
import { SelectorEspacio } from './SelectorEspacio'
import { SelectorTarea } from './SelectorTarea'

/**
 * El destino de lo que se va a medir: quién, en qué Proyecto y —si quiere— en qué Tarea.
 *
 * === POR QUE UN MODAL Y NO EL DESPLEGABLE DE LA CABECERA ===
 *
 * El acuerdo de la reunión fue "combinar el botón de encendido y apagado con una ventana modal
 * emergente en el inicio para obligar a seleccionar el proyecto y la tarea". Un desplegable se cierra
 * clicando en cualquier parte y no interrumpe nada: sirve para operar, no para obligar. El cierre de
 * la jornada ya se había resuelto así (`CierreJornada`) y la apertura era el lado que faltaba — que
 * es el que más importa, porque lo que no se elige al empezar ya no se puede elegir después.
 *
 * === LOS TRES ESCALONES, EN ESE ORDEN ===
 *
 * Nombre → Proyecto → Tarea. El nombre no se elige: la jornada es de quien tiene la sesión —la API
 * saca el `staff_id` del token y no del cuerpo— así que ofrecerlo como combo sería prometer algo que
 * el backend rechaza. Se muestra porque es el primer escalón de la jerarquía y porque con varias
 * sesiones abiertas —o suplantando a alguien— es lo único que dice de quién va a ser el registro.
 *
 * La Tarea se pide **después** del Proyecto y filtrada por él (`SelectorTarea` lista sólo las
 * asignadas a uno dentro de ese Proyecto): al revés habría que ofrecer todas las Tareas de la
 * empresa para después descartar las que no encajan.
 *
 * === EL PROYECTO YA NO OBLIGA, PERO SIGUE SIENDO EL CAMINO ===
 *
 * El botón principal se habilita con el Proyecto elegido, aunque no haya Tarea. La reunión del
 * 2026-09-11 las hizo obligatorias a las dos y el cliente lo revirtió el mismo día: quiere poder
 * abrir la jornada eligiendo sólo un Proyecto, para demostrar que está trabajando en él.
 *
 * El tercer escalón no se esconde ni se atenúa por eso. Un registro con Tarea dice en qué se fue el
 * día y uno sin ella sólo a quién facturarle, así que la Tarea se sigue ofreciendo con una línea que
 * dice que conviene elegirla. Una línea, no un bloqueo y no un reproche: quien no la elige tiene sus
 * motivos y ya está abriendo su jornada.
 *
 * === LAS DOS SALIDAS SIN PROYECTO ===
 *
 * El 422 por abrir sin Proyecto pretendía impedir días sin atribuir y conseguía lo contrario: a quien
 * llegaba sin saber todavía en qué iba a trabajar lo empujaba a elegir cualquier Proyecto para poder
 * fichar, y un Proyecto inventado se cuela en los reportes de horas sin que después se distinga de
 * uno real. El hueco declarado es mejor dato, y ya tenía nombre: `uncovered_seconds`.
 *
 * Por eso ahora hay tres salidas, y la API las acepta las tres (`POST /me/jornada` con
 * `{project_id, task_id?}`, con `{client_id}`, o con `{}`):
 *
 *  1. Con Proyecto —y Tarea si se quiere—: abre el día **y** arranca el cronómetro, como siempre.
 *  2. Con Cliente y sin Proyecto: abre el día y guarda para quién es. **No arranca cronómetro.**
 *  3. En blanco: abre el día y nada más. **Tampoco arranca cronómetro.**
 *
 * **La jornada corre; el cronómetro no.** Las dos salidas nuevas arrancan el reloj del día y nada
 * más; el cronómetro arranca después, cuando la persona elija Proyecto desde la cabecera (el modo
 * `medidor` de esta misma ventana). No hay imputación retroactiva: inventarle hacia atrás un destino
 * a un rato que nadie declaró es justamente el dato falso que esto evita.
 *
 * === POR QUE TRES BOTONES NO SON TRES BOTONES ===
 *
 * Tres acciones del mismo rango en un pie no se leen: se comparan. La jerarquía las separa en dos
 * zonas. El pie tiene el camino principal y nada más —un botón primario, solo, donde siempre
 * estuvo—; las otras dos viven **debajo de la línea**, en un bloque que se presenta por lo que es:
 * la respuesta a "todavía no sé en qué voy a trabajar". Ese bloque desaparece entero en cuanto hay
 * Proyecto elegido, así que quien va por el camino de siempre nunca ve más de un botón.
 *
 * El selector de Cliente vive dentro de ese bloque, y por eso **se esconde en vez de deshabilitarse**
 * cuando hay Proyecto: con Proyecto el Cliente sale del Proyecto y no hay nada que elegir. Un combo
 * atenuado diría lo contrario —que el campo aplica pero está trabado— e invitaría a la pregunta de
 * por qué no se puede tocar. Esconderlo es lo honesto: en ese camino la elección no existe.
 *
 * === POR QUE YA NO ES UNA TRAMPA ===
 *
 * La ventana nació sin salida: en `apertura` se comía el `Escape`, el clic fuera y el cierre, y el
 * único camino era elegir. Recordar la decisión era lo que faltaba —el estado vivía en React y se
 * perdía en cada recarga— así que la misma persona que ya había dicho "ahora no" se topaba con el velo
 * otra vez a cada navegación. Obligar una vez es una regla; obligar en bucle es una avería.
 *
 * Ahora se cierra con la X, con `Escape` y clicando fuera, y posponerla se anota por el día
 * (`posponerJornadaPorHoy`): mañana se vuelve a exigir, hoy no se vuelve a preguntar. La exigencia no
 * desaparece —el aviso del Inicio y el control de la cabecera siguen diciendo que falta, y el botón
 * "Abrir jornada" de la cabecera la trae de vuelta en cuanto se quiera—, deja de ser un bloqueo.
 *
 * "No puedo abrir mi jornada" es otra cosa y se queda: quien **no puede** abrirla —sin Proyectos
 * asignados, o el día que la API falla— no necesita posponer sino cerrar sesión o entrar sin jornada,
 * y eso lo resuelve `SalidaDeEmergencia`. Está a un clic y no en la fila principal a propósito: la
 * excepción va un paso más lejos que la regla.
 */

interface PropsDestinoDeJornada {
  abierto: boolean
  /**
   * `apertura` abre la jornada y arranca el cronómetro en un gesto, y no se descarta.
   * `medidor` sólo arranca el cronómetro —la jornada ya está abierta— y sí se descarta: quien ya
   * abrió su día no está bloqueado, sólo no está midiendo.
   */
  modo: 'apertura' | 'medidor'
  /** Quién va a quedar registrado. Sale de `GET /me`; no se elige. */
  nombre: string
  /** De quién son las Tareas que lista el combo. */
  staffId: number
  /** `true` mientras la escritura está en vuelo. */
  enCurso: boolean
  /** Por qué no se pudo. Se pinta dentro: encima del velo no se ve nada más. */
  aviso: string | null
  /** `tareaId` es `null` cuando se eligió sólo el Proyecto: se mide contra el Proyecto entero. */
  onElegir: (espacioId: number, tareaId: number | null) => void
  /**
   * Sólo en `apertura`: abrir el día para un Cliente, sin Proyecto y sin cronómetro.
   *
   * No llega nunca sin Cliente elegido: el botón que lo dispara está deshabilitado hasta que lo haya
   * (`salidasDeApertura`), y la comprobación se repite en el `onClick` porque un `disabled` es una
   * afirmación sobre el dibujo y no sobre lo que se manda.
   */
  onAbrirConCliente?: (clienteId: number) => void
  /** Sólo en `apertura`: abrir el día en blanco, para decidir el destino más tarde. */
  onAbrirEnBlanco?: () => void
  /** Sólo en `medidor`: salir sin arrancar nada. */
  onCancelar?: () => void
  /**
   * Sólo en `apertura`: se cerró sin abrir la jornada. Quien lo reciba anota la decisión por el día,
   * o la ventana volvería a abrirse sola en la siguiente pantalla.
   */
  onPosponer?: () => void
  /** Sólo en `apertura`: la salida de emergencia, cuando abrir la jornada no es posible. */
  onEntrarSinJornada?: () => void
}

export function DestinoDeJornada ({
  abierto,
  modo,
  nombre,
  staffId,
  enCurso,
  aviso,
  onElegir,
  onAbrirConCliente,
  onAbrirEnBlanco,
  onCancelar,
  onPosponer,
  onEntrarSinJornada
}: PropsDestinoDeJornada) {
  /**
   * `apertura` sigue pidiendo más que `medidor` —abre el día, no sólo el cronómetro— y por eso cambia
   * los textos y la fila de botones. Lo que ya no cambia es el cierre: las dos se descartan igual.
   */
  const esApertura = modo === 'apertura'

  return (
    <Dialogo
      open={abierto}
      onOpenChange={(nuevo) => {
        if (nuevo) return

        // Por aquí pasan los tres gestos de cierre —la X, `Escape` y el clic fuera— y los dos modos
        // no cierran en lo mismo: en `apertura` queda una decisión que recordar por el día, y en
        // `medidor` sólo se descarta una ventana que no obligaba a nada.
        if (esApertura) onPosponer?.()
        else onCancelar?.()
      }}
    >
      <ContenidoDialogo
        ancho="chico"
        cerrable
        titulo={esApertura ? 'Abre tu jornada' : 'Elige dónde medir'}
        descripcion={esApertura
          ? `Elige el ${GLOSARIO.espacio.singular.toLowerCase()} al que se le imputan las horas de hoy; la ${GLOSARIO.proceso.singular.toLowerCase()} es opcional. Si todavía no lo sabes, abajo puedes abrir el día igual. Y si ahora no puedes, cierra esta ventana: hoy no se vuelve a preguntar, y la abres desde la cabecera cuando quieras.`
          : `El cronómetro mide contra el ${GLOSARIO.espacio.singular.toLowerCase()}, y contra una ${GLOSARIO.proceso.singular.toLowerCase()} suya si eliges una.`}
      >
        {/* Radix sólo monta esto mientras el diálogo está abierto: las listas se piden al abrir —ese
            montaje ES la petición— y la elección a medias no sobrevive a cerrar y volver a abrir. */}
        <CuerpoDestino
          esApertura={esApertura}
          nombre={nombre}
          staffId={staffId}
          enCurso={enCurso}
          aviso={aviso}
          onElegir={onElegir}
          onAbrirConCliente={onAbrirConCliente}
          onAbrirEnBlanco={onAbrirEnBlanco}
          onCancelar={onCancelar}
          onEntrarSinJornada={onEntrarSinJornada}
        />
      </ContenidoDialogo>
    </Dialogo>
  )
}

interface PropsCuerpo {
  esApertura: boolean
  nombre: string
  staffId: number
  enCurso: boolean
  aviso: string | null
  onElegir: (espacioId: number, tareaId: number | null) => void
  onAbrirConCliente?: (clienteId: number) => void
  onAbrirEnBlanco?: () => void
  onCancelar?: () => void
  onEntrarSinJornada?: () => void
}

function CuerpoDestino ({
  esApertura,
  nombre,
  staffId,
  enCurso,
  aviso,
  onElegir,
  onAbrirConCliente,
  onAbrirEnBlanco,
  onCancelar,
  onEntrarSinJornada
}: PropsCuerpo) {
  // Los tres van en un solo estado y no en tres: cambiar de Proyecto tiene que invalidar la Tarea
  // —es de otro Proyecto, y la API rechaza el par incoherente con un 422 que nadie entendería— y
  // también el Cliente, porque con Proyecto el Cliente sale del Proyecto y el que se hubiera elegido
  // antes ya no describe nada. Con estados separados eso sería un efecto que llama a `setState`, o
  // sea un render en cascada y una ventana en la que la terna ya es incoherente. Juntos, la elección
  // del Proyecto lo resuelve sola, y el cuerpo del POST nunca puede salir con dos destinos a la vez.
  const [eleccion, setEleccion] = useState<{
    espacio: number | null
    tarea: number | null
    cliente: number | null
  }>({
    espacio: null,
    tarea: null,
    cliente: null
  })
  /** `true` cuando se pidió la salida de emergencia. Ver el docblock del módulo. */
  const [atascado, setAtascado] = useState(false)

  const idEspacio = useId()
  const idTarea = useId()
  const idAyudaTarea = useId()
  const idCliente = useId()

  const { espacio, tarea, cliente } = eleccion
  // Qué se puede apretar ahora mismo. La regla vive en `dominio/live` y no acá porque es lo que
  // impide mandarle a la API una petición que ya se sabe inválida — un `POST` con `{}` cuando la
  // persona creía estar eligiendo Cliente abriría una jornada en blanco que nadie pidió.
  const salidas = salidasDeApertura({ espacio, cliente })

  if (atascado) {
    return (
      <SalidaDeEmergencia
        onVolver={() => { setAtascado(false) }}
        onEntrarSinJornada={onEntrarSinJornada}
      />
    )
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <ol className="flex flex-col gap-3">
        <Escalon numero={1} etiqueta="Quién">
          {/* No es un combo: la jornada es de quien tiene la sesión y la API saca el `staff_id` del
              token. Se muestra para que nadie registre su día en la cuenta de otro sin darse cuenta. */}
          <p className="text-texto flex items-center gap-2 text-sm font-medium">
            <UserRound size={16} strokeWidth={2} aria-hidden="true" className="text-texto-sutil shrink-0" />
            {nombre}
          </p>
        </Escalon>

        <Escalon numero={2} etiqueta={GLOSARIO.espacio.singular} htmlFor={idEspacio}>
          <SelectorEspacio
            id={idEspacio}
            valor={espacio}
            onElegir={(id) => { setEleccion({ espacio: id, tarea: null, cliente: null }) }}
            deshabilitado={enCurso}
          />
        </Escalon>

        <Escalon numero={3} etiqueta={GLOSARIO.proceso.singular} htmlFor={idTarea}>
          {espacio === null
            ? (
              <p className="text-texto-sutil text-xs">
                Elige primero el {GLOSARIO.espacio.singular.toLowerCase()}.
              </p>
              )
            : (
              <>
                <SelectorTarea
                  id={idTarea}
                  espacioId={espacio}
                  staffId={staffId}
                  valor={tarea}
                  describedBy={idAyudaTarea}
                  onElegir={(id) => { setEleccion((previa) => ({ ...previa, tarea: id })) }}
                  deshabilitado={enCurso}
                />
                {/* Una ayuda, no un reproche: se puede seguir sin ella y el botón no espera. */}
                <p id={idAyudaTarea} className="text-texto-sutil text-xs text-pretty">
                  Puedes seguir sin elegirla, pero con ella queda registrado en qué se fue el rato y
                  no sólo en qué {GLOSARIO.espacio.singular.toLowerCase()}.
                </p>
              </>
              )}
        </Escalon>
      </ol>

      {aviso !== null && (
        <p role="alert" className="text-texto-peligro text-pretty text-sm">{aviso}</p>
      )}

      <div className="border-linea flex flex-wrap items-center justify-end gap-2 border-t pt-4">
        {esApertura
          ? (
            <button
              type="button"
              className="text-texto-sutil hover:text-texto mr-auto text-xs underline underline-offset-2"
              onClick={() => { setAtascado(true) }}
            >
              No puedo abrir mi jornada
            </button>
            )
          : (
            <Boton variante="secundario" disabled={enCurso} onClick={onCancelar}>
              Cancelar
            </Boton>
            )}

        <Boton
          variante="primario"
          cargando={enCurso}
          disabled={!salidas.conEspacio || enCurso}
          onClick={() => { if (espacio !== null) onElegir(espacio, tarea) }}
        >
          <Play size={14} strokeWidth={2} aria-hidden="true" />
          {esApertura ? 'Abrir jornada y empezar' : 'Arrancar'}
        </Boton>
      </div>

      {/* Debajo de la línea, y sólo mientras no haya Proyecto. Con Proyecto elegido este bloque entero
          desaparece: el camino de siempre nunca ve más de un botón, y el Cliente deja de ofrecerse
          porque en ese camino sale del Proyecto. Ver el docblock del módulo. */}
      {esApertura && espacio === null && (
        <SalidasSinEspacio
          idCliente={idCliente}
          cliente={cliente}
          enCurso={enCurso}
          onElegirCliente={(id) => { setEleccion((previa) => ({ ...previa, cliente: id })) }}
          habilitadaConCliente={salidas.soloCliente}
          onAbrirConCliente={onAbrirConCliente}
          onAbrirEnBlanco={onAbrirEnBlanco}
        />
      )}
    </div>
  )
}

/**
 * Las dos salidas de quien todavía no sabe en qué va a trabajar.
 *
 * Un bloque aparte y no dos botones más en el pie: tres acciones del mismo rango se comparan en vez
 * de leerse. Acá se presentan por lo que son —la respuesta a una pregunta que la persona se está
 * haciendo— y por eso llevan encabezado propio y una línea que dice qué pasa al usarlas. Lo que esa
 * línea dice es lo que la API hace: la jornada corre, el cronómetro no.
 *
 * Los dos botones son secundarios a propósito, y el de "en blanco" es el más liviano de los dos: es
 * el que menos dato deja, así que es el último recurso y no una alternativa equivalente. Ninguno de
 * los dos compite con el primario del pie, que sigue siendo el camino recomendado.
 */
function SalidasSinEspacio ({
  idCliente,
  cliente,
  enCurso,
  onElegirCliente,
  habilitadaConCliente,
  onAbrirConCliente,
  onAbrirEnBlanco
}: {
  idCliente: string
  cliente: number | null
  enCurso: boolean
  onElegirCliente: (id: number | null) => void
  habilitadaConCliente: boolean
  onAbrirConCliente?: (clienteId: number) => void
  onAbrirEnBlanco?: () => void
}) {
  const espacio = GLOSARIO.espacio.singular
  const nombreCliente = GLOSARIO.cliente.singular

  return (
    <section className="border-linea flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-texto-tenue text-xs font-semibold">
          ¿Todavía no sabes en qué {espacio.toLowerCase()} vas a trabajar?
        </h3>
        {/* Informa, no advierte: abrir así es una elección válida. Lo que sí tiene que quedar dicho
            es la mitad que no es obvia — el reloj del día arranca y el cronómetro no—, porque de eso
            depende que después nadie se sorprenda con horas sin imputar. */}
        <p className="text-texto-sutil text-xs text-pretty">
          Abre el día igual. El reloj de tu jornada empieza a correr; el cronómetro lo arrancas desde
          la cabecera cuando lo decidas.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={idCliente} className="text-texto-tenue text-xs font-medium">
          {nombreCliente} <span className="text-texto-sutil font-normal">(opcional)</span>
        </label>
        <SelectorCliente
          id={idCliente}
          valor={cliente}
          onElegir={onElegirCliente}
          deshabilitado={enCurso}
        />
      </div>

      {/* Apiladas y a lo ancho, no en fila: los dos rótulos juntos no entran en el ancho del diálogo
          y una fila que envuelve deja el orden a merced del texto —que cambia con el glosario—. En
          columna el orden es una decisión: primero la que deja más dato. */}
      <div className="flex flex-col items-stretch gap-2">
        <Boton
          variante="secundario"
          tamano="chico"
          cargando={enCurso}
          disabled={!habilitadaConCliente || enCurso}
          // El `disabled` dibuja; esto manda. Sin el segundo, un estado que se adelante al render
          // dispararía un POST sin `client_id` — y ese cuerpo no falla: abre una jornada en blanco.
          onClick={() => { if (cliente !== null) onAbrirConCliente?.(cliente) }}
        >
          Iniciar jornada sin {espacio}
        </Boton>

        <Boton
          variante="sutil"
          tamano="chico"
          disabled={enCurso}
          onClick={onAbrirEnBlanco}
        >
          Sin {espacio} ni {nombreCliente}: lo decido después
        </Boton>
      </div>
    </section>
  )
}

/** Un escalón de la jerarquía: su número, su nombre y el control que lo resuelve. */
function Escalon ({
  numero,
  etiqueta,
  htmlFor,
  children
}: {
  numero: number
  etiqueta: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <li className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-texto-tenue flex items-center gap-2 text-xs font-semibold"
      >
        <span
          aria-hidden="true"
          className="bg-superficie-hundida text-texto-sutil inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-bold"
        >
          {numero}
        </span>
        {etiqueta}
      </label>
      {children}
    </li>
  )
}

/**
 * Las dos puertas de quien no puede abrir su jornada.
 *
 * No es un botón de "saltar": es una pantalla que nombra el problema y sus dos salidas reales. Quien
 * no tiene Proyectos asignados necesita que se los asignen, no insistir con el combo vacío; quien se
 * topó con una API caída necesita poder seguir trabajando mientras alguien la levanta.
 *
 * "Entrar sin jornada" no la abre ni la finge: el aviso del Inicio y el control de la cabecera siguen
 * diciendo que falta, y la próxima recarga vuelve a pedirla. Es una excepción por esta vez, no un
 * permiso permanente — que es la única forma de que obligue sin encerrar.
 */
function SalidaDeEmergencia ({
  onVolver,
  onEntrarSinJornada
}: {
  onVolver: () => void
  onEntrarSinJornada?: () => void
}) {
  const router = useRouter()
  const [saliendo, setSaliendo] = useState(false)

  /** Misma salida que el menú de la cuenta: la cookie se borra en el servidor y se va a entrar. */
  async function salir (): Promise<void> {
    setSaliendo(true)

    try {
      await fetch('/api/sesion', { method: 'DELETE' })
    } finally {
      router.replace('/colab')
      router.refresh()
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <p className="text-texto-tenue text-pretty text-sm">
        Puede que no tengas {GLOSARIO.espacio.plural.toLowerCase()} o{' '}
        {GLOSARIO.proceso.plural.toLowerCase()} asignadas todavía, o que el servidor no esté
        respondiendo. Avísale a tu jefatura para que te asignen el trabajo de hoy: sin eso las horas
        no se pueden imputar a nada.
      </p>

      <div className="border-linea flex flex-wrap items-center justify-end gap-2 border-t pt-4">
        <button
          type="button"
          className="text-texto-sutil hover:text-texto mr-auto text-xs underline underline-offset-2"
          onClick={onVolver}
        >
          Volver a intentarlo
        </button>

        <Boton variante="secundario" cargando={saliendo} onClick={() => { void salir() }}>
          <LogOut size={14} strokeWidth={2} aria-hidden="true" />
          {saliendo ? 'Saliendo…' : 'Cerrar sesión'}
        </Boton>

        {onEntrarSinJornada !== undefined && (
          <Boton variante="secundario" disabled={saliendo} onClick={onEntrarSinJornada}>
            Entrar sin jornada
          </Boton>
        )}
      </div>
    </div>
  )
}
