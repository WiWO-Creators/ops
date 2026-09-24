import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { unstable_rethrow } from 'next/navigation'
import {
  ArrowRight,
  ChartNoAxesColumn,
  Compass,
  FolderKanban,
  LifeBuoy,
  type LucideIcon,
  TriangleAlert
} from 'lucide-react'
import { ResumenDeLaSemana } from '@/componentes/portal/ResumenDeLaSemana'
import {
  MOTIVO_SIN_PROXIMOS_DIAS,
  leerProximosDias,
  leerTickets,
  type GrupoDeProximosDias,
  type LecturaDeProximosDias,
  type LecturaDeTickets
} from '@/componentes/portal/resumen'
import { Tarjeta as TarjetaDeAviso } from '@/componentes/portal/piezas'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { Tarjeta, type TonoTarjeta } from '@/componentes/estructura/Tarjeta'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { BarraProgreso } from '@/componentes/proyecto/CabeceraProyecto'
import { PARAMETRO_TAREA } from '@/componentes/datos/tabla'
import { pedirPortal, proyectoUnicoDelPortal } from '@/datos/servidor'
import { cn } from '@/lib/clases'
import { formatearFecha } from '@/lib/fechas'
import type {
  AnuncioPortal,
  EspacioPortal,
  EstadoDeProceso,
  FilaDeProximosDias,
  ResumenPortal,
  TicketDelResumen
} from '@/datos/portal'
import type { YoPortal } from '@/datos/tipos'
import { saludar, seccionesDelPortal, type SeccionPortal } from '@/dominio/portal'
import { GLOSARIO } from '@/dominio/glosario'
import { PARAMETRO_TICKET } from '@/dominio/ticket-vista'
import { sinFallar } from './detalle'

export const metadata: Metadata = { title: 'Inicio · Portal de clientes' }

/**
 * Cuantas filas trae cada bloque secundario.
 *
 * Son un vistazo, no un listado: lo que no entra se busca en su pantalla, que esta a un enlace. Es
 * el mismo tope que usa el Inicio del colaborador, y por la misma razon —con mas filas los bloques
 * empujan la grilla de secciones fuera de toda pantalla razonable—.
 */
const FILAS_SECUNDARIAS = 5

/**
 * Inicio del portal, que es tambien el dashboard del cliente.
 *
 * === POR QUE ESTA PANTALLA SE PARECE AL INICIO DEL COLABORADOR ===
 *
 * Porque hacen lo mismo: decir que hay que hacer y a donde ir. Hasta ahora el colaborador tenia una
 * pantalla completa —saludo con la marca, su trabajo agrupado por vencimiento, sus {espacios}, lo
 * que sigue de cerca y la grilla de accesos— y el cliente un bloque plano de metricas con una lista
 * debajo. Dos pantallas con la misma funcion no tienen por que verse como dos productos distintos,
 * asi que esta copia el armado de `(panel)/inicio`: mismo contenedor, mismo saludo, mismos titulos
 * de seccion con su "Ver todo", mismas listas.
 *
 * Lo que NO se copia es `lienzo-vivo`: esa clase no pinta nada por si misma, es la marca que busca
 * `.aurora:has(.lienzo-vivo)` para poner en movimiento la luz del armazon, y la `.aurora` la pone
 * el armazon del panel. En el portal seria una clase muerta.
 *
 * === EL ORDEN DE LOS BLOQUES ===
 *
 * Primero lo que le habla al cliente —el resumen de la semana, escrito—, despues lo que vence hoy, despues sus {espacios}, sus tickets, y al final los accesos y las
 * novedades. Quien entra a ver como viene su trabajo lo encuentra arriba; quien entra a navegar
 * baja dos pantallazos.
 *
 * «Próximos {hitos}» ya no esta: lo reemplaza `ResumenDeLaSemana`, que dice lo mismo en prosa y
 * ademas lo explica. Tampoco estan la grilla de numeros ni la pantalla «Estado de {espacios}»: se
 * retiraron del portal.
 *
 * === CADA BLOQUE SE PIDE SIN QUE PUEDA TUMBAR LA PANTALLA ===
 *
 * `sinFallar` traduce el 403 y el 404 a "esta seccion no es para vos", que en una pantalla armada
 * por bloques es un bloque que no se dibuja y no un error. Los dos bloques que hacen su propio
 * viaje van ademas en SU limite de Suspense: Next hace streaming de cada uno, asi que el saludo y
 * lo que vence hoy se pinta con la primera respuesta en vez de esperar al mas lento.
 */
