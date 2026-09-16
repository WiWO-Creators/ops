import type { ReactNode } from 'react'
import { cn } from '@/lib/clases'
import { GLOSARIO } from '@/dominio/glosario'
import { diasHasta } from '@/lib/fechas'
import type { ProyectoEnPantalla } from '@/datos/pantalla-area'
import {
  CabeceraDeEscena, CeldaQueAlterna, CUERPO_COLUMNA, CUERPO_PRINCIPAL, FILA_VIVA, Nada,
  RELLENO_DE_FILA, RotulosDeColumna, escalonDeFila
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
 *
 * === QUE ALTERNA ===
 *
 * La columna del porcentaje dice el avance y, cada `PERIODO_DE_DATO_MS`, cuanto falta para la entrega.
 * Se eligio esa columna y no la de la fecha porque **la fecha no existe en vertical** —se cae con la
 * barra por falta de ancho—, y ahi el "faltan 3 días" es la unica forma de que la pared diga cuando
 * vence algo. Ademas el porcentaje ya esta dibujado al lado en la barra, asi que es la columna que
 * menos se pierde al turnarse. No alterna el nombre del Proyecto, que es lo que identifica la fila.
 */
export function EscenaEspacios ({ items, ocultos, ahora, zona, fase }: {
  items: ProyectoEnPantalla[]
  ocultos: number
  /** El reloj de pared, para saber cuantos dias faltan. `null` antes de hidratar. */
  ahora: number | null
  /** La zona del negocio: "cuantos dias faltan" se cuenta contra su calendario, no el del aparato. */
  zona: string | null
  fase: 0 | 1
}): ReactNode {
  if (items.length === 0) return <Nada texto={`Sin ${GLOSARIO.espacio.plural.toLowerCase()} en curso`} />

  return (
    <div className="flex min-h-0 flex-col">
      <CabeceraDeEscena titulo={`${GLOSARIO.espacio.plural} en curso`} ocultos={ocultos} />

      <RotulosDeColumna columnas={COLUMNAS}>
        <span className="truncate">{GLOSARIO.espacio.singular}</span>
        <span className="portrait:hidden">Avance</span>
        <CeldaQueAlterna fase={fase} className="text-right" principal="%" alterno="Entrega" />
        <span className="truncate text-right">Abiertas</span>
        <span className="truncate text-right">Atrasadas</span>
        <span className="truncate text-right portrait:hidden">Entrega</span>
      </RotulosDeColumna>

      <ul className="pantalla-tablero min-h-0">
        {items.map((proyecto, indice) => (
          <li
            key={proyecto.id}
            className={cn('pantalla-fila py-[0.55vmin] leading-[1.15]', FILA_VIVA, RELLENO_DE_FILA, COLUMNAS)}
            style={escalonDeFila(indice)}
          >
            <span className={cn('text-texto truncate font-semibold', CUERPO_PRINCIPAL)}>
              {proyecto.name}
            </span>

            <span className="bg-linea-suave h-[1vmin] overflow-hidden rounded-full portrait:hidden">
              <span
                className="bg-acento block h-full rounded-full"
                style={{ width: `${proyecto.progress}%` }}
              />
            </span>

            <CeldaQueAlterna
              fase={fase}
              className={cn('text-texto text-right font-semibold tabular-nums', CUERPO_COLUMNA)}
              principal={`${proyecto.progress}%`}
              alterno={cuantoFalta(proyecto.deadline, ahora, zona)}
            />

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

/**
 * Cuanto falta para la entrega, en palabras cortas.
 *
 * Se cuenta por DIA CALENDARIO y en la zona del negocio, no por instante ni con el reloj del
 * televisor: un Proyecto que entrega hoy a las 09:00 sigue entregando "hoy" a las 18:00, y un aparato
 * con la zona en UTC diria "mañana" media tarde. Es el mismo criterio de `estadoVencimiento()` del
 * panel.
 *
 * @param fecha `YYYY-MM-DD`, o `null` si el Proyecto no tiene entrega
 * @param ahora instante en milisegundos, o `null` antes de hidratar
 * @param zona  zona IANA del negocio, o `null` para caer en la del aparato
 * @returns "hoy", "en 3 días", "hace 5 días" o una raya cuando no hay con que contestar
 */
function cuantoFalta (fecha: string | null, ahora: number | null, zona: string | null): string {
  const hoy = diaCalendario(ahora, zona)

  if (fecha === null || hoy === null) return '—'

  const dias = diasHasta(fecha, new Date(`${hoy}T00:00:00`))

  if (dias === null) return '—'
  if (dias === 0) return 'hoy'
  if (dias > 0) return `en ${dias} ${dias === 1 ? 'día' : 'días'}`

  return `hace ${-dias} ${dias === -1 ? 'día' : 'días'}`
}

/**
 * El dia de hoy (`YYYY-MM-DD`) en la zona del negocio.
 *
 * `sv-SE` porque es el unico locale que `Intl` formatea nativamente como `YYYY-MM-DD`: escribirlo a
 * mano con `getFullYear()` daria el dia del televisor, que es justo lo que no se quiere.
 */
function diaCalendario (ahora: number | null, zona: string | null): string | null {
  if (ahora === null || !Number.isFinite(ahora)) return null

  const opciones: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' }

  if (zona !== null && zona !== '') opciones.timeZone = zona

  try {
    return new Intl.DateTimeFormat('sv-SE', opciones).format(new Date(ahora))
  } catch {
    // Una zona que no se entiende no puede apagar una columna de la pared: se cae a la del aparato.
    return new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(ahora))
  }
}
