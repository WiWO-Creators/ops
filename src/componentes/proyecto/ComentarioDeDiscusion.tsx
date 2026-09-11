import { Avatar } from '@/componentes/presentadores/Avatar'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'

/**
 * Un comentario de una discusión del Proyecto.
 *
 * Lo dibujan la pestaña del equipo y la del cliente. Eran dos: la del cliente no tenia avatar, no
 * marcaba quien es del cliente y no ofrecia el adjunto, asi que la misma conversacion se leia
 * distinta segun de que lado se abriera —y en un hilo largo eso es la mitad de la lectura—.
 *
 * Sin `'use client'`: es marcado. El panel lo monta desde un componente cliente y el portal desde el
 * servidor, sin que ninguno mande JavaScript de mas por usarlo.
 */

/** Lo minimo que un comentario necesita para pintarse. El portal no manda la foto del autor. */
export interface ComentarioParaMostrar {
  content: string
  created: string | null
  author: { full_name: string, es_cliente: boolean, profile_image_url?: string | null } | null
  file: { name: string, url: string } | null
}

/**
 * @param comentario el comentario tal como lo devuelve la API, de cualquiera de los dos contratos
 * @returns la tarjeta del comentario
 */
export function ComentarioDeDiscusion ({ comentario }: { comentario: ComentarioParaMostrar }) {
  const autor = comentario.author?.full_name ?? 'Sin autor'

  return (
    <li className="border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex gap-3 border p-3">
      <Avatar nombre={autor} imagen={comentario.author?.profile_image_url ?? null} />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-texto text-sm font-medium">{autor}</span>
          {comentario.author?.es_cliente === true && <Insignia tamano="chico">Cliente</Insignia>}
          <Fecha valor={comentario.created} conHora className="text-texto-tenue text-xs" />
        </span>

        <p className="text-texto text-sm whitespace-pre-line">{comentario.content}</p>

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
      </div>
    </li>
  )
}
