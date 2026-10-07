'use client'

import { useEffect, useState, type ReactElement } from 'react'
import { leerDelBff } from '@/componentes/datos/mutaciones'
import { AvisoEnLinea, Cargando, Vacio } from '@/componentes/estado/Estados'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { leerLlamadas } from '@/dominio/mcp-externo'
import type { LlamadaMcp } from '@/datos/accesos'

/**
 * Las últimas 50 llamadas de un sistema: qué herramienta, a nombre de quién y cómo terminó.
 *
 * Es lo que responde «¿qué hizo Metriq ayer?». De los argumentos la API solo guarda una huella, así
 * que acá no hay contenido que mostrar.
 */
export function LlamadasMcp ({ integracionId }: { integracionId: number }): ReactElement {
  const [llamadas, setLlamadas] = useState<LlamadaMcp[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true

    void leerDelBff<unknown>(`accesos/integraciones/${integracionId}/mcp/llamadas`).then((resultado) => {
      if (!vigente) return

      if (resultado.ok) setLlamadas(leerLlamadas(resultado.datos))
      else setError(resultado.mensaje)
    })

    return () => { vigente = false }
  }, [integracionId])

  if (error !== null) return <AvisoEnLinea variante="error" mensaje={error} />
  if (llamadas === null) return <Cargando />
  if (llamadas.length === 0) return <Vacio titulo="Sin llamadas" descripcion="Cuando el sistema use Ops, sus llamadas aparecerán aquí." />

  return (
    <div className="border-linea overflow-x-auto border-t pt-4">
      <table className="w-full text-left text-sm">
        <thead className="text-texto-tenue">
          <tr>
            <th className="py-1 pr-3 font-medium">Cuándo</th>
            <th className="py-1 pr-3 font-medium">Persona</th>
            <th className="py-1 pr-3 font-medium">Herramienta</th>
            <th className="py-1 pr-3 font-medium">Resultado</th>
            <th className="py-1 text-right font-medium">Duración</th>
          </tr>
        </thead>
        <tbody>
          {llamadas.map((llamada) => (
            <tr key={llamada.id} className="border-linea border-t">
              <td className="py-1 pr-3"><Fecha valor={llamada.created_at} conHora /></td>
              <td className="py-1 pr-3 tabular-nums">{llamada.staff_id === null ? '—' : `#${llamada.staff_id}`}</td>
              <td className="py-1 pr-3"><code className="font-mono">{llamada.tool ?? llamada.method}</code></td>
              <td className="py-1 pr-3">{llamada.code}</td>
              <td className="py-1 text-right tabular-nums">{llamada.ms} ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
