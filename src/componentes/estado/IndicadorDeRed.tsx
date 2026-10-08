'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { descartarSinConfirmar, usePendientes } from '@/datos/pendientes'
import { destinoSoloDeModal, esNavegacionInterna, iniciarNavegacion, terminarNavegacion, useNavegando } from '@/datos/navegacion'

/** Espera antes de mostrar "Guardando…": una escritura rápida no debe parpadear en pantalla. */
const ESPERA_PARA_MOSTRAR_MS = 600

/**
 * Lo que la persona necesita saber de la red en cualquier pantalla: si algo está navegando, si lo que
 * hizo ya llegó al servidor y si hubo cambios que no se pudieron confirmar.
 *
 * - Barra fina arriba mientras una navegación espera al servidor.
 * - "Guardando…" abajo si una escritura tarda más de {@link ESPERA_PARA_MOSTRAR_MS}.
 * - "N cambios sin confirmar" cuando una escritura salió y no volvió respuesta: avisa que conviene
 *   revisar antes de repetirla, porque el servidor pudo haberla aplicado.
 * - Advertencia del navegador si se cierra la pestaña con una escritura en vuelo.
 */
export function IndicadorDeRed () {
  const navegando = useNavegando()
  const { enCurso, sinConfirmar } = usePendientes()
  const [guardandoVisible, setGuardandoVisible] = useState(false)
  const ruta = usePathname()
  const parametros = useSearchParams()
  const clave = `${ruta}?${parametros.toString()}`
  const claveAnterior = useRef(clave)

  useEffect(() => {
    if (claveAnterior.current === clave) return

    claveAnterior.current = clave
    terminarNavegacion()
  }, [clave])

  useEffect(() => {
    const alHacerClic = (evento: MouseEvent): void => {
      const enlace = (evento.target as Element | null)?.closest?.('a[href]')

      if (enlace === null || enlace === undefined || evento.defaultPrevented) return

      const ancla = enlace as HTMLAnchorElement
      const { origin, pathname, search } = window.location

      if (!esNavegacionInterna(ancla, evento, origin, `${pathname}${search}`)) return

      // Abrir o cerrar un modal (`?tarea=`, `?ticket=`) no cambia de pagina: se escribe en el
      // historial sin pedirle nada al servidor, y el modal reacciona a la URL.
      const soloModal = destinoSoloDeModal(ancla.href, origin, pathname, search)

      if (soloModal !== null) {
        evento.preventDefault()
        evento.stopPropagation()
        window.history.pushState(null, '', soloModal)

        return
      }

      iniciarNavegacion()
    }

    // En captura: tiene que ir antes que el `<Link>` de Next para poder quitarle el clic.
    document.addEventListener('click', alHacerClic, true)

    return () => { document.removeEventListener('click', alHacerClic, true) }
  }, [])

  useEffect(() => {
    if (enCurso === 0) return

    const espera = setTimeout(() => { setGuardandoVisible(true) }, ESPERA_PARA_MOSTRAR_MS)

    return () => {
      clearTimeout(espera)
      setGuardandoVisible(false)
    }
  }, [enCurso])

  useEffect(() => {
    if (enCurso === 0) return

    const avisar = (evento: BeforeUnloadEvent): void => { evento.preventDefault() }

    window.addEventListener('beforeunload', avisar)

    return () => { window.removeEventListener('beforeunload', avisar) }
  }, [enCurso])

  return (
    <>
      {navegando && (
        <div
          role="progressbar"
          aria-label="Cargando la página"
          className="bg-acento pointer-events-none fixed inset-x-0 top-0 z-aviso h-0.5 animate-pulse"
        />
      )}
      {((guardandoVisible && enCurso > 0) || sinConfirmar.length > 0) && (
        <div
          role="status"
          aria-live="polite"
          className="bg-control text-texto border-control-borde rounded-control fixed bottom-4 left-1/2 z-aviso flex -translate-x-1/2 items-center gap-3 border px-3 py-2 text-xs shadow-lg"
        >
          {sinConfirmar.length > 0
            ? (
              <>
                <span>
                  {sinConfirmar.length === 1 ? '1 cambio sin confirmar' : `${sinConfirmar.length} cambios sin confirmar`}
                  {': revisa antes de repetirlo.'}
                </span>
                <button type="button" className="font-medium underline" onClick={descartarSinConfirmar}>Entendido</button>
              </>
              )
            : <span>{enCurso > 1 ? `Guardando ${enCurso} cambios…` : 'Guardando…'}</span>}
        </div>
      )}
    </>
  )
}
