'use client'

import { Bell, BellOff, BellRing, Check, CircleAlert, Send, Share, ShieldAlert, SquarePlus } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Boton } from '@/componentes/formularios/Boton'
import { Seccion } from '@/componentes/presentadores/Ficha'
import { mensajeDeRespuesta } from '@/datos/cliente'
import {
  bytesDeClave,
  cuerpoDeSuscripcion,
  esDispositivoIOS,
  estadoDelDispositivo,
  mensajeDePrueba,
  type EstadoDelDispositivo,
  type EstadoPushServidor,
  type MensajeDePrueba,
  type ResumenPrueba
} from '@/dominio/push'
import { cn } from '@/lib/clases'
import estilos from './push.module.css'

/**
 * El service worker de la app. Lo mantiene el frente de la PWA (`public/sw.js`), que carga
 * `public/sw-push.js` adentro. Aca solo se reutiliza su registro, o se lo pide si todavia no esta:
 * registrar la misma URL dos veces devuelve el mismo registro, no uno nuevo.
 */
const RUTA_SERVICE_WORKER = '/sw.js'

/** Rutas del BFF. Cuelgan de `notifications`, que ya esta en la lista blanca. */
const RUTA_ESTADO = 'notifications/push'
const RUTA_SUSCRIPCIONES = 'notifications/push/subscriptions'
const RUTA_PRUEBA = 'notifications/push/test'

type Accion = 'activar' | 'desactivar' | 'probar'

/** Lo que se lee del navegador, ya reunido. */
interface Navegador {
  soportado: boolean
  esIOS: boolean
  instalada: boolean
  permiso: NotificationPermission
  suscripcion: PushSubscription | null
}

/** Textos y apariencia de cada estado. Sin guiones largos: la regla de copia del panel. */
const PRESENTACION: Record<EstadoDelDispositivo, { titulo: string, detalle: string, icono: ReactNode, tono: string }> = {
  'no-soportado': {
    titulo: 'No disponible en este navegador',
    detalle: 'Este navegador no admite notificaciones push. Prueba con Chrome, Edge, Firefox o Safari actualizados.',
    icono: <BellOff className="size-5" aria-hidden="true" />,
    tono: 'bg-relleno-neutro text-texto-tenue'
  },
  'requiere-instalar': {
    titulo: 'Instala Ops para recibirlas',
    detalle: 'En iPhone y iPad las notificaciones solo llegan a Ops instalado en la pantalla de inicio (iOS 16.4 o posterior).',
    icono: <SquarePlus className="size-5" aria-hidden="true" />,
    tono: 'bg-superficie-aviso text-texto-aviso'
  },
  'no-disponible': {
    titulo: 'Todavía no disponible',
    detalle: 'El servidor de Ops aún no tiene configuradas las notificaciones push.',
    icono: <BellOff className="size-5" aria-hidden="true" />,
    tono: 'bg-relleno-neutro text-texto-tenue'
  },
  bloqueado: {
    titulo: 'Bloqueadas en este navegador',
    detalle: 'Le negaste el permiso a este sitio. Para activarlas, permite las notificaciones desde el candado de la barra de direcciones y recarga la página.',
    icono: <ShieldAlert className="size-5" aria-hidden="true" />,
    tono: 'bg-superficie-peligro text-texto-peligro'
  },
  activo: {
    titulo: 'Activas en este dispositivo',
    detalle: 'Cada aviso nuevo de la campana te llega aquí, aunque Ops esté cerrado.',
    icono: <BellRing className="size-5" aria-hidden="true" />,
    tono: 'bg-acento text-acento-contenido'
  },
  inactivo: {
    titulo: 'Desactivadas en este dispositivo',
    detalle: 'Actívalas para recibir los avisos de la campana aunque Ops esté cerrado.',
    icono: <Bell className="size-5" aria-hidden="true" />,
    tono: 'bg-control text-texto-tenue'
  }
}

/**
 * Bloque "Notificaciones en este dispositivo" de Mi perfil.
 *
 * Suscribe o desuscribe ESTE navegador a Web Push y deja mandarse una prueba. Cada dispositivo se
 * activa por separado: el permiso es del navegador, no de la cuenta. Que el push efectivamente
 * salga lo decide la instalacion (`wiwo_api_push`, apagado de fabrica), y el bloque lo dice cuando
 * esta en pausa en vez de dejar creer que el telefono no anda.
 */
