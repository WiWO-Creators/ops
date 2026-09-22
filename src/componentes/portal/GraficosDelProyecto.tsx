import { Activity, CalendarClock, ChartColumn, Flag, SignalHigh, TrendingUp, Users } from 'lucide-react'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import { Clave, Panel, SinDatos, anclaDelRotulo } from './GraficosDelTablero'
import {
  SIN_NADA_QUE_MOSTRAR,
  resumenDeCierres,
  resumenDeHitos,
  resumenDePrioridades,
  type BarraDePrioridad,
  type FilaDePersona,
  type LecturaDeAvance,
  type LecturaDeCierres,
  type LineaDeHitos,
  type Novedad
} from './tablero-proyecto'

/**
 * Los gráficos del tablero de UN {espacio}, tal como lo abre el contacto del cliente.
 *
 * === DE DÓNDE SALE ESTE ARCHIVO ===
 *
 * `Panel`, `SinDatos`, `Clave` y `anclaDelRotulo` se importan de `GraficosDelTablero.tsx`, que es
 * donde viven los gráficos de la portada. No se copian: dos familias de gráficos en el mismo
 * producto es exactamente lo contrario de lo que se pidió, y dos envoltorios que empiezan iguales
 * terminan distintos en el primer ajuste de padding.
 *
 * Lo que sí es propio de acá es QUÉ se dibuja. La portada compara {espacios} entre sí; este tablero
 * mira uno solo por dentro, así que ninguna de sus cuatro formas servía tal cual: una mancuerna con
 * una sola fila no compara nada.
 *
 * === LAS TRES REGLAS QUE SE HEREDAN, Y NO SE DISCUTEN ===
 *
 *   1. **Un solo tono.** Todo va con `--acento` más el gris de la rejilla y los colores de estado.
 *      La paleta de ocho colores del sistema existe pero no pasa el control de contraste sobre fondo
 *      claro. El largo y la posición ya codifican la magnitud; la identidad la lleva la etiqueta.
 *   2. **Cada gráfico se lee también sin verlo.** `role="img"` con un `aria-label` que dice lo mismo
 *      en una frase, armada en `tablero-proyecto.ts`. Las marcas de estado —atrasado, parcial—
 *      llevan SIEMPRE palabra además de color.
 *   3. **Un cero medido y un dato que falta se dibujan distinto.** Nunca una barra vacía donde la
 *      respuesta es «todavía no lo sabemos».
 *
 * Server Components sin estado: no hay nada que tocar.
 */

/**
 * El avance del {espacio}: una barra, y lo que la barra no puede decir.
 *
 * Una barra y no un anillo: lo que se compara es una parte contra un todo sobre un eje que el
 * cliente ya leyó en la lista de {procesos}, y para eso el largo es exacto mientras que el ángulo no.
 *
 * Con `porcentaje` en `null` NO se dibuja una barra en cero: se escribe el motivo. Es la diferencia
 * entre «no se hizo nada» y «no hay {procesos} compartidas para medirlo», que es justo la confusión
 * que este tablero existe para no provocar.
 */
export function GraficoDeAvance ({ avance }: { avance: LecturaDeAvance }) {
  return (
    <Panel
      titulo={`Avance de las ${GLOSARIO.proceso.plural.toLowerCase()}`}
      icono={<TrendingUp size={14} aria-hidden="true" className="shrink-0" />}
      nota={
        avance.porcentaje === null
          ? undefined
          : `${avance.cerradas} de ${avance.total} ${GLOSARIO.proceso.plural.toLowerCase()} cerradas.`
              + (avance.abiertas > 0 ? ` Quedan ${avance.abiertas} abiertas.` : '')
      }
    >
      {avance.porcentaje === null
        ? <SinDatos motivo={avance.motivo} />
        : (
            <div
              role="img"
              aria-label={`${avance.porcentaje} % completado: ${avance.cerradas} de ${avance.total} ${GLOSARIO.proceso.plural.toLowerCase()}.`}
              className="flex items-center gap-3"
            >
              <span aria-hidden="true" className="bg-relleno-neutro relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-full">
                <span
                  className="bg-acento absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${avance.porcentaje}%` }}
                />
              </span>
              <span data-numerico className="text-texto shrink-0 text-lg font-semibold tabular-nums">
                {avance.porcentaje}%
              </span>
            </div>
          )}
    </Panel>
  )
}

