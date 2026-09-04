import type { DefinicionRecurso } from './tipos.ts'
import type { PlantillaEspacio } from '../datos/recursos.ts'
import { GLOSARIO } from '../dominio/glosario.ts'
import { formatearFecha } from '../lib/fechas.ts'

/**
 * Definicion del recurso Plantillas de Espacio.
 *
 * Las tres whitelists van **vacias** a proposito, y no por olvido: `GET /project-templates` devuelve
 * las propias y las publicas ordenadas por nombre, sin paginar, sin filtros, sin `sort` y sin
 * `include`. Declarar cualquiera de esas cosas haria que `construirConsulta` mandara parametros que
 * el endpoint no ofrece, y la lista es corta —son las plantillas de una persona—, asi que tampoco
 * hacen falta.
 *
 * Fuente: `docs/contrato-api.md`, bloque `### Rama feat/plantillas-espacio`.
 */
export const PLANTILLAS: DefinicionRecurso<PlantillaEspacio> = {
  ruta: 'project-templates',
  titulo: { singular: 'Plantilla', plural: 'Plantillas' },

  columnas: [
    { clave: 'name', encabezado: 'Nombre', presentar: (p) => p.name },
    { clave: 'description', encabezado: 'Descripción', presentar: (p) => p.description ?? '' },
    {
      clave: 'duration_days',
      encabezado: 'Duración esperada',
      numerica: true,
      // `null` y `0` son la misma cosa para el contrato: "sin duracion declarada", factor 1. Un cero
      // en la columna se leeria como "dura cero dias", que es otra cosa.
      presentar: (p) => (p.duration_days === null || p.duration_days === 0 ? '—' : `${p.duration_days} d`)
    },
    { clave: 'is_public', encabezado: 'Visibilidad', presentar: (p) => (p.is_public ? 'Compartida' : 'Privada') },
    {
      clave: 'date_created',
      encabezado: 'Creada',
      ocultaPorDefecto: true,
      presentar: (p) => formatearFecha(p.date_created)
    }
  ],

  filtros: [],
  ordenables: [],
  // Lista vacia y no una cadena: `estadoInicial` la usa tal cual, y cualquier campo suelto acabaria
  // en un `sort` que el endpoint no declara.
  ordenPorDefecto: [],
  busqueda: false,
  includes: []
}

/** Nombre visible de la pantalla: "Plantillas de Proyecto", con el glosario mandando. */
export const TITULO_PLANTILLAS = `${PLANTILLAS.titulo.plural} de ${GLOSARIO.espacio.singular}`
