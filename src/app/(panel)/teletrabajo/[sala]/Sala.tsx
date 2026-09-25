'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useSyncExternalStore } from 'react'
import { Antesala } from '@/componentes/teletrabajo/Antesala'
import { ALTO } from '@/componentes/teletrabajo/Llamada'
import { useLlamadaEnCurso } from '@/componentes/teletrabajo/LlamadaEnCurso'
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
  /** Nombre de la sala, el segmento de la ruta. */
  sala: string
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
 *
 * La llamada ya no se dibuja aca: la antesala se la entrega a `LlamadaEnCurso`, que vive en el
 * armazon y la mantiene conectada aunque la persona navegue. Cuando esta sala es la de la llamada en
 * curso, esta pantalla no pinta nada y la llamada ocupa su lugar.
 */
export function Sala ({ sala, token, url, titulo, esPrivada, yo, miIdentidad, dentro }: PropsSala) {
  const router = useRouter()
  const { activa, iniciar } = useLlamadaEnCurso()

  const volver = useCallback(() => { router.push('/teletrabajo') }, [router])

  const entrar = useCallback((eleccion: EleccionDeEntrada) => {
    iniciar({ sala, token, url, titulo, esPrivada, yo, miIdentidad, eleccion })
  }, [iniciar, sala, token, url, titulo, esPrivada, yo, miIdentidad])

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

  if (activa?.sala === sala) return null

  return (
    // En el telefono la antesala es mas alta que la ventana: centrada, su parte de arriba quedaria
    // fuera de alcance del scroll. Ahi arranca arriba y crece lo que necesite.
    <div className={cn(ALTO, 'flex flex-col justify-center gap-3 max-md:h-auto max-md:justify-start')}>
      {/* Se esta en una sola llamada a la vez: entrar a esta corta la otra, y eso se dice antes. */}
      {activa !== null && (
        <p role="status" className="text-texto-aviso text-center text-sm">
          Estás en otra llamada ({activa.titulo}). Al entrar a esta, sales de aquella.
        </p>
      )}
      <Antesala
        titulo={titulo}
        esPrivada={esPrivada}
        yo={yo}
        dentro={dentro}
        alEntrar={entrar}
        alVolver={volver}
      />
    </div>
  )
}
