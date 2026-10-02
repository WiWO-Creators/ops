import { Hueso } from '@/componentes/estado/Estados'

/** Clases de una tarjeta de bloque, las mismas de `Bloque`, para que la pantalla no salte al llegar. */
const TARJETA = 'rounded-tarjeta border-linea bg-superficie-elevada shadow-1 flex flex-col gap-3 border p-5'

/**
 * Espera general del portal: título, firma y una tarjeta con filas.
 *
 * Cubre las secciones que no tienen esqueleto propio (proyectos, soporte, archivos, anuncios,
 * ayuda, perfil). Sin este archivo la navegación dejaba congelada la pantalla anterior hasta que el
 * servidor respondía. Queda dentro del `template.tsx`, así que la entrada de página corre sobre el
 * esqueleto y otra vez sobre el contenido cuando llega.
 *
 * @returns el esqueleto base de una página del portal
 */
export default function CargandoPortal () {
  return (
    <section className="flex flex-col gap-4" aria-busy="true">
      <span className="sr-only" role="status">Cargando la página</span>

      <div className="flex flex-col gap-2">
        <Hueso className="rounded-medio h-9 w-64 max-w-full" />
        <Hueso className="h-1 w-16" />
      </div>

      <div className={TARJETA}>
        <Hueso className="rounded-medio h-9 w-full max-w-md" />
        {Array.from({ length: 5 }, (_, i) => <Hueso key={i} className="rounded-medio h-10 w-full" />)}
      </div>
    </section>
  )
}
