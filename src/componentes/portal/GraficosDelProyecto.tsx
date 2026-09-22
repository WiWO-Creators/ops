import { Activity, CalendarClock, ChartBarBig, Flag, SignalHigh, TriangleAlert } from 'lucide-react'
import type { CSSProperties } from 'react'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import { Clave, Panel, SinDatos } from './GraficosDelTablero'
import {
  FILAS_VISIBLES,
  HITOS_VISIBLES,
  SIN_NADA_QUE_MOSTRAR,
  arcoDeAvance,
  clavesDePrioridad,
  resumenDeFila,
  resumenDePrioridades,
  resumenPorEstado,
  tramosDePrioridad,
  type BarraDeEstado,
  type Cifra,
  type EstadoPintado,
  type FilaDePendientes,
  type LecturaDeAvance,
  type Novedad,
  type PendientesPorHito
} from './tablero-proyecto'
import type { TareasDelTablero } from '@/datos/portal'

/**
 * Los gráficos del tablero de UN {espacio}, tal como lo abre el contacto del cliente.
 *
 * === POR QUÉ SE REESCRIBIÓ ESTE ARCHIVO ===
 *
 * La primera versión se rechazó, y con razón: «son solo datos hacia abajo, los gráficos son
 * simplemente filas con mucha data y del ancho de la pantalla». Era literal. Tres de los seis
 * bloques eran un `<ul>` de `<li>` con una barra adentro, apilados a ancho completo. Una tabla con
 * relleno de color no es un gráfico.
 *
 * Lo que cambió no son los datos —el inventario que los eligió sigue siendo válido— sino la FORMA
 * de cada uno, elegida con la heurística de la skill `dataviz` en vez de por defecto:
 *
 *   - **Avance** era una barra horizontal. Es una razón contra un límite, o sea un **medidor**, y un
 *     medidor se puede dibujar en redondo: anillo con la cifra al centro.
 *   - **Prioridades** eran cuatro filas. Es part-to-whole: **una** barra apilada horizontal.
 *   - **Estados** son magnitudes que se comparan: **barras**, una por estado, con el color que el
 *     estado ya tiene en Perfex.
 *   - **Hitos** son dos preguntas a la vez —cuánto queda en cada uno y en qué estado—: **barras
 *     apiladas** en una escala común, para que los {hitos} se comparen entre sí.
 *   - **Tickets** tenía dos números en un panel con título de gráfico. Son dos **cifras**: la
 *     skill marca como anti-patrón tanto el pastel de dos porciones como la barra de una sola barra.
 *
 * === LAS REGLAS QUE GOBIERNAN EL ARCHIVO ===
 *
 *   1. **Un solo tono, y cuando hace falta escala, ordinal.** Las prioridades son una escala con
 *      orden (Bajo < Medio < Alto < Urgente), así que les toca rampa secuencial de un tono:
 *      `--grafico-ordinal-1..4`, validadas con el script de la skill en los dos temas. La paleta
 *      categórica de ocho sigue muerta y con motivo: no pasa contraste sobre fondo claro.
 *
 *      **La excepción son los estados**, que llevan el color de Perfex. No es una paleta que se
 *      eligió acá: es el color con el que el cliente ya reconoce cada estado en la insignia de su
 *      lista, y lo administra el panel. Pasado por el validador de la skill, ese juego FALLA —el
 *      amarillo y el verde lima casi no se separan con daltonismo, y cuatro de cinco quedan bajo 3:1
 *      contra la superficie—, y por eso ninguno de los dos gráficos depende sólo del color: las barras
 *      por estado llevan el nombre al lado, y las apiladas llevan leyenda, tooltip por tramo, el
 *      hueco de 2 px entre tramos y su tabla en un `<details>`.
 *   2. **El texto nunca lleva el color del dato.** Valores, rótulos y leyendas van en tinta de
 *      texto; la identidad la carga la marca de color al lado. La única excepción es el rótulo
 *      DENTRO de un tramo apilado, que se pinta por luminancia del relleno.
 *   3. **Cada gráfico se lee también sin verlo**, y sin pasar el mouse: `role="img"` con su frase,
 *      y los valores que el gráfico no rotula directo viven en un `<details>` con su tabla. El
 *      tooltip agrega, nunca es la única forma de leer un número.
 *   4. **Un cero medido y un dato que falta se dibujan distinto.** Nunca una barra en cero donde la
 *      respuesta es «todavía no lo sabemos».
 *
 * Server Components sin estado y sin una línea de JavaScript: los tooltips son `group-hover` y
 * `group-focus-within`, y lo que se despliega son `<details>`. Cero dependencias nuevas.
 */

