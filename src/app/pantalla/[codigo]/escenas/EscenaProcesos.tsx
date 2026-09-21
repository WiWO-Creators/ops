import type { ReactNode } from 'react'
import { cn } from '@/lib/clases'
import { GLOSARIO } from '@/dominio/glosario'
import { ANCHO_MAYUSCULA_EM, ANCHO_SOBRIO_EM, cupoDeFichas, planDeOla } from '@/dominio/solari'
import type { PlanDeOla } from '@/dominio/solari'
import type { TareaEnPantalla } from '@/datos/pantalla-area'
import {
  CabeceraDeEscena, CeldaQueAlterna, CUERPO_COLUMNA, CUERPO_PRINCIPAL, FichaDeTablero,
  MarcaDeCliente, Nada, RELLENO_DE_FILA, Rotulo, RotulosDeColumna, nombreCorto, rotuloDeAlcance
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
const PESOS = [6, 2, 2, 1, 1, 2] as const

/**
 * Cuantos caracteres caben en cada columna.
 *
 * Los anchos son los de `.pantalla-columnas-procesos` en `pantalla.css` y no se pueden inventar acá:
 * una tira de fichas no se recorta con `truncate`, asi que lo que no cabe se dibuja igual y lo tapa el
 * `overflow` — DOM pagado a cambio de nada. Ver `cupoDeFichas()`.
 *
 * El nombre es la columna flexible: lo que sobra despues de las fijas, los seis huecos de 2vmin y el
 * relleno de fila, sobre los ~170vmin de la pared tumbada.
 *
 * **Todas las columnas de palabras son texto plano y solo el porcentaje se dibuja como panel.** Se
 * probo al reves y la captura lo dejo claro: con fichas de ancho fijo, "En progreso" entraba como "EN PROGR…",
 * "Bodega Quilicura" como "BODEGA QUILICU…" y "Venció 12/05" perdia la fecha. Una ficha de ancho fijo
 * cuesta 0.79em por caracter contra los 0.56 de una palabra, y en una fila de seis columnas eso es
 * casi un tercio de la informacion de la pared. Ver `ANCHO_DE_FICHA_EM` y `esNumerico()` en el
 * dominio. La columna de vencimiento cae de los dos lados: "12/05" es ficha y "Venció 12/05" no.
 */
const CUPO = {
  nombre: cupoDeFichas(51, 3, ANCHO_SOBRIO_EM),
  cliente: cupoDeFichas(33, 2.7, ANCHO_MAYUSCULA_EM),
  /** En caja mixta: "En progreso" son once caracteres y en mayusculas no entra en 18vmin. */
  estado: cupoDeFichas(18, 2.7, ANCHO_SOBRIO_EM),
  /** La unica columna de digitos de la fila, y por eso la unica con ficha entera. */
  avance: cupoDeFichas(9, 2.7),
  vence: cupoDeFichas(20, 2.7, ANCHO_SOBRIO_EM),
  quien: cupoDeFichas(23, 2.7, ANCHO_SOBRIO_EM)
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

  const plan = planDeOla(items.length, PESOS)

  return (
    <div className="flex min-h-0 flex-col">
      <CabeceraDeEscena titulo={`${GLOSARIO.proceso.plural} ${rotuloDeAlcance(esGlobal)}`} total={total} ocultos={ocultos} />

      <RotulosDeColumna columnas={COLUMNAS}>
        <span />
        <Rotulo texto={GLOSARIO.proceso.singular} columna={0} maximo={CUPO.nombre} />
        <Rotulo texto={GLOSARIO.cliente.singular} columna={1} maximo={CUPO.cliente} className="portrait:hidden" />
        <Rotulo texto="Estado" columna={2} maximo={CUPO.estado} className="portrait:hidden" />
        <Rotulo texto="%" columna={3} maximo={CUPO.avance} className="text-right portrait:hidden" />
        <Rotulo texto="Vence" columna={4} maximo={CUPO.vence} />
        <Rotulo texto={fase === 0 ? 'Quién' : 'Prioridad'} columna={5} maximo={CUPO.quien} />
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
              * La barra de color del estado. Es la unica columna que no es texto, y en vertical es
              * lo unico que queda del estado: ahi la columna en palabras se cae por falta de ancho.
              */}
            <span
              className="h-[2.8vmin] w-full rounded-full"
              style={{ backgroundColor: tarea.status?.color ?? 'var(--color-linea-fuerte)' }}
            />

            <FichaDeTablero
              texto={tarea.name}
              sitio={{ plan, fila: indice, columna: 0 }}
              maximo={CUPO.nombre}
              className={cn('text-texto font-semibold', CUERPO_PRINCIPAL)}
            />

            {/* El cliente y no el Espacio: ver el docblock de `MarcaDeCliente`. */}
            <MarcaDeCliente
              cliente={tarea.client}
              sitio={{ plan, fila: indice, columna: 1 }}
              maximo={CUPO.cliente}
              className={cn('text-texto-tenue portrait:hidden', CUERPO_COLUMNA)}
            />

            {/* Sin `mayusculas`: "EN PROGRESO" no cabe en 18vmin y se leeria "EN PROGRES". */}
            <FichaDeTablero
              texto={tarea.status?.name ?? '—'}
              sitio={{ plan, fila: indice, columna: 2 }}
              maximo={CUPO.estado}
              className={cn('text-texto-tenue portrait:hidden', CUERPO_COLUMNA)}
            />

            <Avance progreso={tarea.progress} plan={plan} fila={indice} />

            <Vencimiento fecha={tarea.due_date} vencida={tarea.overdue} plan={plan} fila={indice} />

            {/* Sin `mayusculas`: es un nombre de persona. Ver la misma celda en `EscenaCronometros`. */}
            <CeldaQueAlterna
              fase={fase}
              principal={quienLaTiene(tarea.assignees)}
              alterno={tarea.priority?.name ?? 'Sin prioridad'}
              sitio={{ plan, fila: indice, columna: 5 }}
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
function Avance ({ progreso, plan, fila }: {
  progreso: TareaEnPantalla['progress']
  plan: PlanDeOla
  fila: number
}): ReactNode {
  const hay = progreso.percent !== null

  return (
    <FichaDeTablero
      texto={hay ? `${progreso.percent}%` : '—'}
      sitio={{ plan, fila, columna: 3 }}
      maximo={CUPO.avance}
      className={cn(
        'text-right portrait:hidden',
        CUERPO_COLUMNA,
        hay ? 'text-texto-tenue' : 'text-texto-sutil'
      )}
    />
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
        texto="Sin fecha"
        sitio={{ plan, fila, columna: 4 }}
        maximo={CUPO.vence}
        className={cn('text-texto-sutil', CUERPO_COLUMNA)}
      />
    )
  }

  return (
    <FichaDeTablero
      texto={vencida ? `Venció ${formatoCorto(fecha)}` : formatoCorto(fecha)}
      sitio={{ plan, fila, columna: 4 }}
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
