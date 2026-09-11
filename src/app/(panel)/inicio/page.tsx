import { Suspense } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Building2,
  Columns3,
  FolderKanban,
  LifeBuoy,
  ListChecks,
  TriangleAlert,
  Users
} from 'lucide-react'
import { cn } from '@/lib/clases'
import { pedir, pedirOpcional } from '@/datos/servidor'
import type { Yo } from '@/datos/tipos'
import type { Espacio, Proceso } from '@/datos/recursos'
import type { EstadoDeJornada } from '@/datos/live'
import { cargarLookups, listaDe } from '@/datos/lookups'
import type { OpcionFiltro } from '@/definiciones/tipos'
import { opcionesDeEstados } from '@/dominio/estados-tarea'
import { GLOSARIO } from '@/dominio/glosario'
import { agruparPorVencimiento, cuantosNoListados, type GrupoInicio } from '@/dominio/inicio'
import { puedeVerSeccion } from '@/dominio/permisos'
import { Tarjeta, type TonoTarjeta } from '@/componentes/estructura/Tarjeta'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { PARAMETRO_TAREA } from '@/componentes/datos/tabla'
import { EstadoDeTarea } from '@/componentes/proyecto/EstadoDeTarea'
import { ModalTarea } from '@/componentes/proyecto/ModalTarea'
import { AvisoJornada } from './AvisoJornada'
import { ResumenDelDia } from './ResumenDelDia'

/**
 * Cuantos procesos propios se traen para armar la pantalla.
 *
 * Alcanza para llenar los tres tramos con margen y evita paginar en una pantalla que no tiene
 * controles de paginacion. Lo que exceda se cuenta, no se pierde: el enlace al listado completo esta
 * siempre.
 */
const PROCESOS_A_TRAER = 60

/**
 * Donde vive el soporte de wiwo.
 *
 * Es un sitio aparte, no una pantalla del panel: va como constante y no suelta en el JSX para que
 * mudarlo sea cambiar una linea y no salir a buscar la URL por el arbol.
 */
const URL_SOPORTE = 'https://wiwo.center'

/**
 * Inicio del panel.
 *
 * Hace dos cosas en una pantalla: dice a donde ir y muestra lo que hay que hacer hoy. El orden no es
 * casual — primero el trabajo propio y al final el acceso a las secciones. Quien entra a trabajar
 * encuentra su trabajo; quien entra a navegar baja dos pantallazos.
 *
 * El aviso del cronometro olvidado ya no vive aca: lo dice el control de jornada de la cabecera, en
 * las ocho pantallas y no solo al entrar. Mostrarlo tambien aca serian dos contadores del mismo
 * hecho, uno de ellos parado.
 *
 * Lo que si vive aca es `AvisoJornada`, que no es un contador: es el recordatorio de lo que FALTA
 * —abrir la jornada, elegir el Proyecto, elegir la Tarea— y desaparece en cuanto no falta nada.
 *
 * Los permisos aca solo **ocultan controles**: la API filtra igual. Se pide `/tasks` unicamente si
 * quien mira puede verlos, porque sin permiso la peticion responde 403 y tumbaria la pantalla entera
 * por una seccion que ni siquiera le corresponde.
 */
