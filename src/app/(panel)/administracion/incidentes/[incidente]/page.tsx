import Link from 'next/link'
import { ErrorEstado, SinPermiso, Vacio } from '@/componentes/estado/Estados'
import { BloqueCopiable } from '@/componentes/presentadores/BloqueCopiable'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { ErrorApi } from '@/datos/errores'
import { pedir } from '@/datos/servidor'
import { describirSujeto } from '@/dominio/incidentes'
import type { IncidenteConTraza } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'

export const metadata = { title: 'Incidente · WiWO Ops' }

/** La forma del código que emite la API: ocho hexadecimales en minúscula. */
const CODIGO = /^[0-9a-f]{8}$/

/**
 * Trae el incidente con su traza, o el error de la API como valor.
 *
 * Separada de la página para no construir JSX dentro del `try`, igual que en el listado.
 */
async function cargar (codigo: string): Promise<IncidenteConTraza | ErrorApi> {
  try {
    const { data } = await pedir<IncidenteConTraza>(`/incidentes/${codigo}`)

    return data
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}

/** Estado de incidente inexistente: el código de la URL no es de ninguno. */
function NoEncontrado () {
  return (
    <Vacio
      titulo="Ese incidente no existe"
      descripcion="Puede que el código esté mal copiado, o que el registro ya se haya purgado."
      accion={<VolverAlListado />}
    />
  )
}

function VolverAlListado () {
  return (
    <Link
      href="/administracion/incidentes"
      className="text-acento text-sm font-semibold underline underline-offset-4"
    >
      Volver a incidentes
    </Link>
  )
}

/**
 * Detalle de un incidente: todo lo que la API guardó de esa caída, traza incluida.
 *
 * Es una ruta propia y no una fila que se despliega a propósito: la traza es lo único que hace falta
 * pegar en un reporte, y con dirección propia el código que trae la persona se convierte en un
 * enlace que se manda por mensaje. Además evita un componente cliente y su viaje por el BFF.
 *
 * `is_superadmin` se revisa antes de pedir nada, igual que en el listado: la ruta de la API ya exige
 * superadministrador, y entrar por URL directa tampoco tiene que pintar nada.
 */
export default async function IncidentePage (props: PageProps<'/administracion/incidentes/[incidente]'>) {
  const { data: yo } = await pedir<Yo>('/me')

  if (!yo.is_superadmin) return <SinPermiso className="mt-10" />

  const { incidente: codigo } = await props.params

  // El código viaja en la URL y lo escribe cualquiera: uno con otra forma no es un incidente que
  // falta, es una dirección inventada, y no vale gastarle un viaje a la API.
  if (!CODIGO.test(codigo)) return <NoEncontrado />

  const incidente = await cargar(codigo)

  if (incidente instanceof ErrorApi) {
    if (incidente.codigo === 'not_found') return <NoEncontrado />
    if (incidente.codigo === 'forbidden') return <SinPermiso className="mt-10" />

    return <ErrorEstado detalle={incidente.message} className="mt-10" />
  }

  const sujeto = describirSujeto(incidente)

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <VolverAlListado />
        <TituloModulo titulo={`Incidente ${incidente.incidente}`} descripcion={incidente.mensaje} />
      </div>

      <dl className="border-linea bg-superficie-hundida rounded-tarjeta grid grid-cols-1 gap-x-6 gap-y-3 border p-4 text-sm sm:grid-cols-2">
        <Dato etiqueta="Excepción" valor={<span className="font-mono text-xs">{incidente.tipo}</span>} />
        <Dato etiqueta="Cuándo" valor={<Fecha valor={incidente.creado_en} conHora />} />
        <Dato
          etiqueta="Petición"
          valor={
            <span className="flex items-center gap-2">
              <Insignia tono="contorno" tamano="chico">{incidente.metodo}</Insignia>
              <span className="truncate">{incidente.uri}</span>
            </span>
          }
        />
        <Dato
          etiqueta="Quién"
          valor={sujeto === null ? <span className="text-texto-sutil">Sin atribuir</span> : sujeto}
        />
        <Dato
          etiqueta="Dónde"
          valor={<span className="font-mono text-xs break-all">{incidente.archivo}:{incidente.linea}</span>}
        />
      </dl>

      {incidente.traza === null
        ? (
          <p className="text-texto-tenue text-sm">
            Esta excepción no trajo traza. El incidente se registró igual: perder el rastro de un
            error 500 por eso sería perder justo el que hay que investigar.
          </p>
          )
        : <BloqueCopiable titulo="Traza de la excepción" texto={incidente.traza} />}
    </section>
  )
}

function Dato ({ etiqueta, valor }: { etiqueta: string, valor: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-texto-sutil text-xs">{etiqueta}</dt>
      <dd className="text-texto">{valor}</dd>
    </div>
  )
}
