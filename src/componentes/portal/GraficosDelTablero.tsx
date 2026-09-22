import { CalendarClock, ChartNoAxesColumn, OctagonAlert, TrendingUp } from 'lucide-react'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import { formatearVencimiento } from '@/lib/fechas'
import type { EstadoDelResumen } from '@/datos/portal'
import {
  SIN_NADA_QUE_GRAFICAR,
  claseDeSalud,
  resumenDeEntregas,
  resumenDeSalud,
  resumenDeTrabas,
  type BarraDeTraba,
  type FilaDeSalud,
  type LineaDeEntregas,
  type TramoApilado
} from './tablero'

/**
 * Los graficos del tablero del cliente.
 *
 * === POR QUE SON GRAFICOS Y NO MAS TEXTO ===
 *
 * Porque las preguntas que contestan son de FORMA, no de valor. «¿Vamos bien?» no se responde con
 * «40%»: se responde comparando ese 40% contra el tiempo que ya se gasto, y esa comparacion se ve de
 * un golpe o no se ve. Lo mismo con «¿qué se viene?», que es una posicion en el tiempo, y con
 * «¿qué está más detenido?», que es un orden de magnitud. Escritas en una lista, las tres obligan al
 * cliente a hacer la cuenta de cabeza.
 *
 * === UN SOLO TONO, A PROPOSITO ===
 *
 * La paleta de ocho colores del sistema existe pero NO pasa el control de contraste sobre fondo
 * claro —el verde de marca queda en 1.35:1 y dos slots leen como gris—, asi que acá no se usa. Todos
 * los graficos van con `--acento`, que es el unico relleno que el proyecto ya valida en los dos
 * temas (`pruebas/contraste.test.js`), mas el gris de la rejilla y los colores de estado.
 *
 * Eso no es una limitacion: el largo y la posicion ya codifican la magnitud, y la identidad la lleva
 * la ETIQUETA de cada fila. Colorear las barras por su valor gastaria el canal de identidad en
 * repetir lo que el largo ya dice.
 *
 * === CADA GRAFICO SE LEE TAMBIEN SIN VERLO ===
 *
 * Todos van con `role="img"` y un `aria-label` que dice lo mismo en una frase, armada en
 * `tablero.ts`. No es un pie de foto: es el mismo dato por otro canal, que es lo que evita que la
 * version accesible sea peor que la visual. Las marcas de estado —vencido, detenido— llevan SIEMPRE
 * palabra ademas de color.
 *
 * Server Components sin estado: no hay nada que tocar.
 */

/**
 * El envoltorio de cada grafico: titulo con su simbolo, el dibujo, y su salvedad si la tiene.
 *
 * Exportado —como `SinDatos`, `Clave` y `anclaDelRotulo`— porque `GraficosDelProyecto.tsx` dibuja
 * los graficos del tablero de UN proyecto y tiene que salir de este molde y no de una copia con las
 * mismas clases. Dos envoltorios que empiezan iguales terminan distintos en el primer ajuste de
 * padding, y el cliente ve dos familias de graficos en el mismo producto.
 */
export function Panel (
  { titulo, icono, nota, children }:
  { titulo: string, icono: React.ReactNode, nota?: string, children: React.ReactNode }
) {
  return (
    <section className="rounded-tarjeta border-linea bg-superficie-elevada shadow-1 flex flex-col gap-3 border p-4">
      <h3 className="font-titular text-texto flex items-center gap-1.5 text-sm font-semibold">
        {icono}
        {titulo}
      </h3>
      {children}
      {nota !== undefined && (
        <p className="text-texto-sutil max-w-prose text-xs leading-relaxed">{nota}</p>
      )}
    </section>
  )
}

/** Lo que ocupa el lugar de un grafico que no tiene ni una fila que dibujar. */
export function SinDatos ({ motivo = SIN_NADA_QUE_GRAFICAR }: { motivo?: string }) {
  return (
    <p className="border-linea-suave bg-superficie-hundida rounded-medio border border-dashed p-3 text-xs leading-relaxed text-texto-tenue">
      {motivo}
    </p>
  )
}

/**
 * Una entrada de leyenda: la marca coloreada y su nombre en tinta de texto.
 *
 * El texto NUNCA lleva el color de la serie —un relleno claro es ilegible como letra—: la identidad
 * la carga el punto de al lado.
 */
export function Clave ({ children, className }: { children: React.ReactNode, className: string }) {
  return (
    <span className="text-texto-tenue flex items-center gap-1.5 text-xs">
      <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', className)} />
      {children}
    </span>
  )
}

