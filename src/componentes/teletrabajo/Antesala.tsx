'use client'

import { useEffect, useRef, useState } from 'react'
import { usePreviewTracks, useMediaDeviceSelect, usePersistentUserChoices } from '@livekit/components-react'
import { LocalVideoTrack } from 'livekit-client'
import { ArrowLeft, Lock, Mic, MicOff, Video, VideoOff } from 'lucide-react'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Boton } from '@/componentes/formularios/Boton'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Selector, DisparadorSelector, ContenidoSelector, Opcion } from '@/componentes/formularios/Selector'
import { cn } from '@/lib/clases'
import type { EleccionDeEntrada, Quien } from './tipos'
import type { QuienEsta } from '@/datos/teletrabajo'

interface PropsAntesala {
  titulo: string
  esPrivada: boolean
  yo: Quien
  /** Quien esta ya dentro. `null` = no se pudo consultar (servidor caido o sala aun inexistente). */
  dentro: QuienEsta[] | null
  alEntrar: (eleccion: EleccionDeEntrada) => void
  alVolver: () => void
}

/** Cuantos avatares de "quien esta dentro" se muestran antes de pasar al contador. */
const MAXIMO_AVATARES_DENTRO = 5

/**
 * Que dispositivo tiene que mostrar el desplegable.
 *
 * Devuelve el id activo **solo si existe como opcion**. LiveKit informa a veces `default` o el id
 * de un aparato que ya se desenchufo, y un `value` sin opcion que le corresponda deja el
 * desplegable completamente vacio: sin nombre y **sin el marcador**, porque para Radix hay un valor
 * elegido. Un control en blanco que no dice ni "elegir" es la peor version posible de esto.
 *
 * @param dispositivos Lo que hay conectado ahora.
 * @param activo       Id que informa LiveKit.
 * @returns El id a mostrar, o `undefined` para que se vea el marcador.
 */
function elegido (dispositivos: MediaDeviceInfo[], activo: string): string | undefined {
  return dispositivos.some((dispositivo) => dispositivo.deviceId === activo) ? activo : undefined
}

/**
 * Vuelve a elegir el dispositivo que esta persona uso la ultima vez.
 *
 * No hace nada si lo guardado ya esta activo, si no hay nada guardado o si ese aparato no aparece
 * entre los conectados: un id de auriculares desenchufados no es una preferencia, es basura, y
 * aplicarlo dejaria el desplegable señalando algo que no existe.
 *
 * @param dispositivos Lo que hay conectado ahora.
 * @param guardado     Id que quedo en `localStorage` la vez anterior.
 * @param activo       Id que se esta usando ahora.
 * @param elegir       Aplica el cambio en LiveKit.
 */
function restaurar (
  dispositivos: MediaDeviceInfo[],
  guardado: string,
  activo: string,
  elegir: (id: string) => Promise<void>
): void {
  if (guardado === '' || guardado === activo) return
  if (!dispositivos.some((dispositivo) => dispositivo.deviceId === guardado)) return

  // Un fallo al restaurar no puede romper la antesala: se sigue con el dispositivo por defecto del
  // sistema, que es exactamente lo que se veria si nunca se hubiera guardado nada.
  elegir(guardado).catch(() => undefined)
}

/**
 * Paso previo a una videollamada: la persona se ve, elige microfono y camara, y ve quien ya esta
 * dentro antes de conectar.
 *
 * Existe porque hoy se entra directo a la sala sin nada de esto: ni indicador de donde se esta, ni
 * nombre propio visible. Micrófono y camara arrancan APAGADOS a proposito (ver el estado
 * `microfono`/`camara` mas abajo): publicar por defecto hace que alguien que abre la sala por
 * curiosidad aparezca hablando sin saberlo.
 *
 * @param titulo nombre de la sala a mostrar en la cabecera
 * @param esPrivada si es true, muestra el chip de sala privada
 * @param yo quien mira la antesala, para el preview y el chip sobre el video
 * @param dentro quienes ya estan en la sala, o `null` si no se pudo consultar
 * @param alEntrar se llama con la eleccion final de dispositivos al confirmar el ingreso
 * @param alVolver se llama al cancelar y salir de la antesala
 */
