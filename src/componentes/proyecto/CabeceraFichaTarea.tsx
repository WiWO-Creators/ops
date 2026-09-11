import type { ReactElement } from 'react'

/**
 * La cabecera de la ficha de una Tarea: titulo, marca debajo y codigo a la derecha.
 *
 * === POR QUE VIVE SUELTA ===
 *
 * La ficha se dibuja en dos lados —el modal del panel (`DetalleTarea`) y la vista compartida de
 * `/tarea/[token]`— y las dos cabeceras se habian separado: una tenia el titulo en `h3 text-base`
 * y la otra en `h1 text-xl`, y ninguna mostraba la marca. Con dos copias vuelven a separarse en el
 * primer ajuste. Aca es una sola.
 *
 * No lleva `'use client'`: es marcado y nada mas, asi que la pagina compartida —que se arma en el
 * servidor— no manda JavaScript de mas por usarla. Es la misma decision de `DatoDeFicha`.
 *
 * === POR QUE EL NIVEL ENTRA POR PARAMETRO ===
 *
 * La jerarquia pedida es visual: titulo grande, marca debajo, codigo chico a la derecha. Los niveles
 * de encabezado son otra cosa y dependen de donde se monta: la pagina compartida es una pagina y su
 * titulo es el `h1`; el modal ya vive bajo el `h2` del dialogo —el nombre accesible que anuncia el
 * lector de pantalla al abrirlo— y meterle un segundo `h1` dejaria el documento con dos. El tamaño
 * no cambia entre los dos casos; el nivel si.
 *
 * El codigo NO es un encabezado aunque se pida "H3": no encabeza nada, es la etiqueta de la Tarea.
 * Va como texto, con el peso visual que se pidio.
 */

interface PropsCabeceraFichaTarea {
  titulo: string
  /** La marca o el Proyecto del que cuelga. Sin dato no se pinta la linea. */
  marca?: string | null
  /** La patente visible (`PAT-001-07`). Sin dato no se pinta. */
  codigo?: string | null
  /** Nivel del encabezado del titulo; la marca toma el siguiente. `1` solo si la pagina no tiene otro. */
  nivel?: 1 | 2 | 3
}

export function CabeceraFichaTarea (
  { titulo, marca = null, codigo = null, nivel = 1 }: PropsCabeceraFichaTarea
): ReactElement {
  const Titulo = `h${nivel}` as 'h1' | 'h2' | 'h3'
  const Marca = `h${nivel + 1}` as 'h2' | 'h3' | 'h4'

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Titulo className="font-titular text-texto text-xl leading-snug font-extrabold">{titulo}</Titulo>
        {marca !== null && marca !== '' && (
          <Marca className="text-texto-tenue truncate text-sm font-semibold">{marca}</Marca>
        )}
      </div>
      {codigo !== null && codigo !== '' && (
        <span className="text-texto-tenue shrink-0 font-mono text-xs tracking-wide">{codigo}</span>
      )}
    </div>
  )
}
