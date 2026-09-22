'use client'

import { useEffect, useRef, useState } from 'react'
import { AlarmClock } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { horaLocal } from '@/dominio/salas'
import { cn } from '@/lib/clases'

/**
 * El aviso que sale cuando llega la hora de cierre y la jornada sigue abierta.
 *
 * === POR QUE EXISTE ===
 *
 * El cierre automático corta a la hora configurada sin preguntarle a nadie. Quien seguía trabajando
 * a esa hora perdía el resto de su tarde: la jornada se cerraba, los cronómetros se detenían, y
 * había que volver a abrir todo. El aviso previo por la campana —media hora antes— avisaba pero no
 * ofrecía salida, así que el único camino era cerrar y reabrir a mano.
 *
 * Esto es la salida: en el momento exacto del corte pregunta si sigue habiendo alguien, y quien
 * conteste corre su propio cierre media hora más. Quien no conteste tenía la jornada olvidada
 * abierta, que es el caso para el que el cierre automático existe.
 *
 * === POR QUE UNA CUENTA REGRESIVA Y NO UN DIALOGO QUE ESPERA ===
 *
 * Porque el caso que hay que resolver bien es el de la persona que NO está. Un diálogo que espera
 * indefinidamente deja la jornada abierta hasta mañana justo cuando nadie la mira, o sea que
 * desactiva el cierre automático para todo el mundo salvo para quien se acuerda de cerrarlo. El
 * plazo es lo que hace que el silencio signifique algo.
 *
 * Treinta segundos y no tres: la frase tiene que poder leerse y decidirse. Tampoco cinco minutos,
 * que ya es un aviso que se queda de adorno en una pantalla que nadie está mirando.
 *
 * === POR QUE LA CUENTA SE CONGELA CON EL FOCO DENTRO Y NO CON EL PUNTERO ENCIMA ===
 *
 * Porque el foco dentro del aviso es prueba de que hay alguien: quien navega con teclado tarda más
 * en llegar al botón y no tiene por qué perder el día por eso. El puntero encima no prueba nada —un
 * ratón se queda donde se lo dejó— y congelar por hover convertiría un escritorio con el cursor
 * olvidado sobre el aviso en una jornada que no se cierra nunca.
 *
 * Congelar la cuenta no es quitarle el plazo a nadie: el botón "Sigo trabajando" corre el cierre de
 * verdad, en el servidor, y es la salida que WCAG 2.2.1 pide para un límite de tiempo.
 *
 * === POR QUE `alert` Y NO `status` ===
 *
 * Al revés que `RecordatorioDeDestino`, que es un recordatorio que se va solo: acá hay una
 * consecuencia inminente y no reversible desde la pantalla —el día se cierra y los cronómetros se
 * detienen—, así que interrumpir a quien usa un lector de pantalla es exactamente lo correcto.
 */

/**
 * Cuánto se espera una respuesta antes de cerrar la jornada, en segundos.
 *
 * El mismo número que dice el texto del aviso. Si cambia, cambia en los dos lados a la vez porque
 * el texto lo lee de acá.
 */
export const SEGUNDOS_DE_GRACIA = 30

interface PropsAvisoDeCierre {
  /** La hora de cierre, en ISO. Sólo para decirla; el plazo lo lleva este componente. */
  cierreEn: string
  /** Cuánto corre el cierre cada "sigo trabajando", en minutos. */
  minutosDeProrroga: number
  /** `true` si esta jornada ya se corrió antes. Cambia el encabezado, no los botones. */
  yaProrrogada: boolean
  /** `true` mientras una de las dos peticiones está en vuelo. Congela la cuenta y los botones. */
  enCurso: boolean
  /**
   * Por qué falló la última petición, o `null`.
   *
   * Llega hasta acá y no se queda en el cuerpo del control porque en la variante compacta ese
   * cuerpo vive dentro de un desplegable cerrado: un "sigo trabajando" que no llegó se anunciaría
   * en una pantalla que nadie tiene abierta, y la persona se quedaría creyendo que su día está a
   * salvo.
   */
  aviso: string | null
  /** "Sigo trabajando": pide la prórroga al servidor. */
  onProrrogar: () => void
  /** "Cerrar jornada": la cierra ahora, sin esperar el plazo. */
  onCerrarAhora: () => void
  /** Se acabó el plazo sin respuesta. Quien lo reciba cierra la jornada. */
  onVencido: () => void
}

