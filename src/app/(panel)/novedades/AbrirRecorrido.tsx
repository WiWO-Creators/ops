'use client'

import { useState } from 'react'
import { Play } from 'lucide-react'
import { RecorridoDeNovedades } from '@/componentes/estructura/bienvenida/RecorridoDeNovedades'
import { Boton } from '@/componentes/formularios/Boton'
import type { Novedad } from '@/dominio/novedades'

/**
 * Abre el recorrido de las ultimas novedades desde la pagina de novedades.
 *
 * Despues de actualizar el recorrido se ofrece durante la coreografia, que dura segundos —y menos de
 * uno con `prefers-reduced-motion`—. Esta es la puerta que no se va: quien no alcanzo a tocarlo, o
 * lo quiere ver otra vez, lo encuentra aca.
 *
 * @param novedades las del dia mas reciente, ya recortadas por el servidor
 */
export function AbrirRecorrido ({ novedades }: { novedades: readonly Novedad[] }) {
  const [abierto, setAbierto] = useState(false)

  return (
    <>
      <Boton variante="secundario" tamano="chico" onClick={() => { setAbierto(true) }}>
        <Play className="size-3.5" aria-hidden="true" />
        Ver lo último como recorrido
      </Boton>
      {abierto && <RecorridoDeNovedades novedades={novedades} onCerrar={() => { setAbierto(false) }} />}
    </>
  )
}
