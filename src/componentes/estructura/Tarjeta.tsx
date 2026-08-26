import Link from 'next/link'
import { ArrowUpRight, type LucideIcon } from 'lucide-react'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { cn } from '@/lib/clases'

/**
 * Color del chip del icono.
 *
 * Son los tokens que el sistema ya verifica como color de TEXTO en los dos temas, no los de grafico:
 * `--grafico-2` es el verde puro y un icono verde sobre un chip verde claro, sobre blanco, no se ve.
 * Reusar los de texto es lo unico que garantiza que el icono se lea en claro y en oscuro sin volver a
 * medir contraste por cada tarjeta.
 */
const TONOS = {
  acento: 'bg-acento/12 text-acento',
  violeta: 'bg-texto-acento-2/12 text-texto-acento-2',
  exito: 'bg-texto-exito/12 text-texto-exito',
  aviso: 'bg-texto-aviso/12 text-texto-aviso',
  peligro: 'bg-texto-peligro/12 text-texto-peligro'
} as const

export type TonoTarjeta = keyof typeof TONOS

interface PropsTarjeta {
  href: string
  titulo: string
  descripcion: string
  icono: LucideIcon
  tono?: TonoTarjeta
  /** Marca la tarjeta como todavia no disponible: deja de ser enlace y se anuncia como tal. */
  proximamente?: boolean
  className?: string
}

/** `true` si el destino sale del panel y hay que abrirlo en otra pestaña. */
function esExterno (href: string): boolean {
  return href.startsWith('http')
}

/**
 * Tarjeta de acceso a una seccion.
 *
 * Es un enlace entero, no una tarjeta con un enlace adentro: el area de clic es toda la tarjeta, que
 * es lo que la persona espera al ver una grilla de estas, y ademas deja un solo elemento enfocable
 * por tarjeta en vez de dos.
 *
 * `proximamente` la deja visible pero inerte. Mostrar lo que todavia no existe es deliberado: dice
 * hacia donde va el sistema. Como `<span>`, no como enlace muerto ni como boton deshabilitado —un
 * enlace que no lleva a ningun lado es peor que no tenerlo—, y el estado viaja en el texto, no solo
 * en el color.
 *
 * Un `href` absoluto sale del panel: va como `<a>` nativo, no como `<Link>` —el router de Next no
 * navega fuera de la app—, se abre en otra pestaña y lo avisa dos veces: con la flecha de salida para
 * quien mira y con texto solo para lector de pantalla para quien no. `rel="noopener noreferrer"` es
 * obligatorio con `target="_blank"`: sin eso la pestaña nueva puede reescribir la del panel.
 *
 * @param href destino; relativo va por el router, absoluto abre afuera
 */
export function Tarjeta ({
  href,
  titulo,
  descripcion,
  icono: Icono,
  tono = 'acento',
  proximamente = false,
  className
}: PropsTarjeta) {
  const externo = esExterno(href)

  const contenido = (
    <>
      <span className={cn('mb-4 grid size-11 place-items-center rounded-medio', TONOS[tono])}>
        <Icono size={20} strokeWidth={2} aria-hidden="true" />
      </span>
      <span className="font-titular flex items-center gap-1.5 text-base font-bold text-texto">
        {titulo}
        {externo && <ArrowUpRight size={16} strokeWidth={2.5} aria-hidden="true" className="text-texto-tenue" />}
      </span>
      <span className="mt-1 text-sm leading-relaxed text-texto-tenue">{descripcion}</span>
      {externo && <span className="sr-only">Se abre en una pestaña nueva</span>}
      {proximamente && (
        <span className="mt-3">
          <Insignia tono="contorno" tamano="chico">Pronto</Insignia>
        </span>
      )}
    </>
  )

  const clases = cn(
    'flex flex-col rounded-tarjeta border border-linea bg-superficie-elevada p-5 shadow-1',
    className
  )

  if (proximamente) {
    return <span className={cn(clases, 'opacity-60')}>{contenido}</span>
  }

  // El realce es chico a proposito: una grilla de tarjetas que saltan al pasar el mouse marea.
  const clasesEnlace = cn(
    clases,
    'transition-[box-shadow,transform] duration-200 ease-neo',
    'hover:-translate-y-0.5 hover:shadow-2 active:translate-y-0'
  )

  if (externo) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={clasesEnlace}>
        {contenido}
      </a>
    )
  }

  return (
    <Link href={href} className={clasesEnlace}>
      {contenido}
    </Link>
  )
}
