'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useState, useSyncExternalStore } from 'react'
import { Antesala } from '@/componentes/teletrabajo/Antesala'
import { ALTO, Llamada } from '@/componentes/teletrabajo/Llamada'
import { cn } from '@/lib/clases'
import type { QuienEsta } from '@/datos/teletrabajo'
import type { EleccionDeEntrada, Quien } from '@/componentes/teletrabajo/tipos'

/**
 * Las tres piezas de `useSyncExternalStore` que responden "¿ya estoy en el navegador?".
 *
 * No hay nada que escuchar: el valor del servidor es `false`, el del cliente `true`, y el cambio
 * ocurre una sola vez al hidratar. Van fuera del componente para que su identidad no cambie entre
 * renders, que es lo que haria a React resuscribirse en cada uno.
 */
const NO_ESCUCHAR = () => () => {}
const EN_EL_CLIENTE = () => true
const EN_EL_SERVIDOR = () => false

interface PropsSala {
  token: string
  url: string
  titulo: string
  esPrivada: boolean
  yo: Quien
  miIdentidad: string
  dentro: QuienEsta[] | null
}

/**
 * La sala: primero la antesala, despues la llamada.
 *
 * Son dos pantallas y no una porque hacen cosas distintas. La antesala **no conecta**: abre la
 * camara y el microfono de forma local para que la persona se vea, se reconozca y elija sus
 * aparatos. La llamada conecta con lo que la antesala decidio y ya no vuelve a preguntar.
 *
 * Ese paso previo es la respuesta directa a lo que faltaba: entrar de golpe a una sala sin nombre
 * propio, sin verse y sin saber quien hay dentro es lo que hacia que la pantalla se leyera como
 * rota aunque estuviera conectada.
 */
export function Sala ({ token, url, titulo, esPrivada, yo, miIdentidad, dentro }: PropsSala) {
  const router = useRouter()
  const [eleccion, setEleccion] = useState<EleccionDeEntrada | null>(null)

  const volver = useCallback(() => { router.push('/teletrabajo') }, [router])

  /**
   * Si el navegador ya monto el componente.
   *
   * Los componentes de LiveKit leen camaras, microfonos y estado de conexion mientras renderizan.
   * En el servidor nada de eso existe, asi que el HTML que llega no coincide con el que React
   * calcula al hidratar y el arbol queda con avisos de "didn't match" que React no repara. Montar
   * la sala recien en el cliente elimina la discrepancia de raiz; lo que se pierde es un pintado
   * previo que igual no podia mostrar ninguna camara.
   */
  const montado = useSyncExternalStore(NO_ESCUCHAR, EN_EL_CLIENTE, EN_EL_SERVIDOR)

  if (!montado) {
    return (
      <div className={cn(ALTO, 'flex flex-col gap-3')}>
        <header className="flex shrink-0 items-center gap-3">
          <h1 className="font-titular truncate text-titulo font-bold text-texto">{titulo}</h1>
          <span className="ml-auto text-xs text-texto-tenue">Preparando…</span>
        </header>
        <div className="min-h-0 flex-1 rounded-medio bg-superficie-hundida" />
      </div>
    )
  }

  if (eleccion === null) {
    return (
      <div className={cn(ALTO, 'flex flex-col justify-center')}>
        <Antesala
          titulo={titulo}
          esPrivada={esPrivada}
          yo={yo}
          dentro={dentro}
          alEntrar={setEleccion}
          alVolver={volver}
        />
      </div>
    )
  }

  return (
    <Llamada
      token={token}
      url={url}
      titulo={titulo}
      esPrivada={esPrivada}
      yo={yo}
      miIdentidad={miIdentidad}
      eleccion={eleccion}
      alSalir={volver}
    />
  )
}
