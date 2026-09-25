'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, X } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { cn } from '@/lib/clases'
import {
  CLAVE_APP_INSTALADA,
  CLAVE_RECORDATORIO_INSTALAR,
  diaLocal,
  tocaRecordarInstalar,
  viaDeInstalacion,
  type ViaDeInstalacion
} from '@/lib/pwa'

/** Cuánto espera antes de aparecer, y entre intentos mientras haya un diálogo abierto. */
const ESPERA_MS = 4000
/** Lo que tarda el aviso en irse. Es `--wiwo-motion-fast`, el de `animate-aviso-salir`. */
const SALIDA_MS = 160

/** El evento de Chromium que permite abrir el diálogo de instalación. No está en los tipos del DOM. */
interface EventoDeInstalacion extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Qué decir en cada navegador que no tiene diálogo propio. */
const PASOS_MANUALES: Record<Exclude<ViaDeInstalacion, 'nativo' | 'no-instalable'>, string> = {
  ios: 'Toca Compartir y luego "Agregar a inicio".',
  'safari-mac': 'En el menú Archivo, elige "Agregar al Dock".',
  'firefox-android': 'Abre el menú ⋮ y elige "Instalar".'
}

/**
 * Recordatorio diario de instalar Ops como aplicación, en el computador y en el teléfono.
 *
 * No aparece si Ops ya corre instalado (ventana propia) ni si consta que se instaló desde este
 * navegador. En Chrome, Edge y Brave solo aparece si el navegador ofrece la instalación: si no la
 * ofrece es porque ya está instalada, y ahí no hay nada que recordar. En iPhone, iPad, Safari de Mac
 * y Firefox de Android no hay diálogo que abrir, así que el aviso explica los pasos.
 *
 * Sale una vez por día local: se anota el día al mostrarlo, no al cerrarlo, para que recargar no lo
 * repita. Todo el estado vive en `localStorage`; si el navegador lo bloquea, no se recuerda nada
 * antes que recordar en cada navegación.
 */
