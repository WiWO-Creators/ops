import { Paperclip } from 'lucide-react'
import type { ReactNode } from 'react'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { cn } from '@/lib/clases'

/**
 * Un comentario de una Tarea, con su autor, su fecha y su adjunto.
 *
 * Lo dibujan la ficha del equipo y la del cliente con la misma tarjeta, para que la misma
 * conversacion se lea igual desde los dos lados: avatar, insignia de cliente y adjunto incluidos.
 * El hilo del equipo (`HiloDeComentarios`) usa la misma tarjeta y le cuelga sus acciones y las
 * respuestas por `acciones` y `children`; el portal no pasa ninguno de los dos y queda de lectura.
 *
 * Sin `'use client'`: es marcado. El panel lo monta desde un componente cliente y el portal desde el
 * servidor, sin que ninguno mande JavaScript de mas por usarlo.
 */

/** Lo minimo que un comentario necesita para pintarse. El portal no manda la foto del autor. */
export interface ComentarioParaMostrar {
  /** Texto legible, ya sin HTML. */
  content: string
  created: string | null
  author: { full_name: string, es_cliente: boolean, profile_image_url?: string | null } | null
  file: { name: string, url: string } | null
  /** Perfex marco el comentario con un adjunto que ninguna ruta sirve todavia. */
  con_adjunto?: boolean
}

interface PropsTarjetaDeComentario {
  comentario: ComentarioParaMostrar
  /** Botones del comentario (responder, borrar), a la derecha de la fecha. */
  acciones?: ReactNode
  /** Lo que cuelga del comentario: sus respuestas y el cuadro para responder. */
  children?: ReactNode
  /** Una respuesta: sin marco propio, porque ya esta dentro de la tarjeta de su raiz. */
  anidado?: boolean
  className?: string
}

/**
 * @param comentario el comentario ya traducido por `comentarioParaMostrar`
 * @param acciones botones opcionales del comentario
 * @param children respuestas y cuadro de respuesta, si los hay
 * @param anidado si es una respuesta dentro de otro comentario
 * @param className clases extra para el `<li>`
 * @returns la tarjeta del comentario
 */
export function TarjetaDeComentario (
  { comentario, acciones, children, anidado = false, className }: PropsTarjetaDeComentario
) {
  const autor = comentario.author?.full_name ?? 'Sin autor'

  return (
    <li
      className={cn(
        'flex gap-3',
        // Dos grupos y no uno: con el mismo nombre, pasar el mouse por la raiz encenderia los
        // botones de todas sus respuestas.
        anidado ? 'group/respuesta py-1' : 'group/comentario border-linea bg-superficie-elevada rounded-tarjeta shadow-1 border p-3',
        className
      )}
    >
      <Avatar nombre={autor} imagen={comentario.author?.profile_image_url ?? null} tamano={anidado ? 'chico' : 'medio'} />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-texto text-sm font-medium">{autor}</span>
          {comentario.author?.es_cliente === true && <Insignia tamano="chico">Cliente</Insignia>}
          <Fecha valor={comentario.created} conHora className="text-texto-tenue text-xs tabular-nums" />
          {acciones !== undefined && <span className="ml-auto flex items-center gap-1">{acciones}</span>}
        </span>

        {comentario.content !== '' && (
          <p className="text-texto text-sm leading-relaxed text-pretty whitespace-pre-line [overflow-wrap:anywhere]">
            {comentario.content}
          </p>
        )}

        {comentario.file !== null && (
          <a
            href={comentario.file.url}
            target="_blank"
            rel="noreferrer"
            className="text-acento w-fit text-xs font-semibold underline underline-offset-4"
          >
            {comentario.file.name}
          </a>
        )}

        {comentario.file === null && comentario.con_adjunto === true && (
          <span className="text-texto-sutil inline-flex items-center gap-1 text-xs">
            <Paperclip aria-hidden className="size-3.5" strokeWidth={1.75} />
            Incluye un archivo adjunto
          </span>
        )}

        {children}
      </div>
    </li>
  )
}
