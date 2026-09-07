'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { accionEnCurso, escucharAccion } from './accion'

/**
 * Le cuenta al servidor en qué pantalla del panel está parada esta persona.
 *
 * Es lo que alimenta el bloque "Ahora mismo" de `/auditoria`. Va montado en el armazón del panel
 * porque el latido es de todo el panel, no de una pantalla: si viviera dentro de `/auditoria`, la
 * única persona que aparecería conectada sería la que está mirando la auditoría.
 *
 * === QUÉ MANDA: la ruta, y nada más ===
 *
 * La ruta de `usePathname()` y, si hay un diálogo abierto, cuál de un catálogo cerrado de cinco
 * (`accion.ts`). Sin query string —`/procesos?q=sueldos` diría qué buscó alguien, que es contenido y
 * no ubicación—, sin título de pantalla, sin nada tecleado. El servidor además valida las dos cosas
 * y rechaza cualquier otra, así que este componente no es la única barrera: es la primera. La frase
 * legible ("creando una tarea", "viendo el espacio DELCO") la arma el servidor al leer.
 *
 * === CUÁNDO LATE ===
 *
 * Al montar, en cada cambio de ruta, al abrirse o cerrarse un diálogo, y cada `segundos` mientras
 * la pestaña esté **visible**. Con la
 * pestaña oculta no late: una pestaña olvidada en otro escritorio no es alguien trabajando, y decir
 * que sí es justamente el dato falso que esta pantalla no puede permitirse. Al volver a primer plano
 * late en el acto, para no esperar un intervalo entero antes de reaparecer.
 *
 * No renderiza nada y no bloquea nada: un latido que falla se descarta en silencio. Si la API está
 * caída, quien mira la auditoría ve la lista vaciarse, que es lo correcto — nadie está latiendo.
 */
export function Latido ({ segundos }: { segundos: number }) {
  const ruta = usePathname()

  useEffect(() => {
    // Las rutas del panel son minúsculas, dígitos y guiones. Se normaliza y se comprueba contra la
    // misma expresión que aplica el servidor: si alguna ruta futura no encaja, este componente se
    // calla en vez de mandar un 422 cada `segundos` para siempre.
    const normalizada = ruta.toLowerCase()

    if (!/^\/[a-z0-9/_-]*$/.test(normalizada)) return

    const control = new AbortController()

    function latir (): void {
      if (document.hidden) return

      void fetch('/api/bff/presence', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ route: normalizada, action: accionEnCurso() }),
        signal: control.signal
      }).catch(() => {
        // Un latido perdido no le importa a nadie: el siguiente lo corrige, y la ventana del
        // servidor tolera varios seguidos sin sacar a la persona de la lista.
      })
    }

    latir()

    const intervalo = globalThis.setInterval(latir, segundos * 1000)
    const dejarDeEscuchar = escucharAccion(latir)
    document.addEventListener('visibilitychange', latir)

    return () => {
      globalThis.clearInterval(intervalo)
      dejarDeEscuchar()
      document.removeEventListener('visibilitychange', latir)
      control.abort()
    }
  }, [ruta, segundos])

  return null
}
