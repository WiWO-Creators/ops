import type { ReactNode } from 'react'
import { cn } from '@/lib/clases'
import { GLOSARIO } from '@/dominio/glosario'
import { ANCHO_MAYUSCULA_EM, ANCHO_SOBRIO_EM, cupoDeFichas, planDeOla } from '@/dominio/solari'
import type { PlanDeOla } from '@/dominio/solari'
import type { TareaEnPantalla } from '@/datos/pantalla-area'
import {
  CabeceraDeEscena, CeldaQueAlterna, CUERPO_COLUMNA, CUERPO_PRINCIPAL, FichaDeTablero, Nada,
  RELLENO_DE_FILA, Rotulo, RotulosDeColumna, nombreCorto, rotuloDeAlcance
} from './piezas'

/** La rejilla de columnas de esta escena. Su reparto vive en `pantalla.css`. */
const COLUMNAS = 'pantalla-columnas-procesos'

/**
 * Cuanto pesa cada columna en la ola, en el orden del DOM.
 *
 * El nombre pesa el triple que una columna de apoyo: una ficha girando en el nombre cuenta que la fila
 * cambio y una girando en el porcentaje no la ve nadie. La suma no importa —`planDeOla()` reparte el
 * presupuesto de la pagina por peso—, solo la proporcion.
 */
const PESOS = [6, 2, 1, 2] as const

/**
 * Cuantos caracteres caben en cada columna.
 *
 * Los anchos son los de `.pantalla-columnas-procesos` en `pantalla.css` y no se pueden inventar acá:
 * una tira de fichas no se recorta con `truncate`, asi que lo que no cabe se dibuja igual y lo tapa el
 * `overflow` — DOM pagado a cambio de nada. Ver `cupoDeFichas()`.
 *
 * El nombre es la columna flexible: lo que sobra despues de las fijas, los cuatro huecos de 2vmin y el
 * relleno de fila, sobre los ~167vmin de fila que quedan en la pared tumbada.
 *
 * **Todas las columnas van sobrias.** Se probo con fichas de ancho fijo y la captura lo dejo claro:
 * una ficha uniforme cuesta 0.79em por caracter contra los 0.56 de una palabra, y en una fila de
 * columnas de texto eso es casi un tercio de la informacion de la pared. Ver `ANCHO_DE_FICHA_EM`.
 *
 * === DE DONDE SALEN ESTOS NUMEROS, Y POR QUE LA FILA PERDIO DOS COLUMNAS ===
 *
 * La pared tumbada da 166.78vmin de fila util: 177.78 de ancho menos los 8 del marco y los 3 del
 * relleno de la fila. Con siete columnas se iban 12 en huecos y quedaban 154.78 de texto, y el reparto
 * no daba: el nombre de una Tarea llega a 36 caracteres —60.5vmin a 3vmin en caja mixta— y solo tenia
 * 51. La captura del televisor lo enseñaba fila por fila: "Revisar las tarjetas del tabl…",
 * "REDISEÑO DE MAR…", "Esperando …". Subirle dos caracteres al recorte no era un arreglo: faltaban
 * ~30vmin, o sea una columna entera.
 *
 * Asi que se fueron las dos que menos dicen, y en este orden:
 *
 * 1. **El `%` de checklist.** Es "—" en la mayoria de las Tareas —solo las que llevan checklist lo
 *    tienen— y es, por el propio reparto de pesos de esta escena, la columna que nadie mira.
 * 2. **El estado en palabras.** No se pierde el dato: la barra de color de la izquierda ES el estado,
 *    con el color que el panel le dio, y es ademas lo unico que queda de el en la pared de pie, donde
 *    la columna en palabras ya se caia por falta de ancho. La barra crecio a 1.2vmin para poder
 *    cargarlo sola.
 *
 * Con cinco columnas los huecos bajan a 8vmin y el reparto cierra con holgura: 43 para el Proyecto en
 * caja alta (21 caracteres, que es "PORTAL DE AUTOGESTIÓN" entero), 22 para "Venció dd/mm", 27 para
 * "Facundo L. +2", y los ~65 que sobran para el nombre de la Tarea. Nada se recorta.
 */
