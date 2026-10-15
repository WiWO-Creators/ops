'use client'

import { useCallback } from 'react'
import { useAviso } from '@/componentes/estado/useAviso'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import type { HiloDeActa } from '@/dominio/comentarios-acta'

/** El destino de un comentario nuevo: un hilo nuevo atado a un fragmento, o la respuesta a uno que existe. */
export type DestinoDeComentario = { ancla: string } | { hilo: number }

export interface EscriturasDeComentarios {
  /**
   * Abre un hilo (con `ancla`) o responde a uno (con `hilo`).
   *
   * @returns `null` si se guardó, o el mensaje del fallo para mostrarlo junto al campo
   */
  crear: (destino: DestinoDeComentario, texto: string, menciones: readonly number[]) => Promise<string | null>
  /** Cambia el texto y las menciones de un comentario propio. Devuelve `null` o el mensaje del fallo. */
  editar: (comentarioId: number, texto: string, menciones: readonly number[]) => Promise<string | null>
  /** Resuelve el hilo o lo reabre. Avisa por toast; devuelve si se hizo. */
  resolver: (hilo: HiloDeActa, resuelto: boolean) => Promise<boolean>
  /** Borra un comentario (si es la raíz, el hilo entero). Avisa por toast; devuelve si se hizo. */
  borrar: (comentarioId: number) => Promise<boolean>
}

interface OpcionesDeEscrituras {
  /** Ruta del acta (`projects/{id}/actas/{actaId}`). */
  ruta: string
  /** Pone el hilo que devolvió la API en la lista. */
  aplicarHilo: (hilo: HiloDeActa) => void
  /** Saca de la lista el comentario borrado. */
  quitarComentario: (comentarioId: number) => void
  /** Se borró un hilo: si hay un editor abierto, quita la marca del texto (en lectura no hay nada que hacer). */
  alBorrarHilo: (ancla: string) => void
  /** Los hilos de ahora, para saber si el borrado fue de una raíz. */
  hilos: readonly HiloDeActa[]
}

/**
 * Las escrituras de los comentarios en línea: crear, responder, editar, resolver y borrar.
 *
 * Ninguna es optimista: lo que se pinta es lo que el board confirmó, y cada escritura devuelve el
 * hilo entero ya con su forma final, que es lo que se pone en la lista. Los fallos de crear y editar
 * vuelven como texto para mostrarlos junto al campo (donde la persona los puede corregir); resolver y
 * borrar avisan por el toast común.
 *
 * @param opciones la ruta del acta y cómo poner al día la lista
 * @returns las cuatro escrituras
 */
export function useEscriturasDeComentarios ({ ruta, aplicarHilo, quitarComentario, alBorrarHilo, hilos }: OpcionesDeEscrituras): EscriturasDeComentarios {
  const aviso = useAviso()
  const base = `${ruta}/comentarios`

  const crear = useCallback<EscriturasDeComentarios['crear']>(async (destino, texto, menciones) => {
    const cuerpo = 'ancla' in destino
      ? { content: texto, anchor: destino.ancla, mentions: menciones }
      : { content: texto, hilo: destino.hilo, mentions: menciones }
    const resultado = await escribirEnBff<HiloDeActa>(base, 'POST', cuerpo)

    if (!resultado.ok) return resultado.mensaje

    aplicarHilo(resultado.datos)

    return null
  }, [base, aplicarHilo])

  const editar = useCallback<EscriturasDeComentarios['editar']>(async (comentarioId, texto, menciones) => {
    const resultado = await escribirEnBff<HiloDeActa>(`${base}/${comentarioId}`, 'PATCH', { content: texto, mentions: menciones })

    if (!resultado.ok) return resultado.mensaje

    aplicarHilo(resultado.datos)

    return null
  }, [base, aplicarHilo])

  const resolver = useCallback<EscriturasDeComentarios['resolver']>(async (hilo, resuelto) => {
    const resultado = await escribirEnBff<HiloDeActa>(`${base}/${hilo.id}/resolver`, 'POST', { resolved: resuelto })

    if (!resultado.ok) {
      aviso.error(resultado.mensaje)

      return false
    }

    aplicarHilo(resultado.datos)
    aviso.exito(resuelto ? 'Comentario resuelto.' : 'Comentario reabierto.')

    return true
    // `aviso` es estable (funciones de módulo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, aplicarHilo])

  const borrar = useCallback<EscriturasDeComentarios['borrar']>(async (comentarioId) => {
    const raiz = hilos.find((hilo) => hilo.id === comentarioId)
    const resultado = await escribirEnBff<null>(`${base}/${comentarioId}`, 'DELETE')

    if (!resultado.ok) {
      aviso.error(resultado.mensaje)

      return false
    }

    quitarComentario(comentarioId)

    if (raiz !== undefined) alBorrarHilo(raiz.anchor)
    aviso.exito(raiz === undefined ? 'Respuesta eliminada.' : 'Comentario eliminado.')

    return true
    // `aviso` es estable (funciones de módulo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, hilos, quitarComentario, alBorrarHilo])

  return { crear, editar, resolver, borrar }
}
