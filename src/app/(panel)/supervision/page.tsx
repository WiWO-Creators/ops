import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ErrorEstado, SinPermiso, Vacio } from '@/componentes/estado/Estados'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { HojaDeSupervision } from '@/componentes/supervision/HojaDeSupervision'
import { HojasDelEquipo } from '@/componentes/supervision/HojasDelEquipo'
import { ErrorApi } from '@/datos/errores'
import { pedir, pedirOpcional } from '@/datos/servidor'
import {
  RUTA_SUPERVISORES,
  rutaDeHoja,
  rutaDeHojasDelEquipo,
  type HojaDeSupervision as Hoja,
  type HojaDelEquipo,
  type SupervisorVisible
} from '@/datos/supervision'
import type { Yo } from '@/datos/tipos'
import { etiquetaDeEscalon } from '@/dominio/escalon'
import {
  diasVecinos,
  enlaceDeHoja,
  fechaPedida,
  hoyEnSantiago,
  supervisorPedido,
  vacioSinSupervision
} from '@/dominio/supervision'
import { formatearFecha } from '@/lib/fechas'
import { cn } from '@/lib/clases'

export const metadata = { title: 'Supervisión · WiWO Ops' }

/** Clases de los enlaces de la cabecera, que se ven como botones chicos. */
const CLASES_ENLACE = 'border-linea bg-control hover:bg-hover rounded-control inline-flex h-8 items-center gap-1 border px-3 text-xs font-medium'

/**
 * La Supervisión diaria: la hoja del día de un supervisor.
 *
 * === El día y la persona van en la URL ===
 *
 * `?fecha=YYYY-MM-DD` y `?staff_id=N`, y no en estado de cliente: la hoja de un día es algo que se
 * manda ("mira la del martes"), y el aviso diario de las 08:00 enlaza directo a la de hoy. Sin fecha
 * es hoy en Santiago; sin persona, uno mismo.
 *
 * === Quién ve qué lo decide la API ===
 *
 * El propio supervisor, quien está sobre él en el árbol y la administración. El selector de
 * supervisores muestra lo que `GET /supervision/supervisores` devuelve —ya recortado— y solo cuando
 * hay más de uno. Un 403 sobre la hoja pedida se pinta como tal.
 *
 * === Hojas de tu equipo ===
 *
 * Quien tiene supervisores debajo ve la lista de sus hojas del día (`GET /supervision/equipo`) con
 * su estado; [Ver] abre la hoja con `?staff_id=`, y ahí están los botones de confirmar o devolver.
 * La sección no se monta si la lista viene vacía.
 */
export default async function SupervisionPage (props: PageProps<'/supervision'>) {
  const parametros = await props.searchParams
  const hoy = hoyEnSantiago()
  const fecha = fechaPedida(parametros.fecha, hoy)
  const staffId = supervisorPedido(parametros.staff_id)

  const [yo, supervisores, equipo, hoja] = await Promise.all([
    pedir<Yo>('/me'),
    pedirOpcional<SupervisorVisible[]>(`/${RUTA_SUPERVISORES}`),
    pedirOpcional<HojaDelEquipo[]>(`/${rutaDeHojasDelEquipo(fecha)}`),
    cargarHoja(fecha, staffId)
  ])

  if (hoja instanceof ErrorApi) {
    return (
      <section className="flex flex-col gap-4">
        <Encabezado />
        {hoja.estado === 403 ? <SinPermiso /> : <ErrorEstado detalle={hoja.message} />}
      </section>
    )
  }

  const lista = supervisores.datos ?? []
  const hojasDelEquipo = equipo.datos ?? []
  // `GET /supervision/supervisores` ya aplica la definición de supervisor (clientes o gente a
  // cargo): si el dueño de una hoja vacía no está ahí, no es que tuvo un buen día, es que no tiene
  // de dónde sacar Tareas.
  const sinSupervision = hoja.clientes.length === 0 && !lista.some((s) => s.staffid === hoja.supervisor.staffid)
  const esPropia = hoja.supervisor.staffid === yo.data.id
  const vacio = vacioSinSupervision(esPropia, hoja.supervisor.nombre)

  return (
    <section className="flex flex-col gap-4">
      <Encabezado />

      <NavegacionDeHoja fecha={hoja.fecha} hoy={hoy} staffId={staffId} />

      {lista.length > 1 && <SelectorDeSupervisor supervisores={lista} activo={hoja.supervisor.staffid} fecha={hoja.fecha} />}

      <p className="text-sm">
        Hoja de <strong>{hoja.supervisor.nombre}</strong> ({etiquetaDeEscalon(hoja.supervisor.escalon)}) del{' '}
        <strong>{formatearFecha(hoja.fecha)}</strong>
        {!hoja.puede_editar && hoja.firma === null && !esPropia && (
          <span className="text-texto-tenue"> · solo lectura</span>
        )}
      </p>

      {hojasDelEquipo.length > 0 && <HojasDelEquipo filas={hojasDelEquipo} fecha={hoja.fecha} activo={hoja.supervisor.staffid} />}

      {sinSupervision
        ? <Vacio titulo={vacio.titulo} descripcion={vacio.descripcion} />
        // La `key` rehace el estado de la hoja al cambiar de día o de persona: sin ella, el
        // componente cliente conservaría las marcas de la hoja anterior.
        : <HojaDeSupervision key={`${hoja.fecha}-${hoja.supervisor.staffid}`} hojaInicial={hoja} />}
    </section>
  )
}

