'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { mensajeDeRespuesta, pedirRespuesta } from '@/datos/cliente'
import type { Meta, Sobre } from '@/datos/tipos'

/**
 * Carga de un recurso del detalle de Proyecto desde el navegador.
 *
 * Los paneles que no son tablas —Descripcion, el kanban de Hitos, el Gantt— repiten el mismo baile:
 * pedir, mostrar el bloque de carga, mostrar el error como texto legible, y poder reintentar. Esto es
 * ese baile, una sola vez.
 *
 * El prefijo `use` no es ingles por descuido: React exige que todo hook empiece asi, y la regla de
 * lint de hooks no reconoce ningun otro prefijo.
 */

/** Estado de una carga. El error es un texto listo para mostrar, no un envelope. */
export type EstadoCarga<T> =
  | { fase: 'cargando' }
  | { fase: 'listo', datos: T, meta: Meta | undefined }
  | { fase: 'error', mensaje: string }

/**
 * Lo que se muestra cuando la API dice que la sesion ya no sirve.
 *
 * Existe como constante y no como literal suelto porque lo dicen dos pantallas distintas —este hook
 * y el tablero— y es la frase que convierte el sintoma en su causa: hasta ahora una sesion cerrada
 * de madrugada se veia como una lista vacia o como una vista congelada, y el equipo la reportaba
 * como "no aparecen tareas" o "se desincronizan". Decir lo que pasa es la mitad del arreglo.
 */
export const MENSAJE_SESION_CERRADA = 'Se cerró tu sesión. Vuelve a entrar para seguir trabajando.'

/**
 * Cuanto tiene que llevar el dato en pantalla para que volver a la pestaña lo vuelva a pedir.
 *
 * No es un intervalo de sondeo: el dato se repide al VOLVER, y este umbral es lo que impide que
 * alternar entre dos ventanas dispare una peticion por cada ida y vuelta. Treinta segundos es mas
 * de lo que dura un vistazo al correo y mucho menos de lo que dura un almuerzo, que son los dos
 * casos que hay que distinguir.
 */
const ANTIGUEDAD_PARA_REVALIDAR_MS = 30_000

/** Lo que devuelve una peticion al BFF, con el caso de sesion cerrada ya distinguido. */
type Resultado<T> =
  | { ok: true, sobre: Sobre<T> }
  | { ok: false, sesionCerrada: boolean, mensaje: string }

/**
 * Pide una ruta del BFF y clasifica el desenlace.
 *
 * El `401` se separa del resto porque no es un error del recurso sino de la sesion, y pide una frase
 * distinta: el BFF responde `401` tanto cuando no hay cookie como cuando la API revoco el par de
 * tokens, y en los dos casos lo unico que se puede hacer es volver a entrar.
 *
 * @param ruta ruta sin la base del BFF ni barra inicial
 * @param senal señal para abortar cuando el componente se desmonta
 * @returns el envelope, o el motivo del fallo ya legible
 * @throws el error de red de `pedirRespuesta`, que no llega a haber respuesta
 */
async function traer<T> (ruta: string, senal: AbortSignal): Promise<Resultado<T>> {
  const respuesta = await pedirRespuesta(ruta, senal)

  if (respuesta.ok) return { ok: true, sobre: await respuesta.json() as Sobre<T> }

  return {
    ok: false,
    sesionCerrada: respuesta.status === 401,
    mensaje: await mensajeDeRespuesta(respuesta)
  }
}

/**
 * Pide una ruta del BFF y devuelve su estado de carga.
 *
 * Ademas de la carga inicial, **revalida al volver a la pestaña**: cuando la pestaña se vuelve
 * visible o la ventana recupera el foco y el dato lleva mas de `ANTIGUEDAD_PARA_REVALIDAR_MS` en
 * pantalla, se vuelve a pedir. Antes se pedia una sola vez al montar, asi que una pestaña abierta
 * desde ayer mostraba el estado de ayer indefinidamente y cualquier accion se tomaba sobre datos
 * viejos.
 *
 * La revalidacion es silenciosa a proposito: no vuelve a `cargando` —parpadear el panel entero cada
 * vez que alguien vuelve de otra ventana es peor que esperar medio segundo— y **si falla, conserva
 * lo que ya estaba en pantalla**. La unica excepcion es la sesion cerrada, que si pisa la vista:
 * ahi lo de la pantalla ya no es un dato viejo, es un dato que nadie va a poder actualizar.
 *
 * @param ruta ruta sin la base del BFF ni barra inicial. Ej: `projects/93/overview`
 * @param mensajeGenerico que decir cuando el fallo no trae mensaje propio
 * @returns el estado y una funcion para volver a pedir
 */
