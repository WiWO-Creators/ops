'use client'

import { useMemo, type ReactElement } from 'react'
import { PanelRecurso } from './PanelRecurso'
import { ArbolDrive } from '@/componentes/archivos/ArbolDrive'
import { ARCHIVOS } from '@/definiciones/archivos'
import type { ArchivoProyecto } from '@/datos/recursos'

/**
 * Pestaña Archivos del Proyecto.
 *
 * Los adjuntos internos hoy no se pueden descargar —la API no expone el endpoint—, asi que la columna
 * de origen distingue los externos, que si traen una `url` abrible, de los que viven en el disco del
 * panel. Un boton de descarga para los internos seria un boton roto.
 *
 * @param proyectoId el proyecto que se esta mirando
 */
export function PanelArchivos ({ proyectoId }: { proyectoId: number }): ReactElement {
  const definicion = useMemo(
    () => ({
      ...ARCHIVOS,
      ruta: `projects/${encodeURIComponent(String(proyectoId))}/files`,
      columnas: ARCHIVOS.columnas.map((columna) => (
        columna.clave === 'external'
          ? { ...columna, presentar: (a: ArchivoProyecto) => <Origen archivo={a} /> }
          : columna
      ))
    }),
    [proyectoId]
  )

  return (
    <div className="flex flex-col gap-6">
      <ArbolDrive raiz="projects" id={proyectoId} />
      <PanelRecurso definicion={definicion} claveFila={(a) => a.id} />
    </div>
  )
}

/** Origen del archivo: enlace externo cuando lo hay, o la leyenda de interno. */
function Origen ({ archivo }: { archivo: ArchivoProyecto }): ReactElement {
  const externo = archivo.external !== null && archivo.external !== '' && archivo.url !== null

  if (!externo) return <span className="text-texto-sutil text-xs">Interno</span>

  return (
    <a
      href={archivo.url ?? '#'}
      target="_blank"
      rel="noreferrer"
      className="text-acento text-xs font-semibold underline underline-offset-4"
    >
      Abrir en {archivo.external}
    </a>
  )
}
