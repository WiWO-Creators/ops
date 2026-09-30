'use client'

import Link from 'next/link'
import { createPortal } from 'react-dom'
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { Avatar, type TamanoAvatar } from '@/componentes/presentadores/Avatar'
import { cn } from '@/lib/clases'
import { usePresencia } from '@/lib/usePresencia'
import type { FichaPersona } from '@/datos/recursos'

/** Cuanto tarda en desaparecer la tarjeta tras salir del disparador o de la tarjeta con el mouse. */
const RETRASO_CIERRE_MS = 150

/** Ficha por persona ya pedida en esta pagina, para no repetir `GET /staff/{id}` al reabrir la misma. */
const cacheDeFichas = new Map<number, Promise<FichaPersona | null>>()

/**
 * Pide la ficha de una persona una sola vez por `id` mientras dure la pagina.
 *
 * Un fallo no se cachea: la proxima vez que se abra la tarjeta se reintenta, porque un corte de red
 * o un 500 no dicen nada sobre si la persona existe.
 *
 * @param id id de la persona (`GET /staff/{id}`).
 * @returns la ficha, o `null` si la peticion fallo.
 */
function pedirFichaPersona (id: number): Promise<FichaPersona | null> {
  const enCache = cacheDeFichas.get(id)
  if (enCache !== undefined) return enCache

  const promesa = (async (): Promise<FichaPersona | null> => {
    try {
      const respuesta = await fetch(`/api/bff/staff/${id}`)
      if (!respuesta.ok) return null

      const sobre = await respuesta.json() as { data: FichaPersona }
      return sobre.data
    } catch {
      return null
    }
  })()

  cacheDeFichas.set(id, promesa)
  // Un fallo se saca de la cache para permitir reintentar la proxima vez que se abra.
  void promesa.then((ficha) => { if (ficha === null) cacheDeFichas.delete(id) })

  return promesa
}

interface PropsTarjetaFlotantePersona {
  id: number
  nombre: string
  imagen?: string | null
  tamano?: TamanoAvatar
  /** `false` en una pila de avatares, donde el nombre ya se lee en el `sr-only` del grupo. */
  mostrarNombre?: boolean
  className?: string
}

/**
 * Avatar (y nombre, salvo que `mostrarNombre` sea `false`) de una persona, enlazado a `/equipo/{id}`
 * con una tarjeta flotante que se abre al pasar el mouse o al recibir el foco.
 *
 * Solo se monta cuando `EnlacePersona` ya decidio que corresponde enlazar: este componente no vuelve
 * a chequear capacidades ni portal.
 *
 * La ficha se pide recien al abrir la tarjeta por primera vez, nunca en cada render de una lista: en
 * un grupo de treinta asignados, precargar las treinta minifichas seria treinta peticiones que nadie
 * va a mirar.
 *
 * La tarjeta se dibuja en un portal sobre `document.body`, no en el flujo normal: adentro de una
 * celda de tabla o de una pila de avatares, un `overflow-hidden` la cortaria a la mitad.
 */
