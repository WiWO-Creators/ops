'use client'

import { ATRIBUTO_ABATIDA, CLAVE_BARRA } from '@/lib/barra-lateral'

import Link, { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'
import { useSyncExternalStore } from 'react'
import { Building2, DoorOpen, FolderKanban, House, ListChecks, Mail, Menu, PanelLeftClose, PanelLeftOpen, Users, UsersRound, Video } from 'lucide-react'
import { Cajon, CerrarCajon, ContenidoCajon, DisparadorCajon } from '@/componentes/superposiciones/Cajon'
import { Logo } from '@/componentes/estructura/Logo'
import { cn } from '@/lib/clases'

/**
 * Como se decide el ancho de la barra.
 *
 * El estado visual se decide en CSS a partir de `ATRIBUTO_ABATIDA` y no con clases que ponga React: el
 * script inicial lo escribe antes del primer pintado, asi que la barra ya nace angosta. Con clases
 * de React, el primer render (que no puede leer `localStorage`) la pintaria ancha y saltaria al
 * hidratar — el mismo destello que `lib/tema.ts` evita con su script.
 */

/**
 * Evento propio que avisa el abatido en ESTA pestaña.
 *
 * `storage` solo dispara en las demas pestañas, nunca en la que escribio. Mismo motivo que
 * `EVENTO_TEMA` en `lib/tema.ts`.
 */
const EVENTO_BARRA = 'wiwo:barra-lateral'

/**
 * Iconos por clave.
 *
 * Las secciones se calculan en el servidor, y un componente de Lucide no cruza la frontera RSC
 * (no es serializable). Por eso viaja una clave y el componente se resuelve aca. Mapa `as const` y
 * no `cva`: es una sola dimension, sin matriz de variantes.
 */
const ICONOS = {
  inicio: House,
  procesos: ListChecks,
  espacios: FolderKanban,
  salas: DoorOpen,
  // `Video` y no `DoorOpen`: Salas son las de la oficina y Teletrabajo las de la pantalla. Con dos
  // puertas, la barra diria que son lo mismo.
  teletrabajo: Video,
  clientes: Building2,
  equipo: Users,
  mi_area: UsersRound,
  administracion: Mail
} as const

export type IconoSeccion = keyof typeof ICONOS

export interface Seccion {
  href: string
  etiqueta: string
  icono: IconoSeccion
}

/**
 * Decide si una seccion es la que se esta mirando.
 *
 * El prefijo se compara por segmento y no con `startsWith` a secas: asi `/clientes` no queda activo
 * cuando la ruta sea `/clientes-potenciales`.
 *
 * @param href ruta de la seccion
 * @param ruta ruta actual del navegador
 * @returns `true` si la seccion corresponde a la ruta actual
 */
function estaActiva (href: string, ruta: string): boolean {
  return ruta === href || ruta.startsWith(`${href}/`)
}

/**
 * Suscribe a los cambios de abatido, propios y de otras pestañas.
 *
 * @param avisar callback que React usa para releer el estado
 * @returns funcion de baja
 */
function suscribir (avisar: () => void): () => void {
  window.addEventListener('storage', avisar)
  window.addEventListener(EVENTO_BARRA, avisar)
  return () => {
    window.removeEventListener('storage', avisar)
    window.removeEventListener(EVENTO_BARRA, avisar)
  }
}

/**
 * Lee el estado desde el DOM y no desde `localStorage`.
 *
 * El atributo es la unica fuente de verdad del estado visual; leer el almacenamiento por separado
 * abriria la puerta a que los dos digan cosas distintas si el script inicial fallo.
 *
 * @returns `true` si la barra esta abatida
 */
function leerAbatida (): boolean {
  return document.documentElement.hasAttribute(ATRIBUTO_ABATIDA)
}

/**
 * Abate o expande la barra y lo persiste.
 *
 * Escribe el atributo primero: el abatido ya quedo aplicado aunque el almacenamiento no este
 * disponible (ventana privada), que no es un error sino un navegador que no recuerda.
 */
function alternarBarra (): void {
  const abatida = !leerAbatida()

  if (abatida) document.documentElement.setAttribute(ATRIBUTO_ABATIDA, '')
  else document.documentElement.removeAttribute(ATRIBUTO_ABATIDA)

  try {
    window.localStorage.setItem(CLAVE_BARRA, abatida ? 'abatida' : 'expandida')
  } catch {
    // Ventana privada o cookies bloqueadas: la barra ya se abatio, no recordarlo no rompe nada.
  }

  window.dispatchEvent(new Event(EVENTO_BARRA))
}

interface PropsEnlaceSeccion extends Omit<React.ComponentProps<typeof Link>, 'href' | 'children'> {
  seccion: Seccion
  ruta: string
}

/**
 * El punto que dice "ya te escuche, la pantalla viene en camino".
 *
 * Vive en su propio componente por obligacion del hook: `useLinkStatus` solo ve el estado si quien
 * lo llama es descendiente del `<Link>`; llamado dentro de `EnlaceSeccion` devolveria siempre
 * `pending: false`.
 *
 * Esta siempre en el arbol y absoluto, y lo unico que cambia es la opacidad: montarlo al hacer clic
 * correria la etiqueta justo cuando la persona le acaba de apuntar, y en el riel angosto —donde el
 * item es una columna— agregaria una linea mas de alto.
 *
 * Los 100ms de retraso son lo que separa "esto tarda" de un parpadeo. Con la ruta ya prefetcheada la
 * navegacion termina antes de que el punto se vea, que es exactamente lo que se quiere: el
 * indicador aparece solo cuando hubo espera que comunicar.
 *
 * @returns el punto, invisible salvo que la navegacion tarde
 */
function PuntoPendiente () {
  const { pending } = useLinkStatus()

  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute right-1.5 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-current opacity-0',
        pending && 'animate-aparecer [animation-delay:100ms]'
      )}
    />
  )
}

