'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, Play, UserRound } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { GLOSARIO } from '@/dominio/glosario'
import { SelectorEspacio } from './SelectorEspacio'
import { SelectorTarea } from './SelectorTarea'

/**
 * La ventana de la jornada, en sus dos modos: abrir el día, o elegir dónde medir.
 *
 * === POR QUE UN MODAL Y NO EL DESPLEGABLE DE LA CABECERA ===
 *
 * El acuerdo de la reunión fue "combinar el botón de encendido y apagado con una ventana modal
 * emergente en el inicio". Un desplegable se cierra clicando en cualquier parte y no interrumpe nada:
 * sirve para operar, no para pedir. El cierre de la jornada ya se había resuelto así
 * (`CierreJornada`) y la apertura era el lado que faltaba.
 *
 * === LA APERTURA NO PIDE NADA ===
 *
 * Aquí había tres escalones —Quién, Proyecto, Tarea—, un selector de Cliente y tres botones que
 * repartían el día en tres formas de empezarlo. Funcionaba y se descartó igual: la ventana con la que
 * se topa TODA la empresa a las nueve de la mañana no puede ser un formulario. Lo que la persona
 * quiere a esa hora es empezar, y cada campo que se le pone delante es una decisión que todavía no
 * tomó —a esa hora casi nadie sabe aún en qué va a caer el día— resuelta a la fuerza con el primer
 * Proyecto de la lista. Un destino inventado se cuela en los reportes de horas y después no se
 * distingue de uno real; el hueco declarado es mejor dato, y ya tenía nombre: `uncovered_seconds`.
 *
 * Así que en `apertura` queda el texto y un botón. El `POST /me/jornada` sale con el cuerpo vacío,
 * que la API acepta: abre el día y no arranca ningún cronómetro.
 *
 * **La jornada corre; el cronómetro no.** Eso el texto lo dice, porque es la mitad que no es obvia y
 * porque de ella depende que nadie crea que perdió la posibilidad de imputar sus horas. El destino se
 * asigna después, desde el control de la cabecera, y justo después de abrir aparece un recordatorio
 * que lo dice otra vez (`RecordatorioDeDestino`).
 *
 * === EL MODO `medidor` SE QUEDA COMO ESTABA ===
 *
 * Es el otro lado del mismo acuerdo: la apertura no pregunta porque preguntar ahí no sirve, pero
 * elegir Proyecto y Tarea tiene que seguir siendo posible —es el único camino para que las horas
 * queden imputadas— y ese es exactamente este modo. Sus tres escalones van en ese orden porque la
 * Tarea se pide **después** del Proyecto y filtrada por él (`SelectorTarea` lista sólo las asignadas
 * a uno dentro de ese Proyecto): al revés habría que ofrecer todas las Tareas de la empresa para
 * después descartar las que no encajan.
 *
 * El nombre no se elige: la jornada es de quien tiene la sesión —la API saca el `staff_id` del token
 * y no del cuerpo— así que ofrecerlo como combo sería prometer algo que el backend rechaza. Se
 * muestra porque con varias sesiones abiertas es lo único que dice de quién va a ser el registro.
 *
 * === POR QUE YA NO ES UNA TRAMPA ===
 *
 * La ventana nació sin salida: en `apertura` se comía el `Escape`, el clic fuera y el cierre. Recordar
 * la decisión era lo que faltaba —el estado vivía en React y se perdía en cada recarga— así que la
 * misma persona que ya había dicho "ahora no" se topaba con el velo otra vez a cada navegación.
 * Obligar una vez es una regla; obligar en bucle es una avería.
 *
 * Ahora se cierra con la X, con `Escape` y clicando fuera, y posponerla se anota por el día
 * (`posponerJornadaPorHoy`): mañana se vuelve a exigir, hoy no se vuelve a preguntar. La exigencia no
 * desaparece —el aviso del Inicio y el control de la cabecera siguen diciendo que falta, y el botón
 * "Abrir jornada" de la cabecera la trae de vuelta en cuanto se quiera—, deja de ser un bloqueo.
 *
 * "No puedo abrir mi jornada" es otra cosa y se queda: quien **no puede** abrirla —el día que la API
 * falla— no necesita posponer sino cerrar sesión o entrar sin jornada, y eso lo resuelve
 * `SalidaDeEmergencia`. Está a un clic y no en la fila principal a propósito: la excepción va un paso
 * más lejos que la regla.
 */

