/**
 * Reglas del panel de accesos: lo que se puede rechazar sin ir a la API y cómo se nombra cada cosa.
 *
 * Vive en un `.ts` y no dentro de los paneles por la regla de `docs/convenciones.md`: Node despoja
 * los tipos de un `.ts` pero no el JSX, así que solo lo que está fuera del componente se puede
 * probar. Y acá lo que se decide es qué cuerpo sale hacia una API que reparte permisos.
 *
 * **Nada de esto reemplaza la validación del backend.** La de verdad está allá —la clave duplicada,
 * el ciclo en el árbol, el escalón en uso— y su 422 o su 409 se muestra igual. Esto evita el viaje y,
 * sobre todo, evita que un nombre vacío o un orden repetido llegue a una pantalla que administra el
 * acceso de toda la casa.
 */
import type {
  AlcanceDeEscalon, CuerpoDeEscalon, Escalon, PisoDeEscalon
} from '../datos/accesos.ts'

/** El formato de una clave de escalón, tal como lo exige la API. */
export const FORMATO_DE_CLAVE = /^[a-z_]{2,30}$/

/** Largo máximo de un nombre. Es el de la columna más corta (`tblwiwo_escalones.nombre`). */
const LARGO_MAXIMO_NOMBRE = 80

/** Qué significa cada alcance, para que quien lo elige sepa qué está repartiendo. */
export const ALCANCES: Record<AlcanceDeEscalon, { etiqueta: string, ayuda: string }> = {
  propio: { etiqueta: 'Lo propio', ayuda: 'Solo ve las filas en las que participa.' },
  area: { etiqueta: 'Su área', ayuda: 'Ve lo de su área y lo de las áreas que cuelgan de ella.' },
  todo: { etiqueta: 'Toda la casa', ayuda: 'Ve todas las filas, sin recorte por pertenencia.' }
}

/** Nombres legibles de las features del catálogo de capacidades. Lo que falte cae a su clave. */
const NOMBRE_DE_FEATURE: Record<string, string> = {
  tasks: 'Procesos',
  projects: 'Espacios',
  customers: 'Clientes',
  staff: 'Equipo',
  invoices: 'Facturas',
  estimates: 'Cotizaciones',
  expenses: 'Gastos',
  contracts: 'Contratos'
}

/** Nombres legibles de las capacidades. Lo que falte cae a su clave. */
const NOMBRE_DE_CAPACIDAD: Record<string, string> = {
  view: 'Ver',
  create: 'Crear',
  edit: 'Editar',
  delete: 'Borrar',
  edit_milestones: 'Editar hitos'
}

/** El borrador de un escalón mientras se edita. `orden` es texto: el campo se puede vaciar. */
export interface BorradorDeEscalon {
  clave: string
  nombre: string
  orden: string
  alcance: AlcanceDeEscalon
  jefatura: boolean
  asignable: boolean
  piso: PisoDeEscalon
}

/**
 * El borrador de un escalón que ya existe, o uno vacío para crear.
 *
 * El piso se copia y no se referencia: `pisoConCapacidad()` devuelve objetos nuevos, pero un
 * borrador que apuntara al piso del catálogo dejaría el listado desincronizado si alguien mutara.
 *
 * @param escalon El escalón a editar, o `undefined` para uno nuevo.
 * @param ordenSugerido Orden inicial de un escalón nuevo; se ignora al editar.
 * @returns El borrador listo para el formulario.
 */
export function borradorDeEscalon (escalon?: Escalon, ordenSugerido = 1): BorradorDeEscalon {
  if (escalon === undefined) {
    return {
      clave: '',
      nombre: '',
      orden: String(ordenSugerido),
      alcance: 'propio',
      jefatura: false,
      asignable: true,
      piso: {}
    }
  }

  return {
    clave: escalon.clave,
    nombre: escalon.nombre,
    orden: String(escalon.orden),
    alcance: escalon.alcance,
    jefatura: escalon.jefatura,
    asignable: escalon.asignable,
    piso: Object.fromEntries(
      Object.entries(escalon.piso).map(([feature, capacidades]) => [feature, [...capacidades]])
    )
  }
}