/** Alto del anillo y grosor de su trazo, en unidades de `viewBox`. */
const ANILLO = { lado: 120, radio: 48, trazo: 12 } as const

/**
 * El medidor de avance: un anillo con la cifra al centro.
 *
 * === POR QUÉ ANILLO Y NO DONA ===
 *
 * Porque no reparte un total entre categorías: mide UNA razón contra su límite. La skill de
 * visualización manda medidor para eso, y marca como anti-patrón el pastel de dos porciones —que es
 * en lo que se convierte una dona de «hecho» contra «falta»—. El anillo es el mismo medidor, en
 * redondo, y la cifra grande al centro es la figura protagonista de la pantalla.
 *
 * La pista sin pintar va en `--relleno-neutro`, el mismo gris de fondo que usa toda barra de
 * progreso del producto. La skill prefiere un paso claro de la propia rampa, y para un medidor de
 * severidad —donde el relleno viaja de acento a peligro— tendría razón; acá el relleno es de un
 * color solo, así que la consistencia con el resto del portal gana. Y el paso claro azul no pasaba
 * el piso de 2:1 contra la superficie: lo corrí, y falla.
 *
 * === POR QUÉ EL ARCO ES VERDE Y NO ACENTO ===
 *
 * Porque lo que mide es «cerradas», y el verde es lo que este producto usa para completado en todas
 * partes. Con el arco en acento, el anillo era la única pieza del tablero donde el avance no se
 * parecía a su propio estado: la insignia «Completo» verde al lado de un arco azul que cuenta
 * exactamente esas tareas.
 *
 * Es `--relleno-exito` —el verde de marca, verificado a contraste en los dos temas por
 * `pruebas/marca.test.js`— y NO el hexadecimal del estado «Completo» de Perfex. Dos razones: el
 * frontend no tiene forma fiable de saber qué id es el estado de cierre (`cerradas` lo calcula la
 * API, y `task_statuses` no marca cuál cierra), y un color que alguien puede editar en el panel no
 * puede gobernar el trazo de 12px de la figura protagonista de la pantalla.
 *
 * Esto NO convierte el anillo en una dona: sigue midiendo UNA razón contra su límite, con un solo
 * arco. El reparto por estado es otro gráfico, `BarrasPorEstado`, que está en el mismo tablero.
 *
 * Con `porcentaje` en `null` NO se dibuja un anillo vacío: se escribe el motivo. Un anillo al 0 % se
 * lee «no hicieron nada»; el motivo dice «no hay {procesos} compartidas para medirlo».
 */
export function MedidorDeAvance ({ avance }: { avance: LecturaDeAvance }) {
  const { circunferencia, pintado } = arcoDeAvance(avance.porcentaje, ANILLO.radio)
  const centro = ANILLO.lado / 2

  return (
    <Panel
      titulo={`Avance de las ${GLOSARIO.proceso.plural.toLowerCase()}`}
      icono={<Activity size={14} aria-hidden="true" className="shrink-0" />}
    >
      {avance.porcentaje === null
        ? <SinDatos motivo={avance.motivo} />
        : (
            <div className="flex flex-1 flex-col items-center justify-center gap-1">
              <div className="relative">
                <svg
                  viewBox={`0 0 ${ANILLO.lado} ${ANILLO.lado}`}
                  className="size-32"
                  role="img"
                  aria-label={`${avance.porcentaje} % completado: ${avance.cerradas} de ${avance.total} ${GLOSARIO.proceso.plural.toLowerCase()}.`}
                >
                  {/* La pista. `round` en las puntas del relleno pide que la pista también lo sea, o
                      el arco pintado sobresale de su canal en los dos extremos. */}
                  <circle
                    cx={centro}
                    cy={centro}
                    r={ANILLO.radio}
                    fill="none"
                    strokeWidth={ANILLO.trazo}
                    strokeLinecap="round"
                    className="stroke-relleno-neutro"
                  />
                  {/* El arco arranca arriba —de ahí el giro de 90°— porque es de donde todo el mundo
                      empieza a leer un reloj, y crece en el sentido de las agujas. */}
                  <circle
                    cx={centro}
                    cy={centro}
                    r={ANILLO.radio}
                    fill="none"
                    strokeWidth={ANILLO.trazo}
                    strokeLinecap="round"
                    strokeDasharray={`${pintado} ${circunferencia}`}
                    transform={`rotate(-90 ${centro} ${centro})`}
                    className="stroke-relleno-exito"
                  />
                </svg>

                {/* La figura protagonista, encima del anillo. Cifras proporcionales y no
                    `tabular-nums`: a este tamaño los dígitos de ancho fijo dejan huecos. */}
                <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span aria-hidden="true" className="text-texto font-titular text-3xl leading-none font-semibold">
                    {avance.porcentaje}%
                  </span>
                </span>
              </div>

              <p className="text-texto-tenue text-center text-xs leading-snug">
                {avance.cerradas} de {avance.total} cerradas
                {avance.abiertas > 0 && <>, {avance.abiertas} abiertas</>}
              </p>
            </div>
          )}
    </Panel>
  )
}