export function TarjetaFlotantePersona ({
  id,
  nombre,
  imagen = null,
  tamano = 'medio',
  mostrarNombre = true,
  className
}: PropsTarjetaFlotantePersona): ReactElement {
  const disparadorRef = useRef<HTMLAnchorElement>(null)
  const cierrePendiente = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [abierto, setAbierto] = useState(false)
  const { montado, saliendo, alTerminarAnimacion } = usePresencia(abierto)
  const [posicion, setPosicion] = useState({ top: 0, left: 0 })
  const [ficha, setFicha] = useState<FichaPersona | null | undefined>(undefined)

  useEffect(() => () => {
    if (cierrePendiente.current !== null) clearTimeout(cierrePendiente.current)
  }, [])

  // La tarjeta se posiciona en `position: fixed` contra el viewport, calculada una sola vez al
  // abrir. Si la pagina se desplaza o la ventana cambia de tamaño mientras esta abierta, queda
  // flotando lejos de su disparador en vez de junto a el. Cerrarla es mas simple y mas seguro que
  // recalcular la posicion en cada evento de scroll: quien sigue mirando puede volver a abrirla con
  // el mismo hover.
  useEffect(() => {
    if (!abierto) return

    function cerrarPorMovimiento (): void {
      setAbierto(false)
    }

    window.addEventListener('scroll', cerrarPorMovimiento, { capture: true, passive: true })
    window.addEventListener('resize', cerrarPorMovimiento)

    return () => {
      window.removeEventListener('scroll', cerrarPorMovimiento, { capture: true })
      window.removeEventListener('resize', cerrarPorMovimiento)
    }
  }, [abierto])

  const cancelarCierre = useCallback(() => {
    if (cierrePendiente.current !== null) {
      clearTimeout(cierrePendiente.current)
      cierrePendiente.current = null
    }
  }, [])

  const programarCierre = useCallback(() => {
    cancelarCierre()
    cierrePendiente.current = setTimeout(() => { setAbierto(false) }, RETRASO_CIERRE_MS)
  }, [cancelarCierre])

  const abrir = useCallback(() => {
    cancelarCierre()

    const rect = disparadorRef.current?.getBoundingClientRect()
    if (rect !== undefined) setPosicion({ top: rect.bottom + 8, left: rect.left })

    setAbierto(true)

    if (ficha === undefined) {
      pedirFichaPersona(id)
        .then(setFicha)
        .catch(() => { setFicha(null) })
    }
  }, [cancelarCierre, ficha, id])

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <Link
        ref={disparadorRef}
        href={`/equipo/${id}`}
        onMouseEnter={abrir}
        onMouseLeave={programarCierre}
        onFocus={abrir}
        onBlur={programarCierre}
        onKeyDown={(evento) => { if (evento.key === 'Escape') setAbierto(false) }}
        className="hover:text-acento inline-flex min-w-0 items-center gap-2 underline-offset-4 hover:underline"
      >
        {/* `sinTitulo`: este avatar ya dispara la tarjeta flotante al mismo hover/foco. El `title`
            nativo del navegador apareceria unos milisegundos antes que ella y la taparia. */}
        <Avatar nombre={nombre} imagen={imagen} tamano={tamano} sinTitulo />
        {mostrarNombre && <span className="truncate">{nombre}</span>}
      </Link>

      {/* `montado` solo se enciende desde un evento del navegador (mouse, foco): para cuando esto es
          `true`, `document` ya existe. El chequeo evita el error del render en el servidor, que sí
          lo ejecuta con `abierto` siempre en `false`. */}
      {montado && typeof document !== 'undefined' && createPortal(
        <div
          role="group"
          aria-label={`Ficha de ${nombre}`}
          onMouseEnter={cancelarCierre}
          onMouseLeave={programarCierre}
          onAnimationEnd={alTerminarAnimacion}
          style={{ position: 'fixed', top: posicion.top, left: posicion.left }}
          className={cn(
            saliendo ? 'animate-salir-escala pointer-events-none' : 'animate-entrar-escala',
            'border-linea bg-superficie-flotante rounded-tarjeta shadow-flotante z-50 w-72 origin-top-left border p-4'
          )}
        >
          <ContenidoDeFicha nombre={nombre} imagen={imagen} ficha={ficha} />
        </div>,
        document.body
      )}
    </span>
  )
}

/** Cuerpo de la mini-ficha: cargando, con los datos que trajo `GET /staff/{id}`, o con el aviso de fallo. */
function ContenidoDeFicha ({
  nombre,
  imagen,
  ficha
}: {
  nombre: string
  imagen: string | null
  ficha: FichaPersona | null | undefined
}): ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar nombre={nombre} imagen={imagen} tamano="grande" />
        <div className="min-w-0">
          <p className="text-texto truncate text-sm font-semibold">{nombre}</p>
          {ficha?.cargo != null && <p className="text-texto-sutil truncate text-xs">{ficha.cargo.name}</p>}
        </div>
      </div>

      {ficha === undefined && <p className="text-texto-sutil text-xs">Cargando…</p>}
      {ficha === null && <p className="text-texto-sutil text-xs">No se pudo cargar la ficha.</p>}

      {ficha != null && (
        <dl className="text-texto-sutil flex flex-col gap-1 text-xs">
          {ficha.area != null && (
            <div className="flex items-center justify-between gap-2">
              <dt>Área</dt>
              <dd className="text-texto truncate">{ficha.area.name}</dd>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <dt>Correo</dt>
            <dd className="text-texto truncate">{ficha.email}</dd>
          </div>
          {ficha.phonenumber != null && (
            <div className="flex items-center justify-between gap-2">
              <dt>Teléfono</dt>
              <dd className="text-texto truncate">{ficha.phonenumber}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  )
}