/**
 * Por qué este escalón no se puede guardar, en español, o `null` si se puede.
 *
 * Un escalón de sistema solo aporta el nombre, así que el resto de las reglas no se le aplican: la
 * API ignora lo demás y comprobarlo acá bloquearía un renombre legítimo.
 *
 * @param borrador Lo que hay en el formulario.
 * @param escalones El catálogo completo, para detectar clave y orden repetidos.
 * @param claveOriginal La clave del escalón que se edita, o `null` si se está creando.
 * @param sistema Si el escalón que se edita es de sistema.
 * @returns El motivo del rechazo, o `null`.
 */
export function motivoParaRechazarEscalon (
  borrador: BorradorDeEscalon,
  escalones: Escalon[],
  claveOriginal: string | null,
  sistema = false
): string | null {
  const nombre = borrador.nombre.trim()

  if (nombre === '') return 'El nombre no puede quedar vacío.'
  if (nombre.length > LARGO_MAXIMO_NOMBRE) {
    return `El nombre no puede pasar de ${LARGO_MAXIMO_NOMBRE} caracteres.`
  }

  if (sistema) return null

  if (claveOriginal === null) {
    const clave = borrador.clave.trim()

    if (!FORMATO_DE_CLAVE.test(clave)) {
      return 'La clave va en minúsculas y guion bajo, entre 2 y 30 caracteres. Ejemplo: jefe_de_area.'
    }

    if (escalones.some((otro) => otro.clave === clave)) {
      return `Ya hay un escalón con la clave «${clave}».`
    }
  }

  const orden = Number(borrador.orden)

  if (borrador.orden.trim() === '' || !Number.isInteger(orden) || orden < 1) {
    return 'El orden tiene que ser un número entero de 1 en adelante.'
  }

  const repetido = escalones.find((otro) => otro.orden === orden && otro.clave !== claveOriginal)

  if (repetido !== undefined) {
    return `El orden ${orden} ya lo ocupa «${repetido.nombre}». El orden es la herencia del piso: no puede haber dos.`
  }

  return null
}

/**
 * El cuerpo del `POST` o del `PUT` de un escalón.
 *
 * En los de sistema viaja **solo el nombre**: la API rechaza lo demás, y mandarlo igual convertiría
 * un renombre en un 422.
 *
 * @param borrador Lo que hay en el formulario, ya validado.
 * @param claveOriginal La clave del escalón que se edita, o `null` si se está creando.
 * @param sistema Si el escalón es de sistema.
 * @returns El cuerpo a enviar.
 */
export function cuerpoDeEscalon (
  borrador: BorradorDeEscalon,
  claveOriginal: string | null,
  sistema = false
): CuerpoDeEscalon {
  const nombre = borrador.nombre.trim()

  if (sistema) return { nombre }

  const cuerpo: CuerpoDeEscalon = {
    nombre,
    orden: Number(borrador.orden),
    piso: borrador.piso,
    alcance: borrador.alcance,
    jefatura: borrador.jefatura,
    asignable: borrador.asignable
  }

  return claveOriginal === null ? { clave: borrador.clave.trim(), ...cuerpo } : cuerpo
}

/**
 * El piso con una capacidad marcada o desmarcada.
 *
 * Devuelve un objeto nuevo —y arrays nuevos— para que el estado de React lo vea como un cambio. Una
 * feature que se queda sin capacidades desaparece del piso en vez de quedar como lista vacía: es la
 * misma forma que devuelve la API y así el "sin cambios" no se dispara por un `{tasks: []}` de más.
 *
 * @param piso El piso actual.
 * @param feature La feature de la casilla.
 * @param capacidad La capacidad de la casilla.
 * @param marcada Si queda marcada.
 * @returns El piso resultante.
 */
export function pisoConCapacidad (
  piso: PisoDeEscalon,
  feature: string,
  capacidad: string,
  marcada: boolean
): PisoDeEscalon {
  const actuales = piso[feature] ?? []
  const siguientes = marcada
    ? (actuales.includes(capacidad) ? actuales : [...actuales, capacidad])
    : actuales.filter((una) => una !== capacidad)

  const resultado: PisoDeEscalon = { ...piso }

  if (siguientes.length === 0) delete resultado[feature]
  else resultado[feature] = siguientes

  return resultado
}

