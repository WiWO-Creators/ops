'use client'

import { useState } from 'react'
import { bloquesDeHtml } from '@/dominio/acta-bloques'
import { cuerpoDelActa } from '@/dominio/actas'
import type { MetaDelActa } from '@/dominio/exportar-acta'
import type { IdiomaDelActa } from '@/dominio/idiomas-acta'
import { temaDeMarca } from '@/dominio/marcas-acta'
import type { Acta } from '@/datos/recursos'

/** Los dos archivos que se bajan. Imprimir no pasa por acá: usa el `print()` del visor. */
export type FormatoDeExportacion = 'pdf' | 'docx'

interface OpcionesDeExportacion {
  acta: Acta
  /** Lo que se esta viendo, no el original. */
  htmlActivo: string
  tituloActivo: string
  infoIdioma: IdiomaDelActa
  setError: (mensaje: string | null) => void
}

export interface ExportacionDelActa {
  /** El formato que se esta generando, o `null` si no hay ninguno en vuelo. */
  exportando: FormatoDeExportacion | null
  exportar: (formato: FormatoDeExportacion) => Promise<void>
}

/**
 * Los datos de portada del archivo exportado.
 *
 * @param acta el acta de la que salen cliente, fecha, lugar y autor
 * @param titulo el titulo que se esta viendo, que puede ser el de una traduccion
 * @param idioma el idioma en el que se esta leyendo
 * @returns la cabecera que esperan los dos generadores
 */
function metaDelActa (acta: Acta, titulo: string, idioma: IdiomaDelActa): MetaDelActa {
  return {
    titulo,
    cliente: acta.client,
    fecha: acta.meeting_date,
    lugar: acta.place,
    autor: acta.author?.full_name ?? '',
    idioma
  }
}

/**
 * Baja el acta como PDF o como Word.
 *
 * @param opciones el acta, lo que se esta viendo y como avisar errores
 * @returns el formato en vuelo y la accion de exportar
 */
export function useExportacionDelActa ({
  acta,
  htmlActivo,
  tituloActivo,
  infoIdioma,
  setError
}: OpcionesDeExportacion): ExportacionDelActa {
  const [exportando, setExportando] = useState<FormatoDeExportacion | null>(null)

  /**
   * Genera y descarga el archivo.
   *
   * Los dos generadores se cargan al pulsar y no con la pantalla: entre `pdfmake` y `docx` son
   * cientos de kilobytes que nadie necesita para leer un acta, y esta pantalla vive dentro de la
   * más usada del panel.
   */
  async function exportar (formato: FormatoDeExportacion): Promise<void> {
    setExportando(formato)
    setError(null)

    try {
      // Lo que se esta viendo, no el original: estar leyendo el acta en chino y bajar el PDF en
      // español seria el peor desenlace posible de esta pantalla.
      const bloques = bloquesDeHtml(cuerpoDelActa(htmlActivo))
      const tema = temaDeMarca(acta.brand)
      const meta = metaDelActa(acta, tituloActivo, infoIdioma)

      if (formato === 'pdf') {
        const { descargarPdf } = await import('@/dominio/exportar-pdf')
        await descargarPdf(bloques, tema, meta)
      } else {
        const { descargarDocx } = await import('@/dominio/exportar-docx')
        await descargarDocx(bloques, tema, meta)
      }
    } catch {
      // El motivo real —una fuente que no bajó, memoria, un HTML raro— no le dice nada a nadie acá;
      // lo que importa es que el botón no se quede girando y que quede el camino de siempre.
      setError(infoIdioma.necesitaCjk
        ? 'No se pudo generar el archivo: la tipografía china no cargó. Prueba con Imprimir, que usa las fuentes del navegador.'
        : 'No se pudo generar el archivo. Prueba con Imprimir, que usa el motor del navegador.')
    } finally {
      setExportando(null)
    }
  }

  return { exportando, exportar }
}
