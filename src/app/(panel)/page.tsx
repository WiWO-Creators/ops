import Link from 'next/link'
import {
  ArrowRight,
  Building2,
  Columns3,
  FolderKanban,
  LifeBuoy,
  ListChecks,
  Receipt,
  UserPlus,
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

  // La aurora no lleva alto ni `overflow-y-auto`: el scroll de la pantalla es el del armazon. Un
  // segundo contenedor scrolleable aca daba dos barras superpuestas y dejaba al Inicio fuera del
  // scroll suave. Su capa de luz es `fixed`, asi que no necesita alto propio.
  return (
    <div className="aurora">
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-1 py-6 sm:py-10">
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
      </div>
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
      <h1 className="font-titular text-seccion font-extrabold tracking-tight text-texto">
        Hola,{' '}
        {/*
          El gradiente se recorta sobre el nombre y nada mas. Recortarlo sobre la frase entera deja
          "Hola" en el extremo mas claro del gradiente, que es justo donde peor se lee.
        */}
        <span className="texto-gradiente">{nombre}</span>
      </h1>
      <p className="mt-2 text-sm text-texto-tenue">¿Qué vas a mover hoy?</p>
      {/* La barra es la firma de marca de la pantalla: es donde el gradiente puede ser gradiente. */}
      <span aria-hidden="true" className="mt-4 block h-1 w-24 rounded-control bg-gradiente-marca" />
    </header>
  )
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
                        <div className="flex items-center justify-between gap-4 px-4 py-3">
                          <span className="min-w-0 flex-1 truncate text-sm text-texto">{proceso.name}</span>
                          <span className="shrink-0 text-sm text-texto-tenue">
                            <Fecha valor={proceso.due_date} />
                          </span>
                        </div>
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
      href: '/prospectos',
      titulo: GLOSARIO.prospecto.plural,
      descripcion: 'El embudo comercial, por etapa.',
      icono: UserPlus,
      tono: 'violeta',
      proximamente: true
    },
    {
      href: '/facturas',
      titulo: 'Facturas',
      descripcion: 'Lo emitido, lo cobrado y lo que falta.',
      icono: Receipt,
      tono: 'exito',
      proximamente: true
    },
    {
      href: '/tickets',
      titulo: GLOSARIO.ticket.plural,
      descripcion: 'El soporte que entra y quién lo atiende.',
      icono: LifeBuoy,
      tono: 'peligro',
      proximamente: true
    }
  )

  return accesos
}