export function AvisoDeCierre ({
  cierreEn,
  minutosDeProrroga,
  yaProrrogada,
  enCurso,
  aviso,
  onProrrogar,
  onCerrarAhora,
  onVencido
}: PropsAvisoDeCierre) {
  const [restantes, setRestantes] = useState(SEGUNDOS_DE_GRACIA)
  /** `true` mientras el foco está dentro del aviso. Congela la cuenta; ver el docblock. */
  const [retenido, setRetenido] = useState(false)

  // `onVencido` en una ref y no en las dependencias del efecto: si cambiara de identidad entre
  // pintados —y una función declarada en el cuerpo del padre cambia en cada uno— el intervalo se
  // reiniciaría y la cuenta no bajaría nunca de treinta.
  const vencido = useRef(onVencido)
  useEffect(() => { vencido.current = onVencido }, [onVencido])

  // Un fallo detiene la cuenta, igual que el foco. Hubo alguien —acaba de pulsar un botón— y dejar
  // correr el reloj hacia un cierre que probablemente tampoco va a salir, porque el fallo suele ser
  // de red, sólo añadiría un segundo error encima del primero.
  const congelada = retenido || enCurso || aviso !== null

  useEffect(() => {
    if (congelada) return

    const id = globalThis.setInterval(() => {
      setRestantes((previo) => {
        if (previo > 1) return previo - 1

        globalThis.clearInterval(id)
        vencido.current()

        return 0
      })
    }, 1000)

    return () => { globalThis.clearInterval(id) }
  }, [congelada])

  const hora = horaLocal(cierreEn)

  return (
    <div
      role="alert"
      aria-live="assertive"
      onFocusCapture={() => { setRetenido(true) }}
      onBlurCapture={() => { setRetenido(false) }}
      className={cn(
        // Esquina inferior derecha en pantalla ancha; en móvil sube por encima del botón del chat y
        // ocupa el ancho disponible, como el resto de los avisos flotantes del panel.
        'border-linea bg-superficie-flotante fixed bottom-24 left-1/2 z-[60] -translate-x-1/2',
        'sm:bottom-4 sm:left-auto sm:right-4 sm:translate-x-0',
        'flex w-[min(26rem,calc(100vw-2rem))] flex-col gap-3 rounded-2xl border px-4 py-3 shadow-lg',
        'animate-entrar-abajo'
      )}
    >
      <div className="flex items-start gap-3">
        <AlarmClock className="text-texto-tenue mt-0.5 size-5 shrink-0" aria-hidden />

        <div className="min-w-0 flex-1">
          <p className="text-texto text-sm font-semibold">
            {yaProrrogada ? `Se acabó la prórroga: son las ${hora}` : `Son las ${hora}`}
          </p>
          <p className="text-texto-tenue text-xs text-pretty">
            Tu jornada se cierra sola en{' '}
            <strong className="text-texto tabular-nums">{restantes}</strong>{' '}
            {restantes === 1 ? 'segundo' : 'segundos'} y se detienen tus cronómetros. Si sigues
            trabajando, dilo y la corro {minutosDeProrroga} minutos más.
          </p>

          {/* Sin `role="alert"` propio: ya está dentro de una región `assertive`, y anidar dos
              alertas hace que algunos lectores anuncien el aviso entero otra vez. */}
          {aviso !== null && (
            <p className="text-texto-peligro mt-2 text-pretty text-xs">{aviso}</p>
          )}
        </div>
      </div>

      {/* Una barra, no un anillo: se lee de reojo desde lejos y no compite con el número. Es
          decorativa —el número ya dice lo mismo en texto— así que queda fuera del árbol de
          accesibilidad en vez de anunciarse cada segundo. */}
      <div className="bg-control h-1 w-full overflow-hidden rounded-full" aria-hidden>
        <div
          className="bg-acento h-full rounded-full transition-[width] duration-1000 ease-linear"
          style={{ width: `${(restantes / SEGUNDOS_DE_GRACIA) * 100}%` }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Boton variante="sutil" tamano="chico" disabled={enCurso} onClick={onCerrarAhora}>
          Cerrar jornada
        </Boton>

        {/* Primario y el último de la fila: es la respuesta que el aviso espera, y la otra la toma
            el silencio de todas formas. */}
        <Boton variante="primario" tamano="chico" disabled={enCurso} onClick={onProrrogar}>
          Sigo trabajando
        </Boton>
      </div>
    </div>
  )
}
