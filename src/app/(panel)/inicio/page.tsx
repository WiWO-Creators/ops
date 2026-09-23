import { Suspense } from 'react'
import Link from 'next/link'
import { unstable_rethrow } from 'next/navigation'
import { ArrowRight, Star, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/clases'
import { pedir, pedirOpcional } from '@/datos/servidor'
import { ErrorApi, mensajeParaPantalla } from '@/datos/errores'
import type { Yo } from '@/datos/tipos'
import type { Espacio, Proceso } from '@/datos/recursos'
import type { EstadoDeJornada } from '@/datos/live'
import { cargarLookups, listaDe } from '@/datos/lookups'
import type { OpcionFiltro } from '@/definiciones/tipos'
import { opcionesDeEstados } from '@/dominio/estados-tarea'
import { GLOSARIO } from '@/dominio/glosario'
import { agruparPorVencimiento, cuantosNoListados, type GrupoInicio } from '@/dominio/inicio'
import { puedeVerSeccion } from '@/dominio/permisos'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { PARAMETRO_TAREA, urlDeTareaEnProyecto } from '@/componentes/datos/tabla'
import { EstadoDeTarea } from '@/componentes/proyecto/EstadoDeTarea'
import { ModalTarea } from '@/componentes/proyecto/ModalTarea'
import { AvisoJornada } from './AvisoJornada'
import { ResumenDelDia } from './ResumenDelDia'
import { FijadosYRecientes } from './FijadosYRecientes'
import { priorizarFijados, type Fijado, type Reciente } from '@/componentes/fijados/fijados'

/**
 * Cuantos procesos propios se traen para armar la pantalla.
 *
 * Alcanza para llenar los tres tramos con margen y evita paginar en una pantalla que no tiene
 * controles de paginacion. Lo que exceda se cuenta, no se pierde: el enlace al listado completo esta
 * siempre.
 */
const PROCESOS_A_TRAER = 60

/**
 * Inicio del panel.
 *
 * Hace dos cosas en una pantalla: devuelve a la persona a lo que usa y muestra lo que hay que hacer
 * hoy. Arriba van sus fijados y recientes —la vuelta a un Proyecto o Cliente concreto—, y despues el
 * trabajo propio. La grilla de accesos a secciones que cerraba la pantalla ya no esta: repetia el
 * menu, y buscar o ir a cualquier seccion ahora es la paleta (`Ctrl K`), a una tecla desde todo el
 * panel.
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
  const [{ procesos, total, error: errorDeProcesos }, jornada, estados, fijados, recientes] = await Promise.all([
    misProcesos(yo),
    pedirOpcional<EstadoDeJornada>('/me/jornada'),
    estadosDeTarea(),
    // Los dos por `pedirOpcional`: son atajos, y una API sin la migracion 0900 no puede tumbar la
    // portada. Sin ellos el bloque se dibuja vacio, con la explicacion de como se llena.
    pedirOpcional<Fijado[]>('/me/fijados'),
    pedirOpcional<Reciente[]>('/me/recientes')
  ])
  const listaDeFijados = fijados.datos ?? []

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
    // lectura no la limita —lo que la limita son las tarjetas de fijados, que con 1152px entran en
    // dos columnas holgadas al lado de los recientes. El aire vertical crece con la ventana: en una
    // pantalla chica el contenido no sobra y separar de mas obliga a deslizar para ver lo urgente.
    <div className="lienzo-vivo mx-auto flex max-w-6xl flex-col gap-10 px-1 py-6 sm:gap-14 sm:py-12">
      <Saludo nombre={yo.firstname} />

      <AvisoJornada inicial={jornada.datos} />

      <FijadosYRecientes fijados={listaDeFijados} recientes={recientes.datos ?? []} />

      <ResumenDelDia />

      {puedeVerSeccion(yo.permissions.tasks, 'tasks') && (
        <MiTrabajo grupos={grupos} restantes={restantes} estados={estados} error={errorDeProcesos} />
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
          <MisProyectos
            staffId={yo.id}
            fijados={listaDeFijados.filter((fijado) => fijado.type === 'project').map((fijado) => fijado.id)}
          />
        </Suspense>
      )}

      {puedeVerSeccion(yo.permissions.tasks, 'tasks') && (
        <Suspense fallback={null}>
          <EnSeguimiento staffId={yo.id} estados={estados} />
        </Suspense>
      )}

      {/* El detalle es el mismo de los listados y se abre con el mismo `?tarea={id}`. Va en un
          limite de Suspense porque lee `useSearchParams`: sin el, el build de esta pagina falla. */}
      <Suspense fallback={null}>
        <ModalTarea
          puedeEditar={yo.permissions.tasks.includes('edit')}
          puedeBorrar={yo.permissions.tasks.includes('delete')}
          puedeCrear={yo.permissions.tasks.includes('create')}
        />
      </Suspense>
    </div>
  )
}