/**
 * Cuántas {procesos} se cerraron por semana, en las últimas doce.
 *
 * Columnas y no una línea: cada semana es un recuento cerrado, y una línea que une doce recuentos
 * insinúa valores intermedios que no existen —«el miércoles y medio se cerraron 1,4 {procesos}»—.
 *
 * La escala es la mejor semana de la propia serie y no un máximo absoluto: la pregunta es si el
 * ritmo sube o baja, no cuánto es «mucho» en abstracto.
 *
 * La última columna va rayada y dicha: es la semana en curso, se cortó en HOY, y compararla contra
 * semanas de siete días sin avisar es la forma más barata de dibujar una caída que no pasó.
 *
 * Con menos de tres semanas con algún cierre no se dibuja nada: dos barras sueltas sobre diez
 * semanas vacías no son una tendencia, son dos hechos, y el gráfico los presentaría como un derrumbe.
 */
export function GraficoDeCierres ({ cierres }: { cierres: LecturaDeCierres }) {
  return (
    <Panel
      titulo="Ritmo de cierres"
      icono={<ChartColumn size={14} aria-hidden="true" className="shrink-0" />}
      nota={
        cierres.valeDibujarla
          ? 'La última columna es la semana en curso, así que todavía le faltan días.'
          : undefined
      }
    >
      {cierres.valeDibujarla
        ? (
            <div role="img" aria-label={resumenDeCierres(cierres)} className="flex flex-col gap-2">
              <div className="flex h-28 items-stretch gap-1">
                {cierres.puntos.map((punto) => (
                  <span key={punto.semana} className="flex min-w-0 flex-1 flex-col justify-end gap-1">
                    <span
                      data-numerico
                      className="text-texto-tenue h-3 text-center text-[10px] leading-none tabular-nums"
                    >
                      {punto.cerradas === 0 ? '' : punto.cerradas}
                    </span>
                    {/* La pista con altura definida es lo que hace que el `%` de la barra signifique
                        algo: sin un padre de altura conocida el navegador resuelve todo `height` en
                        porcentaje a cero, y el gráfico sale con los números y sin las columnas. */}
                    <span aria-hidden="true" className="relative block h-20 w-full">
                      {/* La semana sin cierres no dibuja NADA, ni una barra de altura cero: el borde
                          de la semana en curso la dejaba como una rayita de 1 px que se lee como un
                          valor chiquito en vez de como un cero. El hueco es el cero. */}
                      {punto.cerradas > 0 && (
                        <span
                          className={cn(
                            'absolute inset-x-0 bottom-0 rounded-t-sm',
                            punto.parcial ? 'bg-acento/40 border-acento border border-b-0 border-dashed' : 'bg-acento'
                          )}
                          // El mínimo de 2px le da cuerpo a la semana que cerró poco sin igualarla
                          // con la que no cerró nada, que ya no dibuja nada.
                          style={{ height: `max(2px, ${punto.fraccion * 100}%)` }}
                        />
                      )}
                    </span>
                  </span>
                ))}
              </div>

              <div className="text-texto-sutil flex justify-between text-[10px]">
                <span>{cierres.puntos[0]?.etiqueta}</span>
                <span>esta semana</span>
              </div>
            </div>
          )
        : (
            <SinDatos
              motivo={
                cierres.total === 0
                  ? `No se cerró ninguna ${GLOSARIO.proceso.singular.toLowerCase()} en las últimas doce semanas.`
                  : `Solo ${cierres.semanasConDato} de las últimas doce semanas tuvieron cierres`
                    + ` (${cierres.total} en total): todavía es poco para dibujar un ritmo.`
              }
            />
          )}
    </Panel>
  )
}

