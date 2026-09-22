import { cn } from '@/lib/clases'
import {
  AreaDeRitmo,
  BarraDePrioridades,
  BarrasDeEquipo,
  CifrasDeContexto,
  LineaDeTiempoDeHitos,
  MedidorDeAvance,
  ProximaEntregaDelProyecto,
  UltimasNovedades
} from './GraficosDelProyecto'
import {
  cifrasDelTablero,
  filasDePersonas,
  leerAvance,
  leerCierres,
  lineaDeHitos,
  novedades
} from './tablero-proyecto'
import type { ProximaEntrega, TableroDelProyecto as Tablero } from '@/datos/portal'

/** Cuántas novedades se calculan. El componente muestra cinco y pliega el resto. */
const TOPE_DE_NOVEDADES = 12

/**
 * El tablero de UN {espacio}, dentro de su pestaña Descripción.
 *
 * === QUÉ SE ARREGLÓ ACÁ ===
 *
 * La primera versión era un `flex flex-col`: ocho bloques a ancho completo, uno debajo del otro. El
 * usuario la rechazó con una frase que describe el problema mejor que cualquier diagnóstico: «son
 * solo datos hacia abajo (…) los gráficos son simplemente filas con mucha data y del ancho de la
 * pantalla».
 *
 * Ahora es una **rejilla de doce columnas** donde cada bloque pide el ancho que su dato merece. Lo
 * que es un número ocupa una tarjeta chica; una serie ocupa siete columnas; una lista ocupa la mitad
 * y se recorta a cinco filas. **Ningún bloque ocupa las doce**: esa fila a lo ancho de la pantalla
 * era la queja.
 *
 * === EL ORDEN, Y QUÉ ENTRA EN LA PRIMERA PANTALLA ===
 *
 * La primera fila tiene que contestar sola las tres preguntas con las que un cliente abre esto:
 *
 *   1. **«¿Cuánto falta?»** — el medidor de avance, con la cifra grande al centro. Es la figura
 *      protagonista y hay exactamente una en la vista.
 *   2. **«¿Cuándo es lo próximo?»** — la próxima entrega, en días.
 *   3. **«¿Hay algo mal?»** — las vencidas, con su icono y su palabra, más las cerradas de la
 *      semana y las abiertas sin fecha.
 *
 * El reparto por prioridad se cuelga al lado del medidor, porque es una sola barra y no justifica
 * una fila. Después viene el tiempo —el ritmo que llevamos y las fechas que vienen— y al final lo
 * informativo: equipo y novedades. Es el mismo criterio del tablero de gestión —de lo accionable a
 * lo informativo— aplicado a una rejilla en vez de a una pila.
 *
 * === CADA BLOQUE PUEDE FALTAR, Y FALTAR NO ES ESTAR EN CERO ===
 *
 * Cinco de los seis bloques del contrato son opcionales: llegan según las pestañas que este contacto
 * tenga en este {espacio}. Su ausencia significa «no puede ver eso», no «eso vale cero». Por eso acá
 * no hay ni un `?? 0`, y por eso las filas de la rejilla se arman según lo que llegó: un
 * `col-span-7` al lado de un hueco se lee como algo que no cargó, así que cuando falta el vecino el
 * bloque que queda se estira, y la fila de cifras envuelve en vez de dejar casilleros vacíos.
 *
 * Server Component: no hay estado que guardar, ni una línea de JavaScript. Los tooltips son
 * `group-hover`, lo que se despliega son `<details>`, y el tema lo resuelve `light-dark()`.
 */
