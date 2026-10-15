'use client'

import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { useAviso } from '@/componentes/estado/useAviso'
import { Cajon, ContenidoCajon } from '@/componentes/superposiciones/Cajon'
import { cargarAsignables } from '@/datos/asignables'
import type { StaffReferencia } from '@/datos/tipos'
import { citaDeAncla, repartirHilos } from '@/dominio/comentarios-acta'
import { GLOSARIO } from '@/dominio/glosario'
import { EscritorDeComentario } from './EscritorDeComentario'
import { HiloDelActa } from './HiloDelActa'
import type { ComentariosEnElActa } from './useComentariosEnElActa'
import { useEscriturasDeComentarios } from './useEscriturasDeComentarios'
import type { HilosDelActa } from './useHilosDelActa'

/** Cómo se llama el documento en los textos de este panel; sale del glosario. */
const DOCUMENTO = GLOSARIO.acta.singular

interface PropsComentarios {
  /** Ruta del acta (`projects/{id}/actas/{actaId}`). */
  ruta: string
  /** Los hilos del acta, ya cargados y al día (`useHilosDelActa`). */
  hilos: HilosDelActa
  /** El estado de la interfaz de comentarios (`useComentariosEnElActa`). */
  estado: ComentariosEnElActa
  /** El contenido del acta que se está viendo: de ahí se cita el texto comentado cuando no hay editor. */
  html: string
  /** Quien mira administra: puede borrar comentarios ajenos (el board lo vuelve a exigir). */
  esAdmin: boolean
  /** Se corrige con el editor de siempre: la marca del fragmento solo queda con «Guardar». */
  marcaSinGuardar: boolean
}

/**
 * El panel lateral de comentarios en línea del Meeting Paper.
 *
 * Lista los hilos —los abiertos primero y los resueltos plegados— y, cuando se acaba de marcar un
 * fragmento, abre arriba el cuadro del primer comentario. Crear un hilo solo se hace desde el editor
 * (hay que elegir un fragmento); leer, responder, resolver y borrar, también con el acta cerrada.
 *
 * El contenido solo existe mientras el panel está abierto (Radix desmonta al cerrar). Cerrar con un
 * comentario sin enviar lo descarta junto con su marca en el texto.
 *
 * @param props los hilos, el estado de la interfaz y el contenido del acta
 * @returns el panel
 */
export function ComentariosDelActa ({ estado, ...resto }: PropsComentarios): ReactElement {
  return (
    <Cajon open={estado.abierto} onOpenChange={(siguiente) => { if (!siguiente) estado.cerrar() }}>
      <ContenidoCajon
        titulo="Comentarios"
        descripcion={`Conversaciones sobre fragmentos del ${DOCUMENTO}.`}
        className="sm:w-[30rem]"
      >
        <ContenidoDeComentarios estado={estado} {...resto} />
      </ContenidoCajon>
    </Cajon>
  )
}

/** Lo mismo que el panel, sin el marco: el cuadro del comentario nuevo y la lista de hilos. */
function ContenidoDeComentarios ({ ruta, hilos, estado, html, esAdmin, marcaSinGuardar }: PropsComentarios): ReactElement {
  const aviso = useAviso()
  const [personas, setPersonas] = useState<StaffReferencia[]>([])
  const escrituras = useEscriturasDeComentarios({
    ruta,
    aplicarHilo: hilos.aplicarHilo,
    quitarComentario: hilos.quitarComentario,
    alBorrarHilo: estado.quitarMarca,
    hilos: hilos.hilos
  })
  const { abiertos, resueltos } = useMemo(() => repartirHilos(hilos.hilos), [hilos.hilos])
  const pendiente = estado.pendiente

  // Las menciones son opcionales: si el catálogo no llega, el cuadro se dibuja sin el selector.
  useEffect(() => {
    let vivo = true

    void cargarAsignables()
      .then((lista) => { if (vivo) setPersonas(lista) })
      .catch(() => undefined)

    return () => { vivo = false }
  }, [])

  /** El texto comentado: del editor si está abierto (es lo más reciente), si no del acta que se ve. */
  function citaDe (ancla: string): string | null {
    return estado.control !== null ? estado.control.cita(ancla) : citaDeAncla(html, ancla)
  }

  /** Avisa que el comentario quedó guardado, y que en el editor de siempre el fragmento pide «Guardar». */
  function alPublicar (): void {
    estado.resolverPendiente()
    aviso.exito(marcaSinGuardar
      ? `Comentario publicado. Guarda el ${DOCUMENTO} para que el fragmento quede marcado.`
      : 'Comentario publicado.')
  }

  return (
    <div className="flex min-h-full flex-col gap-4">
      {pendiente !== null && (
        <section aria-label="Comentario nuevo" className="border-acento bg-superficie flex flex-col gap-3 rounded-chico border p-3">
          <blockquote className="border-linea text-texto-tenue line-clamp-3 border-l-2 pl-2 text-xs">
            {pendiente.cita}
          </blockquote>
          <EscritorDeComentario
            etiqueta="Comentario"
            placeholder="Escribe un comentario sobre este fragmento…"
            etiquetaEnviar="Comentar"
            personas={personas}
            autoEnfocar
            onEnviar={async (texto, menciones) => await escrituras.crear({ ancla: pendiente.ancla }, texto, menciones)}
            onListo={alPublicar}
            onCancelar={estado.descartarPendiente}
          />
        </section>
      )}

      {hilos.fase === 'cargando' && <Cargando alto="min-h-48" mensaje="Cargando los comentarios…" />}
      {hilos.fase === 'error' && <ErrorEstado detalle={hilos.error ?? undefined} onReintentar={hilos.recargar} />}

      {hilos.fase === 'listo' && hilos.hilos.length === 0 && pendiente === null && (
        <Vacio
          titulo="Todavía no hay comentarios"
          descripcion={`Para comentar, pulsa «Corregir» y elige un fragmento del ${DOCUMENTO}.`}
        />
      )}

      {hilos.fase === 'listo' && abiertos.length === 0 && resueltos.length > 0 && pendiente === null && (
        <p className="text-texto-tenue text-sm">No quedan comentarios sin resolver.</p>
      )}

      {abiertos.map((hilo) => (
        <HiloDelActa
          key={hilo.id}
          hilo={hilo}
          cita={citaDe(hilo.anchor)}
          personas={personas}
          esAdmin={esAdmin}
          escrituras={escrituras}
          destacado={estado.elegida === hilo.anchor}
        />
      ))}

      {resueltos.length > 0 && (
        // Abierto a la fuerza solo cuando el hilo tocado en el texto está entre los resueltos: plegado,
        // no se podría traer a la vista.
        <details className="flex flex-col gap-3" open={resueltos.some((hilo) => hilo.anchor === estado.elegida) || undefined}>
          <summary className="text-texto-tenue hover:text-texto cursor-pointer text-sm font-semibold">
            Resueltos ({resueltos.length})
          </summary>
          <div className="mt-3 flex flex-col gap-4">
            {resueltos.map((hilo) => (
              <HiloDelActa
                key={hilo.id}
                hilo={hilo}
                cita={citaDe(hilo.anchor)}
                personas={personas}
                esAdmin={esAdmin}
                escrituras={escrituras}
                destacado={estado.elegida === hilo.anchor}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
