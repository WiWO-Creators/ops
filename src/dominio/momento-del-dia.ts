/**
 * Que hora es en la oficina, y que se dice a esa hora.
 *
 * Es lo unico que necesita la escena `momento`: un reloj en grande y una linea que cambia tres veces
 * al dia. Vive aparte de `pantalla-area.ts` porque no tiene nada que ver con el guion —no pagina, no
 * mide frescura, no lee la URL— y porque es lo que hay que poder probar pasandole una hora inventada,
 * sin esperar a que sean las 13:00 de verdad.
 *
 * === LAS DOS FUENTES DE TIEMPO, Y POR QUE SON DISTINTAS ===
 *
 * El instante viene del navegador (`Date.now()`, que la pantalla pasa como `ahora`) y la **zona**
 * viene de la API (`meta.timezone`, hoy `America/Santiago`). No es lo mismo y la diferencia es la
 * razon de ser de este archivo: un televisor barato acierta el instante —lo sincroniza contra un
 * servidor de hora en cuanto se enchufa a la red— y falla la zona, que arrastra la que le dejo puesta
 * quien lo configuro, a menudo UTC. Con la zona de la API y el instante del aparato, las 13:00 de
 * este archivo son las 13:00 de la oficina aunque el televisor crea que son las 16:00.
 *
 * Por eso **sin zona no hay franja**: `franjaDelMomento()` devuelve `null` mientras `meta` no haya
 * llegado, y la escena no se muestra. Adivinar con el reloj del aparato seria decirle "buenos dias" a
 * una oficina a las seis de la tarde, que es peor que no decir nada.
 *
 * Todo lo de aca es puro: entra un instante y una zona, sale una franja. Ni un `Date.now()` implicito.
 */

/**
 * Una franja del dia con su mensaje.
 *
 * `desde` y `hasta` son horas locales `HH:MM` de la zona del negocio, **nunca** instantes: una franja
 * no es un momento del calendario sino una hora del dia, y vale todos los dias por igual.
 */
export interface FranjaDelDia {
  /**
   * Identidad estable de la franja.
   *
   * Viaja dentro del id de la escena (`momento#apertura`), que es lo que hace que la rotacion se
   * entere de que el mensaje cambio: ver `firmaDelGuion` en `pantalla-area.ts`.
   */
  clave: string
  /** Hora local de inicio, `HH:MM`. **Incluida** en la franja. */
  desde: string
  /** Hora local de fin, `HH:MM`. **Excluida** de la franja; ver el docblock de `franjaDelMomento`. */
  hasta: string
  /** La linea grande, debajo del reloj. */
  titulo: string
  /** La linea de apoyo. Una sola frase. */
  apoyo: string
}

/**
 * Las tres franjas del dia, en orden.
 *
 * === POR QUE TRES Y NO UNA POR HORA ===
 *
 * Son los tres momentos en que una pared puede decir algo util sin interrumpir: cuando la gente llega,
 * cuando se levanta a almorzar y cuando se va. El resto del dia la pantalla no tiene nada que aportar
 * con un reloj, y por eso fuera de franja la escena **sale del guion** en vez de ocupar la rotacion
 * con un reloj mudo.
 *
 * Los horarios salen del pedido del equipo y de como funciona la jornada en este producto: la jornada
 * es una entidad real que la persona abre al llegar y cierra al irse, asi que las franjas de las 09:00
 * y de las 18:00 no son un saludo decorativo — son el recordatorio de las dos unicas acciones que, si
 * no se hacen, dejan el registro del dia incompleto.
 *
 * La de almuerzo dura una hora entera y las otras dos media: a las 09:00 y a las 18:00 la gente pasa
 * por delante de la pantalla en un rato corto y concentrado, y al mediodia se va escalonada.
 *
 * === EL TONO ===
 *
 * Breve, calido y sin levantar la voz, como el resto de la pantalla ("Ningún cronómetro corriendo",
 * "La pantalla se actualiza sola en cuanto vuelva"). Sin signos de exclamacion y sin emoji: esto se
 * lee a cuatro metros durante meses, y lo que en un mensaje suena simpatico, colgado en una pared todo
 * el año suena a cartel.
 */
