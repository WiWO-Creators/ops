import { LifeBuoy } from 'lucide-react'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import {
  GraficoDeAvance,
  GraficoDeCierres,
  GraficoDeEquipo,
  GraficoDePrioridades,
  LineaDeTiempoDeHitos,
  ProximaEntregaDelProyecto,
  UltimasNovedades
} from './GraficosDelProyecto'
import { Panel } from './GraficosDelTablero'
import {
  barrasDePrioridad,
  cifrasDelTablero,
  filasDePersonas,
  leerAvance,
  leerCierres,
  lineaDeHitos,
  novedades,
  type Cifra,
  type ConteoDeTickets
} from './tablero-proyecto'
import type { ProximaEntrega, TableroDelProyecto as Tablero } from '@/datos/portal'

/** Cuántas novedades entran en el panel. Es un «qué pasó últimamente», no el feed entero. */
const TOPE_DE_NOVEDADES = 6

/**
 * El tablero de UN {espacio}, dentro de su pestaña Descripción.
 *
 * === QUÉ REEMPLAZA ===
 *
 * La pestaña publicaba cuatro cifras sueltas: avance, {procesos}, días y horas. El pedido fue
 * explícito —«info que le pueda interesar al cliente más allá de 3 números piñuflas»— y el problema
 * de esas cuatro no era que fueran pocas: era que ninguna contestaba una pregunta. «39 %» no dice si
 * vamos bien hasta compararlo contra el tiempo consumido; «82 {procesos}» no dice si son muchas; y
 * las horas venían en cero en todos los {espacios} reales.
 *
 * Así que el tablero no agrega números: agrega la FORMA que los hace legibles. Las cifras siguen
 * estando, pero abajo de la forma que las explica.
 *
 * === EL ORDEN DE LOS BLOQUES ES LA DECISIÓN DE DISEÑO ===
 *
 * Va de lo accionable a lo informativo, igual que el tablero de gestión y por el mismo motivo: un
 * tablero que abre con volúmenes se mira una vez y no cambia nada.
 *
 *   1. próxima entrega y avance — las dos preguntas que el cliente hace primero: «¿cuándo?» y
 *      «¿cuánto falta?». Van arriba y en la misma fila porque se leen juntas;
 *   2. las cuatro cifras — el contexto inmediato, con las vencidas destacadas si hay;
 *   3. ritmo de cierres — lo que convierte el avance de foto en película;
 *   4. {hitos} y fechas — el calendario del trabajo;
 *   5. {procesos} por prioridad — cómo se reparte lo que queda;
 *   6. tickets — el soporte, si este {espacio} lo tiene;
 *   7. el equipo — quién lo está haciendo;
 *   8. últimas novedades — el cierre informativo.
 *
 * === CADA BLOQUE PUEDE FALTAR, Y FALTAR NO ES ESTAR EN CERO ===
 *
 * Cinco de los seis bloques del contrato son opcionales: llegan según las pestañas que este contacto
 * tenga en este {espacio}. Su ausencia significa «no puede ver eso», no «eso vale cero». Por eso acá
 * no hay ni un `?? 0`: cada bloque se dibuja si llegó y desaparece si no, y el tablero sigue teniendo
 * sentido con dos bloques o con ocho.
 *
 * Server Component: no hay estado que guardar. Lo único que el tablero recuerda es la URL de su
 * pestaña, y eso ya lo hace la página.
 */
