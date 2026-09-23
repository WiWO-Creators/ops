'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { LayoutGrid, type LucideIcon } from 'lucide-react'
import { ICONOS_DE_SECCION } from '@/componentes/paleta/iconos'
import { HREFS_PRINCIPALES, type Seccion } from '@/lib/navegacion'
import { EVENTO_ABRIR_SECCIONES, abreTeclado, pestanaActiva } from '@/lib/navegacion-movil'
import { cn } from '@/lib/clases'

interface PropsBarraInferiorMovil {
  /** Las secciones ya filtradas por permisos: una pestaña fija sin permiso no se muestra. */
  secciones: Seccion[]
}

/**
 * Barra de navegación inferior del teléfono, por debajo de `md`.
 *
 * Cuatro destinos fijos —los de todos los días— y "Más", que abre el cajón con el resto de las
 * secciones. Fijos a propósito: una barra que cambia de orden según el uso obliga a leerla cada
 * vez, y la gracia de una barra inferior es encontrar las cosas sin mirar.
 *
 * Va DENTRO del armazón, debajo del contenedor de scroll, y no `fixed`: así el scroll del panel
 * termina justo encima y nada queda tapado, sin calcular rellenos. `data-barra-inferior` es lo que
 * le avisa al orbe y a los avisos flotantes que tienen que subir (`--barra-inferior`).
 *
 * Con el teclado en pantalla se esconde: pegada sobre el teclado le quitaba 64px al formulario
 * justo cuando la pantalla es más chica.
 */
export function BarraInferiorMovil ({ secciones }: PropsBarraInferiorMovil) {
  const ruta = usePathname()
  const conTeclado = useTecladoAbierto()

  // Las mismas principales que encabezan el menu (`HREFS_PRINCIPALES`), con el icono que cada
  // seccion ya trae: en el telefono y en el escritorio una pantalla se reconoce por el mismo dibujo.
  const pestanas = HREFS_PRINCIPALES
    .map((href) => ({ href, seccion: secciones.find((s) => s.href === href) }))
    .filter((p): p is { href: (typeof HREFS_PRINCIPALES)[number], seccion: Seccion } => p.seccion !== undefined)
  const activa = pestanaActiva(ruta, pestanas.map((p) => p.href))
  const columnas = pestanas.length + 1

  return (
    <nav
      aria-label="Navegación principal"
      data-barra-inferior={conTeclado ? undefined : ''}
      className={cn(
        'barra-inferior border-linea pb-seguro pl-seguro pr-seguro relative shrink-0 border-t md:hidden',
        conTeclado && 'hidden'
      )}
    >
      <ul className="relative grid h-16" style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}>
        {/* El indicador es uno solo y se desliza: dos pastillas que se prenden y apagan no dicen de
            dónde se vino. Mide una columna y viaja de a una columna entera. */}
        <li
          aria-hidden="true"
          className="barra-inferior-indicador pointer-events-none absolute inset-y-2 left-0 flex justify-center"
          style={{ width: `${100 / columnas}%`, transform: `translateX(${activa * 100}%)` }}
        >
          <span className="bg-acento/12 h-8 w-14 rounded-full" />
        </li>

        {pestanas.map(({ href, seccion }, indice) => (
          <li key={href} className="relative">
            <Pestana
              href={href}
              etiqueta={seccion.etiqueta}
              Icono={ICONOS_DE_SECCION[seccion.icono]}
              activa={indice === activa}
            />
          </li>
        ))}

        <li className="relative">
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => { window.dispatchEvent(new Event(EVENTO_ABRIR_SECCIONES)) }}
            className={claseDePestana(activa === pestanas.length)}
          >
            <LayoutGrid size={22} strokeWidth={2} aria-hidden="true" className="barra-inferior-icono" />
            <span>Más</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}

interface PropsPestana {
  href: string
  etiqueta: string
  Icono: LucideIcon
  activa: boolean
}

/** Una pestaña: ícono arriba, etiqueta abajo, y el área táctil entera de su columna. */
function Pestana ({ href, etiqueta, Icono, activa }: PropsPestana) {
  return (
    <Link href={href} aria-current={activa ? 'page' : undefined} className={claseDePestana(activa)}>
      <Icono size={22} strokeWidth={activa ? 2.4 : 2} aria-hidden="true" className="barra-inferior-icono" />
      <span className="max-w-full truncate px-1">{etiqueta}</span>
    </Link>
  )
}

/**
 * Clases compartidas por las pestañas y por "Más".
 *
 * El área táctil es la columna entera (64px de alto), muy por encima de los 44px mínimos: en una
 * barra que se toca con el pulgar sin mirar, el borde entre dos pestañas no puede ser tierra de
 * nadie. `touch-manipulation` saca la espera del doble toque.
 */
function claseDePestana (activa: boolean): string {
  return cn(
    'barra-inferior-pestana flex h-full w-full touch-manipulation select-none flex-col items-center justify-center gap-0.5',
    'text-menor font-semibold transition-colors duration-rapida',
    '[-webkit-tap-highlight-color:transparent] focus-visible:outline-offset-[-4px]',
    activa ? 'text-acento' : 'text-texto-tenue'
  )
}

/**
 * `true` mientras el foco está en un campo que abre el teclado en pantalla.
 *
 * Se escucha en el documento (`focusin`/`focusout` burbujean, `focus` no) y se relee el
 * `activeElement` en el cuadro siguiente: al pasar de un campo a otro llega un `focusout` antes del
 * `focusin`, y decidir en el primero haría parpadear la barra.
 */
function useTecladoAbierto (): boolean {
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    let cuadro = 0
    const releer = () => {
      cancelAnimationFrame(cuadro)
      cuadro = requestAnimationFrame(() => {
        const activo = document.activeElement
        const escribe = activo instanceof HTMLElement &&
          abreTeclado(activo.tagName, activo.getAttribute('type'), activo.isContentEditable)
        // Solo en pantallas táctiles: con teclado físico no hay nada que esconder.
        setAbierto(escribe && window.matchMedia('(pointer: coarse)').matches)
      })
    }
    document.addEventListener('focusin', releer)
    document.addEventListener('focusout', releer)
    return () => {
      cancelAnimationFrame(cuadro)
      document.removeEventListener('focusin', releer)
      document.removeEventListener('focusout', releer)
    }
  }, [])

  return abierto
}