const CUPO = {
  /** 38 caracteres: la Tarea mas larga del catalogo son 36, asi que sobra y no se dibuja de mas. */
  nombre: cupoDeFichas(65, 3, ANCHO_SOBRIO_EM),
  espacio: cupoDeFichas(43, 2.7, ANCHO_MAYUSCULA_EM),
  vence: cupoDeFichas(22, 2.7, ANCHO_SOBRIO_EM),
  quien: cupoDeFichas(27, 2.7, ANCHO_SOBRIO_EM)
}

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
 * === LA FILA NO SE REMONTA AL CAMBIAR DE PAGINA ===
 *
 * El `key` de cada fila es **su posicion en la tabla y no el id de la Tarea**. Es lo contrario de lo
 * que pide el instinto y es lo unico que hace que esto sea un Solari: con la identidad por id, al
 * pasar de pagina React tira las quince filas y monta otras quince, y eso se lee como "cargo otra
 * pantalla". Con la identidad por posicion, **la fila 1 sigue siendo la fila 1** y lo que cambia es su
 * texto, caracter a caracter, como las aletas de un panel de verdad.
 *
 * La contrapartida conocida —que al reordenarse la lista una fila "se convierte" en otra— no es un
 * problema acá: esto no es una tabla que se pueda clicar ni ordenar, es un panel de salidas, y en un
 * panel de salidas la fila de arriba es la fila de arriba.
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
 * hay 92vmin de ancho contra los 170 de la pared tumbada: el Proyecto no cabe sin dejar el nombre de
 * la Tarea en veinte caracteres, y una Tarea que no se puede nombrar no se muestra. Lo dice la
 * plantilla `portrait` de `.pantalla-columnas-procesos` en `pantalla.css`, y el `portrait:hidden` de
 * acá.
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

  const plan = planDeOla(items.length, PESOS)

  return (
    <div className="flex min-h-0 flex-col">
      <CabeceraDeEscena titulo={`${GLOSARIO.proceso.plural} ${rotuloDeAlcance(esGlobal)}`} total={total} ocultos={ocultos} />

      <RotulosDeColumna columnas={COLUMNAS}>
        <span />
        <Rotulo texto={GLOSARIO.proceso.singular} columna={0} maximo={CUPO.nombre} />
        <Rotulo texto={GLOSARIO.espacio.singular} columna={1} maximo={CUPO.espacio} className="portrait:hidden" />
        <Rotulo texto="Vence" columna={2} maximo={CUPO.vence} />
        <Rotulo texto={fase === 0 ? 'Quién' : 'Prioridad'} columna={3} maximo={CUPO.quien} />
      </RotulosDeColumna>

      <ul className="pantalla-tablero min-h-0">
        {items.map((tarea, indice) => (
          <li
            // Por POSICION y no por `tarea.id`. Ver el docblock de arriba: es la decision que convierte
            // el cambio de pagina en un volteo de caracteres en vez de en un remonte de la tabla.
            key={indice}
            className={cn('pantalla-fila py-[0.55vmin] leading-[1.15]', RELLENO_DE_FILA, COLUMNAS)}
          >
            {/*
              * La barra de color del estado. Es la unica columna que no es texto y es **el estado**:
              * la columna en palabras se cayo de la fila para que el nombre de la Tarea y el del
              * Proyecto entraran enteros, y la barra lleva el color que el panel le dio a cada estado.
              */}
            <span
              className="h-[2.8vmin] w-full rounded-full"
              style={{ backgroundColor: tarea.status?.color ?? 'var(--color-linea-fuerte)' }}
            />

            <FichaDeTablero
              sobria
              texto={tarea.name}
              sitio={{ plan, fila: indice, columna: 0 }}
              maximo={CUPO.nombre}
              className={cn('text-texto font-semibold', CUERPO_PRINCIPAL)}
            />

            <FichaDeTablero
              mayusculas
              sobria
              texto={tarea.project?.name ?? '—'}
              sitio={{ plan, fila: indice, columna: 1 }}
              maximo={CUPO.espacio}
              className={cn('text-texto-tenue portrait:hidden', CUERPO_COLUMNA)}
            />

            <Vencimiento fecha={tarea.due_date} vencida={tarea.overdue} plan={plan} fila={indice} />

            {/* Sin `mayusculas`: es un nombre de persona. Ver la misma celda en `EscenaCronometros`. */}
            <CeldaQueAlterna
              sobria
              fase={fase}
              principal={quienLaTiene(tarea.assignees)}
              alterno={tarea.priority?.name ?? 'Sin prioridad'}
              sitio={{ plan, fila: indice, columna: 3 }}
              maximo={CUPO.quien}
              className={cn('text-texto-tenue', CUERPO_COLUMNA)}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * La fecha de vencimiento, con la palabra y no solo el color.
 *
 * En una tabla el fondo rojo de la celda tiene ademas una segunda virtud que no tenia en una ficha:
 * marca el renglon entero a lo largo de dos metros de pared, que es como se encuentra una fila
 * urgente sin leerlas todas.
 *
 * El fondo va en el envoltorio y no en las aletas: una ficha roja por caracter con una junta oscura en
 * medio se lee como una cremallera y no como una alarma.
 */
function Vencimiento ({ fecha, vencida, plan, fila }: {
  fecha: string | null
  vencida: boolean
  plan: PlanDeOla
  fila: number
}): ReactNode {
  if (fecha === null) {
    return (
      <FichaDeTablero
        sobria
        texto="Sin fecha"
        sitio={{ plan, fila, columna: 2 }}
        maximo={CUPO.vence}
        className={cn('text-texto-sutil', CUERPO_COLUMNA)}
      />
    )
  }

  return (
    <FichaDeTablero
      sobria
      texto={vencida ? `Venció ${formatoCorto(fecha)}` : formatoCorto(fecha)}
      sitio={{ plan, fila, columna: 2 }}
      maximo={CUPO.vence}
      className={cn(
        'rounded-[0.8vmin] font-semibold',
        CUERPO_COLUMNA,
        vencida ? 'bg-superficie-peligro text-texto-peligro px-[1vmin]' : 'text-texto-tenue'
      )}
    />
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
 *
 * Devuelve texto y no un nodo porque la celda es una tira de aletas: un `<span>` gris para el "+2" no
 * tendria donde vivir dentro de un rodillo, y el gris se pierde igual a cuatro metros.
 */
function quienLaTiene (personas: TareaEnPantalla['assignees']): string {
  const primera = personas[0]

  if (primera === undefined) return 'Sin asignar'
  if (personas.length === 1) return nombreCorto(primera.name)

  return `${nombreCorto(primera.name)} +${personas.length - 1}`
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
