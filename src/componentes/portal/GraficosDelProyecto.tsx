import { Activity, CalendarClock, ChartColumn, Flag, SignalHigh, TriangleAlert, Users } from 'lucide-react'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import { Panel, SinDatos } from './GraficosDelTablero'
import {
  LIENZO_DE_AREA,
  SIN_NADA_QUE_MOSTRAR,
  arcoDeAvance,
  areaDeCierres,
  clavesDePrioridad,
  marcasAgrupadas,
  resumenDeCierres,
  resumenDeHitos,
  resumenDePrioridades,
  tramosDePrioridad,
  type Cifra,
  type FilaDePersona,
  type LecturaDeAvance,
  type LecturaDeCierres,
  type LineaDeHitos,
  type MarcaAgrupada,
  type MarcaDeHito,
  type Novedad
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
 *   - **Ritmo de cierres** eran doce columnas. Es una tendencia de una sola serie: **área**.
 *   - **Hitos** eran una lista larga con un eje arriba. Es una **línea de tiempo** con su lista
 *     recortada a cinco.
 *   - **Tickets** tenía dos números en un panel con título de gráfico. Son dos **cifras**: la
 *     skill marca como anti-patrón tanto el pastel de dos porciones como la barra de una sola barra.
 *
 * === LAS REGLAS QUE GOBIERNAN EL ARCHIVO ===
 *
 *   1. **Un solo tono, y cuando hace falta escala, ordinal.** Las prioridades son una escala con
 *      orden (Bajo < Medio < Alto < Urgente), así que les toca rampa secuencial de un tono:
 *      `--grafico-ordinal-1..4`, validadas con el script de la skill en los dos temas. La paleta
 *      categórica de ocho sigue muerta y con motivo: no pasa contraste sobre fondo claro.
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

/** Cuántas filas se ven antes del `<details>`, en las tres listas que lo llevan. */
const FILAS_VISIBLES = 5

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
 * severidad —donde el relleno viaja de acento a peligro— tendría razón; acá el relleno es siempre
 * acento, así que la consistencia con el resto del portal gana. Y el paso claro azul no pasaba el
 * piso de 2:1 contra la superficie: lo corrí, y falla.
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
                    className="stroke-acento"
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
 * El ritmo de cierres de las últimas doce semanas, como área.
 *
 * === POR QUÉ ÁREA ===
 *
 * Porque es una tendencia de UNA serie, y para eso la skill manda línea, con relleno cuando la serie
 * es única. Doce columnas en fila —que es lo que había— presentan cada semana como una categoría
 * independiente cuando lo que importa es la forma del conjunto, y ocupan doce veces el espacio.
 *
 * El relleno cierra contra la BASE del lienzo y no contra el mínimo de la serie: un área que no
 * arranca en cero exagera la variación, que es la forma más común de mentir con un área.
 *
 * Se rotula sólo el extremo y el final. Un número en cada punto es lo que la skill llama caos que
 * nadie lee; el resto de los valores vive en la tabla del `<details>`, así que ninguno queda
 * encerrado detrás del mouse.
 *
 * La última semana va con su punto hueco y dicha con palabras: se cortó en HOY, y compararla contra
 * semanas de siete días sin avisar dibuja una caída que no pasó.
 */
export function AreaDeRitmo ({ cierres }: { cierres: LecturaDeCierres }) {
  const serie = areaDeCierres(cierres)
  const primero = serie.puntos[0]
  const ultimo = serie.puntos[serie.puntos.length - 1]

  return (
    <Panel
      titulo="Ritmo de cierres"
      icono={<ChartColumn size={14} aria-hidden="true" className="shrink-0" />}
    >
      {!cierres.valeDibujarla || serie.linea === ''
        ? (
            <SinDatos
              motivo={
                cierres.total === 0
                  ? `No se cerró ninguna ${GLOSARIO.proceso.singular.toLowerCase()} en las últimas doce semanas.`
                  : `Solo ${cierres.semanasConDato} de las últimas doce semanas tuvieron cierres`
                    + ` (${cierres.total} en total): todavía es poco para dibujar un ritmo.`
              }
            />
          )
        : (
            <div className="flex flex-col gap-2">
              <div className="relative">
                <svg
                  viewBox={`0 0 ${LIENZO_DE_AREA.ancho} ${LIENZO_DE_AREA.alto}`}
                  preserveAspectRatio="none"
                  className="h-24 w-full"
                  role="img"
                  aria-label={resumenDeCierres(cierres)}
                >
                  {/* La base, en el gris de rejilla del sistema: un eje más oscuro que los datos
                      compite con ellos. Hairline y sólida, nunca punteada. */}
                  <line
                    x1="0"
                    y1={LIENZO_DE_AREA.alto}
                    x2={LIENZO_DE_AREA.ancho}
                    y2={LIENZO_DE_AREA.alto}
                    className="stroke-grafico-rejilla"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                  {/* El relleno es un lavado al 10 %, no un bloque saturado. */}
                  <path d={serie.area} className="fill-acento opacity-10" />
                  {/* `non-scaling-stroke` mantiene el trazo en 2 px reales: sin eso el
                      `preserveAspectRatio="none"` lo estira con el lienzo y la línea engorda. */}
                  <path
                    d={serie.linea}
                    fill="none"
                    className="stroke-acento"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>

                {/* Los puntos y las zonas sensibles van en HTML encima del SVG y no dentro: con
                    `preserveAspectRatio="none"` un `<circle>` se estiraría a elipse. Cada zona mide
                    un doceavo del ancho y todo el alto, así que el objetivo es mucho mayor que la
                    marca — un punto de 8 px es un alfiler que nadie acierta. */}
                {serie.puntos.map((punto) => (
                  <span
                    key={punto.semana}
                    tabIndex={0}
                    className="group absolute top-0 bottom-0 -mx-3 w-6 outline-none"
                    style={{ left: `${punto.fraccionX * 100}%` }}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'border-superficie-elevada absolute left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2',
                        // El anillo de 2 px en el color de la superficie es lo que deja el punto
                        // legible donde cruza la línea. El hueco marca la semana en curso.
                        punto.parcial ? 'bg-superficie-elevada border-acento' : 'bg-acento',
                        // Sólo se ven el extremo y el final; el resto aparece al apuntar o al
                        // tabular. Doce puntos siempre visibles sobre un área de 96 px es ruido.
                        punto.extremo || punto.parcial
                          ? 'opacity-100'
                          : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                      )}
                      style={{ top: `${(punto.y / LIENZO_DE_AREA.alto) * 100}%` }}
                    />

                    {/* El tooltip: valor primero y en tinta fuerte, fecha después. Es al revés que
                        la leyenda a propósito — acá el lector ya sabe qué semana mira y quiere el
                        número. Aparece igual con el foco del teclado que con el mouse. */}
                    <span className="bg-superficie-flotante border-linea text-texto shadow-2 pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded-medio border px-2 py-1 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                      <span data-numerico className="font-semibold tabular-nums">{punto.cerradas}</span>
                      <span className="text-texto-tenue"> · {punto.etiqueta}</span>
                    </span>
                  </span>
                ))}
              </div>

              {/* El eje, con sólo sus dos extremos rotulados: doce fechas no caben y no hacen falta
                  para leer una forma. */}
              <div className="text-texto-sutil flex justify-between text-[10px]">
                <span>{primero?.etiqueta}</span>
                <span>esta semana{ultimo?.cerradas === 0 ? ', sin cierres todavía' : ''}</span>
              </div>

              <TablaDesplegable
                resumen="Ver las doce semanas"
                columnas={['Semana', 'Cerradas']}
                filas={serie.puntos.map((punto) => [
                  punto.parcial ? `${punto.etiqueta} (en curso)` : punto.etiqueta,
                  String(punto.cerradas)
                ])}
              />
            </div>
          )}
    </Panel>
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
 * Los {hitos} sobre una línea de tiempo, con las cinco primeras filas a la vista.
 *
 * === LO QUE HAY QUE SABER DE ESTAS FECHAS ===
 *
 * En los {espacios} reales los {hitos} no son fechas: son categorías de trabajo —«HTML», «REELS»,
 * «Guiones»— con una fecha de relleno. De los 236 de producción, 130 caen el último día de un mes.
 * El usuario decidió dibujar el eje igual, con ese hecho sobre la mesa; `linea.salvedad` es lo que
 * evita que el cliente lea una promesa donde hay un placeholder, y la fecha se escribe tal como está
 * guardada, sin redondeos ni «faltan N días».
 *
 * «Atrasado» exige las dos cosas: fecha pasada Y trabajo abierto. Un {hito} con fecha vieja y todo
 * cerrado se entregó, y marcarlo en rojo sería llamar atraso a una entrega.
 */
export function LineaDeTiempoDeHitos ({ linea }: { linea: LineaDeHitos }) {
  // Una marca por FECHA y no por hito: en un {espacio} real los tres hitos caen el 31 de diciembre
  // y dibujados por separado quedan superpuestos en el mismo píxel, así que el cliente cuenta uno
  // donde hay tres.
  const grupos = marcasAgrupadas(linea.marcas)
  const visibles = linea.marcas.slice(0, FILAS_VISIBLES)
  const resto = linea.marcas.slice(FILAS_VISIBLES)

  return (
    <Panel
      titulo={`${GLOSARIO.hito.plural} y fechas`}
      icono={<Flag size={14} aria-hidden="true" className="shrink-0" />}
      nota={linea.salvedad === '' ? undefined : linea.salvedad}
    >
      {linea.marcas.length === 0
        ? <SinDatos motivo={`Este ${GLOSARIO.espacio.singular.toLowerCase()} todavía no tiene ${GLOSARIO.hito.plural.toLowerCase()}.`} />
        : (
            <div className="flex flex-col gap-3">
              {grupos.length > 0 && (
                <div role="img" aria-label={resumenDeHitos(linea)} className="relative h-8">
                  <span
                    aria-hidden="true"
                    className="border-grafico-rejilla absolute inset-x-0 bottom-2 border-t"
                  />
                  <span
                    aria-hidden="true"
                    className="bg-texto-sutil absolute bottom-0.5 h-3 w-px"
                    style={{ left: `${linea.hoy * 100}%` }}
                  />
                  <span
                    className="text-texto-sutil absolute top-0 text-[10px] leading-none tracking-wide uppercase"
                    style={{ left: `${linea.hoy * 100}%`, transform: anclaDeHoy(linea.hoy) }}
                  >
                    hoy
                  </span>

                  {grupos.map((grupo) => (
                    <span
                      key={grupo.fecha}
                      tabIndex={0}
                      className="group absolute bottom-0 -mx-3 h-6 w-6 outline-none"
                      style={{ left: `${grupo.posicion * 100}%` }}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'border-superficie-elevada absolute bottom-2 left-1/2 size-2.5 translate-x-[-50%] translate-y-1/2 rounded-full border-2',
                          colorDeGrupo(grupo)
                        )}
                      />
                      {/* Cuántos comparten la fecha. Va como número al lado del punto y no como un
                          punto más grande: un radio distinto se lee como «más importante». */}
                      {grupo.hitos.length > 1 && (
                        <span
                          aria-hidden="true"
                          className="text-texto-tenue absolute bottom-3.5 left-1/2 ml-2 text-[10px] leading-none tabular-nums"
                        >
                          {grupo.hitos.length}
                        </span>
                      )}
                      <span className="bg-superficie-flotante border-linea text-texto shadow-2 pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded-medio border px-2 py-1 text-xs opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                        <span className="text-texto-tenue block whitespace-nowrap">{grupo.etiqueta}</span>
                        {grupo.hitos.map((hito) => (
                          <span key={hito.id} className="block max-w-56 truncate font-semibold">
                            {hito.nombre}
                          </span>
                        ))}
                      </span>
                    </span>
                  ))}
                </div>
              )}

              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                <Clave clase="bg-relleno-exito">Cumplido</Clave>
                <Clave clase="bg-acento">En curso</Clave>
                <Clave clase="bg-relleno-peligro">Atrasado</Clave>
              </ul>

              <ul className="flex flex-col gap-1.5">
                {visibles.map((marca) => <FilaDeHito key={marca.id} marca={marca} />)}
              </ul>

              {resto.length > 0 && (
                <details className="group">
                  <summary className="text-texto-tenue hover:text-texto marker:content-none cursor-pointer list-none text-xs underline decoration-dotted underline-offset-2">
                    Ver los {linea.marcas.length} {GLOSARIO.hito.plural.toLowerCase()}
                  </summary>
                  <ul className="mt-1.5 flex flex-col gap-1.5">
                    {resto.map((marca) => <FilaDeHito key={marca.id} marca={marca} />)}
                  </ul>
                </details>
              )}
            </div>
          )}
    </Panel>
  )
}

