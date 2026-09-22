import type { CatalogoDeEstados } from '@/dominio/estados-tarea'
import { cn } from '@/lib/clases'
import {
  BarraDePrioridades,
  BarrasPorEstado,
  CifrasDeContexto,
  MedidorDeAvance,
  PendientesPorHitoDelProyecto,
  ProximaEntregaDelProyecto,
  UltimasNovedades
} from './GraficosDelProyecto'
import {
  TOPE_DE_NOVEDADES,
  barrasPorEstado,
  bloquesDelTablero,
  cifrasDelTablero,
  filasDeCifras,
  leerAvance,
  novedades,
  pendientesPorHito,
  repartirEnColumnas,
  tarjetasDeCifras,
  ORDEN_DE_LECTURA,
  type BloqueDelTablero
} from './tablero-proyecto'
import type { ProximaEntrega, TableroDelProyecto as Tablero } from '@/datos/portal'

/**
 * El tablero de UN {espacio}, dentro de su pestaña Resumen y debajo de la ficha.
 *
 * === LO QUE SE RECHAZÓ, DOS VECES ===
 *
 * La primera versión era un `flex flex-col`: ocho bloques a ancho completo, uno debajo del otro. El
 * usuario la rechazó con una frase que describe el problema mejor que cualquier diagnóstico: «son
 * solo datos hacia abajo (…) los gráficos son simplemente filas con mucha data y del ancho de la
 * pantalla».
 *
 * La segunda era una rejilla de doce columnas armada por FILAS, cada bloque con el ancho que su dato
 * merecía. Resolvió lo de «hacia abajo», pero no lo asimétrico: el alto de cada fila lo ponía su
 * bloque más alto y al lado quedaba aire, y cuando un vecino no llegaba el que quedaba se estiraba a
 * las doce columnas. El pedido siguiente fue explícito: «que no quede con cosas solas en una fila,
 * que todo calce independiente de que sean asimétricos».
 *
 * === AHORA: DOS PILAS QUE TERMINAN JUNTAS ===
 *
 * En escritorio son dos columnas, de cinco y siete doceavos, y cada una es una pila independiente.
 * No hay filas compartidas, así que no hay fila donde quedarse solo ni hueco al lado de un bloque
 * bajo. El ÚLTIMO bloque de cada pila se estira (`flex-1`) hasta el piso de la otra: las dos terminan
 * a la misma altura sin que nadie calcule píxeles. Qué va en cada columna lo decide
 * `repartirEnColumnas()`, que balancea un peso estimado por bloque para que ese último estirón sea
 * chico. Ver su docblock.
 *
 * En móvil las dos columnas se disuelven (`display: contents`) y los bloques quedan en una sola
 * columna, reordenados con `order` según el orden de lectura: de lo accionable a lo informativo.
 *
 * === CADA BLOQUE PUEDE FALTAR, Y FALTAR NO ES ESTAR EN CERO ===
 *
 * Cuatro de los cinco bloques del contrato son opcionales: llegan según las pestañas que este
 * contacto tenga en este {espacio}. Su ausencia significa «no puede ver eso», no «eso vale cero». Por
 * eso acá no hay ni un `?? 0`, y por eso el reparto se hace sobre los bloques que llegaron y no
 * sobre una plantilla fija con casilleros vacíos.
 *
 * Server Component: no hay estado que guardar, ni una línea de JavaScript. Los tooltips son
 * `group-hover`, lo que se despliega son `<details>`, y el tema lo resuelve `light-dark()`.
 *
 * @param tablero el tablero tal como llegó de la API
 * @param estados `task_statuses` del portal: nombre y color de cada estado, los de Perfex
 */
