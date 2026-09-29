/**
 * Reglas de la pantalla de Organización: salud del organigrama, filtros del listado, qué cambió en
 * el panel de una persona y la exportación.
 *
 * Todo es puro y trabaja sobre lo que ya mandó la API (`/accesos/personas` y `/accesos/catalogo`).
 * **Nada de esto decide alcance**: eso lo calcula la API (`GET /accesos/personas/{id}/alcance`). Acá
 * solo se cuentan huecos que están a la vista en los mismos datos que la pantalla pinta.
 */
import { etiquetaDeEscalon } from './escalon.ts'
import { banderasDeRol, rolDeSistemaDe, type RolDeSistema } from './rol-sistema.ts'
import type { Escalon } from './escalon.ts'
import type {
  AreaDeAccesos, CambioDePersona, CargoDeAccesos, NodoDeArbol, PersonaDeAccesos
} from '../datos/accesos.ts'

/** Los huecos que se filtran en el listado de personas. */
export type ProblemaDePersona = 'sin_area' | 'sin_jefe'

/** Los huecos que se filtran en la tabla de áreas. */
export type ProblemaDeArea = 'sin_jefatura' | 'jefatura_de_baja' | 'vacia' | 'fuera_de_procesos'

/** Un contador de la salud del organigrama. */
export interface IndicadorDeSalud<P extends string> {
  clave: P
  etiqueta: string
  /** Qué pasa si se deja así: se lee antes de decidir si importa. */
  consecuencia: string
  ids: number[]
}

/** La salud entera: los huecos de personas y los de áreas, cada uno con sus ids. */
export interface SaludDeOrganizacion {
  personas: Array<IndicadorDeSalud<ProblemaDePersona>>
  areas: Array<IndicadorDeSalud<ProblemaDeArea>>
  /** Suma de todos los ids: cero es un organigrama sin huecos. */
  total: number
}

/**
 * Cuenta los huecos del organigrama sobre la gente activa.
 *
 * "Sin jefe directo" no es lo mismo que "no reporta a nadie": quien lleva un área con jefatura cuelga
 * de ella igual. Por eso la consecuencia lo dice, en vez de presentarlo como un error.
 *
 * @param personas El listado completo de `/accesos/personas`, bajas incluidas.
 * @param areas Las áreas del catálogo.
 * @returns Los indicadores, con los ids de cada uno.
 */
export function saludDeOrganizacion (personas: PersonaDeAccesos[], areas: AreaDeAccesos[]): SaludDeOrganizacion {
  const activas = personas.filter((persona) => persona.activo)
  const idsActivos = new Set(activas.map((persona) => persona.staffid))

  const indicadoresDePersonas: Array<IndicadorDeSalud<ProblemaDePersona>> = [
    {
      clave: 'sin_area',
      etiqueta: 'Sin área',
      consecuencia: 'No aparecen en el mapa de ninguna área ni en el tablero de su jefatura.',
      ids: activas.filter((persona) => persona.area_id === null).map((persona) => persona.staffid)
    },
    {
      clave: 'sin_jefe',
      etiqueta: 'Sin jefe directo',
      consecuencia: 'Solo reportan a alguien si su área tiene jefatura.',
      ids: activas.filter((persona) => persona.jefe_staffid === null).map((persona) => persona.staffid)
    }
  ]

  const indicadoresDeAreas: Array<IndicadorDeSalud<ProblemaDeArea>> = [
    {
      clave: 'sin_jefatura',
      etiqueta: 'Áreas sin jefatura',
      consecuencia: 'Su gente no reporta a nadie por el área.',
      ids: areas.filter((area) => area.jefe_staffid === null).map((area) => area.id)
    },
    {
      clave: 'jefatura_de_baja',
      etiqueta: 'Jefaturas dadas de baja',
      consecuencia: 'El área la dirige alguien que ya no trabaja acá.',
      ids: areas
        .filter((area) => area.jefe_staffid !== null && !idsActivos.has(area.jefe_staffid))
        .map((area) => area.id)
    },
    {
      clave: 'vacia',
      etiqueta: 'Áreas vacías',
      consecuencia: 'Nadie la lleva puesta.',
      ids: areas.filter((area) => area.personas === 0).map((area) => area.id)
    },
    {
      clave: 'fuera_de_procesos',
      etiqueta: 'Fuera de los Procesos',
      consecuencia: 'Su nombre no está entre las áreas de los Procesos: filtrar por ella no trae nada.',
      ids: areas.filter((area) => !area.en_tareas).map((area) => area.id)
    }
  ]

  const total = [...indicadoresDePersonas, ...indicadoresDeAreas]
    .reduce((suma, indicador) => suma + indicador.ids.length, 0)

  return { personas: indicadoresDePersonas, areas: indicadoresDeAreas, total }
}

