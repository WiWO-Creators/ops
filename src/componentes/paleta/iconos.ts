import {
  Building2, CalendarDays, ClipboardList, Clock, Columns3, DoorOpen, FolderKanban, Gavel, House, Inbox, LifeBuoy,
  ListChecks, Network, Radio, Repeat, ScrollText, SlidersHorizontal, Star, Target, TrendingUp, User, UserRound,
  Users, UsersRound, Video, type LucideIcon
} from 'lucide-react'
import type { IconoSeccion } from '@/lib/navegacion'
import type { IconoComando } from './comandos'

/**
 * Iconos por clave, para la barra lateral y la paleta.
 *
 * Las secciones se calculan en el servidor, y un componente de Lucide no cruza la frontera RSC (no
 * es serializable). Por eso viaja una clave y el componente se resuelve aca. Un solo mapa para los
 * dos lugares: si la barra y la paleta pintaran la misma seccion con iconos distintos, la persona
 * no reconoceria en una lo que ve en la otra.
 */
export const ICONOS_DE_SECCION: Record<IconoSeccion, LucideIcon> = {
  inicio: House,
  // `Radio` y no un reloj: LIVE no mide duraciones, dice quien esta al aire ahora. El reloj ya es el
  // vocabulario del cronometro, que es otra cosa.
  live: Radio,
  // `ClipboardList` y no otro `ListChecks`: Tareas es el listado de toda la casa y Mis Tareas es la
  // hoja de una persona. Con el mismo icono la barra diria que son la misma pantalla.
  mis_tareas: ClipboardList,
  procesos: ListChecks,
  // `Repeat`: lo que distingue a una recurrente es que vuelve, no que sea una Tarea.
  recurrentes: Repeat,
  // `Inbox` y no `LifeBuoy`: el salvavidas ya es el atajo "soporte" de la paleta, que pide ayuda. Esto
  // es la bandeja donde llegan las solicitudes de los clientes.
  tickets: Inbox,
  espacios: FolderKanban,
  // El martillo de la adjudicacion. `FolderKanban` ya es Espacios, y una licitacion no es una carpeta
  // mas: es lo que todavia no se gano.
  licitaciones: Gavel,
  upsells: TrendingUp,
  salas: DoorOpen,
  // `Video` y no `DoorOpen`: Salas son las de la oficina y Teletrabajo las de la pantalla. Con dos
  // puertas, la barra diria que son lo mismo.
  teletrabajo: Video,
  clientes: Building2,
  // `Target` y no otro edificio: Clientes es la cartera entera de la casa y Focals son las cuentas
  // de las que uno responde. Con dos `Building2` la barra diria que son la misma pantalla.
  focals: Target,
  equipo: Users,
  mi_area: UsersRound,
  // `Network` y no otro grupo de personas: Equipo y Mi Área ya son gente, y lo que distingue al
  // Organigrama es justamente la estructura — quien cuelga de quien.
  organigrama: Network,
  // `SlidersHorizontal` y no `Mail`: la seccion dejo de ser solo el correo cuando se unificaron
  // ahi todas las opciones del superadministrador.
  administracion: SlidersHorizontal,
  // `ScrollText` y no un escudo: esto no protege nada, es el registro de lo que se hizo.
  auditoria: ScrollText
}

/** Los de la paleta: las secciones mas un icono por tipo de resultado y por atajo. */
export const ICONOS_DE_COMANDO: Record<IconoComando, LucideIcon> = {
  ...ICONOS_DE_SECCION,
  tarea: ListChecks,
  persona: UserRound,
  reciente: Clock,
  fijado: Star,
  soporte: LifeBuoy,
  tablero: Columns3,
  calendario: CalendarDays,
  perfil: User
}