export function TableroDelProyecto (
  { tablero, hoy }: { tablero: Tablero, hoy: string }
) {
  const avance = leerAvance(tablero.avance)
  // `undefined` es «no tiene la pestaña» y `null` es «no queda ninguna entrega pendiente». Los dos
  // terminan en «no dibujar la tarjeta», pero se preguntan juntos una sola vez para que la rejilla y
  // la tarjeta no puedan decidir distinto sobre el mismo dato.
  const hayProximaEntrega = tablero.proxima_entrega !== undefined && tablero.proxima_entrega !== null
  const cifras = tablero.tareas === undefined ? [] : cifrasDelTablero(tablero.tareas)
  const equipo = tablero.equipo === undefined ? [] : filasDePersonas(tablero.equipo)
  // La pestaña de {procesos} gobierna TRES bloques a la vez —las cifras, el reparto por prioridad y
  // el ritmo—, así que decide sola la forma de la primera fila. Sin ella el medidor no tiene con qué
  // compartir dos filas de alto y se queda en una, con los {hitos} al lado.
  const hayTareas = tablero.tareas !== undefined
  // Cuántas tarjetas de cifra va a tener la fila de arriba. Si son cero, esa fila NO se dibuja: un
  // contenedor vacío de ocho columnas ocupa su lugar en la rejilla igual, empuja al bloque siguiente
  // a la fila de abajo y deja el hueco que todo este rediseño vino a sacar.
  const tarjetas = cifras.length + (hayProximaEntrega ? 1 : 0)

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
      {/* --- 1. La primera pantalla: cuánto falta, cuándo es lo próximo, qué está mal ----------- */}

      {/* El medidor pide cuatro columnas: es la figura protagonista y un anillo necesita alto para
          leerse, pero no necesita ancho. */}
      {/* Dos filas de alto SOLO cuando hay con qué llenarlas. El anillo mide 128 px y al lado tiene
          dos bloques bajos —las cifras y la barra de prioridad—, así que sin ese `row-span` queda un
          vacío de 120 px a su derecha. Pero los dos bloques dependen de la pestaña de {procesos}:
          cuando no está, el `row-span` produce el hueco en vez de taparlo, y por eso se pregunta. */}
      <div className={cn('lg:col-span-4', hayTareas && tarjetas > 0 && 'lg:row-span-2')}>
        <MedidorDeAvance avance={avance} />
      </div>

      {/* Las cifras van en una fila que ENVUELVE, no en una rejilla de columnas fijas. Es la
          diferencia entre una fila que siempre queda llena y una con un hueco: la próxima entrega
          desaparece cuando no hay ninguna pendiente —el caso normal de un {espacio} con todo
          vencido— y una rejilla de cuatro se quedaría con un casillero vacío, que se lee como un
          bloque que no cargó. Con `flex-1` y un mínimo, las que hay reparten el ancho entre ellas. */}
      {tarjetas > 0 && (
      <div className="lg:col-span-8">
        <div className="flex h-full flex-wrap content-stretch gap-3">
          {hayProximaEntrega && (
            <div className="min-w-36 flex-1">
              <ProximaEntregaDelProyecto entrega={tablero.proxima_entrega as ProximaEntrega} />
            </div>
          )}
          {cifras.map((cifra) => (
            <div key={cifra.clave} className="min-w-36 flex-1">
              <CifrasDeContexto cifras={[cifra]} />
            </div>
          ))}
        </div>
      </div>
      )}

      {/* El reparto por prioridad es una sola barra: bajo, y por eso va acá, completando el alto del
          medidor en vez de abrir una fila propia. */}
      {tablero.tareas !== undefined && (
        <div className="lg:col-span-8">
          <BarraDePrioridades tareas={tablero.tareas} />
        </div>
      )}

      {/* --- 2. El tiempo: el ritmo que llevamos y las fechas que vienen ------------------------- */}

      {tablero.cierres !== undefined && (
        <div className={anchoDeSerie(tablero.hitos !== undefined)}>
          <AreaDeRitmo cierres={leerCierres(tablero.cierres)} />
        </div>
      )}

      {tablero.hitos !== undefined && (
        <div className={hayTareas ? anchoDeSerie(tablero.cierres !== undefined, true) : 'lg:col-span-8'}>
          <LineaDeTiempoDeHitos linea={lineaDeHitos(tablero.hitos, hoy)} />
        </div>
      )}

      {/* --- 4. Quién y qué pasó ---------------------------------------------------------------- */}

      {tablero.equipo !== undefined && (
        <div className={anchoDeMitad(tablero.actividad !== undefined)}>
          <BarrasDeEquipo filas={equipo} total={tablero.equipo.length} />
        </div>
      )}

      {tablero.actividad !== undefined && (
        <div className={anchoDeMitad(tablero.equipo !== undefined)}>
          <UltimasNovedades novedades={novedades(tablero.actividad, TOPE_DE_NOVEDADES)} />
        </div>
      )}
    </div>
  )
}

/**
 * El ancho de un bloque de serie: siete columnas, cinco si es el secundario, doce si está solo.
 *
 * El reparto 7/5 y no 6/6 es deliberado: a la izquierda va el ritmo, cuyo eje de doce semanas
 * pierde resolución en cuanto se comprime, y a la derecha los {hitos}, cuya lista aguanta mejor el
 * recorte porque el nombre trunca y la fecha es corta.
 *
 * Cuando el vecino no llegó, el bloque se estira a las doce. Un `col-span-7` con un hueco de cinco
 * al lado se lee como un bloque que no cargó, y ese hueco es justo lo que este rediseño vino a
 * sacar.
 *
 * @param tieneVecino si el otro bloque de la fila llegó
 * @param secundario `true` para el de la derecha, el de cinco columnas
 */
function anchoDeSerie (tieneVecino: boolean, secundario = false): string {
  if (!tieneVecino) return 'lg:col-span-12'

  return secundario ? 'lg:col-span-5' : 'lg:col-span-7'
}

/** Media rejilla, o toda si el vecino no llegó. Para las dos listas del pie. */
function anchoDeMitad (tieneVecino: boolean): string {
  return tieneVecino ? 'lg:col-span-6' : 'lg:col-span-12'
}
