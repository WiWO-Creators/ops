'use client'

import { useEffect, useId, useRef, useState, type ReactElement } from 'react'
import { Orbe } from '@/componentes/estado/Orbe'
import { ASISTENTE } from '@/dominio/glosario'
import { ChatWiBot } from './ChatWiBot'

/**
 * WiBot como orbe flotante: se pregunta desde cualquier pantalla del panel, sin salir de ella.
 *
 * Lo monta el armazon —`app/(panel)/layout.tsx`, al lado del `Latido`— y no una pantalla: su asunto
 * es todo el panel. Que viva ahi es ademas lo que hace que el chat **sobreviva a navegar**: el
 * armazon no se desmonta al cambiar de ruta, asi que el panel abierto sigue abierto y la
 * conversacion sigue en pantalla mientras la vista de atras cambia. Sin eso, el evento `navegar`
 * cerraria el chat justo cuando termina de explicar a donde lleva.
 *
 * === POR QUE NO ES UN CAJON NI UN DIALOGO ===
 *
 * `Dialogo` y `Cajon` son modales: Radix pone `inert` en todo lo de atras, asi que la pantalla
 * dejaria de leerse mientras el chat esta abierto —justo lo contrario de para que existe el orbe— y
 * el detalle de una Tarea abriria un `Dialog` sobre otro `Dialog`, con el foco peleando entre los
 * dos. Este panel es una caja flotante comun: lo de atras sigue vivo.
 *
 * === POR QUE EL ORBE ESTA QUIETO HASTA QUE LO TOCAS ===
 *
 * La regla del sistema de diseño prohibe animaciones infinitas en elementos SIEMPRE visibles, y este
 * boton lo esta en todo el panel. En reposo va el orbe quieto; se anima al pasar por encima, al
 * enfocarlo con el teclado y mientras el panel esta abierto, que son estados que terminan.
 */
export function OrbeChatIA (): ReactElement {
  const [abierto, setAbierto] = useState(false)
  const [encima, setEncima] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const idPanel = useId()

  // Cerrar con Escape es lo que espera cualquiera que abra algo flotante, y aca no lo da Radix.
  useEffect(() => {
    if (!abierto) return

    const alTeclado = (evento: KeyboardEvent): void => {
      if (evento.key === 'Escape') setAbierto(false)
    }

    document.addEventListener('keydown', alTeclado)

    return () => { document.removeEventListener('keydown', alTeclado) }
  }, [abierto])

  // El foco va al campo, no al panel: quien abre el chat es para escribir.
  //
  // El campo no existe todavia cuando el panel se monta —el chat puede estar leyendo el hilo
  // guardado—, asi que enfocarlo en el acto no toma nada. El observador espera a que aparezca y se
  // desconecta con el primero que encuentre.
  useEffect(() => {
    const caja = panel.current
    if (!abierto || caja === null) return

    const enfocar = (): boolean => {
      const campo = caja.querySelector('textarea')
      campo?.focus()

      return campo !== null
    }

    if (enfocar()) return

    const observador = new MutationObserver(() => { if (enfocar()) observador.disconnect() })
    observador.observe(caja, { childList: true, subtree: true })

    return () => { observador.disconnect() }
  }, [abierto])

  return (
    <>
      {abierto && (
        <div
          ref={panel}
          id={idPanel}
          role="dialog"
          aria-label={ASISTENTE}
          className="border-linea bg-superficie-flotante shadow-flotante rounded-tarjeta animate-entrar-abajo fixed bottom-24 right-4 z-50 flex h-[min(32rem,70vh)] w-[min(24rem,calc(100vw-2rem))] flex-col gap-3 border p-3"
        >
          <header className="flex items-center justify-between gap-2">
            <div className="flex flex-col">
              <p className="text-texto text-sm font-semibold">{ASISTENTE}</p>
              <p className="text-texto-sutil text-xs">Pregunta por lo que necesites</p>
            </div>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              aria-label={`Cerrar ${ASISTENTE}`}
              className="text-texto-tenue hover:bg-hover hover:text-texto rounded-control px-2 py-1 text-sm"
            >
              Cerrar
            </button>
          </header>

          <ChatWiBot desplazable />
        </div>
      )}

      <button
        type="button"
        onClick={() => setAbierto((estaba) => !estaba)}
        onPointerEnter={() => setEncima(true)}
        onPointerLeave={() => setEncima(false)}
        onFocus={() => setEncima(true)}
        onBlur={() => setEncima(false)}
        aria-expanded={abierto}
        aria-controls={abierto ? idPanel : undefined}
        aria-label={abierto ? `Cerrar ${ASISTENTE}` : `Preguntarle a ${ASISTENTE}`}
        className="border-linea bg-superficie-flotante shadow-flotante hover:border-linea-fuerte fixed bottom-6 right-4 z-50 inline-flex size-14 items-center justify-center rounded-full border transition-transform duration-150 ease-neo active:scale-[0.96]"
      >
        <Orbe tamano="medio" estado={abierto || encima ? 'thinking' : undefined} />
      </button>
    </>
  )
}
