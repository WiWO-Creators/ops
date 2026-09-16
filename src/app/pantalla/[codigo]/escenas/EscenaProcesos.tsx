import type { ReactNode } from 'react'
import { cn } from '@/lib/clases'
import { GLOSARIO } from '@/dominio/glosario'
import type { TareaEnPantalla } from '@/datos/pantalla-area'
import {
  CabeceraDeEscena, CeldaQueAlterna, CUERPO_COLUMNA, CUERPO_PRINCIPAL, FILA_VIVA, Nada,
  RELLENO_DE_FILA, RotulosDeColumna, escalonDeFila, nombreCorto, rotuloDeAlcance
} from './piezas'

/** La rejilla de columnas de esta escena. Su reparto vive en `pantalla.css`. */
const COLUMNAS = 'pantalla-columnas-procesos'

/**
 * Las Tareas abiertas del area, por urgencia. El tablero de salidas de la pared.
 *
 * === POR QUE UNA TABLA Y NO FICHAS ===
 *
 * Nacio como una lista de fichas con dos lineas cada una. Entraban cinco. El area de prueba tiene
 * casi doscientas Tareas abiertas, asi que la pared enseñaba el 2,5% de lo que pasa y lo hacia con
 * una tipografia de cartel.
 *
 * Una tabla de columnas fijas entrega el triple de filas sin bajar el nombre de la Tarea de los
 * ~32 px que se leen desde el pasillo, porque lo que se recupera no es cuerpo de letra: es el aire
 * entre tarjetas, el borde, el redondeo y la segunda linea. La jerarquia la hacen ahora el peso y el
 * color, no el tamaño — igual que en un tablero de aeropuerto, donde el destino y la puerta miden lo
 * mismo y no se confunden nunca.
 *
 * === LO QUE NO CAMBIO ===
 *
 * El orden lo decide la API —vencidas, despues por fecha, y las sin fecha al final— y la pantalla no
 * lo toca: reordenar acá haria que la lista se reacomode sola en cada sondeo mientras alguien la esta
 * leyendo.
 *
 * Lo vencido se marca con color y con la palabra, no solo con color: a cuatro metros y con el reflejo
 * de una ventana, un rojo y un naranja son el mismo color.
 *
 * === QUE ALTERNA ===
 *
 * La ultima columna dice quien la tiene y, cada `PERIODO_DE_DATO_MS`, la prioridad. La prioridad
 * viajaba en el paquete desde el primer dia y no se dibujaba en ningun sitio: no habia ancho para una
 * septima columna sin recortar el nombre de la Tarea, que es lo unico que de verdad se lee. Compartir
 * la columna de "quien" es lo que la saca del paquete a la pared. No alternan ni el nombre ni "vence",
 * que son la identidad y la urgencia de la fila.
 *
 * En vertical la fila se queda en cuatro columnas —nombre, vence, quien y la barra de color— porque
 * hay 92vmin de ancho contra los 170 de la pared tumbada: meter las siete dejaba el nombre de la
 * Tarea en veinte caracteres, y una Tarea que no se puede nombrar no se muestra. Lo dice la plantilla
 * `portrait` de `.pantalla-columnas-procesos` en `pantalla.css`, y los `portrait:hidden` de acá.
 */