export function useRecurso<T> (
  ruta: string,
  mensajeGenerico: string
): { estado: EstadoCarga<T>, recargar: () => void } {
  const [estado, setEstado] = useState<EstadoCarga<T>>({ fase: 'cargando' })
  const [intento, setIntento] = useState(0)
  const [peticion, setPeticion] = useState(`${ruta}|0`)

  // Cuando se resolvio la ultima peticion, bien o mal. El `0` significa "todavia no contesto
  // ninguna", y en ese estado no se revalida: un `focus` recibido mientras la primera carga sigue en
  // vuelo dispararia una segunda peticion identica.
  const ultimaRespuesta = useRef(0)

  const recargar = useCallback(() => { setIntento((n) => n + 1) }, [])

  // Volver a "cargando" en el render y no en el efecto: cambiar de ruta con los datos viejos todavia
  // en pantalla mostraria por un instante el resultado de otra peticion. React admite este `setState`
  // durante el render —reinicia el render antes de pintar— y es lo que la regla de hooks pide en vez
  // de encadenar renders desde el efecto.
  const actual = `${ruta}|${intento}`
  if (peticion !== actual) {
    setPeticion(actual)
    setEstado({ fase: 'cargando' })
  }

  useEffect(() => {
    const control = new AbortController()

    void (async () => {
      try {
        const resultado = await traer<T>(ruta, control.signal)
        if (control.signal.aborted) return

        ultimaRespuesta.current = Date.now()

        if (resultado.ok) {
          setEstado({ fase: 'listo', datos: resultado.sobre.data, meta: resultado.sobre.meta })
          return
        }

        setEstado({
          fase: 'error',
          mensaje: resultado.sesionCerrada ? MENSAJE_SESION_CERRADA : resultado.mensaje
        })
      } catch (fallo: unknown) {
        if (control.signal.aborted) return

        ultimaRespuesta.current = Date.now()
        setEstado({
          fase: 'error',
          mensaje: fallo instanceof Error ? fallo.message : mensajeGenerico
        })
      }
    })()

    return () => { control.abort() }
  }, [ruta, intento, mensajeGenerico])

  useEffect(() => {
    let enVuelo: AbortController | null = null

    const revalidar = (): void => {
      if (document.visibilityState !== 'visible') return
      if (ultimaRespuesta.current === 0) return
      if (Date.now() - ultimaRespuesta.current < ANTIGUEDAD_PARA_REVALIDAR_MS) return

      enVuelo?.abort()
      const control = new AbortController()
      enVuelo = control

      void (async () => {
        try {
          const resultado = await traer<T>(ruta, control.signal)
          if (control.signal.aborted) return

          ultimaRespuesta.current = Date.now()

          if (resultado.ok) {
            setEstado({ fase: 'listo', datos: resultado.sobre.data, meta: resultado.sobre.meta })
            return
          }

          if (resultado.sesionCerrada) {
            setEstado({ fase: 'error', mensaje: MENSAJE_SESION_CERRADA })
            return
          }

          // Un fallo del recurso no borra lo que ya se estaba mirando: un dato de hace un rato sirve
          // mas que un cartel de error donde habia una tabla. Solo se muestra si no habia nada.
          setEstado((previo) => previo.fase === 'listo' ? previo : { fase: 'error', mensaje: resultado.mensaje })
        } catch {
          // Red caida al volver a la pestaña: `pedirRespuesta` ya aviso con el cartel flotante, y lo
          // que hay en pantalla sigue siendo lo ultimo que la API contesto. Se deja como esta.
          ultimaRespuesta.current = Date.now()
        }
      })()
    }

    document.addEventListener('visibilitychange', revalidar)
    window.addEventListener('focus', revalidar)

    return () => {
      document.removeEventListener('visibilitychange', revalidar)
      window.removeEventListener('focus', revalidar)
      enVuelo?.abort()
    }
  }, [ruta, mensajeGenerico])

  return { estado, recargar }
}