/**
 * Avance contra plazo consumido, un {espacio} por fila.
 *
 * Es el grafico principal del tablero y el unico que contesta «¿vamos bien?». Cada fila es una
 * mancuerna: el punto del avance y el del plazo sobre el mismo eje 0-100, y el segmento entre los
 * dos ES el dato —cuanto se separo lo hecho de lo transcurrido—. Dos barras sueltas obligarian a
 * comparar dos largos que no arrancan en el mismo lugar.
 *
 * Las filas sin plazo se dibujan igual, con un solo punto y dichas como tales: sacarlas escondería
 * {espacios} del cliente, y ponerles un plazo en cero les inventaria un dato.
 *
 * @param filas lo que devolvio `filasDeSalud()`, la mas atrasada primero
 */
export function GraficoDeSalud ({ filas }: { filas: FilaDeSalud[] }) {
  if (filas.length === 0) return null

  const medibles = filas.filter((fila) => fila.atraso !== null).length

  return (
    <Panel
      titulo="Avance contra plazo"
      icono={<TrendingUp size={14} aria-hidden="true" className="shrink-0" />}
      nota={
        medibles < filas.length
          ? `${filas.length - medibles} de tus ${GLOSARIO.espacio.plural.toLowerCase()} no entran en `
            + 'la comparación: ya se entregaron, no tienen fecha de entrega, o no comparten su '
            + 'plazo. De ésos se dibuja sólo el avance.'
          : undefined
      }
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Clave className="bg-acento">Avance</Clave>
        <Clave className="bg-texto-sutil">Plazo consumido</Clave>
      </div>

      <ul role="img" aria-label={resumenDeSalud(filas)} className="flex flex-col gap-3">
        {filas.map((fila) => <FilaDeMancuerna key={fila.id} fila={fila} />)}
      </ul>
    </Panel>
  )
}

/**
 * Una fila de la mancuerna, con su eje propio de 0 a 100.
 *
 * El segmento entre los dos puntos se pinta en tono de peligro solo cuando el atraso pasa la
 * holgura: un tablero que se pone rojo por un punto de diferencia se deja de mirar en una semana.
 * Y el atraso se escribe al lado ademas de dibujarse, porque el color solo no es un canal.
 *
 * @param fila la fila ya medida por `filasDeSalud()`
 */
function FilaDeMancuerna ({ fila }: { fila: FilaDeSalud }) {
  const clase = claseDeSalud(fila)
  const desde = Math.min(fila.avance, fila.plazoConsumido ?? fila.avance)
  const hasta = Math.max(fila.avance, fila.plazoConsumido ?? fila.avance)

  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-texto min-w-0 truncate text-sm">{fila.nombre}</span>
        {/* Los DOS numeros, no solo la diferencia: «100 pts detrás» no dice contra que, y la
            mancuerna existe justo para que se vea el par. La diferencia se agrega cuando es mala,
            que es cuando hay que nombrarla. */}
        <span className="shrink-0 text-xs">
          <span data-numerico className="text-texto tabular-nums font-medium">
            {Math.round(fila.avance)}% hecho
          </span>
          {fila.plazoConsumido !== null && (
            <span data-numerico className="text-texto-tenue ml-2 tabular-nums">
              {Math.round(fila.plazoConsumido)}% del plazo
            </span>
          )}
          {clase === 'atrasado' && (
            <span className="text-texto-peligro ml-2 font-semibold">atrasado</span>
          )}
          {clase === 'sin_plazo' && <span className="text-texto-sutil ml-2">sin plazo</span>}
          {clase === 'entregado' && <span className="text-texto-exito ml-2">entregado</span>}
        </span>
      </div>

      {/* El riel es el eje 0-100. La altura del contenedor deja aire para los puntos, que sobresalen
          del riel a proposito: un punto del mismo alto que la linea no se distingue de ella. */}
      <div className="relative h-3">
        <span
          aria-hidden="true"
          className="bg-relleno-neutro absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
        />

        {fila.plazoConsumido !== null && (
          <span
            aria-hidden="true"
            className={cn(
              'absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full',
              clase === 'atrasado' ? 'bg-relleno-peligro' : 'bg-relleno-neutro'
            )}
            style={{ left: `${desde}%`, width: `${Math.max(0, hasta - desde)}%` }}
          />
        )}

        {fila.plazoConsumido !== null && (
          <Punto posicion={fila.plazoConsumido} className="bg-texto-sutil" />
        )}
        <Punto posicion={fila.avance} className="bg-acento" />
      </div>
    </li>
  )
}