export function Antesala ({ titulo, esPrivada, yo, dentro, alEntrar, alVolver }: PropsAntesala) {
  const { userChoices, saveAudioInputEnabled, saveVideoInputEnabled, saveAudioInputDeviceId, saveVideoInputDeviceId } =
    usePersistentUserChoices()

  // Los interruptores arrancan apagados SIEMPRE, aunque `usePersistentUserChoices` recuerde que la
  // ultima vez estaban prendidos: la persistencia es para el DISPOSITIVO elegido, no para si se
  // publica. Repetir esa sorpresa cada vez que se vuelve a esta sala seria el mismo problema de
  // origen otra vez.
  const [microfono, setMicrofono] = useState(false)
  const [camara, setCamara] = useState(false)
  const [errorPreview, setErrorPreview] = useState<string | null>(null)

  const microfonos = useMediaDeviceSelect({ kind: 'audioinput' })
  const camaras = useMediaDeviceSelect({ kind: 'videoinput' })

  // El valor visible sale de `activeDeviceId`, que es el dispositivo que LiveKit esta usando de
  // verdad, y no de `userChoices`: lo guardado puede ser el id de un aparato que ya no esta
  // enchufado —o el literal `default`, que es lo que se guarda la primera vez—, y entonces el
  // desplegable no encuentra la opcion y se pinta VACIO, sin nombre y sin marcador.
  const idMicrofono = elegido(microfonos.devices, microfonos.activeDeviceId)
  const idCamara = elegido(camaras.devices, camaras.activeDeviceId)

  // Lo guardado se aplica UNA vez, cuando la lista de dispositivos ya llego, y solo si ese aparato
  // sigue enchufado. Aplicarlo a ciegas dejaria elegido un microfono que ya no existe.
  useEffect(() => {
    restaurar(microfonos.devices, userChoices.audioDeviceId, microfonos.activeDeviceId, microfonos.setActiveMediaDevice)
  }, [microfonos.devices, microfonos.activeDeviceId, microfonos.setActiveMediaDevice, userChoices.audioDeviceId])

  useEffect(() => {
    restaurar(camaras.devices, userChoices.videoDeviceId, camaras.activeDeviceId, camaras.setActiveMediaDevice)
  }, [camaras.devices, camaras.activeDeviceId, camaras.setActiveMediaDevice, userChoices.videoDeviceId])

  /**
   * Pistas locales SUELTAS para el preview: no entran a la sala ni consumen ancho de banda de
   * nadie. Solo existen en este navegador hasta que se sueltan mas abajo, en `entrar`.
   */
  const pistas = usePreviewTracks(
    {
      audio: microfono ? { deviceId: idMicrofono } : false,
      video: camara ? { deviceId: idCamara } : false
    },
    (error) => setErrorPreview(error.message)
  )

  const pistaDeVideo = pistas?.find((pista) => pista instanceof LocalVideoTrack)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const elemento = videoRef.current
    if (!pistaDeVideo || !elemento) return
    pistaDeVideo.attach(elemento)
    // Sin este detach la camara sigue tomada por el preview al salir: la luz de la camara queda
    // encendida aunque el componente ya no este en pantalla.
    return () => {
      pistaDeVideo.detach(elemento)
    }
  }, [pistaDeVideo])

  /**
   * Confirma el ingreso a la sala con la eleccion actual de dispositivos.
   *
   * Suelta las pistas del preview ANTES de avisarle al padre: si quedan vivas, LiveKit intenta
   * abrir la camara para publicar mientras el preview todavia la tiene tomada, y el navegador
   * puede negarla con `NotReadableError`. Es una falla real y facil de no ver en desarrollo, donde
   * rara vez hay dos consumidores peleando por la misma camara a la vez.
   */
  function entrar () {
    pistas?.forEach((pista) => pista.stop())
    alEntrar({ microfono, camara, idMicrofono, idCamara })
  }

  async function elegirMicrofono (id: string) {
    try {
      await microfonos.setActiveMediaDevice(id)
      saveAudioInputDeviceId(id)
    } catch (error) {
      setErrorPreview(error instanceof Error ? error.message : 'No se pudo cambiar el micrófono.')
    }
  }

  async function elegirCamara (id: string) {
    try {
      await camaras.setActiveMediaDevice(id)
      saveVideoInputDeviceId(id)
    } catch (error) {
      setErrorPreview(error instanceof Error ? error.message : 'No se pudo cambiar la cámara.')
    }
  }

  function alternarMicrofono () {
    const proximo = !microfono
    setMicrofono(proximo)
    saveAudioInputEnabled(proximo)
  }

  function alternarCamara () {
    const proximo = !camara
    setCamara(proximo)
    saveVideoInputEnabled(proximo)
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="rounded-tarjeta border-linea bg-superficie-elevada shadow-1 border p-5">
        <div className="mb-4 flex items-center gap-3">
          <Boton variante="sutil" soloIcono aria-label="Volver" title="Volver" onClick={alVolver}>
            <ArrowLeft className="size-4" />
          </Boton>
          <h1 className="font-titular text-texto flex-1 truncate text-lg font-bold">{titulo}</h1>
          {esPrivada && (
            <Insignia tono="contorno">
              <Lock className="size-3" />
              Privada
            </Insignia>
          )}
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <div className="lienzo-video rounded-medio relative aspect-video overflow-hidden">
              {/* El avatar esta SIEMPRE, debajo, y el video lo tapa cuando hay imagen. Turnarlos
                  dejaba un recuadro vacio entre que se pulsa "Activar cámara" y llega el primer
                  fotograma: la pista ya existe, el `<video>` ya esta montado y todavia no pinta
                  nada. Ese hueco se lee como que la camara no funciona.

                  Mas grande que el `grande` del sistema: aca el avatar no acompaña a un nombre en
                  una fila, es lo unico que ocupa el recuadro. */}
              <div className="absolute inset-0 flex items-center justify-center">
                <Avatar nombre={yo.nombre} imagen={yo.imagen} tamano="grande" className="size-20 text-xl" />
              </div>

              {camara && pistaDeVideo && (
                // Espejado: la gente espera verse como en un espejo. Sin esto el texto de la
                // camiseta sale al reves y desconcierta.
                <video ref={videoRef} muted playsInline className="absolute inset-0 size-full -scale-x-100 object-cover" />
              )}
              {/* El indicador de "donde estoy" que faltaba: el nombre de quien mira, encima del
                  propio preview. */}
              <span className="sobre-video absolute bottom-2 left-2 rounded-chico px-2 py-1 text-xs">
                {yo.nombre}
              </span>
            </div>

            {errorPreview && (
              <p role="status" className="text-texto-peligro text-xs">
                No pudimos acceder a tus dispositivos: {errorPreview}
              </p>
            )}

            <div className="flex gap-2">
              <Boton
                variante={microfono ? 'primario' : 'secundario'}
                aria-pressed={microfono}
                aria-label={microfono ? 'Silenciar micrófono' : 'Activar micrófono'}
                title={microfono ? 'Silenciar micrófono' : 'Activar micrófono'}
                onClick={alternarMicrofono}
              >
                {microfono ? <Mic className="size-4" /> : <MicOff className="size-4" />}
                {microfono ? 'Micrófono activo' : 'Micrófono apagado'}
              </Boton>
              <Boton
                variante={camara ? 'primario' : 'secundario'}
                aria-pressed={camara}
                aria-label={camara ? 'Apagar cámara' : 'Activar cámara'}
                title={camara ? 'Apagar cámara' : 'Activar cámara'}
                onClick={alternarCamara}
              >
                {camara ? <Video className="size-4" /> : <VideoOff className="size-4" />}
                {camara ? 'Cámara activa' : 'Cámara apagada'}
              </Boton>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              {/* Con etiqueta propia y no solo con el marcador: en cuanto se elige un dispositivo,
                  el marcador desaparece y quedarian dos desplegables identicos sin decir cual es
                  cual. */}
              <label className="flex flex-col gap-1 text-xs font-medium text-texto-tenue">
                Micrófono
              <Selector
                value={idMicrofono}
                onValueChange={elegirMicrofono}
                disabled={microfonos.devices.length === 0}
              >
                <DisparadorSelector
                  marcador={microfonos.devices.length === 0 ? 'Sin micrófonos disponibles' : 'Elegir micrófono'}
                />
                <ContenidoSelector>
                  {microfonos.devices.map((dispositivo) => (
                    <Opcion key={dispositivo.deviceId} value={dispositivo.deviceId}>
                      {dispositivo.label || 'Dispositivo sin nombre'}
                    </Opcion>
                  ))}
                </ContenidoSelector>
              </Selector>
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium text-texto-tenue">
                Cámara
              <Selector
                value={idCamara}
                onValueChange={elegirCamara}
                disabled={camaras.devices.length === 0}
              >
                <DisparadorSelector
                  marcador={camaras.devices.length === 0 ? 'Sin cámaras disponibles' : 'Elegir cámara'}
                />
                <ContenidoSelector>
                  {camaras.devices.map((dispositivo) => (
                    <Opcion key={dispositivo.deviceId} value={dispositivo.deviceId}>
                      {dispositivo.label || 'Dispositivo sin nombre'}
                    </Opcion>
                  ))}
                </ContenidoSelector>
              </Selector>
              </label>
            </div>

            <QuienEstaDentro dentro={dentro} />

            <Boton variante="primario" tamano="grande" onClick={entrar} className="mt-auto">
              Entrar
            </Boton>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Lista de quien ya esta dentro de la sala, con sus tres estados posibles.
 *
 * Separado del cuerpo principal porque son tres mensajes distintos segun el dato (no se pudo
 * consultar, sala vacia, hay gente) y mezclarlos en linea tapaba la logica de la antesala.
 *
 * @param dentro personas dentro, `[]` si esta vacia, `null` si no se pudo consultar
 */
function QuienEstaDentro ({ dentro }: { dentro: QuienEsta[] | null }) {
  if (dentro === null) {
    return <p className="text-texto-sutil text-sm">No pudimos ver quién está dentro.</p>
  }

  if (dentro.length === 0) {
    return <p className="text-texto-sutil text-sm">Todavía no hay nadie. Vas a ser la primera persona.</p>
  }

  const visibles = dentro.slice(0, MAXIMO_AVATARES_DENTRO)
  const restantes = dentro.length - visibles.length

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center" aria-hidden="true">
        {visibles.map((persona) => (
          <Avatar
            key={persona.identidad}
            nombre={persona.nombre}
            imagen={persona.imagen}
            tamano="chico"
            className={cn('ring-superficie-elevada -ml-1 ring-2 first:ml-0')}
          />
        ))}
        {restantes > 0 && (
          <span className="bg-relleno-neutro text-texto-tenue ring-superficie-elevada -ml-1 inline-flex size-6 items-center justify-center rounded-full text-[0.625rem] font-semibold ring-2">
            +{restantes}
          </span>
        )}
      </div>
      <p className="text-texto-tenue text-sm">
        {dentro.length === 1 ? '1 persona ya está dentro' : `${dentro.length} personas ya están dentro`}
        {': '}
        {dentro.map((persona) => persona.nombre).join(', ')}
      </p>
    </div>
  )
}
