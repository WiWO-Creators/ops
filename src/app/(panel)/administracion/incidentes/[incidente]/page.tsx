import Link from 'next/link'
import { ErrorEstado, SinPermiso, Vacio } from '@/componentes/estado/Estados'
import { BloqueCopiable } from '@/componentes/presentadores/BloqueCopiable'
import { CodigoCopiable } from '@/componentes/presentadores/CodigoCopiable'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { ErrorApi } from '@/datos/errores'
import { pedir } from '@/datos/servidor'
import { describirFalla, describirOrigen, describirPeticion, describirSujeto } from '@/dominio/incidentes'
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
      className="text-texto-tenue hover:text-texto w-fit text-sm transition-colors"
    >
      ← Volver a incidentes
    </Link>
  )
}

/**
 * Detalle de un incidente: qué pasó primero, y el diagnóstico debajo y plegado.
 *
 * === POR QUÉ NO ES UNA FICHA DE SEIS CAMPOS ===
 *
 * Lo era, y esa forma le daba el mismo peso visual a todo: la clase de la excepción y la URI
 * ocupaban tanto como el problema. Quien abre esta pantalla trae un código y una pregunta —qué le
 * pasó a esta persona—, y la respuesta estaba repartida en seis pares de clave y valor que había
 * que leer enteros para reconstruirla.
 *
 * Ahora la pantalla contesta esa pregunta en dos líneas —el titular de `describirFalla()` y una
 * frase con quién, cuándo y dónde— y todo lo demás vive dentro de `<details>`. No se borró ningún
 * dato: la excepción, la ruta cruda, el archivo con su línea y la traza siguen estando, a un clic,
 * que es la distancia correcta para algo que se mira solo cuando hay que reproducir la falla.
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
  const origen = describirOrigen(incidente.origen)
  const falla = describirFalla(incidente)

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <VolverAlListado />

      <div className="flex flex-col gap-3">
        <Insignia tono={origen.tono} tamano="chico" className="w-fit">{origen.etiqueta}</Insignia>

        <h1 className="text-texto text-seccion font-bold text-balance">{falla.titular}</h1>

        {/* El texto que la persona vio de verdad. Va grande y sin caja: es lo único de esta
            pantalla que se lee palabra por palabra. */}
        {falla.detalle !== null && (
          <p className="text-texto-tenue max-w-prose text-base leading-relaxed text-pretty">{falla.detalle}</p>
        )}
      </div>

      {/* Quién, cuándo y dónde en una frase, no en tres campos: leídos juntos cuentan el episodio,
          y por separado obligan a armarlo en la cabeza. */}
      <p className="text-texto-tenue text-sm leading-relaxed">
        {sujeto === null ? 'Sin atribuir a nadie' : sujeto}
        {' · '}
        <Fecha valor={incidente.creado_en} conHora />
        {' · '}
        {describirPeticion(incidente.uri)}
      </p>

      <div className="text-texto-tenue flex flex-wrap items-center gap-2 text-sm">
        <span>Código:</span>
        <CodigoCopiable valor={incidente.incidente} className="bg-superficie-hundida" />
      </div>

      <Tecnico incidente={incidente} estado={falla.estado} />
    </section>
  )
}

/**
 * El diagnóstico, plegado.
 *
 * Nace cerrado porque nadie lo necesita para entender qué pasó: se abre cuando hay que reproducir la
 * falla o pegarla en un reporte. Es `<details>` nativo y no un acordeón con estado para que la
 * pantalla siga siendo un Server Component.
 */
function Tecnico ({ incidente, estado }: { incidente: IncidenteConTraza, estado: string | null }) {
  return (
    <details className="border-linea rounded-tarjeta group border">
      <summary className="text-texto-tenue hover:text-texto cursor-pointer list-none p-4 text-sm font-medium transition-colors">
        <span className="inline-block transition-transform group-open:rotate-90">›</span>
        {' '}
        Detalle técnico
      </summary>

      <div className="flex flex-col gap-4 px-4 pb-4">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Dato etiqueta="Excepción" valor={incidente.tipo} />
          <Dato
            etiqueta="Petición"
            valor={`${incidente.metodo} ${incidente.uri}${estado === null ? '' : ` → ${estado}`}`}
          />
          {/* Solo los incidentes de la API tienen archivo y línea: los que reporta el navegador
              guardan la cadena vacía, y un "Dónde: :0" diría menos que no mostrar el dato. */}
          {incidente.archivo !== '' && (
            <Dato etiqueta="Dónde" valor={`${incidente.archivo}:${incidente.linea}`} />
          )}
        </dl>

        {incidente.traza === null
          ? (
            <p className="text-texto-sutil text-sm">
              Sin traza. El incidente se registró igual: perder el rastro de un error 500 por eso
              sería perder justo el que hay que investigar.
            </p>
            )
          : <BloqueCopiable titulo="Traza de la excepción" texto={incidente.traza} />}
      </div>
    </details>
  )
}

/** Un par del bloque técnico. El valor va monoespaciado: se lee carácter por carácter, o se copia. */
function Dato ({ etiqueta, valor }: { etiqueta: string, valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-texto-sutil text-xs">{etiqueta}</dt>
      <dd className="text-texto font-mono text-xs break-all">{valor}</dd>
    </div>
  )
}
