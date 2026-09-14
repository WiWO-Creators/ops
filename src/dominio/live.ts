/**
 * Reglas de LIVE que no dependen de React ni de la red.
 *
 * Cuatro preguntas: **hasta donde ve** quien mira, **que se le dice** cuando el medidor no arranca,
 * **si hoy ya dijo que no** a abrir la jornada, y **que opciones quedan** cuando busca en un combo. Las tres se prueban sin montar nada
 * (`pruebas/live.test.js`): a la de la jornada pospuesta se le pasan el almacenamiento y el dia, asi
 * que tampoco necesita un navegador ni depende del reloj de quien corre las pruebas.
 */
import { puedeVerSeccion } from './permisos.ts'
import { normalizar } from './salas.ts'
import type { EstadoDeJornada } from '@/datos/live'
import type { NivelPermiso, Yo } from '@/datos/tipos'

/**
 * Si hay que exigirle a esta persona que abra su jornada antes de dejarla usar el panel.
 *
 * === POR QUE `null` NO BLOQUEA ===
 *
 * `null` es "no se pudo leer", no "no hay jornada". Bloquear ahi seria adivinar: quien ya tiene la
 * jornada abierta se quedaria frente a un velo por un fallo de la API, sin poder abrir nada porque
 * el 409 le diria que ya la tiene. Un backend caido no puede sacar a media empresa del sistema.
 *
 * Lo contrario —dejar pasar a alguien que no la abrio porque la API tardo— se corrige solo: el
 * control repregunta cada `intervaloDeLive()` segundos y la compuerta aparece en cuanto hay dato.
 *
 * @param estado el estado de la jornada tal como llega de `GET /me/jornada`, o `null` si no se pudo leer
 * @returns `true` solo cuando consta que no hay jornada abierta
 */
export function faltaAbrirJornada (estado: EstadoDeJornada | null): boolean {
  return estado !== null && estado.open === null
}

/**
 * Lo que hace falta de `localStorage` para anotar la decision. Un objeto asi se finge en las pruebas
 * sin montar un navegador, que es la unica forma de probar tambien el caso en que lanza.
 */
type Almacenamiento = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Lo que se guarda: la clave ya dice todo, el valor solo tiene que existir. */
const MARCA_PUESTA = '1'

/**
 * Donde queda anotado que hoy se pospuso la apertura de la jornada.
 *
 * La clave lleva el dia y el `staffId`, y cada uno arregla un problema distinto. El dia hace que la
 * marca caduque sola a la medianoche: manana la jornada se vuelve a exigir sin que nadie tenga que
 * acordarse de borrar nada, que es justo lo que un booleano suelto no daria. El `staffId` impide que
 * dos cuentas en el mismo navegador —el equipo compartido, o quien entra con otra sesion para revisar
 * algo— hereden una decision que no tomaron.
 *
 * @param staffId de quien es la decision
 * @param dia el dia en curso en `YYYY-MM-DD`, en la hora local del negocio (`hoyLocal()`)
 * @returns la clave con la que leer, escribir y borrar la marca
 */
export function claveDeJornadaPospuesta (staffId: number, dia: string): string {
  return `wiwo:jornada-pospuesta:v1:${staffId}:${dia}`
}

/**
 * Si hoy ya se pospuso la apertura y no hay que volver a exigirla.
 *
 * === POR QUE UN FALLO DEVUELVE `false` Y NO PROPAGA ===
 *
 * En una ventana privada —o con el almacenamiento del sitio bloqueado— el solo hecho de tocar
 * `localStorage` lanza. Lo unico que se pierde ahi es la memoria de la decision, asi que el fallo
 * degrada a "no se acuerda": la ventana vuelve a aparecer, y quien no quiera abrir la jornada la
 * vuelve a cerrar. Dejar escapar la excepcion, en cambio, se lleva por delante la cabecera entera,
 * que es un precio desproporcionado para un recordatorio.
 *
 * @param almacenamiento normalmente `window.localStorage`
 * @param staffId de quien es la decision
 * @param dia el dia en curso en `YYYY-MM-DD`
 * @returns `true` solo si consta la marca de HOY para esta persona
 */
export function jornadaPospuestaHoy (
  almacenamiento: Almacenamiento,
  staffId: number,
  dia: string
): boolean {
  try {
    return almacenamiento.getItem(claveDeJornadaPospuesta(staffId, dia)) !== null
  } catch {
    return false
  }
}

/**
 * Anota que por hoy no se vuelve a exigir la apertura.
 *
 * @param almacenamiento normalmente `window.localStorage`
 * @param staffId de quien es la decision
 * @param dia el dia en curso en `YYYY-MM-DD`
 * @returns `false` si el navegador no dejo guardarla; la decision vale igual en esta pestana
 */
export function posponerJornadaPorHoy (
  almacenamiento: Almacenamiento,
  staffId: number,
  dia: string
): boolean {
  try {
    almacenamiento.setItem(claveDeJornadaPospuesta(staffId, dia), MARCA_PUESTA)
    return true
  } catch {
    return false
  }
}

