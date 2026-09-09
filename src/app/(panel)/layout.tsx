import Link from 'next/link'
import { pedir, pedirOpcional } from '@/datos/servidor'
import { leerSuplantador } from '@/datos/sesion'
import type { Yo } from '@/datos/tipos'
import { GLOSARIO } from '@/dominio/glosario'
import { puedeVerSeccion } from '@/dominio/permisos'
import { intervaloDeLatido } from '@/datos/auditoria'
import { intervaloDeLive, type EstadoDeJornada } from '@/datos/live'
import type { ConteoDeAvisos } from '@/datos/avisos'
import { SelectorTema } from '@/componentes/estructura/SelectorTema'
import { BarraLateral, BarraLateralMovil, type Seccion } from '@/componentes/estructura/BarraLateral'
import { BarraSuplantacion } from '@/componentes/estructura/BarraSuplantacion'
import { Latido } from '@/componentes/auditoria/Latido'
import { Campana } from '@/componentes/avisos/Campana'
import { ControlJornada } from '@/componentes/live/ControlJornada'
import { Logo } from '@/componentes/estructura/Logo'
import { MenuUsuario } from '@/componentes/estructura/MenuUsuario'
import { ScrollSuave } from '@/componentes/estructura/ScrollSuave'

/**
 * Armazon del panel.
 *
 * Resuelve `GET /me` una sola vez por navegacion y lo usa para dos cosas: saludar a quien mira y
 * decidir que secciones se muestran. Los permisos aca solo **ocultan controles** — la API filtra
 * igual, y un boton escondido no es seguridad.
 *
 * Sigue siendo componente de servidor: la barra abatible es cliente y recibe las secciones ya
 * resueltas por props. Convertir el layout a cliente para manejar el abatido mandaria `/me` y la
 * logica de permisos al navegador, que es exactamente lo que no se quiere.
 */
export default async function PanelLayout ({ children }: { children: React.ReactNode }) {
  const { data: yo } = await pedir<Yo>('/me')
  const secciones = seccionesDe(yo)
  const segundosDeLive = intervaloDeLive()
  // Los dos van con `pedirOpcional`: son accesorios de la cabecera y ninguno puede tumbar el armazon
  // entero, que es lo que pasaria con `pedir()` el dia que la API conteste 403 o 500 en uno de ellos.
  // Resolverlos aca —y no al montar en el navegador— es lo que evita que el contador y el globo
  // aparezcan en blanco y salten a su valor un segundo despues, en cada navegacion.
  const [jornada, avisos] = await Promise.all([
    pedirOpcional<EstadoDeJornada>('/me/jornada'),
    pedirOpcional<ConteoDeAvisos>('/notifications/count')
  ])
  // La cookie de la sesion real es la unica señal de que esto es una suplantacion. `/me` no puede
  // decirlo: la API emite la sesion prestada igual que un login normal, a proposito.
  const suplantando = await leerSuplantador() !== null

  return (
    // `h-dvh` y no `min-h-dvh`: el armazon mide exactamente la ventana para que el scroll ocurra
    // dentro de `main` y la barra lateral y la cabecera queden fijas. Con `min-h` el armazon crece
    // con el contenido, y como el `body` no scrollea, lo que sobresale queda inalcanzable.
    //
    // La columna externa existe para que la franja de suplantacion quede fija arriba de todo: el
    // armazon de abajo mide lo que sobra, asi que sin franja se ve exactamente igual que antes.
    <div className="flex h-dvh flex-col overflow-hidden">
      {suplantando && <BarraSuplantacion nombre={yo.full_name} />}

      {/* No pinta nada: le cuenta al servidor en que pantalla esta esta persona, para el bloque
          "Ahora mismo" de `/auditoria`. Va en el armazon y no en esa pantalla porque el latido es de
          todo el panel: montado alla, la unica persona conectada seria la que mira la auditoria.
          El intervalo se resuelve aca —en el servidor— y viaja como prop; ver `intervaloDeLatido`. */}
      <Latido segundos={intervaloDeLatido()} />

      {/* `aurora` va aca y no en cada pantalla: es el lienzo del panel, no un adorno de la portada.
          Su capa es un `::before` fijo detras de todo (`globals.css`), asi que no ocupa lugar ni
          cambia la maqueta de ninguna de las ocho pantallas — solo les pone luz debajo. La barra
          lateral y la cabecera no llevan fondo propio a proposito: comparten el lienzo, y una barra
          de otro color partiria la ventana en dos mundos. */}
      <div className="aurora flex min-h-0 flex-1 overflow-hidden">

        <BarraLateral secciones={secciones} />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-linea flex h-14 shrink-0 items-center gap-3 border-b px-4">
            {/* Solo en movil: desde `md` el logo encabeza la barra lateral, y dos logos en pantalla
                serian la misma marca dicha dos veces. */}
            <Link href="/inicio" aria-label="Inicio" className="min-w-0 md:hidden">
              <Logo tamano="medio" />
            </Link>
            <BarraLateralMovil secciones={secciones} />
            {/* Uno solo en toda la aplicacion, y aca y no en la barra lateral: la barra se abate a un
                riel y en movil se esconde dentro de un cajon, justo donde mas falta hace saber que hay
                un medidor corriendo. Colapsado no crece mas que un boton porque la cabecera mide
                `h-14` fijos. */}
            <ControlJornada
              variante="compacta"
              segundos={segundosDeLive}
              inicial={jornada.datos}
              errorInicial={jornada.error}
              className="ml-auto"
            />
            <Campana inicial={avisos.datos} segundos={segundosDeLive} />
            <SelectorTema />
            <MenuUsuario nombre={yo.full_name} imagen={yo.profile_image_url} />
          </header>
          {/* El unico contenedor de scroll vertical del armazon. `min-h-0` es lo que se lo permite:
              sin el, un hijo flex no baja de su altura de contenido y `overflow-y` no llega a actuar.
              `ScrollSuave` pone el `overflow-y` y el `<main>`; aca solo queda como se mide y se rellena. */}
          <ScrollSuave className="min-h-0 min-w-0 flex-1 p-4">{children}</ScrollSuave>
        </div>
      </div>
    </div>
  )
}

