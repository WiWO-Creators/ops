import Link from 'next/link'
import type { HojaDelEquipo } from '@/datos/supervision'
import { etiquetaDeEscalon } from '@/dominio/escalon'
import { enlaceDeHoja, esperaConfirmacion, hojasPorConfirmar, textoDeEstadoDelEquipo } from '@/dominio/supervision'
import { cn } from '@/lib/clases'

/** Clases de la insignia de cada estado. */
const CLASES_ESTADO: Record<HojaDelEquipo['estado'], string> = {
  sin_firmar: 'border-linea text-texto-tenue border',
  firmada: 'bg-acento text-acento-contenido',
  confirmada: 'bg-relleno-exito text-relleno-exito-contenido',
  devuelta: 'bg-relleno-peligro text-relleno-peligro-contenido'
}

interface PropsHojasDelEquipo {
  filas: HojaDelEquipo[]
  fecha: string
  /** El supervisor cuya hoja se está mirando, para marcarlo. */
  activo: number
}

/**
 * "Hojas de tu equipo": las hojas del día de los supervisores que cuelgan de quien mira.
 *
 * Cada fila dice en qué va la hoja —sin firmar, firmada a qué hora, confirmada o devuelta— y lleva a
 * ella con [Ver], donde están los botones de confirmar o devolver. Las firmadas que esperan
 * confirmación se destacan: son lo único de la lista que pide algo a quien la mira. La página no
 * monta la sección cuando la lista viene vacía.
 */
export function HojasDelEquipo ({ filas, fecha, activo }: PropsHojasDelEquipo) {
  const pendientes = hojasPorConfirmar(filas)

  return (
    <section aria-labelledby="hojas-del-equipo" className="flex flex-col gap-2">
      <h2 id="hojas-del-equipo" className="text-base font-semibold">
        Hojas de tu equipo
        {pendientes > 0 && (
          <span className="text-texto-aviso ml-2 text-sm font-normal">
            {pendientes === 1 ? '1 por confirmar' : `${pendientes} por confirmar`}
          </span>
        )}
      </h2>
      <ul className="border-linea rounded-tarjeta divide-linea flex flex-col divide-y border">
        {filas.map((fila) => {
          const porConfirmar = esperaConfirmacion(fila)

          return (
            <li
              key={fila.staffid}
              className={cn(
                'flex flex-wrap items-center justify-between gap-2 p-3 text-sm',
                porConfirmar && 'bg-superficie-elevada border-l-acento border-l-4',
                fila.staffid === activo && 'bg-relleno-neutro'
              )}
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="font-medium">
                  {fila.nombre} <span className="text-texto-tenue font-normal">({etiquetaDeEscalon(fila.escalon)})</span>
                </p>
                <p className="text-texto-tenue text-xs">
                  {fila.totales.tareas} tareas · {fila.totales.revisadas} revisadas · {fila.totales.completadas} completadas
                  {fila.estado === 'devuelta' && fila.confirmacion?.nota != null && <> · Nota: {fila.confirmacion.nota}</>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn('rounded-control px-2 py-0.5 text-xs font-semibold', CLASES_ESTADO[fila.estado])}>
                  {textoDeEstadoDelEquipo(fila)}
                </span>
                <Link
                  href={enlaceDeHoja(fecha, fila.staffid)}
                  aria-label={`Ver la hoja de ${fila.nombre}`}
                  aria-current={fila.staffid === activo ? 'page' : undefined}
                  className="border-linea bg-control hover:bg-hover rounded-control inline-flex h-8 items-center border px-3 text-xs font-medium"
                >
                  Ver
                </Link>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
