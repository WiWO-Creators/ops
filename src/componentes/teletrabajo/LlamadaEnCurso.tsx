'use client'

import { usePathname, useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { Llamada } from './Llamada'
import type { EleccionDeEntrada, Quien } from './tipos'

/** Todo lo que hace falta para conectar a una sala, ya autorizado y firmado por el servidor. */
export interface DatosDeLlamada {
  /** Nombre de la sala en LiveKit, el mismo segmento de la ruta `/teletrabajo/[sala]`. */
  sala: string
  token: string
  url: string
  titulo: string
  esPrivada: boolean
  yo: Quien
  miIdentidad: string
  eleccion: EleccionDeEntrada
}

/** La llamada viva, con un numero propio para distinguirla de la anterior a la misma sala. */
interface LlamadaActiva extends DatosDeLlamada {
  id: number
}

interface ValorLlamadaEnCurso {
  /** La llamada conectada ahora, o `null` si no hay ninguna. */
  activa: DatosDeLlamada | null
  /** Conecta a una sala. Si ya habia una llamada, la corta: se esta en una sola a la vez. */
  iniciar: (datos: DatosDeLlamada) => void
}

const ContextoLlamadaEnCurso = createContext<ValorLlamadaEnCurso | null>(null)

/**
 * La llamada de Teletrabajo en curso, para quien tiene que saber si hay una.
 *
 * @returns La llamada activa y la forma de iniciar otra.
 * @throws Error si se usa fuera de `LlamadaEnCurso`: sin proveedor no hay donde vivir la llamada.
 */
export function useLlamadaEnCurso (): ValorLlamadaEnCurso {
  const valor = useContext(ContextoLlamadaEnCurso)
  if (valor === null) throw new Error('useLlamadaEnCurso necesita a <LlamadaEnCurso> más arriba en el árbol.')

  return valor
}

/**
 * Ruta de la pantalla de una sala.
 *
 * @param sala Nombre de la sala.
 * @returns La ruta del panel donde se ve esa llamada en grande.
 */
export function rutaDeSala (sala: string): string {
  return `/teletrabajo/${encodeURIComponent(sala)}`
}

/**
 * Hogar de la videollamada: la mantiene conectada mientras la persona navega por el panel.
 *
 * Antes la llamada vivia dentro de la pagina `/teletrabajo/[sala]`, y cambiar de pantalla la
 * desmontaba: la conexion se cortaba en el acto (WIW-0463). Aca vive en el armazon, que no se
 * desmonta al navegar, y la pagina de la sala solo decide si mostrarla en grande.
 *
 * Donde se ve depende de la ruta, y de nada mas:
 * - En `/teletrabajo/<la sala>`, la llamada entera ocupa el lugar de la pagina.
 * - En cualquier otra pantalla, la llamada entera queda montada pero oculta —el chat sigue contando
 *   mensajes y los videos no se reconectan al volver— y abajo flota la mini llamada.
 *
 * Tiene que ir dentro del contenedor que scrollea y despues de la pagina: la llamada en grande se
 * dibuja justo donde se dibujaria la pagina, con el mismo relleno.
 */
export function LlamadaEnCurso ({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const ruta = usePathname()
  const [activa, setActiva] = useState<LlamadaActiva | null>(null)
  const siguienteId = useRef(1)
  // Copia de `activa.id` que se lee fuera del render, en los avisos que llegan de LiveKit.
  const idActivo = useRef<number | null>(null)

  const iniciar = useCallback((datos: DatosDeLlamada) => {
    const id = siguienteId.current++
    idActivo.current = id
    setActiva({ ...datos, id })
  }, [])

  /**
   * Corta la llamada `id`, si sigue siendo la activa.
   *
   * La comparacion no es un exceso de cuidado: al desmontar una llamada vieja LiveKit todavia puede
   * avisar su desconexion, y sin ella ese aviso tardio colgaria la llamada nueva.
   *
   * @returns `true` si la corto; `false` si ya no era la activa y no hizo nada.
   */
  const terminar = useCallback((id: number): boolean => {
    if (idActivo.current !== id) return false

    idActivo.current = null
    setActiva(null)

    return true
  }, [])

  const valor = useMemo<ValorLlamadaEnCurso>(() => ({ activa, iniciar }), [activa, iniciar])

  const enSala = activa !== null && ruta === rutaDeSala(activa.sala)

  return (
    <ContextoLlamadaEnCurso.Provider value={valor}>
      {children}
      {activa !== null && (
        <Llamada
          // Una llamada nueva es otra conexion: la clave obliga a desmontar la anterior entera.
          key={activa.id}
          token={activa.token}
          url={activa.url}
          titulo={activa.titulo}
          esPrivada={activa.esPrivada}
          yo={activa.yo}
          miIdentidad={activa.miIdentidad}
          eleccion={activa.eleccion}
          enSala={enSala}
          alVolver={() => { router.push(rutaDeSala(activa.sala)) }}
          alSalir={() => {
            // Salir desde la sala devuelve a la lista; desde otra pantalla, la deja donde esta.
            if (terminar(activa.id) && enSala) router.push('/teletrabajo')
          }}
        />
      )}
    </ContextoLlamadaEnCurso.Provider>
  )
}
