'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { History } from 'lucide-react'
import type { ReactElement } from 'react'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { PARAMETRO_TAREA, urlConParametro } from '@/componentes/datos/tabla'
import { CALIDAD_TAREAS } from '@/definiciones/calidad-tareas'
import {
  EJES_DE_CALIDAD,
  ORDEN_DE_EJES,
  TRAMOS_DE_CALIDAD,
  motivoDeLaNota,
  notaQuedoVieja,
  sinRevisarTodavia
} from '@/dominio/calidad-tareas'
import type { TareaCalidad } from '@/datos/recursos'
import type { Columna, DefinicionRecurso } from '@/definiciones/tipos'
import { cn } from '@/lib/clases'

/**
 * Las celdas del detector de tareas insuficientes que necesitan JSX.
 *
 * Viven aparte de `src/definiciones/calidad-tareas.ts` por la misma razon que las de Procesos: ese
 * archivo es un `.ts` y el runner de Node despoja tipos pero **no** JSX. Lo que hay alla es el texto
 * que baja al CSV; lo de aca es lo que se ve.
 */

/** Presentadores ricos por clave de columna. Lo que no este aca conserva el texto de la definicion. */
const CELDAS: Record<string, (fila: TareaCalidad) => ReactElement> = {
  name: (fila) => <EnlaceTarea fila={fila} />,
  due_date: (fila) => <Fecha valor={fila.due_date} comoVencimiento />,
  nota: (fila) => <CeldaNota fila={fila} />,
  falta: (fila) => <CeldaFalta fila={fila} />
}

/**
 * La definicion del detector con sus celdas de pantalla.
 *
 * Se arma una sola vez a nivel de modulo: `TablaRecurso` memoiza contra la identidad de la
 * definicion, y reconstruirla en cada render volveria a pintar todas las celdas.
 */
export const CALIDAD_TAREAS_RICA: DefinicionRecurso<TareaCalidad> = {
  ...CALIDAD_TAREAS,
  columnas: CALIDAD_TAREAS.columnas.map((columna: Columna<TareaCalidad>) => {
    const celda = CELDAS[columna.clave]

    return celda === undefined ? columna : { ...columna, presentar: celda }
  })
}

/**
 * El nombre de la Tarea, como enlace al mismo detalle que abre el resto del panel.
 *
 * Es el unico detalle de Tarea del producto (`ModalTarea`), y por eso la pantalla de calidad no se
 * arma el suyo: quien encuentra aca una descripcion pobre la arregla en la misma ficha que usaria
 * desde Procesos, y esa ficha ya ofrece la salida al panel clasico.
 *
 * Es un `<a>` de verdad y no un `div` con `onClick`: asi se abre con el teclado, se copia el enlace
 * y se abre en otra pestaña. Lee `useSearchParams` por su cuenta porque `presentar` solo recibe la
 * fila, y conservar los filtros vigentes en el enlace exige leer la URL desde el propio componente.
 */
function EnlaceTarea ({ fila }: { fila: TareaCalidad }): ReactElement {
  const params = useSearchParams()

  return (
    <Link
      href={urlConParametro(new URLSearchParams(params.toString()), PARAMETRO_TAREA, String(fila.id))}
      scroll={false}
      className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
    >
      {fila.name}
    </Link>
  )
}

/**
 * La nota con su tramo y, debajo, por que es esa.
 *
 * El motivo de la IA va como texto secundario y no como tooltip: es lo unico accionable de la fila
 * —dice que le falta al texto—, y esconderlo detras del mouse lo deja fuera del teclado y del
 * telefono. Se recorta a dos lineas para que una fila no mida el triple que sus vecinas; el texto
 * completo sigue en el `title`.
 *
 * Cuando la descripcion cambio despues de puntuarla se marca con el reloj: la nota que se ve
 * describe un texto que ya no existe, y sin el aviso se leeria como vigente.
 */
function CeldaNota ({ fila }: { fila: TareaCalidad }): ReactElement {
  const tramo = TRAMOS_DE_CALIDAD[fila.tramo]
  const vieja = notaQuedoVieja(fila.descripcion)
  const sinRevisar = sinRevisarTodavia(fila.descripcion)
  // Sin revisar el motivo seria la misma frase que ya dice la insignia: una linea que repite la de
  // arriba gasta alto de fila y no agrega nada.
  const motivo = sinRevisar ? null : motivoDeLaNota(fila)

  return (
    <div className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-1.5">
        {vieja && (
          <History
            size={13}
            aria-hidden="true"
            className="text-texto-sutil shrink-0"
          />
        )}
        <span className={cn('text-base leading-none font-semibold tabular-nums', tramo?.numero ?? 'text-texto')}>
          {fila.nota}
        </span>
        <Insignia tono={tramo?.tono ?? 'contorno'} tamano="chico">
          {tramo?.etiqueta ?? fila.tramo}
        </Insignia>

        {/* En contorno y no en aviso: que la IA no haya llegado todavia no es una falla de la
            Tarea, es trabajo pendiente de la cola, y pintarlo como alarma culparia a quien la
            escribio. La nota igual es un numero: el eje de descripcion usa un valor provisional. */}
        {sinRevisar && (
          <Insignia tono="contorno" tamano="chico" title="La IA todavía no miró esta descripción">
            Sin revisar
          </Insignia>
        )}
      </span>

      {vieja && (
        <span className="text-texto-sutil text-xs">
          La descripción cambió después de puntuarla: la nota quedó vieja.
        </span>
      )}

      {motivo !== null && (
        <span className="text-texto-tenue line-clamp-2 max-w-72 text-right text-xs" title={motivo}>
          {motivo}
        </span>
      )}
    </div>
  )
}

/**
 * Los ejes que no cumplen, como insignias.
 *
 * Una Tarea completa no deja la celda vacia: dice que esta completa. La celda vacia en una tabla de
 * hallazgos se lee como un dato que no cargo, que es justo lo contrario.
 */
function CeldaFalta ({ fila }: { fila: TareaCalidad }): ReactElement {
  if (fila.falta.length === 0) {
    return <Insignia tono="exito" tamano="chico">Completa</Insignia>
  }

  return (
    <span className="flex flex-wrap gap-1">
      {ORDEN_DE_EJES.filter((eje) => fila.falta.includes(eje)).map((eje) => (
        <Insignia key={eje} tono="peligro" tamano="chico">{EJES_DE_CALIDAD[eje]}</Insignia>
      ))}
    </span>
  )
}
