'use client'

import { type ReactElement } from 'react'
import { Cargando } from '@/componentes/estado/Estados'
import type { PlantillaHito, PlantillaHitoDetallada } from '@/datos/recursos'
import { GLOSARIO } from '@/dominio/glosario'
import { formatearFecha } from '@/lib/fechas'
import { previsualizarTareas } from '@/lib/plantillas-hito'
import { useRecurso } from './carga'
import { FormularioRecurso } from './FormularioRecurso'
import type { CampoFormulario, ValoresFormulario } from './formulario'

/**
 * Alta de un {hito}, con la opcion de poblarlo desde una plantilla de {hito}.
 *
 * Es el `FormularioRecurso` de siempre mas dos cosas: un desplegable opcional que manda
 * `plantilla_id`, y la lista de las {procesos} que esa plantilla va a crear, **antes** de confirmar.
 * Enseñarlas despues no sirve: quien confirma un alta que crea cuatro {procesos} sin haberlas visto
 * se entera del error cuando ya existen y hay que borrarlas una por una.
 *
 * El componente se monta recien al abrir el dialogo —devuelve `null` cerrado— para que la lista de
 * plantillas no se pida en cada visita a la pestaña de {hitos}, donde la mayoria no crea nada.
 */

interface PropsAlta {
  abierto: boolean
  onAbiertoCambia: (abierto: boolean) => void
  /** Campos del {hito}, con las cotas de fecha del {espacio}. */
  campos: CampoFormulario[]
  /** {espacio} donde nace el {hito}. */
  proyectoId: number
  onGuardado: () => void
}

export function AltaDeHito (props: PropsAlta): ReactElement | null {
  if (!props.abierto) return null

  return <DialogoDeAlta {...props} />
}

function DialogoDeAlta ({ abierto, onAbiertoCambia, campos, proyectoId, onGuardado }: PropsAlta): ReactElement {
  // Se tolera el fallo en silencio: la plantilla es opcional y un listado caido no puede impedir
  // crear un hito a mano, que es lo que la persona vino a hacer.
  const { estado } = useRecurso<PlantillaHito[]>(
    'hito-plantillas',
    'No se pudieron cargar las plantillas.'
  )

  const plantillas = estado.fase === 'listo' ? estado.datos : []

  // El campo aparece solo cuando hay al menos una plantilla: un desplegable cuya unica opcion es
  // "sin plantilla" no es una eleccion, es un control muerto.
  const camposDelAlta = plantillas.length === 0 ? campos : [...campos, campoDePlantilla(plantillas)]

  return (
    <FormularioRecurso
      abierto={abierto}
      onAbiertoCambia={onAbiertoCambia}
      titulo={`Nuevo ${GLOSARIO.hito.singular.toLowerCase()}`}
      campos={camposDelAlta}
      ruta={`projects/${proyectoId}/milestones`}
      metodo="POST"
      onGuardado={onGuardado}
      pie={(valores) => <VistaPreviaDePlantilla valores={valores} />}
    />
  )
}

/**
 * El desplegable de plantilla, construido con las que el servidor devolvio.
 *
 * `plantilla_id` no es un campo del {hito}: el backend lo saca del cuerpo antes de crearlo. Viaja
 * igual por este formulario porque es parte de la misma decision, y partirlo en dos pasos dejaria
 * un {hito} creado esperando una segunda confirmacion que nadie garantiza.
 *
 * @param plantillas Las plantillas disponibles, tal como llegan del listado.
 * @returns La descripcion del campo para `FormularioRecurso`.
 */
function campoDePlantilla (plantillas: PlantillaHito[]): CampoFormulario {
  return {
    clave: 'plantilla_id',
    etiqueta: 'Plantilla',
    tipo: 'seleccion',
    etiquetaSinValor: 'Sin plantilla',
    ayuda: `Al elegirla se crean sus ${GLOSARIO.proceso.plural.toLowerCase()} dentro del ${GLOSARIO.hito.singular.toLowerCase()}, con las fechas contadas desde su inicio.`,
    opciones: plantillas.map((plantilla) => ({ valor: String(plantilla.id), etiqueta: plantilla.name }))
  }
}

