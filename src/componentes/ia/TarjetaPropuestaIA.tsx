'use client'

import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { leerAccion, type AccionIA } from '@/dominio/ia'
import { esResoluble, estadoDeAccion, segundosParaExpirar } from '@/dominio/ia-chat'

/**
 * La tarjeta de una escritura que WiBot dejo preparada.
 *
 * === POR QUE ESTE COMPONENTE NO SABE QUE VA A ESCRIBIR ===
 *
 * Lo unico que manda al servidor es `{ decision }` sobre una ruta con un id. **No arma un cuerpo de
 * escritura, no conoce los campos y no podria cambiarlos.** El QUE esta congelado en la fila desde
 * que se propuso, y por eso lo que se lee acá y lo que se ejecuta son la misma decision: si el
 * navegador pudiera mandar los campos, "confirmar" no significaria nada.
 *
 * El `resumen` y el `detalle` los escribio el SERVIDOR con los argumentos normalizados y los titulos
 * leidos de la base, nunca el modelo. Es la barrera mas dura de todas las que protegen esto, y solo
 * funciona si lo que se lee antes de apretar es verdad.
 *
 * === EL RESUMEN SE MUESTRA ENTERO ===
 *
 * Desde que WiBot vive en todo el panel, la propuesta puede ser sobre un Espacio que **no** es el
 * que la persona esta mirando, y el ambito viene dentro del `resumen`. Recortarlo con un `truncate`
 * o un `line-clamp` esconderia justo la parte que avisa que la accion es en otro lado: es la unica
 * señal de eso que hay en la tarjeta. Por eso el parrafo envuelve, parte las palabras largas y no
 * lleva ningun tope de lineas.
 *
 * === LO ASUMIDO SE LEE APARTE, Y MAS BAJITO ===
 *
 * Cuando al pedido le falta un dato, el servidor completa lo mas razonable y lo escribe en
 * `supuestos`. Mezclado dentro del `detalle` seria indistinguible de lo que la persona pidio, que
 * es justo lo que hay que poder distinguir antes de apretar Confirmar: lo pedido no se revisa, lo
 * asumido si. Por eso va en su propia lista, con encabezado propio y un tono mas apagado que el del
 * detalle —`sutil` contra `tenue`—: se lee como "esto lo completé yo".
 *
 * === EL DETALLE TAMPOCO SE CORTA ===
 *
 * Una propuesta de tipo `plan` trae un paso por linea, numerado y con sus lineas indentadas debajo.
 * De ahi el `whitespace-pre-wrap`: sin el, el navegador colapsa la sangria y los ocho pasos quedan
 * como un bloque plano donde no se ve donde termina uno y empieza el siguiente. Y como el resumen,
 * el detalle no lleva tope de lineas: si es largo, la tarjeta crece.
 *
 * === EL BOTON DESHABILITADO NO ES LA IDEMPOTENCIA ===
 *
 * La idempotencia real esta en el servidor: un `UPDATE ... WHERE estado='pendiente'` que la segunda
 * peticion pierde, y devuelve `409`. Comprobado con tres clics seguidos: una tarea, dos `409`.
 * El `disabled` y el `enVuelo` de acá solo evitan el doble clic, que es un problema de interfaz —el
 * `409` es correcto pero se pinta como un error encima de un exito—. Confiar en ellos para no
 * escribir dos veces seria confiar en el navegador.
 *
 * === LA CUENTA ATRAS ===
 *
 * Se pinta con el reloj del navegador y no decide nada: el servidor recalcula la caducidad al leer
 * y la vuelve a comprobar al confirmar. Existe para que abandonar una propuesta se vea como lo que
 * es —dejarla morir— en vez de como una tarjeta que se queda ahi para siempre.
 */

/** Cada cuanto se repinta la cuenta atras. Un minuto: es lo que se muestra, no vale mas fino. */
const LATIDO_MS = 15000

/** Lo que se dice cuando el fallo no trae mensaje propio. */
const MENSAJE_GENERICO = 'No se pudo resolver la acción.'

/** Como se lee cada estado final, y con que tono. */
const ESTADOS: Record<string, { texto: string, clase: string }> = {
  ejecutada: { texto: 'Hecho', clase: 'text-texto-exito' },
  rechazada: { texto: 'Rechazada', clase: 'text-texto-tenue' },
  expirada: { texto: 'Caducada', clase: 'text-texto-tenue' },
  fallida: { texto: 'No se pudo', clase: 'text-texto-peligro' },
  ejecutando: { texto: 'Ejecutando…', clase: 'text-texto-tenue' }
}

/**
 * @param accion la propuesta, tal como llego del stream o del hilo guardado
 * @param onResuelta se llama con la accion ya resuelta que devolvio el servidor
 */
