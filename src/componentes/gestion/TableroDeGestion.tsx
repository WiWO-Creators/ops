import { GLOSARIO } from '@/dominio/glosario'
import { formatearFecha } from '@/lib/fechas'
import { Cambios } from './Cambios'
import { CalidadYRetrabajo } from './CalidadYRetrabajo'
import { Estancadas } from './Estancadas'
import { Etapas } from './Etapas'
import { Plazos } from './Plazos'
import { PorEspacio } from './PorEspacio'
import { SelectorDeMes } from './SelectorDeMes'
import { Tendencia } from './Tendencia'
import { Tiempos } from './Tiempos'
import { Trabas } from './Trabas'
import { VolumenYEstado } from './VolumenYEstado'
import { rotularMes } from '@/dominio/gestion'
import type { TableroGestion as Tablero } from '@/datos/portal'

/**
 * El tablero de control de gestión mensual, entero.
 *
 * === El orden de los bloques es la decisión de diseño ===
 *
 * Va de lo accionable a lo informativo, y no al revés. Un tablero que abre con volúmenes y cierra
 * con las trabas se mira una vez por mes y no cambia nada; uno que abre con la lista de decisiones
 * pendientes sale de la reunión con tareas asignadas. Por eso:
 *
 *   1. trabas y sin movimiento — lo único sobre lo que se puede actuar hoy;
 *   2. tendencia — el marco con el que se leen todas las cifras que siguen;
 *   3. cumplimiento de plazos — «qué se cumple y qué no», la pregunta literal del cliente;
 *   4. volumen y estado — el contexto que hace legibles los dos anteriores;
 *   5. tiempos de respuesta — los dos lados juntos, incluida la espera que corre de su lado;
 *   6. calidad y retrabajo, con el desglose de por qué se rehace el trabajo;
 *   7. tiempos por etapa — hoy sin datos, y lo dice;
 *   8. cambios — la estimación de lo no planificado y los movimientos medidos sobre lo acordado;
 *   9. por {espacio} — el cierre, y sólo si hay más de uno.
 *
 * La tendencia va SEGUNDA y no al final: es lo que permite leer el resto. «68% en plazo» no es
 * bueno ni malo hasta que se sabe si el mes pasado fue 55% o 82%, y una serie puesta abajo del todo
 * se mira cuando ya se sacaron las conclusiones. Va después de las dos listas accionables porque no
 * cambia lo que hay que destrabar hoy.
 *
 * === Por qué no comparte tipo con el tablero de indicadores del panel ===
 *
 * Porque no son lo mismo. Aquel compara dos fotos diarias de contadores del equipo; éste son
 * medianas por etapa de un mes del cliente. Un tipo común uniría dos cosas que no lo son, y el
 * primer campo que una de las dos necesitara rompería a la otra.
 */
export function TableroDeGestion (
  { tablero, meses, espacioId }: { tablero: Tablero, meses: string[], espacioId?: string }
) {
  const { alcance } = tablero

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-texto text-xl font-semibold">Control de gestión</h1>
          <p className="text-texto-tenue mt-0.5 text-sm">
            {rotularMes(alcance.mes)} · {formatearFecha(alcance.desde)} al {formatearFecha(alcance.hasta)}
          </p>
          <p className="text-texto-sutil mt-0.5 text-xs">
            {alcance.cerrado
              ? 'Mes cerrado: estos números ya no se mueven.'
              : `Mes en curso: medido hasta el ${formatearFecha(alcance.medido_hasta)}, así que todavía puede cambiar.`}
            {' '}
            {alcance.espacios.length === 1
              ? `${GLOSARIO.espacio.singular}: ${alcance.espacios[0]?.name ?? ''}`
              : `${alcance.espacios.length} ${GLOSARIO.espacio.plural.toLowerCase()}: ${alcance.espacios.map((e) => e.name).join(', ')}`}
          </p>
        </div>

        <SelectorDeMes mes={alcance.mes} meses={meses} espacioId={espacioId} />
      </header>

      <Trabas trabas={tablero.trabas} />
      <Estancadas estancadas={tablero.estancadas} />
      <Tendencia tendencia={tablero.tendencia} />
      <Plazos plazos={tablero.plazos} vencidas={tablero.vencidas} />
      <VolumenYEstado
        volumen={tablero.volumen}
        abiertas={tablero.abiertas_al_cierre}
        antiguedad={tablero.antiguedad_abiertas}
      />
      <Tiempos tiempos={tablero.tiempos} deuda={tablero.deuda_de_aprobacion} />
      <CalidadYRetrabajo calidad={tablero.calidad} porHito={tablero.por_hito} />
      <Etapas etapas={tablero.etapas} />
      <Cambios cambios={tablero.cambios} />
      <PorEspacio espacios={tablero.por_espacio} />
    </div>
  )
}