interface PropsDestinoDeJornada {
  abierto: boolean
  /**
   * `apertura` abre el día y no pide nada; `medidor` arranca el cronómetro sobre un destino —la
   * jornada ya está abierta— y por eso sí tiene campos.
   */
  modo: 'apertura' | 'medidor'
  /** Quién va a quedar registrado. Sale de `GET /me`; no se elige. Sólo se muestra en `medidor`. */
  nombre: string
  /** De quién son las Tareas que lista el combo. */
  staffId: number
  /** `true` mientras la escritura está en vuelo. */
  enCurso: boolean
  /** Por qué no se pudo. Se pinta dentro: encima del velo no se ve nada más. */
  aviso: string | null
  /** Sólo en `apertura`: abrir el día, sin destino y sin cronómetro. */
  onAbrir?: () => void
  /**
   * Sólo en `medidor`: arrancar el cronómetro sobre lo elegido. `tareaId` es `null` cuando se eligió
   * sólo el Proyecto: se mide contra el Proyecto entero.
   */
  onElegir?: (espacioId: number, tareaId: number | null) => void
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
  onAbrir,
  onElegir,
  onCancelar,
  onPosponer,
  onEntrarSinJornada
}: PropsDestinoDeJornada) {
  const esApertura = modo === 'apertura'
  const espacio = GLOSARIO.espacio.singular.toLowerCase()

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
          ? `Empieza el día de un clic. El ${espacio} o el ${GLOSARIO.cliente.singular.toLowerCase()} se los asignas después, desde el control de la cabecera, y puedes cambiarlos las veces que haga falta. Si ahora no puedes, cierra esta ventana: hoy no se vuelve a preguntar.`
          : `El cronómetro mide contra el ${espacio}, y contra una ${GLOSARIO.proceso.singular.toLowerCase()} suya si eliges una.`}
      >
        {esApertura
          ? (
            <CuerpoApertura
              enCurso={enCurso}
              aviso={aviso}
              onAbrir={onAbrir}
              onEntrarSinJornada={onEntrarSinJornada}
            />
            )
          : (
            // Radix sólo monta esto mientras el diálogo está abierto: las listas se piden al abrir
            // —ese montaje ES la petición— y la elección a medias no sobrevive a cerrar y volver a
            // abrir.
            <CuerpoMedidor
              nombre={nombre}
              staffId={staffId}
              enCurso={enCurso}
              aviso={aviso}
              onElegir={onElegir}
              onCancelar={onCancelar}
            />
            )}
      </ContenidoDialogo>
    </Dialogo>
  )
}

/**
 * La apertura: un botón y nada más.
 *
 * No hay estado que guardar porque no hay nada que elegir, así que tampoco hay forma de que la
 * ventana quede a medias. Lo único que recuerda es si se pidió la salida de emergencia, que es otra
 * pantalla y no otro campo.
 */
function CuerpoApertura ({
  enCurso,
  aviso,
  onAbrir,
  onEntrarSinJornada
}: {
  enCurso: boolean
  aviso: string | null
  onAbrir?: () => void
  onEntrarSinJornada?: () => void
}) {
  /** `true` cuando se pidió la salida de emergencia. Ver el docblock del módulo. */
  const [atascado, setAtascado] = useState(false)

  if (atascado) {
    return (
      <SalidaDeEmergencia
        onVolver={() => { setAtascado(false) }}
        onEntrarSinJornada={onEntrarSinJornada}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {aviso !== null && (
        <p role="alert" className="text-texto-peligro text-pretty text-sm">{aviso}</p>
      )}

      <div className="border-linea flex flex-wrap items-center justify-end gap-2 border-t pt-4">
        <button
          type="button"
          className="text-texto-sutil hover:text-texto mr-auto text-xs underline underline-offset-2"
          onClick={() => { setAtascado(true) }}
        >
          No puedo abrir mi jornada
        </button>

        <Boton variante="primario" cargando={enCurso} onClick={onAbrir}>
          <Play size={14} strokeWidth={2} aria-hidden="true" />
          Iniciar jornada
        </Boton>
      </div>
    </div>
  )
}

/**
 * El medidor: quién, sobre qué Proyecto y —si se quiere— sobre qué Tarea.
 *
 * Los dos van en un solo estado y no en dos: cambiar de Proyecto tiene que invalidar la Tarea —es de
 * otro Proyecto, y la API rechaza el par incoherente con un 422 que nadie entendería—. Con estados
 * separados eso sería un efecto que llama a `setState`, o sea un render en cascada y una ventana en
 * la que el par ya es incoherente. Juntos, la elección del Proyecto lo resuelve sola.
 */
function CuerpoMedidor ({
  nombre,
  staffId,
  enCurso,
  aviso,
  onElegir,
  onCancelar
}: {
  nombre: string
  staffId: number
  enCurso: boolean
  aviso: string | null
  onElegir?: (espacioId: number, tareaId: number | null) => void
  onCancelar?: () => void
}) {
  const [eleccion, setEleccion] = useState<{ espacio: number | null, tarea: number | null }>({
    espacio: null,
    tarea: null
  })

  const idEspacio = useId()
  const idTarea = useId()
  const idAyudaTarea = useId()

  const { espacio, tarea } = eleccion

  return (
    <div className="flex flex-col gap-4">
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
            onElegir={(id) => { setEleccion({ espacio: id, tarea: null }) }}
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
        <Boton variante="secundario" disabled={enCurso} onClick={onCancelar}>
          Cancelar
        </Boton>

        <Boton
          variante="primario"
          cargando={enCurso}
          disabled={espacio === null || enCurso}
          // El `disabled` dibuja; esto manda. Un estado que se adelante al render no puede disparar
          // un arranque sin destino, que es una ruta inventada contra un id que no existe.
          onClick={() => { if (espacio !== null) onElegir?.(espacio, tarea) }}
        >
          <Play size={14} strokeWidth={2} aria-hidden="true" />
          Arrancar
        </Boton>
      </div>
    </div>
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
 * No es un botón de "saltar": es una pantalla que nombra el problema y sus dos salidas reales. Desde
 * que la apertura no pide destino, la causa que queda es una sola —la API no responde— y quien se
 * topa con ella necesita poder seguir trabajando mientras alguien la levanta.
 *
 * "Entrar sin jornada" no la abre ni la finge: el aviso del Inicio y el control de la cabecera siguen
 * diciendo que falta, y la próxima recarga vuelve a pedirla. Es una excepción por esta vez, no un
 * permiso permanente — que es la única forma de que pida sin encerrar.
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
    <div className="flex flex-col gap-4">
      <p className="text-texto-tenue text-pretty text-sm">
        Puede que el servidor no esté respondiendo. Vuelve a intentarlo en un momento, y si sigue
        igual avísale a tu jefatura: sin jornada abierta las horas del día no se registran.
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
