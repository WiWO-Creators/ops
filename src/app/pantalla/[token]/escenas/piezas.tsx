import type { ReactNode } from 'react'
import { cn } from '@/lib/clases'
import { coloresAvatar, iniciales } from '@/lib/personas'

/**
 * Las piezas que comparten las escenas de la pantalla de area.
 *
 * Existen aparte de `src/componentes/presentadores/` por una sola razon, y es la que gobierna todo
 * este directorio: aquellos componentes miden en pixeles fijos (`size-8`, `text-xs`), que es lo
 * correcto para un monitor a medio metro y lo incorrecto para un televisor a cuatro metros que ademas
 * puede reportar cualquier resolucion CSS. Acá todo mide en `vmin`.
 */

/**
 * Avatar grande, para leerse de lejos.
 *
 * Reusa `iniciales()` y `coloresAvatar()` de `@/lib/personas`, que son las mismas funciones que usa el
 * panel: dos personas tienen el mismo color en las dos pantallas, y el color no se reinventa acá.
 *
 * No usa `next/image`: las fotos salen de `uploads/` de Perfex, en otro dominio, y una pantalla que
 * las carga cada tantos minutos no gana nada con la optimizacion. Si la imagen falla, queda el fondo
 * con las iniciales debajo, que es la caida correcta sin necesidad de estado.
 */
export function Cara ({ nombre, imagen, tamano = '9vmin' }: {
  nombre: string
  imagen: string | null
  tamano?: string
}): ReactNode {
  const colores = coloresAvatar(nombre)

  return (
    <span
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold"
      style={{
        width: tamano,
        height: tamano,
        fontSize: `calc(${tamano} * 0.38)`,
        backgroundColor: colores.fondo,
        color: colores.texto
      }}
    >
      {iniciales(nombre)}
      {imagen !== null && imagen !== '' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imagen}
          alt=""
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </span>
  )
}

/**
 * Un contador que corre en pantalla, formateado `H:MM:SS`.
 *
 * `ahora` llega de arriba y no de un `Date.now()` propio: un tic por escena y no uno por ficha. Con
 * doce caras en pantalla, doce temporizadores propios serian doce repintados por segundo para mostrar
 * lo mismo.
 *
 * **Congelado dice la verdad.** Cuando los datos estan viejos el contador deja de sumar y se queda en
 * el ultimo valor bueno: un numero que sigue trepando con la conexion caida es una mentira, y esta
 * pared la leen jefaturas de area.
 */
export function Corriendo ({ desde, ahora, congelado, className }: {
  desde: string | null
  ahora: number | null
  congelado: boolean
  className?: string
}): ReactNode {
  if (desde === null || ahora === null) {
    return <span className={cn('tabular-nums', className)}>--:--</span>
  }

  const arranque = Date.parse(desde)

  if (Number.isNaN(arranque)) {
    return <span className={cn('tabular-nums', className)}>--:--</span>
  }

  const segundos = Math.max(Math.floor((ahora - arranque) / 1000), 0)
  const horas = Math.floor(segundos / 3600)
  const minutos = Math.floor((segundos % 3600) / 60)
  const resto = segundos % 60

  return (
    <span className={cn('tabular-nums', congelado && 'opacity-60', className)}>
      {horas}:{String(minutos).padStart(2, '0')}:{String(resto).padStart(2, '0')}
    </span>
  )
}

/**
 * El pie de una escena paginada: cuantos quedaron fuera.
 *
 * Nunca se miente por omision. Si la lista se corto, la pantalla lo dice.
 */
export function Ocultos ({ cuantos }: { cuantos: number }): ReactNode {
  if (cuantos <= 0) return null

  return (
    <p className="text-texto-tenue mt-[1.5vmin] text-[2.8vmin]">
      +{cuantos} más
    </p>
  )
}

/**
 * Lo que se muestra cuando una escena queda vacia y todavia asi se quiere mostrar.
 *
 * Casi nunca se usa: `construirGuion()` saca del guion las escenas vacias. Queda para el unico caso
 * en que la lista se vacia entre el render y el siguiente sondeo.
 */
export function Nada ({ texto }: { texto: string }): ReactNode {
  return (
    <p className="text-texto-tenue text-center text-[4.5vmin]">{texto}</p>
  )
}

/** Titulo de escena. Uno por escena, siempre en el mismo lugar. */
export function TituloDeEscena ({ children }: { children: ReactNode }): ReactNode {
  return (
    <h2 className="text-texto-tenue mb-[2.5vmin] text-[3.4vmin] font-semibold tracking-[0.18em] uppercase">
      {children}
    </h2>
  )
}
