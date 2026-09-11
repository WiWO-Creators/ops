import type { Ajustes } from '../datos/recursos.ts'
import { GLOSARIO } from './glosario.ts'
import { diasHasta } from '../lib/fechas.ts'

/**
 * Las alertas de plazo del modulo de Licitaciones, sin nada de React ni de Next.
 *
 * === QUE PROBLEMA RESUELVE ===
 *
 * Una Licitacion se pierde por plazo, no por calidad: el dia que cierra, cierra. El listado
 * mostraba la fecha de inicio y nada mas, asi que el vencimiento y las Fechas Clave solo se veian
 * entrando a cada ficha una por una. Esto arma la banda de arriba de la pantalla.
 *
 * === DE DONDE SALEN LOS DATOS, Y POR QUE DE AHI ===
 *
 * De dos lecturas que ya existen, ninguna nueva:
 *
 *   1. `GET /licitaciones?filter[estado]=abierta` — de cada fila sale `espacio.deadline`, que es
 *      **el vencimiento de la Licitacion misma**. Es el unico plazo que no depende de que alguien
 *      haya cargado tareas.
 *   2. `GET /me/vencimientos` — las Tareas propias por vencer o ya vencidas, con el bloque `aviso`
 *      **calculado por la misma funcion que usa el cron de recordatorios**. Ese endpoint no sabe que
 *      es una Licitacion —devuelve Tareas de cualquier Espacio—, asi que el cruce se hace aca: una
 *      Licitacion **es** un Espacio, y `proceso.project.id` es el id de la Licitacion.
 *
 * Reusar el `aviso` del cron en vez de recalcular los tramos es deliberado: es lo que hace que la
 * pantalla y el correo de recordatorio nunca digan cosas distintas del mismo plazo.
 *
 * === POR QUE UN SOLO UMBRAL ===
 *
 * Las Tareas llegan **ya recortadas** por la ventana del cron (`wiwo_task_reminder_early_days`), asi
 * que ponerles un umbral propio aca las volveria a filtrar con un criterio que el correo no conoce.
 * El unico umbral que esta pantalla decide es el suyo: con cuanta anticipacion avisa el vencimiento
 * de una Licitacion, que ningun cron mira.
 *
 * Node puede ejecutar este archivo tal cual (`pruebas/alertas-licitacion.test.js`): por eso no
 * importa nada del framework y los tipos de entrada son estructurales minimos.
 */

/**
 * Dias de anticipacion con los que se avisa el vencimiento de una Licitacion.
 *
 * Vive aca y no en la pantalla porque es una constante de negocio: cuanto tiempo necesita el equipo
 * para armar una propuesta antes de que cierre. Quince dias es el plazo que el equipo pidio; subirlo
 * o bajarlo es cambiar este numero y nada mas.
 */
export const DIAS_DE_AVISO_DE_VENCIMIENTO = 15

/**
 * Tope de Licitaciones abiertas que se le piden a la API para armar la banda.
 *
 * Es el maximo que acepta `per_page` del backend. Si algun dia hubiera mas de 500 abiertas a la vez,
 * la banda se quedaria corta en silencio; hoy no hay ni cerca de esa cantidad.
 */
export const TOPE_DE_LICITACIONES_EN_ALERTA = 500

/**
 * La clave de `Escritura\Ajuste::EDITABLES` que gobierna el correo de aviso de Licitaciones.
 *
 * Escrita una sola vez: una clave mal tecleada no es un campo que se ignora, es un `422` con
 * `no_editable`. Sigue el mismo camino que `AJUSTE_MODO_CORREO_CLIENTE` (`dominio/correo-cliente.ts`)
 * y, como aquella, el interruptor existe **antes** que el envio para que el dia que exista ya este
 * puesto en apagado.
 *
 * Mientras la API no publique esta clave en `GET /settings`, la pantalla lo dice en vez de dibujar
 * un control muerto.
 */
export const AJUSTE_AVISOS_LICITACION = 'wiwo_avisos_licitaciones'

/** El grupo con el que se dibuja el interruptor. No es un grupo de la API: es el titulo de la caja. */
export const GRUPO_AVISOS_LICITACION = 'avisos_licitacion'

/** Que plazo dispara la alerta. */
export type MotivoDeAlerta = 'vencimiento' | 'fecha_clave' | 'tarea'

