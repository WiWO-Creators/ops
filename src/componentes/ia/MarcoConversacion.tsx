import type { ReactElement, ReactNode, RefObject } from 'react'

interface PropsMarcoConversacion {
  /** En el orbe el alto está acotado: la conversación scrollea sola y el pie queda fijo abajo. */
  desplazable?: boolean
  /** Fuera del desplazador, arriba: cabecera del Proyecto. */
  encabezado?: ReactNode
  /** Fuera del desplazador, bajo la cabecera: acciones que no deben irse con el scroll (Eliminar chat). */
  barra?: ReactNode
  /** Dentro del desplazador, antes de la lista: el hilo anterior del agente. */
  antesDeLista?: ReactNode
  /** Estado vacío; se pinta antes de la lista, que puede ir vacía. */
  vacio?: ReactNode
  /** Entre el desplazador y el pie: avisos de la conversación. */
  avisos?: ReactNode
  /** El compositor. */
  pie: ReactNode
  /** Ref del desplazador, de `useAutoScroll`. */
  desplazadorRef: RefObject<HTMLDivElement | null>
  /** La lista de mensajes. */
  children?: ReactNode
}

/**
 * El marco de una conversación del orbe: cabecera, barra, zona desplazable con vacío y lista, avisos
 * y pie. Lo comparten los dos motores para que la Fase de rediseño toque un solo sitio.
 */
export function MarcoConversacion ({ desplazable = false, encabezado, barra, antesDeLista, vacio, avisos, pie, desplazadorRef, children }: PropsMarcoConversacion): ReactElement {
  return (
    <div className={desplazable ? 'flex min-h-0 flex-1 flex-col gap-4' : 'flex flex-col gap-4'}>
      {encabezado}
      {barra}
      <div ref={desplazadorRef} className={desplazable ? 'min-h-0 flex-1 overflow-y-auto pr-1' : undefined}>
        {antesDeLista}
        {vacio}
        {children}
      </div>
      {avisos}
      {pie}
    </div>
  )
}
