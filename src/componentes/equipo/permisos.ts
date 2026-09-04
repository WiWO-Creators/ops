/**
 * Permisos individuales de una persona: nombres en español y la logica de la matriz.
 *
 * Vive en un `.ts` y no dentro del dialogo por la regla de `docs/convenciones.md`: Node despoja los
 * tipos de un `.ts` pero no el JSX, asi que solo lo que esta fuera del componente se puede probar. Y
 * lo que hay aca decide que se guarda en `tblstaff_permissions`, que no es un detalle de pintura.
 *
 * El modelo de la API, que es lo que explica la forma de estas funciones:
 *
 *   - El acceso efectivo vive **solo** en `tblstaff_permissions`, por persona. El rol es una
 *     plantilla que se copia al aplicarlo; despues no manda nada. Por eso estos permisos son
 *     independientes del rol y se pueden editar de a uno.
 *   - `PATCH /staff/{id}` con `permissions` reescribe **unicamente las areas nombradas en el
 *     cuerpo**. Un area que no viene no se toca; un area que viene con `[]` se vacia. De ahi que
 *     `cuerpoDePermisos()` nombre todas las areas de la matriz y ninguna otra: lo que no se pudo
 *     mostrar tampoco se puede pisar.
 *   - Nadie reparte lo que no tiene: la API rechaza con `escalada` una capacidad que quien edita no
 *     posee. `matrizEditable()` adelanta esa regla en la interfaz en vez de esperar el 422.
 */
import type { AreaDeCatalogo } from '@/datos/recursos'

/**
 * Nombre en español de cada area de permisos.
 *
 * Las claves son las features de la API (`helpers/staff_helper.php`), y se traducen aca porque son lo
 * unico de la ficha que llega en ingles. Una feature que la API agregue y este mapa no conozca se
 * muestra con su clave cruda: es feo, pero es cierto, y no esconde un permiso que la persona tiene.
 */
export const AREAS: Record<string, string> = {
  tasks: 'Tareas',
  projects: 'Proyectos',
  customers: 'Clientes',
  staff: 'Equipo',
  invoices: 'Facturas',
  payments: 'Pagos',
  estimates: 'Cotizaciones',
  proposals: 'Propuestas',
  expenses: 'Gastos',
  contracts: 'Contratos',
  leads: 'Prospectos',
  tickets: 'Tickets',
  items: 'Ítems',
  roles: 'Roles',
  settings: 'Ajustes',
  // Estas cuatro no estan en el catalogo de la API: las escriben modulos del panel viejo, y aparecen
  // igual en `tblstaff_permissions` de gente real.
  knowledge_base: 'Base de conocimiento',
  reports: 'Reportes',
  goals: 'Metas',
  prchat: 'Chat interno'
}

/** Nombre en español de cada capacidad. Misma regla que `AREAS` con las que no estan. */
export const CAPACIDADES: Record<string, string> = {
  view: 'ver',
  view_own: 'ver lo propio',
  create: 'crear',
  edit: 'editar',
  delete: 'borrar',
  create_milestones: 'crear hitos',
  edit_milestones: 'editar hitos',
  delete_milestones: 'borrar hitos',
  edit_timesheet: 'editar horas',
  edit_own_timesheet: 'editar sus horas',
  delete_timesheet: 'borrar horas',
  delete_own_timesheet: 'borrar sus horas',
  view_all_templates: 'ver todas las plantillas',
  'view-timesheets': 'ver hojas de horas'
}

/** Una capacidad ya resuelta: si quien edita puede o no otorgarla. */
export interface CapacidadEditable {
  clave: string
  nombre: string
  /** `false` se dibuja deshabilitada: la API la rechazaria por escalada de privilegios. */
  editable: boolean
}

/** Un area del catalogo con sus capacidades, lista para dibujar. */
export interface AreaEditable {
  feature: string
  nombre: string
  capacidades: CapacidadEditable[]
}

/** Los permisos de alguien: area -> capacidades. Es la forma que devuelve la API en `/me` y en la ficha. */
export type MapaDePermisos = Record<string, string[]>

/**
 * Traduce el catalogo de la API y marca que puede otorgar quien edita.
 *
 * Un area donde quien edita no puede otorgar **nada** queda fuera de la matriz entera: mostrarla
 * seria ofrecer casillas que la API rechaza, y peor —al nombrarla en el `PATCH`— vaciaria permisos
 * que esa persona si tiene y quien edita no ve.
 *
 * @param catalogo `GET /roles/catalogo`, la lista de features y capacidades del panel.
 * @param permisosDelActor Los permisos de quien edita (`permissions` de `/me`).
 * @param actorEsAdmin Un administrador otorga cualquier cosa: la API le contesta que si a todo.
 * @returns Las areas dibujables, en el orden del catalogo.
 */
