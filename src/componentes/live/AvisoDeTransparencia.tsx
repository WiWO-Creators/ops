import { Eye } from 'lucide-react'

/**
 * Lo que las tarjetas del equipo muestran y lo que no, dicho a quien las mira.
 *
 * Va siempre debajo del tablero y no plegado: la gente del equipo aparece en él, y saber qué se ve de
 * ella no debería depender de que alguien abra un detalle. El texto es la lista cerrada de lo que
 * sale de la API —la jornada, el cronómetro, la sección del panel y la sala de Teletrabajo— y lo que
 * por diseño no existe: capturas, teclado, inactividad.
 *
 * Es un componente de servidor: no tiene estado ni eventos.
 */
export function AvisoDeTransparencia () {
  return (
    <aside
      aria-label="Qué se muestra de cada persona"
      className="border-linea bg-superficie-hundida rounded-tarjeta flex items-start gap-3 border p-3"
    >
      <Eye size={16} strokeWidth={2} aria-hidden="true" className="text-texto-sutil mt-0.5 shrink-0" />
      <div className="flex flex-col gap-1">
        <p className="text-texto text-sm font-medium text-balance">Qué se muestra de cada persona</p>
        <p className="text-texto-tenue text-xs text-pretty">
          Solo lo que ella misma declara en el panel: si abrió su jornada y desde qué hora, el cronómetro que
          tiene corriendo, la sección del panel en que está y, si entró a una, la sala de Teletrabajo (de una sala
          privada solo se dice que lo es). No se registra ni se muestra lo que hace dentro de cada pantalla: no hay
          capturas de pantalla, ni lectura del teclado, ni medición de inactividad.
        </p>
      </div>
    </aside>
  )
}
