import type { ReactNode } from 'react'
import { GLOSARIO } from '@/dominio/glosario'
import type { ProyectoEnPantalla } from '@/datos/pantalla-area'
import { Nada, Ocultos, TituloDeEscena } from './piezas'

/**
 * Los Proyectos donde el area tiene trabajo abierto.
 *
 * El area no cuelga de los Proyectos por ningun lado: la relacion se deriva de las Tareas. Por eso la
 * escena contesta "dónde está trabajando el área", que es la pregunta de una pared, y no "qué
 * Proyectos le pertenecen", que no existe en el modelo.
 *
 * El avance es un porcentaje y **nunca un importe**: acá no hay ni presupuesto ni facturacion, por
 * decision del producto y por construccion del backend, que no consulta ninguna tabla de dinero.
 */
export function EscenaEspacios ({ items, ocultos }: {
  items: ProyectoEnPantalla[]
  ocultos: number
}): ReactNode {
  if (items.length === 0) return <Nada texto={`Sin ${GLOSARIO.espacio.plural.toLowerCase()} en curso`} />

  return (
    <div className="flex min-h-0 flex-col">
      <TituloDeEscena>{GLOSARIO.espacio.plural} en curso</TituloDeEscena>

      <ul className="grid grid-cols-2 gap-[2vmin] portrait:grid-cols-1">
        {items.map((proyecto) => (
          <li
            key={proyecto.id}
            className="border-linea bg-superficie-elevada flex flex-col gap-[1.2vmin] rounded-[2vmin] border p-[2.2vmin]"
          >
            <p className="text-texto truncate text-[3.4vmin] font-semibold">{proyecto.name}</p>

            <div className="flex items-center gap-[1.5vmin]">
              <div className="bg-linea-suave h-[1vmin] flex-1 overflow-hidden rounded-full">
                <div className="bg-acento h-full rounded-full" style={{ width: `${proyecto.progress}%` }} />
              </div>
              <span className="text-texto w-[7vmin] text-[2.8vmin] font-semibold tabular-nums">
                {proyecto.progress}%
              </span>
            </div>

            <p className="text-texto-tenue text-[2.6vmin]">
              {abiertas(proyecto.procesos_abiertos)}
              {proyecto.procesos_atrasados > 0 && (
                <span className="text-texto-peligro font-semibold">
                  {' · '}{proyecto.procesos_atrasados} {proyecto.procesos_atrasados === 1 ? 'atrasada' : 'atrasadas'}
                </span>
              )}
            </p>
          </li>
        ))}
      </ul>

      <Ocultos cuantos={ocultos} />
    </div>
  )
}

/**
 * "1 tarea abierta" / "3 tareas abiertas".
 *
 * El adjetivo concuerda con el sustantivo, no solo el sustantivo con el numero: escribir
 * `{n} {etiqueta(n)} abiertas` daba "1 tarea abiertas", que es el tipo de detalle que en una pared de
 * dos metros lee todo el mundo.
 */
function abiertas (cuantas: number): string {
  const nombre = (cuantas === 1 ? GLOSARIO.proceso.singular : GLOSARIO.proceso.plural).toLowerCase()

  return `${cuantas} ${nombre} ${cuantas === 1 ? 'abierta' : 'abiertas'}`
}