export default async function InicioPage () {
  const { data: yo } = await pedir<Yo>('/me')

  // Los dos viajes salen juntos: el recordatorio de jornada no tiene por que esperar a los procesos
  // ni al reves. Va por `pedirOpcional` porque un fallo leyendo la jornada no puede tumbar la
  // portada entera — el aviso simplemente no se pinta.
  const [{ procesos, total }, jornada, estados] = await Promise.all([
    misProcesos(yo),
    pedirOpcional<EstadoDeJornada>('/me/jornada'),
    estadosDeTarea()
  ])

  const grupos = agruparPorVencimiento(procesos)
  const restantes = cuantosNoListados(procesos, total)

  // La capa de luz vive en el armazon del panel, no aca: pintarla tambien en el Inicio la dibujaba
  // dos veces. Esta pantalla no lleva alto ni `overflow-y-auto` propios — el scroll es el del
  // armazon, y un segundo contenedor scrolleable daba dos barras superpuestas.
  //
  // `lienzo-vivo` no pinta nada: es la marca que el armazon busca para poner en movimiento la luz
  // que ya esta puesta. La portada es la unica pantalla que se mira de paso, y la unica donde ese
  // movimiento no queda debajo de datos.
  return (
    // `max-w-6xl` y no `5xl`: la portada es la unica pantalla sin tabla ni ficha, y el ancho de
    // lectura no la limita —lo que la limita es la grilla de accesos, que con 1152px entra en tres
    // columnas holgadas en vez de tres apretadas. El aire vertical crece con la ventana: en una
    // pantalla chica el contenido no sobra y separar de mas obliga a deslizar para ver lo urgente.
    <div className="lienzo-vivo mx-auto flex max-w-6xl flex-col gap-10 px-1 py-6 sm:gap-14 sm:py-12">
      <Saludo nombre={yo.firstname} />

      <AvisoJornada inicial={jornada.datos} />

      <ResumenDelDia />

      {puedeVerSeccion(yo.permissions.tasks, 'tasks') && (
        <MiTrabajo grupos={grupos} restantes={restantes} estados={estados} />
      )}

      {/*
        Los dos bloques que siguen son async y van cada uno en SU limite de Suspense. Next hace
        streaming del boundary: el saludo, el cronometro y "Mi trabajo" se pintan con la primera
        respuesta —igual de rapido que antes— y estos aterrizan cuando su listado conteste, sin una
        sola peticion desde el navegador. Un solo Suspense para los dos haria que el mas lento
        retuviera al otro.
      */}
      {puedeVerSeccion(yo.permissions.projects, 'projects') && (
        <Suspense fallback={null}>
          <MisProyectos staffId={yo.id} />
        </Suspense>
      )}

      {puedeVerSeccion(yo.permissions.tasks, 'tasks') && (
        <Suspense fallback={null}>
          <EnSeguimiento staffId={yo.id} estados={estados} />
        </Suspense>
      )}

      <Secciones yo={yo} />

      {/* El detalle es el mismo de los listados y se abre con el mismo `?tarea={id}`. Va en un
          limite de Suspense porque lee `useSearchParams`: sin el, el build de esta pagina falla. */}
      <Suspense fallback={null}>
        <ModalTarea
          puedeEditar={yo.permissions.tasks.includes('edit')}
          puedeBorrar={yo.permissions.tasks.includes('delete')}
        />
      </Suspense>
    </div>
  )
}

/**
 * Trae los procesos asignados a quien mira, del vencimiento mas cercano al mas lejano.
 *
 * Un fallo aca no puede tumbar la pantalla: si el listado no viene, el inicio sigue sirviendo para
 * navegar, que es la mitad de su trabajo. Por eso devuelve una lista vacia en vez de propagar.
 *
 * @param yo la sesion, para el filtro de asignacion y para el permiso
 * @returns los procesos propios, o una lista vacia si no hay permiso o la API fallo
 */
async function misProcesos (yo: Yo): Promise<{ procesos: Proceso[], total: number }> {
  if (!puedeVerSeccion(yo.permissions.tasks, 'tasks')) return { procesos: [], total: 0 }

  try {
    const { data, meta } = await pedir<Proceso[]>(
      `/tasks?assignee=${yo.id}&sort=due_date&per_page=${PROCESOS_A_TRAER}`
    )

    return { procesos: data, total: meta?.pagination?.total ?? data.length }
  } catch {
    return { procesos: [], total: 0 }
  }
}

/**
 * El catalogo de estados de Tarea, para las insignias de los dos bloques de trabajo.
 *
 * Va por `try`/`catch` y no por `cargarLookups` a secas por la misma regla que el resto de la
 * portada: si `/lookups` se cae, el Inicio sigue sirviendo para ver el trabajo y para navegar. Sin
 * catalogo las insignias no se pintan —`<EstadoDeTarea>` se encarga—, que es mejor que una columna
 * de ids sueltos.
 *
 * @returns `task_statuses` como opciones, o vacio si la API fallo
 */
async function estadosDeTarea (): Promise<OpcionFiltro[]> {
  try {
    return opcionesDeEstados(listaDe(await cargarLookups(), 'task_statuses'))
  } catch {
    return []
  }
}