/**
 * Un punto de la mancuerna, con su anillo del color de la superficie.
 *
 * El anillo no es decoracion: es lo que deja distinguir los dos puntos cuando caen encima —un
 * {espacio} que va exactamente al ritmo de su plazo— en vez de verse uno solo.
 *
 * @param posicion 0-100 sobre el eje
 * @param className el relleno del punto
 */
function Punto ({ posicion, className }: { posicion: number, className: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'border-superficie-elevada absolute top-1/2 size-2.5 rounded-full border-2',
        className
      )}
      style={{ left: `${posicion}%`, transform: 'translate(-50%, -50%)' }}
    />
  )
}

/**
 * Cuantos {espacios} hay en cada estado, como barras de un solo tono.
 *
 * Barras y no una torta ni una apilada de colores: lo que se compara son magnitudes, y para eso el
 * largo es el canal exacto mientras que el angulo no lo es. Todas del mismo tono porque la identidad
 * la lleva el rotulo de la izquierda; pintarlas de ocho colores gastaria el canal de identidad en
 * repetir lo que el largo ya dice.
 *
 * @param tramos lo que devolvio `tramosPorEstado()`
 * @param estados el desglose crudo, solo para el resumen accesible
 */
export function GraficoPorEstado (
  { tramos, estados }: { tramos: TramoApilado[], estados: readonly EstadoDelResumen[] }
) {
  const total = estados.reduce((suma, estado) => suma + Math.max(0, estado.total), 0)

  return (
    <Panel
      titulo={`${GLOSARIO.espacio.plural} por estado`}
      icono={<ChartNoAxesColumn size={14} aria-hidden="true" className="shrink-0" />}
    >
      {tramos.length === 0
        ? <SinDatos />
        : (
            <ul
              role="img"
              aria-label={
                `${total} ${GLOSARIO.espacio.plural.toLowerCase()}: `
                + tramos.map((tramo) => `${tramo.total} ${tramo.etiqueta}`).join(', ') + '.'
              }
              className="flex flex-col gap-2"
            >
              {tramos.map((tramo) => (
                <li key={tramo.clave} className="flex items-center gap-3">
                  <span className="text-texto-tenue w-24 shrink-0 truncate text-xs">
                    {tramo.etiqueta}
                  </span>
                  <span aria-hidden="true" className="bg-relleno-neutro relative h-2 min-w-0 flex-1 overflow-hidden rounded-full">
                    <span
                      className="bg-acento absolute inset-y-0 left-0 rounded-full"
                      style={{ width: `${tramo.fraccion * 100}%` }}
                    />
                  </span>
                  <span data-numerico className="text-texto w-6 shrink-0 text-right text-sm tabular-nums font-medium">
                    {tramo.total}
                  </span>
                </li>
              ))}
            </ul>
          )}
    </Panel>
  )
}

/**
 * Cuando caen las entregas comprometidas, sobre una linea de tiempo.
 *
 * Una lista de fechas obliga a restar mentalmente para saber que esta cerca; una linea lo muestra.
 * La ventana se calcula sobre los datos y siempre incluye HOY, que es la marca contra la que se lee
 * todo lo demas.
 *
 * Los vencidos van con palabra ademas de color: quien no distingue el rojo tiene que poder leerlo.
 *
 * @param linea lo que devolvio `lineaDeEntregas()`
 */
