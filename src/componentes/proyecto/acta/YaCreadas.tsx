import type { ReactElement } from 'react'
import { PARAMETRO_TAREA } from '@/componentes/datos/tabla'
import type { PropuestaDeTarea } from '@/definiciones/actas'

/**
 * Las propuestas que ya son Procesos.
 *
 * Van en una lista aparte y no se borran de la pantalla: haber creado ocho tareas y que el bloque
 * quede vacío deja a quien las creó sin forma de comprobar qué salió de ahí. El enlace abre el
 * detalle con el mismo `?tarea={id}` que usa cualquier listado, sobre la pestaña de Procesos del
 * Espacio.
 */
export function YaCreadas ({ propuestas, proyectoId }: {
  propuestas: PropuestaDeTarea[]
  proyectoId: number
}): ReactElement {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-texto-tenue text-xs antetitulo">Ya creadas</h4>
      <ul className="flex flex-col gap-1">
        {propuestas.map((propuesta) => (
          <li key={propuesta.id} className="text-sm">
            {propuesta.task_id === null
              ? <span className="text-texto-tenue">{propuesta.task_name ?? propuesta.titulo}</span>
              : (
                <a
                  href={`/proyectos/${proyectoId}?tab=tareas&${PARAMETRO_TAREA}=${propuesta.task_id}`}
                  className="text-acento hover:underline"
                >
                  {propuesta.task_name ?? propuesta.titulo}
                </a>
                )}
          </li>
        ))}
      </ul>
    </div>
  )
}
