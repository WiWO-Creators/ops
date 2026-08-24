import { cn } from '@/lib/clases'

interface PropsSeccion {
  titulo: string
  nota?: string
  children: React.ReactNode
}

/** Agrupa las muestras de un componente en el taller. */
export function SeccionTaller ({ titulo, nota, children }: PropsSeccion) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-titular text-xl font-extrabold">{titulo}</h2>
        {nota && <p className="text-texto-tenue max-w-prose text-sm">{nota}</p>}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

/** Una fila de muestra, con su etiqueta a la izquierda. */
export function Muestra ({
  etiqueta,
  children,
  className
}: {
  etiqueta: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className="border-linea bg-superficie-elevada rounded-tarjeta flex flex-col gap-3 border p-4 sm:flex-row sm:items-center sm:gap-6">
      <span className="text-texto-sutil font-mono w-full shrink-0 text-xs sm:w-40">{etiqueta}</span>
      <div className={cn('flex flex-wrap items-center gap-3', className)}>{children}</div>
    </div>
  )
}
