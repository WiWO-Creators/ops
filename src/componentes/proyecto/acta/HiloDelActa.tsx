'use client'

import { useEffect, useRef, useState, type ReactElement } from 'react'
import { CheckCheck, RotateCcw, Trash2 } from 'lucide-react'
import { ConfirmacionEnLinea } from '@/componentes/datos/ConfirmacionEnLinea'
import { MenuAccionesFila, type AccionDeFila } from '@/componentes/datos/MenuAccionesFila'
import { Boton } from '@/componentes/formularios/Boton'
import { EnlacePersona } from '@/componentes/presentadores/EnlacePersona'
import { Insignia } from '@/componentes/presentadores/Insignia'
import type { StaffReferencia } from '@/datos/tipos'
import type { ComentarioDeActa, HiloDeActa } from '@/dominio/comentarios-acta'
import { cn } from '@/lib/clases'
import { formatearFecha, formatearRelativo } from '@/lib/fechas'
import { EscritorDeComentario } from './EscritorDeComentario'
import type { EscriturasDeComentarios } from './useEscriturasDeComentarios'

interface PropsHilo {
  hilo: HiloDeActa
  /** El texto comentado; `null` si el acta ya no tiene el fragmento marcado. */
  cita: string | null
  personas: readonly StaffReferencia[]
  /** Quien mira administra: puede borrar comentarios ajenos (el board lo vuelve a exigir). */
  esAdmin: boolean
  escrituras: EscriturasDeComentarios
  /** El hilo que se tocó en el texto: se trae a la vista y se marca. */
  destacado: boolean
}

/** Las menciones de un comentario como nombres, en el orden en que se hicieron. */
function nombresMencionados (comentario: ComentarioDeActa, personas: readonly StaffReferencia[]): string[] {
  return comentario.mentions
    .map((id) => personas.find((persona) => persona.id === id)?.full_name)
    .filter((nombre): nombre is string => nombre !== undefined)
}

/**
 * Un hilo de comentarios del Meeting Paper: el fragmento comentado, la conversación, las respuestas
 * y la acción de resolverlo o reabrirlo.
 *
 * Editar es solo de quien escribió el comentario; borrar, de quien lo escribió o de quien administra
 * (el board vuelve a exigirlo, esto solo evita ofrecer lo que daría 403). Borrar la raíz se lleva todo
 * el hilo, y la confirmación en el lugar lo dice.
 *
 * @param props el hilo, su cita y las escrituras
 * @returns la tarjeta del hilo
 */