/** Una fila de {hito}: nombre, su marca de estado, la fecha y el avance de sus {procesos}. */
function FilaDeHito ({ marca }: { marca: MarcaDeHito }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', colorDeHito(marca))} />
      <span className="text-texto min-w-0 flex-1 truncate">{marca.nombre}</span>

      {marca.porcentaje === null
        ? (
            <span className="text-texto-tenue shrink-0 text-xs">
              sin {GLOSARIO.proceso.plural.toLowerCase()}
            </span>
          )
        : (
            <>
              <span aria-hidden="true" className="bg-relleno-neutro relative hidden h-1.5 w-16 shrink-0 overflow-hidden rounded-full sm:block">
                <span
                  className="bg-acento absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${marca.porcentaje}%` }}
                />
              </span>
              <span data-numerico className="text-texto-tenue w-9 shrink-0 text-right text-xs tabular-nums">
                {marca.cerradas}/{marca.tareas}
              </span>
            </>
          )}

      <span
        data-numerico
        className={cn(
          'w-20 shrink-0 text-right text-xs tabular-nums',
          marca.atrasado ? 'text-texto-peligro font-medium' : 'text-texto-tenue'
        )}
      >
        {marca.etiqueta === '' ? 'sin fecha' : marca.etiqueta}
      </span>
    </li>
  )
}

