import { GLOSARIO } from '@/dominio/glosario'
import type { ContadoresDePersona, EstadoLookup } from '@/datos/recursos'

/**
 * Resumen de las Tareas de una persona: cuántas tiene en cada estado.
 *
 * Los números salen de `counts.por_estado` de la ficha, que los cuenta sobre TODAS sus Tareas y no
 * sobre la página visible de ninguna tabla: sumar las filas de la lista de abajo daría "3 en curso"
 * cuando hay treinta. Por eso tampoco cuesta una petición extra — viajan con la ficha.
 *
 * No es un filtro, a diferencia del resumen del Proyecto: acá no hay una tabla debajo que filtrar
 * —las Tareas viven en su propia pestaña—, y un botón que no hace nada es peor que un dato quieto.
 *
 * @param contadores el bloque `counts` de `GET /staff/{id}`
 * @param estados catálogo `task_statuses` de `GET /lookups`, de donde salen nombre y color
 * @returns la tira de contadores, o nada si la persona no tiene ninguna Tarea asignada
 */
export function ResumenTareasPersona ({
  contadores,
  estados
}: {
  contadores: ContadoresDePersona
  estados: EstadoLookup[]
}) {
  if (contadores.por_estado.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-texto text-sm font-semibold">Sus {GLOSARIO.proceso.plural.toLowerCase()}</h2>

      <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        {contadores.por_estado.map((fila) => {
          const estado = estados.find((e) => e.id === fila.status)

          return (
            <li
              key={fila.status}
              className="border-linea bg-superficie-elevada rounded-tarjeta flex flex-col gap-1 border p-3"
            >
              <span className="flex items-center gap-2">
                {estado?.color !== undefined && (
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full"
                    // El color lo administra quien configura los estados en Perfex: es un dato, no un
                    // token del sistema, y por eso va en `style`.
                    style={{ backgroundColor: estado.color }}
                  />
                )}
                <span className="text-texto-tenue truncate text-xs font-medium">
                  {estado?.name ?? `#${fila.status}`}
                </span>
              </span>

              <span data-numerico className="text-texto text-2xl leading-none font-semibold">
                {fila.total}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