/**
 * Una cifra sola, con su rótulo.
 *
 * Es la forma que la skill manda para un valor de titular: «la cifra ES el gráfico». Se usa para la
 * próxima entrega, para los cuatro conteos de contexto y para los tickets, que antes tenían un panel
 * con título de gráfico y dos números adentro.
 *
 * `alarma` pinta el número en tinta de peligro Y agrega icono con palabra. Nunca color solo: los
 * colores de estado se reservan para el estado y viajan siempre con su rótulo, porque quien no
 * distingue el rojo tiene que poder leer que algo está mal.
 */
export function TarjetaDeCifra (
  { etiqueta, valor, nota, alarma = false }:
  { etiqueta: string, valor: string, nota?: string, alarma?: boolean }
) {
  return (
    <div className="rounded-tarjeta border-linea bg-superficie-elevada shadow-1 flex flex-col justify-center gap-0.5 border p-3">
      <span className="text-texto-tenue flex items-center gap-1 text-xs leading-tight">
        {alarma && <TriangleAlert size={12} aria-hidden="true" className="text-texto-peligro shrink-0" />}
        {etiqueta}
      </span>
      <span
        className={cn(
          'font-titular text-2xl leading-none font-semibold',
          alarma ? 'text-texto-peligro' : 'text-texto'
        )}
      >
        {valor}
      </span>
      {nota !== undefined && <span className="text-texto-sutil text-xs leading-tight">{nota}</span>}
    </div>
  )
}

/**
 * Los cuatro conteos de contexto, como cifras.
 *
 * Sólo `vencidas` puede llevar alarma. Las otras tres son hechos: «cerradas esta semana» en 0 no es
 * malo en sí —un {espacio} puede estar entre entregas— y pintarlo de rojo sería una opinión
 * disfrazada de dato.
 */
export function CifrasDeContexto ({ cifras }: { cifras: Cifra[] }) {
  return (
    <>
      {cifras.map((cifra) => (
        <TarjetaDeCifra
          key={cifra.clave}
          etiqueta={cifra.etiqueta}
          valor={String(cifra.valor)}
          alarma={cifra.alarma}
        />
      ))}
    </>
  )
}

/**
 * La próxima entrega comprometida.
 *
 * Sale de la fecha de una {proceso} y no de un hito: en los {espacios} reales los hitos son
 * categorías fechadas al 31 de diciembre, y una «próxima entrega» sacada de ahí le miente al
 * cliente. `duedate` es la fecha contra la que ya nos reclama.
 *
 * Con `null` el panel no se dibuja: no hay próxima entrega que anunciar, y no se cae a «la última
 * que venció», que no es una próxima entrega.
 */
export function ProximaEntregaDelProyecto (
  { entrega }: { entrega: { name: string, duedate: string, dias: number } | null }
) {
  if (entrega === null) return null

  return (
    <TarjetaDeCifra
      etiqueta="Próxima entrega"
      valor={entrega.dias === 0 ? 'Hoy' : `${entrega.dias} ${entrega.dias === 1 ? 'día' : 'días'}`}
      nota={entrega.name}
    />
  )
}