/** Si una clave cualquiera es uno de los huecos de persona. */
export function esProblemaDePersona (valor: string | null): valor is ProblemaDePersona {
  return valor === 'sin_area' || valor === 'sin_jefe'
}

/** Si una clave cualquiera es uno de los huecos de área. */
export function esProblemaDeArea (valor: string | null): valor is ProblemaDeArea {
  return valor === 'sin_jefatura' || valor === 'jefatura_de_baja' || valor === 'vacia' || valor === 'fuera_de_procesos'
}

/** Los filtros del listado de personas, tal como vienen de la URL. Cadena vacía es "todos". */
export interface FiltrosDePersonas {
  buscar: string
  escalon: string
  area: string
  cargo: string
  problema: string
  /** `rol` filtra por rol de sistema o por coordinación multiárea. */
  rol: string
}

/** Los valores de `FiltrosDePersonas.rol`, con su etiqueta. */
export const FILTROS_DE_ROL: ReadonlyArray<{ valor: string, etiqueta: string }> = [
  { valor: 'superadmin', etiqueta: 'Superadministradores' },
  { valor: 'admin', etiqueta: 'Administradores' },
  { valor: 'coordinador', etiqueta: 'Coordinan varias áreas' },
  { valor: 'baja', etiqueta: 'Dadas de baja' }
]

/**
 * Normaliza un texto para buscar: sin tildes, en minúsculas y sin espacios en los bordes.
 *
 * @param texto Lo escrito o el dato contra el que se compara.
 * @returns El texto comparable.
 */