/** Cuan urgente es. `proximo` incluye todo lo que todavia no vencio. */
export type TramoDeAlerta = 'vencido' | 'hoy' | 'proximo'

/** Lo minimo que la banda necesita de una fila de `GET /licitaciones`. */
export interface LicitacionParaAlerta {
  id: number
  estado: string
  company: string
  espacio: { name: string, deadline: string | null }
}

/** Lo minimo que la banda necesita de una fila de `GET /me/vencimientos`. */
export interface VencimientoParaAlerta {
  id: number
  name: string
  due_date: string | null
  project: { id: number, name: string } | null
  milestone: { id: number, name: string } | null
  aviso: { estado: 'vencido' | 'hoy' | 'final' | 'temprano', dias_restantes: number }
}

/** Una linea de la banda, ya lista para pintar. */
export interface AlertaDeLicitacion {
  /** Clave estable para la lista: el motivo no basta, dos Tareas pueden compartir Licitacion. */
  clave: string
  /** Id de la Licitacion, que **es** el id del Espacio: el enlace va a `/licitaciones/{id}`. */
  licitacionId: number
  /** La empresa a la que se le licita. */
  empresa: string
  motivo: MotivoDeAlerta
  /** Lo que vence: el nombre del Espacio, el de la Fecha Clave o el de la Tarea. */
  detalle: string
  /** La fecha que dispara la alerta, `YYYY-MM-DD`; `null` si la Tarea no la trajo. */
  fecha: string | null
  tramo: TramoDeAlerta
  /** Dias contra hoy. **Negativo = ya paso**, `0` = hoy. */
  dias: number
}

/** Nombre visible del motivo. Sale del glosario: ningun literal "Fecha Clave" se escribe a mano. */
export function etiquetaDeMotivo (motivo: MotivoDeAlerta): string {
  if (motivo === 'vencimiento') return GLOSARIO.licitacion.singular
  if (motivo === 'fecha_clave') return GLOSARIO.hito.singular

  return GLOSARIO.proceso.singular
}

/**
 * Convierte los dias que faltan en el tramo que decide el color.
 *
 * @param dias dias contra hoy, negativos si ya paso
 * @returns el tramo de la alerta
 */
function tramoDeDias (dias: number): TramoDeAlerta {
  if (dias < 0) return 'vencido'
  if (dias === 0) return 'hoy'

  return 'proximo'
}

/**
 * Pasa el bloque `aviso` del cron al vocabulario de la banda.
 *
 * `final` y `temprano` son los dos umbrales del cron, no dos mensajes: los dos dicen "todavia no
 * vencio". Se funden en `proximo`, igual que hace el contador del calendario.
 *
 * @param aviso el bloque tal como lo devuelve `GET /me/vencimientos`
 * @returns el tramo y los dias con signo —negativos cuando ya vencio
 */
function desdeElCron (aviso: VencimientoParaAlerta['aviso']): { tramo: TramoDeAlerta, dias: number } {
  if (aviso.estado === 'vencido') return { tramo: 'vencido', dias: -Math.abs(aviso.dias_restantes) }
  if (aviso.estado === 'hoy') return { tramo: 'hoy', dias: 0 }

  return { tramo: 'proximo', dias: aviso.dias_restantes }
}

/**
 * Arma las alertas de plazo de las Licitaciones abiertas.
 *
 * Solo entran las **abiertas**: una ganada o perdida ya no tiene plazo que perder, y dejarlas
 * llenaria la banda de ruido historico que nadie puede accionar.
 *
 * Las Tareas se cruzan por `project.id` contra las Licitaciones abiertas. Una Tarea de un Espacio
 * normal no entra, y una Tarea de una Licitacion cerrada tampoco.
 *
 * @param licitaciones las filas de `GET /licitaciones`; se vuelve a filtrar por estado aca para que
 *   la funcion sea total y no dependa de que la consulta haya traido el filtro
 * @param vencimientos las filas de `GET /me/vencimientos`; lista vacia si el endpoint fallo
 * @param hoy dia de referencia, inyectable para pruebas
 * @returns las alertas ordenadas de la mas urgente a la menos, sin tope
 */
