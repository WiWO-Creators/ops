import { Bloque } from '@/app/portal/(dentro)/detalle'
import { GLOSARIO } from '@/dominio/glosario'
import { BarraProgreso } from '@/componentes/proyecto/CabeceraProyecto'
import { formatearNumero } from '@/componentes/proyecto/ResumenProyecto'
import { Cifra, Nota, SinDatoAun } from './piezas'
import { SIN_DATO, formatearPorcentaje, tonoDePorcentaje } from '@/dominio/gestion'
import {
  MOTIVO_SIN_MOTIVOS,
  leerMotivosDeRetrabajo,
  type LecturaDeRetrabajo
} from './lectura'
import type { CalidadGestion, HitoGestion, MotivosDeRetrabajo } from '@/datos/portal'

/**
 * Cuánto salió bien a la primera, y cómo se reparte por {hito}.
 *
 * `porcentaje_primera_ronda` y `rondas_promedio` llegan en `null` cuando el mes no tuvo ninguna
 * aprobación resuelta. Es el caso donde el cero es más caro de todo el tablero: «0% a la primera» se
 * lee como un mes entero de retrabajo, y lo que pasó es que no hubo nada que aprobar.
 *
 * El desglose por motivo es lo que convierte este bloque en un argumento en vez de en un reproche.
 * «2,3 rondas» no se puede discutir: no dice si el trabajo se rehizo porque nos equivocamos, porque
 * al cliente le gustó otra cosa, o porque apareció alcance que no estaba pedido. Separar esas tres
 * cosas es justo lo que hoy se discute de memoria en las reuniones.
 */
export function CalidadYRetrabajo (
  { calidad, porHito }: { calidad: CalidadGestion, porHito: HitoGestion[] }
) {
  const sinAprobaciones = calidad.resueltas === 0

  return (
    <Bloque titulo="Calidad y retrabajo">
      <div className="flex flex-col gap-6">
        <div className="grid gap-5 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Cifra
              etiqueta="Aprobado a la primera"
              valor={formatearPorcentaje(calidad.porcentaje_primera_ronda)}
              tono={tonoDePorcentaje(calidad.porcentaje_primera_ronda)}
              detalle={
                sinAprobaciones
                  ? 'Todavía no hay datos'
                  : `${calidad.aprobadas_primera_ronda} de ${calidad.resueltas} aprobaciones`
              }
            />
            {calidad.porcentaje_primera_ronda !== null && (
              <BarraProgreso porcentaje={calidad.porcentaje_primera_ronda} />
            )}
          </div>

          <Cifra
            etiqueta="Aprobaciones resueltas"
            valor={formatearNumero(calidad.resueltas)}
            detalle="Se cerraron en el mes"
          />

          <Cifra
            etiqueta="Rondas por aprobación"
            valor={calidad.rondas_promedio === null ? SIN_DATO : formatearNumero(calidad.rondas_promedio)}
            detalle={sinAprobaciones ? 'Todavía no hay datos' : 'Promedio de idas y vueltas'}
          />
        </div>

        {sinAprobaciones && (
          <Nota tono="aviso">
            Este mes no se resolvió ninguna aprobación, así que no hay porcentaje ni promedio que
            calcular. No es 0%: es que no hubo aprobaciones.
          </Nota>
        )}

        <DesgloseDeRetrabajo motivos={calidad.motivos} />

        <PorHito hitos={porHito} />
      </div>
    </Bloque>
  )
}

/**
 * Por qué se rehízo el trabajo del mes.
 *
 * Es una lista de barras de UN solo color y no tres colores: las tres categorías no compiten por
 * identidad, se comparan por tamaño, y darle un color propio a cada una gastaría el único canal
 * libre del gráfico en repetir lo que el largo de la barra ya dice.
 *
 * `sin_motivo` no es una cuarta categoría y por eso no lleva barra: son las iteraciones que todavía
 * nadie clasificó. Va escrito al lado del total para que el desglose se pueda auditar —«de 40, 12
 * sin clasificar»— en vez de presentar tres números que no suman y que nadie puede cuadrar.
 *
 * @param motivos el bloque `calidad.motivos`, que puede no venir
 */
function DesgloseDeRetrabajo ({ motivos }: { motivos: MotivosDeRetrabajo | null }) {
  const lectura = leerMotivosDeRetrabajo(motivos)

  return (
    <section aria-label="Por qué se rehízo el trabajo">
      <h3 className="text-texto text-sm font-semibold">Por qué se rehizo trabajo</h3>

      <div className="mt-2">
        <CuerpoDelRetrabajo lectura={lectura} />
      </div>
    </section>
  )
}

