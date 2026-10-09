'use client'

import { useEstadoDeModo } from '@/lib/modo-especial'
import { DecoracionHalloween } from './DecoracionHalloween'
import { EntradaHalloween } from './EntradaHalloween'
import { HuevosDePascua } from './HuevosDePascua'
import { VigiladorDeModo } from './VigiladorDeModo'

/**
 * Todo lo que el modo especial agrega encima de la pagina, montado una sola vez en el layout raiz.
 *
 * El vigilante va siempre (tiene que poder retirar un modo vencido); lo demas solo existe mientras la
 * persona ve el modo, asi que apagarlo desde el selector tambien detiene las animaciones y no solo
 * las esconde. Agregar un modo es un `case` mas.
 */
export function CapaDeModo () {
  const { activo } = useEstadoDeModo()

  return (
    <>
      <VigiladorDeModo />
      {activo === 'halloween' && (
        <>
          <DecoracionHalloween />
          <EntradaHalloween />
          <HuevosDePascua />
        </>
      )}
    </>
  )
}
