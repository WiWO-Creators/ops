import { Bloque } from '@/app/portal/(dentro)/detalle'
import { GLOSARIO } from '@/dominio/glosario'
import { FilaDeProceso, Nota } from './piezas'
import type { EstancadaGestion } from '@/datos/portal'

/**
 * Lo que no está bloqueado pero tampoco se mueve.
 *
 * Va junto a las trabas y no en el bloque de volúmenes porque responde la misma pregunta —«cuáles
 * son las trabas actuales»— por el otro lado: una {proceso} sin bloqueo declarado y sin movimiento
 * es una traba que nadie escribió todavía.
 *
 * `dias_sin_movimiento` es la VENTANA con la que se preguntó «¿se movió?», no la fecha del último
 * movimiento, y la ventana se cuenta contra el cierre del mes: en un mes cerrado, preguntar «se
 * movió en los últimos 14 días» contando desde hoy daría que todo estaba estancado.
 */
export function Estancadas ({ estancadas }: { estancadas: EstancadaGestion[] }) {
  if (estancadas.length === 0) return null

  const ventana = estancadas[0]?.dias_sin_movimiento ?? 0

  return (
    <Bloque titulo="Sin movimiento">
      <p className="text-texto-tenue text-xs">
        Nadie las bloqueó formalmente, pero al cierre del mes llevaban {ventana} días o más sin
        ninguna novedad.
      </p>

      <ul className="mt-2">
        {estancadas.map((proceso) => (
          <FilaDeProceso
            key={proceso.id}
            proceso={proceso}
            destaque={proceso.dias_abierta === null ? '—' : String(proceso.dias_abierta)}
            rotuloDelDestaque={proceso.dias_abierta === 1 ? 'día abierta' : 'días abierta'}
          />
        ))}
      </ul>

      <div className="mt-4">
        <Nota>
          «Sin movimiento» mira la actividad visible de cada {GLOSARIO.proceso.singular.toLowerCase()},
          no el detalle de cómo trabaja el equipo.
        </Nota>
      </div>
    </Bloque>
  )
}