export function matrizEditable (
  catalogo: AreaDeCatalogo[],
  permisosDelActor: MapaDePermisos,
  actorEsAdmin: boolean
): AreaEditable[] {
  const matriz: AreaEditable[] = []

  for (const area of catalogo) {
    const propias = permisosDelActor[area.feature] ?? []
    const capacidades = area.capabilities.map((capacidad) => ({
      clave: capacidad.key,
      nombre: CAPACIDADES[capacidad.key] ?? capacidad.name,
      editable: actorEsAdmin || propias.includes(capacidad.key)
    }))

    if (!capacidades.some((capacidad) => capacidad.editable)) continue

    matriz.push({
      feature: area.feature,
      nombre: AREAS[area.feature] ?? area.name,
      capacidades
    })
  }

  return matriz
}

/**
 * Estado inicial de las casillas: lo que la persona tiene hoy, acotado a la matriz.
 *
 * Incluye tambien las capacidades no editables que ya posee. Se dibujan marcadas y bloqueadas, y
 * viajan intactas en el `PATCH`: quien edita no puede darlas, pero tampoco tiene por que quitarlas
 * sin querer.
 *
 * @param permisosDePersona Los permisos efectivos de la persona que se edita.
 * @param matriz La matriz de `matrizEditable()`.
 * @returns area -> capacidades marcadas.
 */
export function seleccionInicial (permisosDePersona: MapaDePermisos, matriz: AreaEditable[]): MapaDePermisos {
  const seleccion: MapaDePermisos = {}

  for (const area of matriz) {
    const tiene = permisosDePersona[area.feature] ?? []

    seleccion[area.feature] = area.capacidades
      .filter((capacidad) => tiene.includes(capacidad.clave))
      .map((capacidad) => capacidad.clave)
  }

  return seleccion
}

/**
 * Marca o desmarca una capacidad y devuelve una seleccion nueva.
 *
 * Pura a proposito: el estado de React se reemplaza, no se muta, o la vista no se entera del cambio.
 *
 * @param seleccion Estado actual de las casillas.
 * @param feature Area tocada.
 * @param capacidad Capacidad tocada.
 * @returns La seleccion resultante.
 */
export function alternar (seleccion: MapaDePermisos, feature: string, capacidad: string): MapaDePermisos {
  const actuales = seleccion[feature] ?? []
  const siguientes = actuales.includes(capacidad)
    ? actuales.filter((clave) => clave !== capacidad)
    : [...actuales, capacidad]

  return { ...seleccion, [feature]: siguientes }
}

/**
 * Arma el `permissions` del `PATCH /staff/{id}`.
 *
 * Nombra **todas** las areas de la matriz, incluso las que quedan vacias —asi es como se quita un
 * area entera—, y ninguna que no este en ella: las que la API no declara en su catalogo
 * (`goals`, `reports`, `prchat`, `knowledge_base`) y las que quien edita no puede otorgar se quedan
 * como estaban.
 *
 * Las capacidades se ordenan como el catalogo, no como se fueron marcando: el cuerpo de dos ediciones
 * iguales tiene que ser igual, o el registro de actividad de la API muestra cambios que no hubo.
 *
 * @param seleccion Estado de las casillas.
 * @param matriz La matriz de `matrizEditable()`.
 * @returns El mapa listo para mandar.
 */
export function cuerpoDePermisos (seleccion: MapaDePermisos, matriz: AreaEditable[]): MapaDePermisos {
  const cuerpo: MapaDePermisos = {}

  for (const area of matriz) {
    const marcadas = seleccion[area.feature] ?? []

    cuerpo[area.feature] = area.capacidades
      .filter((capacidad) => marcadas.includes(capacidad.clave))
      .map((capacidad) => capacidad.clave)
  }

  return cuerpo
}

/**
 * Lo que la persona tiene y esta pantalla no puede tocar.
 *
 * Son los permisos de modulos del panel viejo que no salen en el catalogo de la API, y los de areas
 * que quien edita no administra. Se listan para que nadie concluya que la persona no los tiene solo
 * porque la matriz no los muestra.
 *
 * @param permisosDePersona Los permisos efectivos de la persona que se edita.
 * @param matriz La matriz de `matrizEditable()`.
 * @returns Una linea por area, con las capacidades ya en español.
 */
export function areasFueraDeLaMatriz (
  permisosDePersona: MapaDePermisos,
  matriz: AreaEditable[]
): Array<{ nombre: string, capacidades: string }> {
  const editables = new Set(matriz.map((area) => area.feature))

  return Object.entries(permisosDePersona)
    .filter(([feature, capacidades]) => !editables.has(feature) && capacidades.length > 0)
    .map(([feature, capacidades]) => ({
      nombre: AREAS[feature] ?? feature,
      capacidades: capacidades.map((clave) => CAPACIDADES[clave] ?? clave).join(', ')
    }))
}