/**
 * Borra la marca del dia. Se llama cuando la jornada se abre de verdad: posponer era "todavia no", y
 * una marca que sobreviva a la apertura silenciaria la exigencia del dia en que la jornada se cierre
 * y haya que volver a abrirla.
 *
 * @param almacenamiento normalmente `window.localStorage`
 * @param staffId de quien era la decision
 * @param dia el dia en curso en `YYYY-MM-DD`
 * @returns `false` si el navegador no dejo borrarla
 */
export function olvidarJornadaPospuesta (
  almacenamiento: Almacenamiento,
  staffId: number,
  dia: string
): boolean {
  try {
    almacenamiento.removeItem(claveDeJornadaPospuesta(staffId, dia))
    return true
  } catch {
    return false
  }
}

/**
 * Las opciones cuyo nombre coincide con lo que se escribio en el buscador de un combo.
 *
 * `normalizar` —el mismo de la agenda de salas— saca acentos y mayusculas antes de comparar: sin eso
 * "nunez" no encuentra "Núñez" ni "logistica" encuentra "Logística", y quien busca concluye que su
 * Proyecto no esta en la lista. Nadie escribe los acentos al filtrar; es el caso normal, no el borde.
 *
 * Busca por subcadena y no por prefijo porque los nombres del catalogo empiezan casi todos igual
 * ("Proyecto ACME", "Proyecto DELCO"): con prefijo habria que escribir el nombre entero para llegar
 * a lo que lo distingue. Una busqueda vacia —o de solo espacios— devuelve todo.
 *
 * @param opciones la lista completa, tal como llego de la API
 * @param busqueda lo tipeado
 * @returns las que coinciden, en el mismo orden en que llegaron
 */
export function filtrarPorNombre <T extends { name: string }> (opciones: T[], busqueda: string): T[] {
  const buscado = normalizar(busqueda)

  if (buscado === '') return opciones

  return opciones.filter((opcion) => normalizar(opcion.name).includes(buscado))
}

/** Hasta donde llega el tablero de quien mira. Es la traduccion de `meta.scope` de `GET /live`. */
export type AlcanceDeLive = 'todo' | 'subordinados' | 'area' | 'propio'

/**
 * Que parte del equipo puede ver esta persona en el tablero.
 *
 * Espeja la regla que aplica la API en `GET /live`, y existe para **no pedir el tablero** a quien
 * solo se ve a si mismo: esa persona ya tiene su jornada y su medidor en el control de la cabecera,
 * y una peticion mas por intervalo para repetirle su propia fila no le agrega nada.
 *
 * La llave del alcance total es la misma que la de la seccion Equipo (`staff.view`), mas
 * `is_superadmin`, que la tiene aunque Perfex no le haya dado la capacidad. La del alcance por area
 * es `is_director`, igual que "Mi Área": el cargo Director no otorga capabilities de Perfex, asi que
 * `permissions` nunca lo delata.
 *
 * `dirige_areas` va ANTES que `is_director` y es lo que arregla el caso que faltaba: quien dirige un
 * area del organigrama (`tblareas.jefe_staffid`) pero no tiene el cargo Director ni `staff.view` caia
 * en `propio`, y esta pantalla ni le pedia el tablero — aunque la API se lo hubiera dado entero. Las
 * dos llaves conviven porque son dos cosas distintas: el arbol de areas y el cargo de antes.
 *
 * Esconder no autoriza: quien fuerce `/live` recibe de la API el alcance que le corresponde, no el
 * que diga esta funcion. `meta.scope` es la verdad; esto solo decide que se dibuja. Y al reves
 * tampoco quita nada: esta funcion solo puede AMPLIAR lo que se pide, nunca recortar el piso que el
 * nivel de la persona ya le da.
 *
 * @param yo la sesion de quien mira (`GET /me`)
 * @returns `todo` para el equipo entero, `subordinados` para su rama del organigrama, `area` para su
 *          area, `propio` para nadie mas que uno mismo
 */
export function alcanceDeLive (yo: Yo): AlcanceDeLive {
  if (yo.is_superadmin || puedeVerSeccion(yo.permissions.staff, 'staff')) return 'todo'
  if (yo.dirige_areas) return 'subordinados'
  if (yo.is_director) return 'area'

  return 'propio'
}

/**
 * Traduce el fallo de arrancar o detener el medidor a una frase que se entienda.
 *
 * El `409` al arrancar es el caso que da nombre al modulo: la API lo devuelve tanto por no haber
 * jornada abierta como por haber ya un medidor corriendo, y no distingue. La interfaz resuelve el
 * primer caso antes de llegar aca —ofrece abrir la jornada y reintentar— asi que este texto es el
 * que queda cuando ese reintento tampoco alcanzo, y por eso nombra las dos causas.
 *
 * `0` es el fallo de red: `fetch` no llego a tener respuesta y no hay codigo que mostrar.
 *
 * @param estado codigo HTTP de la respuesta; `0` si la peticion no llego a salir
 * @param arrancando `true` si el fallo fue al arrancar, `false` al detener
 * @returns el mensaje a mostrar; nunca vacio
 */
