'use client'

import { useEffect, useRef, useState } from 'react'
import { AlarmClock } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { horaLocal } from '@/dominio/salas'
import { cn } from '@/lib/clases'
import { sonarAviso } from '@/lib/sonido'

/**
 * La pregunta "¿Estás ahí?" que sale cuando llega la hora de corte y la jornada sigue abierta.
 *
 * === POR QUE EXISTE ===
 *
 * El cierre automático cortaba a una hora fija sin preguntarle a nadie: quien seguía trabajando
 * perdía el resto de su tarde. Ahora la hora de corte es la hora de una pregunta. Quien contesta
 * "Sigo trabajando" corre su jornada media hora, y a la media hora se le vuelve a preguntar; quien
 * no contesta dentro del plazo tenía la jornada olvidada abierta, que es el caso para el que el
 * cierre automático existe.
 *
 * === QUIEN CIERRA ES EL SERVIDOR ===
 *
 * El plazo lo cuenta el cron, no esta pantalla: vencido sin respuesta, cierra la jornada
 * registrada a la hora de la pregunta —el tiempo sin contestar no cuenta como trabajado—. La
 * cuenta regresiva de acá sólo muestra ese plazo, calculada contra el reloj y no restando de a uno,
 * para que una pestaña de fondo, que el navegador frena, no muestre minutos que ya pasaron.
 *
 * === POR QUE SUENA ===
 *
 * Porque la persona que hay que alcanzar suele estar en otra ventana. Suena al aparecer y cada
 * `MINUTOS_ENTRE_SONIDOS` mientras nadie contesta: una vez sola se pierde con los audífonos puestos,
 * y un sonido por segundo sería una alarma.
 *
 * === POR QUE `alert` Y NO `status` ===
 *
 * Al revés que `RecordatorioDeDestino`, que es un recordatorio que se va solo: acá hay una
 * consecuencia inminente —el día se cierra y los cronómetros se detienen—, así que interrumpir a
 * quien usa un lector de pantalla es exactamente lo correcto.
 */

/** Cada cuánto vuelve a sonar la pregunta mientras nadie contesta, en minutos. */
export const MINUTOS_ENTRE_SONIDOS = 5

interface PropsAvisoDeCierre {
  /** Cuándo apareció la pregunta, en ISO. */
  preguntaEn: string
  /** Cuándo se cierra la jornada si nadie contesta, en ISO. Lo decide el servidor. */
  plazoEn: string
  /** Cuánto corre la jornada cada "sigo trabajando", en minutos. */
  minutosDeProrroga: number
  /** `true` si esta jornada ya se corrió antes. Cambia el encabezado, no los botones. */
  yaProrrogada: boolean
  /** `true` mientras una de las dos peticiones está en vuelo. Congela los botones. */
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
  /** Se acabó el plazo sin respuesta. Quien lo reciba vuelve a preguntarle al servidor. */
  onVencido: () => void
}

/**
 * Segundos que faltan hasta un instante, nunca negativos.
 *
 * @param instante epoch en milisegundos
 * @returns segundos enteros restantes; `0` si ya pasó o el instante no es válido
 */
function segundosHasta (instante: number): number {
  if (Number.isNaN(instante)) return 0

  return Math.max(0, Math.ceil((instante - Date.now()) / 1000))
}

/**
 * Formatea segundos como `m:ss`.
 *
 * @param segundos cantidad no negativa
 * @returns por ejemplo `29:05`
 */
function minutosYSegundos (segundos: number): string {
  const minutos = Math.floor(segundos / 60)

  return `${minutos}:${String(segundos % 60).padStart(2, '0')}`
}

export function AvisoDeCierre ({
  preguntaEn,
  plazoEn,
  minutosDeProrroga,
  yaProrrogada,
  enCurso,
  aviso,
  onProrrogar,
  onCerrarAhora,
  onVencido
}: PropsAvisoDeCierre) {
  const plazo = Date.parse(plazoEn)
  const pregunta = Date.parse(preguntaEn)
  const [restantes, setRestantes] = useState(() => segundosHasta(plazo))

  // `onVencido` en una ref y no en las dependencias del efecto: si cambiara de identidad entre
  // pintados —y una función declarada en el cuerpo del padre cambia en cada uno— el intervalo se
  // reiniciaría en cada pintado.
  const vencido = useRef(onVencido)
  useEffect(() => { vencido.current = onVencido }, [onVencido])

  useEffect(() => {
    const id = globalThis.setInterval(() => {
      const quedan = segundosHasta(plazo)

      setRestantes(quedan)
      if (quedan > 0) return

      globalThis.clearInterval(id)
      vencido.current()
    }, 1000)

    return () => { globalThis.clearInterval(id) }
  }, [plazo])

  useEffect(() => {
    sonarAviso()

    const id = globalThis.setInterval(sonarAviso, MINUTOS_ENTRE_SONIDOS * 60_000)

    return () => { globalThis.clearInterval(id) }
  }, [])

  const hora = horaLocal(preguntaEn)
  const total = Number.isNaN(plazo) || Number.isNaN(pregunta) ? 0 : Math.max(1, (plazo - pregunta) / 1000)

  return (
    <div
      role="alert"
      aria-live="assertive"
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
          <p className="text-texto text-sm font-semibold">¿Estás ahí?</p>
          <p className="text-texto-tenue text-xs text-pretty">
            {yaProrrogada ? `Se acabó tu prórroga de las ${hora}.` : `Son las ${hora} y tu jornada sigue abierta.`}{' '}
            Si no contestas, se cierra sola en{' '}
            <strong className="text-texto tabular-nums">{minutosYSegundos(restantes)}</strong>{' '}
            con salida a las {hora}, y se detienen tus cronómetros. Si sigues trabajando, dilo y te
            vuelvo a preguntar en {minutosDeProrroga} minutos.
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
          style={{ width: `${total === 0 ? 0 : Math.min(100, (restantes / total) * 100)}%` }}
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
