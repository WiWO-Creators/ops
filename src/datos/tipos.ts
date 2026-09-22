/**
 * Tipos del contrato de la API v1.
 *
 * Los nombres de campo son los de Perfex, sin traducir: la traduccion ocurre una sola vez, al
 * presentar (ver `src/dominio/glosario.ts`). Este archivo describe la *forma* de las respuestas,
 * no los recursos de negocio — esos llegan con sus modulos.
 */
import type { Escalon } from '../dominio/escalon.ts'

/** Envelope de exito. `meta` se omite cuando esta vacio. */
export interface Sobre<T> {
  data: T
  meta?: Meta
}

export interface Meta {
  pagination?: Paginacion
}

export interface Paginacion {
  page: number
  per_page: number
  total: number
  total_pages: number
  /**
   * Resumen agregado, cuando el recurso lo trae. Lo traen las dos colas de correo —
   * `GET /notifications/mail-queue` y `GET /notifications/client-mail-queue`—, cada una con sus
   * estados y siempre sobre la cola entera, sin los filtros de la vista. Va DENTRO de `pagination` y
   * no como hermano en `meta` — así responde la API real, aunque el contrato lo documentó como
   * hermano; se corrigió el documento para que diga lo que se mide.
   *
   * Es una unión y no un solo tipo porque los estados no coinciden: quien lo lea estrecha con
   * `esResumenColaCliente()` (`src/dominio/correo-cliente.ts`) antes de contar nada.
   */
  summary?: ResumenDeCola
}

/** El resumen de cualquiera de las dos colas de correo. */
export type ResumenDeCola = ResumenColaCorreo | ResumenColaCorreoCliente

/** El resumen que viaja en `meta.pagination.summary` de `GET /notifications/mail-queue`. */
export interface ResumenColaCorreo {
  total: number
  pending: number
  sending: number
  sent: number
  failed: number
}

/**
 * El resumen de `GET /notifications/client-mail-queue`.
 *
 * Trae el estado del motor además de los conteos, y eso no es un adorno: una cola con filas
 * pendientes y `engine_enabled: false` es el estado correcto del sistema —no hay consumidor que la
 * vacíe—, así que sin estos dos campos la pantalla mostraría una cola atascada sin explicación.
 */
export interface ResumenColaCorreoCliente {
  total: number
  pendiente: number
  enviado: number
  error: number
  mode: string
  engine_enabled: boolean
}

/** Envelope de error. `details` solo viene en 422. */
export interface SobreError {
  error: {
    code: CodigoError
    message: string
    details?: Record<string, string[]>
  }
}

/**
 * Codigos del contrato. Los tres primeros son 401 y significan cosas distintas:
 * `token_expired` se resuelve refrescando, los otros dos obligan a entrar de nuevo.
 */
export type CodigoError =
  | 'unauthenticated'
  | 'token_expired'
  | 'token_revoked'
  | 'forbidden'
  | 'not_found'
  | 'validation_failed'
  | 'conflict'
  | 'rate_limited'
  | 'bad_request'
  | 'server_error'

export interface Staff {
  id: number
  email: string
  firstname: string
  lastname: string
  full_name: string
  profile_image_url: string | null
  is_admin: boolean
  /**
   * Rol propio, por encima de `is_admin` (`modules/wiwo_core/superadmin.php`). Gate de la seccion
   * Administracion. `is_admin` NO sirve para eso: la tiene medio equipo. Se otorga solo por SQL.
   */
  is_superadmin: boolean
  /**
   * Coordina varias áreas: **lee** la casa entera y escribe solo lo suyo y lo de su descendencia.
   *
   * No habilita ninguna pantalla por sí solo —no es `is_superadmin`— ni entrega escrituras —no es
   * `is_admin`—. Sirve para explicar por qué una fila que esta persona ve no la puede editar.
   */
  is_coordinador_multiarea: boolean
  role_id: number | null
  active: boolean
  /** Cargo "Director" (`modules/wiwo_core/cargos_areas.php`). Gate de la seccion "Mi Área". */
  is_director: boolean
  /**
   * Si dirige al menos un área del organigrama (`tblareas.jefe_staffid`, `Organigrama::areasQueDirige()`).
   *
   * **No es un permiso y no reemplaza a `is_director`**: conviven. El cargo Director es la regla
   * vieja —"ve a los de su área"— y esto es el árbol de `tblareas`, que además baja por toda la
   * descendencia. Existe porque sin él el panel no sabía que a esta persona le corresponde el
   * tablero del equipo: quien dirige un área pero no tiene ni el cargo ni `staff.view` se quedaba
   * sin pedirlo, aunque la API se lo hubiera dado.
   *
   * Confundirlos es el error caro y ya se cometió una vez: hoy las 184 cuentas de producción llevan
   * el cargo "Staff", así que **`is_director` no lo tiene nadie**. Todo lo que dependa del
   * organigrama —la entrada de la barra lateral, entre otras cosas— se decide con esta bandera.
   */
  dirige_areas: boolean
  /**
   * Area y empresa de quien mira. Pertenencia, no permiso.
   *
   * Viajan en `/me` para no tener que pedir `/staff/{id}` solo para saber a que grupo pertenece uno
   * mismo, que es lo que hace falta para acotar cosas por pertenencia — las salas, por ejemplo.
   */
  area_id: number | null
  /**
   * Todas las áreas a las que pertenece, no sólo la principal (`staff_areas`, multiárea).
   *
   * Conviven con `area_id` porque la columna de `tblstaff` es una sola y sigue siendo la principal:
   * la tabla nueva es la que admite varias. Quien tiene área puede tenerla en cualquiera de las dos,
   * así que preguntar por una sola deja gente afuera — ver `puedeVerMiArea()`.
   *
   * Opcional: una API vieja que todavía no la manda deja el campo en `undefined`, no en `[]`.
   */
  area_ids?: number[]
  empresa_id: number | null
}

