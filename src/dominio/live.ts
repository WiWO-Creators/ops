/**
 * Reglas de LIVE que no dependen de React ni de la red.
 *
 * Dos preguntas: **hasta donde ve** quien mira, y **que se le dice** cuando el medidor no arranca.
 * Las dos se prueban sin montar nada (`pruebas/live.test.js`).
 */
import { puedeVerSeccion } from './permisos.ts'
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
 * `project_id` y `task_id`, la misma peticion abre la jornada y arranca el cronometro, asi que puede
 * fallar por la Tarea y no por la jornada. La jornada no queda abierta: la API la descarta. El texto
 * nombra el destino porque es lo que la persona tiene que cambiar; decir "no se pudo abrir la
 * jornada (403)" la dejaria buscando en el lugar equivocado.
 *
 * El `422` tiene dos causas —falta uno de los dos, o la Tarea no es de ese Proyecto— y el texto
 * nombra la segunda: la primera no puede llegar desde esta interfaz, que no deja apretar el boton
 * sin los dos elegidos.
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
    if (estado === 403) return 'No puedes medir tiempo sobre eso. Elige otra Tarea.'
    if (estado === 404) return 'Eso ya no existe o no lo puedes ver. Elige otra Tarea.'
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
