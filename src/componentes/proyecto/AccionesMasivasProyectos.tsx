'use client'

import { useState } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { useAviso } from '@/componentes/estado/useAviso'
import { CLASES_CONTROL } from '@/componentes/formularios/Entrada'
import type { Espacio } from '@/datos/recursos'
import type { OpcionFiltro } from '@/definiciones/tipos'
import { cambiarProyectos } from './proyectos-masivos'

/** Cambia estado o archivado de la selección y avisa el resultado, aun cuando solo una parte tuvo éxito. */
export function AccionesMasivasProyectos ({ filas, estados, limpiar, recargar }: {
  filas: Espacio[]
  estados: OpcionFiltro[]
  limpiar: () => void
  recargar: () => void
}) {
  const avisar = useAviso()
  const [accion, setAccion] = useState('')
  const [ocupado, setOcupado] = useState(false)

  /** Ejecuta la acción elegida y avisa incluso cuando solo una parte tuvo éxito. */
  async function aplicar (): Promise<void> {
    if (!accion || filas.length === 0 || ocupado) return
    setOcupado(true)
    try {
      const resultado = await cambiarProyectos(filas.map((fila) => fila.id),
        accion === 'archive' || accion === 'unarchive' ? { archive: accion === 'archive' } : { status: Number(accion) })
      const mensaje = `${resultado.aplicados} proyectos actualizados.${resultado.fallos.length > 0
        ? ` Sin confirmar: ${resultado.fallos.map((fallo) => `#${fallo.id}: ${fallo.mensaje}`).join('; ')}` : ''}`

      if (resultado.fallos.length === 0) avisar.exito(mensaje)
      else avisar.advertencia(mensaje)

      limpiar()
      recargar()
    } catch (error) {
      avisar.error(error instanceof Error ? error.message : 'No se pudo aplicar el cambio.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {filas.length > 0 && (
        <fieldset disabled={ocupado} className="border-linea rounded-tarjeta flex flex-wrap items-center gap-2 border p-3">
          <legend className="px-1 text-sm">{filas.length} proyectos seleccionados</legend>
          <label className="text-sm" htmlFor="accion-masiva-proyectos">Acción</label>
          <select id="accion-masiva-proyectos" className={`${CLASES_CONTROL} h-9 w-auto text-sm`}
            value={accion} onChange={(evento) => setAccion(evento.target.value)}>
            <option value="">Elige una acción</option>
            {estados.map((estado) => <option key={estado.valor} value={estado.valor}>Marcar como: {estado.etiqueta}</option>)}
            <option value="archive">Archivar</option>
            <option value="unarchive">Desarchivar</option>
          </select>
          <Boton tamano="chico" variante="primario" disabled={!accion || ocupado} onClick={() => { void aplicar() }}>
            {ocupado ? 'Aplicando…' : 'Aplicar a seleccionados'}
          </Boton>
          <Boton tamano="chico" onClick={limpiar}>Limpiar selección</Boton>
        </fieldset>
      )}
    </div>
  )
}
