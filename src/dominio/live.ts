/**
 * Reglas de LIVE que no dependen de React ni de la red.
 *
 * Seis preguntas: **hasta donde ve** quien mira, **que se le dice** cuando el medidor no arranca,
 * **si hoy ya dijo que no** a abrir la jornada, **si quiere que se le recuerde** asignar el destino
 * despues de abrirla, **que opciones quedan** cuando busca en un combo, y **como se cuenta** una
 * jornada que corre sin destino. Todas se prueban sin montar nada (`pruebas/live.test.js`): a las dos
 * que se apoyan en `localStorage` se les pasa el almacenamiento —y el dia, la que lo lleva— asi que
 * tampoco necesitan un navegador ni dependen del reloj de quien corre las pruebas.
 */
import { esJefatura } from './escalon.ts'
import { GLOSARIO } from './glosario.ts'
import { puedeVerSeccion } from './permisos.ts'
import { normalizar } from './salas.ts'
import type { ClienteDeJornada, EstadoDeJornada } from '@/datos/live'
import type { Yo } from '@/datos/tipos'

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
 * Donde queda anotado que esta persona no quiere volver a ver el recordatorio de asignar destino.
 *
 * === POR QUE NO LLEVA EL DIA, Y POR QUE SI LLEVA EL `staffId` ===
 *
 * Al reves que la marca de posponer, esta decision es para siempre: quien marca "no volver a
 * mostrarme esto" lo dice del aviso entero y no del martes. Por eso la clave no lleva fecha —una que
 * caducara a medianoche convertiria la casilla en una mentira, y a la semana siguiente la persona
 * estaria desmarcandola otra vez sin entender por que volvio— y por eso hace falta un sitio donde
 * volver a encenderla: la casilla del control de la cabecera.
 *
 * El `staffId` esta por el mismo motivo que en la marca de posponer: en un equipo compartido, dos
 * cuentas en el mismo navegador no pueden heredar una decision que no tomaron.
 *
 * === LA PREFERENCIA ES DEL NAVEGADOR, NO DE LA CUENTA ===
 *
 * Vive en `localStorage` y no en la API porque no hay donde ponerla del lado del servidor: `/settings`
 * son los ajustes de la instalacion y `/me/perfil` guarda identidad y firma, no gustos. La
 * consecuencia esta asumida y es deliberada: quien silencie el recordatorio en su computador lo
 * volvera a ver desde otro equipo, desde otro navegador, o despues de limpiar los datos del sitio.
 * Es un recordatorio y no un permiso, asi que el precio de que reaparezca alguna vez sale mas barato
 * que el de un endpoint de preferencias personales que hoy no existe.
 *
 * @param staffId de quien es la decision
 * @returns la clave con la que leer, escribir y borrar la marca
 */
export function claveDeRecordatorioDeDestino (staffId: number): string {
  return `wiwo:recordatorio-destino:v1:${staffId}`
}

/**
 * Si hay que mostrarle el recordatorio de asignar destino a esta persona.
 *
 * Lo guardado es el **silencio** y no el consentimiento, asi que la ausencia de marca significa "se
 * muestra". Al reves —guardar "quiero verlo"— el estado de fabrica seria el silencio, y quien entrara
 * por primera vez no veria nunca el aviso que esto existe para dar.
 *
 * Un fallo degrada a `true` por el mismo criterio que `jornadaPospuestaHoy()`: con el almacenamiento
 * bloqueado lo unico que se pierde es la memoria de la preferencia, y de las dos degradaciones
 * posibles la que muestra de mas se corrige en un clic, mientras que la que calla para siempre
 * esconde el aviso sin que nadie lo haya pedido.
 *
 * @param almacenamiento normalmente `window.localStorage`
 * @param staffId de quien es la decision
 * @returns `true` salvo que conste la marca de silencio de esta persona
 */
export function recordatorioDeDestinoActivo (
  almacenamiento: Almacenamiento,
  staffId: number
): boolean {
  try {
    return almacenamiento.getItem(claveDeRecordatorioDeDestino(staffId)) === null
  } catch {
    return true
  }
}

