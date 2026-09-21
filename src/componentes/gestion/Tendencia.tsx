import { Bloque } from '@/app/portal/(dentro)/detalle'
import { formatearNumero } from '@/componentes/proyecto/ResumenProyecto'
import { Cifra, Nota, SinDatoAun } from './piezas'
import { SIN_DATO, formatearDias, formatearPorcentaje } from '@/dominio/gestion'
import {
  MOTIVO_SIN_SERIE,
  altoDeBarra,
  avisoDeMesParcial,
  leerTendencia,
  marcasDeIndicador,
  serieDeIndicador,
  tramosDeIndicador,
  type MesDeTendencia,
  type SerieDeIndicador
} from './lectura'
import type { PuntoDeTendencia } from '@/datos/portal'

/**
 * Los últimos seis meses, para que la foto del mes se pueda leer contra algo.
 *
 * === Por qué existe el bloque ===
 *
 * El resto del tablero es una FOTO, y una foto no se puede evaluar: «68% en plazo» no es bueno ni
 * malo hasta que se sabe si el mes pasado fue 55% o 82%. Éste es el único bloque que convierte el
 * tablero en una conversación sobre la dirección en vez de sobre el número del mes.
 *
 * === Por qué son cuatro gráficos y no uno ===
 *
 * Porque los cuatro indicadores están en cuatro unidades distintas —{procesos}, por ciento, rondas
 * y días—. Superponerlos obligaría a dos escalas verticales en el mismo dibujo, y dos escalas se
 * alinean de forma arbitraria: el gráfico inventa una correlación que no está en los datos. Cuatro
 * paneles chicos, cada uno con su eje, dicen lo mismo sin mentir.
 *
 * El volumen sí lleva dos series en el mismo panel —entradas y cierres— porque están en la MISMA
 * unidad y la comparación entre las dos es justamente el dato: si entra más de lo que sale, la cola
 * crece. Los colores salen de la escala `--color-grafico-*` del sistema, en su orden de uso.
 *
 * === Las dos reglas que gobiernan el dibujo ===
 *
 *   - un mes sin dato es un HUECO: la línea se corta, no baja a cero, y el mes se nombra debajo;
 *   - el mes en curso va rayado y punteado, y con su advertencia escrita: está cortado en hoy.
 *
 * La tabla de abajo no es un extra: es la versión legible de los cuatro gráficos para quien no
 * distingue los colores, para quien lee con lector de pantalla y para quien quiere el número exacto
 * en vez de la forma de la curva.
 */
export function Tendencia ({ tendencia }: { tendencia: PuntoDeTendencia[] }) {
  const lectura = leerTendencia(tendencia)

  if (lectura.clase === 'sin_serie') {
    return (
      <Bloque titulo="Cómo viene la tendencia">
        <SinDatoAun titulo="Todavía no hay meses anteriores" motivo={MOTIVO_SIN_SERIE} />
      </Bloque>
    )
  }

  const { meses, maximoVolumen, parciales } = lectura
  const aviso = avisoDeMesParcial(parciales)

  const enPlazo = serieDeIndicador(meses, 'porcentaje_en_plazo', 100)
  const rondas = serieDeIndicador(meses, 'rondas_promedio')
  const deuda = serieDeIndicador(meses, 'deuda_dias')

  return (
    <Bloque titulo="Cómo viene la tendencia">
      <div className="flex flex-col gap-6">
        <Volumen meses={meses} maximo={maximoVolumen} />

        <div className="grid gap-6 sm:grid-cols-3">
          <Indicador
            serie={enPlazo}
            titulo="Cumplimiento de plazos"
            formatear={formatearPorcentaje}
            que="no hubo nada comprometido"
          />
          <Indicador
            serie={rondas}
            titulo="Rondas por aprobación"
            formatear={(valor) => formatearNumero(valor)}
            que="no hubo aprobaciones resueltas"
          />
          <Indicador
            serie={deuda}
            titulo="Días esperando respuesta"
            formatear={formatearDias}
            que="no hubo nada esperando respuesta"
          />
        </div>

        {aviso !== null && <Nota tono="aviso">{aviso}</Nota>}

        <Nota>
          Un mes sin dato deja un hueco en la línea y se nombra debajo del gráfico: no vale cero. Un
          mes sin nada comprometido no es un mes con 0% de cumplimiento, y un mes sin aprobaciones no
          es un mes de retrabajo infinito.
        </Nota>

        <TablaDeTendencia meses={meses} />
      </div>
    </Bloque>
  )
}

/**
 * Cómo se pinta una marca de la serie.
 *
 * El mes cortado va RAYADO y no de otro color: un color distinto lo convertiría en una tercera
 * serie, y lo que se quiere decir es que es el mismo dato medido sobre menos días.
 *
 * @param color la variable de color de la escala de gráficos
 * @param parcial si el mes está cortado en hoy
 * @returns el estilo de fondo de la barra
 */
function pintura (color: string, parcial: boolean): React.CSSProperties {
  return parcial
    ? { backgroundImage: `repeating-linear-gradient(135deg, ${color} 0 3px, transparent 3px 6px)` }
    : { backgroundColor: color }
}

