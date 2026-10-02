'use client'

import type { PlantillaHito } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import type { OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'
import { CATALOGO_AUTORES, PLANTILLAS_HITO } from '@/definiciones/plantillas-hito'
import { GLOSARIO } from '@/dominio/glosario'
import { EditorPlantillaHito } from './EditorPlantillaHito'
import { PantallaDePlantillas } from './PantallaDePlantillas'

interface PropsPantalla {
  /** Primera pagina, ya resuelta en el servidor. El endpoint no pagina: es la lista entera. */
  inicial: ResultadoLista<PlantillaHito>
  /**
   * Capacidades sobre `projects`.
   *
   * Crear una plantilla exige `create_milestones` —el permiso de la cosa que la plantilla
   * construye—, no `create`: quien no puede crear hitos no tiene para que armar su esqueleto.
   */
  capacidades: Capacidad[]
  /** Tipos de {proceso} ya deduplicados por nombre. */
  tiposDeProceso: OpcionFiltro[]
  /** Personas del equipo, para el filtro "Creada por". */
  autores: OpcionFiltro[]
}

/**
 * Listado de plantillas de Hito: `PantallaDePlantillas` sobre `PLANTILLAS_HITO`.
 *
 * Aca **todo el staff ve todas las plantillas**, asi que los controles de fila dependen de
 * `can_edit`. Borrar una no arrastra ningun {hito} ya creado: al aplicarla las {procesos} nacieron
 * como {procesos} de verdad y desde ahi viven solas.
 */
export function PantallaPlantillasHito ({ inicial, capacidades, tiposDeProceso, autores }: PropsPantalla) {
  return (
    <PantallaDePlantillas
      inicial={inicial}
      definicion={PLANTILLAS_HITO}
      puedeCrear={capacidades.includes('create_milestones')}
      opcionesDeFiltro={{ [CATALOGO_AUTORES]: autores }}
      rutaDeBorrado={(plantilla) => `hito-plantillas/${plantilla.id}`}
      advertenciaDeBorrado={(plantilla) =>
        `«${plantilla.name}»: se borra la plantilla y su lista de ${GLOSARIO.proceso.plural.toLowerCase()}. `
        + `Los ${GLOSARIO.hito.plural.toLowerCase()} que ya se crearon con ella no se tocan.`}
      editor={(props) => <EditorPlantillaHito {...props} tiposDeProceso={tiposDeProceso} />}
    />
  )
}
