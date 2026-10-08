import { Paperclip } from 'lucide-react'
import type { ReactNode } from 'react'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Contenido } from '@/componentes/presentadores/Contenido'
import { EnlacePersona } from '@/componentes/presentadores/EnlacePersona'
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
  /** El comentario como HTML saneado por la API (texto enriquecido). Sin el, se pinta `content`. */
  html?: string | null
  created: string | null
  author: {
    full_name: string
    es_cliente: boolean
    profile_image_url?: string | null
    /**
     * Id de staff del autor, para enlazarlo con `EnlacePersona`. Ausente si el autor es un contacto
     * (`es_cliente` en `true`) o si quien arma `comentario` no lo agrego.
     */
    id?: number
  } | null
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
 * El autor se enlaza con `EnlacePersona` (`/equipo/{id}` y su tarjeta flotante), que decide por su
 * cuenta si corresponde segun el `ProveedorEnlaces` vigente: esta tarjeta no recibe ni reenvia
 * capacidades ni `esPortal`.
 *
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
  const tamanoAvatar = anidado ? 'chico' : 'medio'
  // Solo el staff tiene ficha en `/equipo`: un contacto (`es_cliente`) o un autor sin id nunca enlaza.
  const idDelAutor = comentario.author?.es_cliente === false ? comentario.author.id : undefined

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
      {idDelAutor === undefined
        ? <Avatar nombre={autor} imagen={comentario.author?.profile_image_url ?? null} tamano={tamanoAvatar} />
        : (
          <EnlacePersona
            id={idDelAutor}
            nombre={autor}
            imagen={comentario.author?.profile_image_url ?? null}
            tamano={tamanoAvatar}
            mostrarNombre={false}
          />
          )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-texto text-sm font-medium">{autor}</span>
          {comentario.author?.es_cliente === true && <Insignia tamano="chico">Cliente</Insignia>}
          <Fecha valor={comentario.created} conHora className="text-texto-tenue text-xs tabular-nums" />
          {acciones !== undefined && <span className="ml-auto flex items-center gap-1">{acciones}</span>}
        </span>

        <Contenido
          html={comentario.html}
          texto={comentario.content}
          className="text-texto text-sm leading-relaxed text-pretty [overflow-wrap:anywhere]"
        />

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
