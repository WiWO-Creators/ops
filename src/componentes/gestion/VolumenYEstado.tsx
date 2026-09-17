import { Bloque } from '@/app/portal/(dentro)/detalle'
import { GLOSARIO } from '@/dominio/glosario'
import { formatearNumero } from '@/componentes/proyecto/ResumenProyecto'
import { Cifra, Nota } from './piezas'
import { distribucionDeAntiguedad, leerCubos } from '@/dominio/gestion'
import type { AbiertasAlCierre, TramoDeAntiguedad, VolumenGestion } from '@/datos/portal'

/**
 * Cuánto entró, cuánto salió y en qué quedó lo que sigue abierto.
 *
 * Los tres volúmenes salen de la tabla de {procesos} y son exactos siempre, aunque el histórico de
 * estados esté vacío: es lo que garantiza que el tablero nunca quede vacío del todo.
 *
 * Los cubos, en cambio, tienen una salvedad grande y visible: cuando el estado al cierre es
 * `estimado` —porque se dedujo del estado de hoy y no del histórico— los cuatro PUEDEN NO SUMAR el
 * total, y es correcto que no sumen. Una {proceso} que hoy figura Completo pero al cierre seguía
 * abierta no se puede clasificar en ningún cubo: se sabe que «Completo» es falso para ese mes, no
 * cuál era el verdadero. Empujarla a Producción para que la suma cuadre sería inventar el único dato
 * que falta. Por eso acá se rotula el resto como «sin clasificar» en vez de esconderlo.
 */
export function VolumenYEstado ({
  volumen,
  abiertas,
  antiguedad
}: {
  volumen: VolumenGestion
  abiertas: AbiertasAlCierre
  antiguedad: TramoDeAntiguedad[]
}) {
  const cubos = leerCubos(abiertas, volumen.abiertas_al_cierre)

  return (
    <Bloque titulo="Volumen y estado del trabajo">
      <div className="flex flex-col gap-6">
        <div className="grid gap-5 sm:grid-cols-3">
          <Cifra etiqueta="Recibidas" valor={formatearNumero(volumen.recibidas)} detalle="Entraron en el mes" />
          <Cifra etiqueta="Cerradas" valor={formatearNumero(volumen.cerradas)} detalle="Se terminaron en el mes" />
          <Cifra
            etiqueta="Abiertas al cierre"
            valor={formatearNumero(volumen.abiertas_al_cierre)}
            detalle="Seguían vivas el último día"
          />
        </div>

        <EstadoAlCierre cubos={cubos} />
        <Antiguedad tramos={antiguedad} />
      </div>
    </Bloque>
  )
}

/** Los cuatro cubos, con la advertencia de si suman o no. */
function EstadoAlCierre ({ cubos }: { cubos: ReturnType<typeof leerCubos> }) {
  return (
    <section aria-label="Estado de lo que quedó abierto">
      <h3 className="text-texto text-sm font-semibold">En qué etapa quedó lo abierto</h3>

      <dl className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
        {cubos.cubos.map((cubo) => (
          <div key={cubo.clave}>
            <dt className="text-texto-sutil text-xs tracking-wide uppercase">{cubo.rotulo}</dt>
            <dd data-numerico className="text-texto text-xl font-semibold tabular-nums">{cubo.total}</dd>
          </div>
        ))}

        {cubos.sin_clasificar > 0 && (
          <div>
            <dt className="text-texto-aviso text-xs tracking-wide uppercase">Sin clasificar</dt>
            <dd data-numerico className="text-texto-aviso text-xl font-semibold tabular-nums">
              {cubos.sin_clasificar}
            </dd>
          </div>
        )}
      </dl>

      <p className="text-texto-tenue mt-3 text-xs">
        Además, <span className="text-texto font-semibold tabular-nums">{cubos.bloqueadas}</span>{' '}
        estaban bloqueadas. No es una quinta etapa: una {GLOSARIO.proceso.singular.toLowerCase()} bloqueada sigue teniendo su etapa y
        ya está contada arriba, así que estos cinco números no se apilan ni suman el total.
      </p>

      <div className="mt-3">
        {cubos.estimado
          ? (
            <Nota tono="aviso">
              El estado al cierre de este mes está <strong>estimado</strong>: se dedujo del estado de
              hoy, porque todavía no guardábamos el historial de cambios. Por eso las etapas suman{' '}
              {cubos.suma} y no {cubos.total}: de {cubos.sin_clasificar} sabemos que seguían abiertas,
              pero no en qué etapa estaban. No las repartimos para que la cuenta cierre.
            </Nota>
            )
          : (
            <Nota>
              El estado al cierre sale del historial de cambios: es el que cada {GLOSARIO.proceso.singular.toLowerCase()} tenía el
              último día del mes, no el de hoy.
            </Nota>
            )}
      </div>
    </section>
  )
}

/**
 * La distribución de antigüedad de lo que quedó abierto.
 *
 * Es el único gráfico del tablero y se dibuja con CSS, igual que el de horas del panel: son cinco
 * barras y ninguna interacción, así que una librería costaría más de lo que resuelve.
 *
 * Un solo color para las cinco: los tramos están ORDENADOS y la magnitud ya está en el largo de la
 * barra. Pintar cada tramo de un color distinto sería un arcoíris que codifica dos veces lo mismo y
 * sugiere cinco categorías independientes donde hay una sola escala. Los cinco tramos viajan siempre
 * —también los vacíos— para que la forma del gráfico no cambie según el mes.
 */
function Antiguedad ({ tramos }: { tramos: TramoDeAntiguedad[] }) {
  const { barras, total } = distribucionDeAntiguedad(tramos)

  return (
    <section aria-label="Antigüedad de lo que quedó abierto">
      <h3 className="text-texto text-sm font-semibold">Hace cuánto están abiertas</h3>

      {total === 0
        ? (
          <p className="text-texto-tenue mt-2 text-xs">
            No quedó nada abierto al cierre del mes.
          </p>
          )
        : (
          <ul
            className="mt-3 flex flex-col gap-2"
            role="img"
            aria-label={
              `Antigüedad de ${total} abiertas: `
              + barras.map((b) => `${b.etiqueta}, ${b.total}`).join('; ')
            }
          >
            {barras.map((barra) => (
              <li key={barra.rango} className="grid grid-cols-[6rem_minmax(0,28rem)_2.5rem] items-center gap-3">
                <span className="text-texto-tenue text-xs tabular-nums">{barra.etiqueta}</span>
                <span className="bg-superficie-hundida block h-2 w-full overflow-hidden rounded-full">
                  <span
                    className="bg-grafico-1 block h-full rounded-full"
                    style={{ width: `${barra.porcentaje}%` }}
                  />
                </span>
                <span data-numerico className="text-texto text-right text-sm font-semibold tabular-nums">
                  {barra.total}
                </span>
              </li>
            ))}
          </ul>
          )}
    </section>
  )
}