/**
 * Cómo se reparten las {procesos} por prioridad.
 *
 * Barras horizontales del mismo tono, con el rótulo a la izquierda: es la misma forma que
 * `GraficoPorEstado` en la portada, y comparte el motivo. Cuatro colores repetirían en tinta lo que
 * el largo ya dice y gastarían el canal de identidad.
 *
 * Las cuatro prioridades salen siempre, también las que están en cero: una lista que cambia de largo
 * según el {espacio} obliga a releer los rótulos en cada pantalla.
 */
export function GraficoDePrioridades ({ barras }: { barras: BarraDePrioridad[] }) {
  const total = barras.reduce((suma, barra) => suma + barra.total, 0)

  return (
    <Panel
      titulo={`${GLOSARIO.proceso.plural} por prioridad`}
      icono={<SignalHigh size={14} aria-hidden="true" className="shrink-0" />}
    >
      {total === 0
        ? <SinDatos motivo={SIN_NADA_QUE_MOSTRAR} />
        : (
            <ul role="img" aria-label={resumenDePrioridades(barras)} className="flex flex-col gap-2">
              {barras.map((barra) => (
                <li key={barra.priority} className="flex items-center gap-3">
                  <span className="text-texto-tenue w-20 shrink-0 truncate text-xs">{barra.etiqueta}</span>
                  <span aria-hidden="true" className="bg-relleno-neutro relative h-2 min-w-0 flex-1 overflow-hidden rounded-full">
                    <span
                      className="bg-acento absolute inset-y-0 left-0 rounded-full"
                      style={{ width: `${barra.fraccion * 100}%` }}
                    />
                  </span>
                  <span data-numerico className="text-texto w-6 shrink-0 text-right text-sm font-medium tabular-nums">
                    {barra.total}
                  </span>
                </li>
              ))}
            </ul>
          )}
    </Panel>
  )
}

/**
 * Los hitos sobre una línea de tiempo, con el avance de cada uno.
 *
 * === LA SALVEDAD ES PARTE DEL GRÁFICO ===
 *
 * En la mayoría de los {espacios} las fechas de hito son de relleno: caen el último día del mes
 * porque alguien tenía que poner una fecha. El eje se dibuja igual —es la decisión del usuario— pero
 * `linea.salvedad` lo dice con palabras cuando ese patrón aparece, y la fecha se escribe tal como
 * está guardada, sin «faltan N días» que la haría parecer un compromiso.
 *
 * Los hitos sin fecha no van al eje —no tienen dónde ir— y se nombran abajo: sacarlos de la lista le
 * restaría hitos al cliente.
 *
 * «Atrasado» exige las dos cosas, que la fecha haya pasado y que quede trabajo abierto. Un hito con
 * fecha vieja y todo cerrado se entregó; marcarlo en rojo sería llamar atraso a una entrega.
 */
