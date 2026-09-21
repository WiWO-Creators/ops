import type { ReactNode } from 'react'
import { GLOSARIO } from '@/dominio/glosario'
import { diaDeCalendario } from '@/dominio/momento-del-dia'
import { ANCHO_MAYUSCULA_EM, ANCHO_SOBRIO_EM, cupoDeFichas } from '@/dominio/solari'
import type { ContadoresDePortada } from '@/datos/pantalla-area'
import { Ficha, TOPE_SUELTO } from './piezas'

/**
 * La portada: el nombre del area, el dia, y tres cifras.
 *
 * Es la escena ancla y la unica que nunca sale del guion, aunque no haya absolutamente nada que
 * contar. Un area dormida mostrando su nombre y la hora es digna; una pantalla en blanco es un
 * producto roto.
 *
 * === POR QUE LAS CIFRAS SON LO MAS GRANDE DE LA PANTALLA ===
 *
 * Antes lo mas grande era el nombre del area, a 9vmin, con las cifras a 12 debajo y medio metro de
 * negro alrededor. Es la jerarquia al reves: el nombre del area ya esta en la cabecera de las SIETE
 * escenas, asi que repetirlo en grande es decir dos veces lo mismo, y lo unico que esta escena aporta
 * —las tres cifras— se dibujaba como un pie de foto.
 *
 * Ahora las cifras miden 18vmin y son lo primero que se ve desde el pasillo; el nombre del area baja a
 * 7 y pasa a ser lo que es, el rotulo de quien las cuenta. Son el caso mas agradecido del volteo: una
 * o dos posiciones, cambian de tanto en tanto, y una aleta de 18vmin girando en mitad de la pared es
 * exactamente lo que hace un panel cuando cambia un vuelo.
 *
 * Tres cifras y no seis: a cuatro metros, una fila de numeros grandes se lee de un vistazo y una
 * grilla de seis obliga a acercarse, que es justo lo que una pantalla de pared no puede pedir.
 *
 * El nombre del area, el dia y las etiquetas son texto plano y quieto: son palabras, y en fichas de
 * ancho fijo perderian la silueta.
 *
 * @param area       como se llama el area de esta pantalla
 * @param contadores las tres cifras, tal cual llegan de la API
 * @param ahora      el reloj de la pared, o `null` antes de hidratar; solo para el dia
 * @param zona       la zona del negocio: el dia no se cuenta con el calendario del televisor
 */
export function EscenaPortada ({ area, contadores, ahora, zona }: {
  area: string
  contadores: ContadoresDePortada
  ahora: number | null
  zona: string | null
}): ReactNode {
  const dia = diaDeCalendario(ahora, zona)

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[6vmin] text-center">
      <div className="flex flex-col items-center gap-[1.4vmin]">
        <p className="text-texto flex justify-center text-[7vmin] font-bold">
          <Ficha tope={6} texto={area} maximo={CUPO_DE_AREA} />
        </p>

        {/*
          * El dia, debajo del nombre y en el tono mas apagado.
          *
          * No decora: es lo unico de la pared que delata un televisor colgado que se quedo pegado
          * hace dos dias. Ver `diaDeCalendario()`. Mientras no haya hidratado no hay dia que decir y
          * la linea no se dibuja, en vez de reservar un hueco vacio que luego da un salto.
          */}
        {dia !== '' && (
          <p className="text-texto-sutil text-[2.8vmin] tracking-[0.18em] uppercase">
            <Ficha texto={dia} maximo={CUPO_DE_DIA} />
          </p>
        )}
      </div>

      {/* El filete que separa el rotulo de lo que rotula. Es el unico trazo de la escena. */}
      <span className="bg-acento h-[0.4vmin] w-[8vmin] rounded-full" />

      <dl className="flex flex-wrap items-start justify-center gap-[10vmin]">
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

/** Lo que cabe en el nombre de un area a 7vmin, sobre los ~170vmin de la pared tumbada. */
const CUPO_DE_AREA = cupoDeFichas(150, 7, ANCHO_SOBRIO_EM)

/** Lo que cabe en el dia a 2.8vmin en versalitas: "miércoles 30 de septiembre" es el mas largo. */
const CUPO_DE_DIA = cupoDeFichas(120, 2.8, ANCHO_MAYUSCULA_EM + 0.18)

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
    <div className="flex flex-col items-center gap-[1.2vmin]">
      <dd
        className={[
          'text-[18vmin] font-bold',
          alarma ? 'text-texto-peligro' : 'text-acento'
        ].join(' ')}
      >
        {/* Cuatro fichas: 9.999 jornadas abiertas es un numero que esta compañia no va a ver. */}
        <Ficha onda={onda} texto={String(valor)} maximo={4} />
      </dd>
      <dt className="text-texto-tenue text-[3vmin] tracking-[0.1em] uppercase">
        <Ficha mayusculas tope={TOPE_SUELTO} onda={onda + 4} texto={etiqueta} maximo={CUPO_DE_ETIQUETA} />
      </dt>
    </div>
  )
}
