'use client'

import { useState, type FormEvent } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { ContenidoDialogo, Dialogo, DisparadorDialogo } from '@/componentes/superposiciones/Dialogo'
import { idCarpetaDrive, type HojaDeTareas } from './exportar-tareas-sheets'

interface Props {
  personaId: number
  nombre: string
  email: string
}

/**
 * Exporta las tareas visibles de una persona a una hoja editable, sin sobrescribir hojas anteriores.
 * @param props Identidad de la persona cuya ficha se está consultando.
 * @returns Acción, formulario de destino y enlace a la hoja creada.
 */
export function ExportarTareasSheets ({ personaId, nombre, email }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [carpeta, setCarpeta] = useState('')
  const [compartir, setCompartir] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hoja, setHoja] = useState<HojaDeTareas | null>(null)
  const folderId = idCarpetaDrive(carpeta)

  /** Envía una exportación y conserva su resultado aunque el permiso de edición no se pueda conceder. */
  async function exportar (evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    if (exportando || folderId === null) return
    setExportando(true)
    setError(null)
    const resultado = await escribirEnBff<HojaDeTareas>(`staff/${personaId}/tasks/export-sheet`, 'POST', {
      folder_id: folderId,
      compartir_con_persona: compartir,
      ops_origin: window.location.origin
    })
    setExportando(false)
    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }
    setHoja(resultado.datos)
  }

  return (
    <Dialogo open={abierto} onOpenChange={(valor) => { if (!exportando) setAbierto(valor) }}>
      <DisparadorDialogo asChild>
        <Boton variante="secundario" tamano="chico"><FileSpreadsheet className="size-4" aria-hidden="true" />Exportar tareas a Sheets</Boton>
      </DisparadorDialogo>
      <ContenidoDialogo titulo={`Exportar tareas de ${nombre}`} descripcion="Crea una hoja de Google Sheets para revisar el trabajo y completar información.">
        {hoja !== null ? (
          <div className="flex flex-col gap-4" role="status">
            <p className="text-sm">Hoja creada con {hoja.total} {hoja.total === 1 ? 'tarea' : 'tareas'}.</p>
            <p className="text-texto-tenue text-sm">{hoja.compartida ? `${nombre} tiene acceso de edición.` : 'La hoja conserva los permisos de la carpeta de destino.'}</p>
            {hoja.advertencia && <p role="alert" className="text-texto-peligro text-sm">{hoja.advertencia}</p>}
            <a href={hoja.url} target="_blank" rel="noopener noreferrer" className="text-acento font-medium underline underline-offset-4">Abrir Google Sheets</a>
            <Boton variante="sutil" onClick={() => { setHoja(null); setError(null) }}>Crear otra exportación</Boton>
          </div>
        ) : (
          <form onSubmit={(evento) => { void exportar(evento) }} className="flex flex-col gap-5" aria-busy={exportando}>
            <p className="text-texto-tenue text-sm">Incluye todas sus tareas asignadas que puedes consultar, también las completadas. Tendrá columnas vacías para avance, bloqueos y fecha comprometida.</p>
            <Campo etiqueta="Carpeta de Drive" requerido ayuda="Pega el enlace de una carpeta del Drive compartido de WiWO. La hoja heredará sus permisos." error={carpeta.trim() !== '' && folderId === null ? 'Introduce un enlace de carpeta de Google Drive o su ID.' : undefined}>
              {(props) => <Entrada {...props} value={carpeta} required disabled={exportando} onChange={(evento) => { setCarpeta(evento.target.value) }} placeholder="Enlace de la carpeta" />}
            </Campo>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="accent-acento mt-1 size-4 shrink-0" checked={compartir} disabled={exportando || email === ''} onChange={(evento) => { setCompartir(evento.target.checked) }} />
              <span>Dar acceso de edición a {nombre}<span className="text-texto-tenue block break-all">{email || 'Esta persona no tiene correo registrado.'}</span></span>
            </label>
            <p className="text-texto-sutil text-xs">Se crea una hoja nueva. Lo que se escriba en ella no cambia las tareas de Ops.</p>
            {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}
            <div className="flex justify-end gap-2">
              <Boton variante="sutil" disabled={exportando} onClick={() => { setAbierto(false) }}>Cancelar</Boton>
              <Boton type="submit" disabled={folderId === null || exportando} cargando={exportando}>{exportando ? 'Creando hoja…' : 'Crear Google Sheets'}</Boton>
            </div>
          </form>
        )}
      </ContenidoDialogo>
    </Dialogo>
  )
}