export function NotificacionesDelDispositivo () {
  const [servidor, establecerServidor] = useState<EstadoPushServidor | null>(null)
  const [navegador, establecerNavegador] = useState<Navegador | null>(null)
  const [accion, establecerAccion] = useState<Accion | null>(null)
  const [error, establecerError] = useState<string | null>(null)
  const [prueba, establecerPrueba] = useState<MensajeDePrueba | null>(null)
  const [recienActivado, establecerRecienActivado] = useState(false)
  const [envios, establecerEnvios] = useState(0)

  const leerTodo = useCallback(async (): Promise<void> => {
    const [estado, local] = await Promise.all([leerEstadoServidor(), leerNavegador()])

    establecerServidor(estado.datos)
    establecerNavegador(local)
    if (estado.error !== null) establecerError(estado.error)
  }, [])

  useEffect(() => {
    // Se lee al montar: el permiso y la suscripcion son del navegador y no existen en el servidor,
    // asi que no hay forma de traerlos desde la pagina.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void leerTodo()
  }, [leerTodo])

  if (servidor === null || navegador === null) return <Esqueleto />

  const estado = estadoDelDispositivo({
    soportado: navegador.soportado,
    esIOS: navegador.esIOS,
    instalada: navegador.instalada,
    permiso: navegador.permiso,
    suscripto: navegador.suscripcion !== null,
    clavePublica: servidor.public_key
  })
  const presentacion = PRESENTACION[estado]
  const encendido = estado === 'activo'
  const conmutable = estado === 'activo' || estado === 'inactivo'

  /** Pide permiso, suscribe al navegador y guarda la suscripcion en el servidor. */
  async function activar (): Promise<void> {
    if (servidor?.public_key == null) return

    const permiso = await Notification.requestPermission()

    if (permiso !== 'granted') {
      establecerNavegador((previo) => previo === null ? previo : { ...previo, permiso })
      return
    }

    const registro = await registroDelServiceWorker()
    const suscripcion = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: bytesDeClave(servidor.public_key)
    })
    const cuerpo = cuerpoDeSuscripcion(suscripcion.toJSON(), navigator.userAgent)

    if (cuerpo === null) {
      await suscripcion.unsubscribe()
      throw new Error('El navegador entregó una suscripción incompleta.')
    }

    const resultado = await escribirEnBff<EstadoPushServidor>(RUTA_SUSCRIPCIONES, 'POST', cuerpo)

    // Si el servidor no la guardo, se deshace tambien en el navegador: un dispositivo que se cree
    // activo y no esta registrado no recibiria nada nunca.
    if (!resultado.ok) {
      await suscripcion.unsubscribe()
      throw new Error(resultado.mensaje)
    }

    establecerServidor(resultado.datos)
    establecerNavegador((previo) => previo === null ? previo : { ...previo, permiso, suscripcion })
    establecerRecienActivado(true)
  }

  /** Borra la suscripcion en el servidor y en el navegador. */
  async function desactivar (): Promise<void> {
    const suscripcion = navegador?.suscripcion
    if (suscripcion == null) return

    const resultado = await escribirEnBff<EstadoPushServidor>(RUTA_SUSCRIPCIONES, 'DELETE', { endpoint: suscripcion.endpoint })

    if (!resultado.ok) throw new Error(resultado.mensaje)

    await suscripcion.unsubscribe()
    establecerServidor(resultado.datos)
    establecerNavegador((previo) => previo === null ? previo : { ...previo, suscripcion: null })
    establecerRecienActivado(false)
    establecerPrueba(null)
  }

  /** Manda un push de prueba a los dispositivos propios. */
  async function probar (): Promise<void> {
    const resultado = await escribirEnBff<ResumenPrueba>(RUTA_PRUEBA, 'POST', {})

    if (!resultado.ok) throw new Error(resultado.mensaje)

    establecerPrueba(mensajeDePrueba(resultado.datos))
    establecerEnvios((n) => n + 1)
  }

  /** Corre una accion con su estado de carga y su error legible. */
  async function correr (cual: Accion, operacion: () => Promise<void>): Promise<void> {
    establecerAccion(cual)
    establecerError(null)
    if (cual !== 'probar') establecerPrueba(null)

    try {
      await operacion()
    } catch (falla) {
      establecerError(falla instanceof Error ? falla.message : 'No se pudo completar la acción.')
    } finally {
      establecerAccion(null)
    }
  }

  return (
    <Seccion titulo="Notificaciones en este dispositivo">
      <div className="flex items-start gap-3">
        <span
          key={estado}
          className={cn(
            'animate-entrar-escala flex size-10 shrink-0 items-center justify-center rounded-full transition-colors',
            presentacion.tono
          )}
        >
          <span className={cn(encendido && recienActivado && estilos.campanaSuena)}>{presentacion.icono}</span>
        </span>

        <div key={`texto-${estado}`} className="animate-entrar-abajo flex min-w-0 flex-1 flex-col gap-0.5" aria-live="polite">
          <p className="text-texto text-sm font-medium">{presentacion.titulo}</p>
          <p className="text-texto-tenue max-w-prose text-xs leading-relaxed">{presentacion.detalle}</p>
          {encendido && !servidor.enabled && prueba === null && (
            <p className="text-texto-aviso mt-1 text-xs">
              El envío está en pausa para toda la instalación por ahora. Tu dispositivo ya quedó registrado.
            </p>
          )}
        </div>

        <InterruptorPush
          encendido={encendido}
          ocupado={accion === 'activar' || accion === 'desactivar'}
          deshabilitado={!conmutable || accion !== null}
          onPulsar={() => { void correr(encendido ? 'desactivar' : 'activar', encendido ? desactivar : activar) }}
        />
      </div>

      {estado === 'requiere-instalar' && <PasosIOS />}

      {encendido && (
        <div className="animate-entrar-abajo flex flex-wrap items-center gap-3 pl-13">
          <Boton
            variante="secundario"
            tamano="chico"
            disabled={accion !== null}
            onClick={() => { void correr('probar', probar) }}
          >
            <IconoPrueba envios={envios} enviando={accion === 'probar'} entregada={prueba?.tono === 'exito'} />
            Enviar prueba
          </Boton>
          {prueba !== null && (
            <p
              key={envios}
              role="status"
              className={cn(
                'animate-entrar-abajo max-w-prose text-xs',
                prueba.tono === 'exito' && 'text-texto-exito',
                prueba.tono === 'aviso' && 'text-texto-aviso',
                prueba.tono === 'peligro' && 'text-texto-peligro'
              )}
            >
              {prueba.texto}
            </p>
          )}
        </div>
      )}

      {error !== null && (
        <p role="alert" className="animate-entrar-abajo text-texto-peligro flex items-center gap-1.5 text-xs">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </Seccion>
  )
}

/**
 * El interruptor del dispositivo.
 *
 * Es propio y no `formularios/Interruptor` porque hace una cosa mas: se estira al apretarlo y late
 * mientras la API y el navegador contestan, que en una suscripcion push pueden ser un par de
 * segundos con un dialogo de permiso en el medio.
 */
function InterruptorPush ({
  encendido, ocupado, deshabilitado, onPulsar
}: {
  encendido: boolean
  ocupado: boolean
  deshabilitado: boolean
  onPulsar: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={encendido}
      aria-busy={ocupado}
      aria-label="Notificaciones en este dispositivo"
      disabled={deshabilitado}
      onClick={onPulsar}
      className={cn(
        estilos.pista,
        'rounded-control relative mt-1 inline-flex h-6 w-11 shrink-0 items-center border',
        'focus-visible:outline-foco focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed',
        encendido ? 'bg-acento border-acento' : 'bg-control border-control-borde',
        deshabilitado && !ocupado && 'opacity-50'
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          estilos.pomo,
          ocupado && estilos.pomoOcupado,
          'rounded-control block h-4 w-4',
          encendido ? 'bg-acento-contenido' : 'bg-texto-tenue'
        )}
      />
    </button>
  )
}

/**
 * El icono de "Enviar prueba": el avion despega al mandar y, si la prueba salio, en su lugar aparece
 * la marca. Con el envio en pausa vuelve el avion: una marca verde diria que llego algo que no llego.
 *
 * `envios` cambia la `key` de la marca, asi la animacion se repite en cada prueba y no solo la
 * primera vez.
 */
function IconoPrueba ({ envios, enviando, entregada }: { envios: number, enviando: boolean, entregada: boolean }) {
  if (envios === 0 || enviando || !entregada) {
    return <Send className={cn('size-3.5', enviando && estilos.avionDespega)} aria-hidden="true" />
  }

  return <Check key={envios} className={cn('text-texto-exito size-3.5', estilos.marcaAparece)} aria-hidden="true" />
}

/** Los tres pasos para instalar Ops en iPhone o iPad. */
function PasosIOS () {
  return (
    <ol className="animate-entrar-abajo bg-superficie-hundida rounded-medio flex flex-col gap-2 p-3 text-xs">
      <li className="flex items-center gap-2">
        <Share className="text-texto-tenue size-4 shrink-0" aria-hidden="true" />
        <span>En Safari, toca <strong className="font-medium">Compartir</strong>.</span>
      </li>
      <li className="flex items-center gap-2">
        <SquarePlus className="text-texto-tenue size-4 shrink-0" aria-hidden="true" />
        <span>Elige <strong className="font-medium">Agregar a pantalla de inicio</strong>.</span>
      </li>
      <li className="flex items-center gap-2">
        <Bell className="text-texto-tenue size-4 shrink-0" aria-hidden="true" />
        <span>Abre Ops desde el ícono nuevo y vuelve a Mi perfil para activarlas.</span>
      </li>
    </ol>
  )
}

/** Silueta del bloque mientras se lee el estado: la misma forma que el bloque terminado. */
function Esqueleto () {
  return (
    <Seccion titulo="Notificaciones en este dispositivo">
      <div className="flex items-start gap-3" aria-busy="true" aria-label="Cargando el estado de las notificaciones">
        <span className="bg-relleno-neutro size-10 shrink-0 rounded-full motion-safe:animate-pulse" />
        <div className="flex flex-1 flex-col gap-1.5 pt-1">
          <span className="bg-relleno-neutro h-3.5 w-48 rounded-full motion-safe:animate-pulse" />
          <span className="bg-relleno-neutro h-3 w-72 max-w-full rounded-full motion-safe:animate-pulse" />
        </div>
        <span className="bg-relleno-neutro rounded-control mt-1 h-6 w-11 shrink-0 motion-safe:animate-pulse" />
      </div>
    </Seccion>
  )
}

/**
 * `GET /notifications/push`. Nunca lanza: un fallo deja el estado "no disponible" y el mensaje.
 */
async function leerEstadoServidor (): Promise<{ datos: EstadoPushServidor, error: string | null }> {
  const vacio: EstadoPushServidor = { configured: false, enabled: false, public_key: null, subscriptions: 0 }

  try {
    const respuesta = await fetch(`/api/bff/${RUTA_ESTADO}`, { cache: 'no-store' })

    if (!respuesta.ok) return { datos: vacio, error: await mensajeDeRespuesta(respuesta) }

    const sobre = await respuesta.json() as { data: EstadoPushServidor }

    return { datos: sobre.data, error: null }
  } catch {
    return { datos: vacio, error: 'No se pudo consultar el estado de las notificaciones.' }
  }
}

/** Lo que el navegador sabe de este dispositivo. Nunca lanza. */
async function leerNavegador (): Promise<Navegador> {
  const soportado = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  const instalada = window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  const base = {
    soportado,
    esIOS: esDispositivoIOS(navigator.userAgent, navigator.maxTouchPoints),
    instalada,
    permiso: soportado ? Notification.permission : 'default' as NotificationPermission
  }

  if (!soportado) return { ...base, suscripcion: null }

  try {
    const registro = await navigator.serviceWorker.getRegistration()
    const suscripcion = registro === undefined ? null : await registro.pushManager.getSubscription()

    return { ...base, suscripcion }
  } catch {
    return { ...base, suscripcion: null }
  }
}

/**
 * El registro del service worker de la app, pidiendolo si hace falta.
 *
 * @throws Error legible si el navegador no lo pudo registrar
 */
async function registroDelServiceWorker (): Promise<ServiceWorkerRegistration> {
  const existente = await navigator.serviceWorker.getRegistration()
  if (existente !== undefined) return existente

  try {
    await navigator.serviceWorker.register(RUTA_SERVICE_WORKER)
  } catch {
    throw new Error('No se pudo instalar el componente de notificaciones de Ops en este navegador.')
  }

  return await navigator.serviceWorker.ready
}
