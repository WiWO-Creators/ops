import type { ReactNode } from 'react'
import { GLOSARIO } from '@/dominio/glosario'
import { ANCHO_MAYUSCULA_EM, ANCHO_SOBRIO_EM, cupoDeFichas } from '@/dominio/solari'
import type { ContadoresDePortada } from '@/datos/pantalla-area'
import { Ficha, TOPE_SUELTO } from './piezas'

/**
 * La portada: el nombre del area y tres cifras.
 *
 * Es la escena ancla y la unica que nunca sale del guion, aunque no haya absolutamente nada que
 * contar. Un area dormida mostrando su nombre y la hora es digna; una pantalla en blanco es un
 * producto roto.
 *
 * Tres cifras y no seis: a cuatro metros, una fila de numeros grandes se lee de un vistazo y una
 * grilla de seis obliga a acercarse, que es justo lo que una pantalla de pared no puede pedir.
 *
 * Las cifras son el caso mas agradecido del volteo: son una o dos posiciones, cambian de tanto en
 * tanto, y una aleta de 12vmin girando en mitad de la pantalla es exactamente lo que hace un panel
 * cuando cambia un vuelo. El nombre del area y las etiquetas de las cifras son texto plano y quieto:
 * son palabras, y en fichas de ancho fijo perderian la silueta.
 */
export function EscenaPortada ({ area, contadores }: {
  area: string
  contadores: ContadoresDePortada
}): ReactNode {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[5vmin] text-center">
      <p className="text-texto flex justify-center text-[9vmin] font-bold">
        <Ficha tope={6} texto={area} maximo={CUPO_DE_AREA} />
      </p>

      <dl className="flex flex-wrap items-start justify-center gap-[8vmin]">
        {/* Cada cifra arranca ocho ranuras despues que la anterior: las tres no giran a la vez. */}
        <Cifra valor={contadores.jornadas_abiertas} etiqueta="en jornada" onda={8} />
        <Cifra valor={contadores.cronometros_corriendo} etiqueta="midiendo" onda={16} />
        <Cifra
          valor={contadores.procesos_atrasados}
          etiqueta={`${GLOSARIO.proceso.plural.toLowerCase()} atrasadas`}
          alarma={contadores.procesos_atrasados > 0}
          onda={24}
        />
      </dl>
    </div>
  )
}

/** Lo que cabe en el nombre de un area a 9vmin, sobre los ~170vmin de la pared tumbada. */
const CUPO_DE_AREA = cupoDeFichas(150, 9, ANCHO_SOBRIO_EM)

/** Lo que cabe en una etiqueta de cifra a 3vmin sin invadir la de al lado. */
const CUPO_DE_ETIQUETA = cupoDeFichas(40, 3, ANCHO_MAYUSCULA_EM)

function Cifra ({ valor, etiqueta, onda, alarma = false }: {
  valor: number
  etiqueta: string
  /** En que ranura arranca, para que las tres cifras no volteen en el mismo fotograma. */
  onda: number
  alarma?: boolean
}): ReactNode {
  return (
    <div className="flex flex-col items-center gap-[0.5vmin]">
      <dd
        className={[
          'text-[12vmin] font-bold',
          alarma ? 'text-texto-peligro' : 'text-acento'
        ].join(' ')}
      >
        {/* Cuatro fichas: 9.999 jornadas abiertas es un numero que esta compañia no va a ver. */}
        <Ficha onda={onda} texto={String(valor)} maximo={4} />
      </dd>
      <dt className="text-texto-tenue text-[3vmin]">
        <Ficha mayusculas tope={TOPE_SUELTO} onda={onda + 4} texto={etiqueta} maximo={CUPO_DE_ETIQUETA} />
      </dt>
    </div>
  )
}
