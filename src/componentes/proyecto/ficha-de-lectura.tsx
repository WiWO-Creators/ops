import type { ReactElement, ReactNode } from 'react'
import { cn } from '@/lib/clases'
import { TarjetaDeComentario, type ComentarioParaMostrar } from './TarjetaDeComentario'

/**
 * Piezas de solo lectura de la ficha de una Tarea.
 *
 * Las comparten `DetalleTarea` (cliente, dentro del panel) y la ficha publica `/tarea/[token]`
 * (servidor, sin sesion). Sin `'use client'` y sin importar nada que lo sea mas alla de lo que ya
 * monta `TarjetaDeComentario`: importar desde `DetalleTarea` arrastraria el detalle entero
 * —catalogos, cronometros, arbol de Drive— a una ruta anonima que no tiene sesion para pedirlo.
 */

export const SIN_DATO = '—'

/** Nivel del titulo de una seccion: 2 en la pagina publica, 4 dentro del dialogo del panel. */
type NivelDeTitulo = 2 | 4

interface PropsSeccion {
  titulo: ReactNode
  nivel: NivelDeTitulo
  children: ReactNode
}

/**
 * Una seccion opcional de la ficha, con su titulo.
 *
 * @param props.titulo texto del titulo (puede traer un contador)
 * @param props.nivel nivel del encabezado segun donde se monta la ficha
 * @param props.children contenido de la seccion
 * @returns la seccion
 */
export function SeccionDeLectura ({ titulo, nivel, children }: PropsSeccion): ReactElement {
  const Titulo = nivel === 2 ? 'h2' : 'h4'

  return (
    <section className="flex flex-col gap-2">
      <Titulo className="text-texto-tenue text-sm font-semibold">{titulo}</Titulo>
      {children}
    </section>
  )
}

/**
 * Un par etiqueta/valor de la ficha, con la etiqueta en versalita. Va dentro de un `<dl>`.
 *
 * @param props.etiqueta nombre del dato
 * @param props.children valor ya formateado
 * @returns el par `<dt>`/`<dd>`
 */
export function Dato ({ etiqueta, children }: { etiqueta: string, children: ReactNode }): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-texto-sutil text-xs font-medium tracking-[0.08em] uppercase">{etiqueta}</dt>
      <dd className="text-texto min-w-0 text-sm">{children}</dd>
    </div>
  )
}

/** Un punto de la lista de control, ya en texto plano. */
export interface ItemDeControl {
  clave: string | number
  hecho: boolean
  texto: string
}

/**
 * Los puntos de una lista de control, de solo lectura.
 *
 * El avance se dice con una **marca tipografica** y el texto tachado, no con un
 * `<input type="checkbox" disabled>`: en una pantalla sin escritura una casilla apagada se lee como
 * un control roto. La marca es `aria-hidden` y el estado va en texto al final, porque un lector de
 * pantalla que anuncia "✓" no dice nada.
 *
 * @param props.items los puntos, en orden
 * @param props.className clases extra del `<ul>`
 * @returns la lista
 */
export function MarcasDeControl ({ items, className }: { items: ItemDeControl[], className?: string }): ReactElement {
  return (
    <ul className={cn('flex flex-col gap-1', className)}>
      {items.map((item) => (
        <li key={item.clave} className="flex items-baseline gap-2 text-sm">
          <span
            aria-hidden
            className={`w-3 shrink-0 text-center ${item.hecho ? 'text-texto-exito' : 'text-texto-sutil'}`}
          >
            {item.hecho ? '✓' : '·'}
          </span>
          <span className={item.hecho ? 'text-texto-tenue line-through' : 'text-texto'}>{item.texto}</span>
          <span className="sr-only">{item.hecho ? '(hecho)' : '(pendiente)'}</span>
        </li>
      ))}
    </ul>
  )
}

/** Un adjunto de la Tarea, con el nombre que se muestra. */
export interface AdjuntoDeLectura {
  clave: string | number
  nombre: string
  url: string | null
}

/**
 * Los adjuntos de la Tarea, de solo lectura.
 *
 * Un adjunto sin `url` se muestra igual, como texto: el nombre dice que el archivo existe, y
 * esconderlo haria pensar que no hay ninguno.
 *
 * @param props.adjuntos los adjuntos
 * @param props.nivel nivel del titulo
 * @returns la seccion "Archivos"
 */
export function SeccionDeAdjuntos (
  { adjuntos, nivel }: { adjuntos: AdjuntoDeLectura[], nivel: NivelDeTitulo }
): ReactElement {
  return (
    <SeccionDeLectura titulo="Archivos" nivel={nivel}>
      {adjuntos.length === 0
        ? <p className="text-texto-sutil text-sm">Sin archivos adjuntos.</p>
        : (
          <ul className="flex flex-col gap-2">
            {adjuntos.map((adjunto) => (
              <li key={adjunto.clave} className="rounded-chico border-linea border p-3 text-sm">
                {adjunto.url === null
                  ? <span className="text-texto break-all">{adjunto.nombre}</span>
                  : (
                    <a
                      href={adjunto.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-acento break-all underline underline-offset-4"
                    >
                      {adjunto.nombre}
                    </a>
                    )}
              </li>
            ))}
          </ul>
          )}
    </SeccionDeLectura>
  )
}

/** Un comentario listo para `TarjetaDeComentario`, con su clave de lista. */
export interface ComentarioDeLectura {
  clave: string | number
  comentario: ComentarioParaMostrar
}

/**
 * La conversacion de la Tarea, de solo lectura.
 *
 * Usa la **misma tarjeta** (`TarjetaDeComentario`) en la ficha del equipo, la del cliente y la
 * publica: dos tarjetas distintas es como una termino sin avatar y sin la insignia de quien es del
 * cliente.
 *
 * @param props.comentarios los comentarios ya traducidos
 * @param props.nivel nivel del titulo
 * @returns la seccion "Comentarios"
 */
export function SeccionDeComentarios (
  { comentarios, nivel }: { comentarios: ComentarioDeLectura[], nivel: NivelDeTitulo }
): ReactElement {
  return (
    <SeccionDeLectura titulo="Comentarios" nivel={nivel}>
      {comentarios.length === 0
        ? <p className="text-texto-sutil text-sm">Todavía no hay comentarios.</p>
        : (
          <ul className="flex flex-col gap-2">
            {comentarios.map(({ clave, comentario }) => (
              <TarjetaDeComentario key={clave} comentario={comentario} />
            ))}
          </ul>
          )}
    </SeccionDeLectura>
  )
}