/**
 * Arma la navegacion segun los permisos de quien mira.
 *
 * `secciones_habilitadas` decide que modulos existen para esta instalacion; `permissions`, cuales
 * puede ver esta persona. Un modulo sin `view` no se muestra: su pantalla daria 403 igual.
 *
 * El icono viaja como clave y no como componente: un icono de Lucide no es serializable a traves de
 * la frontera servidor-cliente, y la barra lo resuelve con su propio mapa.
 */
function seccionesDe (yo: Yo): Seccion[] {
  const secciones: Seccion[] = [{ href: '/inicio', etiqueta: 'Inicio', icono: 'inicio' }]

  // Sin condicion, y es la unica seccion asi: todo el mundo tiene al menos su propia vista —abrir la
  // jornada y ver su medidor—. Lo que cambia con el rol es cuanta gente mas se ve, y eso lo decide
  // `alcanceDeLive()` dentro de la pantalla, no la barra.
  secciones.push({ href: '/live', etiqueta: 'En vivo', icono: 'live' })

  if (puedeVerSeccion(yo.permissions.tasks, 'tasks')) {
    secciones.push({ href: '/procesos', etiqueta: GLOSARIO.proceso.plural, icono: 'procesos' })
  }

  if (puedeVerSeccion(yo.permissions.projects, 'projects')) {
    secciones.push({ href: '/espacios', etiqueta: GLOSARIO.espacio.plural, icono: 'espacios' })
  }

  // Licitaciones tampoco tiene permiso de Perfex propio: no es una entidad suya, son Espacios con una
  // empresa candidata colgada. La llave es la bandera de instalacion —el modulo se enciende por
  // cliente— y no `permissions.projects`: con ese permiso, la seccion aparecería en instalaciones
  // donde el recurso ni existe, y su listado devolveria 404.
  if (yo.secciones_habilitadas.includes('licitaciones')) {
    secciones.push({ href: '/licitaciones', etiqueta: GLOSARIO.licitacion.plural, icono: 'licitaciones' })
  }

  // Salas no tiene permiso de Perfex que consultar: no es una feature suya. Reservar una sala lo
  // puede hacer cualquiera del equipo, asi que la unica llave es la bandera de instalacion.
  if (yo.secciones_habilitadas.includes('salas')) {
    secciones.push({ href: '/salas', etiqueta: 'Salas', icono: 'salas' })
  }

  // Teletrabajo no tiene bandera de instalacion ni permiso de Perfex: las salas viven en LiveKit,
  // que Perfex no conoce. La seccion se muestra a todo el equipo y quien entra a cada sala lo decide
  // `dominio/teletrabajo.ts`, sala por sala. Condicionarla a `secciones_habilitadas` la esconderia
  // siempre, porque esa lista la arma el backend y no incluye modulos que no son suyos.
  secciones.push({
    href: '/teletrabajo',
    etiqueta: GLOSARIO.teletrabajo.singular,
    icono: 'teletrabajo'
  })

  if (puedeVerSeccion(yo.permissions.customers, 'customers')) {
    secciones.push({ href: '/clientes', etiqueta: 'Clientes', icono: 'clientes' })
  }

  if (puedeVerSeccion(yo.permissions.staff, 'staff')) {
    secciones.push({ href: '/equipo', etiqueta: 'Equipo', icono: 'equipo' })
  }

  // "Mi Área" no tiene permiso de Perfex propio: el cargo Director (`wiwo_core/cargos_areas.php`) no
  // otorga capabilities, asi que la llave es `is_director` y no `permissions.staff`. Un director sin
  // `staff.view` igual puede ver a su gente por esta puerta.
  if (yo.is_director) {
    secciones.push({ href: '/equipo/mi-area', etiqueta: 'Mi Área', icono: 'mi_area' })
  }

  // Administracion no tiene permiso de Perfex propio, y `is_admin` es demasiado ancha: en la base
  // hay una docena de staff marcados admin. La API exige `is_superadmin` en cada una de sus rutas
  // —avisos por correo, la escritura de `/settings`, el diagnostico de Google y la auditoria—, asi
  // que la barra usa la misma llave. Esconder el enlace es cosmetica: la compuerta esta en el back.
  if (yo.is_superadmin) {
    secciones.push({ href: '/administracion', etiqueta: 'Administración', icono: 'administracion' })
  }

  // Auditoria comparte llave con Administracion y no tiene una propia: la API exige `is_superadmin`
  // en `/audit`, `/presence` y `/sessions`, asi que la barra usa la misma. Va en su propia seccion y
  // no como una pestaña de Administracion porque no configura nada: mira.
  if (yo.is_superadmin) {
    secciones.push({ href: '/auditoria', etiqueta: 'Auditoría', icono: 'auditoria' })
  }

  return secciones
}
