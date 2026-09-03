import Link from 'next/link'
import { pedir } from '@/datos/servidor'
import type { Yo } from '@/datos/tipos'
import { GLOSARIO } from '@/dominio/glosario'
import { SelectorTema } from '@/componentes/estructura/SelectorTema'
import { BarraLateral, BarraLateralMovil, type Seccion } from '@/componentes/estructura/BarraLateral'
import { Logo } from '@/componentes/estructura/Logo'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { ScrollSuave } from '@/componentes/estructura/ScrollSuave'
import { BotonSalir } from './BotonSalir'

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

  return (
    // `h-dvh` y no `min-h-dvh`: el armazon mide exactamente la ventana para que el scroll ocurra
    // dentro de `main` y la barra lateral y la cabecera queden fijas. Con `min-h` el armazon crece
    // con el contenido, y como el `body` no scrollea, lo que sobresale queda inalcanzable.
    //
    // `aurora` va aca y no en cada pantalla: es el lienzo del panel, no un adorno de la portada. Su
    // capa es un `::before` fijo detras de todo (`globals.css`), asi que no ocupa lugar ni cambia la
    // maqueta de ninguna de las ocho pantallas — solo les pone luz debajo. La barra lateral y la
    // cabecera no llevan fondo propio a proposito: comparten el lienzo, y una barra de otro color
    // partiria la ventana en dos mundos.
    <div className="aurora flex h-dvh overflow-hidden">

      <BarraLateral secciones={secciones} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-linea flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <Link href="/inicio" aria-label="Inicio" className="min-w-0">
            <Logo tamano="medio" />
          </Link>
          <BarraLateralMovil secciones={secciones} />
          <SelectorTema className="ml-auto" />
          <Avatar nombre={yo.full_name} imagen={yo.profile_image_url} />
          <BotonSalir />
        </header>
        {/* El unico contenedor de scroll vertical del armazon. `min-h-0` es lo que se lo permite:
            sin el, un hijo flex no baja de su altura de contenido y `overflow-y` no llega a actuar.
            `ScrollSuave` pone el `overflow-y` y el `<main>`; aca solo queda como se mide y se rellena. */}
        <ScrollSuave className="min-h-0 min-w-0 flex-1 p-4">{children}</ScrollSuave>
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

  if (yo.permissions.tasks.includes('view')) {
    secciones.push({ href: '/procesos', etiqueta: GLOSARIO.proceso.plural, icono: 'procesos' })
  }

  if (yo.permissions.projects.includes('view')) {
    secciones.push({ href: '/espacios', etiqueta: GLOSARIO.espacio.plural, icono: 'espacios' })
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

  if (yo.permissions.customers.includes('view')) {
    secciones.push({ href: '/clientes', etiqueta: 'Clientes', icono: 'clientes' })
  }

  if (yo.permissions.staff.includes('view')) {
    secciones.push({ href: '/equipo', etiqueta: 'Equipo', icono: 'equipo' })
  }

  // Administracion no tiene permiso de Perfex propio: la API exige `is_admin` en cada una de sus
  // rutas (hoy solo avisos por correo), asi que la barra usa la misma llave.
  if (yo.is_admin) {
    secciones.push({ href: '/administracion/correo', etiqueta: 'Avisos por correo', icono: 'administracion' })
  }

  return secciones
}