export function alertasDeLicitaciones (
  licitaciones: readonly LicitacionParaAlerta[],
  vencimientos: readonly VencimientoParaAlerta[],
  hoy: Date = new Date()
): AlertaDeLicitacion[] {
  const abiertas = new Map<number, LicitacionParaAlerta>()

  for (const licitacion of licitaciones) {
    if (licitacion.estado === 'abierta') abiertas.set(licitacion.id, licitacion)
  }

  const alertas: AlertaDeLicitacion[] = []

  for (const licitacion of abiertas.values()) {
    const dias = diasHasta(licitacion.espacio.deadline, hoy)

    if (dias === null || dias > DIAS_DE_AVISO_DE_VENCIMIENTO) continue

    alertas.push({
      clave: `vencimiento-${licitacion.id}`,
      licitacionId: licitacion.id,
      empresa: licitacion.company,
      motivo: 'vencimiento',
      detalle: licitacion.espacio.name,
      fecha: licitacion.espacio.deadline,
      tramo: tramoDeDias(dias),
      dias
    })
  }

  for (const proceso of vencimientos) {
    const licitacion = proceso.project === null ? undefined : abiertas.get(proceso.project.id)

    if (licitacion === undefined) continue

    const { tramo, dias } = desdeElCron(proceso.aviso)

    alertas.push({
      clave: `tarea-${proceso.id}`,
      licitacionId: licitacion.id,
      empresa: licitacion.company,
      motivo: proceso.milestone === null ? 'tarea' : 'fecha_clave',
      detalle: proceso.milestone === null ? proceso.name : proceso.milestone.name,
      fecha: proceso.due_date,
      tramo,
      dias
    })
  }

  // Lo mas urgente arriba. El desempate por empresa deja juntas las lineas de la misma Licitacion,
  // que es como se leen: "esta empresa tiene tres cosas encima", no tres lineas sueltas.
  return alertas.sort((una, otra) => (
    una.dias === otra.dias ? una.empresa.localeCompare(otra.empresa, 'es') : una.dias - otra.dias
  ))
}

/**
 * Cuenta las alertas por gravedad, para las insignias de la cabecera de la banda.
 *
 * @param alertas las alertas ya armadas
 * @returns las tres cuentas que dibuja el resumen
 */
export function contarAlertas (
  alertas: readonly AlertaDeLicitacion[]
): { vencidas: number, hoy: number, proximas: number } {
  let vencidas = 0
  let hoy = 0
  let proximas = 0

  for (const alerta of alertas) {
    if (alerta.tramo === 'vencido') vencidas += 1
    else if (alerta.tramo === 'hoy') hoy += 1
    else proximas += 1
  }

  return { vencidas, hoy, proximas }
}

/**
 * La frase corta de una alerta.
 *
 * Dice cuantos dias faltan y no la fecha: la fecha ya va al lado, y "en 2 dias" es lo que hace que
 * alguien reaccione. Misma redaccion que las alertas del calendario, para que el mismo plazo no se
 * lea de dos formas segun la pantalla.
 *
 * @param alerta la alerta a describir
 * @returns el texto de la insignia
 */
export function textoDeAlerta (alerta: AlertaDeLicitacion): string {
  if (alerta.tramo === 'vencido') {
    const dias = Math.abs(alerta.dias)

    return dias === 1 ? 'Venció ayer' : `Venció hace ${dias} días`
  }

  if (alerta.tramo === 'hoy') return 'Vence hoy'

  return alerta.dias === 1 ? 'Vence mañana' : `En ${alerta.dias} días`
}

/**
 * Las claves del interruptor de correo de Licitaciones que la API publica hoy.
 *
 * Devuelve una lista y no un booleano porque es lo que espera `FormularioDeAjustes`: con la clave
 * ausente la lista queda vacia y el formulario dibuja el aviso de "la API todavia no publica esta
 * opcion" en vez de un control que no guarda nada.
 *
 * @param ajustes el cuerpo de `GET /settings`
 * @returns `[AJUSTE_AVISOS_LICITACION]` si la instalacion la publica; vacio si no
 */
export function clavesDeAvisosDeLicitacion (ajustes: Ajustes): string[] {
  return AJUSTE_AVISOS_LICITACION in ajustes.editable ? [AJUSTE_AVISOS_LICITACION] : []
}