export const FRANJAS_DEL_DIA: readonly FranjaDelDia[] = [
  {
    clave: 'apertura',
    desde: '09:00',
    hasta: '09:30',
    titulo: 'Buenos días',
    apoyo: 'Abre tu jornada y parte el día.'
  },
  {
    clave: 'almuerzo',
    desde: '13:00',
    hasta: '14:00',
    titulo: 'Hora de almuerzo',
    apoyo: 'Pausa lo que estés midiendo y tómate el rato.'
  },
  {
    clave: 'cierre',
    desde: '18:00',
    hasta: '18:30',
    titulo: 'Buen cierre',
    apoyo: 'Cierra tu jornada antes de irte.'
  }
]

/** Cuantos minutos tiene un dia. El techo de una hora `HH:MM` valida. */
const MINUTOS_DEL_DIA = 24 * 60

/**
 * Que franja corresponde a este instante en esta zona, o `null` si ninguna.
 *
 * === EL BORDE: LAS 09:30:00 ESTAN FUERA ===
 *
 * El intervalo es **cerrado por abajo y abierto por arriba**: `[desde, hasta)`. A las 09:00:00 la
 * franja empieza; a las 09:30:00 ya termino.
 *
 * No es una preferencia: es lo unico que permite que dos franjas pegadas —una que termina a las 14:00
 * y otra que empieza a las 14:00— no se solapen ni dejen un minuto sin nadie. Con el borde superior
 * incluido, el minuto de las 14:00 pertenecria a las dos y ganaria la primera de la lista, que es una
 * regla que nadie adivina leyendo la constante. Ademas coincide con como se lee: "de 9 a 9:30" no
 * incluye las 9:30, igual que una reunion de 9 a 9:30 termina a las 9:30.
 *
 * Se compara al MINUTO y no al segundo porque es lo que la pantalla muestra: el reloj dice 09:30 y el
 * mensaje ya no esta, que es coherente. Los sesenta segundos del minuto 09:30 estan todos fuera.
 *
 * @param ahora   instante en milisegundos (el `Date.now()` del navegador), o `null` antes de hidratar
 * @param zona    zona IANA que manda la API en `meta.timezone`, o `null` si todavia no llego
 * @param franjas las franjas a considerar; por defecto las del negocio
 * @returns la franja vigente —la MISMA referencia del arreglo, para que quien la memorice no repinte
 *          cada segundo— o `null` si no hay ninguna, si falta la zona o si la zona no se entiende
 */
export function franjaDelMomento (
  ahora: number | null,
  zona: string | null,
  franjas: readonly FranjaDelDia[] = FRANJAS_DEL_DIA
): FranjaDelDia | null {
  const minutos = minutosEnLaZona(ahora, zona)

  if (minutos === null) return null

  for (const franja of franjas) {
    const desde = minutosDeHora(franja.desde)
    const hasta = minutosDeHora(franja.hasta)

    // Una franja mal escrita se ignora en vez de romper la pantalla: es una constante que alguien va
    // a editar algun dia, y un `hasta` anterior al `desde` no puede dejar el televisor en blanco.
    if (desde === null || hasta === null || hasta <= desde) continue

    if (minutos >= desde && minutos < hasta) return franja
  }

  return null
}

/**
 * Los minutos transcurridos del dia local, 0 a 1439.
 *
 * Se resuelve con `Intl` y no con `getHours()` porque `getHours()` contesta en la zona del aparato,
 * que es justo la que no se puede creer. Una zona que el motor no reconoce lanza `RangeError`: se
 * atrapa y se devuelve `null`, porque una pantalla no puede caerse por un dato de configuracion.
 *
 * @param ahora instante en milisegundos, o `null`
 * @param zona  zona IANA, o `null`
 * @returns los minutos del dia en esa zona, o `null` si falta un dato o la zona no se entiende
 */
