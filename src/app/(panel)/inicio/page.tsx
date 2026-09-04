import { Suspense } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Building2,
  Columns3,
  FolderKanban,
  LifeBuoy,
  ListChecks,
  Users
} from 'lucide-react'
import { pedir } from '@/datos/servidor'
import type { Yo } from '@/datos/tipos'
import type { Proceso } from '@/datos/recursos'
import { GLOSARIO } from '@/dominio/glosario'
import { agruparPorVencimiento, cuantosNoListados, procesoConCronometro } from '@/dominio/inicio'
import { Tarjeta, type TonoTarjeta } from '@/componentes/estructura/Tarjeta'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { PARAMETRO_TAREA } from '@/componentes/datos/tabla'
import { ModalTarea } from '@/componentes/proyecto/ModalTarea'
import { CronometroAbierto } from './CronometroAbierto'

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
 * casual — primero el cronometro olvidado (lo unico que cuesta dinero), despues el trabajo propio, y
 * al final el acceso a las secciones. Quien entra a trabajar encuentra su trabajo; quien entra a
 * navegar baja dos pantallazos.
 *
 * Los permisos aca solo **ocultan controles**: la API filtra igual. Se pide `/tasks` unicamente si
 * quien mira puede verlos, porque sin permiso la peticion responde 403 y tumbaria la pantalla entera
 * por una seccion que ni siquiera le corresponde.
 */
export default async function InicioPage () {
  const { data: yo } = await pedir<Yo>('/me')
  const { procesos, total } = await misProcesos(yo)

  const cronometro = procesoConCronometro(procesos, yo.id)
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
    <div className="lienzo-vivo mx-auto flex max-w-5xl flex-col gap-10 px-1 py-6 sm:py-10">
      <Saludo nombre={yo.firstname} />

      {cronometro?.timer_activo != null && (
        <CronometroAbierto
          procesoId={cronometro.id}
          nombre={cronometro.name}
          desde={cronometro.timer_activo.start_time}
        />
      )}

      {yo.permissions.tasks.includes('view') && (
        <MiTrabajo grupos={grupos} restantes={restantes} />
      )}

      <Secciones yo={yo} />

      {/* El detalle es el mismo de los listados y se abre con el mismo `?tarea={id}`. Va en un
          limite de Suspense porque lee `useSearchParams`: sin el, el build de esta pagina falla. */}
      <Suspense fallback={null}>
        <ModalTarea puedeEditar={yo.permissions.tasks.includes('edit')} />
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
  if (!yo.permissions.tasks.includes('view')) return { procesos: [], total: 0 }

  try {
    const { data, meta } = await pedir<Proceso[]>(
      `/tasks?assignee=${yo.id}&sort=due_date&per_page=${PROCESOS_A_TRAER}`
    )

    return { procesos: data, total: meta?.pagination?.total ?? data.length }
  } catch {
    return { procesos: [], total: 0 }
  }
}

/** Encabezado de la pantalla. El nombre va en gradiente; el resto, en tinta. */
function Saludo ({ nombre }: { nombre: string }) {
  return (
    <header>
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
      <p className="mt-2 text-sm text-texto-tenue">¿Qué vas a mover hoy?</p>
      {/* La barra es la firma de marca de la pantalla: es donde el gradiente puede ser gradiente. */}
      <span aria-hidden="true" className="mt-4 block h-1 w-24 rounded-control bg-gradiente-marca" />
    </header>
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
function MiTrabajo ({ grupos, restantes }: PropsMiTrabajo) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-titular text-titulo font-bold text-texto">Mi trabajo</h2>
        <Link
          href="/procesos"
          className="flex items-center gap-1 text-sm font-semibold text-acento hover:underline"
        >
          Ver {GLOSARIO.proceso.plural.toLowerCase()}
          <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>

      {grupos.length === 0
        ? (
          <p className="text-sm text-texto-tenue">
            No tenés {GLOSARIO.proceso.plural.toLowerCase()} por vencer.
            {restantes > 0 && ` Hay ${restantes} sin fecha cercana.`}
          </p>
          )
        : (
          <>
            <div className="flex flex-col gap-5">
              {grupos.map((grupo) => (
                <div key={grupo.tramo} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-menor font-semibold uppercase tracking-wide text-texto-sutil">
                      {grupo.etiqueta}
                    </h3>
                    <Insignia tono={grupo.tramo === 'vencido' ? 'peligro' : 'neutro'} tamano="chico">
                      {grupo.total}
                    </Insignia>
                  </div>

                  <ul className="flex flex-col divide-y divide-linea overflow-hidden rounded-tarjeta border border-linea bg-superficie-elevada">
                    {grupo.procesos.map((proceso) => (
                      <li key={proceso.id}>
                        {/*
                          Enlace de verdad y no un `div` con `onClick`: asi la fila se abre con el
                          teclado, se copia y se abre en otra pestaña. `scroll={false}` porque abrir
                          el detalle no mueve la pantalla de atras.
                        */}
                        <Link
                          href={`?${PARAMETRO_TAREA}=${proceso.id}`}
                          scroll={false}
                          className="flex items-center justify-between gap-4 px-4 py-3 transition-colors duration-150 ease-neo hover:bg-hover focus-visible:bg-hover"
                        >
                          <span className="min-w-0 flex-1 truncate text-sm text-texto">{proceso.name}</span>
                          <span className="shrink-0 text-sm text-texto-tenue">
                            <Fecha valor={proceso.due_date} />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>

                  {grupo.total > grupo.procesos.length && (
                    <p className="text-sm text-texto-sutil">
                      y {grupo.total - grupo.procesos.length} más
                    </p>
                  )}
                </div>
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
    <section className="flex flex-col gap-4">
      <h2 className="font-titular text-titulo font-bold text-texto">Ir a</h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accesos.map((acceso) => (
          <Tarjeta
            key={acceso.href}
            href={acceso.href}
            titulo={acceso.titulo}
            descripcion={acceso.descripcion}
            icono={acceso.icono}
            tono={acceso.tono}
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

  if (yo.permissions.tasks.includes('view')) {
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

  if (yo.permissions.projects.includes('view')) {
    accesos.push({
      href: '/espacios',
      titulo: GLOSARIO.espacio.plural,
      descripcion: 'Dónde vive cada trabajo y cómo viene.',
      icono: FolderKanban,
      tono: 'exito'
    })
  }

  if (yo.permissions.customers.includes('view')) {
    accesos.push({
      href: '/clientes',
      titulo: 'Clientes',
      descripcion: 'La cartera, con sus contactos y datos.',
      icono: Building2,
      tono: 'aviso'
    })
  }

  if (yo.permissions.staff.includes('view')) {
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
      titulo: '¿Buscás soporte?',
      descripcion: 'Escribinos en wiwo.center y te respondemos ahí.',
      icono: LifeBuoy,
      tono: 'peligro'
    }
  )

  return accesos
}