export function TableroDelProyecto (
  { tablero, estados }: { tablero: Tablero, estados: CatalogoDeEstados }
) {
  const columnas = repartirEnColumnas(bloquesDelTablero(tablero, estados))
  const soloUna = columnas.estrecha.length === 0

  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-12 lg:items-stretch">
      {columnas.estrecha.length > 0 && (
        <Pila bloques={columnas.estrecha} className="lg:col-span-5">
          {(bloque) => <Bloque bloque={bloque} tablero={tablero} estados={estados} />}
        </Pila>
      )}
      <Pila bloques={columnas.ancha} className={cn('lg:col-span-7', soloUna && 'lg:col-start-1')}>
        {(bloque) => <Bloque bloque={bloque} tablero={tablero} estados={estados} />}
      </Pila>
    </div>
  )
}

/**
 * Una columna del tablero: una pila cuyo último bloque se estira hasta el piso común.
 *
 * `contents` en móvil hace que la pila no exista como caja y sus bloques pasen a ser hijos directos
 * de la columna única; el `order` de cada uno los intercala en orden de lectura. Desde `lg` la pila
 * vuelve a ser una columna flexible y el mismo `order`, que dentro de la pila ya es creciente, no
 * cambia nada.
 */
function Pila (
  { bloques, className, children }:
  { bloques: BloqueDelTablero[], className: string, children: (bloque: BloqueDelTablero) => React.ReactNode }
) {
  return (
    <div className={cn('contents lg:flex lg:flex-col lg:gap-3', className)}>
      {bloques.map((bloque, i) => (
        <div
          key={bloque}
          style={{ order: ORDEN_DE_LECTURA.indexOf(bloque) }}
          // El último se estira, y lo que tiene adentro también: `Panel` es una `<section>` que no
          // recibe clases, así que el estirón se le pasa desde acá a su hijo directo.
          className={cn('flex flex-col', i === bloques.length - 1 && 'lg:flex-1 lg:*:flex-1')}
        >
          {children(bloque)}
        </div>
      ))}
    </div>
  )
}

/** Dibuja un bloque. Sólo se llama con bloques que `bloquesDelTablero()` dio por presentes. */
function Bloque (
  { bloque, tablero, estados }: { bloque: BloqueDelTablero, tablero: Tablero, estados: CatalogoDeEstados }
) {
  switch (bloque) {
    case 'avance':
      return <MedidorDeAvance avance={leerAvance(tablero.avance)} />
    case 'cifras':
      return <BloqueDeCifras tablero={tablero} />
    case 'hitos':
      return tablero.hitos === undefined
        ? null
        : <PendientesPorHitoDelProyecto lectura={pendientesPorHito(tablero.hitos.lista, estados)} />
    case 'estados':
      return tablero.tareas === undefined
        ? null
        : <BarrasPorEstado barras={barrasPorEstado(tablero.tareas.por_estado, estados)} />
    case 'prioridades':
      return tablero.tareas === undefined ? null : <BarraDePrioridades tareas={tablero.tareas} />
    case 'novedades':
      return tablero.actividad === undefined
        ? null
        : <UltimasNovedades novedades={novedades(tablero.actividad, TOPE_DE_NOVEDADES)} />
  }
}

/**
 * La próxima entrega y las tres cifras de contexto, en una rejilla sin casilleros sueltos.
 *
 * Cuatro tarjetas van en dos filas de dos y tres en una fila de tres: con cuatro en una rejilla de
 * tres, la cuarta quedaría sola abajo, que es justo lo que se pidió evitar. Las clases van
 * literales —y no armadas con el número— porque Tailwind sólo genera las que lee en el código.
 */
function BloqueDeCifras ({ tablero }: { tablero: Tablero }) {
  if (tablero.tareas === undefined) return null

  const tarjetas = tarjetasDeCifras(tablero)
  const hayProximaEntrega = tablero.proxima_entrega !== undefined && tablero.proxima_entrega !== null

  return (
    <div
      className={cn(
        'grid auto-rows-fr gap-3',
        filasDeCifras(tarjetas) === 2 ? 'grid-cols-2' : 'grid-cols-3'
      )}
    >
      {hayProximaEntrega && <ProximaEntregaDelProyecto entrega={tablero.proxima_entrega as ProximaEntrega} />}
      <CifrasDeContexto cifras={cifrasDelTablero(tablero.tareas)} />
    </div>
  )
}