export function minutosEnLaZona (ahora: number | null, zona: string | null): number | null {
  if (ahora === null || zona === null || zona === '' || !Number.isFinite(ahora)) return null

  try {
    // `hourCycle: 'h23'` y no `hour12: false`: con `hour12` algunos motores devuelven "24" a
    // medianoche, y 24*60 caeria fuera del dia.
    const partes = new Intl.DateTimeFormat('es-CL', {
      timeZone: zona,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date(ahora))

    const hora = Number(partes.find((parte) => parte.type === 'hour')?.value)
    const minuto = Number(partes.find((parte) => parte.type === 'minute')?.value)

    if (!Number.isInteger(hora) || !Number.isInteger(minuto)) return null

    const total = hora * 60 + minuto

    return total >= 0 && total < MINUTOS_DEL_DIA ? total : null
  } catch {
    // Zona inventada o un motor sin la base de datos de husos. La escena no se muestra y el resto de
    // la pantalla sigue funcionando.
    return null
  }
}

/**
 * La hora de pared, `HH:MM`, en la zona del negocio.
 *
 * La usan el reloj de la cabecera y el reloj grande de la escena `momento`: una sola funcion para que
 * los dos digan lo mismo hasta el minuto, que en una pared donde se ven a la vez es lo minimo.
 *
 * @param ahora instante en milisegundos, o `null` antes de hidratar
 * @param zona  zona IANA de la API, o `null` para dejar que formatee en la del aparato
 * @returns la hora ya formateada, o `--:--` mientras no haya instante
 */
export function horaDeReloj (ahora: number | null, zona: string | null): string {
  if (ahora === null || !Number.isFinite(ahora)) return '--:--'

  const opciones: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }

  if (zona !== null && zona !== '') opciones.timeZone = zona

  try {
    return new Intl.DateTimeFormat('es-CL', opciones).format(new Date(ahora))
  } catch {
    // Misma razon que arriba: una zona que no se entiende no puede apagar el reloj de la pared.
    return new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .format(new Date(ahora))
  }
}

/**
 * El dia de hoy escrito largo: "lunes 21 de septiembre".
 *
 * Lo usa la portada, que es la escena que nombra el area y no cuenta nada mas. Una pared que dice el
 * dia sirve para algo que suena tonto hasta que falta: confirmar de un vistazo que lo que se esta
 * mirando es de HOY. Un televisor colgado que se quedo pegado hace dos dias se ve exactamente igual
 * que uno al dia, y esta es la unica linea de la pantalla que delata la diferencia sin esperar a que
 * cambie un contador.
 *
 * Va en la zona del negocio y no en la del aparato, por lo mismo que el reloj: un televisor barato
 * tiene el reloj mal a menudo y a veces en UTC, y a las nueve de la noche eso ya es otro dia.
 *
 * @param ahora instante en milisegundos, o `null` antes de hidratar
 * @param zona  zona IANA de la API, o `null` para dejar que formatee en la del aparato
 * @returns el dia ya formateado, o una cadena vacia mientras no haya instante
 */
export function diaDeCalendario (ahora: number | null, zona: string | null): string {
  if (ahora === null || !Number.isFinite(ahora)) return ''

  const opciones: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }

  if (zona !== null && zona !== '') opciones.timeZone = zona

  try {
    return new Intl.DateTimeFormat('es-CL', opciones).format(new Date(ahora))
  } catch {
    // Misma razon que en `horaDeReloj()`: una zona que no se entiende no puede apagar la portada.
    return new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
      .format(new Date(ahora))
  }
}

/**
 * `HH:MM` a minutos del dia.
 *
 * @param hora la hora local escrita en la constante
 * @returns los minutos, o `null` si la cadena no tiene esa forma o se sale del dia
 */
function minutosDeHora (hora: string): number | null {
  const encaje = /^(\d{2}):(\d{2})$/.exec(hora)

  if (encaje === null) return null

  const horas = Number(encaje[1])
  const minutos = Number(encaje[2])

  if (horas > 23 || minutos > 59) return null

  return horas * 60 + minutos
}