export function HiloDelActa ({ hilo, cita, personas, esAdmin, escrituras, destacado }: PropsHilo): ReactElement {
  const [editando, setEditando] = useState<number | null>(null)
  const [confirmando, setConfirmando] = useState<number | null>(null)
  const [borrando, setBorrando] = useState(false)
  const [respondiendo, setRespondiendo] = useState(false)
  const [resolviendo, setResolviendo] = useState(false)
  const tarjeta = useRef<HTMLElement>(null)

  // El hilo tocado en el texto se trae a la vista una vez, al marcarse.
  useEffect(() => {
    if (destacado) tarjeta.current?.scrollIntoView({ block: 'nearest' })
  }, [destacado])

  async function confirmarBorrado (comentarioId: number): Promise<void> {
    setBorrando(true)
    await escrituras.borrar(comentarioId)
    setBorrando(false)
    setConfirmando(null)
  }

  async function cambiarResuelto (): Promise<void> {
    setResolviendo(true)
    await escrituras.resolver(hilo, !hilo.resolved)
    setResolviendo(false)
  }

  /** Las acciones del ⋯ de un comentario: solo «Eliminar»; «Editar» va aparte porque es del autor. */
  function accionesDe (comentario: ComentarioDeActa): AccionDeFila[] {
    if (!comentario.mine && !esAdmin) return []

    return [{
      clave: 'eliminar',
      etiqueta: 'Eliminar',
      icono: Trash2,
      peligroso: true,
      onSeleccionar: () => { setConfirmando(comentario.id) }
    }]
  }

  return (
    <article
      ref={tarjeta}
      aria-label={cita === null ? 'Hilo de comentarios' : `Hilo de comentarios sobre «${cita}»`}
      className={cn(
        'border-linea bg-superficie rounded-chico flex flex-col gap-3 border p-3',
        destacado && 'ring-acento ring-2',
        hilo.resolved && 'opacity-80'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {cita === null
          ? <p className="text-texto-tenue text-xs italic">El texto comentado ya no está en el acta.</p>
          : (
            <blockquote className="border-linea text-texto-tenue line-clamp-3 min-w-0 border-l-2 pl-2 text-xs">
              {cita}
            </blockquote>
            )}
        {hilo.resolved && <Insignia tono="exito" tamano="chico" className="shrink-0">Resuelto</Insignia>}
      </div>

      <ul className="flex flex-col gap-3">
        {hilo.comments.map((comentario) => {
          const mencionados = nombresMencionados(comentario, personas)
          const acciones = accionesDe(comentario)

          return (
            <li key={comentario.id} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <EnlacePersona
                    id={comentario.staff_id}
                    nombre={comentario.staff_name ?? 'Alguien del equipo'}
                    imagen={comentario.staff_image}
                    tamano="chico"
                    className="min-w-0 truncate text-sm font-semibold"
                  />
                  <time
                    dateTime={comentario.date_added}
                    title={formatearFecha(comentario.date_added, true)}
                    className="text-texto-sutil shrink-0 text-xs"
                  >
                    {formatearRelativo(comentario.date_added)}
                  </time>
                  {comentario.date_edited !== null && (
                    <span className="text-texto-sutil shrink-0 text-xs" title={formatearFecha(comentario.date_edited, true)}>
                      (editado)
                    </span>
                  )}
                </div>
                {(comentario.mine || acciones.length > 0) && editando !== comentario.id && (
                  <MenuAccionesFila
                    ariaLabel={`Acciones del comentario de ${comentario.staff_name ?? 'alguien del equipo'}`}
                    onEditar={comentario.mine ? () => { setEditando(comentario.id) } : undefined}
                    acciones={acciones}
                  />
                )}
              </div>

              {editando === comentario.id
                ? (
                  <EscritorDeComentario
                    etiqueta="Editar el comentario"
                    placeholder="Escribe el comentario…"
                    etiquetaEnviar="Guardar"
                    textoInicial={comentario.content}
                    mencionesIniciales={comentario.mentions}
                    personas={personas}
                    autoEnfocar
                    onEnviar={async (texto, menciones) => await escrituras.editar(comentario.id, texto, menciones)}
                    onListo={() => { setEditando(null) }}
                    onCancelar={() => { setEditando(null) }}
                  />
                  )
                : <p className="text-texto text-sm whitespace-pre-wrap">{comentario.content}</p>}

              {mencionados.length > 0 && editando !== comentario.id && (
                <p className="text-texto-tenue text-xs">Menciona a {mencionados.join(', ')}.</p>
              )}

              {confirmando === comentario.id && (
                <ConfirmacionEnLinea
                  advertencia={comentario.id === hilo.id
                    ? 'Se elimina el comentario y sus respuestas.'
                    : 'Se elimina esta respuesta.'}
                  etiquetaConfirmar="Eliminar"
                  cargando={borrando}
                  onConfirmar={() => { void confirmarBorrado(comentario.id) }}
                  onCancelar={() => { setConfirmando(null) }}
                />
              )}
            </li>
          )
        })}
      </ul>

      {respondiendo
        ? (
          <EscritorDeComentario
            etiqueta="Respuesta"
            placeholder="Escribe una respuesta…"
            etiquetaEnviar="Responder"
            personas={personas}
            autoEnfocar
            onEnviar={async (texto, menciones) => await escrituras.crear({ hilo: hilo.id }, texto, menciones)}
            onListo={() => { setRespondiendo(false) }}
            onCancelar={() => { setRespondiendo(false) }}
          />
          )
        : (
          <div className="flex items-center justify-between gap-2">
            <Boton variante="sutil" tamano="chico" onClick={() => { setRespondiendo(true) }}>Responder</Boton>
            <Boton variante="secundario" tamano="chico" cargando={resolviendo} onClick={() => { void cambiarResuelto() }}>
              {hilo.resolved
                ? <RotateCcw size={14} strokeWidth={2} aria-hidden="true" className="shrink-0" />
                : <CheckCheck size={14} strokeWidth={2} aria-hidden="true" className="shrink-0" />}
              {hilo.resolved ? 'Reabrir' : 'Resolver'}
            </Boton>
          </div>
          )}
    </article>
  )
}