/** Los dos colores del panel de volumen, en el orden de uso de la escala del sistema. */
const COLOR_RECIBIDAS = 'var(--color-grafico-1)'
const COLOR_CERRADAS = 'var(--color-grafico-4)'

/**
 * Entradas y cierres, mes a mes.
 *
 * Dos series en la misma unidad y en el mismo eje: la comparación es el dato. Las barras del mismo
 * mes se separan con dos píxeles de superficie en vez de con un borde, que es lo que mantiene la
 * forma del dato limpia a cualquier tamaño.
 *
 * @param meses la serie ya ordenada
 * @param maximo el tope del eje, compartido por las dos series
 */
function Volumen ({ meses, maximo }: { meses: MesDeTendencia[], maximo: number }) {
  const ultimo = meses.at(-1)

  return (
    <section aria-label="Entradas y cierres por mes">
      <h3 className="text-texto text-sm font-semibold">Entradas y cierres</h3>

      <div
        role="img"
        aria-label={resumenDeVolumen(meses)}
        className="mt-3 flex h-28 items-end gap-2"
      >
        {meses.map((mes) => (
          <div key={mes.mes} className="flex h-full min-w-0 flex-1 items-end justify-center gap-[2px]">
            <span
              className="w-2/5 rounded-t-[4px]"
              style={{ height: `${altoDeBarra(mes.recibidas, maximo)}%`, ...pintura(COLOR_RECIBIDAS, mes.parcial) }}
            />
            <span
              className="w-2/5 rounded-t-[4px]"
              style={{ height: `${altoDeBarra(mes.cerradas, maximo)}%`, ...pintura(COLOR_CERRADAS, mes.parcial) }}
            />
          </div>
        ))}
      </div>

      <div className="border-grafico-rejilla flex gap-2 border-t pt-1">
        {meses.map((mes) => (
          <span key={mes.mes} className="text-texto-sutil min-w-0 flex-1 text-center text-[0.625rem]">
            {mes.rotulo}
            {mes.parcial && <span className="block">parcial</span>}
          </span>
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
        <LeyendaDeSerie color={COLOR_RECIBIDAS} nombre="Recibidas" ultimo={ultimo?.recibidas} rotulo={ultimo?.rotulo} />
        <LeyendaDeSerie color={COLOR_CERRADAS} nombre="Cerradas" ultimo={ultimo?.cerradas} rotulo={ultimo?.rotulo} />
      </ul>
    </section>
  )
}

/**
 * Una serie del panel de volumen, con el valor del último mes escrito al lado.
 *
 * La leyenda lleva el número del final de la serie a propósito: es la única etiqueta directa del
 * gráfico. Un número sobre cada barra son doce cifras que nadie lee.
 */
function LeyendaDeSerie (
  { color, nombre, ultimo, rotulo }:
  { color: string, nombre: string, ultimo?: number, rotulo?: string }
) {
  return (
    <li className="text-texto-tenue flex items-center gap-2 text-xs">
      <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
      {nombre}
      {ultimo !== undefined && rotulo !== undefined && (
        <span className="text-texto font-semibold tabular-nums">{ultimo} en {rotulo}</span>
      )}
    </li>
  )
}

/** Lo que oye quien no ve el gráfico de volumen: la serie entera, en una frase. */
function resumenDeVolumen (meses: MesDeTendencia[]): string {
  const detalle = meses
    .map((mes) => `${mes.rotulo}: ${mes.recibidas} recibidas y ${mes.cerradas} cerradas`)
    .join('; ')

  return `Entradas y cierres de los últimos ${meses.length} meses. ${detalle}.`
}

/** El color único de los tres indicadores: una sola serie por panel no necesita identificarse. */
const COLOR_INDICADOR = 'var(--color-grafico-1)'

/**
 * Un indicador de la serie, con sus huecos a la vista.
 *
 * La línea SÓLO une meses adyacentes que los dos tengan dato. El tramo que toca el mes cortado va
 * punteado, y su marca va hueca: las dos cosas dicen «esto todavía se está midiendo».
 *
 * @param serie el indicador ya armado por `serieDeIndicador()`
 * @param titulo qué se está midiendo
 * @param formatear cómo se escribe el valor, con su unidad
 * @param que por qué esos meses no tienen dato, en una oración sin sujeto ni punto
 */
function Indicador ({
  serie,
  titulo,
  formatear,
  que
}: {
  serie: SerieDeIndicador
  titulo: string
  formatear: (valor: number | null) => string
  que: string
}) {
  if (serie.conDato === 0) {
    return (
      <section aria-label={titulo} className="flex flex-col gap-2">
        <Cifra etiqueta={titulo} valor={SIN_DATO} detalle="Ningún mes de la serie tiene dato" />
        <p className="text-texto-sutil max-w-prose text-xs">
          En ninguno de los meses de la serie {que}: no hay línea que dibujar, y una en cero diría
          algo que no medimos.
        </p>
      </section>
    )
  }

  const tramos = tramosDeIndicador(serie)
  const marcas = marcasDeIndicador(serie)

  return (
    <section aria-label={titulo} className="flex flex-col gap-2">
      <Cifra
        etiqueta={titulo}
        valor={formatear(serie.ultimo?.valor ?? null)}
        detalle={
          serie.ultimo === null
            ? undefined
            : `${serie.ultimo.rotulo}, ${
              serie.ultimo.parcial ? 'el mes en curso y todavía a medias' : 'el último con dato'
            }`
        }
      />

      <div className="px-1.5" role="img" aria-label={resumenDeIndicador(serie, titulo, formatear)}>
        <div className="relative h-16">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="absolute inset-0 size-full"
          >
            {tramos.map((tramo) => (
              <line
                key={`${tramo.x1}-${tramo.x2}`}
                x1={tramo.x1}
                y1={100 - tramo.y1}
                x2={tramo.x2}
                y2={100 - tramo.y2}
                stroke={COLOR_INDICADOR}
                strokeWidth={2}
                strokeLinecap="round"
                strokeDasharray={tramo.parcial ? '4 3' : undefined}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          {marcas.map((marca) => (
            <span
              key={marca.mes}
              className={marca.parcial ? 'border-superficie-elevada absolute size-2.5 rounded-full border-2' : 'absolute size-2 rounded-full'}
              style={{
                left: `${marca.x}%`,
                bottom: `${marca.y}%`,
                transform: 'translate(-50%, 50%)',
                backgroundColor: COLOR_INDICADOR
              }}
            />
          ))}

          <span aria-hidden="true" className="border-grafico-rejilla absolute inset-x-0 bottom-0 border-b" />
        </div>
      </div>

      <div className="flex gap-1">
        {serie.puntos.map((punto) => (
          <span key={punto.mes} className="text-texto-sutil min-w-0 flex-1 truncate text-center text-[0.625rem]">
            {punto.rotulo}
          </span>
        ))}
      </div>

      {serie.sinDato.length > 0 && (
        <p className="text-texto-sutil max-w-prose text-xs">
          Sin dato en {serie.sinDato.join(', ')}: {que}. Un mes así no vale cero.
        </p>
      )}
    </section>
  )
}

/** Lo que oye quien no ve un indicador: cada mes con su valor, y los meses sin dato dichos así. */
function resumenDeIndicador (
  serie: SerieDeIndicador,
  titulo: string,
  formatear: (valor: number | null) => string
): string {
  const detalle = serie.puntos
    .map((punto) => `${punto.rotulo}: ${punto.valor === null ? 'sin dato' : formatear(punto.valor)}`)
    .join('; ')

  return `${titulo}, mes a mes. ${detalle}.`
}

/**
 * La serie entera en números.
 *
 * No es un apéndice del gráfico: es el mismo dato en la forma que se puede leer sin distinguir
 * colores, copiar a un correo y discutir cifra por cifra en la reunión. El guion largo ocupa el
 * lugar de cada mes sin dato, que es lo que impide que un hueco se lea como un cero.
 */
function TablaDeTendencia ({ meses }: { meses: MesDeTendencia[] }) {
  return (
    <section aria-label="La tendencia en números">
      <h3 className="text-texto text-sm font-semibold">Mes a mes, en números</h3>

      <div data-lenis-prevent className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr className="border-linea border-b">
              <th scope="col" className="text-texto-tenue px-2 py-2 text-left text-xs font-medium">Mes</th>
              <th scope="col" className="text-texto-tenue px-2 py-2 text-right text-xs font-medium">Recibidas</th>
              <th scope="col" className="text-texto-tenue px-2 py-2 text-right text-xs font-medium">Cerradas</th>
              <th scope="col" className="text-texto-tenue px-2 py-2 text-right text-xs font-medium">En plazo</th>
              <th scope="col" className="text-texto-tenue px-2 py-2 text-right text-xs font-medium">Rondas</th>
              <th scope="col" className="text-texto-tenue px-2 py-2 text-right text-xs font-medium">Espera</th>
            </tr>
          </thead>
          <tbody>
            {meses.map((mes) => (
              <tr key={mes.mes} className="border-linea-suave border-b last:border-b-0">
                <th scope="row" className="text-texto px-2 py-2 text-left font-normal">
                  {mes.rotulo}
                  {mes.parcial && <span className="text-texto-aviso ml-1 text-xs">parcial</span>}
                </th>
                <td className="text-texto-tenue px-2 py-2 text-right tabular-nums">{mes.recibidas}</td>
                <td className="text-texto-tenue px-2 py-2 text-right tabular-nums">{mes.cerradas}</td>
                <td className="text-texto px-2 py-2 text-right tabular-nums">
                  {formatearPorcentaje(mes.porcentaje_en_plazo)}
                </td>
                <td className="text-texto-tenue px-2 py-2 text-right tabular-nums">
                  {formatearNumero(mes.rondas_promedio)}
                </td>
                <td className="text-texto-tenue px-2 py-2 text-right tabular-nums">
                  {formatearDias(mes.deuda_dias)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
