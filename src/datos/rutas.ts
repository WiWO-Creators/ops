/**
 * Lista blanca de prefijos que el BFF acepta reenviar.
 *
 * El BFF es un proxy con el token de la persona adosado: sin lista blanca, cualquier ruta que la API
 * exponga hoy o mañana queda alcanzable desde el navegador. Se enumera lo que el frontend usa, y
 * nada mas.
 *
 * `auth` no esta y no debe estar: los tokens se manejan en `/api/sesion`, que es el unico lugar que
 * los ve.
 *
 * Hay una lista por sujeto, no una sola con todo adentro. La API ya impide que un contacto resuelva
 * un token contra las rutas del panel, pero eso es una barrera del otro lado de la red: si esta
 * lista fuera comun, el BFF reenviaria igual y confiaria en que la API diga que no. Dos listas
 * hacen que el pedido ni salga.
 */
import type { Sujeto } from './sobre-sesion'

const PREFIJOS_PERMITIDOS = [
  'me',
  'lookups',
  'custom-fields',
  'staff',
  'clients',
  // Contactos de un cliente: el alta cuelga de `clients/{id}/contacts`, pero editar y borrar cuelgan
  // de `contacts/{id}`, asi que hace falta el prefijo propio.
  'contacts',
  'projects',
  // Prospectos: el listado, la ficha, la edicion, el borrado y el subrecurso `contactos`. La lista
  // es por PREFIJO, asi que esta entrada cubre `prospectos/{id}/contactos/{cid}` sin una segunda.
  // NO es `/leads`: aquel es el embudo heredado de Perfex, que no tiene pantalla en este panel y
  // por eso tampoco entrada aca.
  'prospectos',
  // Licitaciones: el listado, la ficha, la edicion y las acciones de ganar y perder. Prefijo propio
  // porque la API las cuelga de su raiz aunque por dentro una Licitacion sea un Espacio. Sin esta
  // entrada el BFF contesta 404 a todo lo que la pantalla pide desde el navegador —buscar, filtrar,
  // paginar, crear, ganar y perder— y solo funciona la primera pagina que resuelve el servidor.
  'licitaciones',
  // Upselling: el listado, la ficha, la edicion y las acciones de ganar y perder. Prefijo propio
  // por el mismo motivo que `licitaciones`. **No esta en la lista del portal y no debe estarlo**:
  // un upsell abierto es justamente lo que el cliente no tiene que ver.
  'upsells',
  // Plantillas de Espacio. Prefijo propio y no bajo `projects` porque la API las cuelga de su propia
  // raiz: `POST /projects/from-template` devuelve un Espacio y por eso vive alla, pero el CRUD de la
  // plantilla es `/project-templates`.
  'project-templates',
  // Cubre tambien `tasks/{id}/share`, los tres verbos del enlace publico. La lista es por PREFIJO:
  // un subrecurso nuevo de `tasks` no necesita entrada propia. Lo que NO esta —ni debe estar— es
  // `public`: `GET /public/tasks/{token}` es anonimo, y el BFF solo existe para adosar el token de
  // una persona. Esa ruta la pide el Server Component directo contra la API, igual que `/sala`.
  'tasks',
  // frente: detalle — subrecursos del detalle de Proyecto (contrato secciones 2 y 5).
  'milestones',
  'timesheets',
  'discussions',
  'notes',
  // `tickets` no esta: el soporte se atiende en wiwo.center y el panel ya no monta ninguna
  // pantalla que lo pida. Si algun dia vuelve, vuelve aca.
  // Salas de reunion y sus reservas: la API las cuelga todas de `rooms`, asi que una sola entrada
  // cubre el listado de salas, la agenda, el alta y la cancelacion.
  'rooms',
  'contracts',
  'expenses',
  'invoices',
  'estimates',
  // Descarga de adjuntos. No estaba porque hasta ahora la API no tenia esa ruta y toda `url` que
  // emitia era un 404; con el endpoint de descarga ya existe y el panel puede usarla.
  'files',
  // Drill-down del arbol de carpetas de Drive (`GET /drive/{folder_id}`). `clients` y `projects` ya
  // cubren `/clients/{id}/drive` y `/projects/{id}/drive`; este prefijo propio es solo para pedir un
  // nivel mas del arbol al expandir una carpeta.
  'drive',
  // Avisos: campana, preferencias y —solo para quien administra— el interruptor de correo y los dos
  // visores de cola: `/mail-queue` (la de Perfex) y `/client-mail-queue` (la del motor de correo al
  // cliente, que no vacia nadie). La API ya filtra las tres por superadmin; el BFF solo decide si la
  // ruta existe, no quien puede pisarla.
  'notifications',
  // Ajustes de la instalacion (`GET /settings`, `PATCH /settings`). La API ya exige admin del otro
  // lado —la comprobacion vive junto a la whitelist de claves, en `Escritura\Ajuste::escribir()`—;
  // el BFF solo decide si la ruta existe, no quien puede pisarla. El portal no la lleva: un contacto
  // no configura la instalacion.
  'settings',
  // Presets personales de filtro de los tableros kanban (tareas e hitos). Privados por staff del
  // lado de la API; el portal no tiene tableros y no los necesita.
  'filter-presets',
  // Capa de IA: resumen del Inicio, chat del Espacio e interpretacion de un alta. No esta en la
  // lista del portal y no debe estarlo: el contexto que arma el modelo se recorta con la
  // visibilidad del staff, y un contacto no tiene ninguna. Ademas es la unica ruta que gasta
  // dinero por pedido, asi que la superficie se mantiene lo mas chica posible.
  'ia',
  // Centro de auditoria (`/auditoria`). Tres prefijos y no uno porque asi los expone la API:
  //   - `presence`: el latido lo manda TODO el panel, no solo esta pantalla, asi que tiene que
  //     poder salir del navegador. Escribir solo cuenta donde esta uno; leer la lista entera exige
  //     superadministracion del otro lado.
  //   - `sessions`: sesiones abiertas y suplantaciones vivas.
  //   - `audit`: el historial de `tblactivity_log`. Ya existia en la API y no estaba aca porque no
  //     habia pantalla que lo pidiera; sin esta entrada la tabla no puede paginar ni filtrar desde
  //     el navegador, solo pintar la primera pagina que resuelve el servidor.
  // Lo que NO entra —ni debe— es `impersonate`: su respuesta es un par de tokens, y dejarla al
  // alcance del JavaScript es exactamente lo unico que este proxy existe para evitar.
  'presence',
  'sessions',
  'audit',
  // LIVE: la jornada propia (`/me/jornada` ya entra por `me`), el tablero del equipo y la detencion
  // de un medidor de Espacio historico (`DELETE /projects/{id}/timer`, que entra por `projects`; su
  // `POST` responde 422 desde que no hay registros sin Tarea). Solo falta `live`, que la API
  // cuelga de su propia raiz. Sin esta entrada el BFF contesta 404 al tablero y el panel del equipo
  // se queda con la unica pagina que resolvio el servidor, sin refrescarse nunca.
  // Salud de un Cliente y de un Espacio: el semaforo de 0 a 100 con su historico. Prefijo propio
  // porque la API los cuelga de su raiz (`/scores`, `/scores/{id}`) y no del recurso puntuado.
  'scores',
  'live',
  // El organigrama de areas (`/jerarquia`): leerlo y reacomodarlo desde la pantalla de jefaturas.
  // Raiz propia porque asi lo expone la API, y por el mismo motivo que `/me/mi-area` no cuelga de
  // `/staff`: dirigir un area no otorga `staff.view`, y un jefe sin ese permiso tiene que poder
  // ordenar a su gente igual. Quien manda sobre que area lo decide la API, no esta lista.
  'jerarquia'
] as const

