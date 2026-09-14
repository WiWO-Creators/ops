import Link from 'next/link'
import { horasYMinutos, type DiaConResumen } from '@/datos/resumen-equipo'
import { formatearFecha } from '@/lib/fechas'
import { cn } from '@/lib/clases'

interface PropsDias {
  dias: DiaConResumen[]
  /** El día que se está mirando. Puede no estar en la lista: un día sin resumen también se puede pedir. */
  activo: string | null
}

/**
 * Los días anteriores que tienen resumen.
 *
 * === POR QUÉ ENLACES Y NO UN SELECTOR ===
 *
 * Porque cada día es una URL distinta y tiene que poder pegarse en un chat: "mirá el resumen del
 * martes" es exactamente lo que alguien va a querer mandar. Un `<select>` con estado de cliente
 * dejaría los treinta días detrás de la misma dirección, y de paso obligaría a hidratar una pantalla
 * que no tiene una sola interacción más.
 *
 * === POR QUÉ CADA UNO TRAE SUS HORAS ===
 *
 * Porque la lista no es un calendario, es una comparación: el día que se sale de la serie se ve en la
 * fila sin entrar. Sin las horas habría que abrir treinta días para encontrarlo.
 */
export function ResumenDelEquipoDias ({ dias, activo }: PropsDias) {
  if (dias.length === 0) return null

  return (
    <nav aria-label="Días anteriores" className="flex flex-col gap-2">
      <h2 className="border-linea-suave text-texto-sutil border-b pb-1.5 text-xs font-medium tracking-[0.08em] uppercase">
        Días anteriores
      </h2>

      <ul className="flex flex-wrap gap-2">
        {dias.map((dia) => {
          const esActivo = dia.dia === activo

          return (
            <li key={dia.dia}>
              <Link
                href={`/live/resumen?dia=${dia.dia}`}
                aria-current={esActivo ? 'page' : undefined}
                className={cn(
                  'border-linea hover:bg-hover flex min-h-11 flex-col justify-center rounded-control border px-3 py-1.5 transition-colors',
                  esActivo && 'border-acento bg-acento-suave'
                )}
              >
                <span className={cn('text-texto text-sm font-medium', esActivo && 'text-acento')}>
                  {formatearFecha(dia.dia)}
                </span>
                <span className="text-texto-sutil text-xs">
                  {horasYMinutos(dia.total_segundos)} · {dia.personas} {dia.personas === 1 ? 'persona' : 'personas'}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