/**
 * Cuantas filas trae cada uno de los dos bloques secundarios.
 *
 * Son un vistazo, no un listado: lo que no entra se busca en su pantalla, que esta a un enlace. Con
 * mas filas los dos bloques empujan las "Secciones" fuera de toda pantalla razonable.
 */
const FILAS_SECUNDARIAS = 5

/**
 * Los Espacios que integra quien mira.
 *
 * Va en su propio `<Suspense>`: es una segunda peticion y no puede retrasar la primera pintada.
 * Copia el `try/catch` de `misProcesos()` por la misma razon —un listado caido no puede tumbar la
 * portada— y no muestra caja vacia: sin Espacios, no hay bloque.
 *
 * @param staffId a quien pertenecen los Espacios
 */
async function MisProyectos ({ staffId }: { staffId: number }) {
  const espacios = await listar<Espacio>(
    `/projects?filter[member]=${staffId}&per_page=${FILAS_SECUNDARIAS}&sort=deadline`
  )

  if (espacios.length === 0) return null

  return (
    <section className="flex flex-col gap-6">
      <TituloModulo
        nivel="h2"
        titulo={`Mis ${GLOSARIO.espacio.plural.toLowerCase()}`}
        acciones={<VerTodo href="/espacios" etiqueta={`Ver ${GLOSARIO.espacio.plural.toLowerCase()}`} />}
      />

      <ul className="flex flex-col divide-y divide-linea overflow-hidden rounded-tarjeta border border-linea bg-superficie-elevada shadow-1">
        {espacios.map((espacio) => (
          <li key={espacio.id}>
            <Link
              href={`/espacios/${espacio.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 transition-colors duration-150 ease-neo hover:bg-hover focus-visible:bg-hover"
            >
              <span className="min-w-0 flex-1 basis-full truncate text-base text-texto sm:basis-auto">{espacio.name}</span>
              <span className="shrink-0 text-sm text-texto-tenue">
                {espacio.counts.tasks_open} {GLOSARIO.proceso.plural.toLowerCase()} abiertas
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Los Procesos donde quien mira es seguidor: los que revisa, no los que hace.
 *
 * Es informacion distinta de "Mi trabajo" y por eso va aparte: son cosas de las que uno responde sin
 * tenerlas asignadas, y hoy no aparecen en ninguna parte de la portada.
 *
 * @param staffId de quien es el seguimiento
 */
async function EnSeguimiento ({ staffId, estados }: { staffId: number, estados: OpcionFiltro[] }) {
  const procesos = await listar<Proceso>(
    `/tasks?filter[follower]=${staffId}&sort=due_date&per_page=${FILAS_SECUNDARIAS}`
  )

  if (procesos.length === 0) return null

  return (
    <section className="flex flex-col gap-6">
      <TituloModulo nivel="h2" titulo="En seguimiento" />

      <ul className="flex flex-col divide-y divide-linea overflow-hidden rounded-tarjeta border border-linea bg-superficie-elevada shadow-1">
        {procesos.map((proceso) => (
          <FilaDeProceso key={proceso.id} proceso={proceso} estados={estados} />
        ))}
      </ul>
    </section>
  )
}

/**
 * Trae un listado y devuelve una lista vacia si algo falla.
 *
 * Los dos bloques secundarios son adornos de la portada: si su peticion se cae, lo que tiene que
 * seguir en pie es el resto de la pantalla. Sin este `catch`, el error del listado atraviesa el
 * limite de Suspense y se lleva puesta la pagina entera.
 *
 * @param ruta la ruta ya armada, con sus filtros
 * @returns las filas, o una lista vacia si la API fallo
 */
async function listar<T> (ruta: string): Promise<T[]> {
  try {
    const { data } = await pedir<T[]>(ruta)

    return data
  } catch {
    return []
  }
}

/** Encabezado de la pantalla. El nombre va en gradiente; el resto, en tinta. */
function Saludo ({ nombre }: { nombre: string }) {
  return (
    <header className="flex flex-col gap-3">
      <h1 className="font-titular text-pantalla font-extrabold tracking-tight text-texto">
        Hola,{' '}
        {/*
          El gradiente se recorta sobre el nombre y nada mas. Recortarlo sobre la frase entera deja
          "Hola" en el extremo mas claro del gradiente, que es justo donde peor se lee.
        */}
        <span className="texto-gradiente-marca" style={{ '--angulo-gradiente-marca': `${anguloDelDia()}deg` } as React.CSSProperties}>
          {nombre}
        </span>
      </h1>
      {/* La pregunta es la segunda voz del saludo, no una nota al pie: a 13px se leia como una
          advertencia de sistema debajo de un titulo de 56px. */}
      <p className="max-w-prose text-pretty text-titulo text-texto-tenue">¿Qué vas a mover hoy?</p>
      {/* La barra es la firma de marca de la pantalla: es donde el gradiente puede ser gradiente. */}
      <span aria-hidden="true" className="mt-1 block h-1.5 w-32 rounded-control bg-gradiente-marca" />
    </header>
  )
}

/**
 * El enlace al listado completo que acompaña a un titulo de seccion.
 *
 * Vive como funcion porque son dos secciones con el mismo gesto —"esto es un vistazo, el listado
 * esta alla"— y dos copias de la misma fila de clases divergen en cuanto alguien toca una.
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

/**
 * El angulo del sistema, 103deg: el gradiente corre a lo LARGO de la palabra.
 *
 * `--relleno-gradiente-marca` y la barrita usan este mismo angulo. No es decorativo: recortado sobre
 * texto, un gradiente casi vertical le cambia el color a cada letra por la mitad y las palabras
 * quedan partidas en dos.
 */
const ANGULO_BASE = 103

/**
 * Cuanto puede apartarse del angulo base, hacia cada lado.
 *
 * Estrecho a proposito. La rotacion libre —cualquier angulo de 0 a 359— hacia que un dia el
 * gradiente cruzara el nombre en diagonal y otro de arriba a abajo, y ahi el degrade deja de leerse
 * como degrade: se ve como dos colores pegados con un corte en el medio. Doce grados alcanzan para
 * que el saludo no sea identico todos los dias y no llegan a torcer el eje de lectura.
 */
const DESVIO_MAXIMO = 12

/**
 * Angulo del gradiente del nombre, distinto cada dia dentro del rango del sistema.
 *
 * Sale de la fecha del calendario (no de `Math.random`): asi el server component sigue siendo
 * deterministico entre pedidos del mismo dia, y no hay destello de hidratacion por un valor que el
 * cliente calcularia distinto al servidor.
 *
 * @returns un angulo entre `ANGULO_BASE - DESVIO_MAXIMO` y `ANGULO_BASE + DESVIO_MAXIMO`, estable
 *   durante todo el dia
 */
function anguloDelDia (): number {
  const hoy = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const hash = [...hoy].reduce((acumulado, caracter) => acumulado * 31 + caracter.charCodeAt(0), 0)
  const pasos = DESVIO_MAXIMO * 2 + 1

  return ANGULO_BASE - DESVIO_MAXIMO + (Math.abs(hash) % pasos)
}

interface PropsMiTrabajo {
  grupos: ReturnType<typeof agruparPorVencimiento>
  restantes: number
  /** `task_statuses` de `GET /lookups`. Vacio no pinta insignias. */
  estados: OpcionFiltro[]
}

/**
 * Los procesos propios, agrupados por cercania del vencimiento.
 *
 * Sin nada asignado no se muestra una caja vacia: se muestra la frase y el enlace al listado. Un
 * estado vacio con marco se lee como "algo fallo"; sin marco, como "no tenés nada", que es lo cierto.
 *
 * Cada fila abre el detalle sin salir del Inicio: escribe `?tarea={id}`, que es el mismo parametro
 * que leen los listados. Ver la tarea desde aca no obliga a ir a buscarla al listado completo.
 */
function MiTrabajo ({ grupos, restantes, estados }: PropsMiTrabajo) {
  return (
    <section className="flex flex-col gap-6">
      <TituloModulo
        nivel="h2"
        titulo="Mi trabajo"
        acciones={<VerTodo href="/procesos" etiqueta={`Ver ${GLOSARIO.proceso.plural.toLowerCase()}`} />}
      />

      {grupos.length === 0
        ? (
          <p className="text-base text-texto-tenue">
            No tienes {GLOSARIO.proceso.plural.toLowerCase()} por vencer.
            {restantes > 0 && ` Hay ${restantes} sin fecha cercana.`}
          </p>
          )
        : (
          <>
            <div className="flex flex-col gap-5">
              {grupos.map((grupo) => (
                <GrupoDeVencimiento key={grupo.tramo} grupo={grupo} estados={estados} />
              ))}
            </div>

            {restantes > 0 && (
              <p className="text-sm text-texto-sutil">
                {restantes} {GLOSARIO.proceso.plural.toLowerCase()} más sin fecha cercana.
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
 * === POR QUE LO VENCIDO SE PINTA DE ROJO ===
 *
 * Porque hasta ahora la unica diferencia entre "Vencidos" y "Próximos días" era una insignia de 20px
 * de alto: los tres tramos pesaban igual y el unico accionable no se distinguia de un vistazo. El
 * rojo es la alerta del sistema —`superficie-peligro` y `texto-peligro`, los tokens que ya usan las
 * insignias—, y viene con el riel a la izquierda y el triangulo, no solo con el color: quien no
 * distingue el rojo tiene que poder ver igual cual de los tres bloques urge. La palabra "Vencidos"
 * es la tercera señal y la unica que lee un lector de pantalla.
 *
 * Las filas quedan sobre la superficie normal a proposito: el rojo marca el bloque, no el texto de
 * cada Tarea, que es lo que hay que poder leer.
 *
 * @param grupo el tramo ya armado por `agruparPorVencimiento`
 * @param estados catalogo de estados para las insignias de cada fila
 */
function GrupoDeVencimiento ({ grupo, estados }: { grupo: GrupoInicio, estados: OpcionFiltro[] }) {
  const urgente = grupo.tramo === 'vencido'

  return (
    <div
      className={cn(
        'overflow-hidden rounded-tarjeta border bg-superficie-elevada shadow-1',
        urgente ? 'border-l-4 border-texto-peligro/35 border-l-relleno-peligro' : 'border-linea'
      )}
    >
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-5 py-4',
          urgente ? 'border-texto-peligro/25 bg-superficie-peligro' : 'border-linea bg-superficie-hundida'
        )}
      >
        {urgente && (
          <TriangleAlert size={20} strokeWidth={2.25} aria-hidden="true" className="shrink-0 text-texto-peligro" />
        )}
        {/*
          Plantilla y no `cn()`: para `tailwind-merge` un `text-*` que no es un peldaño conocido
          —`text-titulo` lo es de este proyecto— es un COLOR, asi que lo daba por pisado por
          `text-texto-peligro` y lo borraba. El titulo salia a 14px sin que nada fallara.
        */}
        <h3 className={`font-titular text-titulo font-bold ${urgente ? 'text-texto-peligro' : 'text-texto'}`}>
          {grupo.etiqueta}
        </h3>
        <Insignia
          tono={urgente ? 'peligro' : 'neutro'}
          className={cn('h-7 px-3 text-base font-bold tabular-nums', urgente && 'ring-1 ring-inset ring-texto-peligro/30')}
        >
          {grupo.total}
        </Insignia>
      </div>

      <ul className="flex flex-col divide-y divide-linea">
        {grupo.procesos.map((proceso) => (
          <FilaDeProceso key={proceso.id} proceso={proceso} estados={estados} />
        ))}
      </ul>

      {grupo.total > grupo.procesos.length && (
        <p className="border-t border-linea px-5 py-3 text-sm text-texto-sutil">
          y {grupo.total - grupo.procesos.length} más
        </p>
      )}
    </div>
  )
}

/**
 * Una Tarea, como fila de listado de la portada.
 *
 * Es la misma fila en "Mi trabajo" y en "En seguimiento", y estaba escrita dos veces: la primera vez
 * que las dos copias dejaron de ser iguales fue al agrandarlas.
 *
 * En pantalla angosta el nombre se lleva su propio renglon (`basis-full`) y el estado y la fecha
 * bajan debajo. Los tres en una linea de 400px dejaban al nombre —lo unico que identifica la Tarea—
 * en dos o tres palabras cortadas.
 *
 * @param proceso la Tarea a mostrar
 * @param estados catalogo de estados; vacio no pinta insignia
 */
function FilaDeProceso ({ proceso, estados }: { proceso: Proceso, estados: OpcionFiltro[] }) {
  return (
    <li>
      {/*
        Enlace de verdad y no un `div` con `onClick`: asi la fila se abre con el teclado, se copia y
        se abre en otra pestaña. `scroll={false}` porque abrir el detalle no mueve la pantalla de
        atras.
      */}
      <Link
        href={`?${PARAMETRO_TAREA}=${proceso.id}`}
        scroll={false}
        className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors duration-150 ease-neo hover:bg-hover focus-visible:bg-hover"
      >
        <span className="min-w-0 flex-1 basis-full truncate text-base text-texto sm:basis-auto">
          {proceso.name}
        </span>
        <EstadoDeTarea status={proceso.status} catalogo={estados} className="shrink-0" />
        <span className="shrink-0 text-sm text-texto-tenue">
          <Fecha valor={proceso.due_date} />
        </span>
      </Link>
    </li>
  )
}

interface Acceso {
  href: string
  titulo: string
  descripcion: string
  icono: typeof ListChecks
  tono: TonoTarjeta
  proximamente?: boolean
}

/** La grilla de accesos. Lo que todavia no existe se muestra apagado, para decir hacia donde va esto. */
function Secciones ({ yo }: { yo: Yo }) {
  const accesos = accesosDe(yo)

  return (
    <section className="flex flex-col gap-6">
      <TituloModulo nivel="h2" titulo="Ir a" />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {accesos.map((acceso) => (
          <Tarjeta
            key={acceso.href}
            href={acceso.href}
            titulo={acceso.titulo}
            descripcion={acceso.descripcion}
            icono={acceso.icono}
            tono={acceso.tono}
            tamano="grande"
            proximamente={acceso.proximamente}
          />
        ))}
      </div>
    </section>
  )
}

/**
 * Arma la grilla segun los permisos de quien mira.
 *
 * Misma regla que la navegacion lateral: un modulo sin `view` no se muestra porque su pantalla daria
 * 403 igual. Los `proximamente` no dependen de permisos — todavia no hay pantalla que proteger.
 */
function accesosDe (yo: Yo): Acceso[] {
  const accesos: Acceso[] = []

  if (puedeVerSeccion(yo.permissions.tasks, 'tasks')) {
    accesos.push({
      href: '/procesos',
      titulo: GLOSARIO.proceso.plural,
      descripcion: 'Todo lo que está en marcha, con filtros y orden.',
      icono: ListChecks,
      tono: 'acento'
    })
    accesos.push({
      href: '/procesos/tablero',
      titulo: 'Tablero',
      descripcion: `${GLOSARIO.proceso.plural} por estado, para mover de a uno.`,
      icono: Columns3,
      tono: 'violeta'
    })
  }

  if (puedeVerSeccion(yo.permissions.projects, 'projects')) {
    accesos.push({
      href: '/espacios',
      titulo: GLOSARIO.espacio.plural,
      descripcion: 'Dónde vive cada trabajo y cómo viene.',
      icono: FolderKanban,
      tono: 'exito'
    })
  }

  if (puedeVerSeccion(yo.permissions.customers, 'customers')) {
    accesos.push({
      href: '/clientes',
      titulo: 'Clientes',
      descripcion: 'La cartera, con sus contactos y datos.',
      icono: Building2,
      tono: 'aviso'
    })
  }

  if (puedeVerSeccion(yo.permissions.staff, 'staff')) {
    accesos.push({
      href: '/equipo',
      titulo: 'Equipo',
      descripcion: 'Quién es quién y de qué se ocupa.',
      icono: Users,
      tono: 'acento'
    })
  }

  accesos.push(
    {
      // El soporte no es un modulo del panel: se atiende en wiwo.center. La tarjeta no lleva
      // `proximamente` porque el destino existe hoy.
      href: URL_SOPORTE,
      titulo: '¿Buscas soporte?',
      descripcion: 'Escríbenos en wiwo.center y te respondemos ahí.',
      icono: LifeBuoy,
      tono: 'peligro'
    }
  )

  return accesos
}