/**
 * Un item de navegacion, compartido por el riel de escritorio y el cajon de movil.
 *
 * La etiqueta es siempre texto visible, tambien en el riel angosto: un `title` no lo lee un lector
 * de pantalla al recorrer con teclado, y obliga a esperar el tooltip a quien usa el mouse.
 *
 * Reenvia el resto de las props al `<Link>` para que `CerrarCajon asChild` pueda inyectarle su
 * `onClick` y su `ref`; sin eso el cajon de movil no se cerraria al navegar.
 *
 * La barrita del item activo lleva un `view-transition-name` compartido: al navegar, el navegador
 * ve el mismo nombre en la pantalla vieja y en la nueva, e interpola la posicion entre las dos. Asi
 * el indicador se desliza de una seccion a la otra sin medir nada con JS. El nombre tiene que ser
 * unico en el documento, y por eso la barrita solo se pinta desde `md`: por debajo de ese corte el
 * riel esta oculto y quien navega es el cajon, que renderiza estos mismos items. Fuera del riel el
 * color y el `aria-current` ya dicen cual es la seccion actual.
 */
function EnlaceSeccion ({ seccion, ruta, className, ...resto }: PropsEnlaceSeccion) {
  const Icono = ICONOS[seccion.icono]
  const activa = estaActiva(seccion.href, ruta)

  return (
    <Link
      href={seccion.href}
      aria-current={activa ? 'page' : undefined}
      className={cn(
        'rounded-chico relative flex items-center gap-2 px-2 py-1.5 text-sm transition-colors',
        activa ? 'bg-acento/10 text-acento font-semibold' : 'text-texto-tenue hover:bg-hover hover:text-texto',
        className
      )}
      {...resto}
    >
      {activa && (
        <span
          aria-hidden="true"
          style={{ viewTransitionName: 'seccion-activa' }}
          className="bg-acento pointer-events-none absolute inset-y-1 left-0 hidden w-0.5 rounded-full md:block"
        />
      )}
      <Icono size={20} strokeWidth={2} aria-hidden="true" className="shrink-0" />
      <span className="truncate">{seccion.etiqueta}</span>
      <PuntoPendiente />
    </Link>
  )
}