/**
 * Lo unico que el portal del cliente necesita.
 *
 * `portal` cubre todos sus recursos, que la API agrupa bajo ese prefijo. `files` es la descarga de
 * adjuntos, que es compartida y se autoriza por sujeto del lado de la API.
 */
const PREFIJOS_PORTAL = ['portal', 'files'] as const

/**
 * Prefijos que sirven a los dos sujetos.
 *
 * Solo la descarga de adjuntos: la API la expone fuera de `/portal` porque las URLs que ya venia
 * emitiendo apuntan ahi, y decide a quien le responde mirando el token. Como el prefijo no dice de
 * quien es el pedido, el BFF tampoco puede deducirlo de la ruta y tiene que mirar que sesion hay.
 */
const PREFIJOS_COMPARTIDOS = ['files'] as const

/** `true` si esta ruta puede venir de cualquiera de los dos sujetos. */
export function rutaCompartida (segmentos: string[]): boolean {
  const primero = segmentos[0]

  return primero !== undefined && (PREFIJOS_COMPARTIDOS as readonly string[]).includes(primero)
}

/**
 * Decide si el BFF puede reenviar una ruta.
 *
 * @param segmentos Los segmentos de la ruta pedida, ya separados. Ej: `['tasks', '512', 'comments']`.
 * @param sujeto De quien es la sesion que pide. Cada uno tiene su lista.
 * @returns `true` si el primer segmento esta en la lista blanca de ese sujeto y ningun segmento
 *          intenta escalar.
 */
export function rutaPermitida (segmentos: string[], sujeto: Sujeto = 'staff'): boolean {
  const primero = segmentos[0]

  if (primero === undefined) return false

  // `..` o vacios en el medio saldrian de la lista blanca al normalizar la URL.
  if (segmentos.some((s) => s === '' || s === '.' || s === '..')) return false

  const permitidos: readonly string[] = sujeto === 'contacto' ? PREFIJOS_PORTAL : PREFIJOS_PERMITIDOS

  return permitidos.includes(primero)
}

export { PREFIJOS_PERMITIDOS, PREFIJOS_PORTAL, PREFIJOS_COMPARTIDOS }
