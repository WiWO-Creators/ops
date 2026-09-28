'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motivoParaNoSubir, subidasParaArrancar, usaSubidaDirecta, type EstadoSubida } from '@/dominio/drive-explorador'
import { subirConAvance } from '@/componentes/archivos/red-drive'
import { subirDirectoAGoogle, type SesionEnCurso } from '@/componentes/archivos/subida-resumable-drive'
import type { ArchivoDriveSubido, MigaDrive, NodoDrive } from '@/datos/recursos'

/** Una subida de la bandeja. El `File` no vive acá: queda en una referencia, fuera del estado. */
export interface SubidaDrive {
  id: string
  nombre: string
  tamano: number
  destino: MigaDrive
  estado: EstadoSubida
  /** Fracción enviada, de 0 a 1. */
  avance: number
  error?: string
  /** `false` si el navegador ya la descartó (tamaño): reintentar daría lo mismo. */
  reintentable: boolean
}

export interface SubidasDrive {
  subidas: SubidaDrive[]
  encolar: (archivos: readonly File[], destino: MigaDrive) => void
  cancelar: (id: string) => void
  reintentar: (id: string) => void
  /** Saca de la bandeja lo que ya terminó, bien o mal. */
  limpiar: () => void
}

/** Cambio mínimo de avance que vale un nuevo pintado: los eventos llegan decenas por segundo. */
const PASO_DE_AVANCE = 0.02

let correlativo = 0

/** Convierte la respuesta de subida en un nodo, para insertarlo sin volver a pedir la carpeta. */
function nodoDeSubida (subido: ArchivoDriveSubido): NodoDrive {
  return {
    id: subido.drive_file_id,
    name: subido.name,
    is_folder: subido.is_folder,
    web_view_link: subido.web_view_link,
    uploaded_by: subido.uploaded_by,
    size_bytes: subido.size_bytes,
    mime_type: subido.mime_type,
    modified_time: subido.dateadded,
    locked: false
  }
}

/**
 * La cola de subidas del explorador: varios archivos, tres a la vez, con avance y cancelación.
 *
 * Cada archivo va en su propio pedido —el endpoint recibe uno— y su error queda junto a él: una
 * extensión rechazada no frena al resto. Lo que termina bien se entrega con la carpeta de destino,
 * que puede no ser la que se está mirando: la persona pudo haber navegado mientras subía.
 *
 * @param alSubir recibe el nodo creado y la carpeta donde quedó
 */