export function TableroDelProyecto (
  { tablero, tickets, hoy }: { tablero: Tablero, tickets: ConteoDeTickets | null, hoy: string }
) {
  const avance = leerAvance(tablero.avance)
  // `undefined` es «no tiene la pestaña» y `null` es «no queda ninguna entrega pendiente». Los dos
  // terminan en «no dibujar el panel», pero se preguntan juntos una sola vez para que la rejilla y
  // el panel no puedan tomar decisiones distintas sobre el mismo dato.
  const hayProximaEntrega = tablero.proxima_entrega !== undefined && tablero.proxima_entrega !== null
  const cifras = tablero.tareas === undefined ? [] : cifrasDelTablero(tablero.tareas)

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Las dos preguntas de entrada. Dos columnas en pantalla ancha y una abajo de la otra en
             el teléfono: son dos frases cortas, no dos tablas.

             La rejilla se pide SOLO cuando hay dos paneles. Con `proxima_entrega` en `null` —que es
             lo normal en un proyecto con todo vencido— una rejilla de dos dejaría el avance en media
             pantalla y un hueco al lado, y el hueco se lee como algo que no cargó. */}
      <div className={cn('grid gap-4', hayProximaEntrega && 'sm:grid-cols-2')}>
        <GraficoDeAvance avance={avance} />
        {hayProximaEntrega && <ProximaEntregaDelProyecto entrega={tablero.proxima_entrega as ProximaEntrega} />}
      </div>

      {/* 2. Las cifras, solo si llegó el bloque de {procesos}. */}
      {cifras.length > 0 && <FilaDeCifras cifras={cifras} />}

      {/* 3. El ritmo. */}
      {tablero.cierres !== undefined && <GraficoDeCierres cierres={leerCierres(tablero.cierres)} />}

      {/* 4. Los hitos. `hoy` viene de la página y no de `new Date()` acá: el servidor y el navegador
             pueden estar en días distintos, y un eje que se mueve al hidratar es un salto visible. */}
      {tablero.hitos !== undefined && (
        <LineaDeTiempoDeHitos linea={lineaDeHitos(tablero.hitos, hoy)} />
      )}

      {/* 5. y 6. La prioridad y el soporte, que son dos lecturas cortas. Misma regla que arriba: la
             rejilla de dos solo cuando hay dos. */}
      {(tablero.tareas !== undefined || tickets !== null) && (
        <div className={cn('grid gap-4', tablero.tareas !== undefined && tickets !== null && 'sm:grid-cols-2')}>
          {tablero.tareas !== undefined && (
            <GraficoDePrioridades barras={barrasDePrioridad(tablero.tareas)} />
          )}
          {tickets !== null && <PanelDeTickets tickets={tickets} />}
        </div>
      )}

      {/* 7. Y 8. Quién y qué pasó. */}
      {tablero.equipo !== undefined && <GraficoDeEquipo filas={filasDePersonas(tablero.equipo)} />}
      {tablero.actividad !== undefined && (
        <UltimasNovedades novedades={novedades(tablero.actividad, TOPE_DE_NOVEDADES)} />
      )}
    </div>
  )
}

/**
 * Las cuatro cifras de contexto.
 *
 * Una rejilla de cuatro y no una fila: en el teléfono una fila de cuatro números deja cada rótulo en
 * dos líneas y la comparación se pierde. Dos por dos se lee de un golpe en cualquier ancho.
 *
 * El número de las vencidas va en tinta de peligro cuando hay alguna, y el rótulo NO cambia: quien
 * no distingue el rojo lee «Vencidas 16» igual, que es la información. El color solo acelera.
 */
function FilaDeCifras ({ cifras }: { cifras: Cifra[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cifras.map((cifra) => (
        <li
          key={cifra.clave}
          className="rounded-tarjeta border-linea bg-superficie-elevada shadow-1 flex flex-col gap-0.5 border p-3"
        >
          <span
            data-numerico
            className={cn(
              'text-xl font-semibold tabular-nums',
              cifra.alarma ? 'text-texto-peligro' : 'text-texto'
            )}
          >
            {cifra.valor}
          </span>
          <span className="text-texto-tenue text-xs leading-tight">{cifra.etiqueta}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Los tickets del {espacio}: abiertos y cerrados, y nada más.
 *
 * Sin tiempo de respuesta, y no por falta de ganas: el promedio de respuesta del equipo está
 * excluido del contrato del portal a propósito, con una prueba del lado de la API que falla si
 * alguien lo agrega. Derivarlo acá de las fechas de la lista sería reponer por la ventana lo que se
 * decidió no publicar, y encima mal: `last_reply` es la última respuesta de cualquiera de los dos
 * lados, no la primera del equipo.
 *
 * Con cero tickets el panel igual se dibuja, y dice que no hay. Es la respuesta a una pregunta que
 * el cliente sí se hace —«¿tengo algo pendiente en soporte?»— y un «no» explícito la contesta.
 */
function PanelDeTickets ({ tickets }: { tickets: ConteoDeTickets }) {
  return (
    <Panel
      titulo={GLOSARIO.ticket.plural}
      icono={<LifeBuoy size={14} aria-hidden="true" className="shrink-0" />}
      nota={
        tickets.total === 0
          ? `No hay ${GLOSARIO.ticket.plural.toLowerCase()} en este ${GLOSARIO.espacio.singular.toLowerCase()}.`
          : undefined
      }
    >
      {tickets.total > 0 && (
        <dl className="flex gap-6">
          <div className="flex flex-col gap-0.5">
            <dt className="text-texto-tenue text-xs">Abiertos</dt>
            <dd
              data-numerico
              className={cn(
                'text-xl font-semibold tabular-nums',
                tickets.abiertos > 0 ? 'text-texto' : 'text-texto-tenue'
              )}
            >
              {tickets.abiertos}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-texto-tenue text-xs">Cerrados</dt>
            <dd data-numerico className="text-texto-tenue text-xl font-semibold tabular-nums">
              {tickets.cerrados}
            </dd>
          </div>
        </dl>
      )}
    </Panel>
  )
}