/** Forma reducida que viaja embebida en `assignees`, `followers` y `members`. */
export interface StaffReferencia {
  id: number
  full_name: string
  profile_image_url: string | null
}

export type Capacidad = 'view' | 'create' | 'edit' | 'delete' | 'create_milestones' | 'edit_milestones'

/**
 * Las áreas de permisos que el producto usa de verdad.
 *
 * `leads` entra acá porque la API la devuelve en `permissions` y las licitaciones se apoyan en ella;
 * no estaba antes porque el catálogo viejo tenía doce áreas y nadie sabía cuáles miraba el panel.
 */
export type AreaPermiso = 'tasks' | 'projects' | 'customers' | 'staff' | 'leads'

/** Respuesta de `GET /me`. */
export interface Yo extends Staff {
  /**
   * Lo que la persona puede hacer en cada área.
   *
   * Desde el modelo de dos ejes es **constante para todo el que no sea administrador**: la matriz por
   * persona desapareció y el recorte ya no se hace por capacidad sino por filas —lo suyo y lo de su
   * descendencia en el árbol—, que es trabajo de la API. Sigue viniendo porque es lo que decide si
   * se dibuja un botón; dejó de ser lo que decide cuánto se ve.
   */
  permissions: Record<AreaPermiso, Capacidad[]>
  /**
   * El escalón jerárquico de quien mira (`tblwiwo_escalon_persona.escalon`).
   *
   * **Nombra el puesto y no otorga nada**: el alcance sale del árbol de personas. Ver
   * `dominio/escalon.ts`, que es la única lista de los cuatro escalones en el frontend.
   */
  escalon: Escalon
  /**
   * De quién cuelga en el árbol (`tblstaff.jefe_staffid`), o `null` si no cuelga de nadie.
   *
   * Es la primera de las dos fuentes del alcance; la otra es la jefatura de área. No es un permiso:
   * lo que hace es decir dónde está la persona, y de ahí sale hacia abajo qué le corresponde ver.
   */
  jefe_staffid: number | null
  /**
   * Si de esta persona cuelga alguien: por la cadena de jefes o por dirigir un área.
   *
   * Lo resuelve la API recorriendo el árbol, que es donde está la verdad. **No se deduce del
   * escalón**: un `director` sin nadie debajo no es jefatura de nadie, y confundir el nombre del
   * puesto con el alcance real es el error que este modelo vino a cerrar.
   */
  es_jefatura: boolean
  /**
   * Si quien mira figura como focal de al menos un Cliente (`tblwiwo_focales`).
   *
   * **Pertenencia, no permiso**: no abre nada por sí solo. La autorización de la pantalla de Focals
   * es y sigue siendo el `403` de la API (`V1::scoresRuta()`), que la resuelve en cada pedido. Esto
   * existe sólo para decidir si se OFRECE la sección, que antes se adivinaba con `nivel` — y el
   * escalón y el hecho de ser focal son dos cosas distintas: hay focales de tres cuentas de escalón
   * `staff`, y gerencias que no responden por ninguna.
   *
   * Opcional a propósito: una API vieja que todavía no lo manda lo deja en `undefined`, y
   * `puedeVerFocals()` trata ese caso como "no sé" y muestra la entrada, que es como estaba antes.
   */
  es_focal?: boolean
  /**
   * Ruta del panel de mantenimiento, o ausente para casi todo el mundo.
   *
   * **La API la manda sólo a quien entra**, y manda la RUTA en vez de una bandera a propósito: con
   * un booleano, el camino tendría que estar escrito en el bundle, y un bundle se lee abriendo las
   * herramientas del navegador. Así el navegador no lo trae, lo recibe.
   *
   * No es la seguridad: la puerta real es el 404 de la API. Esto sólo decide si se monta el oyente
   * del atajo y a dónde lleva.
   */
  atajo?: string
  secciones_habilitadas: string[]
  locale: string
}

