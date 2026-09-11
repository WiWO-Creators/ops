import type { ReactElement } from 'react'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { resolverEstado, type CatalogoDeEstados } from '@/dominio/estados-tarea'

/**
 * El estado de una Tarea, en insignia.
 *
 * **Es el unico camino para los sitios que no pasan por `TablaRecurso`**: la ficha, el modal, la
 * tarjeta del tablero, el calendario, los bloques del Inicio. Los listados que si pasan por la
 * tabla ya lo pintan con `comoInsignia: 'task_statuses'`, que resuelve por el mismo modulo de
 * dominio: por eso este componente no se usa ahi, y por eso no hay dos formas de leer un estado.
 *
 * El color sale del catalogo de Perfex, nunca de un mapa en el frontend. Un estado que el catalogo
 * no conoce se pinta igual, con su id y sin color: una Tarea sin estado visible es peor que un id.
 *
 * **Sin catalogo no pinta nada.** No es lo mismo que un id desconocido: si `/lookups` no llego, no
 * hay con que traducir NINGUN estado, y una lista entera de "#1" y "#4" es ruido que no dice nada.
 * Un id suelto solo vale cuando el resto de la lista si tiene nombre. Asi la guarda vive una vez
 * aca y no repetida en cada pantalla que monta el componente.
 *
 * @param status el `status` de la Tarea, tal como lo devuelve la API
 * @param catalogo `task_statuses` de `GET /lookups`, en cualquiera de sus dos formas
 * @param tamano alto de la insignia; `chico` en listas y tarjetas, `medio` en una ficha
 */
export function EstadoDeTarea ({
  status,
  catalogo,
  tamano = 'chico',
  className
}: {
  status: number | string | null | undefined
  catalogo: CatalogoDeEstados | undefined
  tamano?: 'chico' | 'medio'
  className?: string
}): ReactElement | null {
  if (catalogo === undefined || catalogo.length === 0) return null

  const estado = resolverEstado(status, catalogo)

  return (
    <Insignia
      tono={estado.desconocido ? 'contorno' : 'neutro'}
      tamano={tamano}
      color={estado.color}
      className={className}
    >
      {estado.etiqueta}
    </Insignia>
  )
}