export function GraficoDeEntregas ({ linea }: { linea: LineaDeEntregas }) {
  const hoy = linea.hasta === linea.desde ? 0 : (0 - linea.desde) / (linea.hasta - linea.desde)

  return (
    <Panel
      titulo={`Cuándo se entrega`}
      icono={<CalendarClock size={14} aria-hidden="true" className="shrink-0" />}
      nota={
        linea.marcas.length === 0
          ? undefined
          : `La ventana va de ${rotularDias(linea.desde)} a ${rotularDias(linea.hasta)}.`
      }
    >
      {linea.marcas.length === 0
        ? <SinDatos />
        : (
            <div role="img" aria-label={resumenDeEntregas(linea)} className="flex flex-col gap-3">
              {/* El eje, con la marca de hoy. La rejilla va en el gris recesivo del sistema: una
                  linea de eje mas oscura que los datos compite con ellos. */}
              <div className="relative h-6">
                <span
                  aria-hidden="true"
                  className="border-grafico-rejilla absolute inset-x-0 top-1/2 -translate-y-1/2 border-t"
                />
                <span
                  aria-hidden="true"
                  className="bg-texto-sutil absolute top-1/2 h-3 w-px -translate-y-1/2"
                  style={{ left: `${hoy * 100}%` }}
                />
                {/* El rotulo se ancla al borde cuando HOY cae contra un extremo: centrado ahi,
                    la mitad del texto queda fuera de la caja. Es lo que pasa siempre que todas las
                    entregas estan vencidas, que es justo cuando mas hay que mirar el grafico. */}
                <span
                  className="text-texto-sutil absolute top-0 text-[10px] tracking-wide uppercase"
                  style={{ left: `${hoy * 100}%`, transform: anclaDelRotulo(hoy) }}
                >
                  hoy
                </span>

                {linea.marcas.map((marca) => (
                  <span
                    key={marca.id}
                    aria-hidden="true"
                    className={cn(
                      'border-superficie-elevada absolute top-1/2 size-2.5 rounded-full border-2',
                      marca.vencido ? 'bg-relleno-peligro' : 'bg-acento'
                    )}
                    style={{ left: `${marca.fraccion * 100}%`, transform: 'translate(-50%, -50%)' }}
                  />
                ))}
              </div>

              <ul className="flex flex-col gap-1.5">
                {linea.marcas.map((marca) => (
                  <li key={marca.id} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                    <span className="text-texto min-w-0">
                      {marca.nombre}
                      {marca.vencido && (
                        <span className="text-texto-peligro ml-2 text-xs font-semibold uppercase">
                          Vencido
                        </span>
                      )}
                      <span className="text-texto-tenue ml-2 text-xs">{marca.espacio}</span>
                    </span>
                    <span
                      data-numerico
                      className={cn(
                        'shrink-0 tabular-nums text-xs',
                        marca.vencido ? 'text-texto-peligro font-medium' : 'text-texto-tenue'
                      )}
                    >
                      {formatearVencimiento(marca.fecha)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
    </Panel>
  )
}

/**
 * Como se ancla un rotulo segun donde cae en el eje.
 *
 * Centrado en el medio, pegado al borde en los extremos. Sin esto, un rotulo en la posicion 0 o 100
 * se sale de la caja y el navegador lo recorta.
 *
 * @param fraccion 0-1 sobre el eje
 * @returns el `transform` que le corresponde
 */
export function anclaDelRotulo (fraccion: number): string {
  if (fraccion <= 0.06) return 'translateX(0)'
  if (fraccion >= 0.94) return 'translateX(-100%)'

  return 'translateX(-50%)'
}

/** Un extremo de la ventana de tiempo, dicho en palabras. */
function rotularDias (dias: number): string {
  if (dias === 0) return 'hoy'
  if (dias < 0) return `hace ${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'día' : 'días'}`

  return `en ${dias} ${dias === 1 ? 'día' : 'días'}`
}

/**
 * Cuanto lleva detenida cada {proceso}, de la mas vieja a la mas nueva.
 *
 * La escala es la traba mas vieja de la propia lista: lo que el cliente necesita es saber cual lleva
 * mas parada, no cuanto es «mucho» en abstracto.
 *
 * Usa ENFASIS y no colores por categoria: lo que depende del cliente va en el acento y el resto en
 * gris. Es lo unico accionable del grafico, y pintar las cuatro categorias de cuatro colores
 * enterraria justo esa distincion.
 *
 * @param barras lo que devolvio `barrasDeTrabas()`
 */
export function GraficoDeTrabas ({ barras }: { barras: BarraDeTraba[] }) {
  if (barras.length === 0) return null

  return (
    <Panel
      titulo="Hace cuánto está detenido"
      icono={<OctagonAlert size={14} aria-hidden="true" className="shrink-0" />}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Clave className="bg-acento">Depende de vos</Clave>
        <Clave className="bg-relleno-neutro">Depende de nosotros o de un tercero</Clave>
      </div>

      <ul role="img" aria-label={resumenDeTrabas(barras)} className="flex flex-col gap-2">
        {barras.map((barra) => (
          <li key={barra.id} className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate text-xs">
              <span className="text-texto">{barra.nombre}</span>
            </span>
            <span aria-hidden="true" className="relative h-2 min-w-0 flex-1">
              <span
                className={cn(
                  'absolute inset-y-0 left-0 rounded-full',
                  barra.deTuLado ? 'bg-acento' : 'bg-relleno-neutro'
                )}
                style={{ width: `${Math.max(2, barra.fraccion * 100)}%` }}
              />
            </span>
            <span data-numerico className="text-texto w-16 shrink-0 text-right text-xs tabular-nums">
              {barra.dias} {barra.dias === 1 ? 'día' : 'días'}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
