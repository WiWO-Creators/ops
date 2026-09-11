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
 * === EL PROYECTO OBLIGA; LA TAREA SE PIDE ===
 *
 * El botón se habilita con el Proyecto elegido, aunque no haya Tarea. La reunión del 2026-09-11 las
 * hizo obligatorias a las dos y el cliente lo revirtió el mismo día: quiere poder abrir la jornada
 * eligiendo sólo un Proyecto, para demostrar que está trabajando en él.
 *
 * El tercer escalón no se esconde ni se atenúa por eso. Un registro con Tarea dice en qué se fue el
 * día y uno sin ella sólo a quién facturarle, así que la Tarea se sigue ofreciendo con una línea que
 * dice que conviene elegirla. Una línea, no un bloqueo y no un reproche: quien no la elige tiene sus
 * motivos y ya está abriendo su jornada.
 *
 * Lo que el botón sí refleja es lo que la API rechaza: `POST /me/jornada` exige `project_id` y
 * comprueba que la Tarea, **cuando viene**, pertenezca a ese Proyecto.
 *
 * === POR QUE ESTA VENTANA NO ES UNA TRAMPA ===
 *
 * En modo `apertura` no se va con `Escape` ni clicando fuera, igual que el cierre. Pero hay gente que
 * **no puede** abrir jornada: quien no tiene Proyectos asignados, quien no tiene Tareas en el que
 * eligió, y cualquiera el día que la API falle. Dejarlos frente a un botón inerte sería sacarlos del
 * sistema entero por un dato que no depende de ellos.
 *
 * Por eso "No puedo abrir mi jornada" abre siempre una salida con dos puertas reales: cerrar sesión,
 * o entrar sin jornada. Está a un clic de distancia y no en la fila principal a propósito: obligar es
 * poner la excepción un paso más lejos que la regla, no tapiarla.
 *
 * Que la Tarea sea opcional achica ese grupo —quien tiene Proyecto y ninguna Tarea asignada ya puede
 * abrir— pero no lo vacía: sigue habiendo quien no tiene ningún Proyecto y días en que la API falla.
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
  /** Sólo en `medidor`: salir sin arrancar nada. */
  onCancelar?: () => void
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
  onCancelar,
  onEntrarSinJornada
}: PropsDestinoDeJornada) {
  const obligatorio = modo === 'apertura'

  return (
    <Dialogo
      open={abierto}
      onOpenChange={(nuevo) => { if (!nuevo && !obligatorio) onCancelar?.() }}
    >
      <ContenidoDialogo
        ancho="chico"
        titulo={obligatorio
          ? 'Antes de empezar, di en qué vas a trabajar'
          : 'Elige dónde medir'}
        descripcion={obligatorio
          ? `Elige el ${GLOSARIO.espacio.singular.toLowerCase()}: sin eso las horas de hoy no se pueden imputar a nada. La ${GLOSARIO.proceso.singular.toLowerCase()} es opcional.`
          : `El cronómetro mide contra el ${GLOSARIO.espacio.singular.toLowerCase()}, y contra una ${GLOSARIO.proceso.singular.toLowerCase()} suya si eliges una.`}
        // Los dos gestos con los que se descarta una ventana sin leerla. Sólo en `apertura`: ahí la
        // salida son los botones, incluida la de emergencia. Ver el docblock de arriba.
        onEscapeKeyDown={(evento) => { if (obligatorio) evento.preventDefault() }}
        onPointerDownOutside={(evento) => { if (obligatorio) evento.preventDefault() }}
        onInteractOutside={(evento) => { if (obligatorio) evento.preventDefault() }}
      >
        {/* Radix sólo monta esto mientras el diálogo está abierto: las listas se piden al abrir —ese
            montaje ES la petición— y la elección a medias no sobrevive a cerrar y volver a abrir. */}
        <CuerpoDestino
          obligatorio={obligatorio}
          nombre={nombre}
          staffId={staffId}
          enCurso={enCurso}
          aviso={aviso}
          onElegir={onElegir}
          onCancelar={onCancelar}
          onEntrarSinJornada={onEntrarSinJornada}
        />
      </ContenidoDialogo>
    </Dialogo>
  )
}

interface PropsCuerpo {
  obligatorio: boolean
  nombre: string
  staffId: number
  enCurso: boolean
  aviso: string | null
  onElegir: (espacioId: number, tareaId: number | null) => void
  onCancelar?: () => void
  onEntrarSinJornada?: () => void
}

function CuerpoDestino ({
  obligatorio,
  nombre,
  staffId,
  enCurso,
  aviso,
  onElegir,
  onCancelar,
  onEntrarSinJornada
}: PropsCuerpo) {
  // Los dos van en un solo estado y no en dos: cambiar de Proyecto tiene que invalidar la Tarea
  // —es de otro Proyecto, y la API rechaza el par incoherente con un 422 que nadie entendería— y con
  // estados separados eso sería un efecto que llama a `setState`, o sea un render en cascada y una
  // ventana en la que el par ya es incoherente. Juntos, la elección del Proyecto lo resuelve sola.
  const [eleccion, setEleccion] = useState<{ espacio: number | null, tarea: number | null }>({
    espacio: null,
    tarea: null
  })
  /** `true` cuando se pidió la salida de emergencia. Ver el docblock del módulo. */
  const [atascado, setAtascado] = useState(false)

  const idEspacio = useId()
  const idTarea = useId()
  const idAyudaTarea = useId()

  const { espacio, tarea } = eleccion
  // El Proyecto es lo único que bloquea. Ver el docblock del módulo.
  const completo = espacio !== null

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
        {obligatorio
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
          disabled={!completo || enCurso}
          onClick={() => { if (espacio !== null) onElegir(espacio, tarea) }}
        >
          <Play size={14} strokeWidth={2} aria-hidden="true" />
          {obligatorio ? 'Abrir jornada y empezar' : 'Arrancar'}
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