export function TarjetaPropuestaIA (
  { accion, onResuelta, proyectoId }: { accion: AccionIA, onResuelta: (accion: AccionIA) => void, proyectoId?: number }
): ReactElement {
  const [ahora, setAhora] = useState(() => Date.now())
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  // El `disabled` llega tarde: `setEnviando(true)` no repinta antes de que el segundo clic del doble
  // clic entre en el mismo tick. Sin esta marca sincrona salen tres peticiones, y aunque el servidor
  // solo escribe una vez, las otras dos vuelven `409` y pintan "ya se resolvió" encima del "Hecho".
  const enVuelo = useRef(false)

  const abierta = esResoluble(accion, ahora)

  // El reloj solo corre mientras haya algo que contar: una tarjeta ya resuelta no repinta nada.
  useEffect(() => {
    if (accion.estado !== 'pendiente') return

    const reloj = setInterval(() => { setAhora(Date.now()) }, LATIDO_MS)

    return () => { clearInterval(reloj) }
  }, [accion.estado])

  /**
   * Manda la decision y guarda lo que el servidor conteste.
   *
   * El cuerpo lleva **solo la decision**: la ruta ya identifica la fila y la fila ya lleva su
   * Espacio y su persona.
   */
  async function resolver (decision: 'confirmar' | 'rechazar'): Promise<void> {
    if (enVuelo.current) return

    enVuelo.current = true
    setEnviando(true)
    setError('')

    const ruta = proyectoId === undefined ? `ia/acciones/${accion.id}` : `ia/proyectos/${proyectoId}/acciones/${accion.id}`
    const resultado = await escribirEnBff<unknown>(ruta, 'POST', { decision })

    enVuelo.current = false
    setEnviando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje === '' ? MENSAJE_GENERICO : resultado.mensaje)

      return
    }

    // Se pinta lo que devolvio el servidor, no lo que el navegador supone que paso: un `409` que
    // llegara como `ok` por un cambio futuro no puede pintar "Hecho" sobre algo que no se hizo.
    const resuelta = leerAccion(resultado.datos)

    if (resuelta === null) {
      setError(MENSAJE_GENERICO)

      return
    }

    onResuelta(resuelta)
  }

  const estado = ESTADOS[estadoDeAccion(accion, ahora)]

  return (
    <div className="border-linea bg-superficie rounded-tarjeta flex flex-col gap-2 border p-3">
      <p className="text-texto break-words text-sm font-medium">{accion.resumen}</p>

      {accion.detalle.length > 0 && (
        <ul className="text-texto-tenue flex flex-col gap-0.5 text-xs">
          {accion.detalle.map((linea, indice) => (
            <li key={indice} className="break-words whitespace-pre-wrap">{linea}</li>
          ))}
        </ul>
      )}

      {accion.supuestos.length > 0 && (
        <div className="text-texto-sutil flex flex-col gap-0.5 text-xs">
          <p className="font-medium">Asumí:</p>
          <ul className="flex flex-col gap-0.5">
            {accion.supuestos.map((linea, indice) => (
              <li key={indice} className="break-words whitespace-pre-wrap">{linea}</li>
            ))}
          </ul>
        </div>
      )}

      {abierta
        ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Boton
                tamano="chico"
                variante="primario"
                cargando={enviando}
                disabled={enviando}
                onClick={() => { void resolver('confirmar') }}
              >
                Confirmar
              </Boton>
              <Boton
                tamano="chico"
                variante="sutil"
                disabled={enviando}
                onClick={() => { void resolver('rechazar') }}
              >
                Rechazar
              </Boton>
              <span className="text-texto-sutil text-xs">
                Caduca en {minutosRestantes(accion, ahora)}
              </span>
            </div>

            <p className="text-texto-sutil text-xs">No se hace nada hasta que confirmes.</p>
          </>
          )
        : (
          <p className={`text-xs ${estado?.clase ?? 'text-texto-tenue'}`}>
            <span className="font-medium">{estado?.texto ?? 'Resuelta'}</span>
            {accion.resultado === null ? '' : ` · ${accion.resultado}`}
          </p>
          )}

      {error !== '' && <p role="alert" className="text-texto-peligro text-xs">{error}</p>}
    </div>
  )
}

/**
 * Los minutos que quedan, en palabras.
 *
 * Se redondea hacia arriba y el ultimo tramo se dice "menos de un minuto": un contador de segundos
 * apura a quien tiene que leer antes de decidir, que es lo contrario de lo que esta tarjeta busca.
 *
 * @param accion la propuesta
 * @param ahora milisegundos
 */
function minutosRestantes (accion: AccionIA, ahora: number): string {
  const segundos = segundosParaExpirar(accion, ahora)

  if (segundos < 60) return 'menos de un minuto'

  const minutos = Math.ceil(segundos / 60)

  return minutos === 1 ? '1 minuto' : `${minutos} minutos`
}
