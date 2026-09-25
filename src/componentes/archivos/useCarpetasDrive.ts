'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { pedirSobre } from '@/datos/cliente'
import { puedeEscribirEn } from '@/dominio/drive-arbol'
import { reubicarRutas } from '@/dominio/drive-explorador'
import { rutaDeCarpeta } from '@/componentes/archivos/red-drive'
import type { CarpetaDrive, ContenidoCarpetaDrive, MigaDrive, NodoDrive } from '@/datos/recursos'

/** Lo que se sabe de una carpeta: su primera carga, su error o sus hijos. */
export type EntradaCarpeta =
  | { fase: 'cargando' }
  | { fase: 'error', mensaje: string }
  | { fase: 'listo', hijos: NodoDrive[], canWrite: boolean, refrescando: boolean }

/** Cambio sobre la lista de hijos de una carpeta, aplicado sobre la versión más reciente. */
export type CambioHijos = (hijos: NodoDrive[]) => NodoDrive[]

export interface CarpetasDrive {
  carpetas: Readonly<Record<string, EntradaCarpeta>>
  /** Ruta conocida de cada carpeta: raíz primero, ella incluida. */
  rutas: Readonly<Record<string, MigaDrive[]>>
  /** Pide una carpeta. Si ya está, la refresca por detrás sin taparla. */
  cargar: (id: string) => void
  /** Corta el pedido en curso de una carpeta que se dejó de mirar. */
  soltar: (id: string) => void
  cambiarHijos: (id: string, cambio: CambioHijos) => void
  /** Anota el nombre nuevo de una carpeta en todas las rutas donde aparece. */
  renombrarEnRutas: (id: string, nombre: string) => void
  /** Anota que una carpeta ahora cuelga de otra. */
  reubicar: (id: string, nombre: string, destinoId: string) => void
  /** Anota la ruta de una carpeta que todavía no tenía (recién creada, por ejemplo). */
  anotarRuta: (id: string, ruta: MigaDrive[]) => void
}

/** La ruta de cada hija de una carpeta, a partir de la ruta de la carpeta. */
function rutasDeHijas (ruta: readonly MigaDrive[] | undefined, hijos: readonly NodoDrive[]): Record<string, MigaDrive[]> {
  if (ruta === undefined) return {}

  const rutas: Record<string, MigaDrive[]> = {}
  for (const hijo of hijos) {
    if (hijo.is_folder) rutas[hijo.id] = [...ruta, { id: hijo.id, name: hijo.name }]
  }
  return rutas
}

/**
 * Las carpetas que el explorador ya conoce, por id, y la ruta de cada una.
 *
 * Es una caché por carpeta y no "el contenido de la carpeta actual" a propósito: una respuesta que
 * llega tarde —se navegó rápido, o una subida terminó después de cambiar de carpeta— cae en SU
 * carpeta y nunca en la que se está mirando. Volver a una carpeta ya vista la muestra al instante y
 * la refresca por detrás.
 *
 * La ruta sale del recorrido (cada hija hereda la de su madre) y, cuando la API manda `breadcrumbs`,
 * de ahí: así un enlace directo o un backend que renombra por su cuenta no dejan migas viejas. El
 * primer paso conserva siempre el nombre local de la raíz.
 *
 * @param raiz la carpeta de la entidad, tal como la trajo `GET /{raiz}/{id}/drive`
 * @param raizNombre cómo se llama la raíz en las migas
 */