/**
 * Enciende o apaga el recordatorio para esta persona.
 *
 * Una sola funcion para los dos sentidos y no dos: la casilla del aviso y la del control de la
 * cabecera escriben la MISMA preferencia, y con una funcion por sentido el dia que la clave cambie
 * una de las dos se queda escribiendo en la vieja.
 *
 * @param almacenamiento normalmente `window.localStorage`
 * @param staffId de quien es la decision
 * @param activo `true` para volver a mostrarlo, `false` para no mostrarlo mas
 * @returns `false` si el navegador no dejo guardar la preferencia; la decision vale igual en esta pestana
 */
export function fijarRecordatorioDeDestino (
  almacenamiento: Almacenamiento,
  staffId: number,
  activo: boolean
): boolean {
  try {
    if (activo) almacenamiento.removeItem(claveDeRecordatorioDeDestino(staffId))
    else almacenamiento.setItem(claveDeRecordatorioDeDestino(staffId), MARCA_PUESTA)

    return true
  } catch {
    return false
  }
}

/**
 * Las opciones donde aparece TODO lo que se escribio en el buscador de un combo.
 *
 * `normalizar` —el mismo de la agenda de salas— saca acentos y mayusculas antes de comparar: sin eso
 * "nunez" no encuentra "Núñez" ni "logistica" encuentra "Logística", y quien busca concluye que su
 * Proyecto no esta en la lista. Nadie escribe los acentos al filtrar; es el caso normal, no el borde.
 *
 * Se parte lo escrito en palabras y cada una tiene que aparecer en ALGUNO de los textos de la
 * opcion, en cualquier orden: "campaña consalud" encuentra la campaña aunque "Consalud" venga del
 * Cliente y no del nombre. Cada palabra se busca dentro de un texto, nunca a caballo entre dos, para
 * que el final del nombre y el principio del Cliente no inventen una coincidencia.
 *
 * Busca por subcadena y no por prefijo porque los nombres del catalogo empiezan casi todos igual
 * ("Proyecto ACME", "Proyecto DELCO"): con prefijo habria que escribir el nombre entero para llegar
 * a lo que lo distingue. Una busqueda vacia —o de solo espacios— devuelve todo.
 *
 * @param opciones la lista completa, tal como llego de la API
 * @param busqueda lo tipeado
 * @param textosDe los textos donde se busca en cada opcion; los ausentes o `null` se saltan
 * @returns las que coinciden, en el mismo orden en que llegaron
 */
export function filtrarPorPalabras <T> (
  opciones: readonly T[],
  busqueda: string,
  textosDe: (opcion: T) => ReadonlyArray<string | null | undefined>
): T[] {
  const palabras = normalizar(busqueda).split(/\s+/).filter((palabra) => palabra !== '')

  if (palabras.length === 0) return [...opciones]

  return opciones.filter((opcion) => {
    const textos = textosDe(opcion)
      .filter((texto): texto is string => typeof texto === 'string' && texto !== '')
      .map(normalizar)

    return palabras.every((palabra) => textos.some((texto) => texto.includes(palabra)))
  })
}

/**
 * Las opciones cuyo nombre contiene todas las palabras buscadas. Ver `filtrarPorPalabras`.
 *
 * @param opciones la lista completa, tal como llego de la API
 * @param busqueda lo tipeado
 * @returns las que coinciden, en el mismo orden en que llegaron
 */
export function filtrarPorNombre <T extends { name: string }> (opciones: readonly T[], busqueda: string): T[] {
  return filtrarPorPalabras(opciones, busqueda, (opcion) => [opcion.name])
}

/** Lo minimo de un Espacio que el combo de la jornada muestra y busca. */
interface EspacioDelCombo {
  id: number
  name: string
  patente?: string | null
  client: { company: string } | null
}

/**
 * El identificador visible de un Espacio: su patente, o `#id` mientras el backend no le asigne una.
 *
 * Los nombres se repiten entre Clientes ("Campaña septiembre" hay varias); la patente no, y es lo
 * que la gente dicta y anota. Por eso va siempre, aunque sea el `#id` de respaldo.
 *
 * @param espacio el Espacio
 * @returns la patente, o `#` y el id
 */
export function identificadorDeEspacio (espacio: Pick<EspacioDelCombo, 'id' | 'patente'>): string {
  const patente = espacio.patente?.trim() ?? ''

  return patente !== '' ? patente : `#${espacio.id}`
}