/**
 * La primera fecha que cuenta como fecha de verdad.
 *
 * En esta base `duedate` no admite nulos y una Tarea sin plazo guarda `0000-00-00`. Con
 * `sort=due_date` ascendente esas filas encabezan el resultado, asi que alguien con sesenta Tareas
 * sin fecha se llevaba las sesenta filas de la pagina en ceros y los tres tramos —Vencido, Hoy,
 * Próximos días— salian vacios: el segundo camino, independiente de la sesion, hacia "no aparecen
 * tareas".
 *
 * `filter[date_from]` compara `duedate >= ` este valor, asi que la fecha cero queda fuera y las
 * sesenta filas se gastan en trabajo con plazo, que es lo que la pantalla agrupa. Lo que no tiene
 * plazo no desaparece: vive en el listado completo, al que lleva el enlace del encabezado.
 */
const PRIMERA_FECHA_REAL = '0001-01-01'

/** Lo que hace falta para pintar "Mi trabajo", con el motivo si no se pudo traer. */
interface TrabajoPropio {
  procesos: Proceso[]
  total: number
  /** Texto del fallo, o `null` si la peticion salio bien (o si no habia permiso para hacerla). */
  error: string | null
}

/**
 * Trae los procesos asignados a quien mira, del vencimiento mas cercano al mas lejano.
 *
 * Un fallo aca no tumba la pantalla —el inicio sigue sirviendo para navegar, que es la mitad de su
 * trabajo— pero **si se dice**. Antes el `catch` devolvia la lista vacia y la pantalla pintaba "No
 * tienes Procesos por vencer": el sintoma mentia sobre su causa, y una sesion caida de madrugada se
 * reportaba como "de mañana no aparecen tareas".
 *
 * `unstable_rethrow` es lo primero del `catch` y no es un detalle: `pedir()` resuelve el `401`
 * llamando a `redirect()`, que en Next **funciona lanzando**. Un `catch` pelado se tragaba esa señal
 * y convertia el "andá a entrar de nuevo" en una lista vacia. Con el rethrow, la sesion caida manda
 * a `/colab` como corresponde y solo los fallos de verdad llegan al mensaje de abajo.
 *
 * @param yo la sesion, para el filtro de asignacion y para el permiso
 * @returns los procesos propios, o el motivo por el que no se pudieron traer
 */
async function misProcesos (yo: Yo): Promise<TrabajoPropio> {
  if (!puedeVerSeccion(yo.permissions.tasks, 'tasks')) return { procesos: [], total: 0, error: null }

  try {
    const { data, meta } = await pedir<Proceso[]>(
      `/tasks?assignee=${yo.id}&sort=due_date&per_page=${PROCESOS_A_TRAER}` +
      `&filter[date_from]=${PRIMERA_FECHA_REAL}`
    )

    return { procesos: data, total: meta?.pagination?.total ?? data.length, error: null }
  } catch (fallo: unknown) {
    unstable_rethrow(fallo)

    return {
      procesos: [],
      total: 0,
      error: fallo instanceof ErrorApi
        ? mensajeParaPantalla(fallo.message)
        : 'No se pudo cargar tu trabajo. Recarga la página.'
    }
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
  } catch (fallo: unknown) {
    unstable_rethrow(fallo)

    return []
  }
}

/**
 * Cuantas filas trae cada uno de los dos bloques secundarios.
 *
 * Son un vistazo, no un listado: lo que no entra se busca en su pantalla, que esta a un enlace. Con
 * mas filas los dos bloques empujan "En seguimiento" fuera de toda pantalla razonable.
 */
const FILAS_SECUNDARIAS = 5

/**
 * Los Espacios que integra quien mira.
 *
 * Va en su propio `<Suspense>`: es una segunda peticion y no puede retrasar la primera pintada.
 * Copia el `try/catch` de `misProcesos()` por la misma razon —un listado caido no puede tumbar la
 * portada— y no muestra caja vacia: sin Espacios, no hay bloque.
 *
 * Los fijados van primero y con su estrella: si la persona dijo cuales quiere a mano, son esos, en
 * su orden, y despues los de entrega mas cercana. Se piden por id en la misma tanda que la lista de
 * miembro, asi que un fijado del que no es miembro —un Proyecto que sigue sin integrar— tambien
 * entra. El listado aplica la misma visibilidad de siempre: un id que no se ve no vuelve.
 *
 * @param staffId a quien pertenecen los Espacios
 * @param fijados ids de los Proyectos fijados, en el orden de la persona
 */