/**
 * Lo que la plantilla elegida va a crear, con las fechas ya calculadas.
 *
 * Sin plantilla elegida no dibuja nada: el alta sin plantilla es la de siempre y no necesita
 * explicacion.
 */
function VistaPreviaDePlantilla ({ valores }: { valores: ValoresFormulario }): ReactElement | null {
  const elegida = typeof valores.plantilla_id === 'string' ? valores.plantilla_id : ''

  if (elegida === '') return null

  return (
    <TareasDeLaPlantilla
      // `key` remonta al cambiar de plantilla: sin esto se veria un instante la lista de la anterior
      // bajo el nombre de la nueva.
      key={elegida}
      id={elegida}
      inicio={typeof valores.start_date === 'string' ? valores.start_date : ''}
      cierre={typeof valores.due_date === 'string' ? valores.due_date : ''}
    />
  )
}

interface PropsTareas {
  /** Id de la plantilla elegida, tal como viaja en el formulario. */
  id: string
  /** Fecha de inicio escrita para el {hito}, en `YYYY-MM-DD`. Es el ancla de todos los plazos. */
  inicio: string
  /** Fecha de vencimiento escrita para el {hito}. */
  cierre: string
}

/**
 * Trae las {procesos} de la plantilla y las muestra con las fechas que les tocarian.
 *
 * Las fechas son una **vista previa**: quien decide es el backend. Se calculan con la misma formula
 * (`lib/plantillas-hito.ts`) para que las dos cuentas digan lo mismo.
 */
function TareasDeLaPlantilla ({ id, inicio, cierre }: PropsTareas): ReactElement {
  const { estado } = useRecurso<PlantillaHitoDetallada>(
    `hito-plantillas/${id}`,
    'No se pudo cargar la plantilla.'
  )

  if (estado.fase === 'cargando') {
    return <Cargando alto="min-h-20" mensaje={`Cargando las ${GLOSARIO.proceso.plural.toLowerCase()} de la plantilla…`} />
  }

  if (estado.fase === 'error') {
    return (
      <p role="alert" className="text-texto-peligro text-sm">
        {estado.mensaje} Puedes crear el {GLOSARIO.hito.singular.toLowerCase()} sin plantilla.
      </p>
    )
  }

  const tareas = estado.datos.tasks

  if (tareas.length === 0) {
    return (
      <p role="alert" className="text-texto-peligro text-sm">
        Esta plantilla no tiene {GLOSARIO.proceso.plural.toLowerCase()}, así que no se puede aplicar.
        Elige otra o crea el {GLOSARIO.hito.singular.toLowerCase()} sin plantilla.
      </p>
    )
  }

  const previstas = previsualizarTareas(inicio, cierre, tareas)

  return (
    <section className="border-linea rounded-tarjeta flex flex-col gap-2 border p-3">
      <h3 className="text-texto font-titular text-sm font-semibold">
        Se crearán estas {GLOSARIO.proceso.plural.toLowerCase()}
        <span className="text-texto-sutil ml-2 font-normal">{previstas.length}</span>
      </h3>

      <ol className="divide-linea-suave divide-y">
        {previstas.map((tarea, indice) => (
          <li key={`${tarea.nombre}-${indice}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5">
            <span className="text-texto min-w-40 flex-1 text-sm">{tarea.nombre}</span>
            <span className="text-texto-tenue text-xs tabular-nums">
              {tarea.inicio === null || tarea.vence === null
                // Sin fecha de inicio del hito no hay ancla: decirlo es mejor que mostrar dos rayas
                // que se leerian como "estas tareas no llevan fecha".
                ? `Pon la fecha de inicio del ${GLOSARIO.hito.singular.toLowerCase()} para ver las fechas`
                : `${formatearFecha(tarea.inicio)} → ${formatearFecha(tarea.vence)}`}
            </span>
            <span className="text-texto-sutil text-xs">{tarea.prioridad}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