export function useCarpetasDrive (raiz: CarpetaDrive, raizNombre: string): CarpetasDrive {
  // Con `error` Drive no respondió y `children` viene vacío: mostrarlo como carpeta vacía invitaría a
  // subir a una carpeta que no se pudo leer. Entra como error, y reintentar la pide de nuevo.
  const [carpetas, setCarpetas] = useState<Record<string, EntradaCarpeta>>(() => ({
    [raiz.id]: typeof raiz.error === 'string' && raiz.error !== ''
      ? { fase: 'error', mensaje: raiz.error }
      : { fase: 'listo', hijos: raiz.children, canWrite: puedeEscribirEn(raiz), refrescando: false }
  }))
  const [rutas, setRutas] = useState<Record<string, MigaDrive[]>>(() => {
    const rutaRaiz = [{ id: raiz.id, name: raizNombre }]
    return { [raiz.id]: rutaRaiz, ...rutasDeHijas(rutaRaiz, raiz.children) }
  })
  const pedidos = useRef(new Map<string, AbortController>())

  useEffect(() => {
    const enCurso = pedidos.current
    return () => {
      for (const control of enCurso.values()) control.abort()
      enCurso.clear()
    }
  }, [])

  const anotarRespuesta = useCallback((id: string, contenido: ContenidoCarpetaDrive) => {
    setCarpetas((actuales) => ({
      ...actuales,
      [id]: { fase: 'listo', hijos: contenido.children, canWrite: puedeEscribirEn(contenido), refrescando: false }
    }))

    setRutas((actuales) => {
      const migas = contenido.breadcrumbs
      const propia = migas !== undefined && migas.length > 0 && migas[0]?.id === raiz.id
        ? [{ id: raiz.id, name: raizNombre }, ...migas.slice(1)]
        : actuales[id]

      return { ...actuales, ...(propia === undefined ? {} : { [id]: propia }), ...rutasDeHijas(propia, contenido.children) }
    })
  }, [raiz.id, raizNombre])

  const cargar = useCallback((id: string) => {
    if (pedidos.current.has(id)) return

    const control = new AbortController()
    pedidos.current.set(id, control)

    setCarpetas((actuales) => {
      const actual = actuales[id]
      const siguiente: EntradaCarpeta = actual?.fase === 'listo' ? { ...actual, refrescando: true } : { fase: 'cargando' }
      return { ...actuales, [id]: siguiente }
    })

    void pedirSobre<ContenidoCarpetaDrive>(rutaDeCarpeta(id), control.signal)
      .then((sobre) => {
        if (control.signal.aborted) return
        anotarRespuesta(id, sobre.data)
      })
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return
        const mensaje = fallo instanceof Error ? fallo.message : 'No se pudo cargar esta carpeta.'
        setCarpetas((actuales) => {
          const actual = actuales[id]
          // Un refresco que falla no borra lo que ya se veía: queda lo último que se supo.
          const siguiente: EntradaCarpeta = actual?.fase === 'listo' ? { ...actual, refrescando: false } : { fase: 'error', mensaje }
          return { ...actuales, [id]: siguiente }
        })
      })
      .finally(() => {
        if (pedidos.current.get(id) === control) pedidos.current.delete(id)
      })
  }, [anotarRespuesta])

  const soltar = useCallback((id: string) => {
    const control = pedidos.current.get(id)
    if (control === undefined) return

    control.abort()
    pedidos.current.delete(id)
    setCarpetas((actuales) => {
      const actual = actuales[id]
      if (actual === undefined) return actuales
      if (actual.fase === 'listo') return { ...actuales, [id]: { ...actual, refrescando: false } }

      // Una primera carga cortada no deja nada: la próxima visita la vuelve a pedir.
      const { [id]: _cortada, ...resto } = actuales
      return resto
    })
  }, [])

  const cambiarHijos = useCallback((id: string, cambio: CambioHijos) => {
    setCarpetas((actuales) => {
      const actual = actuales[id]
      if (actual?.fase !== 'listo') return actuales
      return { ...actuales, [id]: { ...actual, hijos: cambio(actual.hijos) } }
    })
  }, [])

  const renombrarEnRutas = useCallback((id: string, nombre: string) => {
    setRutas((actuales) => {
      const nuevas: Record<string, MigaDrive[]> = {}
      for (const [clave, ruta] of Object.entries(actuales)) {
        nuevas[clave] = ruta.map((miga) => (miga.id === id ? { id, name: nombre } : miga))
      }
      return nuevas
    })
  }, [])

  const reubicar = useCallback((id: string, nombre: string, destinoId: string) => {
    setRutas((actuales) => {
      const destino = actuales[destinoId]
      if (destino === undefined) return actuales
      return reubicarRutas({ ...actuales, [id]: actuales[id] ?? [{ id, name: nombre }] }, id, [...destino, { id, name: nombre }])
    })
  }, [])

  const anotarRuta = useCallback((id: string, ruta: MigaDrive[]) => {
    setRutas((actuales) => (actuales[id] === undefined ? { ...actuales, [id]: ruta } : actuales))
  }, [])

  return { carpetas, rutas, cargar, soltar, cambiarHijos, renombrarEnRutas, reubicar, anotarRuta }
}