/**
 * Barra lateral abatible del panel, para escritorio.
 *
 * Dos estados sobre el mismo arbol: expandida (14rem, icono + etiqueta al lado) y abatida (riel de
 * 4.5rem, icono arriba y etiqueta chica debajo). El cambio lo hace CSS colgado del atributo de
 * `<html>` en vez de dos arboles distintos, asi la transicion de ancho es continua y no hay
 * remontaje de los enlaces al abatir.
 *
 * El logo encabeza la barra y no el armazon: es la marca del panel, y su lugar natural es arriba de
 * la navegacion. En el riel abatido se oculta —el wordmark es cuatro veces mas ancho que alto y no
 * entra en 4.5rem— y el logo de movil lo pone la cabecera, donde el riel no existe.
 *
 * @param secciones secciones ya filtradas por permisos en el servidor
 */
export function BarraLateral ({ secciones, className }: { secciones: Seccion[], className?: string }) {
  const ruta = usePathname()
  const abatida = useSyncExternalStore(suscribir, leerAbatida, () => false)

  return (
    <aside
      className={cn(
        'border-linea hidden w-56 shrink-0 flex-col border-r transition-[width] duration-[280ms] ease-neo md:flex',
        '[[data-barra-abatida]_&]:w-18',
        className
      )}
    >
      <div className="flex h-14 shrink-0 items-center gap-2 px-3 [[data-barra-abatida]_&]:justify-center">
        <Link href="/inicio" aria-label="Inicio" className="min-w-0 [[data-barra-abatida]_&]:hidden">
          <Logo tamano="medio" />
        </Link>
        <button
          type="button"
          onClick={alternarBarra}
          aria-expanded={!abatida}
          aria-label={abatida ? 'Expandir menú' : 'Colapsar menú'}
          className="text-texto-tenue hover:bg-hover hover:text-texto rounded-chico ml-auto inline-flex size-8 shrink-0 items-center justify-center transition-colors [[data-barra-abatida]_&]:ml-0"
        >
          {/* Los dos iconos se pintan y CSS elige: con un ternario sobre el estado de React, el
              icono correcto recien aparece al hidratar y el primer pintado muestra el otro. */}
          <PanelLeftClose size={20} strokeWidth={2} aria-hidden="true" className="[[data-barra-abatida]_&]:hidden" />
          <PanelLeftOpen size={20} strokeWidth={2} aria-hidden="true" className="hidden [[data-barra-abatida]_&]:block" />
        </button>
      </div>

      <nav aria-label="Secciones" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3 pt-0">
        {secciones.map((seccion) => (
          <EnlaceSeccion
            key={seccion.href}
            seccion={seccion}
            ruta={ruta}
            className="[[data-barra-abatida]_&]:text-menor [[data-barra-abatida]_&]:flex-col [[data-barra-abatida]_&]:justify-center [[data-barra-abatida]_&]:gap-0.5 [[data-barra-abatida]_&]:px-1 [[data-barra-abatida]_&]:py-2"
          />
        ))}
      </nav>
    </aside>
  )
}

/**
 * Navegacion de movil: un boton hamburguesa que abre el cajon con las mismas secciones.
 *
 * Por debajo de 760px el riel no entra y el panel se quedaba sin navegacion. Reusa `Cajon` —hoja
 * inferior en telefono, panel lateral desde `sm`— en vez de un deslizable propio: ese componente ya
 * resuelve foco atrapado, `Escape` y superposicion.
 *
 * Cada enlace va envuelto en `CerrarCajon` porque la navegacion es del lado del cliente: sin eso el
 * cajon queda abierto tapando la pantalla a la que se acaba de entrar.
 *
 * @param secciones secciones ya filtradas por permisos en el servidor
 */
export function BarraLateralMovil ({ secciones, className }: { secciones: Seccion[], className?: string }) {
  const ruta = usePathname()

  return (
    <Cajon>
      <DisparadorCajon
        aria-label="Abrir menú"
        className={cn(
          'text-texto-tenue hover:bg-hover hover:text-texto rounded-chico inline-flex size-8 items-center justify-center transition-colors md:hidden',
          className
        )}
      >
        <Menu size={20} strokeWidth={2} aria-hidden="true" />
      </DisparadorCajon>
      <ContenidoCajon titulo="Secciones">
        <nav aria-label="Secciones" className="flex flex-col gap-1">
          {secciones.map((seccion) => (
            <CerrarCajon key={seccion.href} asChild>
              <EnlaceSeccion seccion={seccion} ruta={ruta} className="py-2.5" />
            </CerrarCajon>
          ))}
        </nav>
      </ContenidoCajon>
    </Cajon>
  )
}
