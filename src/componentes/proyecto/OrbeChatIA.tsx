'use client'

import { Suspense, useEffect, useId, useRef, useState, type ReactElement } from 'react'
import { useSearchParams } from 'next/navigation'
import { Cargando } from '@/componentes/estado/Estados'
import { Orbe } from '@/componentes/estado/Orbe'
import { ASISTENTE, GLOSARIO } from '@/dominio/glosario'
import { ChatDelProyecto } from './PanelChatIA'

/**
 * WiBot, el chat del Espacio, como orbe flotante: se pregunta sin salir de la pestaña en la que se este.
 *
 * Convive con la pestaña de WiBot en vez de reemplazarla: la pestaña sigue siendo el chat a pantalla
 * completa y con URL propia —un hilo se comparte por enlace—, y el orbe es el acceso rapido desde
 * las Tareas, el Gantt o los Archivos. Los dos montan el MISMO `ChatDelProyecto` y el hilo vive en
 * `dominio/ia-chat.ts`, asi que preguntar en uno y seguir en el otro es la misma conversacion.
 *
 * === POR QUE NO ES UN CAJON NI UN DIALOGO ===
 *
 * `Dialogo` y `Cajon` son modales: Radix pone `inert` en todo lo de atras, asi que el Espacio
 * dejaria de leerse mientras el chat esta abierto —justo lo contrario de para que existe el orbe— y
 * una cita a una Tarea abriria un `Dialog` sobre otro `Dialog`, con el foco peleando entre los dos.
 * Este panel es una caja flotante comun: lo de atras sigue vivo y `ModalTarea` se abre encima sin
 * conflicto.
 *
 * === POR QUE EL ORBE ESTA QUIETO HASTA QUE LO TOCAS ===
 *
 * La regla del sistema de diseño prohibe animaciones infinitas en elementos SIEMPRE visibles, y este
 * boton lo esta en todo el Espacio. En reposo va el orbe quieto; se anima al pasar por encima, al
 * enfocarlo con el teclado y mientras el panel esta abierto, que son estados que terminan.
 */
export function OrbeChatIA ({ proyectoId }: { proyectoId: number }): ReactElement | null {
  // Lee `useSearchParams`: sin este limite de Suspense el build de la pagina que lo monte falla.
  return (
    <Suspense fallback={null}>
      <Flotante proyectoId={proyectoId} />
    </Suspense>
  )
}

function Flotante ({ proyectoId }: { proyectoId: number }): ReactElement | null {
  const params = useSearchParams()
  const [abierto, setAbierto] = useState(false)
  const [encima, setEncima] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const idPanel = useId()

  // En la pestaña de WiBot el chat ya ocupa la pantalla: dos copias montadas a la vez serian dos
  // `ModalTarea` peleando por el mismo `?tarea=`, y un orbe que abre lo que ya se esta mirando.
  const enLaPestanaDeIa = params.get('tab') === 'ia'

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
  // El campo no existe todavia cuando el panel se monta —el chat entra por `Suspense` y hasta puede
  // estar leyendo el hilo guardado—, asi que enfocarlo en el acto no toma nada. El observador espera
  // a que aparezca y se desconecta con el primero que encuentre.
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

  // Basta con no pintar nada: el panel que quedo abierto vuelve abierto al salir de la pestaña, que
  // es lo que espera quien estaba conversando.
  if (enLaPestanaDeIa) return null

  return (
    <>
      {abierto && (
        <div
          ref={panel}
          id={idPanel}
          role="dialog"
          aria-label={`${ASISTENTE}, el chat de este ${GLOSARIO.espacio.singular}`}
          className="border-linea bg-superficie-flotante shadow-flotante rounded-tarjeta animate-entrar-abajo fixed bottom-24 right-4 z-50 flex h-[min(32rem,70vh)] w-[min(24rem,calc(100vw-2rem))] flex-col gap-3 border p-3"
        >
          <header className="flex items-center justify-between gap-2">
            <div className="flex flex-col">
              <p className="text-texto text-sm font-semibold">{ASISTENTE}</p>
              <p className="text-texto-sutil text-xs">
                Pregunta por este {GLOSARIO.espacio.singular}
              </p>
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

          <Suspense fallback={<Cargando mensaje="Cargando el chat…" />}>
            <ChatDelProyecto proyectoId={proyectoId} desplazable />
          </Suspense>
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
        aria-label={abierto ? `Cerrar ${ASISTENTE}` : `Preguntarle a ${ASISTENTE} por este ${GLOSARIO.espacio.singular}`}
        className="border-linea bg-superficie-flotante shadow-flotante hover:border-linea-fuerte fixed bottom-6 right-4 z-50 inline-flex size-14 items-center justify-center rounded-full border transition-transform duration-150 ease-neo active:scale-[0.96]"
      >
        <Orbe tamano="medio" estado={abierto || encima ? 'thinking' : undefined} />
      </button>
    </>
  )
}
