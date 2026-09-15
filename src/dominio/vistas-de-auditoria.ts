import type { Escalon } from './escalon.ts'

/**
 * Quien ve cada pestaña de `/auditoria`, y cual se abre por defecto.
 *
 * === Por que el reparto no es uno solo ===
 *
 * La pantalla dejo de tener una sola compuerta. **Actividad** —quien esta conectado, que sesiones hay
 * abiertas, que se hizo— sigue siendo de superadministrador: es la misma exigencia que hacen las
 * cuatro rutas que consume, y ofrecerla a alguien mas solo le enseñaria cuatro `403`.
 * **Calidad de tareas** no mira a las personas sino al trabajo escrito, asi que tambien le
 * corresponde a gerencia.
 *
 * **Esconder no autoriza.** La compuerta real es la API, que contesta `403` a quien no corresponde.
 * Esto decide que se OFRECE, y existe para no pintar una pestaña que al abrirla no trae nada.
 *
 * Vive en un `.ts` y fuera del componente por la regla de `docs/convenciones.md`: Node despoja los
 * tipos de un `.ts` pero no el JSX, asi que solo lo que esta aca se puede probar con el runner.
 */

/** Las dos pestañas. El valor es el que viaja en `?vista=`. */
export type VistaAuditoria = 'actividad' | 'calidad'

/** Nombre visible de cada pestaña, en el orden en que se muestran. */
export const VISTAS_DE_AUDITORIA: ReadonlyArray<{ clave: VistaAuditoria, etiqueta: string }> = [
  { clave: 'actividad', etiqueta: 'Actividad' },
  { clave: 'calidad', etiqueta: 'Calidad de tareas' }
]

/** Lo unico de `GET /me` que decide que pestañas se ofrecen. */
export interface QuienMira {
  is_superadmin: boolean
  escalon: Escalon
}

/**
 * Las pestañas que se le pueden ofrecer a quien mira, en orden de lectura.
 *
 * Devuelve lista vacia cuando no le corresponde ninguna: ahi la pantalla entera es "sin permiso",
 * igual que antes de que existieran las pestañas.
 *
 * @param yo Quien mira, tal como llega de `GET /me`.
 * @returns Las pestañas ofrecibles, de cero a dos.
 */
export function vistasPermitidas (yo: QuienMira): VistaAuditoria[] {
  const permitidas: VistaAuditoria[] = []

  if (yo.is_superadmin) permitidas.push('actividad')
  if (yo.is_superadmin || yo.escalon === 'gerencia') permitidas.push('calidad')

  return permitidas
}

/**
 * Que pestaña se abre, a partir de lo que pide la URL y de lo que corresponde.
 *
 * Una pestaña pedida que no corresponde **no** da error: cae a la primera permitida. Una URL vieja,
 * compartida por alguien con mas permisos o escrita a mano tiene que producir una pantalla util, que
 * es la misma regla que `leerConsulta` aplica con los filtros desconocidos.
 *
 * @param pedida El valor crudo de `?vista=`, o `null` si no viene.
 * @param permitidas Lo que devuelve `vistasPermitidas`.
 * @returns La pestaña a pintar, o `null` si no corresponde ninguna.
 */
export function vistaElegida (pedida: string | null, permitidas: VistaAuditoria[]): VistaAuditoria | null {
  const primera = permitidas[0] ?? null

  if (pedida === null) return primera

  return permitidas.find((vista) => vista === pedida) ?? primera
}
