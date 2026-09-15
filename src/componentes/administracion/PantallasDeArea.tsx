'use client'

import { Check, Copy, MonitorPlay, Trash2 } from 'lucide-react'
import { useCallback, useState, type ReactElement } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Boton } from '@/componentes/formularios/Boton'
import { Entrada } from '@/componentes/formularios/Entrada'
import { Vacio } from '@/componentes/estado/Estados'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { urlDePantallaDeArea } from '@/lib/enlace-publico'
import type { PantallaDeAreaEnPanel } from '@/datos/recursos'

interface Props {
  inicial: PantallaDeAreaEnPanel[]
}

/** La URL recien acuñada de un area. Vive solo mientras el dialogo de esa fila esta abierto. */
type UrlPorArea = Record<number, string | undefined>

/**
 * El inventario de pantallas: un area por fila, con su enlace.
 *
 * === LO QUE SE COPIA DE `CompartirTarea` Y POR QUE ===
 *
 * **La URL en claro no se conserva.** El token existe una sola vez, en la respuesta del `POST`: de la
 * base solo sale su `sha256`. Un enlace generado ayer se puede revocar, pero no volver a leer.
 * Guardarlo en memoria "por si acaso" solo alargaria la vida de un secreto sin ninguna ganancia.
 *
 * **El fallo de portapapeles se dice.** Donde no hay portapapeles —contexto inseguro, permiso
 * denegado— el campo queda de solo lectura y seleccionable igual, y el boton no finge que copio.
 *
 * === LO QUE NO SE COPIA ===
 *
 * La URL se muestra SIEMPRE en un campo grande y legible, no escondida detras de un boton de copiar.
 * Quien la va a poner esta parado frente a un televisor, escribiendola con un control remoto.
 */
export function PantallasDeArea ({ inicial }: Props): ReactElement {
  const [filas, setFilas] = useState(inicial)
  const [urls, setUrls] = useState<UrlPorArea>({})
  const [trabajando, setTrabajando] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiada, setCopiada] = useState<number | null>(null)

  const generar = useCallback(async (areaId: number): Promise<void> => {
    setTrabajando(areaId)
    setError(null)
    setCopiada(null)

    const resultado = await escribirEnBff<{ token: string, created_at: string | null }>(
      `accesos/areas/${areaId}/pantalla`,
      'POST'
    )

    setTrabajando(null)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    const url = urlDePantallaDeArea(window.location.origin, resultado.datos.token)

    setUrls((previas) => ({ ...previas, [areaId]: url ?? undefined }))
    setFilas((previas) => previas.map((fila) => fila.area_id === areaId
      ? { ...fila, shared: true, created_at: resultado.datos.created_at, last_seen_at: null }
      : fila))
  }, [])

  const revocar = useCallback(async (areaId: number): Promise<void> => {
    setTrabajando(areaId)
    setError(null)
    setCopiada(null)

    const resultado = await escribirEnBff(`accesos/areas/${areaId}/pantalla`, 'DELETE')

    setTrabajando(null)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    setUrls((previas) => ({ ...previas, [areaId]: undefined }))
    setFilas((previas) => previas.map((fila) => fila.area_id === areaId
      ? { ...fila, shared: false, created_at: null, last_seen_at: null }
      : fila))
  }, [])

  const copiar = useCallback(async (areaId: number, url: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiada(areaId)
    } catch {
      setError('No pudimos copiar. Selecciona la dirección y cópiala a mano.')
    }
  }, [])

  if (filas.length === 0) {
    return (
      <Vacio
        titulo="No hay áreas"
        descripcion="Las áreas se crean en Accesos. Cada una puede tener su propia pantalla."
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {error !== null && (
        <p className="border-linea bg-superficie-peligro text-texto-peligro rounded-lg border px-3 py-2 text-sm">
          {error}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {filas.map((fila) => (
          <li
            key={fila.area_id}
            className="border-linea bg-superficie-elevada flex flex-col gap-3 rounded-lg border p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <MonitorPlay className="text-texto-tenue size-5 shrink-0" aria-hidden />
                <div className="flex min-w-0 flex-col">
                  <p className="text-texto truncate font-medium">{fila.area_name}</p>
                  <Estado fila={fila} />
                </div>
              </div>

              <div className="flex shrink-0 gap-2">
                <Boton
                  variante="secundario"
                  tamano="chico"
                  cargando={trabajando === fila.area_id}
                  onClick={() => { void generar(fila.area_id) }}
                >
                  {fila.shared ? 'Regenerar' : 'Generar enlace'}
                </Boton>

                {fila.shared && (
                  <Boton
                    variante="sutil"
                    tamano="chico"
                    soloIcono
                    aria-label={`Revocar la pantalla de ${fila.area_name}`}
                    cargando={trabajando === fila.area_id}
                    onClick={() => { void revocar(fila.area_id) }}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Boton>
                )}
              </div>
            </div>

            {urls[fila.area_id] !== undefined && (
              <div className="flex flex-col gap-2">
                <p className="text-texto-tenue text-xs">
                  Esta dirección se muestra una sola vez. Pégala en el televisor antes de cerrar.
                </p>
                <div className="flex gap-2">
                  <Entrada value={urls[fila.area_id]} readOnly className="font-mono text-sm" />
                  <Boton
                    variante="secundario"
                    tamano="chico"
                    onClick={() => { void copiar(fila.area_id, urls[fila.area_id] ?? '') }}
                  >
                    {copiada === fila.area_id
                      ? <Check className="size-4" aria-hidden />
                      : <Copy className="size-4" aria-hidden />}
                    {copiada === fila.area_id ? 'Copiada' : 'Copiar'}
                  </Boton>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * La linea de estado de una fila.
 *
 * `last_seen_at` es lo mas util de toda la pantalla y por eso va acá y no escondido: si dice "hace
 * tres días", el televisor esta apagado, desenchufado o sin red, y no hay ninguna otra forma de
 * saberlo desde Ops.
 */
function Estado ({ fila }: { fila: PantallaDeAreaEnPanel }): ReactElement {
  if (!fila.shared) {
    return <p className="text-texto-sutil text-sm">Sin pantalla</p>
  }

  return (
    <p className="text-texto-tenue flex flex-wrap gap-x-2 text-sm">
      <span>
        Enlace activo desde <Fecha valor={fila.created_at} conHora />
      </span>
      <span aria-hidden>·</span>
      <span>
        {fila.last_seen_at === null
          ? 'todavía no se abrió'
          : <>vista por última vez <Fecha valor={fila.last_seen_at} conHora /></>}
      </span>
    </p>
  )
}
