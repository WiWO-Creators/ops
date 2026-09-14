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

/**
 * Los dos tamaños de la tarjeta.
 *
 * `grande` es para una grilla que ES la pantalla —la portada— y no un accesorio de ella: ahi la
 * tarjeta es el elemento que se mira, y a tamaño normal la grilla se leia como una lista de notas al
 * pie. Crece todo junto —caja, chip, icono y titulo— porque agrandar solo el relleno deja un icono
 * de 20px flotando en una tarjeta del doble de alto.
 */
const TAMANOS = {
  normal: { caja: 'p-5', chip: 'size-11 rounded-medio', icono: 20, titulo: 'text-base', descripcion: 'text-sm', hueco: 'mb-4' },
  grande: { caja: 'p-6 sm:p-7', chip: 'size-14 rounded-tarjeta', icono: 26, titulo: 'text-titulo', descripcion: 'text-base', hueco: 'mb-5' }
} as const

export type TamanoTarjeta = keyof typeof TAMANOS

interface PropsTarjeta {
  href: string
  titulo: string
  descripcion: string
  icono: LucideIcon
  tono?: TonoTarjeta
  /** Cuanto pesa la tarjeta en su pantalla. `grande` cuando la grilla es el contenido principal. */
  tamano?: TamanoTarjeta
  /** Marca la tarjeta como todavia no disponible: deja de ser enlace y se anuncia como tal. */
  proximamente?: boolean
  /** Dato vivo que acompaña al título, p. ej. cuánta gente hay dentro de una sala ahora mismo. */
  distintivo?: React.ReactNode
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
  tamano = 'normal',
  proximamente = false,
  distintivo,
  className
}: PropsTarjeta) {
  const externo = esExterno(href)
  const medida = TAMANOS[tamano]

  const contenido = (
    <>
      <span className={cn('flex items-start justify-between', medida.hueco)}>
        <span className={cn('grid place-items-center', medida.chip, TONOS[tono])}>
          <Icono size={medida.icono} strokeWidth={2} aria-hidden="true" />
        </span>
        {distintivo}
      </span>
      {/*
        Plantilla y no `cn()` en los dos: `tailwind-merge` toma un `text-*` que no es un peldaño
        suyo —`text-titulo`— por un color, y lo borraba contra el `text-texto` de al lado. Aca no
        hay conflicto que resolver: uno es tamaño y el otro color.
      */}
      <span className={`font-titular flex items-center gap-1.5 font-bold text-texto ${medida.titulo}`}>
        {titulo}
        {externo && <ArrowUpRight size={16} strokeWidth={2.5} aria-hidden="true" className="text-texto-tenue" />}
      </span>
      <span className={`mt-1 leading-relaxed text-texto-tenue ${medida.descripcion}`}>{descripcion}</span>
      {externo && <span className="sr-only">Se abre en una pestaña nueva</span>}
      {proximamente && (
        <span className="mt-3">
          <Insignia tono="contorno" tamano="chico">Pronto</Insignia>
        </span>
      )}
    </>
  )

  const clases = cn(
    'flex flex-col rounded-tarjeta border border-linea bg-superficie-elevada shadow-1',
    medida.caja,
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