/**
 * La hoja pedida, o el `ErrorApi` que lo impidió.
 *
 * @param fecha el día
 * @param staffId el supervisor, o `null` para uno mismo
 * @returns la hoja o el error
 */
async function cargarHoja (fecha: string, staffId: number | null): Promise<Hoja | ErrorApi> {
  try {
    return (await pedir<Hoja>(`/${rutaDeHoja(fecha, staffId)}`)).data
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}

/** El encabezado, igual en todos los caminos. */
function Encabezado () {
  return (
    <TituloModulo
      titulo="Supervisión"
      descripcion="Las tareas de tu gente y de tus clientes que vencen hoy, siguen atrasadas o se completaron hoy. Márcalas OK o No OK, deja una nota si hace falta y firma la hoja al terminar; tu jefatura la confirma o te la devuelve."
    />
  )
}

/** Día anterior, hoy y día siguiente, conservando la persona que se mira. */
function NavegacionDeHoja ({ fecha, hoy, staffId }: { fecha: string, hoy: string, staffId: number | null }) {
  const { anterior, siguiente } = diasVecinos(fecha)

  return (
    <nav aria-label="Día de la hoja" className="flex flex-wrap items-center gap-2">
      <Link href={enlaceDeHoja(anterior, staffId)} className={CLASES_ENLACE}>
        <ChevronLeft className="size-4" aria-hidden />
        Día anterior
      </Link>
      <Link
        href={enlaceDeHoja(hoy, staffId)}
        className={cn(CLASES_ENLACE, fecha === hoy && 'bg-relleno-neutro')}
        aria-current={fecha === hoy ? 'date' : undefined}
      >
        Hoy
      </Link>
      <Link href={enlaceDeHoja(siguiente, staffId)} className={CLASES_ENLACE}>
        Día siguiente
        <ChevronRight className="size-4" aria-hidden />
      </Link>
    </nav>
  )
}

/** Los supervisores que quien mira puede ver, como enlaces; el activo, marcado. */
function SelectorDeSupervisor ({ supervisores, activo, fecha }: { supervisores: SupervisorVisible[], activo: number, fecha: string }) {
  return (
    <nav aria-label="Supervisor" className="flex flex-wrap items-center gap-2">
      <span className="text-texto-tenue text-xs">Supervisor:</span>
      {supervisores.map((supervisor) => (
        <Link
          key={supervisor.staffid}
          href={enlaceDeHoja(fecha, supervisor.staffid)}
          aria-current={supervisor.staffid === activo ? 'page' : undefined}
          className={cn(
            'rounded-control border px-3 py-1 text-xs',
            supervisor.staffid === activo
              ? 'bg-acento text-acento-contenido border-transparent font-semibold'
              : 'border-linea hover:bg-hover'
          )}
        >
          {supervisor.nombre} <span className="opacity-70">({etiquetaDeEscalon(supervisor.escalon)})</span>
        </Link>
      ))}
    </nav>
  )
}
