import { pedir } from '@/datos/servidor'
import type { Yo } from '@/datos/tipos'
import { GLOSARIO } from '@/dominio/glosario'
import { SelectorTema } from '@/componentes/estructura/SelectorTema'
import { BarraLateral, BarraLateralMovil, type Seccion } from '@/componentes/estructura/BarraLateral'
import { Avatar } from '@/componentes/presentadores/Avatar'
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
    <div className="flex h-dvh overflow-hidden">

      <BarraLateral secciones={secciones} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-linea flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <BarraLateralMovil secciones={secciones} />
          <SelectorTema className="ml-auto" />
          <Avatar nombre={yo.full_name} imagen={yo.profile_image_url} />
          <BotonSalir />
        </header>
        {/* El unico contenedor de scroll vertical del armazon. `min-h-0` es lo que se lo permite:
            sin el, un hijo flex no baja de su altura de contenido y `overflow-y` no llega a actuar. */}
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">{children}</main>
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
  const secciones: Seccion[] = [{ href: '/', etiqueta: 'Inicio', icono: 'inicio' }]

  if (yo.permissions.tasks.includes('view')) {
    secciones.push({ href: '/procesos', etiqueta: GLOSARIO.proceso.plural, icono: 'procesos' })
  }

  if (yo.permissions.projects.includes('view')) {
    secciones.push({ href: '/espacios', etiqueta: GLOSARIO.espacio.plural, icono: 'espacios' })
  }

  if (yo.permissions.customers.includes('view')) {
    secciones.push({ href: '/clientes', etiqueta: 'Clientes', icono: 'clientes' })
  }

  if (yo.permissions.staff.includes('view')) {
    secciones.push({ href: '/equipo', etiqueta: 'Equipo', icono: 'equipo' })
  }

  return secciones
}
