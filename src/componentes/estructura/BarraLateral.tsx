'use client'

import './navegacion.css'

import { ATRIBUTO_ABATIDA, CLAVE_BARRA } from '@/lib/barra-lateral'

import Link, { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'
import { cloneElement, useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { Building2, ChevronRight, FolderKanban, Menu, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react'
import { Cajon, CerrarCajon, ContenidoCajon, DisparadorCajon } from '@/componentes/superposiciones/Cajon'
import { Logo } from '@/componentes/estructura/Logo'
import { sembrarFijados, useFijados } from '@/componentes/fijados/almacen'
import { claveDeElemento, hrefDeElemento, type Fijado } from '@/componentes/fijados/fijados'
import { abrirPaleta, textoDelAtajo } from '@/componentes/paleta/abrir'
import { ICONOS_DE_SECCION } from '@/componentes/paleta/iconos'
import { agruparSecciones, alternarInvertido, estaAbierto, ID_BLOQUE_FIJADOS, seccionActiva, type Seccion } from '@/lib/navegacion'
import { cn } from '@/lib/clases'
import { EVENTO_ABRIR_SECCIONES } from '@/lib/navegacion-movil'
import { useGestoDeHoja } from '@/componentes/estructura/useGestoDeHoja'

export type { IconoSeccion, Seccion } from '@/lib/navegacion'

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
 * Donde se recuerda que bloques y subgrupos del menu dio vuelta esta persona respecto de su default,
 * en este navegador. La clave es la de cuando solo se recordaban subgrupos abiertos: esos nacian
 * cerrados, asi que lo guardado entonces significa lo mismo ahora.
 */
const CLAVE_PLEGABLES = 'wiwo-nav-plegables-abiertos'

/** Evento propio de los plegables, por el mismo motivo que `EVENTO_BARRA`. */
const EVENTO_PLEGABLES = 'wiwo:nav-plegables'

/** Lo que se lee en el servidor y en el primer render: todo como nace. */
const SIN_ABIERTOS = '[]'

/**
 * Copia en memoria de los invertidos, para cuando el navegador no deja guardar (ventana privada
 * estricta): el bloque se abre o cierra igual, solo que no se recuerda al recargar.
 */
let plegablesEnMemoria: string | null = null

/**
 * Suscribe a un evento propio y a `storage`, que es como cambian las preferencias de la barra.
 *
 * @param evento el evento propio de esta pestaña
 * @returns la funcion de suscripcion para `useSyncExternalStore`
 */
function suscribirA (evento: string) {
  return (avisar: () => void): (() => void) => {
    window.addEventListener('storage', avisar)
    window.addEventListener(evento, avisar)
    return () => {
      window.removeEventListener('storage', avisar)
      window.removeEventListener(evento, avisar)
    }
  }
}

const suscribirBarra = suscribirA(EVENTO_BARRA)
const suscribirPlegables = suscribirA(EVENTO_PLEGABLES)

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

/**
 * Los bloques y subgrupos invertidos, como texto JSON crudo.
 *
 * Se devuelve el texto y no el arreglo: `useSyncExternalStore` compara por referencia, y un
 * `JSON.parse` en cada lectura devolveria un arreglo nuevo y un render sin fin.
 *
 * @returns el JSON guardado, o `[]` si no hay nada o el almacenamiento no esta disponible
 */
function leerPlegablesAbiertos (): string {
  try {
    return plegablesEnMemoria ?? window.localStorage.getItem(CLAVE_PLEGABLES) ?? SIN_ABIERTOS
  } catch {
    // Almacenamiento bloqueado: vale lo que se toco en esta pestaña, o todo como nace.
    return plegablesEnMemoria ?? SIN_ABIERTOS
  }
}

/**
 * Interpreta lo guardado. Cualquier cosa rara vale "todo como nace".
 *
 * @param crudo el JSON guardado
 * @returns los ids invertidos
 */
function idsInvertidos (crudo: string): string[] {
  try {
    const valor: unknown = JSON.parse(crudo)
    return Array.isArray(valor) ? valor.filter((id): id is string => typeof id === 'string') : []
  } catch {
    // Lo guardado no es JSON (lo edito alguien a mano): se ignora.
    return []
  }
}

/**
 * Abre o cierra un bloque o subgrupo y lo recuerda en este navegador.
 *
 * @param id el bloque o subgrupo
 */
function alternarPlegable (id: string): void {
  plegablesEnMemoria = JSON.stringify(alternarInvertido(idsInvertidos(leerPlegablesAbiertos()), id))

  try {
    window.localStorage.setItem(CLAVE_PLEGABLES, plegablesEnMemoria)
  } catch {
    // Sin almacenamiento el bloque se abre igual —vale la copia en memoria— y no se recuerda al
    // recargar. Es el mismo trato que da el panel a la ventana privada.
  }

  window.dispatchEvent(new Event(EVENTO_PLEGABLES))
}

/**
 * Si un bloque o subgrupo se dibuja abierto, leyendo lo recordado en este navegador.
 *
 * @param id el bloque o subgrupo
 * @param abiertoPorDefecto como nace
 * @param contieneActiva si adentro esta la seccion actual, que lo fuerza abierto
 * @returns `true` si va abierto
 */
function usePlegableAbierto (id: string, abiertoPorDefecto: boolean, contieneActiva: boolean): boolean {
  const guardados = useSyncExternalStore(suscribirPlegables, leerPlegablesAbiertos, () => SIN_ABIERTOS)
  return estaAbierto(id, abiertoPorDefecto, idsInvertidos(guardados), contieneActiva)
}

interface PropsEnlaceSeccion extends Omit<React.ComponentProps<typeof Link>, 'href' | 'children'> {
  href: string
  etiqueta: string
  Icono: React.ComponentType<{ size?: number, strokeWidth?: number, 'aria-hidden'?: boolean | 'true', className?: string }>
  activa: boolean
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

/** Clases del riel abatido para un item: icono arriba, etiqueta chica abajo. */
const ITEM_ABATIDO = '[[data-barra-abatida]_&]:text-menor [[data-barra-abatida]_&]:flex-col [[data-barra-abatida]_&]:justify-center [[data-barra-abatida]_&]:gap-0.5 [[data-barra-abatida]_&]:px-1 [[data-barra-abatida]_&]:py-1.5'

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
 * el indicador se desliza de una seccion a la otra —tambien entre bloques y hacia un fijado— sin
 * medir nada con JS. El nombre tiene que ser unico en el documento, y por eso la barrita solo se
 * pinta desde `md`: por debajo de ese corte el riel esta oculto y quien navega es el cajon, que
 * renderiza estos mismos items. Fuera del riel el color y el `aria-current` ya dicen cual es la
 * seccion actual.
 */
function EnlaceSeccion ({ href, etiqueta, Icono, activa, className, ...resto }: PropsEnlaceSeccion) {
  return (
    <Link
      href={href}
      aria-current={activa ? 'page' : undefined}
      className={cn(
        'rounded-chico relative flex items-center gap-2 px-2 py-1 text-sm transition-colors',
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
      <span className="min-w-0 truncate">{etiqueta}</span>
      <PuntoPendiente />
    </Link>
  )
}

interface PropsNavegacion {
  secciones: Seccion[]
  fijados: Fijado[]
  /** Envuelve cada enlace: el cajon lo usa para cerrarse al navegar. */
  envolver?: (enlace: React.ReactElement<{ style?: React.CSSProperties }>, clave: string) => React.ReactNode
  claseItem?: string
}

/**
 * El menu agrupado: principales, fijados y los bloques con encabezado.
 *
 * Es el mismo arbol en el riel y en el cajon. Quien ve que lo decidio `seccionesDe()` en el servidor;
 * aca solo se reparte (`agruparSecciones`).
 *
 * @returns los grupos del menu
 */
function NavegacionAgrupada ({ secciones, fijados, envolver = (enlace) => enlace, claseItem }: PropsNavegacion) {
  const ruta = usePathname()
  const { principales, bloques } = agruparSecciones(secciones)
  const hrefs = [...secciones.map((seccion) => seccion.href), ...fijados.map(hrefDeElemento)]
  const activa = seccionActiva(hrefs, ruta)

  /** Un enlace de seccion, ya envuelto. */
  const enlaceDe = (seccion: Seccion) => envolver(
    <EnlaceSeccion
      key={seccion.href}
      href={seccion.href}
      etiqueta={seccion.etiqueta}
      Icono={ICONOS_DE_SECCION[seccion.icono]}
      activa={activa === seccion.href}
      className={claseItem}
    />,
    seccion.href
  )

  return (
    <>
      <div className="flex flex-col gap-0.5">{principales.map(enlaceDe)}</div>

      {fijados.length > 0 && (
        <Bloque
          id={ID_BLOQUE_FIJADOS}
          titulo="Fijados"
          abiertoPorDefecto
          contieneActiva={fijados.some((fijado) => hrefDeElemento(fijado) === activa)}
        >
          {fijados.map((fijado) => envolver(
            <EnlaceSeccion
              key={claveDeElemento(fijado)}
              href={hrefDeElemento(fijado)}
              etiqueta={fijado.name}
              Icono={fijado.type === 'project' ? FolderKanban : Building2}
              activa={activa === hrefDeElemento(fijado)}
              className={cn('nav-fijado', claseItem)}
            />,
            claveDeElemento(fijado)
          ))}
        </Bloque>
      )}

      {bloques.map((bloque) => (
        <Bloque
          key={bloque.id}
          id={bloque.id}
          titulo={bloque.titulo}
          abiertoPorDefecto={bloque.abiertoPorDefecto}
          contieneActiva={[...bloque.secciones, ...bloque.plegables.flatMap((plegable) => plegable.secciones)].some((seccion) => seccion.href === activa)}
        >
          {bloque.secciones.map(enlaceDe)}
          {bloque.plegables.map((plegable) => (
            <Plegable
              key={plegable.id}
              id={plegable.id}
              titulo={plegable.titulo}
              contieneActiva={plegable.secciones.some((seccion) => seccion.href === activa)}
            >
              {plegable.secciones.map(enlaceDe)}
            </Plegable>
          ))}
        </Bloque>
      ))}
    </>
  )
}

interface PropsBloque {
  id: string
  titulo: string
  abiertoPorDefecto: boolean
  contieneActiva: boolean
  children: React.ReactNode
}

/**
 * Un bloque del menu cuyo encabezado lo pliega, recordado por persona en este navegador.
 *
 * Existe para que el menu entre sin scroll: con todas las secciones a la vista no cabia en una
 * laptop. El encabezado sigue leyendose como encabezado —chico y tenue—, con una flecha al final que
 * dice que se puede tocar.
 *
 * En el riel abatido el nombre no entra en 4.5rem ("Administración" se cortaba a la mitad): queda
 * solo la flecha, centrada bajo la linea que separa los bloques, y el nombre sigue ahi para el
 * lector de pantalla. Asi el bloque se sigue pudiendo abrir sin expandir la barra.
 *
 * @returns el bloque
 */
function Bloque ({ id, titulo, abiertoPorDefecto, contieneActiva, children }: PropsBloque) {
  const idContenido = useId()
  const abierto = usePlegableAbierto(id, abiertoPorDefecto, contieneActiva)

  return (
    <div role="group" aria-label={titulo} className="border-linea-suave flex flex-col border-t pt-1.5">
      <button
        type="button"
        aria-expanded={abierto}
        aria-controls={idContenido}
        onClick={() => alternarPlegable(id)}
        className="text-texto-sutil hover:text-texto hover:bg-hover rounded-chico flex items-center gap-2 px-2 py-1 text-xs font-semibold transition-colors [[data-barra-abatida]_&]:justify-center"
      >
        <span className="min-w-0 flex-1 truncate text-left [[data-barra-abatida]_&]:sr-only">{titulo}</span>
        <ChevronRight
          size={14}
          strokeWidth={2}
          aria-hidden="true"
          className={cn('nav-chevron shrink-0', abierto && 'rotate-90')}
        />
      </button>
      <div id={idContenido} data-abierto={abierto} className="nav-plegable" inert={!abierto}>
        <div className="flex min-h-0 flex-col gap-0.5 overflow-hidden pt-0.5">{children}</div>
      </div>
    </div>
  )
}

/**
 * Un subgrupo dentro de un bloque que se abre y se cierra, recordado por persona en este navegador.
 *
 * Abre con altura animada: la unica excepcion permitida a "solo transform y opacity", porque un
 * acordeon no tiene equivalente con transform. Se anima `grid-template-rows` de `0fr` a `1fr`, que
 * no obliga a medir nada con JS. Los subgrupos nacen cerrados.
 *
 * En el riel abatido el encabezado se dibuja como un item mas —flecha arriba, nombre chico abajo—,
 * asi el subgrupo se sigue pudiendo abrir sin expandir la barra.
 *
 * @returns el subgrupo
 */
function Plegable ({ id, titulo, contieneActiva, children }: { id: string, titulo: string, contieneActiva: boolean, children: React.ReactNode }) {
  const idContenido = useId()
  const abierto = usePlegableAbierto(id, false, contieneActiva)

  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={abierto}
        aria-controls={idContenido}
        onClick={() => alternarPlegable(id)}
        className={cn('text-texto-tenue hover:bg-hover hover:text-texto rounded-chico flex items-center gap-2 px-2 py-1 text-sm transition-colors', ITEM_ABATIDO)}
      >
        <ChevronRight
          size={16}
          strokeWidth={2}
          aria-hidden="true"
          className={cn('nav-chevron shrink-0', abierto && 'rotate-90')}
        />
        <span className="truncate">{titulo}</span>
      </button>
      <div
        id={idContenido}
        data-abierto={abierto}
        className="nav-plegable"
        // Cerrado, lo de adentro no se enfoca ni lo lee un lector: `inert` hace las dos cosas.
        inert={!abierto}
      >
        <div className="flex min-h-0 flex-col gap-0.5 overflow-hidden pl-3 [[data-barra-abatida]_&]:pl-0">{children}</div>
      </div>
    </div>
  )
}

/**
 * El boton que abre la paleta, con el atajo a la vista para que se aprenda.
 *
 * @returns el boton
 */
function BotonBuscar ({ className, onClick }: { className?: string, onClick?: () => void }) {
  const atajo = useSyncExternalStore(
    () => () => undefined,
    () => textoDelAtajo(navigator.platform),
    () => 'Ctrl K'
  )

  return (
    <button
      type="button"
      onClick={onClick ?? abrirPaleta}
      aria-keyshortcuts="Control+K Meta+K"
      className={cn(
        'border-linea bg-superficie-hundida text-texto-tenue hover:text-texto hover:border-linea-fuerte rounded-control',
        'flex h-9 items-center gap-2 border px-2.5 text-sm transition-colors',
        '[[data-barra-abatida]_&]:size-10 [[data-barra-abatida]_&]:justify-center [[data-barra-abatida]_&]:self-center [[data-barra-abatida]_&]:px-0',
        className
      )}
    >
      <Search size={16} strokeWidth={2} aria-hidden="true" className="shrink-0" />
      <span className="flex-1 text-left [[data-barra-abatida]_&]:sr-only">Buscar</span>
      <kbd className="text-texto-sutil text-xs [[data-barra-abatida]_&]:hidden">{atajo}</kbd>
    </button>
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
 * Tambien es quien siembra los fijados que trajo el servidor en la copia del navegador: esta
 * montada en todas las pantallas del panel (tambien en movil, oculta), asi que el cajon, la paleta y
 * el boton de las fichas leen la misma lista desde el primer render.
 *
 * @param secciones secciones ya filtradas por permisos en el servidor
 * @param fijados los fijados de quien mira, segun `GET /me/fijados`
 */
export function BarraLateral ({ secciones, fijados: iniciales = [], className }: { secciones: Seccion[], fijados?: Fijado[], className?: string }) {
  const abatida = useSyncExternalStore(suscribirBarra, leerAbatida, () => false)
  const fijados = useFijados(iniciales)

  useEffect(() => { sembrarFijados(iniciales) }, [iniciales])

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

      <div className="flex shrink-0 flex-col px-3 pb-2">
        <BotonBuscar />
      </div>

      <nav aria-label="Secciones" className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-3 pt-0" data-lenis-prevent>
        <NavegacionAgrupada secciones={secciones} fijados={fijados} claseItem={ITEM_ABATIDO} />
      </nav>
    </aside>
  )
}

/**
 * Navegacion de movil: el cajon con la busqueda y todas las secciones, agrupadas como en el riel.
 *
 * Por debajo de 760px el riel no entra y el panel se quedaba sin navegacion. Reusa `Cajon` —hoja
 * inferior en telefono, panel lateral desde `sm`— en vez de un deslizable propio: ese componente ya
 * resuelve foco atrapado, `Escape` y superposicion.
 *
 * Se abre desde "Más" de la barra inferior, que avisa con `EVENTO_ABRIR_SECCIONES`: la barra y el
 * cajon viven en ramas distintas de un layout de servidor. El disparador hamburguesa sigue existiendo
 * para quien lo monte visible (`className`), pero el armazon lo esconde: la barra inferior ya lo
 * reemplaza, y dos botones para lo mismo en una cabecera de 360px es uno de mas.
 *
 * En la hoja inferior se puede tirar hacia abajo para cerrarla (`useGestoDeHoja`), con un asa que lo
 * sugiere. Al cerrar, el foco vuelve a quien lo abrio —"Más"— y no al disparador escondido.
 *
 * Cada enlace va envuelto en `CerrarCajon` porque la navegacion es del lado del cliente: sin eso el
 * cajon queda abierto tapando la pantalla a la que se acaba de entrar.
 *
 * Los fijados salen de la copia del navegador que siembra `BarraLateral`, que tambien esta montada
 * en movil (oculta por CSS).
 *
 * @param secciones secciones ya filtradas por permisos en el servidor
 */
export function BarraLateralMovil ({ secciones, className }: { secciones: Seccion[], className?: string }) {
  const fijados = useFijados()
  const [abierto, setAbierto] = useState(false)
  const origen = useRef<HTMLElement | null>(null)
  const cerrar = useCallback(() => { setAbierto(false) }, [])
  const { alPresionar, cerradaPorGesto, reiniciar } = useGestoDeHoja(cerrar)

  const cambiar = useCallback((abrir: boolean) => {
    if (abrir) reiniciar()
    setAbierto(abrir)
  }, [reiniciar])

  useEffect(() => {
    const abrirDesdeAfuera = () => {
      origen.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      cambiar(true)
    }
    window.addEventListener(EVENTO_ABRIR_SECCIONES, abrirDesdeAfuera)
    return () => { window.removeEventListener(EVENTO_ABRIR_SECCIONES, abrirDesdeAfuera) }
  }, [cambiar])

  // Los items entran escalonados, de arriba hacia abajo, detras de la hoja: la lista se lee como
  // algo que se despliega y no como un bloque que aparece de golpe. El contador vive solo durante
  // este render y numera los enlaces en el orden en que `NavegacionAgrupada` los pide.
  let indice = 0
  const envolver = (enlace: React.ReactElement<{ style?: React.CSSProperties }>, clave: string) => (
    <CerrarCajon key={clave} asChild>
      {cloneElement(enlace, { style: { animationDelay: `${Math.min(indice++, 10) * 22}ms` } })}
    </CerrarCajon>
  )

  return (
    <Cajon open={abierto} onOpenChange={cambiar}>
      <DisparadorCajon
        aria-label="Abrir menú"
        onClick={() => { origen.current = null }}
        className={cn(
          'text-texto-tenue hover:bg-hover hover:text-texto rounded-chico inline-flex size-8 items-center justify-center transition-colors md:hidden',
          className
        )}
      >
        <Menu size={20} strokeWidth={2} aria-hidden="true" />
      </DisparadorCajon>
      <ContenidoCajon
        titulo="Secciones"
        onPointerDown={alPresionar}
        onCloseAutoFocus={(evento) => {
          if (origen.current === null) return
          evento.preventDefault()
          origen.current.focus()
          origen.current = null
        }}
        className={cn('hoja-con-gesto pb-seguro', cerradaPorGesto && 'data-[state=closed]:animate-none')}
      >
        <div className="flex flex-col gap-3">
          {/* La busqueda del telefono vive aca y no en la cabecera: en 360px la lupa se montaba
              sobre el logo. Se abre despues de que el cajon se cerro: la paleta no se abre encima
              de otro dialogo, y el cajon sigue abierto hasta que termina este clic. */}
          <CerrarCajon asChild>
            <BotonBuscar className="pointer-coarse:min-h-11" onClick={() => { window.setTimeout(abrirPaleta, 0) }} />
          </CerrarCajon>
          <nav aria-label="Secciones" className="flex flex-col gap-3">
            <NavegacionAgrupada
              secciones={secciones}
              fijados={fijados}
              claseItem="animate-entrar-abajo pointer-coarse:min-h-11 py-2.5 active:scale-[0.98]"
              envolver={envolver}
            />
          </nav>
        </div>
      </ContenidoCajon>
    </Cajon>
  )
}
