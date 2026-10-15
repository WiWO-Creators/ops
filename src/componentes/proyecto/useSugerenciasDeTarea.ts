'use client'

import { useEffect, useState } from 'react'
import { leerDelBff } from '@/componentes/datos/mutaciones'
import { leerSugerencias, type SugerenciasTarea } from '@/dominio/sugerencias-tarea'

/** Formato de fecha que acepta el parámetro `inicio`. */
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/

/**
 * Arma la ruta del BFF con los parámetros que haya.
 *
 * @param espacioId Espacio del que se piden las sugerencias
 * @param tipoId tipo ya elegido, o `null`
 * @param inicio fecha de inicio ya elegida (`YYYY-MM-DD`), o `''`
 * @returns la ruta sin la base del BFF
 */
function rutaDeSugerencias (espacioId: number, tipoId: number | null, inicio: string): string {
  const parametros = new URLSearchParams()

  if (tipoId !== null) parametros.set('task_type', String(tipoId))
  if (FORMATO_FECHA.test(inicio)) parametros.set('inicio', inicio)

  const consulta = parametros.toString()

  return `projects/${espacioId}/task-suggestions${consulta === '' ? '' : `?${consulta}`}`
}

/**
 * Trae lo que el historial del Espacio sugiere para una Tarea nueva.
 *
 * Las sugerencias son una ayuda, nunca un requisito: **cualquier fallo es «sin sugerencias»** y no se
 * muestra error. El `404` es el caso normal —la función apagada o una persona sin acceso— y una caída
 * de red no tiene por qué estorbar el alta.
 *
 * Al cambiar el tipo o la fecha de inicio se vuelve a pedir, pero lo que ya estaba en pantalla se
 * conserva hasta que llegue la respuesta nueva: los chips que parpadean mientras se escribe molestan
 * más de lo que ayudan. Al cambiar de Espacio sí se vacían, porque son de otro.
 *
 * @param espacioId el único Espacio elegido; `null` con ninguno o con varios, y entonces no pide nada
 * @param tipoId tipo elegido, que pondera el historial del mismo tipo; `null` si no hay
 * @param inicio fecha de inicio elegida (`YYYY-MM-DD`), de la que cuenta el plazo sugerido; `''` si no hay
 * @returns las sugerencias leídas, o `null` si no hay nada que ofrecer
 */
export function useSugerenciasDeTarea (espacioId: number | null, tipoId: number | null, inicio: string): SugerenciasTarea | null {
  const [estado, setEstado] = useState<{ espacioId: number, sugerencias: SugerenciasTarea | null } | null>(null)

  useEffect(() => {
    if (espacioId === null) return

    let vigente = true

    void leerDelBff<unknown>(rutaDeSugerencias(espacioId, tipoId, inicio)).then((resultado) => {
      if (vigente) setEstado({ espacioId, sugerencias: resultado.ok ? leerSugerencias(resultado.datos) : null })
    })

    return () => { vigente = false }
  }, [espacioId, tipoId, inicio])

  return espacioId !== null && estado?.espacioId === espacioId ? estado.sugerencias : null
}