/**
 * Los Espacios del combo de la jornada que coinciden con lo buscado.
 *
 * Se busca en la patente, el nombre y el Cliente a la vez: el mismo nombre existe en varios
 * Clientes, y lo que la persona tiene en la cabeza suele ser "la campaña de Consalud" o el codigo
 * `CNSA-001`, no el nombre exacto del Espacio. Se busca la patente real y no el `#id` de respaldo:
 * ese numero no lo conoce nadie.
 *
 * @param espacios la lista completa, tal como llego de la API
 * @param busqueda lo tipeado
 * @returns los que coinciden, en el mismo orden en que llegaron
 */
export function filtrarEspaciosDelCombo <T extends EspacioDelCombo> (espacios: readonly T[], busqueda: string): T[] {
  return filtrarPorPalabras(espacios, busqueda, (espacio) => [
    espacio.patente,
    espacio.name,
    espacio.client?.company
  ])
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
 * es `is_director`: el cargo Director no otorga capabilities de Perfex, asi que `permissions` nunca
 * lo delata. Ya no es la misma llave que la de "Mi Área" —esa pasó a ser la pertenencia a un area,
 * ver `puedeVerMiArea()`—: aca se pregunta por quien MANDA en un area, no por quien pertenece a
 * ella, y pertenecer no da derecho al tablero de los demas.
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
 * **Al abrir ya no queda nada mas que traducir.** Hubo un tiempo en que esta ventana mandaba el
 * destino dentro del cuerpo, y entonces la misma peticion podia fallar por el destino y no por la
 * jornada: el 403, el 404 y el 422 hablaban del Proyecto o de la Tarea. La apertura dejo de pedir
 * destino —el cuerpo sale vacio— asi que lo unico que la API puede objetar ahora es que el dia ya
 * este abierto. Aquellos textos se fueron con el camino que los producia: conservarlos mandaria a
 * revisar un combo que la ventana ya no tiene.
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
 * Por qué no se pudo prorrogar el cierre de la jornada.
 *
 * Separado de `mensajeDeFalloDeJornada()` porque los mismos códigos dicen otra cosa acá: el 404 no
 * es "no existe" sino "tu día ya se cerró", y el 409 no es "ya tienes una abierta" sino "el cierre
 * automático se apagó mientras tenías el aviso a la vista". Meterlos en la misma función obligaría a
 * un tercer parámetro para distinguir tres caminos, que es como se llega a mensajes cruzados.
 *
 * Los dos casos que no son un error de verdad —el día ya cerrado y el interruptor apagado— se
 * escriben en indicativo y sin culpar a nadie: en los dos el aviso desaparece a continuación, y lo
 * único que hace falta es que quien lo estaba leyendo entienda por qué.
 *
 * @param estado código HTTP de la respuesta; `0` si la petición no llegó a salir
 * @returns el mensaje a mostrar; nunca vacío
 */
export function mensajeDeFalloDeProrroga (estado: number): string {
  if (estado === 0) return 'No se pudo contactar al servidor. Revisa la conexión.'

  if (estado === 404) return 'Tu jornada ya está cerrada. Ábrela otra vez si sigues trabajando.'

  if (estado === 409) return 'El cierre automático está apagado: tu jornada ya no se cierra sola.'

  return `No se pudo alargar la jornada (el servidor respondió ${estado}).`
}

/**
 * Si a esta persona le corresponde el resumen del equipo de las 20:00.
 *
 * Espeja la regla de la API (`Escritura\ResumenDelEquipo`), que responde **403** a quien no manda a
 * nadie. Existe para no ofrecer un enlace que lleva a una pantalla sin permiso: esconder no autoriza
 * —la compuerta es la API— pero enseñarle una puerta cerrada a media empresa tampoco informa a nadie.
 *
 * Dos llaves y no una: el rol de sistema y el escalón son ejes independientes. Un administrador ve
 * todas las filas aunque no conduzca a nadie, y una jefatura ve a su gente sin ser administradora.
 * El escalón lo resuelve `esJefatura()` de `dominio/escalon.ts`, que es la única lista de los cuatro.
 *
 * @param yo quien mira, tal como lo devolvió `GET /me`
 * @returns `true` para administración y para los escalones de conducción
 */
export function recibeElResumenDelEquipo (yo: Pick<Yo, 'is_admin' | 'is_superadmin' | 'escalon'>): boolean {
  return yo.is_admin || yo.is_superadmin || esJefatura(yo.escalon)
}

/**
 * El Cliente de la jornada abierta, leido sin confiar en que venga.
 *
 * Tres cosas distintas llegan a `null` por este camino y a proposito se tratan igual: que no haya
 * jornada abierta, que la API sea vieja y no mande el campo, y que la jornada no tenga Cliente. Para
 * quien pinta la cabecera las tres son lo mismo —no hay nombre que mostrar— y distinguirlas ahi
 * significaria tres ramas para el mismo pixel.
 *
 * @param estado el estado del dia tal como llega de `GET /me/jornada`, o `null` si no se pudo leer
 * @returns el Cliente con su nombre, o `null`
 */
export function clienteDeJornada (estado: EstadoDeJornada | null): ClienteDeJornada | null {
  return estado?.open?.client ?? null
}

/**
 * Si la jornada esta abierta y no hay nada midiendose contra ella.
 *
 * Es el estado que las dos salidas nuevas crean, y el que la cabecera tiene que delatar: el reloj del
 * dia corre y ningun cronometro lo cubre, asi que ese rato no se le esta imputando a nada. No es un
 * error —abrir asi es una eleccion valida— pero tiene que verse, porque la alternativa es que alguien
 * descubra al cerrar el dia que ocho horas no tienen destino.
 *
 * No mira el Cliente: un Cliente no es un destino. Contra el no se mide tiempo, asi que una jornada
 * con Cliente y sin cronometro sigue siendo tiempo sin imputar.
 *
 * @param estado el estado del dia, o `null` si no se pudo leer
 * @returns `true` solo cuando consta que hay jornada abierta y ningun medidor corriendo
 */
export function jornadaSinDestino (estado: EstadoDeJornada | null): boolean {
  return estado?.open != null && estado.timer === null
}

/**
 * Como se le cuenta a la persona que su jornada corre sin destino.
 *
 * El tono es deliberado. La frase anterior —"las horas de tu jornada se estan yendo sin cubrir"— es
 * exacta y es un reproche, y el pedido fue justamente que la ventana dejara de ser intrusiva. Esta
 * dice el mismo hecho en presente y sin culpa: el dia corre, el cronometro todavia no. Lo que falta
 * se nombra como algo que queda por hacer, no como algo que se hizo mal.
 *
 * Nombra al Cliente cuando lo hay porque es la mitad que la persona SI resolvio, y esconderlo le
 * daria a la jornada con Cliente el mismo aviso que a la que se abrio en blanco.
 *
 * @param cliente el Cliente de la jornada, o `null` si no tiene o si no se pudo leer
 * @returns la frase lista para mostrar; nunca vacia
 */
export function fraseDeJornadaSinDestino (cliente: ClienteDeJornada | null): string {
  const espacio = GLOSARIO.espacio.singular.toLowerCase()

  if (cliente === null) {
    return `Tu jornada corre sin ${espacio} ni ${GLOSARIO.cliente.singular.toLowerCase()} todavía.`
  }

  return `Tu jornada corre para ${cliente.name}, sin ${espacio} todavía.`
}

/**
 * Traduce el fallo de fijar, cambiar o quitar el Cliente de la jornada.
 *
 * Aparte de `mensajeDeFalloDeJornada()` porque contesta otra pregunta. Ese habla de abrir y cerrar el
 * dia; este habla de un campo de un dia que ya esta abierto, y sus codigos significan otra cosa: el
 * `409` no es "ya tienes una jornada" sino "no tienes ninguna", y el `422` no es un comentario de
 * cierre demasiado largo sino un Cliente que ya no esta.
 *
 * Ese `422` es el unico que esta interfaz puede provocar: el `client_id` sale de un combo, asi que no
 * puede ir con basura, y el `PATCH` siempre manda la clave —un `PATCH` sin `client_id` es 422
 * `requerido`, no un borrado silencioso, y por eso quitar el Cliente se escribe `client_id: null`
 * explicito—.
 *
 * @param estado codigo HTTP de la respuesta; `0` si la peticion no llego a salir
 * @returns el mensaje a mostrar; nunca vacio
 */
export function mensajeDeFalloDeCliente (estado: number): string {
  if (estado === 0) return 'No se pudo contactar al servidor. Revisa la conexión.'
  if (estado === 409) return 'No tienes ninguna jornada abierta a la que ponerle un Cliente.'
  if (estado === 422) return 'Ese Cliente ya no existe o está en la papelera. Elige otro.'

  return `No se pudo guardar el Cliente de la jornada (el servidor respondió ${estado}).`
}
