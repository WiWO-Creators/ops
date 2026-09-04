import type { Ajustes } from '../datos/recursos.ts'
import type { ResumenColaCorreoCliente, ResumenDeCola } from '../datos/tipos.ts'

/**
 * Reglas del motor de correo al cliente, sin nada de React ni de Next.
 *
 * Vive aparte de la pantalla porque es lo unico de esta feature que merece prueba: el motor viene
 * apagado y **no hay ningun consumidor que vacie la cola**, asi que lo que la pantalla afirma sobre
 * el estado del motor es la unica proteccion contra creer que se mando un correo que nunca salio.
 * Node puede ejecutar este archivo tal cual (`pruebas/correo-cliente.test.js`), que es la razon por
 * la que no importa nada del framework.
 */

/**
 * La clave del grupo `correo` de `Escritura\Ajuste::EDITABLES` que gobierna el motor.
 *
 * Enumerada aca y no suelta por la pantalla: es el contrato con la API —una clave mal escrita es un
 * 422 con `no_editable`, no un campo que se ignora—, igual que `AJUSTES_GOOGLE` en `acceso.ts`.
 *
 * `wiwo_correo_cliente_destino_prueba` no esta y no debe estar: el backend la dejo fuera de la
 * whitelist a proposito, porque sin consumidor no hay nada que redirigir.
 */
export const AJUSTE_MODO_CORREO_CLIENTE = 'wiwo_correo_cliente_modo'

/** Los tres valores del enum, en el orden en que se muestran. Espeja `CorreoAlCliente::MODOS`. */
export const MODOS_CORREO_CLIENTE = ['apagado', 'prueba', 'real'] as const

export type ModoCorreoCliente = (typeof MODOS_CORREO_CLIENTE)[number]

/** `true` si el valor es uno de los tres modos conocidos. */
export function esModoCorreoCliente (valor: unknown): valor is ModoCorreoCliente {
  return typeof valor === 'string' && (MODOS_CORREO_CLIENTE as readonly string[]).includes(valor)
}

/**
 * El modo guardado, o `null` si la API todavia no publica la opcion con el tipo esperado.
 *
 * `null` no es un caso raro: mientras el board no despliegue la migracion `0130`, `editable` no trae
 * la clave y la pantalla tiene que decirlo en vez de dibujar un selector que no se puede guardar.
 * Tambien devuelve `null` ante un valor desconocido —un `prueba_larga` escrito a mano en
 * `tbloptions`—: elegir uno de los tres por defecto mostraria un modo que no es el que rige.
 */
export function modoGuardado (ajustes: Ajustes): ModoCorreoCliente | null {
  const ajuste = ajustes.editable[AJUSTE_MODO_CORREO_CLIENTE]

  if (ajuste === undefined || ajuste.type !== 'enum') return null

  return esModoCorreoCliente(ajuste.value) ? ajuste.value : null
}

/**
 * Los modos que la API acepta hoy, en el orden de `MODOS_CORREO_CLIENTE`.
 *
 * Se cruza el dominio que publica la API (`options`) con los tres conocidos: un modo que el backend
 * agregue y esta pantalla no sepa explicar no se dibuja —seria un boton sin texto que lo justifique—,
 * y uno que el backend quite deja de ofrecerse aunque siga escrito aca.
 */
export function modosDisponibles (ajustes: Ajustes): ModoCorreoCliente[] {
  const publicados = ajustes.editable[AJUSTE_MODO_CORREO_CLIENTE]?.options

  if (publicados === undefined) return []

  return MODOS_CORREO_CLIENTE.filter((modo) => publicados.includes(modo))
}

/** `true` si el resumen es el de la cola de correo al cliente y no el de `tblmail_queue`. */
export function esResumenColaCliente (resumen: ResumenDeCola): resumen is ResumenColaCorreoCliente {
  return 'mode' in resumen
}

/**
 * Lo que la pantalla tiene que decir sobre el motor, en dos frases.
 *
 * Es la pieza con prueba de esta feature. Hoy **ningun modo envia**: la cola no la vacia nadie, asi
 * que un `mode: 'real'` no significa que salio un correo, y decir "encendido" a secas invitaria a
 * creer justamente eso. Por eso el detalle repite en los tres casos que no hay consumidor, y el
 * titulo cambia solo para que quien administra vea que interruptor esta tocando.
 *
 * @param resumen el bloque `meta.pagination.summary` de `GET /notifications/client-mail-queue`
 * @returns titulo corto y detalle; el detalle nombra cuantas filas quedaron sin enviar
 */
export function avisoDelMotor (resumen: ResumenColaCorreoCliente): { titulo: string, detalle: string } {
  const pendientes = resumen.pendiente === 1
    ? 'Hay 1 fila pendiente y va a seguir ahí.'
    : `Hay ${resumen.pendiente} filas pendientes y van a seguir ahí.`

  const titulo = resumen.engine_enabled
    ? `El motor está en modo «${resumen.mode}», pero igual no envía`
    : 'El motor está apagado'

  return {
    titulo,
    detalle: `Ningún correo sale de esta cola: todavía no existe el proceso que la vacía. Las filas son la ` +
      `intención de escribirle a un contacto, anotada al generar su enlace de acceso al portal. ${pendientes}`
  }
}
