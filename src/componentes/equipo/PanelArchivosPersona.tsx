'use client'

import { useMemo, type ReactElement } from 'react'
import { PanelRecurso } from '@/componentes/proyecto/PanelRecurso'
import { ARCHIVOS } from '@/definiciones/archivos'
import type { ArchivoProyecto } from '@/datos/recursos'
import type { Columna } from '@/definiciones/tipos'

/**
 * Pestaña Archivos de la ficha de una persona.
 *
 * **No son «sus» archivos: son los que subió.** En el board un archivo cuelga de una Tarea, de un
 * Proyecto o de un Cliente, y lo único que lo ata a alguien es quién lo subió. Por eso la columna
 * «Dónde está» no es decorativa: sin ella la lista es una hilera de nombres de archivo sin lugar.
 *
 * Quedan fuera los adjuntos de Clientes y de las entidades de venta —contratos, facturas—: cada uno
 * tiene su propio permiso, y traerlos acá metería en una ficha de equipo filas que la persona que
 * mira no alcanza por su ruta.
 *
 * @param personaId quién subió los archivos
 */
export function PanelArchivosPersona ({ personaId }: { personaId: number }): ReactElement {
  const definicion = useMemo(
    () => ({
      ...ARCHIVOS,
      ruta: `staff/${encodeURIComponent(String(personaId))}/files`,
      // Se inserta detrás del nombre y no al final: el nombre y su lugar se leen juntos. Y se le
      // quita el orden a las dos columnas que lo traían: este endpoint devuelve la lista entera ya
      // ordenada por fecha y no acepta `sort`, así que una flecha que no ordena nada sería mentira.
      columnas: ARCHIVOS.columnas.flatMap(({ ordenPor: _orden, ...columna }) =>
        columna.clave === 'file_name' ? [columna, COLUMNA_DONDE] : [columna]
      ),
      ordenables: [],
      ordenPorDefecto: ''
    }),
    [personaId]
  )

  return <PanelRecurso definicion={definicion} claveFila={(archivo) => `${archivo.rel_type}-${archivo.id}`} />
}

/** De dónde cuelga el archivo: la Tarea o el Proyecto al que se subió. */
const COLUMNA_DONDE: Columna<ArchivoProyecto> = {
  clave: 'rel_name',
  encabezado: 'Dónde está',
  presentar: (archivo) => archivo.rel_name ?? '—'
}
