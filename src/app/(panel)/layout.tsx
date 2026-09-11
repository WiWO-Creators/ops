import Link from 'next/link'
import { pedir, pedirOpcional } from '@/datos/servidor'
import { leerSuplantador } from '@/datos/sesion'
import type { Yo } from '@/datos/tipos'
import { GLOSARIO } from '@/dominio/glosario'
import { puedeVerFocals, puedeVerSeccion } from '@/dominio/permisos'
import { intervaloDeLatido } from '@/datos/auditoria'
import { iaHabilitada } from '@/datos/ajustes'
import { intervaloDeLive, type EstadoDeJornada } from '@/datos/live'
import { intervaloDeVersion, versionDelServidor } from '@/datos/version'
import type { ConteoDeAvisos } from '@/datos/avisos'
import { SelectorTema } from '@/componentes/estructura/SelectorTema'
import { BarraLateral, BarraLateralMovil, type Seccion } from '@/componentes/estructura/BarraLateral'
import { BarraSuplantacion } from '@/componentes/estructura/BarraSuplantacion'
import { Latido } from '@/componentes/auditoria/Latido'
import { OrbeChatIA } from '@/componentes/ia/OrbeChatIA'
import { Campana } from '@/componentes/avisos/Campana'
import { ControlJornada } from '@/componentes/live/ControlJornada'
import { Logo } from '@/componentes/estructura/Logo'
import { MenuUsuario } from '@/componentes/estructura/MenuUsuario'
import { ScrollSuave } from '@/componentes/estructura/ScrollSuave'
import { VigilanteDeVersion } from '@/componentes/estructura/VigilanteDeVersion'

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
  const [jornada, avisos, conIa] = await Promise.all([
    pedirOpcional<EstadoDeJornada>('/me/jornada'),
    pedirOpcional<ConteoDeAvisos>('/notifications/count'),
    // Con la capa de IA apagada el orbe no existe, en vez de existir y fallar: la API responde 404 a
    // todo `/ia/*` y la persona no podria distinguir "no esta contratado" de "se rompio".
    iaHabilitada()
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

      {/* Tampoco pinta nada mientras no haya nada que decir: avisa cuando el servidor pasa a servir
          otra version que la que esta pestaña tiene cargada, y recibe con la obra del monito a quien
          acepta actualizar. Va en el armazon —como el latido— porque el bundle viejo es de todo el
          panel, no de una pantalla. La version se resuelve aca, en el servidor, y viaja como prop:
          es el unico valor del que se sabe que corresponde al JavaScript que se acaba de mandar. */}
      <VigilanteDeVersion version={versionDelServidor()} segundos={intervaloDeVersion()} />

      {/* Por el mismo motivo que el latido: el chat dejo de ser de un Espacio y su asunto es todo el
          panel. Montado aca —fuera del contenedor que scrollea— el orbe flota sobre cualquier
          pantalla, y el hilo sobrevive a navegar porque el armazon no se desmonta al cambiar de
          ruta. Le manda al servidor en que pantalla esta parada la persona, la misma cadena que el
          latido: ver `dominio/pantalla.ts`. */}
      {conIa && <OrbeChatIA />}

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
                `h-14` fijos.

                Esta instancia —y solo esta— es ademas la compuerta de entrada: si consta que no hay
                jornada abierta, monta el modal que obliga a elegir Proyecto y Tarea antes de seguir.
                Va aca porque el armazon esta en las ocho pantallas y no se desmonta al navegar, asi
                que no hay ruta del panel que se salte el bloqueo. Ver `ControlJornada`. */}
            <ControlJornada
              variante="compacta"
              segundos={segundosDeLive}
              inicial={jornada.datos}
              // Para listar SUS Tareas al elegir sobre cual se esta midiendo: solo se puede arrancar
              // un cronometro sobre una Tarea asignada a uno, y la sesion ya esta resuelta acá.
              staffId={yo.id}
              // Primer escalon de la jerarquia del modal. No se elige: la API saca el `staff_id` del
              // token, asi que un combo de personas prometeria algo que el backend rechaza.
              nombre={yo.full_name}
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

  // Tampoco lleva condicion, y por el mismo motivo que `/live`: es el trabajo PROPIO. La pantalla no
  // lista nada que no este asignado a quien mira, asi que no hay permiso que preguntar — un perfil
  // sin `tasks.view` ve sus asignaciones igual, que es justamente la regla de `puedeVerSeccion`.
  // Va antes que Tareas: primero lo de uno, despues el listado de toda la casa.
  secciones.push({ href: '/mis-tareas', etiqueta: `Mis ${GLOSARIO.proceso.plural}`, icono: 'mis_tareas' })

  if (puedeVerSeccion(yo.permissions.tasks, 'tasks')) {
    secciones.push({ href: '/procesos', etiqueta: GLOSARIO.proceso.plural, icono: 'procesos' })
  }

  if (puedeVerSeccion(yo.permissions.projects, 'projects')) {
    secciones.push({ href: '/espacios', etiqueta: GLOSARIO.espacio.plural, icono: 'espacios' })
  }

  // Prospectos contiene el acceso a sus licitaciones. La bandera de instalación habilita el módulo.
  if (yo.secciones_habilitadas.includes('prospectos')) {
    secciones.push({ href: '/prospectos', etiqueta: GLOSARIO.licitacion.plural, icono: 'licitaciones' })
  }

  // Upselling corresponde a oportunidades sobre clientes existentes.
  if (yo.secciones_habilitadas.includes('upsells')) {
    secciones.push({ href: '/upsells', etiqueta: GLOSARIO.upsell.plural, icono: 'upsells' })
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

  // Focals se muestra de focal hacia arriba. Iba sin condicion —la compuerta real es la API, que
  // responde 403 a quien no es focal ni jefatura, y la pantalla lo dice con `SinPermiso`—, pero el
  // cliente pidio lo contrario: que la entrada exista solo para quien la puede usar. Sigue siendo
  // COSMETICA: la autorizacion del servidor no se toca, y esconder no autoriza. El escalon lo
  // resuelve la API en `GET /me` (`yo.nivel`), asi que esto no es una segunda opinion sobre el
  // permiso sino la lectura del mismo dato. Ver `puedeVerFocals` para el caso del `nivel` ausente.
  if (puedeVerFocals(yo.nivel)) {
    secciones.push({ href: '/focals', etiqueta: GLOSARIO.focal.plural, icono: 'focals' })
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

  // Organigrama tiene entrada propia y no vive solo dentro de Administracion: la API lo abre a quien
  // administra Y a quien dirige un area —`GET /jerarquia` le sirve su rama—, asi que colgarlo de una
  // seccion que la barra solo le muestra a un superadministrador lo dejaba imposible de encontrar
  // para la mitad de quienes lo necesitan.
  //
  // La llave es `dirige_areas` y **no** `is_director`: aquel es el cargo de `tblcargos` —la regla
  // vieja— y hoy las 184 cuentas llevan cargo "Staff", asi que con esa llave la entrada no le
  // aparecia a ningun jefe de area. `dirige_areas` sale del `jefe_staffid` del arbol, que es
  // exactamente el criterio con el que la API decide el 403.
  if (yo.dirige_areas || yo.is_admin || yo.is_superadmin) {
    secciones.push({ href: '/administracion/organigrama', etiqueta: 'Organigrama', icono: 'organigrama' })
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