export function EscenaProcesos ({ items, ocultos, total, fase, esGlobal = false }: {
  items: TareaEnPantalla[]
  ocultos: number
  total: number
  fase: 0 | 1
  /** La pantalla de toda la compañia no tiene area que nombrar: ver `rotuloDeAlcance`. */
  esGlobal?: boolean
}): ReactNode {
  if (items.length === 0) return <Nada texto={`Sin ${GLOSARIO.proceso.plural.toLowerCase()} abiertas`} />

  return (
    <div className="flex min-h-0 flex-col">
      <CabeceraDeEscena titulo={`${GLOSARIO.proceso.plural} ${rotuloDeAlcance(esGlobal)}`} total={total} ocultos={ocultos} />

      <RotulosDeColumna columnas={COLUMNAS}>
        <span />
        <span className="truncate">{GLOSARIO.proceso.singular}</span>
        <span className="truncate portrait:hidden">{GLOSARIO.espacio.singular}</span>
        <span className="truncate portrait:hidden">Estado</span>
        <span className="text-right portrait:hidden">%</span>
        <span className="truncate">Vence</span>
        <CeldaQueAlterna fase={fase} principal="Quién" alterno="Prioridad" />
      </RotulosDeColumna>

      <ul className="pantalla-tablero min-h-0">
        {items.map((tarea, indice) => (
          <li
            key={tarea.id}
            className={cn('pantalla-fila py-[0.55vmin] leading-[1.15]', FILA_VIVA, RELLENO_DE_FILA, COLUMNAS)}
            style={escalonDeFila(indice)}
          >
            {/*
              * La barra de color del estado. Es la unica columna que no es texto, y en vertical es
              * lo unico que queda del estado: ahi la columna en palabras se cae por falta de ancho.
              */}
            <span
              className="h-[2.8vmin] w-full rounded-full"
              style={{ backgroundColor: tarea.status?.color ?? 'var(--color-linea-fuerte)' }}
            />

            <span className={cn('text-texto truncate font-semibold', CUERPO_PRINCIPAL)}>
              {tarea.name}
            </span>

            <span className={cn('text-texto-tenue truncate portrait:hidden', CUERPO_COLUMNA)}>
              {tarea.project?.name ?? '—'}
            </span>

            <span className={cn('text-texto-tenue truncate portrait:hidden', CUERPO_COLUMNA)}>
              {tarea.status?.name ?? '—'}
            </span>

            <Avance progreso={tarea.progress} />

            <Vencimiento fecha={tarea.due_date} vencida={tarea.overdue} />

            <CeldaQueAlterna
              fase={fase}
              className={cn('text-texto-tenue', CUERPO_COLUMNA)}
              principal={<Quien personas={tarea.assignees} />}
              alterno={tarea.priority?.name ?? 'Sin prioridad'}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * El avance en checklist, como numero y no como barra.
 *
 * La barra se quedo en la escena de Proyectos, donde hay una por fila y sobra ancho. Acá son quince
 * filas y una columna de barras de 10vmin se lee como una textura, no como quince datos; un
 * porcentaje tabular alineado a la derecha se compara de un vistazo, que es lo que una columna sirve
 * para hacer.
 *
 * `percent` es `null` cuando la Tarea no tiene checklist, y entonces se pone una raya: un cero
 * inventado se lee como "no empezó", que es una afirmacion que la API no hizo.
 */
function Avance ({ progreso }: { progreso: TareaEnPantalla['progress'] }): ReactNode {
  if (progreso.percent === null) {
    return <span className={cn('text-texto-sutil text-right portrait:hidden', CUERPO_COLUMNA)}>—</span>
  }

  return (
    <span className={cn('text-texto-tenue text-right tabular-nums portrait:hidden', CUERPO_COLUMNA)}>
      {progreso.percent}%
    </span>
  )
}

/**
 * La fecha de vencimiento, con la palabra y no solo el color.
 *
 * En una tabla el fondo rojo de la celda tiene ademas una segunda virtud que no tenia en una ficha:
 * marca el renglon entero a lo largo de dos metros de pared, que es como se encuentra una fila
 * urgente sin leerlas todas.
 */
function Vencimiento ({ fecha, vencida }: { fecha: string | null, vencida: boolean }): ReactNode {
  if (fecha === null) {
    return <span className={cn('text-texto-sutil', CUERPO_COLUMNA)}>Sin fecha</span>
  }

  return (
    <span
      className={cn(
        'truncate rounded-[0.8vmin] font-semibold tabular-nums',
        CUERPO_COLUMNA,
        vencida ? 'bg-superficie-peligro text-texto-peligro px-[1vmin]' : 'text-texto-tenue'
      )}
    >
      {vencida && 'Venció '}{formatoCorto(fecha)}
    </span>
  )
}

/**
 * Quien la tiene asignada, en letra y no en caras.
 *
 * La version de fichas apilaba hasta tres avatares de 5vmin. En una fila de tablero esos avatares
 * tendrian que medir 3.4vmin para no engordar el renglon, y a cuatro metros una cara de 3.4vmin no es
 * una cara: es una mancha de color, y tres superpuestas son tres manchas. Un nombre abreviado se lee,
 * se busca recorriendo la columna con la vista, y ocupa lo mismo.
 *
 * Se nombra a la primera y el resto se cuenta. Quien necesite la lista completa la tiene en el panel,
 * no en una pared.
 */
function Quien ({ personas }: { personas: TareaEnPantalla['assignees'] }): ReactNode {
  const primera = personas[0]

  if (primera === undefined) return <span className="text-texto-sutil">Sin asignar</span>

  return (
    <>
      {nombreCorto(primera.name)}
      {personas.length > 1 && (
        <span className="text-texto-sutil tabular-nums"> +{personas.length - 1}</span>
      )}
    </>
  )
}

/**
 * `YYYY-MM-DD` a `DD/MM`.
 *
 * A mano y no con `Intl`: la fecha llega como dia calendario, sin hora ni zona, y pasarla por `Date`
 * la interpreta en UTC y la corre un dia en cuanto el televisor esta al oeste de Greenwich.
 */
function formatoCorto (fecha: string): string {
  const [, mes, dia] = fecha.split('-')

  return dia === undefined || mes === undefined ? fecha : `${dia}/${mes}`
}