/**
 * Las {procesos} por prioridad, como UNA barra apilada.
 *
 * === POR QUÉ APILADA Y NO DONA ===
 *
 * Se pidió una dona, y la skill de visualización la descarta para este dato. Es part-to-whole, y
 * para eso manda barra apilada —horizontal cuando las categorías tienen nombre largo, que es el
 * caso: «Urgente» girado 90° no se lee—. La dona queda reservada para part-to-whole de un vistazo
 * con valores que no sean cercanos, y acá el reparto real de un {espacio} es 0/74/6/2 sobre 82: Alto
 * y Urgente serían dos gajos de 26 y 9 grados, invisibles y sobre todo incomparables entre sí.
 * Apilados en horizontal, 6 y 2 se distinguen.
 *
 * El apilado se separa con un hueco de 2 px del color de la superficie, no con un borde alrededor de
 * cada tramo: un borde agrega tinta con peso de dato que no es dato.
 *
 * El rótulo va DENTRO del tramo sólo cuando cabe con aire a los dos lados —lo decide
 * `tramosDePrioridad`, no el CSS—. El que no cabe no se recorta: lo lleva la leyenda, que sale
 * siempre y con las cuatro prioridades, también las que están en cero.
 */
export function BarraDePrioridades ({ tareas }: { tareas: TareasDelTablero }) {
  const tramos = tramosDePrioridad(tareas)
  const claves = clavesDePrioridad(tareas)

  return (
    <Panel
      titulo={`${GLOSARIO.proceso.plural} por prioridad`}
      icono={<SignalHigh size={14} aria-hidden="true" className="shrink-0" />}
    >
      {tramos.length === 0
        ? <SinDatos motivo={SIN_NADA_QUE_MOSTRAR} />
        : (
            <div className="flex flex-col gap-3">
              <div
                role="img"
                aria-label={resumenDePrioridades(tareas)}
                className="flex h-6 gap-0.5 overflow-hidden rounded-medio"
              >
                {tramos.map((tramo) => (
                  <span
                    key={tramo.priority}
                    tabIndex={0}
                    className="group relative flex items-center justify-center outline-none"
                    style={{ width: `${tramo.porcentaje}%` }}
                  >
                    <span aria-hidden="true" className={cn('absolute inset-0', relleno(tramo.paso))} />
                    {/* Tinta clara sobre los dos pasos oscuros de la rampa y tinta oscura sobre los
                        dos claros: es la única excepción a «el texto no lleva el color del dato», y
                        se resuelve por luminancia para que siempre pase contraste. */}
                    {tramo.rotuloAdentro && (
                      <span
                        className={cn(
                          'relative z-10 truncate px-1.5 text-[11px] font-medium',
                          tramo.paso >= 3 ? 'text-acento-contenido' : 'text-texto'
                        )}
                      >
                        {tramo.etiqueta}
                      </span>
                    )}
                    <span className="bg-superficie-flotante border-linea text-texto shadow-2 pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 -translate-x-1/2 rounded-medio border px-2 py-1 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                      <span data-numerico className="font-semibold tabular-nums">{tramo.total}</span>
                      <span className="text-texto-tenue"> · {tramo.etiqueta}</span>
                    </span>
                  </span>
                ))}
              </div>

              {/* La leyenda sale siempre: son cuatro series y el color solo nunca alcanza para la
                  identidad. Y lleva el total de cada una, que es donde el cliente lee el cero. */}
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {claves.map((clave) => (
                  <li key={clave.priority} className="text-texto-tenue flex items-center gap-1.5 text-xs">
                    <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', relleno(clave.paso))} />
                    {clave.etiqueta}
                    <span data-numerico className="text-texto font-medium tabular-nums">{clave.total}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
    </Panel>
  )
}

/**
 * El paso de la rampa ordinal que le toca a una prioridad.
 *
 * Se escribe con las cuatro clases literales y no interpolando `bg-grafico-ordinal-${paso}`: el
 * compilador de Tailwind lee las clases del código fuente, y una clase armada en tiempo de
 * ejecución no existe en el CSS final. Es un fallo silencioso —el tramo sale transparente— y por eso
 * la tabla va explícita.
 */
function relleno (paso: number): string {
  if (paso <= 1) return 'bg-grafico-ordinal-1'
  if (paso === 2) return 'bg-grafico-ordinal-2'
  if (paso === 3) return 'bg-grafico-ordinal-3'

  return 'bg-grafico-ordinal-4'
}

/**
 * La clase de la marca de un estado: relleno neutro sin color, contorno si el catálogo no lo conoce.
 *
 * Es la misma regla que la insignia de estado (`EstadoDeTarea`): el desconocido va con contorno y
 * sin relleno, porque pintarlo del color de otro estado sería afirmar algo que no sabemos. El que
 * no tiene color en Perfex va en el gris de la tinta sutil, que es el neutro que se lee como marca
 * —`--relleno-neutro` es un fondo y sobre la superficie casi desaparece—.
 */
function claseDeMarca (estado: EstadoPintado): string {
  if (estado.desconocido) return 'border border-linea'
  if (estado.color === null) return 'bg-texto-sutil'

  return ''
}

/** El color de la marca de un estado, cuando lo tiene. Va en `style`: es un hexadecimal de Perfex. */
function estiloDeMarca (estado: EstadoPintado): CSSProperties | undefined {
  if (estado.desconocido || estado.color === null) return undefined

  return { backgroundColor: estado.color }
}

/** El globo de un tooltip, igual en los dos gráficos de estado. Aparece al pasar o al enfocar. */
function Globo ({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-superficie-flotante border-linea text-texto shadow-2 pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 -translate-x-1/2 rounded-medio border px-2 py-1 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
      {children}
    </span>
  )
}

/**
 * Las {procesos} por estado, como barras: una por estado con alguna.
 *
 * === POR QUÉ BARRAS Y NO UNA DONA ===
 *
 * Porque lo que se compara son magnitudes entre estados —«hay más esperando respuesta que en
 * proceso»— y el largo es el canal exacto para eso; el ángulo no. Además los repartos reales son
 * desparejos, con un «Completado» que se come el 80 %: en una dona los otros cuatro serían gajos
 * de pocos grados, incomparables entre sí.
 *
 * El color es el del estado en Perfex, el mismo de la insignia de cada fila, pero la identidad NO
 * depende de él: el nombre va escrito al lado de cada barra y la cifra al final. Con eso no hace
 * falta leyenda —la leyenda sería el rótulo repetido— y el daltonismo no le quita nada al gráfico.
 *
 * Las barras crecen desde una misma base y sin carril de fondo: un carril gris detrás haría que el
 * neutro de un estado sin color se confundiera con él.
 */
export function BarrasPorEstado ({ barras }: { barras: BarraDeEstado[] }) {
  return (
    <Panel
      titulo={`${GLOSARIO.proceso.plural} por estado`}
      icono={<ChartBarBig size={14} aria-hidden="true" className="shrink-0" />}
    >
      {barras.length === 0
        ? <SinDatos motivo={SIN_NADA_QUE_MOSTRAR} />
        : (
            <ul role="img" aria-label={resumenPorEstado(barras)} className="flex flex-col gap-2">
              {barras.map((barra) => (
                <li
                  key={barra.status}
                  tabIndex={0}
                  className="group relative flex items-center gap-3 outline-none"
                >
                  <span className="text-texto-tenue w-28 shrink-0 truncate text-xs">{barra.etiqueta}</span>
                  <span aria-hidden="true" className="relative h-3 min-w-0 flex-1">
                    {/* Punta redonda de 4 px del lado del dato y recta contra la base, como manda la
                        skill para toda barra. El mínimo de 4 px es para que un estado con una sola
                        {proceso} no desaparezca al lado de uno con cien. */}
                    <span
                      className={cn('absolute inset-y-0 left-0 min-w-1 rounded-r-[4px]', claseDeMarca(barra))}
                      style={{ width: `${barra.fraccion * 100}%`, ...estiloDeMarca(barra) }}
                    />
                  </span>
                  <span data-numerico className="text-texto w-8 shrink-0 text-right text-sm font-medium tabular-nums">
                    {barra.total}
                  </span>
                  <Globo>
                    <span data-numerico className="font-semibold tabular-nums">{barra.total}</span>
                    <span className="text-texto-tenue"> · {barra.etiqueta} · {barra.porcentaje} %</span>
                  </Globo>
                </li>
              ))}
            </ul>
          )}
    </Panel>
  )
}

/**
 * Cuántas {procesos} le quedan a cada {hito}, y en qué estado están.
 *
 * === LA FORMA ===
 *
 * Una barra apilada horizontal por {hito}: el largo total es cuántas le quedan y cada tramo es un
 * estado. Contesta las dos preguntas del pedido —«cuántas tareas hay actualmente pendientes» y «que
 * se diferencien por colores basándose en el estado»— en una sola marca por fila.
 *
 * El largo va en una **escala común** a todas las filas: el {hito} más cargado llena el carril y el
 * resto se mide contra él. Estirar cada barra a su propio 100 % las haría iguales, y el gráfico
 * dejaría de decir cuál {hito} es el que tiene más trabajo encima.
 *
 * Los tramos se separan con el hueco de 2 px de la superficie y NO llevan rótulo adentro: en una
 * barra de 12 px de alto no cabe una palabra, y un rótulo recortado es peor que ninguno. La
 * identidad la carga la leyenda —una sola vez, arriba—, el tooltip de cada tramo y la tabla del
 * pie, que tiene todos los números sin depender del color ni del mouse.
 *
 * Seis filas a la vista y el resto en un `<details>`, como las otras listas del tablero.
 */
export function PendientesPorHitoDelProyecto ({ lectura }: { lectura: PendientesPorHito }) {
  const visibles = lectura.filas.slice(0, HITOS_VISIBLES)
  const resto = lectura.filas.slice(HITOS_VISIBLES)
  const hito = GLOSARIO.hito
  const tareas = GLOSARIO.proceso.plural.toLowerCase()

  return (
    <Panel
      titulo={`Pendientes por ${hito.singular.toLowerCase()}`}
      icono={<Flag size={14} aria-hidden="true" className="shrink-0" />}
    >
      {lectura.filas.length === 0
        ? (
            <SinDatos
              motivo={
                lectura.hitos === 0
                  ? `Este ${GLOSARIO.espacio.singular.toLowerCase()} todavía no tiene ${hito.plural.toLowerCase()}.`
                  // Hay {hitos}, pero todos al día: es una buena noticia y se dice como tal, no con un
                  // gráfico de barras en cero.
                  : `Ningún ${hito.singular.toLowerCase()} tiene ${tareas} pendientes: todo lo de sus`
                    + ` ${lectura.hitos} ${hito.plural.toLowerCase()} está cerrado.`
              }
            />
          )
        : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {lectura.leyenda.map((estado) => (
                  <Clave key={estado.status} className={claseDeMarca(estado)} estilo={estiloDeMarca(estado)}>
                    {estado.etiqueta}
                  </Clave>
                ))}
              </div>

              <ul className="flex flex-col gap-2">
                {visibles.map((fila) => <FilaDePendientesPorHito key={fila.id} fila={fila} />)}
              </ul>

              {resto.length > 0 && (
                <details>
                  <summary className="text-texto-tenue hover:text-texto marker:content-none cursor-pointer list-none text-xs underline decoration-dotted underline-offset-2">
                    Ver los {lectura.filas.length} {hito.plural.toLowerCase()} con pendientes
                  </summary>
                  <ul className="mt-2 flex flex-col gap-2">
                    {resto.map((fila) => <FilaDePendientesPorHito key={fila.id} fila={fila} />)}
                  </ul>
                </details>
              )}

              <TablaDesplegable
                resumen="Ver los números"
                columnas={[hito.singular, ...lectura.leyenda.map((estado) => estado.etiqueta), 'Pendientes']}
                filas={lectura.filas.map((fila) => [
                  fila.nombre,
                  ...lectura.leyenda.map((estado) =>
                    String(fila.tramos.find((tramo) => tramo.status === estado.status)?.total ?? 0)
                  ),
                  String(fila.pendientes)
                ])}
              />
            </div>
          )}
    </Panel>
  )
}

/**
 * Un {hito}: su nombre, su barra apilada y cuántas le quedan.
 *
 * Los tramos reparten el ancho con `flex-grow` proporcional a su total, así que el hueco de 2 px
 * entre ellos sale del `gap` y no se descuenta a mano. La punta redonda la lleva sólo el último
 * tramo, que es el extremo del dato; el contenedor no recorta con `overflow-hidden` porque se
 * llevaría también los tooltips.
 */
function FilaDePendientesPorHito ({ fila }: { fila: FilaDePendientes }) {
  return (
    <li className="flex items-center gap-3">
      <span className="text-texto w-32 shrink-0 truncate text-xs" title={fila.nombre}>{fila.nombre}</span>
      <span className="relative flex h-3 min-w-0 flex-1 items-stretch">
        <span
          role="img"
          aria-label={resumenDeFila(fila)}
          className="flex min-w-2 gap-0.5"
          style={{ width: `${fila.fraccion * 100}%` }}
        >
          {fila.tramos.map((tramo, i) => (
            <span
              key={tramo.status}
              tabIndex={0}
              className="group relative min-w-0.5 basis-0 outline-none"
              style={{ flexGrow: tramo.total }}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'absolute inset-0',
                  i === fila.tramos.length - 1 && 'rounded-r-[4px]',
                  claseDeMarca(tramo)
                )}
                style={estiloDeMarca(tramo)}
              />
              <Globo>
                <span data-numerico className="font-semibold tabular-nums">{tramo.total}</span>
                <span className="text-texto-tenue"> · {tramo.etiqueta}</span>
              </Globo>
            </span>
          ))}
        </span>
      </span>
      <span data-numerico className="text-texto w-8 shrink-0 text-right text-sm font-medium tabular-nums">
        {fila.pendientes}
      </span>
    </li>
  )
}

/**
 * Las últimas novedades del {espacio}, cinco a la vista.
 *
 * No es un gráfico y no finge serlo: son hechos con fecha, y la forma de un hecho es una línea de
 * texto. Ponerlos en un eje no agregaría nada porque no se comparan entre sí.
 *
 * Lo que sí se decide es qué NO se muestra. La API ya descartó las líneas internas —la asignación de
 * {procesos} entre nosotros es casi la mitad del feed— y `novedades()` descarta además cualquier
 * clave que la pantalla no sepa decir en castellano.
 */
export function UltimasNovedades ({ novedades: lista }: { novedades: Novedad[] }) {
  const visibles = lista.slice(0, FILAS_VISIBLES)
  const resto = lista.slice(FILAS_VISIBLES)

  return (
    <Panel
      titulo="Últimas novedades"
      icono={<CalendarClock size={14} aria-hidden="true" className="shrink-0" />}
    >
      {lista.length === 0
        ? <SinDatos motivo="Todavía no hay novedades para mostrar." />
        : (
            <div className="flex flex-col gap-1.5">
              <ul className="flex flex-col gap-1.5">
                {visibles.map((novedad) => <FilaDeNovedad key={novedad.fecha} novedad={novedad} />)}
              </ul>

              {resto.length > 0 && (
                <details>
                  <summary className="text-texto-tenue hover:text-texto marker:content-none cursor-pointer list-none text-xs underline decoration-dotted underline-offset-2">
                    Ver {lista.length}
                  </summary>
                  <ul className="mt-1.5 flex flex-col gap-1.5">
                    {resto.map((novedad) => <FilaDeNovedad key={novedad.fecha} novedad={novedad} />)}
                  </ul>
                </details>
              )}
            </div>
          )}
    </Panel>
  )
}

/** Una novedad: qué pasó y cuándo. */
function FilaDeNovedad ({ novedad }: { novedad: Novedad }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
      <span className="text-texto min-w-0">{novedad.texto}</span>
      <span data-numerico className="text-texto-tenue shrink-0 text-xs tabular-nums">
        {novedad.etiqueta}
      </span>
    </li>
  )
}

/**
 * La tabla que acompaña a un gráfico cuyos valores no están todos rotulados.
 *
 * Es el gemelo accesible que pide la skill: un tooltip nunca puede ser la única forma de leer un
 * número. Va en un `<details>` porque eso es HTML puro —el componente sigue sin estado y sin
 * JavaScript— y porque plegada no le cobra espacio al gráfico, que era justamente la queja.
 */
function TablaDesplegable (
  { resumen, columnas, filas }: { resumen: string, columnas: string[], filas: string[][] }
) {
  return (
    <details>
      <summary className="text-texto-tenue hover:text-texto marker:content-none cursor-pointer list-none text-xs underline decoration-dotted underline-offset-2">
        {resumen}
      </summary>
      <table className="mt-2 w-full text-xs">
        <thead>
          <tr className="text-texto-tenue text-left">
            {columnas.map((columna) => <th key={columna} className="pb-1 font-medium">{columna}</th>)}
          </tr>
        </thead>
        <tbody className="text-texto">
          {filas.map((fila) => (
            <tr key={fila[0]}>
              {fila.map((celda, i) => (
                <td
                  key={columnas[i]}
                  data-numerico={i > 0 ? '' : undefined}
                  className={cn('py-0.5', i > 0 && 'tabular-nums')}
                >
                  {celda}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