/** Las tres caras del desglose: sin registro, sin retrabajo, y el desglose propiamente dicho. */
function CuerpoDelRetrabajo ({ lectura }: { lectura: LecturaDeRetrabajo }) {
  if (lectura.clase === 'sin_registro') {
    return <SinDatoAun titulo="Todavía no clasificamos el retrabajo" motivo={MOTIVO_SIN_MOTIVOS} />
  }

  if (lectura.clase === 'sin_retrabajo') {
    return (
      <Nota>
        Este mes no se registró ninguna vuelta de trabajo rehecho. Es un dato medido, no un hueco:
        la clasificación está activa y no hubo iteraciones que clasificar.
      </Nota>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {lectura.filas.map((fila) => (
          <li key={fila.clave} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-texto text-sm">{fila.rotulo}</span>
              <span data-numerico className="text-texto text-sm font-semibold tabular-nums">
                {fila.total} · {formatearPorcentaje(fila.porcentaje)}
              </span>
            </div>

            <span aria-hidden="true" className="bg-relleno-neutro block h-2 w-full overflow-hidden rounded-full">
              <span
                className="block h-full rounded-full"
                style={{ width: `${fila.porcentaje}%`, backgroundColor: 'var(--color-grafico-1)' }}
              />
            </span>

            <span className="text-texto-sutil text-xs">{fila.detalle}</span>
          </li>
        ))}
      </ul>

      <Nota tono={lectura.sinMotivo > 0 ? 'aviso' : 'neutro'}>
        {lectura.sinMotivo > 0
          ? `De ${lectura.total} vueltas de retrabajo, ${lectura.sinMotivo} están sin clasificar, `
            + 'así que los tres porcentajes de arriba no suman 100. Las contamos igual: esconderlas '
            + 'haría que el desglose pareciera completo.'
          : `Las ${lectura.total} vueltas de retrabajo del mes están clasificadas.`}
        {!lectura.cuadra && ' El total declarado no coincide con la suma del desglose: mostramos los dos.'}
      </Nota>
    </div>
  )
}

/**
 * El cumplimiento repartido por {hito}.
 *
 * Es una tabla y no cinco tarjetas: son conteos comparables entre filas, y una tabla es la forma en
 * la que se comparan columnas de números sin que nadie tenga que saltar de caja en caja. Va en su
 * propio desplazador horizontal para que el cuerpo de la página nunca scrollee en horizontal.
 */
function PorHito ({ hitos }: { hitos: HitoGestion[] }) {
  if (hitos.length === 0) return null

  return (
    <section aria-label={`Cumplimiento por ${GLOSARIO.hito.singular}`}>
      <h3 className="text-texto text-sm font-semibold">Por {GLOSARIO.hito.singular}</h3>

      <div data-lenis-prevent className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[30rem] border-collapse text-sm">
          <thead>
            <tr className="border-linea border-b">
              <th scope="col" className="text-texto-tenue px-2 py-2 text-left text-xs font-medium">
                {GLOSARIO.hito.singular}
              </th>
              <th scope="col" className="text-texto-tenue px-2 py-2 text-right text-xs font-medium">
                Comprometidas
              </th>
              <th scope="col" className="text-texto-tenue px-2 py-2 text-right text-xs font-medium">
                En plazo
              </th>
              <th scope="col" className="text-texto-tenue px-2 py-2 text-right text-xs font-medium">
                Cerradas
              </th>
              <th scope="col" className="text-texto-tenue px-2 py-2 text-right text-xs font-medium">
                Abiertas al cierre
              </th>
            </tr>
          </thead>
          <tbody>
            {hitos.map((hito) => (
              <tr key={hito.id ?? 'sin-hito'} className="border-linea-suave border-b last:border-b-0">
                <th scope="row" className="text-texto px-2 py-2 text-left font-normal">
                  {hito.name ?? `Sin ${GLOSARIO.hito.singular}`}
                </th>
                <td className="text-texto-tenue px-2 py-2 text-right tabular-nums">{hito.comprometidas}</td>
                <td className="text-texto px-2 py-2 text-right font-semibold tabular-nums">{hito.en_plazo}</td>
                <td className="text-texto-tenue px-2 py-2 text-right tabular-nums">{hito.cerradas}</td>
                <td className="text-texto-tenue px-2 py-2 text-right tabular-nums">{hito.abiertas_al_cierre}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3">
        <Nota>
          La fila sin {GLOSARIO.hito.singular} agrupa lo que no cuelga de ninguno. No lleva porcentaje
          propio: con dos o tres {GLOSARIO.proceso.plural.toLowerCase()} por fila, un porcentaje salta
          de 0 a 100 con un solo caso y se lee como una tendencia.
        </Nota>
      </div>
    </section>
  )
}
