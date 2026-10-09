'use client'

import { Muestra, SeccionTaller } from '@/componentes/estructura/Muestra'
import { BotonCopiar } from '@/componentes/datos/BotonCopiar'
import { BarraProgreso } from '@/componentes/presentadores/BarraProgreso'
import { BloqueCopiable } from '@/componentes/presentadores/BloqueCopiable'
import { Desviacion, EstadoSla } from '@/componentes/presentadores/EstadoSla'

const ESTADOS_SLA = ['en_plazo', 'en_riesgo', 'entregado', 'incumplido'] as const

/** La señal de plazo, el avance y las dos formas de copiar un texto. */
export function SeccionPlazosYCopiado () {
  return (
    <SeccionTaller
      titulo="Plazos, avance y copiado"
      nota="«En plazo» va en contorno: lo normal solo confirma y el color queda para lo que pide acción. Un SLA ausente no dibuja nada. Copiar confirma en el propio botón y solo avisa si el portapapeles se niega."
    >
      <Muestra etiqueta="estado de SLA">
        <div className="flex flex-wrap items-center gap-2">
          {ESTADOS_SLA.map((estado) => <EstadoSla key={estado} estado={estado} />)}
        </div>
      </Muestra>
      <Muestra etiqueta="desviación">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Desviacion dias={-2} />
          <Desviacion dias={0} />
          <Desviacion dias={5} />
        </div>
      </Muestra>
      <Muestra etiqueta="barra de progreso" className="w-full max-w-xs">
        <div className="flex w-full flex-col gap-3">
          <BarraProgreso porcentaje={0} />
          <BarraProgreso porcentaje={45} />
          <BarraProgreso porcentaje={103} />
        </div>
      </Muestra>
      <Muestra etiqueta="botón copiar">
        <div className="flex gap-2">
          <BotonCopiar valor="https://ops.wiwo.me/tareas/9013" etiqueta="Copiar enlace" />
          <BotonCopiar valor="WIW-0900" variante="sutil" tamano="chico" />
        </div>
      </Muestra>
      <Muestra etiqueta="bloque copiable" className="w-full max-w-md">
        <BloqueCopiable
          titulo="Registro DNS"
          texto={'Tipo: CNAME\nNombre: portal\nValor: clientes.wiwo.me'}
          className="w-full"
        />
      </Muestra>
    </SeccionTaller>
  )
}
