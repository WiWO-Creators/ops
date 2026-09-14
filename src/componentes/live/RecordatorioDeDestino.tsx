'use client'

import { useEffect, useId, useState } from 'react'
import { X } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'

/**
 * El recordatorio que aparece justo después de abrir la jornada.
 *
 * === POR QUE EXISTE ===
 *
 * La ventana de apertura dejó de pedir destino: se abre el día de un clic y la jornada arranca sin
 * Proyecto ni Cliente. Eso resuelve el atasco de las nueve de la mañana y deja un cabo suelto — que
 * nadie se acuerde nunca de asignarlo, y que al cerrar el día ocho horas no tengan a qué imputarse.
 * Este aviso es el cabo atado: dice lo que falta en el momento exacto en que se puede hacer algo al
 * respecto, y se va solo.
 *
 * === POR QUE FLOTANTE Y NO MODAL ===
 *
 * Porque lo de atrás se sigue usando. Un modal aquí sería exactamente la interrupción que se acaba de
 * quitar de la apertura, sólo que tres segundos más tarde: quien acaba de abrir su jornada quiere
 * empezar a trabajar, no contestar otra ventana. Un aviso que se aparta solo no le cobra nada a quien
 * ya sabe lo que tiene que hacer.
 *
 * Por el mismo motivo se descarta solo a los pocos segundos y no se queda pegado: un aviso permanente
 * se convierte en parte del decorado y deja de leerse, que es la forma más cara de no avisar.
 *
 * === POR QUE EL AUTO-DESCARTE SE PAUSA ===
 *
 * Porque un temporizador que corre mientras la persona está usando el aviso se lo quita de debajo de
 * las manos: quien navega con teclado tarda en llegar a la casilla, y quien pidió menos movimiento
 * suele tardar más en leer. Mientras el puntero esté encima o el foco esté dentro, el reloj no corre;
 * al salir vuelve a empezar entero, porque reanudar el resto de un plazo que la persona no vio
 * empezar es peor que darle el plazo completo otra vez.
 *
 * Se anuncia como `status` y no como `alert`: es un recordatorio, no un error, y un `alert`
 * interrumpiría a quien usa lector de pantalla en mitad de lo que esté oyendo.
 *
 * === LA CASILLA ===
 *
 * "No volver a mostrarme esto" apaga el aviso **para siempre** en este navegador
 * (`fijarRecordatorioDeDestino`). Por eso no cierra el aviso al marcarla: quien se equivoque de clic
 * tiene que poder desmarcarla sin volver a abrir una jornada. Y por eso el control de la cabecera
 * lleva la misma casilla, que es donde se vuelve a encender.
 */

/**
 * Cuánto se queda a la vista sin que nadie lo toque.
 *
 * Nueve segundos y no tres: la frase tiene dos líneas y dos controles, y el plazo tiene que alcanzar
 * para leerla y decidir. Tampoco veinte, que ya es un aviso que se queda.
 */
const SEGUNDOS_A_LA_VISTA = 9

interface PropsRecordatorio {
  /** `true` si la persona quiere seguir viendo este aviso. Es lo que la casilla invierte. */
  activo: boolean
  /** La casilla cambió. Quien lo reciba guarda la preferencia. */
  onCambiarActivo: (activo: boolean) => void
  /** Ir a asignar el destino ahora mismo: abre la ventana donde se elige. */
  onAsignar: () => void
  /** El aviso terminó: se descartó a mano, o se le acabó el plazo. */
  onCerrar: () => void
}

export function RecordatorioDeDestino ({
  activo,
  onCambiarActivo,
  onAsignar,
  onCerrar
}: PropsRecordatorio) {
  /** `true` mientras el puntero está encima o el foco está dentro. Congela el plazo. */
  const [retenido, setRetenido] = useState(false)
  const idCasilla = useId()

  useEffect(() => {
    if (retenido) return

    const id = globalThis.setTimeout(onCerrar, SEGUNDOS_A_LA_VISTA * 1000)

    return () => { globalThis.clearTimeout(id) }
  }, [retenido, onCerrar])

  const espacio = GLOSARIO.espacio.singular.toLowerCase()

  return (
    <div
      role="status"
      onMouseEnter={() => { setRetenido(true) }}
      onMouseLeave={() => { setRetenido(false) }}
      onFocusCapture={() => { setRetenido(true) }}
      onBlurCapture={() => { setRetenido(false) }}
      className={cn(
        // Mismo sitio y mismo aspecto que el aviso de versión nueva (`estructura/VigilanteDeVersion`):
        // en móvil sube por encima del botón del chat, que vive en la esquina inferior derecha.
        'border-linea bg-superficie-flotante fixed bottom-24 left-1/2 z-50 -translate-x-1/2 sm:bottom-4',
        'flex w-[min(30rem,calc(100vw-2rem))] flex-col gap-3 rounded-2xl border px-4 py-3 shadow-lg',
        'animate-entrar-abajo'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-texto text-sm font-semibold">Tu jornada ya está abierta</p>
          <p className="text-texto-tenue text-xs text-pretty">
            Recuerda asignar en qué {espacio} o {GLOSARIO.cliente.singular.toLowerCase()} estás
            trabajando: mientras no lo hagas, las horas del día quedan sin imputar.
          </p>
        </div>

        <Boton
          variante="sutil"
          tamano="chico"
          soloIcono
          aria-label="Descartar el recordatorio"
          onClick={onCerrar}
        >
          <X className="size-4" />
        </Boton>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* La casilla y su etiqueta van unidas por `htmlFor`: sin eso el área de clic es un cuadrado
            de trece píxeles y el lector de pantalla lee una casilla sin nombre. */}
        <div className="flex items-center gap-2">
          <input
            id={idCasilla}
            type="checkbox"
            className="accent-acento size-4 shrink-0"
            checked={!activo}
            onChange={(evento) => { onCambiarActivo(!evento.target.checked) }}
          />
          <label htmlFor={idCasilla} className="text-texto-sutil text-xs">
            No volver a mostrarme esto
          </label>
        </div>

        <Boton variante="primario" tamano="chico" onClick={onAsignar}>
          Asignar ahora
        </Boton>
      </div>
    </div>
  )
}
