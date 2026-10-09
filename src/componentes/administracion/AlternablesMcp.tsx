'use client'

import { useState, type ReactElement } from 'react'
import { useAviso } from '@/componentes/estado/useAviso'
import { Interruptor } from '@/componentes/formularios/Interruptor'
import { alternarEnLista } from '@/dominio/mcp-externo'
import type { SistemaMcp } from '@/datos/accesos'
import { guardarSistemaMcp } from './guardarSistemaMcp'

/** Qué campo del `PUT` guarda cada lista de interruptores. */
export type CampoAlternable = 'dominios' | 'eventos' | 'decision_herramientas'

/**
 * Una lista de interruptores que guarda cada cambio al pulsarlo.
 *
 * @param titulo la leyenda del grupo
 * @param catalogo lo que se puede encender, en el orden canónico
 * @param encendidos las claves que están encendidas
 * @param campo el campo del `PUT` que guarda la lista
 * @param integracionId id de la integración
 * @param onGuardado recibe el sistema tal como quedó
 */
export function AlternablesMcp ({ titulo, catalogo, encendidos, campo, integracionId, onGuardado }: {
  titulo: string
  catalogo: ReadonlyArray<{ clave: string, nombre: string, descripcion: string }>
  encendidos: string[]
  campo: CampoAlternable
  integracionId: number
  onGuardado: (sistema: SistemaMcp) => void
}): ReactElement {
  const aviso = useAviso()
  const [trabajando, setTrabajando] = useState<string | null>(null)

  async function alternar (clave: string): Promise<void> {
    setTrabajando(clave)

    const resultado = await guardarSistemaMcp(integracionId, { [campo]: alternarEnLista(encendidos, clave, catalogo) })

    setTrabajando(null)

    if (resultado.ok) onGuardado(resultado.sistema)
    else aviso.error(resultado.mensaje)
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-texto mb-1 text-sm font-medium">{titulo}</legend>
      {catalogo.map((item) => (
        <div key={item.clave} className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <span className="text-texto text-sm">{item.nombre}</span>
            <span className="text-texto-tenue text-xs">{item.descripcion}</span>
          </div>
          <Interruptor
            encendido={encendidos.includes(item.clave)}
            etiqueta={item.nombre}
            deshabilitado={trabajando !== null}
            onPulsar={() => { void alternar(item.clave) }}
          />
        </div>
      ))}
    </fieldset>
  )
}
