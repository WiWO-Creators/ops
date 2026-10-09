'use client'

import { useState, type ReactElement } from 'react'
import { Cargando, ErrorEstado, AvisoEnLinea } from '@/componentes/estado/Estados'
import { useAviso } from '@/componentes/estado/useAviso'
import { Boton } from '@/componentes/formularios/Boton'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Dialogo, ContenidoDialogo } from '@/componentes/superposiciones/Dialogo'
import type { Acta } from '@/datos/recursos'
import { formatearFecha } from '@/lib/fechas'
import { useRecurso } from '../carga'

/** Una versión anterior del acta, sin su contenido (la API lo manda aparte). */
interface Version {
  id: number
  origin: string
  staff_id: number
  preview: string
  date_added: string | null
}

/** Cómo se llama cada origen en el historial. */
const ORIGENES: Record<string, string> = {
  manual: 'Corrección a mano',
  ia: 'Reescritura con IA',
  orb: 'Cambio desde el chat',
  restauracion: 'Restauración'
}

/**
 * Las versiones anteriores del Meeting Paper y la forma de volver a una.
 *
 * Restaurar no borra nada: la versión vigente pasa al historial, así que también se puede deshacer.
 * Manda `revision` (el `date_updated` a la vista) para que, si el acta cambió mientras se miraba esta
 * lista, la API conteste 409 y no pise el cambio.
 *
 * @param ruta ruta del acta (`projects/{id}/actas/{actaId}`)
 * @param revision el `date_updated` del acta que se está viendo
 * @param onRestaurada recibe el acta ya restaurada
 * @param onCerrar cierra el diálogo
 */
export function HistorialDelActa ({
  ruta,
  revision,
  onRestaurada,
  onCerrar
}: {
  ruta: string
  revision: string | null
  onRestaurada: (acta: Acta) => void
  onCerrar: () => void
}): ReactElement {
  const { estado, recargar } = useRecurso<Version[]>(`${ruta}/revisiones`, 'No se pudo cargar el historial.')
  const [restaurando, setRestaurando] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const aviso = useAviso()

  /** Vuelve el acta a la versión elegida. */
  async function restaurar (version: Version): Promise<void> {
    setRestaurando(version.id)
    setError(null)

    const resultado = await escribirEnBff<Acta>(
      `${ruta}/revisiones/${version.id}/restaurar`,
      'POST',
      revision === null ? {} : { revision }
    )

    setRestaurando(null)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    onRestaurada(resultado.datos)
    aviso.exito('Meeting Paper restaurado. La versión anterior quedó en el historial.')
    onCerrar()
  }

  return (
    <Dialogo open onOpenChange={(abierto) => { if (!abierto) onCerrar() }}>
      <ContenidoDialogo
        titulo="Historial de versiones"
        descripcion="Cada vez que cambia el contenido se guarda la versión anterior. Restaurar no borra nada."
        ancho="medio"
      >
        <div className="flex flex-col gap-3">
          {error !== null && <AvisoEnLinea variante="error" mensaje={error} className="text-sm" />}

          {estado.fase === 'cargando' && <Cargando alto="min-h-24" mensaje="Cargando el historial…" />}
          {estado.fase === 'error' && <ErrorEstado detalle={estado.mensaje} onReintentar={recargar} />}

          {estado.fase === 'listo' && estado.datos.length === 0 && (
            <p className="text-texto-tenue text-sm">Todavía no hay versiones anteriores: el contenido no se ha cambiado.</p>
          )}

          {estado.fase === 'listo' && estado.datos.length > 0 && (
            <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
              {estado.datos.map((version) => (
                <li key={version.id} className="border-linea rounded-chico flex items-start justify-between gap-3 border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {ORIGENES[version.origin] ?? 'Cambio'} · {formatearFecha(version.date_added, true)}
                    </p>
                    <p className="text-texto-tenue line-clamp-2 text-xs">{version.preview}</p>
                  </div>
                  <Boton
                    variante="secundario"
                    tamano="chico"
                    cargando={restaurando === version.id}
                    disabled={restaurando !== null}
                    onClick={() => { void restaurar(version) }}
                  >
                    Restaurar
                  </Boton>
                </li>
              ))}
            </ul>
          )}
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}