export default async function PortalInicio () {
  const { data: yo } = await pedirPortal<YoPortal>('/portal/me')
  const unico = yo.secciones_habilitadas.includes('projects') ? await proyectoUnicoDelPortal() : null
  const secciones = seccionesDelPortal(yo.secciones_habilitadas, unico)
  const resumen = await sinFallar<ResumenPortal>('/portal/resumen')

  return (
    // `max-w-6xl` y el aire vertical creciente son los del Inicio del colaborador: la portada es la
    // unica pantalla del portal sin tabla ni ficha, y lo que fija su ancho es la grilla de accesos.
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-1 py-6 sm:gap-14 sm:py-12">
      <Saludo nombre={saludar(yo)} />

      <ResumenDeLaSemana />

      <ProximosDias lectura={leerProximosDias(resumen?.proximos_dias)} />

      <Suspense fallback={null}>
        <MisEspacios />
      </Suspense>

      <MisTickets lectura={leerTickets(resumen?.tickets)} />

      <Secciones secciones={secciones} />

      <Suspense fallback={null}>
        <Novedades />
      </Suspense>
    </div>
  )
}

/**
 * Encabezado de la pantalla. El nombre va en gradiente; el resto, en tinta.
 *
 * Es el saludo del Inicio del colaborador, con el nombre del contacto. Hasta ahora el portal tenia
 * un `h1` de 20px: el mismo gesto de bienvenida, dos peldaños mas chico y sin la marca.
 *
 * @param nombre con que nombre saludar, ya resuelto por `saludar()`
 */
function Saludo ({ nombre }: { nombre: string }) {
  return (
    <header className="flex flex-col gap-3">
      <h1 className="font-titular text-pantalla font-extrabold tracking-tight text-texto">
        Hola,{' '}
        {/*
          El gradiente se recorta sobre el nombre y nada mas. Recortarlo sobre la frase entera deja
          "Hola" en el extremo mas claro del gradiente, que es justo donde peor se lee.
        */}
        <span
          className="texto-gradiente-marca"
          style={{ '--angulo-gradiente-marca': `${anguloDelDia()}deg` } as React.CSSProperties}
        >
          {nombre}
        </span>
      </h1>
      <p className="max-w-prose text-pretty text-titulo text-texto-tenue">
        Acá vas a encontrar todo lo que compartimos contigo.
      </p>
      {/* La barra es la firma de marca de la pantalla: es donde el gradiente puede ser gradiente. */}
      <span aria-hidden="true" className="mt-1 block h-1.5 w-32 rounded-control bg-gradiente-marca" />
    </header>
  )
}

/**
 * El angulo del sistema, 103deg: el gradiente corre a lo LARGO de la palabra.
 *
 * Recortado sobre texto, un gradiente casi vertical le cambia el color a cada letra por la mitad y
 * las palabras quedan partidas en dos.
 */
const ANGULO_BASE = 103

/** Cuanto puede apartarse del angulo base hacia cada lado, sin torcer el eje de lectura. */
const DESVIO_MAXIMO = 12

/**
 * Angulo del gradiente del nombre, distinto cada dia dentro del rango del sistema.
 *
 * Sale de la fecha del calendario y no de `Math.random`: asi el Server Component sigue siendo
 * deterministico entre pedidos del mismo dia y no hay destello de hidratacion.
 *
 * @returns un angulo estable durante todo el dia, dentro del rango de la marca
 */