export function LineaDeTiempoDeHitos ({ linea }: { linea: LineaDeHitos }) {
  const conFecha = linea.marcas.filter((marca) => marca.posicion !== null)

  return (
    <Panel
      titulo={`${GLOSARIO.hito.plural} y fechas`}
      icono={<Flag size={14} aria-hidden="true" className="shrink-0" />}
      nota={linea.salvedad === '' ? undefined : linea.salvedad}
    >
      {linea.marcas.length === 0
        ? <SinDatos motivo={`Este ${GLOSARIO.espacio.singular.toLowerCase()} todavía no tiene ${GLOSARIO.hito.plural.toLowerCase()}.`} />
        : (
            <div role="img" aria-label={resumenDeHitos(linea)} className="flex flex-col gap-3">
              {conFecha.length > 0 && (
                <div className="relative h-8">
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
                    style={{ left: `${linea.hoy * 100}%`, transform: anclaDelRotulo(linea.hoy) }}
                  >
                    hoy
                  </span>

                  {conFecha.map((marca) => (
                    <span
                      key={marca.id}
                      aria-hidden="true"
                      className={cn(
                        'border-superficie-elevada absolute bottom-2 size-2.5 rounded-full border-2',
                        marca.atrasado ? 'bg-relleno-peligro' : marca.cumplido ? 'bg-relleno-exito' : 'bg-acento'
                      )}
                      style={{ left: `${(marca.posicion as number) * 100}%`, transform: 'translate(-50%, 50%)' }}
                    />
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <Clave className="bg-relleno-exito">Cumplido</Clave>
                <Clave className="bg-acento">En curso</Clave>
                <Clave className="bg-relleno-peligro">Atrasado</Clave>
              </div>

              <ul className="flex flex-col gap-2">
                {linea.marcas.map((marca) => (
                  <li key={marca.id} className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                      <span className="text-texto min-w-0">
                        {marca.nombre}
                        {marca.atrasado && (
                          <span className="text-texto-peligro ml-2 text-xs font-semibold uppercase">Atrasado</span>
                        )}
                        {marca.cumplido && (
                          <span className="text-texto-exito ml-2 text-xs font-semibold uppercase">Cumplido</span>
                        )}
                      </span>
                      <span
                        data-numerico
                        className={cn(
                          'shrink-0 text-xs tabular-nums',
                          marca.atrasado ? 'text-texto-peligro font-medium' : 'text-texto-tenue'
                        )}
                      >
                        {marca.etiqueta === '' ? 'sin fecha' : marca.etiqueta}
                      </span>
                    </div>

                    {/* El avance del hito. Con `porcentaje` en `null` no va barra ni 0 %: el hito
                        no tiene {procesos} compartidas, que no es lo mismo que no haber empezado. */}
                    {marca.porcentaje === null
                      ? (
                          <span className="text-texto-tenue text-xs">
                            Sin {GLOSARIO.proceso.plural.toLowerCase()} compartidas
                          </span>
                        )
                      : (
                          <span className="flex items-center gap-2">
                            <span aria-hidden="true" className="bg-relleno-neutro relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full">
                              <span
                                className="bg-acento absolute inset-y-0 left-0 rounded-full"
                                style={{ width: `${marca.porcentaje}%` }}
                              />
                            </span>
                            <span data-numerico className="text-texto-tenue shrink-0 text-xs tabular-nums">
                              {marca.cerradas}/{marca.tareas}
                            </span>
                          </span>
                        )}
                  </li>
                ))}
              </ul>
            </div>
          )}
    </Panel>
  )
}

/**
 * Quién tiene trabajo abierto en el {espacio}.
 *
 * Ordenado por {procesos} abiertas: la pregunta del cliente es quién está con esto ahora, no quién
 * acumuló más a lo largo del {espacio}. Quien no tiene nada abierto aparece al final con su barra
 * vacía y su recuento de cerradas, porque igual es parte del equipo.
 *
 * Las barras NO se apilan y no suman el total del {espacio}: una {proceso} con dos responsables
 * cuenta para los dos. Es un «cuánto lleva cada uno», no un reparto de una torta.
 */
export function GraficoDeEquipo ({ filas }: { filas: FilaDePersona[] }) {
  return (
    <Panel
      titulo={`Quién está en este ${GLOSARIO.espacio.singular.toLowerCase()}`}
      icono={<Users size={14} aria-hidden="true" className="shrink-0" />}
      nota={
        filas.length === 0
          ? undefined
          : `Las barras son ${GLOSARIO.proceso.plural.toLowerCase()} abiertas y no se suman entre sí:`
            + ` una ${GLOSARIO.proceso.singular.toLowerCase()} con dos responsables cuenta para los dos.`
      }
    >
      {filas.length === 0
        ? <SinDatos motivo="Todavía no hay nadie asignado a este proyecto." />
        : (
            <ul
              role="img"
              aria-label={
                `${filas.length} personas en el equipo: `
                + filas.map((f) => `${f.nombre}, ${f.abiertas} abiertas`).join('; ') + '.'
              }
              className="flex flex-col gap-2"
            >
              {filas.map((fila) => (
                <li key={fila.id} className="flex items-center gap-3">
                  <span className="text-texto w-32 shrink-0 truncate text-xs">{fila.nombre}</span>
                  <span aria-hidden="true" className="bg-relleno-neutro relative h-2 min-w-0 flex-1 overflow-hidden rounded-full">
                    <span
                      className="bg-acento absolute inset-y-0 left-0 rounded-full"
                      style={{ width: `${fila.fraccion * 100}%` }}
                    />
                  </span>
                  <span data-numerico className="text-texto-tenue w-20 shrink-0 text-right text-xs tabular-nums">
                    {fila.abiertas} / {fila.cerradas} hechas
                  </span>
                </li>
              ))}
            </ul>
          )}
    </Panel>
  )
}

/**
 * Las últimas novedades del {espacio}.
 *
 * No es un gráfico y no finge serlo: son hechos con fecha, y la forma de un hecho es una línea de
 * texto. Ponerlos en un eje no agregaría nada porque no se comparan entre sí.
 *
 * Lo que sí se decide acá es qué NO se muestra. La API ya descartó las líneas internas —la
 * asignación de {procesos} entre nosotros es casi la mitad del feed— y `novedades()` descarta además
 * cualquier clave que la pantalla no sepa decir en castellano. Antes que mostrarle al cliente un
 * `not_project_activity_task_status_changed` crudo, la línea se omite.
 */
export function UltimasNovedades ({ novedades: lista }: { novedades: Novedad[] }) {
  return (
    <Panel
      titulo="Últimas novedades"
      icono={<Activity size={14} aria-hidden="true" className="shrink-0" />}
    >
      {lista.length === 0
        ? <SinDatos motivo="Todavía no hay novedades para mostrar." />
        : (
            <ul className="flex flex-col gap-1.5">
              {lista.map((novedad) => (
                <li key={novedad.fecha} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <span className="text-texto min-w-0">{novedad.texto}</span>
                  <span data-numerico className="text-texto-tenue shrink-0 text-xs tabular-nums">
                    {novedad.etiqueta}
                  </span>
                </li>
              ))}
            </ul>
          )}
    </Panel>
  )
}

/**
 * La próxima entrega, dicha en una frase.
 *
 * Sale de la fecha de una {proceso} y no de un hito, y eso es lo que la hace publicable: `duedate`
 * es la fecha contra la que el cliente ya nos reclama en su propia lista, mientras que la fecha de
 * hito suele ser el 31 de diciembre porque alguien tenía que llenar el campo.
 *
 * Con `null` no se escribe «sin fecha» ni se cae a la última que venció: el panel no se dibuja. No
 * hay próxima entrega que anunciar y decir cualquier otra cosa sería llenar un hueco.
 */
export function ProximaEntregaDelProyecto (
  { entrega }: { entrega: { name: string, duedate: string, dias: number } | null }
) {
  if (entrega === null) return null

  return (
    <Panel
      titulo="Próxima entrega"
      icono={<CalendarClock size={14} aria-hidden="true" className="shrink-0" />}
      nota={`${GLOSARIO.proceso.singular}: ${entrega.name}`}
    >
      <p className="text-texto text-sm">
        <span data-numerico className="text-lg font-semibold tabular-nums">
          {entrega.dias === 0 ? 'Hoy' : `En ${entrega.dias} ${entrega.dias === 1 ? 'día' : 'días'}`}
        </span>
      </p>
    </Panel>
  )
}
