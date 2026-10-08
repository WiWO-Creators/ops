import { Hueso } from '@/componentes/estado/Estados'

/** Clases de una tarjeta de bloque, las mismas de `Bloque`, para que la pantalla no salte al llegar. */
const TARJETA = 'rounded-tarjeta border-linea bg-superficie-elevada shadow-1 flex flex-col gap-4 border p-5'

/**
 * Espera de la ficha de un proyecto en el portal: la cabecera, las pestañas y el tablero.
 *
 * Calca `CabeceraProyecto` (volver, imagen destacada, nombre, firma, cliente, estado y fechas) y la
 * fila de `Pestanas`, para que la ficha ocupe el lugar que el esqueleto ya reservó. Sin este archivo
 * mandaba el esqueleto general del portal, que tiene la forma de un listado.
 *
 * @returns el esqueleto con la forma de la ficha del proyecto
 */
export default function CargandoProyectoDelPortal () {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <span className="sr-only" role="status">Cargando el proyecto</span>

      <div className={TARJETA}>
        <Hueso className="h-3 w-24" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <Hueso className="size-16 shrink-0 sm:size-20" />
            <div className="flex min-w-0 flex-col gap-2">
              <Hueso className="rounded-medio h-8 w-72 max-w-full" />
              <Hueso className="h-1 w-16" />
              <Hueso className="h-4 w-40" />
            </div>
          </div>
          <Hueso className="h-7 w-28" />
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Hueso className="h-4 w-32" />
          <Hueso className="h-4 w-32" />
          <Hueso className="h-6 w-40" />
        </div>
      </div>

      <div className="border-linea-suave flex gap-2 border-b pb-2">
        {Array.from({ length: 4 }, (_, i) => <Hueso key={i} className="rounded-medio h-8 w-24" />)}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className={TARJETA}>
            <Hueso className="h-4 w-32" />
            <Hueso className="rounded-medio h-16 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
