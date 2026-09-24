'use client'

import { useEffect, useState } from 'react'
import { pedirSobre } from '@/datos/cliente'
import {
  algunaExigeVencimiento, rutaDeVencimientoRequerido, type RelacionConCliente
} from '@/dominio/vencimiento-requerido'

/** Lo que devuelve `GET /tasks/vencimiento-requerido`. */
interface RespuestaVencimiento {
  requerido: boolean
}

/**
 * Si alguna de las relaciones elegidas exige fecha de vencimiento.
 *
 * Una consulta por relacion, en paralelo: el alta en varios Proyectos puede mezclar clientes que la
 * exigen con otros que no. Mientras las respuestas no llegan, y cuando alguna falla, vale `false`:
 * el formulario no bloquea por no saber, y si la fecha hacia falta la API contesta `422`.
 *
 * Vale `false` apenas cambia la eleccion, para no arrastrar el "si" del destino anterior.
 *
 * @param relaciones las relaciones a consultar, ya filtradas por `relacionQuePuedeExigir`
 * @param activo `false` para no consultar nada (el dialogo cerrado, por ejemplo)
 * @returns `true` si al menos una exige fecha
 */
export function useVencimientoRequerido (relaciones: readonly RelacionConCliente[], activo = true): boolean {
  // La respuesta se guarda con la clave que la produjo: si la eleccion ya cambio, esa respuesta es
  // de otro destino y no cuenta.
  const [respuesta, setRespuesta] = useState<{ clave: string, requerido: boolean }>({ clave: '', requerido: false })
  // La clave hace de dependencia: el arreglo se arma en cada render y compararlo por identidad
  // dispararia una consulta por render.
  const clave = activo ? relaciones.map((relacion) => `${relacion.rel_type}:${relacion.rel_id}`).join(',') : ''

  useEffect(() => {
    if (clave === '') return

    const aborto = new AbortController()
    const consultas = clave.split(',').map((par) => {
      const [relType, relId] = par.split(':')

      return pedirSobre<RespuestaVencimiento>(
        rutaDeVencimientoRequerido({ rel_type: relType as RelacionConCliente['rel_type'], rel_id: Number(relId) }),
        aborto.signal
      )
        .then((sobre) => sobre.data.requerido === true)
        // Una consulta caida no es un "no": es un "no se sabe", y eso lo resuelve la API al guardar.
        .catch(() => null)
    })

    void Promise.all(consultas).then((respuestas) => {
      if (!aborto.signal.aborted) setRespuesta({ clave, requerido: algunaExigeVencimiento(respuestas) })
    })

    return () => { aborto.abort() }
  }, [clave])

  return clave !== '' && respuesta.clave === clave && respuesta.requerido
}