function anguloDelDia (): number {
  const hoy = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const hash = [...hoy].reduce((acumulado, caracter) => acumulado * 31 + caracter.charCodeAt(0), 0)
  const pasos = DESVIO_MAXIMO * 2 + 1

  return ANGULO_BASE - DESVIO_MAXIMO + (Math.abs(hash) % pasos)
}

/**
 * El enlace al listado completo que acompaña a un titulo de seccion.
 *
 * @param href la pantalla que lista todo
 * @param etiqueta lo que dice el enlace; nombra el destino, no la accion de mirar
 */
function VerTodo ({ href, etiqueta }: { href: string, etiqueta: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 rounded-control px-3 py-2 text-base font-semibold text-acento transition-colors duration-150 ease-neo hover:bg-hover"
    >
      {etiqueta}
      <ArrowRight size={18} strokeWidth={2.25} aria-hidden="true" />
    </Link>
  )
}

/** Las clases de la lista de la portada, una sola vez para los tres bloques que la usan. */
const LISTA = 'flex flex-col divide-y divide-linea overflow-hidden rounded-tarjeta border border-linea bg-superficie-elevada shadow-1'

/** Las clases de la fila enlazada de esas listas. */
const FILA = 'flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors duration-150 ease-neo hover:bg-hover focus-visible:bg-hover'

/**
 * Lo que el cliente tiene para hoy, con lo vencido arriba en su propia tarjeta.
 *
 * Lo que vence en los dias siguientes no se lista: el servidor lo manda en el tramo `proximo`, pero
 * `leerProximosDias()` lo deja afuera y solo lo cuenta en el pie.
 *
 * === LOS TRAMOS LLEGAN ARMADOS, NO SE ARMAN ACA ===
 *
 * En el panel el navegador reparte por fecha lo que le llego paginado. Acá no puede: un cliente con
 * mas {espacios} que una pagina veria tramos incompletos sin ninguna señal. Los arma el servidor,
 * que es el unico que ve el conjunto entero, y ademas los ORDENA poniendo primero lo que espera una
 * respuesta del cliente. Reordenar acá un recorte del servidor mentiria sobre lo que quedo afuera.
 *
 * === LA CLAVE AUSENTE NO ES UNA LISTA VACIA ===
 *
 * `proximos_dias` no viaja cuando ningun {espacio} comparte su lista de {procesos}. Ahi el bloque
 * se dibuja como hueco, con su motivo, y nunca como «no tenés nada por vencer»: eso seria
 * tranquilizar al cliente sobre algo que nadie miro. Quien lo distingue es `leerProximosDias()`.
 *
 * @param lectura lo que decidio `leerProximosDias()`
 */