export function comparable (texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

/**
 * Filtra el listado en el navegador.
 *
 * El listado entero ya está en memoria —cabe en una sola página de la API—, así que buscar mientras
 * se escribe no cuesta una consulta por tecla. Las bajas solo aparecen si se piden con `rol=baja`:
 * son historia, no gente a la que reasignar.
 *
 * @param personas El listado completo.
 * @param filtros Los filtros puestos.
 * @param salud Los ids de cada hueco, para el filtro `problema`.
 * @returns Las personas que pasan todos los filtros, en el orden en que llegaron.
 */
export function filtrarPersonas (
  personas: PersonaDeAccesos[],
  filtros: FiltrosDePersonas,
  salud: SaludDeOrganizacion
): PersonaDeAccesos[] {
  const texto = comparable(filtros.buscar)
  const problema = salud.personas.find((indicador) => indicador.clave === filtros.problema)
  const conProblema = problema === undefined ? null : new Set(problema.ids)

  return personas.filter((persona) => {
    if (filtros.rol === 'baja' ? persona.activo : !persona.activo) return false
    if (texto !== '' && !comparable(`${persona.nombre} ${persona.correo}`).includes(texto)) return false
    if (filtros.escalon !== '' && persona.escalon !== filtros.escalon) return false
    if (filtros.area !== '' && !areasDe(persona).includes(Number(filtros.area))) return false
    if (filtros.cargo !== '' && persona.cargo_id !== Number(filtros.cargo)) return false
    if (conProblema !== null && !conProblema.has(persona.staffid)) return false

    return cumpleRol(persona, filtros.rol)
  })
}

/** Las áreas que lleva una persona: todas las de `area_ids`, o la principal si la API no las manda. */
function areasDe (persona: PersonaDeAccesos): number[] {
  if (persona.area_ids.length > 0) return persona.area_ids

  return persona.area_id === null ? [] : [persona.area_id]
}

/** Si la persona pasa el filtro de rol. `baja` ya se resolvió antes. */
function cumpleRol (persona: PersonaDeAccesos, rol: string): boolean {
  if (rol === 'superadmin') return persona.is_superadmin
  if (rol === 'admin') return persona.is_admin && !persona.is_superadmin
  if (rol === 'coordinador') return persona.coordinador_multiarea

  return true
}

/**
 * El árbol plano de la gente activa, para ofrecer jefes sin cerrar un ciclo.
 *
 * Sale del listado que la pantalla ya tiene y no de otra llamada a `/accesos/arbol`. Un jefe dado de
 * baja se lee como "sin jefe", igual que lo emite la API en el árbol: no hay dónde colgar a alguien
 * de una persona que ya no está.
 *
 * @param personas El listado completo.
 * @returns Un nodo por persona activa.
 */
export function nodosDesdePersonas (personas: PersonaDeAccesos[]): NodoDeArbol[] {
  const activas = personas.filter((persona) => persona.activo)
  const ids = new Set(activas.map((persona) => persona.staffid))

  return activas.map((persona) => ({
    staffid: persona.staffid,
    nombre: persona.nombre,
    escalon: persona.escalon,
    jefe_staffid: persona.jefe_staffid !== null && ids.has(persona.jefe_staffid) ? persona.jefe_staffid : null
  }))
}

/** Lo que se puede editar de una persona desde su panel. */
export interface FormularioDePersona {
  escalon: Escalon
  jefe_staffid: number | null
  area_id: number | null
  cargo_id: number | null
  coordinador_multiarea: boolean
  rol: RolDeSistema
}

/** El formulario tal como está guardada la persona. */
export function formularioDe (persona: PersonaDeAccesos): FormularioDePersona {
  return {
    escalon: persona.escalon,
    jefe_staffid: persona.jefe_staffid,
    area_id: persona.area_id,
    cargo_id: persona.cargo_id,
    coordinador_multiarea: persona.coordinador_multiarea,
    rol: rolDeSistemaDe(persona)
  }
}

/** Los dos cuerpos que puede necesitar guardar el panel, cada uno solo con lo que cambió. */
export interface CambiosDePersona {
  /** Para `PUT /accesos/personas/{id}`. */
  accesos: CambioDePersona
  /** Para `PATCH /staff/{id}`; vacío si el rol no cambió. */
  rol: { is_admin?: boolean, is_superadmin?: boolean }
}

/**
 * Qué cambió respecto de lo guardado, partido por el endpoint que lo escribe.
 *
 * Mandar lo que no cambió dispararía guards de la API sin motivo —cambiarse el escalón a uno mismo
 * responde 409 aunque sea el mismo valor—. El rol compara contra las banderas **reales**, no contra
 * las que su rol implicaría: una cuenta superadministradora sin `admin` necesita que se escriban las
 * dos.
 *
 * @param persona La fila tal como está guardada.
 * @param formulario Lo que hay puesto en el panel.
 * @returns Los dos cuerpos, cada uno posiblemente vacío.
 */
export function cambiosDePersona (persona: PersonaDeAccesos, formulario: FormularioDePersona): CambiosDePersona {
  const accesos: CambioDePersona = {}

  if (formulario.escalon !== persona.escalon) accesos.escalon = formulario.escalon
  if (formulario.jefe_staffid !== persona.jefe_staffid) accesos.jefe_staffid = formulario.jefe_staffid
  if (formulario.area_id !== persona.area_id) accesos.area_id = formulario.area_id
  if (formulario.cargo_id !== persona.cargo_id) accesos.cargo_id = formulario.cargo_id
  if (formulario.coordinador_multiarea !== persona.coordinador_multiarea) {
    accesos.coordinador_multiarea = formulario.coordinador_multiarea
  }

  const rol: CambiosDePersona['rol'] = {}

  if (formulario.rol !== rolDeSistemaDe(persona)) {
    const nuevas = banderasDeRol(formulario.rol)

    if (nuevas.is_admin !== persona.is_admin) rol.is_admin = nuevas.is_admin
    if (nuevas.is_superadmin !== persona.is_superadmin) rol.is_superadmin = nuevas.is_superadmin
  }

  return { accesos, rol }
}

/** Si el panel tiene algo que guardar. */
export function hayCambios (cambios: CambiosDePersona): boolean {
  return Object.keys(cambios.accesos).length > 0 || Object.keys(cambios.rol).length > 0
}

/** Las acciones en lote del listado de personas. */
export type AccionDeLote = 'area' | 'jefe' | 'escalon' | 'cargo'

/**
 * El cuerpo que se manda a cada persona elegida en un lote.
 *
 * @param accion Qué se asigna.
 * @param valor El valor elegido: id, clave de escalón, o `null` para vaciar.
 * @returns El `PUT` de una persona.
 */
export function cuerpoDeLote (accion: AccionDeLote, valor: string | number | null): CambioDePersona {
  const id = valor === null ? null : Number(valor)

  if (accion === 'area') return { area_id: id }
  if (accion === 'jefe') return { jefe_staffid: id }
  if (accion === 'cargo') return { cargo_id: id }

  return { escalon: String(valor) as Escalon }
}

/**
 * Quiénes del lote no pueden recibir el cambio, con el motivo.
 *
 * Se descartan antes de mandar nada, por los mismos motivos que la API rechazaría: nadie se cambia el
 * escalón a sí mismo (409), y nadie cuelga de sí mismo ni de alguien de su descendencia (422). Mejor
 * saberlo al elegir que a mitad del lote.
 *
 * @param elegidas Las personas del lote.
 * @param accion Qué se asigna.
 * @param valor El valor elegido.
 * @param actorId Quien administra.
 * @param nodos El árbol plano de la gente activa.
 * @returns `staffid => motivo` de cada persona que se va a saltar.
 */
export function omitidasDelLote (
  elegidas: PersonaDeAccesos[],
  accion: AccionDeLote,
  valor: string | number | null,
  actorId: number,
  nodos: NodoDeArbol[]
): Map<number, string> {
  const omitidas = new Map<number, string>()

  for (const persona of elegidas) {
    if (accion === 'escalon' && persona.staffid === actorId) {
      omitidas.set(persona.staffid, 'no puedes cambiarte el escalón a ti mismo')
    }

    if (accion === 'jefe' && valor !== null && cuelgaDe(nodos, Number(valor), persona.staffid)) {
      omitidas.set(persona.staffid, 'haría un ciclo en el árbol')
    }
  }

  return omitidas
}

/** Si `staffid` es `raiz` o cuelga de ella por la cadena de jefe. */
function cuelgaDe (nodos: NodoDeArbol[], staffid: number, raiz: number): boolean {
  const jefeDe = new Map(nodos.map((nodo) => [nodo.staffid, nodo.jefe_staffid]))
  const vistos = new Set<number>()
  let actual: number | null | undefined = staffid

  while (actual !== null && actual !== undefined && !vistos.has(actual)) {
    if (actual === raiz) return true
    vistos.add(actual)
    actual = jefeDe.get(actual)
  }

  return false
}

/** Nombre del campo del historial, en español. */
export function etiquetaDeCampo (campo: string): string {
  const etiquetas: Record<string, string> = {
    escalon: 'Escalón',
    jefe_staffid: 'A cargo de',
    area_id: 'Área',
    area_ids: 'Áreas',
    cargo_id: 'Cargo',
    coordinador_multiarea: 'Coordina varias áreas',
    rol_sistema: 'Rol de sistema',
    area_superior_id: 'Depende de',
    creada: 'Área creada',
    borrada: 'Área borrada',
    wiwo_permisos_jerarquia: 'Alcance por jerarquía'
  }

  return etiquetas[campo] ?? campo
}

/**
 * El listado como CSV, con los nombres ya resueltos: quien lo abre en una planilla no tiene los ids.
 *
 * @param personas Las filas a exportar, en el orden en que se ven.
 * @param areas Las áreas del catálogo.
 * @param cargos Los cargos del catálogo.
 * @returns El texto CSV, con encabezado y fin de línea `\r\n`.
 */
export function csvDePersonas (personas: PersonaDeAccesos[], areas: AreaDeAccesos[], cargos: CargoDeAccesos[]): string {
  const nombreDeArea = new Map(areas.map((area) => [area.id, area.nombre]))
  const nombreDeCargo = new Map(cargos.map((cargo) => [cargo.id, cargo.nombre]))
  const encabezado = [
    'Nombre', 'Correo', 'Escalón', 'A cargo de', 'Área', 'Cargo', 'Rol de sistema', 'Coordina varias áreas', 'Activa'
  ]

  const filas = personas.map((persona) => [
    persona.nombre,
    persona.correo,
    etiquetaDeEscalon(persona.escalon),
    persona.jefe_nombre ?? '',
    persona.area_id === null ? '' : nombreDeArea.get(persona.area_id) ?? '',
    persona.cargo_id === null ? '' : nombreDeCargo.get(persona.cargo_id) ?? '',
    etiquetaDeRol(rolDeSistemaDe(persona)),
    persona.coordinador_multiarea ? 'Sí' : 'No',
    persona.activo ? 'Sí' : 'No'
  ])

  return [encabezado, ...filas].map((fila) => fila.map(escaparCsv).join(',')).join('\r\n')
}

/** Nombre corto del rol de sistema. */
export function etiquetaDeRol (rol: RolDeSistema): string {
  if (rol === 'superadmin') return 'Superadministrador'
  if (rol === 'admin') return 'Administrador'

  return 'Usuario'
}

/** Una celda CSV: entre comillas solo si trae coma, comilla o salto de línea. */
function escaparCsv (texto: string): string {
  if (!/[",\r\n]/.test(texto)) return texto

  return `"${texto.replace(/"/g, '""')}"`
}
