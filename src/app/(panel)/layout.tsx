import Link from 'next/link'
import { pedir, pedirOpcional } from '@/datos/servidor'
import { leerSuplantador } from '@/datos/sesion'
import type { Yo } from '@/datos/tipos'
import { GLOSARIO } from '@/dominio/glosario'
import { puedeVerFocals, puedeVerMiArea, puedeVerSeccion } from '@/dominio/permisos'
import { intervaloDeLatido } from '@/datos/auditoria'
import { iaHabilitada } from '@/datos/ajustes'
import { intervaloDeLive, type EstadoDeJornada } from '@/datos/live'
import { intervaloDeVersion, versionDelServidor } from '@/datos/version'
import type { ConteoDeAvisos } from '@/datos/avisos'
import { SelectorTema } from '@/componentes/estructura/SelectorTema'
import { BarraLateral, BarraLateralMovil, type Seccion } from '@/componentes/estructura/BarraLateral'
import { PaletaDeComandos } from '@/componentes/paleta/PaletaDeComandos'
import type { Fijado } from '@/componentes/fijados/fijados'
import { BarraInferiorMovil } from '@/componentes/estructura/BarraInferiorMovil'
import { AppInstalable } from '@/componentes/estructura/AppInstalable'
import { BarraSuplantacion } from '@/componentes/estructura/BarraSuplantacion'
import { AtajoDirecto } from '@/componentes/estructura/AtajoDirecto'
import { Latido } from '@/componentes/auditoria/Latido'
import { OrbeChatIA } from '@/componentes/ia/OrbeChatIA'
import { Campana } from '@/componentes/avisos/Campana'
import { ControlJornada } from '@/componentes/live/ControlJornada'
import { Logo } from '@/componentes/estructura/Logo'
import { MenuUsuario } from '@/componentes/estructura/MenuUsuario'
import { ScrollSuave } from '@/componentes/estructura/ScrollSuave'
import { VigilanteDeVersion } from '@/componentes/estructura/VigilanteDeVersion'
import { vistasPermitidas } from '@/dominio/vistas-de-auditoria'
import { NOVEDADES, fechaMasReciente } from '@/dominio/novedades'