/**
 * El par de tokens.
 *
 * `staff` viene en login y en 2fa, pero **no en refresh**: ahi la API devuelve solo los tokens,
 * porque quien refresca ya sabe de quien es la sesion. Por eso es opcional, y por eso el staffId se
 * pasa aparte al armar la sesion.
 */
export interface ParDeTokens {
  access_token: string
  expires_in: number
  refresh_token: string
  refresh_expires_in: number
  staff?: Staff
}

/** Lo que devuelven login y 2fa: el par mas el staff. */
export interface ParDeTokensConStaff extends ParDeTokens {
  staff: Staff
}

/** Respuesta de login cuando la cuenta tiene segundo factor. */
export interface DesafioSegundoFactor {
  two_factor_required: true
  challenge_token: string
  method: 'email' | 'app'
}

export function esDesafio (dato: ParDeTokensConStaff | DesafioSegundoFactor): dato is DesafioSegundoFactor {
  return 'two_factor_required' in dato
}

/**
 * Lo que responde `GET /auth/google`: si la entrada con Google esta prendida y con que aplicacion.
 *
 * El `client_id` viene de la API y no de una variable de entorno del front a proposito: es editable
 * desde el panel de administracion, asi que cambiarlo no puede exigir un redespliegue. Cuando
 * `enabled` es `false` el `client_id` llega en `null` y la pantalla de acceso ni carga el script de
 * Google.
 */
export interface AccesoGoogle {
  enabled: boolean
  client_id: string | null
}

/**
 * Permisos del portal del cliente.
 *
 * No son los del panel: un contacto no tiene capacidades (`view`/`edit`/...) sino secciones enteras
 * habilitadas o no. El mapa vive en `tblcontact_permissions` y lo fija Perfex en codigo.
 */
export type PermisoPortal =
  | 'invoices'
  | 'estimates'
  | 'contracts'
  | 'proposals'
  | 'support'
  | 'projects'

/** El contacto de cliente autenticado, tal como lo devuelve `/auth/portal/login`. */
export interface ContactoPortal {
  id: number
  client_id: number
  firstname: string
  lastname: string
  full_name: string
  email: string
  phonenumber: string | null
  title: string | null
  is_primary: boolean
  last_login: string | null
  direction: string | null
}

/** Lo que devuelve el login del portal: el par mas el contacto. */
export interface ParDeTokensConContacto extends ParDeTokens {
  contact: ContactoPortal
}

/** El Proyecto al que cae el contacto al entrar, cuando su cliente tiene uno elegido. */
export interface ProyectoDeEntrada {
  id: number
  name: string
}

/** `/portal/me`: el contacto mas lo que puede ver. */
export interface YoPortal extends ContactoPortal {
  permissions: PermisoPortal[]
  /** Secciones vivas para este contacto. El portal arma su navegacion con esto, no adivinando. */
  secciones_habilitadas: string[]
  /**
   * A donde cae este contacto al entrar, o `null` si cae en el Inicio del portal.
   *
   * Lo elige el equipo por cliente, desde la ficha del Cliente en el panel. Llega ya resuelto: la
   * API comprueba en cada llamada que el Proyecto siga vivo, siga siendo de ese cliente y que este
   * contacto lo vea, asi que un valor no nulo es siempre una pantalla que se puede abrir.
   *
   * Lo consume `POST /api/sesion`, que es el unico momento en que se aplica: despues de entrar, el
   * contacto navega su portal como siempre y la portada vuelve a ser la portada.
   */
  proyecto_de_entrada: ProyectoDeEntrada | null
  locale: string
}

/** `/portal/company`: los datos de la empresa del contacto. */
export interface EmpresaPortal {
  id: number
  company: string
  vat: string | null
  phonenumber: string | null
  website: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  country_id: number
  default_language: string | null
  date_created: string | null
  /** Solo presentes si el contacto es primario y la opcion esta habilitada en Perfex. */
  billing?: DireccionPortal
  shipping?: DireccionPortal
}

export interface DireccionPortal {
  street: string | null
  city: string | null
  state: string | null
  zip: string | null
  country: string | null
}
