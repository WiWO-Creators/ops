import type { ReactNode } from 'react'
import { cn } from '@/lib/clases'
import { GLOSARIO } from '@/dominio/glosario'
import type { ProyectoEnPantalla } from '@/datos/pantalla-area'
import {
  CabeceraDeEscena, CUERPO_COLUMNA, CUERPO_PRINCIPAL, Nada, RELLENO_DE_FILA, RotulosDeColumna
} from './piezas'

/** La rejilla de columnas de esta escena. Su reparto vive en `pantalla.css`. */
const COLUMNAS = 'pantalla-columnas-espacios'

/**
 * Los Proyectos donde el area tiene trabajo abierto.
 *
 * El area no cuelga de los Proyectos por ningun lado: la relacion se deriva de las Tareas. Por eso la
 * escena contesta "dónde está trabajando el área", que es la pregunta de una pared, y no "qué
 * Proyectos le pertenecen", que no existe en el modelo.
 *
 * El avance es un porcentaje y **nunca un importe**: acá no hay ni presupuesto ni facturacion, por
 * decision del producto y por construccion del backend, que no consulta ninguna tabla de dinero.
 *
 * === LO QUE GANO AL VOLVERSE TABLA ===
 *
 * Era una rejilla de tarjetas de ~218 px: entraban seis. Ahora es una fila por Proyecto y entran mas
 * del doble, con una columna nueva que antes viajaba en el paquete y no se dibujaba en ningun sitio:
 * la fecha de entrega. Las atrasadas tienen columna propia en vez de ser un fragmento de frase al
 * final de un parrafo, que es lo que permite recorrerlas de arriba abajo sin leer.
 *
 * La barra de avance sobrevivio acá —y no en la escena de Tareas— porque hay una sola por fila y
 * sobra ancho: una columna de barras de 22vmin junto al numero se lee como un grafico, que es
 * exactamente lo que se quiere de "cómo va cada Proyecto".
 */
export function EscenaEspacios ({ items, ocultos }: {
  items: ProyectoEnPantalla[]
  ocultos: number
}): ReactNode {
  if (items.length === 0) return <Nada texto={`Sin ${GLOSARIO.espacio.plural.toLowerCase()} en curso`} />

  return (
    <div className="flex min-h-0 flex-col">
      <CabeceraDeEscena titulo={`${GLOSARIO.espacio.plural} en curso`} ocultos={ocultos} />

      <RotulosDeColumna columnas={COLUMNAS}>
        <span className="truncate">{GLOSARIO.espacio.singular}</span>
        <span className="portrait:hidden">Avance</span>
        <span className="text-right">%</span>
        <span className="truncate text-right">Abiertas</span>
        <span className="truncate text-right">Atrasadas</span>
        <span className="truncate text-right portrait:hidden">Entrega</span>
      </RotulosDeColumna>

      <ul className="pantalla-tablero min-h-0">
        {items.map((proyecto) => (
          <li key={proyecto.id} className={cn('pantalla-fila py-[0.55vmin] leading-[1.15]', RELLENO_DE_FILA, COLUMNAS)}>
            <span className={cn('text-texto truncate font-semibold', CUERPO_PRINCIPAL)}>
              {proyecto.name}
            </span>

            <span className="bg-linea-suave h-[1vmin] overflow-hidden rounded-full portrait:hidden">
              <span
                className="bg-acento block h-full rounded-full"
                style={{ width: `${proyecto.progress}%` }}
              />
            </span>

            <span className={cn('text-texto text-right font-semibold tabular-nums', CUERPO_COLUMNA)}>
              {proyecto.progress}%
            </span>

            <span className={cn('text-texto-tenue text-right tabular-nums', CUERPO_COLUMNA)}>
              {proyecto.procesos_abiertos}
            </span>

            <Atrasadas cuantas={proyecto.procesos_atrasados} />

            <span className={cn('text-texto-tenue text-right tabular-nums portrait:hidden', CUERPO_COLUMNA)}>
              {formatoCorto(proyecto.deadline)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Las Tareas atrasadas del Proyecto.
 *
 * El cero se dibuja en gris y no se esconde: una columna con huecos obliga a comprobar si falta el
 * dato o si el dato es cero, y esa duda cuesta mas que el cero.
 */
function Atrasadas ({ cuantas }: { cuantas: number }): ReactNode {
  if (cuantas === 0) {
    return <span className={cn('text-texto-sutil text-right tabular-nums', CUERPO_COLUMNA)}>0</span>
  }

  return (
    <span className={cn('text-texto-peligro text-right font-bold tabular-nums', CUERPO_COLUMNA)}>
      {cuantas}
    </span>
  )
}

/**
 * `YYYY-MM-DD` a `DD/MM`, y una raya cuando no hay fecha.
 *
 * A mano y no con `Intl`, por lo mismo que en `EscenaProcesos`: la fecha llega como dia calendario,
 * sin hora ni zona, y pasarla por `Date` la interpreta en UTC y la corre un dia en cuanto el
 * televisor esta al oeste de Greenwich.
 */
function formatoCorto (fecha: string | null): string {
  if (fecha === null) return '—'

  const [, mes, dia] = fecha.split('-')

  return dia === undefined || mes === undefined ? fecha : `${dia}/${mes}`
}
