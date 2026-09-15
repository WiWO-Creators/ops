import type { ReactNode } from 'react'
import { GLOSARIO } from '@/dominio/glosario'
import type { ContadoresDePortada } from '@/datos/pantalla-area'

/**
 * La portada: el nombre del area y tres cifras.
 *
 * Es la escena ancla y la unica que nunca sale del guion, aunque no haya absolutamente nada que
 * contar. Un area dormida mostrando su nombre y la hora es digna; una pantalla en blanco es un
 * producto roto.
 *
 * Tres cifras y no seis: a cuatro metros, una fila de numeros grandes se lee de un vistazo y una
 * grilla de seis obliga a acercarse, que es justo lo que una pantalla de pared no puede pedir.
 */
export function EscenaPortada ({ area, contadores }: {
  area: string
  contadores: ContadoresDePortada
}): ReactNode {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[5vmin] text-center">
      <p className="text-texto text-[9vmin] leading-none font-bold">{area}</p>

      <dl className="flex flex-wrap items-start justify-center gap-[8vmin]">
        <Cifra valor={contadores.jornadas_abiertas} etiqueta="en jornada" />
        <Cifra valor={contadores.cronometros_corriendo} etiqueta="midiendo" />
        <Cifra
          valor={contadores.procesos_atrasados}
          etiqueta={`${GLOSARIO.proceso.plural.toLowerCase()} atrasadas`}
          alarma={contadores.procesos_atrasados > 0}
        />
      </dl>
    </div>
  )
}

function Cifra ({ valor, etiqueta, alarma = false }: {
  valor: number
  etiqueta: string
  alarma?: boolean
}): ReactNode {
  return (
    <div className="flex flex-col items-center gap-[0.5vmin]">
      <dd
        className={[
          'text-[12vmin] leading-none font-bold tabular-nums',
          alarma ? 'text-texto-peligro' : 'text-acento'
        ].join(' ')}
      >
        {valor}
      </dd>
      <dt className="text-texto-tenue text-[3vmin]">{etiqueta}</dt>
    </div>
  )
}
