'use client'

import { useCallback, useState } from 'react'
import { cn } from '@/lib/clases'
import { coloresAvatar, iniciales } from '@/lib/personas'

const TAMANOS = {
  chico: 'size-6 text-[0.625rem]',
  medio: 'size-8 text-xs',
  grande: 'size-10 text-sm'
} as const

export type TamanoAvatar = keyof typeof TAMANOS

interface PropsAvatar {
  nombre: string
  imagen?: string | null
  tamano?: TamanoAvatar
  className?: string
}

/**
 * Avatar de una persona: su foto, o sus iniciales sobre un color derivado del nombre.
 *
 * En tamaño chico muestra UNA sola inicial: dos letras en un circulo de 24px se cortan, y mas todavia
 * dentro de un grupo apilado, donde el avatar siguiente tapa el borde.
 *
 * Si la imagen falla al cargar, cae a las iniciales en vez de dejar el hueco roto. Es el caso comun
 * cuando `uploads/` tiene rutas que ya no existen, que en el panel actual pasa seguido.
 */
export function Avatar ({ nombre, imagen, tamano = 'medio', className }: PropsAvatar) {
  const [fallo, setFallo] = useState(false)
  const mostrarImagen = typeof imagen === 'string' && imagen.length > 0 && !fallo

  /**
   * Detecta una imagen que ya fallo antes de que React adjuntara `onError`.
   *
   * El HTML llega del servidor y el navegador empieza a cargar la imagen de inmediato; si el 404
   * ocurre antes de la hidratacion, el evento `error` se dispara sin oyente y se pierde para siempre.
   * `complete` con `naturalWidth` en 0 es justamente esa combinacion: termino de cargar y no hay
   * imagen. Es el caso comun con rutas de `uploads/` que ya no existen.
   */
  const detectarFalloPrevio = useCallback((elemento: HTMLImageElement | null) => {
    if (elemento?.complete && elemento.naturalWidth === 0) setFallo(true)
  }, [])

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold select-none',
        TAMANOS[tamano],
        className
      )}
      style={
        mostrarImagen
          ? undefined
          : { backgroundColor: coloresAvatar(nombre).fondo, color: coloresAvatar(nombre).texto }
      }
      title={nombre}
    >
      {mostrarImagen
        ? (
          /* Las fotos vienen de `uploads/` del panel, con tamaño desconocido y sin loader
             configurado, asi que `next/image` no puede optimizarlas: solo agregaria una capa. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={detectarFalloPrevio}
            src={imagen}
            alt={nombre}
            className="size-full object-cover"
            onError={() => setFallo(true)}
          />
          )
        : iniciales(nombre, tamano === 'chico' ? 1 : 2)}
    </span>
  )
}

interface PropsGrupoAvatares {
  personas: { id: number, full_name: string, profile_image_url?: string | null }[]
  tamano?: TamanoAvatar
  /** Cuantos se muestran antes del contador. */
  maximo?: number
  className?: string
}

/**
 * Pila de avatares con contador de excedente.
 *
 * En Procesos con muchos asignados, mostrarlos todos rompe el alto de la fila de la tabla. El
 * contador conserva la informacion sin romper el layout, y el `title` la deja accesible.
 */
export function GrupoAvatares ({ personas, tamano = 'chico', maximo = 3, className }: PropsGrupoAvatares) {
  if (personas.length === 0) {
    return <span className="text-texto-sutil text-xs">Sin asignar</span>
  }

  const visibles = personas.slice(0, maximo)
  const restantes = personas.length - visibles.length

  return (
    <span className={cn('inline-flex items-center', className)}>
      {visibles.map((persona) => (
        <Avatar
          key={persona.id}
          nombre={persona.full_name}
          imagen={persona.profile_image_url}
          tamano={tamano}
          className="ring-superficie-elevada -ml-1 ring-2 first:ml-0"
        />
      ))}
      {restantes > 0 && (
        <span
          className={cn(
            'bg-relleno-neutro text-texto-tenue ring-superficie-elevada -ml-1 inline-flex items-center justify-center rounded-full font-semibold ring-2',
            TAMANOS[tamano]
          )}
          title={personas.slice(maximo).map((p) => p.full_name).join(', ')}
        >
          +{restantes}
        </span>
      )}
    </span>
  )
}