export function RecordatorioInstalar (): React.ReactNode {
  const [via, setVia] = useState<ViaDeInstalacion | null>(null)
  const [cerrando, setCerrando] = useState(false)
  const eventoRef = useRef<EventoDeInstalacion | null>(null)

  useEffect(() => {
    if (corriendoInstalada()) {
      anotar(CLAVE_APP_INSTALADA, '1')
      return
    }
    if (leer(CLAVE_APP_INSTALADA) === '1') return

    const hoy = diaLocal(new Date())
    const ultimo = leer(CLAVE_RECORDATORIO_INSTALAR)
    if (ultimo === undefined || !tocaRecordarInstalar(ultimo, hoy)) return

    const detectada = viaDeInstalacion(navigator.userAgent, navigator.maxTouchPoints, 'BeforeInstallPromptEvent' in window)
    if (detectada === 'no-instalable') return

    let temporizador: number | undefined
    let programado = false
    // Con un diálogo abierto (el de abrir la jornada, sobre todo) el aviso quedaría bajo su velo y
    // gastaría el recordatorio del día sin que nadie pudiera tocarlo: se espera a que se cierre.
    const intentar = (vista: ViaDeInstalacion) => {
      temporizador = window.setTimeout(() => {
        if (document.querySelector('[role="dialog"], [role="alertdialog"]') !== null) {
          intentar(vista)
          return
        }
        if (!anotar(CLAVE_RECORDATORIO_INSTALAR, hoy)) return
        setVia(vista)
      }, ESPERA_MS)
    }
    const mostrar = (vista: ViaDeInstalacion) => {
      if (programado) return
      programado = true
      intentar(vista)
    }

    const alOfrecer = (evento: Event) => {
      evento.preventDefault()
      eventoRef.current = evento as EventoDeInstalacion
      mostrar('nativo')
    }
    const alInstalar = () => {
      anotar(CLAVE_APP_INSTALADA, '1')
      setVia(null)
    }

    window.addEventListener('beforeinstallprompt', alOfrecer)
    window.addEventListener('appinstalled', alInstalar)
    if (detectada !== 'nativo') mostrar(detectada)

    return () => {
      window.removeEventListener('beforeinstallprompt', alOfrecer)
      window.removeEventListener('appinstalled', alInstalar)
      window.clearTimeout(temporizador)
    }
  }, [])

  const cerrar = () => {
    setCerrando(true)
    window.setTimeout(() => {
      setVia(null)
      setCerrando(false)
    }, SALIDA_MS)
  }

  const instalar = async () => {
    const evento = eventoRef.current
    if (evento === null) return
    eventoRef.current = null
    try {
      await evento.prompt()
      const { outcome } = await evento.userChoice
      if (outcome === 'accepted') anotar(CLAVE_APP_INSTALADA, '1')
    } catch (error: unknown) {
      // El navegador puede negarse a abrir el diálogo dos veces con el mismo evento. No hay nada que
      // la persona pueda hacer distinto; mañana el aviso vuelve con un evento nuevo.
      console.warn('[pwa] No se pudo abrir el diálogo de instalación.', error)
    }
    cerrar()
  }

  if (via === null || via === 'no-instalable') return null

  return (
    <div
      role="status"
      className={cn(
        // En móvil va arriba, bajo la cabecera: abajo ya están la barra de pestañas, el orbe y los
        // avisos de versión y de jornada. En el computador, abajo a la izquierda, fuera del centro
        // donde salen esos avisos.
        'fixed top-[calc(4rem_+_env(safe-area-inset-top,0px))] left-1/2 z-40 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2',
        'sm:top-auto sm:bottom-5 sm:left-5 sm:translate-x-0',
        cerrando ? 'animate-aviso-salir' : 'animate-aviso-entrar'
      )}
    >
      <div className="border-linea bg-superficie-flotante shadow-flotante flex items-center gap-3 rounded-2xl border p-2.5">
        <span aria-hidden="true" className="bg-acento-suave text-acento grid size-10 shrink-0 place-items-center rounded-xl">
          <Download className="size-[1.125rem]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-texto text-sm leading-tight font-semibold">Instala Ops en este dispositivo</p>
          <p className="text-texto-tenue mt-0.5 text-xs leading-snug">
            {via === 'nativo' ? 'Ábrelo como una aplicación, con su propio ícono y ventana.' : PASOS_MANUALES[via]}
          </p>
        </div>
        {via === 'nativo' && (
          <Boton
            variante="primario"
            tamano="chico"
            className="pointer-coarse:min-h-11 shrink-0 active:scale-[0.97]"
            onClick={() => { void instalar() }}
          >
            Instalar
          </Boton>
        )}
        <Boton
          variante="sutil"
          tamano="chico"
          soloIcono
          className="pointer-coarse:min-h-11 pointer-coarse:min-w-11 shrink-0"
          aria-label="Recordármelo mañana"
          onClick={cerrar}
        >
          <X className="size-4" aria-hidden="true" />
        </Boton>
      </div>
    </div>
  )
}

/** Si Ops corre como aplicación instalada: ventana propia en el computador o pantalla de inicio en iOS. */
function corriendoInstalada (): boolean {
  const modos = ['standalone', 'window-controls-overlay', 'minimal-ui', 'fullscreen']
  if (modos.some((modo) => window.matchMedia(`(display-mode: ${modo})`).matches)) return true
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/**
 * Lee una clave de `localStorage`.
 *
 * @param clave clave a leer
 * @returns el valor, `null` si no existe, o `undefined` si el almacenamiento está bloqueado
 */
function leer (clave: string): string | null | undefined {
  try {
    return window.localStorage.getItem(clave)
  } catch {
    return undefined
  }
}

/**
 * Escribe una clave de `localStorage`.
 *
 * @param clave clave a escribir
 * @param valor valor a guardar
 * @returns `false` si el almacenamiento está bloqueado o lleno
 */
function anotar (clave: string, valor: string): boolean {
  try {
    window.localStorage.setItem(clave, valor)
    return true
  } catch {
    return false
  }
}
