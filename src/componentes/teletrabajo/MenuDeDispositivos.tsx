'use client'

import { useMediaDeviceSelect } from '@livekit/components-react'
import { Check, ChevronUp } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { ContenidoMenu, DisparadorMenu, ItemMenu, MenuContextual } from '@/componentes/superposiciones/MenuContextual'
import { cn } from '@/lib/clases'

interface PropsMenuDeDispositivos {
  /** Tipo de dispositivo a listar: microfono, camara o salida de audio. */
  clase: MediaDeviceKind
  /** Texto accesible del disparador, p.ej. 'Elegir micrófono'. */
  etiqueta: string
  /** Se llama si cambiar de dispositivo falla. Sin ella, el fallo se ignora en silencio. */
  alFallar?: (error: unknown) => void
  /** Clases extra del boton disparador, para pegarlo al control principal en un `button-group`. */
  className?: string
}

/**
 * Menu para elegir microfono, camara o salida de audio entre los dispositivos disponibles.
 *
 * El disparador es solo el chevron: va pegado al boton principal de la pista (encender/apagar) para
 * formar un unico control visual, como un `button-group`.
 */
export function MenuDeDispositivos ({ clase, etiqueta, alFallar, className }: PropsMenuDeDispositivos) {
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind: clase })

  return (
    <MenuContextual>
      <DisparadorMenu asChild>
        <Boton
          variante="secundario"
          soloIcono
          tamano="chico"
          disabled={devices.length === 0}
          aria-label={etiqueta}
          title={etiqueta}
          className={cn(className)}
        >
          <ChevronUp size={14} aria-hidden="true" />
        </Boton>
      </DisparadorMenu>

      <ContenidoMenu align="end">
        {devices.map((dispositivo) => (
          <ItemMenu
            key={dispositivo.deviceId}
            onSelect={() => {
              // `setActiveMediaDevice` devuelve promesa: si se rechaza y queda suelta, es un
              // rechazo sin capturar. No hay donde mostrar el motivo dentro del menu, por eso se
              // delega a `alFallar`; si no vino, el catch igual tiene que existir para no dejar la
              // promesa colgando.
              setActiveMediaDevice(dispositivo.deviceId).catch((error: unknown) => { alFallar?.(error) })
            }}
          >
            {/* El navegador no entrega `label` hasta que hay permiso concedido. */}
            <span className="flex-1 truncate">{dispositivo.label || 'Dispositivo sin nombre'}</span>
            {dispositivo.deviceId === activeDeviceId && <Check size={14} aria-hidden="true" />}
          </ItemMenu>
        ))}
      </ContenidoMenu>
    </MenuContextual>
  )
}
