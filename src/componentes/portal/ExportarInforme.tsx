'use client'

import { useState } from 'react'
import { FileDown } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { useAviso } from '@/componentes/estado/useAviso'
import type { TableroDelProyecto } from '@/datos/portal'
import type { CatalogoDeEstados } from '@/dominio/estados-tarea'
import type { CodigoDeMarca } from '@/dominio/marcas-acta'

/**
 * El botón «Exportar informe» del tablero.
 *
 * Arma el informe con el MISMO `tablero` que el servidor ya dibujó —el del mes que se mira—, así que
 * no hay una segunda consulta ni una segunda fuente: lo que se descarga es lo que se ve. El
 * generador (pdfmake y las tipografías) se importa recién al hacer clic.
 *
 * @param tablero el tablero tal como llegó, vivo o foto al cierre de un mes
 * @param estados `task_statuses` del portal
 * @param mes el mes cerrado que se mira (`YYYY-MM`), o `null`
 * @param proyecto nombre del proyecto
 * @param marca la marca que firma el informe; por defecto WiWO
 */
export function ExportarInforme (
  { tablero, estados, mes, proyecto, marca }:
  { tablero: TableroDelProyecto, estados: CatalogoDeEstados, mes: string | null, proyecto: string, marca?: CodigoDeMarca }
) {
  const [generando, setGenerando] = useState(false)
  const avisar = useAviso()

  async function exportar (): Promise<void> {
    setGenerando(true)

    try {
      const [{ modeloDelInforme }, { descargarInformePdf }] = await Promise.all([
        import('@/dominio/informe-tablero'),
        import('@/dominio/exportar-informe-pdf')
      ])
      const emitido = new Date().toISOString().slice(0, 10)

      await descargarInformePdf(modeloDelInforme(tablero, estados, { proyecto, mes, emitido }), mes, marca)
    } catch {
      avisar.error('No se pudo generar el informe. Intenta de nuevo.')
    } finally {
      setGenerando(false)
    }
  }

  return (
    <Boton data-rastreo="tablero.exportar-informe" cargando={generando} onClick={() => { void exportar() }}>
      <FileDown className="size-4" aria-hidden="true" />
      Exportar informe
    </Boton>
  )
}
