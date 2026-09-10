/**
 * Logica pura de "importar las tareas de otro Proyecto a un Hito de este".
 *
 * El caso: hay gente que abrio un Proyecto por mes y ahora esos meses tienen que ser Hitos de un
 * solo Proyecto. El ciclo es importar, COMPROBAR que la copia quedo igual, y recien entonces
 * archivar el Proyecto viejo. Los tres pasos son del mismo dialogo porque nadie archiva sin haber
 * comprobado, y separarlos en tres pantallas es pedirle a alguien que se acuerde de volver.
 *
 * Vive fuera del `.tsx` por la razon de siempre en este proyecto: Node sabe despojar los tipos de un
 * `.ts` pero no el JSX, asi que una funcion declarada dentro del componente no se puede probar. Aca
 * no hay React ni `fetch`.
 *
 * Sin imports de valor: los `import type` desaparecen al despojar tipos, pero un import normal con
 * el alias `@/` no lo resolveria el runner de Node.
 */

/** Cuantos Proyectos se traen para el buscador de origen. Mas que eso no entra sin paginar. */
export const MAXIMO_ORIGENES = 200

/** Lo minimo que el dialogo necesita saber de un Proyecto candidato a ser el origen. */
export interface ProyectoCandidato {
  id: number
  name: string
  archived?: boolean
}

/** Lo minimo que el dialogo necesita saber de un Hito del Proyecto de destino. */
export interface HitoDestino {
  id: number
  name: string
}

/** Una diferencia entre una tarea de origen y su copia, tal como la devuelve el informe. */
export interface DiferenciaImportacion {
  tarea_origen: number
  nombre: string
  copia_id: number | null
  campo: string
  origen: string
  copia: string
}

/** El informe de verificacion de `GET /projects/{id}/import-tasks`. */
export interface InformeImportacion {
  origen: { id: number, nombre: string, tareas: number }
  destino: { id: number, nombre: string }
  hito: { id: number, nombre: string }
  importadas: number
  pendientes: number
  listo: boolean
  diferencias: DiferenciaImportacion[]
}

/**
 * Ruta del BFF con los Proyectos que pueden ser origen.
 *
 * Trae tambien los archivados (`filter[archivado]=0,1`): el caso tipico es reorganizar meses viejos,
 * y varios de esos ya se archivaron antes de que existiera esta pantalla. Sin el filtro el listado
 * fuerza `archivado = 0` y deja justo afuera a los que mas se necesitan.
 *
 * @returns la ruta sin barra inicial, lista para `pedirSobre`
 */
export function rutaProyectosOrigen (): string {
  const params = new URLSearchParams({
    'filter[archivado]': '0,1',
    per_page: String(MAXIMO_ORIGENES),
    sort: '-id'
  })

  return `projects?${params.toString()}`
}

/**
 * Ruta del BFF con los Hitos del Proyecto que recibe las tareas.
 *
 * @param destinoId el Proyecto que se esta mirando
 */
export function rutaHitosDestino (destinoId: number): string {
  return `projects/${destinoId}/milestones?per_page=${MAXIMO_ORIGENES}`
}

/**
 * Ruta del informe de verificacion.
 *
 * @param destinoId Proyecto que recibe
 * @param origenId  Proyecto del que salen las tareas
 * @param hitoId    Hito de destino
 */
export function rutaInforme (destinoId: number, origenId: number, hitoId: number): string {
  const params = new URLSearchParams({ origen_id: String(origenId), hito_id: String(hitoId) })

  return `projects/${destinoId}/import-tasks?${params.toString()}`
}

/** Ruta del `POST` que ejecuta la importacion. */
export function rutaImportar (destinoId: number): string {
  return `projects/${destinoId}/actions/import-tasks`
}

/**
 * Cuerpo del `POST` que ejecuta la importacion.
 *
 * @param origenId Proyecto del que salen las tareas
 * @param hitoId   Hito de destino
 */
export function cuerpoDeImportacion (origenId: number, hitoId: number): Record<string, number> {
  return { origen_id: origenId, hito_id: hitoId }
}