/** El color de estado de un {hito}. Siempre acompañado de su entrada en la leyenda. */
function colorDeHito (marca: MarcaDeHito): string {
  if (marca.atrasado) return 'bg-relleno-peligro'
  if (marca.cumplido) return 'bg-relleno-exito'

  return 'bg-acento'
}

/** El color de un grupo del eje. El peor caso manda: ver `marcasAgrupadas()`. */
function colorDeGrupo (grupo: MarcaAgrupada): string {
  if (grupo.estado === 'atrasado') return 'bg-relleno-peligro'
  if (grupo.estado === 'cumplido') return 'bg-relleno-exito'

  return 'bg-acento'
}

/**
 * Cómo se ancla el rótulo de HOY según dónde cae en el eje.
 *
 * Centrado en el medio, pegado al borde en los extremos. Sin esto, en la posición 0 o 100 el
 * navegador lo recorta — y la posición 0 es exactamente el caso de un {espacio} sin nada vencido.
 */
function anclaDeHoy (fraccion: number): string {
  if (fraccion <= 0.06) return 'translateX(0)'
  if (fraccion >= 0.94) return 'translateX(-100%)'

  return 'translateX(-50%)'
}

/** Una entrada de leyenda: la marca de color y su nombre en tinta de texto. */
function Clave ({ children, clase }: { children: React.ReactNode, clase: string }) {
  return (
    <li className="text-texto-tenue flex items-center gap-1.5 text-xs">
      <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', clase)} />
      {children}
    </li>
  )
}

