import { Hueso } from '@/componentes/estado/Estados'

/** Clases de una tarjeta de bloque, las mismas de `Bloque`, para que la pantalla no salte al llegar. */
const TARJETA = 'rounded-tarjeta border-linea bg-superficie-elevada shadow-1 flex flex-col gap-4 border p-5'

/**
 * El reporte mientras se calcula: el esqueleto de su propia forma, no un indicador genérico.
 *
 * Calca la estructura real —título y selector, el párrafo del resumen, la columna principal y la
 * lateral— para que el contenido ocupe el lugar que el esqueleto ya reservó.
 */
export default function CargandoReporte () {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6" aria-busy="true">
      <span className="sr-only" role="status">Cargando el reporte mensual</span>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-3">
          <Hueso className="h-10 w-72 rounded-medio" />
          <Hueso className="h-4 w-56" />
        </div>
        <Hueso className="h-9 w-80 rounded-medio" />
      </div>

      <div className="border-linea-suave flex flex-col gap-3 border-b pb-6">
        <Hueso className="h-6 w-full max-w-3xl" />
        <Hueso className="h-6 w-4/5 max-w-2xl" />
        <Hueso className="h-3 w-64" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          {[3, 6].map((filas) => (
            <div key={filas} className={TARJETA}>
              <Hueso className="h-4 w-48" />
              {Array.from({ length: filas }, (_, i) => <Hueso key={i} className="h-9 w-full rounded-medio" />)}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-6">
          {[2, 2, 2].map((filas, i) => (
            <div key={i} className={TARJETA}>
              <Hueso className="h-4 w-32" />
              {Array.from({ length: filas }, (_, j) => <Hueso key={j} className="h-9 w-full rounded-medio" />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
