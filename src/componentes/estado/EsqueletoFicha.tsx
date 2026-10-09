import type { ReactElement } from 'react'
import { Hueso } from '@/componentes/estado/Estados'

/** Clases de una tarjeta de bloque, las mismas de `Bloque`, para que la pantalla no salte al llegar. */
const TARJETA = 'rounded-tarjeta border-linea bg-superficie-elevada shadow-1 flex flex-col gap-3 border p-5'

/**
 * Espera de una ficha de detalle: volver, avatar, nombre, insignias, pestañas y el primer bloque.
 *
 * Existe para que las rutas `[id]` no hereden el `loading.tsx` del listado, que pinta el título
 * plural y la ventana de "Cargando clientes…" mientras en realidad se abre una sola ficha.
 *
 * @param etiqueta qué se está abriendo, dicho para el lector de pantalla (ej. "la ficha del cliente")
 * @returns el esqueleto con la forma de la cabecera de ficha
 */
export function EsqueletoFicha ({ etiqueta }: { etiqueta: string }): ReactElement {
  return (
    <section className="flex flex-col gap-6" aria-busy="true">
      <span className="sr-only" role="status">Cargando {etiqueta}</span>

      <div className="flex flex-col gap-3">
        <Hueso className="h-3 w-24" />
        <div className="flex flex-wrap items-start gap-3">
          <Hueso className="size-12 shrink-0" />
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Hueso className="rounded-medio h-7 w-64 max-w-full" />
              <Hueso className="h-5 w-20" />
              <Hueso className="h-5 w-16" />
            </div>
            <Hueso className="h-3 w-72 max-w-full" />
          </div>
        </div>
      </div>

      <div className="border-linea-suave flex gap-2 border-b pb-2">
        <Hueso className="rounded-medio h-8 w-24" />
        <Hueso className="rounded-medio h-8 w-24" />
        <Hueso className="rounded-medio h-8 w-24" />
      </div>

      <div className={TARJETA}>
        <Hueso className="h-4 w-40" />
        <Hueso className="h-4 w-full max-w-2xl" />
        <Hueso className="h-4 w-4/5 max-w-xl" />
      </div>
    </section>
  )
}
