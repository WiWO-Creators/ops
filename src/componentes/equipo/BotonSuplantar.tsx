'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import {
  CerrarDialogo,
  ContenidoDialogo,
  Dialogo,
  DisparadorDialogo
} from '@/componentes/superposiciones/Dialogo'

interface PropsBotonSuplantar {
  personaId: number
  nombre: string
  /** Una cuenta dada de baja no puede entrar por ningún lado, tampoco por acá: la API responde 422. */
  activa: boolean
}

/**
 * Abre el panel con la sesión de otra persona, para ver exactamente lo que ve.
 *
 * Sólo la monta la ficha cuando quien mira es superadministrador: la API rechaza al resto con 403, y
 * ofrecer un botón que va a fallar es peor que no ofrecerlo.
 *
 * Pide confirmación porque no es un cambio de vista sino un cambio de sesión: lo que se haga a partir
 * de ahí queda a nombre de esa persona en todo el sistema. Eso se dice antes, no después.
 */
export function BotonSuplantar ({ personaId, nombre, activa }: PropsBotonSuplantar) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [entrando, setEntrando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function suplantar (): Promise<void> {
    setEntrando(true)
    setError(null)

    try {
      const respuesta = await fetch('/api/sesion/suplantar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ staffId: personaId })
      })

      if (!respuesta.ok) {
        const cuerpo = await respuesta.json().catch(() => ({})) as { mensaje?: string }

        setError(cuerpo.mensaje ?? 'No se pudo entrar como esa persona.')
        setEntrando(false)

        return
      }

      setAbierto(false)
      // Al Inicio y no a la ficha: la ficha de una persona del equipo exige `staff.view`, que es
      // justo lo que la cuenta prestada puede no tener. Volver a la pantalla que se estaba mirando
      // dejaría a quien suplanta frente a un 403 en vez de frente al panel de esa persona.
      router.replace('/inicio')
      router.refresh()
    } catch {
      setError('No se pudo entrar como esa persona.')
      setEntrando(false)
    }
  }

  return (
    <Dialogo open={abierto} onOpenChange={setAbierto}>
      <DisparadorDialogo asChild>
        <Boton variante="sutil" tamano="chico" disabled={!activa}>Ver como</Boton>
      </DisparadorDialogo>

      <ContenidoDialogo
        ancho="chico"
        titulo={`Ver el panel como ${nombre}`}
        descripcion="Vas a usar su sesión: verás sus permisos, sus datos y su navegación, tal como los ve."
      >
        <div className="flex flex-col gap-4">
          <p className="text-texto-tenue text-sm">
            Lo que hagas mientras tanto queda registrado a nombre de {nombre}. Para volver a tu cuenta,
            usá la franja que aparece arriba del panel.
          </p>

          {error !== null && (
            <p role="alert" className="text-texto-peligro text-sm">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <CerrarDialogo asChild>
              <Boton variante="sutil" tamano="chico" type="button">Cancelar</Boton>
            </CerrarDialogo>
            <Boton
              variante="primario"
              tamano="chico"
              cargando={entrando}
              onClick={() => { void suplantar() }}
            >
              Entrar como {nombre}
            </Boton>
          </div>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}
