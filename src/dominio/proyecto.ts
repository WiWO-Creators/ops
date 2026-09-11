import type { Espacio } from '@/datos/recursos'
import type { EspacioPortal } from '@/datos/portal'
import type { EmpresaPortal, StaffReferencia } from '@/datos/tipos'

/**
 * Un Proyecto visto por quien sea.
 *
 * Existe porque el mismo Proyecto llega por dos contratos distintos —`GET /projects/{id}` para el
 * equipo, `GET /portal/projects/{id}` para el cliente— y hasta ahora eso obligaba a escribir la
 * pantalla dos veces. No son dos proyectos: es el mismo, con menos campos de un lado.
 *
 * Es lo que consumen los componentes que DIBUJAN un Proyecto (`CabeceraProyecto` y las listas de sus
 * pestañas). Adentro de esos componentes no entra ni `Espacio` ni `EspacioPortal`: si entraran,
 * cada uno volveria a tener una rama por sujeto y volveriamos al punto de partida.
 *
 * **Lo que no esta acá no se dibuja.** Los campos que solo tienen sentido para el equipo —costos,
 * `added_from`, `archived`, campos personalizados— no suben a la vista: viven en `Espacio` y los usa
 * quien los necesita. Eso es lo que evita que un dato interno se cuele al portal por descuido.
 */
export interface ProyectoVista {
  id: number
  name: string
  /** Identificador visible. `null` cuando no se expone —el portal no publica el codigo interno—. */
  patente: string | null
  /** Imagen propia; si falta, la cabecera cae al logo del cliente y despues a las iniciales. */
  image_url: string | null
  status: number
  /** Avance 0-100 ya derivado por el backend. */
  progress: number
  start_date: string | null
  deadline: string | null
  /** A quien pertenece. El portal siempre trae el del propio contacto; el panel puede no tener. */
  cliente: { id: number, company: string, image_url: string | null } | null
  /** Vacio cuando no se comparte el equipo, no `undefined`: la cabecera dibuja "Sin personas". */
  members: StaffReferencia[]
  /** Vacio en el portal: las etiquetas son vocabulario interno. */
  tags: Array<{ id: number, name: string }>
}

/**
 * El Espacio del panel, como vista.
 *
 * @param espacio la ficha completa de `GET /projects/{id}`
 * @returns la vista con lo que se dibuja
 */
export function proyectoDelPanel (espacio: Espacio): ProyectoVista {
  return {
    id: espacio.id,
    name: espacio.name,
    patente: espacio.patente ?? null,
    image_url: espacio.image_url,
    status: espacio.status,
    progress: espacio.progress,
    start_date: espacio.start_date,
    deadline: espacio.deadline,
    cliente: espacio.client,
    members: espacio.members ?? [],
    tags: espacio.tags
  }
}

/**
 * El Proyecto del portal, como vista.
 *
 * El cliente llega por separado porque la API del portal no lo repite en cada proyecto: ya esta en
 * `GET /portal/company`, y es siempre la empresa del propio contacto.
 *
 * `patente` y `tags` quedan en `null` y vacio **a proposito**, no por olvido: el codigo interno del
 * Espacio y las etiquetas del equipo no se publican al cliente. La cabecera ya sabe dibujar sin
 * ellos.
 *
 * @param espacio el proyecto de `GET /portal/projects/{id}`
 * @param empresa la empresa del contacto, de `GET /portal/company`
 * @returns la vista con lo que el cliente puede ver
 */
export function proyectoDelPortal (espacio: EspacioPortal, empresa: EmpresaPortal): ProyectoVista {
  return {
    id: espacio.id,
    name: espacio.name,
    patente: null,
    image_url: null,
    status: espacio.status,
    progress: espacio.progress,
    start_date: espacio.start_date,
    deadline: espacio.deadline,
    cliente: { id: empresa.id, company: empresa.company, image_url: null },
    members: espacio.members ?? [],
    tags: []
  }
}