export function useSubidasDrive (alSubir: (destinoId: string, nodo: NodoDrive) => void): SubidasDrive {
  const [subidas, setSubidas] = useState<SubidaDrive[]>([])
  // Copia síncrona de la cola: decidir qué arranca necesita el estado de ESTE instante, no el del
  // último pintado, o dos subidas que terminan juntas arrancan dos veces la misma pendiente.
  const cola = useRef<SubidaDrive[]>([])
  const archivos = useRef(new Map<string, File>())
  const controles = useRef(new Map<string, AbortController>())
  // Sesiones resumables abiertas, por id: sobreviven a un intento fallido para que el reintento
  // reanude desde el último byte que Google confirmó, en vez de mandar el archivo de nuevo entero.
  const sesionesDirectas = useRef(new Map<string, SesionEnCurso>())
  const alSubirActual = useRef(alSubir)

  useEffect(() => { alSubirActual.current = alSubir }, [alSubir])

  useEffect(() => {
    const enCurso = controles.current
    return () => { for (const control of enCurso.values()) control.abort() }
  }, [])

  // Avisa antes de cerrar o navegar fuera de la pestaña mientras algo sigue en la cola: perder una
  // subida a mitad de camino, sobre todo un video de varios cientos de MB, es caro de rehacer.
  useEffect(() => {
    function alSalir (evento: BeforeUnloadEvent): void {
      const hayAlgoVivo = cola.current.some((subida) => subida.estado === 'pendiente' || subida.estado === 'subiendo')
      if (!hayAlgoVivo) return
      evento.preventDefault()
      evento.returnValue = ''
    }
    window.addEventListener('beforeunload', alSalir)
    return () => { window.removeEventListener('beforeunload', alSalir) }
  }, [])

  const cambiar = useCallback((cambio: (actuales: SubidaDrive[]) => SubidaDrive[]) => {
    cola.current = cambio(cola.current)
    setSubidas(cola.current)
  }, [])

  const actualizar = useCallback((id: string, cambio: Partial<SubidaDrive>) => {
    cambiar((actuales) => actuales.map((subida) => (subida.id === id ? { ...subida, ...cambio } : subida)))
  }, [cambiar])

  /** Arranca lo pendiente mientras haya hueco. Se llama al encolar, al reintentar y al terminar cada una. */
  const bombear = useRef<() => void>(() => {})

  const arrancar = useCallback((subida: SubidaDrive): void => {
    const archivo = archivos.current.get(subida.id)
    if (archivo === undefined) {
      actualizar(subida.id, { estado: 'error', error: 'Se perdió el archivo: vuelve a elegirlo.' })
      return
    }

    const control = new AbortController()
    controles.current.set(subida.id, control)
    let ultimo = 0

    const alAvanzar = (fraccion: number): void => {
      if (fraccion - ultimo < PASO_DE_AVANCE && fraccion < 1) return
      ultimo = fraccion
      actualizar(subida.id, { avance: fraccion })
    }

    // Por debajo del umbral: multipart legado vía PHP, con reintento simple (manda el archivo
    // entero de nuevo). Por encima: sesión resumable directa a Google, con reintento que reanuda
    // desde el último byte confirmado — ver `subirDirectoAGoogle`.
    const promesa = usaSubidaDirecta(archivo)
      ? subirDirectoAGoogle(
        subida.destino.id, archivo,
        (bytesEnviados, total) => { alAvanzar(total === 0 ? 0 : bytesEnviados / total) },
        control.signal,
        sesionesDirectas.current.get(subida.id),
        (sesion) => { sesionesDirectas.current.set(subida.id, sesion) }
      )
      : subirConAvance(subida.destino.id, archivo, alAvanzar, control.signal)

    void promesa.then((resultado) => {
      controles.current.delete(subida.id)

      if (resultado.ok) {
        archivos.current.delete(subida.id)
        sesionesDirectas.current.delete(subida.id)
        actualizar(subida.id, { estado: 'lista', avance: 1 })
        alSubirActual.current(subida.destino.id, nodoDeSubida(resultado.datos))
      } else {
        // Un 403 o un 422 (extensión, tamaño) no cambian al reintentar: el botón solo se ofrece
        // cuando el fallo pudo ser pasajero (red, 5xx) o la subida se canceló.
        const definitivo = resultado.estado === 403 || resultado.estado === 422
        const reintentable = 'reintentable' in resultado && typeof resultado.reintentable === 'boolean' ? resultado.reintentable : !definitivo
        if (resultado.cancelada === true) sesionesDirectas.current.delete(subida.id)
        actualizar(subida.id, resultado.cancelada === true
          ? { estado: 'cancelada' }
          : { estado: 'error', error: resultado.mensaje, reintentable })
      }
      bombear.current()
    })
  }, [actualizar])

  useEffect(() => {
    // Se marca `subiendo` en el mismo cambio que lo decide: una segunda llamada inmediata ya no ve
    // esas pendientes y no las arranca dos veces.
    bombear.current = () => {
      const ids = subidasParaArrancar(cola.current)
      if (ids.length === 0) return
      cambiar((actuales) => actuales.map((subida) => (ids.includes(subida.id) ? { ...subida, estado: 'subiendo', avance: 0 } : subida)))
      for (const subida of cola.current) {
        if (ids.includes(subida.id)) arrancar(subida)
      }
    }
  }, [cambiar, arrancar])

  const encolar = useCallback((lista: readonly File[], destino: MigaDrive) => {
    const nuevas = lista.map((archivo): SubidaDrive => {
      correlativo += 1
      const id = `subida-${correlativo}`
      const motivo = motivoParaNoSubir(archivo)
      if (motivo === null) archivos.current.set(id, archivo)

      return {
        id,
        nombre: archivo.name,
        tamano: archivo.size,
        destino,
        estado: motivo === null ? 'pendiente' : 'error',
        avance: 0,
        reintentable: motivo === null,
        ...(motivo === null ? {} : { error: motivo })
      }
    })

    cambiar((actuales) => [...actuales, ...nuevas])
    bombear.current()
  }, [cambiar])

  const cancelar = useCallback((id: string) => {
    const control = controles.current.get(id)
    if (control !== undefined) {
      control.abort()
      return
    }
    actualizar(id, { estado: 'cancelada' })
  }, [actualizar])

  const reintentar = useCallback((id: string) => {
    if (!archivos.current.has(id)) return
    actualizar(id, { estado: 'pendiente', avance: 0, error: undefined })
    bombear.current()
  }, [actualizar])

  const limpiar = useCallback(() => {
    cambiar((actuales) => actuales.filter((subida) => {
      const viva = subida.estado === 'pendiente' || subida.estado === 'subiendo'
      if (!viva) {
        archivos.current.delete(subida.id)
        sesionesDirectas.current.delete(subida.id)
      }
      return viva
    }))
  }, [cambiar])

  return { subidas, encolar, cancelar, reintentar, limpiar }
}
