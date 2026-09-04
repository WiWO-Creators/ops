import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/clases'
import { urlClasica, type EntidadClasica } from '@/lib/panel-clasico'

/**
 * Salida al panel clasico (Perfex) desde una pantalla nueva.
 *
 * Discreto y al pie del bloque: es una salida de emergencia mientras la migracion no termine, no una
 * accion del producto. Si falta `NEXT_PUBLIC_BOARD_URL` no se dibuja nada — `urlClasica` devuelve
 * `null` y un enlace que lleva a un 404 promete una salida que no existe.
 *
 * @param entidad Que se abre alla.
 * @param id Id de la entidad, el mismo que usa la API.
 */
export function EnlacePanelClasico ({
  entidad,
  id,
  className
}: {
  entidad: EntidadClasica
  id: number
  className?: string
}) {
  const url = urlClasica(entidad, id)

  if (url === null) return null

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'text-texto-sutil hover:text-texto inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline',
        className
      )}
    >
      <ExternalLink size={12} aria-hidden="true" />
      Abrir en el panel clásico
    </a>
  )
}
