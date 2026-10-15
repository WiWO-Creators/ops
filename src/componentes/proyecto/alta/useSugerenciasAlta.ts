import { useMemo, useState } from 'react'
import type { Hito, Referencia, TipoDeProcesoDelEspacio } from '@/datos/recursos'
import type { StaffReferencia } from '@/datos/tipos'
import type { TareaFusionada } from '@/dominio/ia-tarea'
import {
  aplanar, idDeSelector, parteDeSugerencias, pendientes, unirSugeridos,
  type ChipSugerido, type ChipsPorCampo, type ParteDeSugerencias
} from '@/dominio/sugerencias-tarea'
import { useSugerenciasDeTarea } from '../useSugerenciasDeTarea'
import { aplicarChip, NINGUNO, type BorradorAlta, type DestinoDelAlta } from './modelo'
import type { EstadoDelBorrador } from './useBorradorAlta'

interface OpcionesSugerenciasAlta {
  /** El alta está abierta y todavía no creó nada. */
  activo: boolean
  destino: DestinoDelAlta
  borrador: BorradorAlta
  actualizar: EstadoDelBorrador['actualizar']
  personas: StaffReferencia[]
  tipos: TipoDeProcesoDelEspacio[]
  hitos: Hito[]
  prioridades: ReadonlyArray<Referencia>
  nombresDelCatalogo: string[]
  /** Lo último que interpretó la IA; de ahí salen los sugeridos por hábito. */
  fusion: TareaFusionada | null
}

/** Las sugerencias del alta: qué chips mostrar, cómo aceptarlos y qué se registra al guardar. */
export interface SugerenciasDelAlta {
  chips: ChipsPorCampo
  aceptar: (chip: ChipSugerido) => void
  /** Ids que el selector de personas ofrece arriba, por campo. */
  personasSugeridas: { asignados: number[], seguidores: number[] }
  /** El campo `sugerencias` de `POST /tasks`; `null` si no hubo nada que registrar. */
  parte: () => ParteDeSugerencias | null
  /** Olvida lo aceptado (el alta se cerró o se limpió). */
  reiniciar: () => void
}

/** Convierte filas con nombre a la forma `{ id, nombre }` que usa `unirSugeridos`. */
function conNombre (filas: ReadonlyArray<{ id: number, name: string }>): Array<{ id: number, nombre: string }> {
  return filas.map((fila) => ({ id: fila.id, nombre: fila.name }))
}

/**
 * Reúne las sugerencias del historial y las de la IA, y las deja listas para pintar en el alta.
 *
 * Solo hay sugerencias con **un** Espacio elegido: con varios cada uno tiene su historial, sus tipos y
 * sus hitos, y no hay una respuesta común. Lo aceptado se recuerda junto con el Espacio, así que un
 * chip que se aceptó en otro Espacio antes de cambiarlo no viaja en el parte del nuevo.
 *
 * @param opciones el borrador, los catálogos de la pantalla y la última interpretación de IA
 * @returns los chips por campo y las acciones sobre ellos
 */
export function useSugerenciasAlta (opciones: OpcionesSugerenciasAlta): SugerenciasDelAlta {
  const { activo, destino, borrador, actualizar, nombresDelCatalogo } = opciones
  const espacioId = activo && destino.vaAEspacio && !destino.multiple && destino.espacio !== NINGUNO
    ? Number(destino.espacio)
    : null
  const tipoId = idDeSelector(borrador.tipo)
  const delHistorial = useSugerenciasDeTarea(espacioId, tipoId, borrador.inicio)
  const [aceptadas, setAceptadas] = useState<Array<{ espacioId: number, chip: ChipSugerido }>>([])

  const sugerencias = useMemo(
    () => unirSugeridos(delHistorial, espacioId === null ? null : opciones.fusion?.sugeridos ?? null, {
      personas: opciones.personas.map((persona) => ({ id: persona.id, nombre: persona.full_name })),
      tipos: conNombre(opciones.tipos),
      prioridades: conNombre(opciones.prioridades),
      hitos: conNombre(opciones.hitos)
    }),
    [delHistorial, espacioId, opciones.fusion, opciones.personas, opciones.tipos, opciones.prioridades, opciones.hitos]
  )

  const chips = useMemo(
    () => pendientes(
      espacioId === null ? null : sugerencias,
      {
        asignados: borrador.asignados,
        seguidores: borrador.seguidores,
        etiquetas: borrador.etiquetasEscritas,
        tipo: tipoId,
        prioridad: idDeSelector(borrador.prioridad),
        hito: idDeSelector(borrador.hito),
        vencimiento: borrador.vencimiento,
        horas: borrador.horasEstimadas,
        facturable: borrador.facturable
      },
      {
        conocidos: {
          personas: new Set(opciones.personas.map((persona) => persona.id)),
          tipos: new Set(opciones.tipos.map((tipo) => tipo.id)),
          prioridades: new Set(opciones.prioridades.map((prioridad) => prioridad.id)),
          hitos: new Set(opciones.hitos.map((hito) => hito.id))
        }
      }
    ),
    [espacioId, sugerencias, borrador, tipoId, opciones.personas, opciones.tipos, opciones.prioridades, opciones.hitos]
  )

  return {
    chips,
    aceptar: (chip) => {
      actualizar((actual) => aplicarChip(actual, chip, nombresDelCatalogo))
      if (espacioId !== null) setAceptadas((previas) => [...previas, { espacioId, chip }])
    },
    personasSugeridas: {
      asignados: sugerencias?.asignados.map((persona) => persona.id) ?? [],
      seguidores: sugerencias?.seguidores.map((persona) => persona.id) ?? []
    },
    parte: () => espacioId === null
      ? null
      : parteDeSugerencias(
        aceptadas.filter((aceptada) => aceptada.espacioId === espacioId).map((aceptada) => aceptada.chip),
        aplanar(chips)
      ),
    reiniciar: () => { setAceptadas([]) }
  }
}