/**
 * Deja fuera del buscador de origen al Proyecto que se esta mirando y filtra por lo escrito.
 *
 * El propio Proyecto se descarta aca y no solo en el backend —que responde 422— porque ofrecerlo
 * como opcion es prometer algo que va a fallar.
 *
 * @param proyectos los candidatos ya traidos
 * @param destinoId el Proyecto que recibe, que nunca puede ser tambien el origen
 * @param texto     lo escrito en el buscador; vacio devuelve todos los demas
 * @returns los que coinciden, en el mismo orden
 */
export function filtrarOrigenes (
  proyectos: ProyectoCandidato[],
  destinoId: number,
  texto: string
): ProyectoCandidato[] {
  const buscado = normalizar(texto)

  return proyectos.filter((proyecto) => {
    if (proyecto.id === destinoId) return false

    return buscado === '' || normalizar(proyecto.name).includes(buscado)
  })
}

/** Minusculas y sin diacriticos, para comparar lo que se escribe con lo que se ve. */
function normalizar (texto: string): string {
  return texto.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

/**
 * Valida la eleccion antes de gastar un viaje a la API.
 *
 * @param origenId Proyecto elegido como origen, o `null` si todavia no se eligio
 * @param hitoId   Hito elegido, o `null`
 * @param destinoId Proyecto que recibe
 * @returns el mensaje de error, o `null` si esta todo bien
 */
export function validarImportacion (
  origenId: number | null,
  hitoId: number | null,
  destinoId: number
): string | null {
  if (origenId === null) return 'Elegí de qué proyecto vas a traer las tareas.'
  if (origenId === destinoId) return 'El proyecto de origen no puede ser este mismo.'
  if (hitoId === null) return 'Elegí a qué hito van a entrar las tareas.'

  return null
}

/**
 * Frase que resume el informe para quien tiene que decidir si archiva o no.
 *
 * Se arma aca y no en el JSX para poder probar las cuatro situaciones sin montar el dialogo: nada
 * que traer, todo pendiente, importado con diferencias, e importado limpio.
 *
 * @param informe el informe recien traido
 * @returns el texto listo para mostrar
 */
export function resumenDelInforme (informe: InformeImportacion): string {
  const { origen, importadas, pendientes, diferencias } = informe

  if (origen.tareas === 0) {
    return `"${origen.nombre}" no tiene tareas para traer.`
  }

  if (importadas === 0) {
    return `Se van a copiar ${pendientes} ${plural(pendientes, 'tarea', 'tareas')} de "${origen.nombre}" `
      + `al hito "${informe.hito.nombre}".`
  }

  if (pendientes > 0) {
    return `${importadas} de ${origen.tareas} ${plural(origen.tareas, 'tarea', 'tareas')} ya están en `
      + `"${informe.hito.nombre}". Quedan ${pendientes} por traer.`
  }

  const copiadas = `${importadas} ${plural(importadas, 'tarea', 'tareas')}`

  if (diferencias.length > 0) {
    return `Se copiaron ${copiadas}, pero ${diferencias.length} `
      + `${plural(diferencias.length, 'dato no coincide', 'datos no coinciden')} con el original. `
      + 'Revisá antes de archivar.'
  }

  return `${copiadas} de "${origen.nombre}" ${plural(importadas, 'está', 'están')} en `
    + `"${informe.hito.nombre}" con todos sus datos iguales. Ya se puede archivar el proyecto viejo.`
}

/**
 * Si el informe habilita a archivar el Proyecto de origen.
 *
 * Es el `listo` del backend y no un calculo propio: el frontend no tiene por que reimplementar la
 * regla, y dos versiones de la misma condicion se separan en cuanto una cambia. Se envuelve igual
 * para que el dialogo no dependa de la forma del envelope.
 */
export function habilitaArchivar (informe: InformeImportacion | null): boolean {
  return informe !== null && informe.listo
}

/** Singular o plural segun la cantidad. */
function plural (cantidad: number, singular: string, plural: string): string {
  return cantidad === 1 ? singular : plural
}