async function MisProyectos ({ staffId, fijados }: { staffId: number, fijados: number[] }) {
  const [propios, completos] = await Promise.all([
    listar<Espacio>(`/projects?filter[member]=${staffId}&per_page=${FILAS_SECUNDARIAS}&sort=deadline`),
    fijados.length === 0
      ? Promise.resolve<Espacio[]>([])
      : listar<Espacio>(`/projects?filter[id]=${fijados.join(',')}&per_page=${fijados.length}`)
  ])
  const filas = priorizarFijados(propios, completos, fijados, FILAS_SECUNDARIAS)

  if (filas.length === 0) return null

  return (
    <section className="flex flex-col gap-6">
      <TituloModulo
        nivel="h2"
        titulo={`Mis ${GLOSARIO.espacio.plural.toLowerCase()}`}
        acciones={<VerTodo href="/proyectos" etiqueta={`Ver ${GLOSARIO.espacio.plural.toLowerCase()}`} />}
      />

      <ul className="flex flex-col divide-y divide-linea overflow-hidden rounded-tarjeta border border-linea bg-superficie-elevada shadow-1">
        {filas.map(({ espacio, fijado }) => (
          <li key={espacio.id}>
            <Link
              href={`/proyectos/${espacio.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 transition-colors duration-150 ease-neo hover:bg-hover focus-visible:bg-hover"
            >
              <span className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-auto">
                {fijado && <Star size={14} strokeWidth={2} aria-label="Fijado" className="shrink-0 fill-current text-acento" />}
                <span className="truncate text-base text-texto">{espacio.name}</span>
              </span>
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
  } catch (fallo: unknown) {
    // La sesion caida no es "el listado vino vacio": `pedir()` la resuelve con `redirect()`, que
    // lanza, y tragarlo dejaria a quien perdio la sesion mirando una portada a medias en vez de
    // mandarlo a entrar. Lo demas si se traga: estos dos bloques son un vistazo, no la pantalla.
    unstable_rethrow(fallo)

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
  /** Por que no se pudo traer el listado, o `null` si vino bien. */
  error: string | null
}

/**
 * Los procesos propios, agrupados por cercania del vencimiento.
 *
 * Sin nada asignado no se muestra una caja vacia: se muestra la frase y el enlace al listado. Un
 * estado vacio con marco se lee como "algo fallo"; sin marco, como "no tenés nada", que es lo cierto.
 *
 * Cada fila abre la tarea dentro de su Proyecto (pestaña Tareas con el detalle encima). La que no
 * cuelga de ningun Proyecto abre el detalle sin salir del Inicio con `?tarea={id}`.
 *
 * Un fallo del listado NO se pinta como "no tienes nada": son dos hechos distintos y confundirlos es
 * lo que hacia que el equipo reportara el bug equivocado durante meses. Cuando hay error se dice el
 * error, con el marco de alerta que ya usan los tramos vencidos.
 */
function MiTrabajo ({ grupos, restantes, estados, error }: PropsMiTrabajo) {
  return (
    <section className="flex flex-col gap-6">
      <TituloModulo
        nivel="h2"
        titulo="Mi trabajo"
        acciones={<VerTodo href="/procesos" etiqueta={`Ver ${GLOSARIO.proceso.plural.toLowerCase()}`} />}
      />

      {error !== null
        ? (
          <p
            role="alert"
            className="rounded-tarjeta border border-texto-peligro/25 bg-superficie-peligro px-5 py-4 text-base text-texto-peligro"
          >
            {error}
          </p>
          )
        : grupos.length === 0
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
  const enProyecto = urlDeTareaEnProyecto(proceso.id, proceso.project?.id)

  return (
    <li>
      {/*
        Enlace de verdad y no un `div` con `onClick`: asi la fila se abre con el teclado, se copia y
        se abre en otra pestaña. Con Proyecto se va a la tarea dentro de el; sin Proyecto se abre el
        detalle aca, y ahi `scroll={false}` porque abrirlo no mueve la pantalla de atras.
      */}
      <Link
        href={enProyecto ?? `?${PARAMETRO_TAREA}=${proceso.id}`}
        scroll={enProyecto !== null}
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
