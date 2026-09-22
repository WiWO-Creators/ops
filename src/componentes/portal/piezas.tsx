import { cn } from '@/lib/clases'

/**
 * La tarjeta de aviso del portal, con el tono de la noticia que trae.
 *
 * Server Component sin estado: en el portal no hay nada que tocar en estos avisos, solo leerlos.
 */

/** El fondo y el borde de las tres clases de noticia que el portal le da al cliente. */
const TONOS_DE_TARJETA = {
  atencion: 'border-linea-fuerte bg-superficie-aviso border-l-4',
  tranquilo: 'border-linea bg-superficie-elevada border',
  apagado: 'border-linea-suave bg-superficie-hundida border border-dashed'
} as const

export type TonoDeTarjeta = keyof typeof TONOS_DE_TARJETA

/**
 * La tarjeta ancha de la parte de arriba, en el tono que le toque.
 *
 * El tono no es decoracion: `atencion` es lo que le pide algo al cliente, `tranquilo` es la buena
 * noticia y `apagado` es el hueco que se dibuja como hueco. Un cartel que no se puede distinguir de
 * los otros dos se aprende a ignorar en dos dias.
 *
 * @param tono que clase de noticia trae
 * @param icono el simbolo de la izquierda, ya dimensionado
 * @param children el texto de la tarjeta
 */
export function Tarjeta (
  { tono, icono, children }:
  { tono: TonoDeTarjeta, icono: React.ReactNode, children: React.ReactNode }
) {
  return (
    <div className={cn('rounded-tarjeta flex items-start gap-3 p-4', TONOS_DE_TARJETA[tono])}>
      <span className="text-texto-sutil mt-0.5">{icono}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
