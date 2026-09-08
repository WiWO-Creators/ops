'use client'

import { useEffect } from 'react'

/**
 * Qué está haciendo esta persona ahora mismo, para el latido de presencia.
 *
 * La ruta ya dice dónde está parada ("viendo el espacio DELCO"); esto dice qué está haciendo ahí
 * ("creando una tarea"), que es lo que se pidió ver en `/auditoria`.
 *
 * === POR QUÉ UN CATÁLOGO CERRADO ===
 *
 * `AccionPresencia` es exactamente el enum que valida la API (`Escritura\Presencia::ACCIONES`), y la
 * frase legible la arma el servidor al leer. El navegador no manda ni una palabra de lo que después
 * se muestra: esto vigila a personas, y un campo de texto libre convertiría "quién está trabajando
 * en qué" en un registro de lo que la gente escribe. Agregar una acción es agregarla en los dos
 * lados, a propósito.
 *
 * === POR QUÉ UNA PILA Y NO UNA VARIABLE ===
 *
 * Los diálogos se anidan: editar una tarea desde adentro del alta de un Espacio. Con una sola
 * variable, cerrar el de arriba borraría la acción del de abajo, que sigue abierto, y la persona
 * pasaría a "viendo la lista" con un formulario en pantalla. La pila devuelve la anterior.
 *
 * === POR QUÉ UN MÓDULO Y NO UN CONTEXTO ===
 *
 * Sólo hay un `Latido` en todo el panel y sólo necesita leer el valor cuando late. Un provider
 * obligaría a envolver el armazón entero y a re-renderizar cada diálogo cuando cambia una acción que
 * no le importa. Acá el estado no se renderiza: se manda.
 */

/** Las mismas cinco que acepta la API. Cualquier otra cosa es un 422. */
export type AccionPresencia =
  | 'creando_tarea'
  | 'editando_tarea'
  | 'creando_espacio'
  | 'creando_cliente'
  | 'creando_persona'

/** Los diálogos abiertos, del más viejo al más nuevo. Manda el último. */
const pila: AccionPresencia[] = []

const oyentes = new Set<() => void>()

/** Lo que hay que mandar en el próximo latido, o `null` si no hay ningún diálogo abierto. */
export function accionEnCurso (): AccionPresencia | null {
  return pila.at(-1) ?? null
}

/**
 * Se entera cuando la acción cambia, para latir en el acto.
 *
 * Sin esto, abrir un diálogo tardaría hasta un intervalo entero (45 s por defecto) en verse en
 * `/auditoria`, y cerrarlo, otro tanto: la pantalla mostraría siempre el diálogo anterior.
 *
 * @param oyente se llama después de cada cambio
 * @returns la función para dejar de escuchar
 */
export function escucharAccion (oyente: () => void): () => void {
  oyentes.add(oyente)

  return () => { oyentes.delete(oyente) }
}

/**
 * Declara una acción mientras el diálogo esté abierto.
 *
 * Es la única línea que un diálogo necesita:
 *
 * ```ts
 * useAccionPresencia('creando_tarea', abierto)
 * ```
 *
 * @param accion  qué se está haciendo
 * @param abierto si el diálogo está abierto. Por defecto `true`, para los que sólo se montan
 *                mientras lo están.
 */
export function useAccionPresencia (accion: AccionPresencia, abierto = true): void {
  useEffect(() => {
    if (!abierto) return

    apilar(accion)

    return () => { desapilar(accion) }
  }, [accion, abierto])
}

/** Suma una acción a la pila y avisa. Exportada para poder probarla sin montar React. */
export function apilar (accion: AccionPresencia): void {
  pila.push(accion)
  avisar()
}

/**
 * Saca de la pila la última aparición de una acción.
 *
 * La última y no todas: dos diálogos del mismo tipo abiertos a la vez —dos ediciones de tarea, una
 * sobre la otra— son dos entradas, y cerrar una no puede llevarse la otra.
 */
export function desapilar (accion: AccionPresencia): void {
  const indice = pila.lastIndexOf(accion)

  if (indice === -1) return

  pila.splice(indice, 1)
  avisar()
}

function avisar (): void {
  for (const oyente of oyentes) oyente()
}


const tareas: Array<{ id: number }> = []

/** Ruta de la tarea visible, incluso cuando se abre en un panel sobre otra página. */
export function rutaDeTarea (): string | null {
  const tarea = tareas.at(-1)
  return tarea === undefined ? null : `/procesos/${tarea.id}`
}

/** Registra la tarea visible hasta desmontar su detalle; no transmite contenido del formulario. */
export function useUbicacionTarea (id: number): void {
  useEffect(() => {
    if (!Number.isSafeInteger(id) || id <= 0) return
    const tarea = { id }
    tareas.push(tarea)
    avisar()
    return () => {
      const indice = tareas.indexOf(tarea)
      if (indice >= 0) tareas.splice(indice, 1)
      avisar()
    }
  }, [id])
}