function ProximosDias ({ lectura }: { lectura: LecturaDeProximosDias }) {
  if (lectura.clase === 'no_se_sabe') {
    return (
      <section className="flex flex-col gap-6">
        <TituloModulo nivel="h2" titulo="Hoy" />

        <TarjetaDeAviso
          tono="apagado"
          icono={<Compass size={16} aria-hidden="true" className="shrink-0" />}
        >
          <p className="text-texto text-sm font-medium">No podemos decirte qué vence hoy</p>
          <p className="text-texto-tenue mt-1 text-sm">{MOTIVO_SIN_PROXIMOS_DIAS}</p>
        </TarjetaDeAviso>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-6">
      <TituloModulo nivel="h2" titulo="Hoy" />

      {lectura.clase === 'sin_vencimientos'
        ? (
          <p className="text-base text-texto-tenue">
            No hay {GLOSARIO.proceso.plural.toLowerCase()} para hoy.
            {lectura.restantes > 0 && ` Hay ${lectura.restantes} más en marcha.`}
          </p>
          )
        : (
          <>
            <div className="flex flex-col gap-5">
              {lectura.grupos.map((grupo) => (
                <GrupoDeVencimiento key={grupo.tramo} grupo={grupo} />
              ))}
            </div>

            {lectura.restantes > 0 && (
              <p className="text-sm text-texto-sutil">
                {lectura.restantes} {GLOSARIO.proceso.plural.toLowerCase()} más en marcha.
              </p>
            )}
          </>
          )}
    </section>
  )
}

/**
 * Un tramo de vencimiento, como tarjeta propia.
 *
 * Lo vencido se pinta de rojo, con el riel a la izquierda, el triangulo y su encabezado: quien no
 * distingue el rojo tiene que poder ver igual que ese bloque urge, y la palabra «Vencidas» es la
 * señal que lee un lector de pantalla. El tramo de hoy va sin encabezado: el titulo de la seccion
 * ya dice «Hoy», y repetirlo encima de la tabla era decir lo mismo dos veces.
 *
 * Las filas quedan sobre la superficie normal a proposito: el rojo marca el bloque, no el texto de
 * cada {proceso}, que es lo que hay que poder leer.
 *
 * @param grupo el tramo tal como lo armo el servidor
 */
function GrupoDeVencimiento ({ grupo }: { grupo: GrupoDeProximosDias }) {
  const urgente = grupo.tramo === 'vencido'

  return (
    <div
      aria-label={urgente ? undefined : grupo.etiqueta}
      className={cn(
        'overflow-hidden rounded-tarjeta border bg-superficie-elevada shadow-1',
        urgente ? 'border-l-4 border-texto-peligro/35 border-l-relleno-peligro' : 'border-linea'
      )}
    >
      {urgente && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-texto-peligro/25 bg-superficie-peligro px-5 py-4">
          <TriangleAlert size={20} strokeWidth={2.25} aria-hidden="true" className="shrink-0 text-texto-peligro" />
          <h3 className="font-titular text-titulo font-bold text-texto-peligro">{grupo.etiqueta}</h3>
          <Insignia tono="peligro" className="h-7 px-3 text-base font-bold tabular-nums ring-1 ring-inset ring-texto-peligro/30">
            {grupo.filas.length}
          </Insignia>
        </div>
      )}

      <ul className="flex flex-col divide-y divide-linea">
        {grupo.filas.map((fila) => (
          <FilaDeProceso key={fila.id} fila={fila} />
        ))}
      </ul>
    </div>
  )
}

/**
 * Un {proceso} del cliente, como fila de la portada.
 *
 * Marca las dos cosas que el cliente necesita separar de un vistazo y que una lista ordenada solo
 * por fecha entierra:
 *
 *   - `espera_tu_respuesta`: le pide algo a EL. Lleva la insignia en tono de atencion, porque es lo
 *     unico de la lista que puede resolver solo.
 *   - `en_progreso`: el equipo ya lo esta moviendo. Informa, no pide nada, asi que se dice con una
 *     insignia tranquila.
 *
 * La marca es la insignia y nada mas. Antes la fila llevaba ademas un riel de aviso de 4px a la
 * izquierda, y decia dos veces lo mismo: donde el tramo entero ya se pinta de peligro cuando esta
 * vencido, un segundo borde grueso por fila compite con esa señal en vez de sumarle.
 *
 * La fila abre el {proceso} dentro de su {espacio}, en la pestaña Tareas y con el modal abierto: el
 * portal no tiene pantalla de {proceso} suelto, y donde se responde una aprobacion es dentro del
 * {espacio} que la pidio. Estas filas solo salen de {espacios} que comparten la pestaña Tareas.
 *
 * @param fila el {proceso} tal como llego en su tramo
 */
function FilaDeProceso ({ fila }: { fila: FilaDeProximosDias }) {
  return (
    <li>
      {/*
        Enlace de verdad y no un `div` con `onClick`: asi la fila se abre con el teclado, se copia y
        se abre en otra pestaña.
      */}
      <Link href={`/portal/proyectos/${fila.project.id}?tab=tasks&${PARAMETRO_TAREA}=${fila.id}`} className={FILA}>
        <span className="min-w-0 flex-1 basis-full truncate text-base text-texto sm:basis-auto">
          {fila.name}
          <span className="block truncate text-sm text-texto-tenue">{fila.project.name}</span>
        </span>

        {fila.espera_tu_respuesta
          ? <Insignia tono="aviso" className="shrink-0">Espera tu respuesta</Insignia>
          : fila.en_progreso
            ? <Insignia tono="acento" className="shrink-0">En curso</Insignia>
            : <EstadoResuelto status={fila.status} />}

        <Fecha valor={fila.due_date} comoVencimiento className="shrink-0 text-sm tabular-nums" />
      </Link>
    </li>
  )
}

