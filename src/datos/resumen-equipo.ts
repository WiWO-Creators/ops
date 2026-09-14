/**
 * El resumen del día del equipo: lo que el cron escribe a las 20:00 y esta pantalla lee.
 *
 * Un módulo aparte de `datos/live.ts` porque contesta otra pregunta. LIVE mira el AHORA —quién tiene
 * la jornada abierta y sobre qué está midiendo en este minuto— y se repregunta cada treinta
 * segundos; esto mira un DÍA YA CERRADO y no cambia nunca más. Mezclarlos obligaría a que el tablero
 * en vivo cargara tipos de un histórico que no usa.
 *
 * === EL DESGLOSE VIENE CALCULADO ===
 *
 * Ni un solo número se suma acá. `segundos` por persona, por Espacio y por Proceso salen del backend
 * (`Escritura\ResumenDelEquipo::calcular()`), que es el único que puede recortar cada cronómetro al
 * día sin equivocarse con los que cruzan la medianoche. Esta pantalla formatea y ordena lo que
 * recibe.
 *
 * === `texto` PUEDE SER `null`, Y ES NORMAL ===
 *
 * Es el párrafo que escribe el modelo, y sólo existe si la IA estaba encendida cuando el cron corrió.
 * Con `ia_habilitada` en `'0'` —que es como se mergea la capa de IA— el resumen llega entero y sin
 * párrafo. La pantalla no puede tratar eso como un error: el desglose es el resumen, el párrafo es un
 * agregado.
 */

/** Un Espacio o un Proceso con el tiempo que se le midió. `id` en `null` es "sin Espacio". */
export interface ItemDelResumen {
  id: number | null
  nombre: string
  segundos: number
  /** Sólo en los Procesos: de qué Espacio cuelga. */
  espacio?: string
}

/** Una persona del día, con el detalle de dónde puso las horas. */
export interface PersonaDelResumen {
  staff_id: number
  nombre: string
  segundos: number
  espacios: ItemDelResumen[]
  procesos: ItemDelResumen[]
}

/** Alguien que no marcó el inicio de su jornada ese día. */
export interface AusenteDelResumen {
  staff_id: number
  nombre: string
}

/**
 * El desglose completo del día.
 *
 * `personas_activas` es quién midió tiempo y `jornadas_abiertas` cuánta gente abrió jornada: los dos
 * números juntos son el dato, porque "seis personas midieron" se lee muy distinto si ese día
 * abrieron jornada seis o veinte.
 *
 * `ausentes` es la otra mitad y llega opcional a propósito: los resúmenes guardados antes de que
 * existiera la lista no la traen, y un día viejo tiene que seguir abriéndose sin romper la pantalla.
 */
export interface DetalleDelResumen {
  total_segundos: number
  personas_activas: number
  jornadas_abiertas: number
  personas: PersonaDelResumen[]
  espacios: ItemDelResumen[]
  ausentes?: AusenteDelResumen[]
}

/** El resumen guardado de un día. */
export interface ResumenDeEquipo {
  dia: string
  generado_en: string
  /** El párrafo del modelo, o `null` si la IA estaba apagada. */
  texto: string | null
  personas: number
  total_segundos: number
  /** Cuándo salió el correo a las jefaturas; `null` mientras el interruptor esté apagado. */
  enviado_en: string | null
  enviados: number
  detalle: DetalleDelResumen
}

/** El encabezado de un día anterior, para el selector. */
export interface DiaConResumen {
  dia: string
  generado_en: string
  personas: number
  total_segundos: number
  con_ia: boolean
}

/**
 * Lo que devuelve `GET /live/resumen-equipo`.
 *
 * `resumen` en `null` no es un error: es un día que todavía no tiene resumen, y `dias` sigue trayendo
 * los que sí lo tienen para poder salir de ahí con un clic.
 */
export interface PantallaDelResumen {
  resumen: ResumenDeEquipo | null
  dias: DiaConResumen[]
}

/** Ruta de la API para un día, o para el último si no se pide ninguno. */
export function rutaDelResumen (dia?: string | null): string {
  return dia ? `/live/resumen-equipo?dia=${encodeURIComponent(dia)}` : '/live/resumen-equipo'
}

/**
 * Segundos en `5h 30m`.
 *
 * No se usa `formatearDuracion()` de `componentes/proyecto/cronometro`: aquella es un reloj corriendo
 * (`5:30:12`) y los segundos importan mientras el cronómetro avanza. Acá el día ya terminó y el
 * segundo no dice nada, así que se muestra lo que se lee de un vistazo.
 *
 * Por debajo del minuto devuelve `<1m` y no `0h 0m`: un cronómetro que alguien arrancó y detuvo de
 * inmediato existió, y `0h 0m` se lee como "no hay dato".
 */
export function horasYMinutos (segundos: number): string {
  if (!Number.isFinite(segundos) || segundos <= 0) return '0h 0m'

  const total = Math.floor(segundos)

  if (total < 60) return '<1m'

  return `${Math.floor(total / 3600)}h ${Math.floor((total % 3600) / 60)}m`
}

/**
 * Qué porcentaje del total representa una parte, de 0 a 100.
 *
 * Un total en cero devuelve 0 en vez de `NaN`: un día sin trabajo tiene barras vacías, no barras
 * rotas. Se redondea al entero porque el número alimenta un `width` en porcentaje y una barra no
 * distingue dos decimales.
 */
export function proporcion (parte: number, total: number): number {
  if (!Number.isFinite(parte) || !Number.isFinite(total) || total <= 0) return 0

  return Math.min(100, Math.max(0, Math.round((parte / total) * 100)))
}
