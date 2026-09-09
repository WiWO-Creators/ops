'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import type { DriveCliente } from '@/datos/recursos'

/** Largo exacto que exige el backend. */
const LARGO = 4

/**
 * Pide el codigo de 4 letras cuando el sistema no puede derivarlo del nombre.
 *
 * La regla es "primera letra, se salta la segunda, y tercera, cuarta y quinta". Un nombre de menos
 * de cinco letras no da para eso, y ante la duda el sistema NO inventa nada: deja al cliente sin
 * codigo. El problema es que hasta ahora no lo decia, y el cliente se quedaba mudo hasta que alguien
 * abria su Drive y encontraba la carpeta sin nombrar.
 *
 * Por eso esto vive en la ficha y no escondido en la pestaña Archivos: es una tarea pendiente del
 * cliente, y se muestra donde se lo mira.
 *
 * Solo se dibuja con `letras_pendientes`. Un cliente al que le falta el codigo pero cuyo nombre SI
 * da para derivarlo no muestra nada: ese se resuelve solo la proxima vez que haga falta, y pedirlo
 * seria trabajo inventado.
 */
export function CodigoPendiente ({ clienteId, nombre }: { clienteId: number, nombre: string }) {
  const router = useRouter()
  const [letras, setLetras] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  async function guardar (): Promise<void> {
    setGuardando(true)
    setError(undefined)

    const resultado = await escribirEnBff<DriveCliente>(`clients/${clienteId}/drive`, 'PATCH', { letras })

    setGuardando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }

    router.refresh()
  }

  return (
    <section className="border-linea-fuerte bg-superficie-aviso rounded-tarjeta flex flex-col gap-3 border-l-4 p-4">
      <div>
        <h3 className="text-texto-aviso text-sm font-semibold">Falta el código de este cliente</h3>
        <p className="text-texto-tenue mt-1 text-sm">
          «{nombre}» no tiene suficientes letras para deducirlo, así que hay que escribirlo a mano.
          De él cuelgan las patentes de sus proyectos y tareas, y el nombre de sus carpetas en Drive.
        </p>
      </div>

      <div className="flex items-end gap-2">
        <Campo etiqueta="Código de 4 letras" error={error} className="max-w-32">
          {(props) => (
            <Entrada
              {...props}
              value={letras}
              maxLength={LARGO}
              placeholder="ABCD"
              onChange={(evento) => {
                setLetras(evento.target.value.toUpperCase().replace(/[^A-Z]/g, ''))
                setError(undefined)
              }}
            />
          )}
        </Campo>

        <Boton
          variante="secundario"
          onClick={() => { void guardar() }}
          disabled={letras.length !== LARGO || guardando}
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </Boton>
      </div>
    </section>
  )
}