/**
 * Quién tiene trabajo abierto, en barras, con las cinco primeras a la vista.
 *
 * Comparar magnitudes es para lo que existe la barra, así que acá la fila SÍ es la forma correcta —lo
 * que estaba mal antes era usarla para part-to-whole y para una tendencia—. Lo que cambia es el
 * techo: cinco filas y el resto en un `<details>`, en vez de veintitrés comiéndose la pantalla.
 *
 * Ordenado por {procesos} abiertas: la pregunta del cliente es quién está con esto ahora. Las barras
 * no se apilan y no suman el total del {espacio}: una {proceso} con dos responsables cuenta para los
 * dos.
 */
export function BarrasDeEquipo ({ filas, total }: { filas: FilaDePersona[], total: number }) {
  const visibles = filas.slice(0, FILAS_VISIBLES)
  const resto = filas.slice(FILAS_VISIBLES)

  return (
    <Panel
      titulo="Quién está trabajando"
      icono={<Users size={14} aria-hidden="true" className="shrink-0" />}
    >
      {filas.length === 0
        ? <SinDatos motivo={`Todavía no hay nadie asignado a este ${GLOSARIO.espacio.singular.toLowerCase()}.`} />
        : (
            <div className="flex flex-col gap-2">
              <ul
                role="img"
                aria-label={
                  `${total} personas en el equipo. `
                  + filas.map((f) => `${f.nombre}, ${f.abiertas} abiertas`).join('; ') + '.'
                }
                className="flex flex-col gap-2"
              >
                {visibles.map((fila) => <FilaDePersonaEnBarra key={fila.id} fila={fila} />)}
              </ul>

              {resto.length > 0 && (
                <details>
                  <summary className="text-texto-tenue hover:text-texto marker:content-none cursor-pointer list-none text-xs underline decoration-dotted underline-offset-2">
                    Ver las {total} personas
                  </summary>
                  <ul className="mt-2 flex flex-col gap-2">
                    {resto.map((fila) => <FilaDePersonaEnBarra key={fila.id} fila={fila} />)}
                  </ul>
                </details>
              )}
            </div>
          )}
    </Panel>
  )
}

/** Una persona: su nombre, su barra de abiertas y cuántas lleva cerradas. */
function FilaDePersonaEnBarra ({ fila }: { fila: FilaDePersona }) {
  return (
    <li className="flex items-center gap-2">
      <span className="text-texto w-24 shrink-0 truncate text-xs">{fila.nombre}</span>
      <span aria-hidden="true" className="bg-relleno-neutro relative h-2 min-w-0 flex-1 overflow-hidden rounded-full">
        <span
          className="bg-acento absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${fila.fraccion * 100}%` }}
        />
      </span>
      <span data-numerico className="text-texto w-4 shrink-0 text-right text-xs tabular-nums">
        {fila.abiertas}
      </span>
      <span data-numerico className="text-texto-sutil w-14 shrink-0 text-right text-xs tabular-nums">
        {fila.cerradas} hechas
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