export function mensajeDeFalloDeMedidor (estado: number, arrancando: boolean): string {
  if (estado === 0) return 'No se pudo contactar al servidor. Revisa la conexión.'

  if (estado === 403) {
    return arrancando
      ? 'No puedes medir tiempo sobre esto.'
      : 'Solo puedes detener tu propio medidor.'
  }

  if (estado === 409) {
    return arrancando
      ? 'No se pudo arrancar: hace falta una jornada abierta, o ya tienes un medidor corriendo.'
      : 'No tienes ningún medidor corriendo.'
  }

  if (estado === 404) return 'Eso ya no existe o no lo puedes ver.'

  return `No se pudo ${arrancando ? 'arrancar' : 'detener'} el medidor (el servidor respondió ${estado}).`
}

/**
 * Lo mismo para la jornada.
 *
 * Su `409` no es ambiguo —o ya hay una abierta, o no hay ninguna que cerrar— y casi siempre significa
 * que la pantalla quedo vieja: otra pestaña ya hizo el cambio. Por eso el texto invita a mirar de
 * nuevo en vez de a reintentar.
 *
 * **`403`, `404` y `422` solo aparecen al abrir con destino.** Desde que `POST /me/jornada` recibe
 * el destino, la misma peticion abre la jornada y arranca el medidor, asi que puede fallar por el
 * destino y no por la jornada. La jornada no queda abierta: la API la descarta. El texto nombra el
 * destino porque es lo que la persona tiene que cambiar; decir "no se pudo abrir la jornada (403)"
 * la dejaria buscando en el lugar equivocado.
 *
 * El `403` y el `404` nombran los dos niveles y no solo la Tarea: desde que la Tarea es opcional se
 * puede abrir contra el Proyecto entero, y ahi el que no existe o no es suyo es el Proyecto.
 *
 * El `422` tiene tres causas —falta el Proyecto, el `task_id` vino con basura, o la Tarea no es de
 * ese Proyecto— y el texto nombra la tercera: las otras dos no pueden llegar desde esta interfaz,
 * que no deja apretar el boton sin Proyecto y manda el `task_id` solo cuando se eligio uno.
 *
 * @param estado codigo HTTP de la respuesta; `0` si la peticion no llego a salir
 * @param abriendo `true` si el fallo fue al abrir, `false` al cerrar
 * @returns el mensaje a mostrar; nunca vacio
 */
export function mensajeDeFalloDeJornada (estado: number, abriendo: boolean): string {
  if (estado === 0) return 'No se pudo contactar al servidor. Revisa la conexión.'

  if (estado === 409) {
    return abriendo
      ? 'Ya tienes una jornada abierta.'
      : 'No tienes ninguna jornada abierta.'
  }

  if (abriendo) {
    if (estado === 403) return 'No puedes medir tiempo sobre eso. Elige otro Proyecto o Tarea.'
    if (estado === 404) return 'Eso ya no existe o no lo puedes ver. Elige otro Proyecto o Tarea.'
    if (estado === 422) return 'Esa Tarea no pertenece al Proyecto que elegiste. Vuelve a elegir.'
  }

  // Al cerrar, el unico 422 que la API puede devolver a esta pantalla es el comentario pasado de
  // largo: el instante de cierre lo sella el servidor y nunca se manda desde aca. El `maxLength`
  // del campo lo hace practicamente inalcanzable, pero un mensaje que dice "respondio 422" no le
  // deja nada que hacer a quien igual llegue.
  if (!abriendo && estado === 422) {
    return 'El comentario del día es demasiado largo. Acórtalo y vuelve a intentar.'
  }

  return `No se pudo ${abriendo ? 'abrir' : 'cerrar'} la jornada (el servidor respondió ${estado}).`
}

/**
 * Los escalones que reciben el resumen del equipo de las 20:00.
 *
 * Espeja la regla de la API (`Escritura\ResumenDelEquipo`), que responde **403** a quien no está en
 * la lista. Existe para no ofrecer un enlace que lleva a una pantalla sin permiso: esconder no
 * autoriza —la compuerta es la API— pero enseñarle una puerta cerrada a media empresa tampoco
 * informa a nadie.
 *
 * `lider` queda fuera a propósito: conduce un equipo, no la casa, y el resumen es de toda ella.
 * `focal` tampoco, que además ya no es un escalón sino una relación con clientes.
 */
const JEFATURAS: readonly NivelPermiso[] = ['head', 'gerente', 'admin', 'superadmin']

/**
 * Si a esta persona le corresponde ver el resumen del equipo.
 *
 * @param nivel el escalón que resolvió la API en `GET /me`
 * @returns `true` para jefaturas
 */
export function esJefatura (nivel: NivelPermiso): boolean {
  return JEFATURAS.includes(nivel)
}
