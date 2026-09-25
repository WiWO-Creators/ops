import { GLOSARIO } from './glosario.ts'
import type { TonoInsignia } from '@/componentes/presentadores/Insignia'
import type { EntidadDePapelera } from '@/datos/recursos'

/**
 * Lo que la pantalla de la Papelera necesita decidir sin dibujar: como se nombra cada cosa, que
 * vista pidio la URL y como se lee lo que se lleva un borrado definitivo.
 *
 * Vive en un `.ts` y no en la pagina por la regla de las pruebas: Node despoja los tipos de un `.ts`
 * pero no el JSX de un `.tsx`.
 */

/** Las vistas de la pantalla, en el orden de las pestañas. `todo` no filtra. */
export const VISTAS_DE_PAPELERA = ['todo', 'tasks', 'projects', 'clients'] as const

export type VistaDePapelera = typeof VISTAS_DE_PAPELERA[number]

/** Como se nombra cada entidad. Sale del glosario: "Tarea" y "Proyecto" son renombres visibles. */
const NOMBRES: Record<EntidadDePapelera, { singular: string, plural: string }> = {
  tasks: GLOSARIO.proceso,
  projects: GLOSARIO.espacio,
  clients: GLOSARIO.cliente
}

/**
 * El nombre de una entidad en singular, o en plural para la pestaña.
 *
 * @param entidad el slug de la API
 * @param plural `true` para la pestaña, `false` para la insignia de la fila
 * @returns el nombre visible
 */
export function nombreDeEntidad (entidad: EntidadDePapelera, plural = false): string {
  return plural ? NOMBRES[entidad].plural : NOMBRES[entidad].singular
}

/**
 * Que vista pidio la URL. Cualquier otra cosa es `todo`: el valor viaja en la query y lo puede
 * escribir cualquiera, y una entidad inventada no debe llegar a la API como `filter[entidad]`.
 *
 * @param crudo el valor tal como vino de `searchParams`
 * @returns la vista a mostrar
 */
export function vistaDePapelera (crudo: string | string[] | undefined): VistaDePapelera {
  const valor = Array.isArray(crudo) ? crudo[0] : crudo

  return (VISTAS_DE_PAPELERA as readonly string[]).includes(valor ?? '') ? valor as VistaDePapelera : 'todo'
}

/**
 * Que pagina pidio la URL. Todo lo que no sea un entero mayor o igual a uno es la primera.
 *
 * @param crudo el valor tal como vino de `searchParams`
 * @returns el numero de pagina a pedir
 */
export function paginaDePapelera (crudo: string | string[] | undefined): number {
  const numero = Number(Array.isArray(crudo) ? crudo[0] : crudo)

  return Number.isInteger(numero) && numero >= 1 ? numero : 1
}

/**
 * El tono de los dias que le quedan. Rojo la ultima semana, porque es cuando mirar importa: si la
 * purga automatica esta encendida, lo que llega a cero se borra solo.
 *
 * @param dias `dias_restantes` de la API; un valor invalido se trata como vencido
 * @returns el tono de la insignia
 */
export function tonoDeDiasRestantes (dias: number): TonoInsignia {
  if (!Number.isFinite(dias) || dias <= 7) return 'peligro'
  if (dias <= 14) return 'aviso'

  return 'neutro'
}

/**
 * Los dias que le quedan, en palabras.
 *
 * @param dias `dias_restantes` de la API
 * @returns "Vence hoy", "1 día" o "N días"
 */
export function textoDeDiasRestantes (dias: number): string {
  if (!Number.isFinite(dias) || dias <= 0) return 'Vence hoy'

  return dias === 1 ? '1 día' : `${dias} días`
}

/** Como se leen las claves de `se_borra` / `se_desvincula`. Las que no esten aca se muestran tal cual. */
const ETIQUETAS_DE_CASCADA: Record<string, string> = {
  procesos: GLOSARIO.proceso.plural.toLowerCase(),
  espacios: GLOSARIO.espacio.plural.toLowerCase(),
  hitos: GLOSARIO.hito.plural.toLowerCase(),
  comentarios: 'comentarios',
  comentarios_de_procesos: 'comentarios',
  checklist: 'ítems de checklist',
  adjuntos: 'adjuntos',
  adjuntos_de_procesos: 'adjuntos',
  archivos: 'archivos',
  asignados: 'asignaciones',
  seguidores: 'seguidores',
  cronometros: 'registros de tiempo',
  horas_registradas: 'horas registradas',
  recordatorios: 'recordatorios',
  etiquetas: 'etiquetas',
  campos_personalizados: 'campos personalizados',
  elementos_relacionados: 'elementos relacionados',
  iteraciones: 'iteraciones',
  patente: 'patente',
  miembros: 'miembros',
  notas: 'notas',
  contactos: 'contactos',
  contratos: 'contratos',
  propuestas: 'propuestas',
  gastos: 'gastos',
  tickets: 'tickets',
  suscripciones: 'suscripciones',
  facturas: 'facturas',
  cotizaciones: 'cotizaciones',
  notas_de_credito: 'notas de crédito',
  prospectos: 'prospectos',
  entradas_de_actividad: 'entradas de actividad'
}

/**
 * Lo que se lleva un borrado definitivo, como lista de "N cosas", de mayor a menor.
 *
 * Los ceros se descartan aunque la API ya los filtre: un "0 comentarios" no dice nada y alarga la
 * lista que la persona tiene que leer antes de confirmar.
 *
 * @param conteos `se_borra` o `se_desvincula` de la previsualizacion; `null`/`undefined` es vacio
 * @returns las lineas listas para pintar
 */
export function lineasDeCascada (conteos: Record<string, number> | null | undefined): string[] {
  if (conteos == null) return []

  return Object.entries(conteos)
    .filter(([, n]) => Number.isFinite(n) && n > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([clave, n]) => `${n} ${ETIQUETAS_DE_CASCADA[clave] ?? clave.replaceAll('_', ' ')}`)
}
