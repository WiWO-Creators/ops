'use client'

import type { PlantillaEspacio } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import type { OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'
import { PLANTILLAS } from '@/definiciones/plantillas'
import { GLOSARIO } from '@/dominio/glosario'
import { EditorPlantilla } from './EditorPlantilla'
import { PantallaDePlantillas } from './PantallaDePlantillas'

interface PropsPantalla {
  /** Primera pagina, ya resuelta en el servidor. El endpoint no pagina: es la lista entera. */
  inicial: ResultadoLista<PlantillaEspacio>
  /** Capacidades sobre `projects`: crear una plantilla exige `create`, igual que crear un {espacio}. */
  capacidades: Capacidad[]
  /** Tipos de {proceso} ya deduplicados por nombre. */
  tiposDeProceso: OpcionFiltro[]
  equipo: OpcionFiltro[]
}

/**
 * Listado de plantillas de {espacio}: `PantallaDePlantillas` sobre `PLANTILLAS`.
 *
 * Una plantilla publica de otra persona se ve y se usa, pero no se toca (`can_edit`). Borrarla no
 * arrastra ningun {espacio} ya creado: las fechas se copiaron al instanciar y desde ahi cada
 * {espacio} vive solo. Decirlo evita el miedo de que borrar la plantilla borre el trabajo.
 */
export function PantallaPlantillas ({ inicial, capacidades, tiposDeProceso, equipo }: PropsPantalla) {
  return (
    <PantallaDePlantillas
      inicial={inicial}
      definicion={PLANTILLAS}
      puedeCrear={capacidades.includes('create')}
      rutaDeBorrado={(plantilla) => `project-templates/${plantilla.id}`}
      advertenciaDeBorrado={(plantilla) =>
        `«${plantilla.name}»: se borra la plantilla y sus ítems. Los ${GLOSARIO.espacio.plural.toLowerCase()} `
        + 'que ya se crearon con ella no se tocan.'}
      editor={(props) => <EditorPlantilla {...props} tiposDeProceso={tiposDeProceso} equipo={equipo} />}
    />
  )
}