/**
 * Por qué este nombre suelto —de un rol, un área o un cargo— no se puede guardar, o `null`.
 *
 * @param nombre Lo que se escribió.
 * @param existentes Los nombres que ya están en uso, para no crear dos iguales.
 * @returns El motivo del rechazo, o `null`.
 */
export function motivoParaRechazarNombre (nombre: string, existentes: string[] = []): string | null {
  const limpio = nombre.trim()

  if (limpio === '') return 'El nombre no puede quedar vacío.'
  if (limpio.length > LARGO_MAXIMO_NOMBRE) {
    return `El nombre no puede pasar de ${LARGO_MAXIMO_NOMBRE} caracteres.`
  }

  const repetido = existentes.some((otro) => otro.trim().toLowerCase() === limpio.toLowerCase())

  return repetido ? `Ya existe «${limpio}».` : null
}

/**
 * Nombre visible de un escalón a partir de su clave.
 *
 * Cae a la clave cuando el catálogo no la trae: es lo que pasa con una fila que alguien borró
 * mientras la pantalla estaba abierta, y esconderla haría ver una celda vacía sin explicación.
 *
 * @param escalones El catálogo.
 * @param clave La clave a traducir, o `null`.
 * @returns El nombre, la clave, o un guion cuando no hay clave.
 */
export function nombreDeEscalon (escalones: Escalon[], clave: string | null): string {
  if (clave === null) return '—'

  return escalones.find((escalon) => escalon.clave === clave)?.nombre ?? clave
}

/**
 * Los escalones que el override por persona puede escribir, de menor a mayor.
 *
 * @param escalones El catálogo completo.
 * @returns Solo los asignables, ordenados por su posición en la escalera.
 */
export function escalonesAsignables (escalones: Escalon[]): Escalon[] {
  return escalones.filter((escalon) => escalon.asignable).sort((uno, otro) => uno.orden - otro.orden)
}

/** Si un interruptor de `tbloptions` está encendido. Solo `'1'` lo está. */
export function estaEncendido (valor: string): boolean {
  return valor === '1'
}

/** Nombre legible de una feature del catálogo de capacidades. */
export function etiquetaDeFeature (feature: string): string {
  return NOMBRE_DE_FEATURE[feature] ?? feature
}

/** Nombre legible de una capacidad. */
export function etiquetaDeCapacidad (capacidad: string): string {
  return NOMBRE_DE_CAPACIDAD[capacidad] ?? capacidad
}

/**
 * Cuántas capacidades otorga un piso en total. Sirve para resumirlo en una celda de la tabla.
 *
 * @param piso El piso del escalón.
 * @returns La suma de capacidades de todas sus features.
 */
export function capacidadesDelPiso (piso: PisoDeEscalon): number {
  return Object.values(piso).reduce((suma, capacidades) => suma + capacidades.length, 0)
}

/**
 * La consulta del listado de personas, sin los filtros vacíos.
 *
 * Mandar `escalon=` vacío no es lo mismo que no mandarlo: la API tendría que decidir si eso significa
 * "sin escalón" o "cualquiera", y esa ambigüedad se resuelve acá no emitiendo la clave.
 *
 * @param filtros Lo que hay puesto en la barra de filtros.
 * @param pagina La página pedida, de 1 en adelante.
 * @returns La query string, con `?` delante, o cadena vacía si no hay nada que pedir.
 */
export function consultaDePersonas (
  filtros: { buscar: string, escalon: string, rol: string, area: string },
  pagina: number
): string {
  const parametros = new URLSearchParams()

  if (filtros.buscar.trim() !== '') parametros.set('buscar', filtros.buscar.trim())
  if (filtros.escalon !== '') parametros.set('escalon', filtros.escalon)
  if (filtros.rol !== '') parametros.set('rol', filtros.rol)
  if (filtros.area !== '') parametros.set('area', filtros.area)
  if (pagina > 1) parametros.set('page', String(pagina))

  const texto = parametros.toString()

  return texto === '' ? '' : `?${texto}`
}