/**
 * Los {espacios} del cliente, con su avance.
 *
 * Va en su propio `<Suspense>`: es una segunda peticion y no puede retrasar la primera pintada. Sin
 * {espacios} no hay bloque —una caja vacia con titulo se lee como algo que fallo—.
 */
async function MisEspacios () {
  const espacios = await listar<EspacioPortal>(`/portal/projects?per_page=${FILAS_SECUNDARIAS}`)

  if (espacios.length === 0) return null

  // Con uno solo se habla en singular, igual que la navegacion: "Mis proyectos" promete una lista.
  const uno = espacios.length === 1
  const nombre = (uno ? GLOSARIO.espacio.singular : GLOSARIO.espacio.plural).toLowerCase()

  return (
    <section className="flex flex-col gap-6">
      <TituloModulo
        nivel="h2"
        titulo={`${uno ? 'Mi' : 'Mis'} ${nombre}`}
        acciones={
          <VerTodo href="/portal/proyectos" etiqueta={`Ver ${nombre}`} />
        }
      />

      <ul className={LISTA}>
        {espacios.map((espacio) => (
          <li key={espacio.id}>
            <Link href={`/portal/proyectos/${espacio.id}`} className={cn(FILA, 'flex-col items-stretch')}>
              <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="min-w-0 flex-1 truncate text-base text-texto">{espacio.name}</span>
                <span data-numerico className="shrink-0 text-sm text-texto-tenue tabular-nums">
                  {espacio.progress}%
                </span>
              </span>
              <BarraProgreso porcentaje={espacio.progress} className="mt-2" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Los tickets del contacto: el equivalente de «En seguimiento» del colaborador.
 *
 * Lo que se destaca es `esperando_tu_respuesta` —los tickets cuyo ultimo mensaje es del equipo—,
 * porque son los que estan detenidos de su lado. El resto son cosas de las que responde sin que le
 * pidan nada ahora mismo.
 *
 * Cuando la clave no viene no se dibuja NADA, y eso es deliberado: significa que este contacto no
 * tiene la seccion de soporte, y un "no podemos decirte" sobre una seccion que ni ve en el menu es
 * ruido. Es la diferencia con `ProximosDias`, donde la ausencia si se cuenta.
 *
 * @param lectura lo que decidio `leerTickets()`
 */
function MisTickets ({ lectura }: { lectura: LecturaDeTickets }) {
  if (lectura.clase !== 'tickets') return null

  return (
    <section className="flex flex-col gap-6">
      <TituloModulo
        nivel="h2"
        titulo={`Mis ${GLOSARIO.ticket.plural.toLowerCase()}`}
        acciones={<VerTodo href="/portal/soporte" etiqueta={`Ver ${GLOSARIO.ticket.plural.toLowerCase()}`} />}
      />

      {lectura.esperando > 0 && (
        <p className="rounded-tarjeta border-linea-fuerte bg-superficie-aviso border border-l-4 px-5 py-3 text-base text-texto">
          <span data-numerico className="tabular-nums">{lectura.esperando}</span>
          {lectura.esperando === 1 ? ' ticket espera' : ' tickets esperan'} tu respuesta.
        </p>
      )}

      <ul className={LISTA}>
        {lectura.filas.map((ticket) => (
          <FilaDeTicket key={ticket.id} ticket={ticket} />
        ))}
      </ul>
    </section>
  )
}

/**
 * Un ticket, como fila de la portada.
 *
 * La fecha de la derecha es la de la ULTIMA respuesta y no la de apertura: lo que el cliente busca
 * en esta lista es cual se movio y cual esta quieto. Un ticket sin respuestas lo dice con palabras
 * y no con el guion de "falta el dato", porque no falta: todavia no contesto nadie.
 *
 * @param ticket el ticket tal como llego en el resumen
 */
function FilaDeTicket ({ ticket }: { ticket: TicketDelResumen }) {
  const nuevo = ticket.no_leido === true

  return (
    <li>
      <Link href={`/portal/soporte?${PARAMETRO_TICKET}=${ticket.id}`} className={FILA}>
        <span className="min-w-0 flex-1 basis-full truncate text-base text-texto sm:basis-auto">
          <span className={nuevo ? 'font-semibold' : undefined}>{ticket.subject}</span>
          {/* La marca es texto y no solo peso: la negrita sola no la oye un lector de pantalla. */}
          {nuevo && <Insignia tono="acento" tamano="chico" className="ml-2 align-middle">Respuesta nueva</Insignia>}
          {ticket.project !== null && (
            <span className="block truncate text-sm text-texto-tenue">{ticket.project.name}</span>
          )}
        </span>

        <EstadoResuelto status={ticket.status} />

        {/*
          `last_reply` viaja en ISO-8601 UTC, como el resto de los instantes de este endpoint. Lo
          localiza `Fecha`, que ademas deja la forma relativa en el `title`: la absoluta se compara
          entre filas y la relativa dice de un vistazo cual esta quieto.
        */}
        <span className="shrink-0 text-sm text-texto-tenue">
          {ticket.last_reply === null
            ? 'Sin respuestas'
            : <Fecha valor={ticket.last_reply} conHora />}
        </span>
      </Link>
    </li>
  )
}

/**
 * El estado de un {proceso} o de un ticket, o nada si el catalogo no lo conoce.
 *
 * La API resuelve el estado en el servidor y manda `{ id, name, color }`, pero un `status` que no
 * este en el catalogo llega con `name` y `color` en `null`. Ahi la insignia NO se dibuja: una
 * pildora vacia, o una que diga `#12`, es ruido para quien mira su portal —el id de un catalogo
 * interno no le dice nada— y ademas parece un error de carga. El hueco se dibuja como hueco, que
 * en una fila de listado significa no ocupar lugar.
 *
 * @param status el estado tal como lo resolvio el servidor
 */
function EstadoResuelto ({ status }: { status: EstadoDeProceso }) {
  const nombre = typeof status.name === 'string' ? status.name.trim() : ''

  if (nombre === '') return null

  return <Insignia color={status.color} className="shrink-0">{nombre}</Insignia>
}

/** Como se presenta una seccion del portal en la grilla de accesos. */
interface PresentacionDeSeccion {
  descripcion: string
  icono: LucideIcon
  tono: TonoTarjeta
}

/**
 * Con que cara se dibuja cada seccion del portal.
 *
 * El catalogo de secciones sigue viviendo en `dominio/portal.ts`: esto es solo como se ven, y por
 * eso vive en la pantalla que las dibuja.
 */
const PRESENTACION: Record<string, PresentacionDeSeccion> = {
  '/portal/proyectos': {
    descripcion: 'Cada uno con su avance, su equipo y sus entregas.',
    icono: FolderKanban,
    tono: 'exito'
  },
  '/portal/gestion': {
    descripcion: 'El tablero del mes, con los números que seguimos.',
    icono: ChartNoAxesColumn,
    tono: 'violeta'
  },
  '/portal/soporte': {
    descripcion: 'Tus tickets abiertos, y uno nuevo cuando haga falta.',
    icono: LifeBuoy,
    tono: 'peligro'
  },
  // Archivos, Anuncios y Ayuda no figuran: `dominio/portal` retiro sus entradas del menu, asi que
  // la grilla —que se arma con lo que el menu enciende— no las puede pedir. Describirlas acá seria
  // una cara para una tarjeta que no se dibuja nunca.
}

/**
 * Como se dibuja una seccion que el catalogo todavia no describe.
 *
 * Existe porque la API puede encender una seccion antes que el frontend la conozca —`dominio/portal`
 * ya contempla ese caso en la navegacion— y una tarjeta sin descripcion ni icono rompe la grilla.
 * Con esto sale igual que las demas, con el nombre que la API le dio.
 */
const PRESENTACION_POR_DEFECTO: PresentacionDeSeccion = {
  descripcion: 'Una sección más de tu portal.',
  icono: Compass,
  tono: 'acento'
}

/**
 * La grilla de accesos a las secciones habilitadas.
 *
 * Es la misma grilla que cierra el Inicio del colaborador, con las mismas tarjetas grandes: hasta
 * ahora el portal la dibujaba como una fila de cajas con el nombre a secas, sin decir que hay
 * adentro de cada una.
 *
 * @param secciones lo que `seccionesDelPortal()` dejo encendido para este contacto
 */
function Secciones ({ secciones }: { secciones: SeccionPortal[] }) {
  if (secciones.length === 0) return null

  return (
    <section className="flex flex-col gap-6">
      <TituloModulo nivel="h2" titulo="Ir a" />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {secciones.map((seccion) => {
          const cara = PRESENTACION[seccion.href] ?? PRESENTACION_POR_DEFECTO

          return (
            <Tarjeta
              key={seccion.href}
              href={seccion.href}
              titulo={seccion.etiqueta}
              descripcion={cara.descripcion}
              icono={cara.icono}
              tono={cara.tono}
              tamano="grande"
            />
          )
        })}
      </div>
    </section>
  )
}

/** Cuantas novedades entran en la portada. El resto se lee en su pantalla. */
const NOVEDADES_EN_PORTADA = 3

/**
 * Los anuncios que el cliente todavia no descarto.
 *
 * Va al final y en su propio `<Suspense>`: es una tercera peticion, y lo que trae es una noticia,
 * no trabajo. Sin novedades sin leer no hay bloque.
 */
async function Novedades () {
  const anuncios = await listar<AnuncioPortal>('/portal/announcements')
  const nuevos = anuncios.filter((anuncio) => !anuncio.dismissed).slice(0, NOVEDADES_EN_PORTADA)

  if (nuevos.length === 0) return null

  return (
    <section className="flex flex-col gap-6">
      <TituloModulo
        nivel="h2"
        titulo="Novedades"
        acciones={<VerTodo href="/portal/anuncios" etiqueta="Ver anuncios" />}
      />

      <ul className={LISTA}>
        {nuevos.map((anuncio) => (
          <li key={anuncio.id}>
            <Link href="/portal/anuncios" className={FILA}>
              <span className="min-w-0 flex-1 basis-full truncate text-base text-texto sm:basis-auto">
                {anuncio.name}
              </span>
              <span className="shrink-0 text-sm text-texto-tenue">
                {formatearFecha(anuncio.date_added)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Trae un listado del portal y devuelve una lista vacia si algo falla.
 *
 * Los bloques secundarios son un vistazo: si su peticion se cae, lo que tiene que seguir en pie es
 * el resto de la pantalla. Sin este `catch`, el error atraviesa el limite de Suspense y se lleva
 * puesta la pagina entera.
 *
 * `unstable_rethrow` es lo primero del `catch` y no es un detalle: `pedirPortal()` resuelve la
 * sesion caida llamando a `redirect()`, que en Next **funciona lanzando**. Un `catch` pelado se
 * tragaba esa señal y convertia el "andá a entrar de nuevo" en una lista vacia.
 *
 * @param ruta la ruta del portal, ya armada con sus filtros
 * @returns las filas, o una lista vacia si la seccion no es para este contacto o la API fallo
 */
async function listar<T> (ruta: string): Promise<T[]> {
  try {
    return await sinFallar<T[]>(ruta) ?? []
  } catch (fallo: unknown) {
    unstable_rethrow(fallo)

    return []
  }
}