/** Sin fijados. Constante para que la barra reciba siempre la misma referencia. */
const SIN_FIJADOS: Fijado[] = []

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
  const [jornada, avisos, conIa, fijados] = await Promise.all([
    pedirOpcional<EstadoDeJornada>('/me/jornada'),
    pedirOpcional<ConteoDeAvisos>('/notifications/count'),
    // Con la capa de IA apagada el orbe no existe, en vez de existir y fallar: la API responde 404 a
    // todo `/ia/*` y la persona no podria distinguir "no esta contratado" de "se rompio".
    iaHabilitada(),
    // Los fijados del menu, por la misma regla: resueltos aca no aparecen un segundo despues
    // empujando los bloques de abajo. Si la API no los tiene (todavia sin la migracion 0900), el
    // menu se dibuja sin la seccion y nada mas.
    pedirOpcional<Fijado[]>('/me/fijados')
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

      {/* El service worker de la aplicacion instalable. Va aca por lo mismo que el vigilante: la
          version con la que se registra tiene que ser la de este JavaScript. */}
      <AppInstalable version={versionDelServidor()} />

      {/* Por el mismo motivo que el latido: el chat dejo de ser de un Espacio y su asunto es todo el
          panel. Montado aca —fuera del contenedor que scrollea— el orbe flota sobre cualquier
          pantalla, y el hilo sobrevive a navegar porque el armazon no se desmonta al cambiar de
          ruta. Le manda al servidor en que pantalla esta parada la persona, la misma cadena que el
          latido: ver `dominio/pantalla.ts`. */}
      {conIa && <OrbeChatIA />}

      {/* La paleta de comandos (Ctrl+K). Va en el armazon por lo mismo que el orbe: el atajo es de
          todo el panel y el armazon no se desmonta al navegar. Recibe las MISMAS secciones que la
          barra, ya filtradas por permisos, asi que no puede ofrecer una pantalla que el menu niega. */}
      <PaletaDeComandos secciones={secciones} />

      {yo.atajo !== undefined && <AtajoDirecto destino={yo.atajo} />}

      {/* `aurora` va aca y no en cada pantalla: es el lienzo del panel, no un adorno de la portada.
          Su capa es un `::before` fijo detras de todo (`globals.css`), asi que no ocupa lugar ni
          cambia la maqueta de ninguna de las ocho pantallas — solo les pone luz debajo. La barra
          lateral y la cabecera no llevan fondo propio a proposito: comparten el lienzo, y una barra
          de otro color partiria la ventana en dos mundos. */}
      <div className="aurora flex min-h-0 flex-1 overflow-hidden">

        <BarraLateral secciones={secciones} fijados={fijados.datos ?? SIN_FIJADOS} />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Alto + `pt-seguro`: en la aplicacion instalada la cabecera se dibuja debajo de la
              muesca (`viewport-fit=cover`), y los 56px tienen que empezar despues de ella. En el
              escritorio la zona segura vale 0 y la cabecera mide lo mismo que siempre. */}
          <header className="border-linea pt-seguro flex h-[calc(3.5rem_+_env(safe-area-inset-top,0px))] shrink-0 items-center gap-2 border-b px-3 xs:gap-3 xs:px-4">
            {/* Solo en movil: desde `md` el logo encabeza la barra lateral, y dos logos en pantalla
                serian la misma marca dicha dos veces. */}
            <Link href="/inicio" aria-label="Inicio" className="min-w-0 md:hidden">
              <Logo tamano="medio" />
            </Link>
            {/* El cajon se abre desde "Más" de la barra inferior; su hamburguesa queda escondida
                porque seria el mismo boton dos veces en una cabecera que ya no tiene lugar. */}
            <BarraLateralMovil secciones={secciones} className="hidden" />
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
              // Bajo 480px el medidor se angosta: sigue siendo lo mas importante de la cabecera,
              // pero en 360px no puede comerse el lugar de la campana y la cuenta.
              className="ml-auto max-xs:max-w-28"
            />
            <Campana inicial={avisos.datos} segundos={segundosDeLive} />
            {/* Bajo 480px el tema se cambia desde el menu de la cuenta: es lo que menos se toca de la
                cabecera, y en un telefono chico no entran cuatro controles y el logo. */}
            <SelectorTema className="max-xs:hidden" />
            <MenuUsuario nombre={yo.full_name} imagen={yo.profile_image_url} ultimaNovedad={fechaMasReciente(NOVEDADES)} />
          </header>
          {/* El unico contenedor de scroll vertical del armazon. `min-h-0` es lo que se lo permite:
              sin el, un hijo flex no baja de su altura de contenido y `overflow-y` no llega a actuar.
              `ScrollSuave` pone el `overflow-y` y el `<main>`; aca solo queda como se mide y se rellena. */}
          <ScrollSuave className="min-h-0 min-w-0 flex-1 p-4">{children}</ScrollSuave>
          {/* Solo por debajo de `md`, donde el riel no existe: los cuatro destinos de todos los dias
              al alcance del pulgar, y "Más" para el resto. Va despues del scroll y dentro de la
              columna, no flotando: asi el contenido termina justo encima y nada queda tapado. */}
          <BarraInferiorMovil secciones={secciones} />
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
 *
 * Cada seccion dice ademas a que bloque del menu va (`grupo`): las cuatro principales arriba, y el
 * resto en Operación, Comercial, Equipo y Administración. El agrupado es SOLO de presentacion
 * (`agruparSecciones` en `lib/navegacion.ts`): las llaves de abajo son las de siempre y deciden lo
 * mismo que antes. La lista entera viaja tambien a la paleta de comandos, que es por donde se llega
 * a lo que el menu deja plegado.
 */
function seccionesDe (yo: Yo): Seccion[] {
  const secciones: Seccion[] = [{ href: '/inicio', etiqueta: 'Inicio', icono: 'inicio', grupo: 'principal' }]

  // Sin condicion, y es la unica seccion asi: todo el mundo tiene al menos su propia vista —abrir la
  // jornada y ver su medidor—. Lo que cambia con el rol es cuanta gente mas se ve, y eso lo decide
  // `alcanceDeLive()` dentro de la pantalla, no la barra.
  secciones.push({ href: '/live', etiqueta: 'En vivo', icono: 'live', grupo: 'principal' })

  // Tampoco lleva condicion, y por el mismo motivo que `/live`: es el trabajo PROPIO. La pantalla no
  // lista nada que no este asignado a quien mira, asi que no hay permiso que preguntar — un perfil
  // sin `tasks.view` ve sus asignaciones igual, que es justamente la regla de `puedeVerSeccion`.
  // Va antes que Tareas: primero lo de uno, despues el listado de toda la casa.
  secciones.push({ href: '/mis-tareas', etiqueta: `Mis ${GLOSARIO.proceso.plural}`, icono: 'mis_tareas', grupo: 'principal' })

  if (puedeVerSeccion(yo.permissions.tasks, 'tasks')) {
    secciones.push({ href: '/procesos', etiqueta: GLOSARIO.proceso.plural, icono: 'procesos', grupo: 'operacion' })
    // Misma llave que Tareas: las recurrentes son Tareas, y su pantalla lista lo mismo que `/tasks`
    // deja ver. Entrada propia porque se configuran una vez y se buscan de nuevo meses despues.
    secciones.push({ href: '/procesos/recurrentes', etiqueta: 'Recurrentes', icono: 'recurrentes', grupo: 'operacion' })
  }

  // Tickets no tiene permiso en `/me`: la API abre el area a todo el equipo (`is_not_staff = 0`, o a
  // todos si `access_tickets_to_none_staff_members` esta encendida) y despues filtra por departamento.
  // Un contratista sin acceso ve la entrada y recibe el 403 explicado en la pantalla; esconderla
  // exigiria una bandera que `/me` no publica.
  secciones.push({ href: '/tickets', etiqueta: GLOSARIO.ticket.plural, icono: 'tickets', grupo: 'operacion' })

  if (puedeVerSeccion(yo.permissions.projects, 'projects')) {
    secciones.push({ href: '/proyectos', etiqueta: GLOSARIO.espacio.plural, icono: 'espacios', grupo: 'principal' })
  }

  // Prospectos contiene el acceso a sus licitaciones. La bandera de instalación habilita el módulo.
  if (yo.secciones_habilitadas.includes('prospectos')) {
    secciones.push({ href: '/prospectos', etiqueta: GLOSARIO.licitacion.plural, icono: 'licitaciones', grupo: 'comercial' })
  }

  // Upselling corresponde a oportunidades sobre clientes existentes.
  if (yo.secciones_habilitadas.includes('upsells')) {
    secciones.push({ href: '/upsells', etiqueta: GLOSARIO.upsell.plural, icono: 'upsells', grupo: 'comercial' })
  }

  // Salas no tiene permiso de Perfex que consultar: no es una feature suya. Reservar una sala lo
  // puede hacer cualquiera del equipo, asi que la unica llave es la bandera de instalacion.
  if (yo.secciones_habilitadas.includes('salas')) {
    secciones.push({ href: '/salas', etiqueta: 'Salas', icono: 'salas', grupo: 'operacion', plegable: 'reuniones' })
  }

  // Teletrabajo no tiene bandera de instalacion ni permiso de Perfex: las salas viven en LiveKit,
  // que Perfex no conoce. La seccion se muestra a todo el equipo y quien entra a cada sala lo decide
  // `dominio/teletrabajo.ts`, sala por sala. Condicionarla a `secciones_habilitadas` la esconderia
  // siempre, porque esa lista la arma el backend y no incluye modulos que no son suyos.
  secciones.push({
    href: '/teletrabajo',
    etiqueta: GLOSARIO.teletrabajo.singular,
    icono: 'teletrabajo',
    grupo: 'operacion',
    plegable: 'reuniones'
  })

  if (puedeVerSeccion(yo.permissions.customers, 'customers')) {
    secciones.push({ href: '/clientes', etiqueta: 'Clientes', icono: 'clientes', grupo: 'comercial' })
  }

  // Focals se muestra a quien es focal de al menos un Cliente —es su cartera— y ademas a la
  // superadministracion y a la gerencia, para quienes la MISMA pantalla es la cartera entera con el
  // focal de cada cuenta al lado. Fuera de esos dos casos no se ofrece: a quien no tiene cartera le
  // quedaba una lista vacia. Para el caso normal la llave es `yo.es_focal` y **no** el escalon: el
  // escalon y el hecho de responder por una cuenta son dos cosas distintas, y decidir solo por el
  // escalon se equivocaba en las dos direcciones —focales de escalon `staff` sin su propia pantalla,
  // jefaturas sin cuentas a cargo que si la veian—. Sigue siendo COSMETICA: la autorizacion del
  // servidor no se toca y esconder no
  // autoriza; el dato sale de la misma API que responde el 403. Ver `puedeVerFocals` para el caso de
  // una API vieja que todavia no manda el campo.
  if (puedeVerFocals(yo)) {
    secciones.push({ href: '/focals', etiqueta: GLOSARIO.focal.plural, icono: 'focals', grupo: 'comercial' })
  }

  if (puedeVerSeccion(yo.permissions.staff, 'staff')) {
    secciones.push({ href: '/equipo', etiqueta: 'Equipo', icono: 'equipo', grupo: 'equipo' })
  }

  // "Mi Área" no tiene permiso de Perfex propio: el cargo Director (`wiwo_core/cargos_areas.php`) no
  // otorga capabilities, asi que nunca dependio de `permissions.staff` y un director sin `staff.view`
  // igual ve a su gente por esta puerta.
  //
  // Desde que la pantalla es el organigrama (`GET /organigrama`) no hay llave que valga: le responde
  // algo a todo el mundo —quien no tiene area ni gente se ve a si mismo y a sus jefes—, y las dos
  // llaves anteriores escondian la entrada justo a quien mas la necesita. El porque, en
  // `puedeVerMiArea`.
  if (puedeVerMiArea()) {
    secciones.push({ href: '/equipo/mi-area', etiqueta: 'Mi Área', icono: 'mi_area', grupo: 'equipo' })
  }

  // Jerarquias tiene entrada propia y no solo los dos enlaces desde Equipo y Mi Área: quien tiene que
  // cargar el organigrama entra muchas veces, y una pantalla a la que solo se llega desde otra es
  // facil de no encontrar.
  //
  // La llave es `dirige_areas` y **no** `is_director`: aquel es el cargo de `tblcargos` —la regla
  // vieja— y hoy las 184 cuentas llevan cargo "Staff", asi que con esa llave la entrada no le
  // aparecia a ninguna jefatura. `dirige_areas` sale del `jefe_staffid` del arbol, que es
  // exactamente el criterio con el que la API decide el 403. Esconderla es cosmetica: la compuerta
  // esta en el back, y la pantalla muestra su mensaje tal cual.
  if (yo.dirige_areas || yo.is_admin || yo.is_superadmin) {
    secciones.push({ href: '/equipo/jerarquia', etiqueta: 'Jerarquías', icono: 'organigrama', grupo: 'equipo' })
  }

  // Administracion no tiene permiso de Perfex propio, y `is_admin` es demasiado ancha: en la base
  // hay una docena de staff marcados admin. La API exige `is_superadmin` en cada una de sus rutas
  // —avisos por correo, la escritura de `/settings`, el diagnostico de Google y la auditoria—, asi
  // que la barra usa la misma llave. Esconder el enlace es cosmetica: la compuerta esta en el back.
  if (yo.is_superadmin) {
    secciones.push({ href: '/administracion', etiqueta: 'Administración', icono: 'administracion', grupo: 'administracion' })
  }

  // Auditoria ya no comparte llave con Administracion: desde que tiene la pestaña de calidad de las
  // Tareas, tambien le corresponde a gerencia. La llave sale de `vistasPermitidas`, la misma que usa
  // la pantalla para repartir las pestañas, para que la barra no pueda ofrecer lo que la pantalla
  // niega ni al reves. Va en su propia seccion y no como pestaña de Administracion porque no
  // configura nada: mira.
  if (vistasPermitidas(yo).length > 0) {
    secciones.push({ href: '/auditoria', etiqueta: 'Auditoría', icono: 'auditoria', grupo: 'administracion' })
  }

  // Indicadores usa la misma llave que la pestaña de Calidad —gerencia o superadministracion— y no
  // la de Auditoria entera: son numeros de estructura, no material para investigar a una persona.
  // Va en su propia seccion porque no se mira junto con nada: se abre antes de una reunion.
  if (yo.is_superadmin || yo.escalon === 'gerencia') {
    secciones.push({ href: '/indicadores', etiqueta: 'Indicadores', icono: 'auditoria', grupo: 'administracion' })
  }

  return secciones
}
