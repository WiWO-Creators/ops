import { PanelFocals } from '@/componentes/focals/PanelFocals'
import { SinPermiso, Vacio } from '@/componentes/estado/Estados'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import {
  agruparPorCliente,
  RUTA_CLIENTES_FOCAL,
  RUTA_CLIENTES_TODOS,
  RUTA_ESPACIOS_FOCAL,
  RUTA_ESPACIOS_TODOS,
  type CuentaFocal,
  type ScoreEspacio
} from '@/datos/focals'
import { ErrorApi } from '@/datos/errores'
import { cargarYo, pedir, pedirOpcional } from '@/datos/servidor'
import type { ClienteMinimo, ScoreCliente } from '@/datos/recursos'
import { descripcionDeFocals, textoDeCarteraVacia } from '@/dominio/cartera'
import { puedeVerTodosLosFocals } from '@/dominio/permisos'
import { GLOSARIO } from '@/dominio/glosario'
import { hoyEnSantiago } from '@/dominio/supervision'

/** Todos los clientes con su logo; `per_page` cubre la cartera entera de una vez. */
const RUTA_LOGOS = '/clients/minimos?per_page=500'

export const metadata = { title: `${GLOSARIO.focal.plural} · WiWO Ops` }

/**
 * La pantalla del Focal: las cuentas de las que uno responde, con su semáforo y el de cada
 * {@link GLOSARIO.espacio}.
 *
 * === Qué es un Focal, y por qué esta pantalla existe ===
 *
 * El Focal es quien responde por un cliente. Hasta ahora ese dato vivía escondido en una pestaña de
 * la ficha del cliente, y para saber cómo iban sus cuentas había que abrirlas de a una. Esta
 * pantalla es esa lista, ordenada por lo que está peor.
 *
 * === La misma pantalla, dos lecturas ===
 *
 * Para un Focal es SU cartera: las cuentas de las que responde. Para la superadministración y la
 * gerencia es la cartera ENTERA, con el nombre del focal al lado de cada cuenta — como si fueran
 * focal de todas, sin que nadie las tenga que agregar una por una. Lo decide
 * {@link puedeVerTodosLosFocals}, y lo único que cambia es si la llamada lleva `?focal=me`: la ruta
 * es la misma y el permiso también, porque la API ya le abre la cartera entera a quien alcanza el
 * escalón (`V1::scoresRuta()`).
 *
 * === Por qué las dos llamadas van en paralelo y no anidadas ===
 *
 * Podrían ser una por cliente —los {@link GLOSARIO.espacio} de cada uno—, y serían N+1 peticiones
 * para una cartera de doce cuentas. Cada ruta devuelve de una sola vez todo lo que esta persona
 * puede ver, y el agrupado se hace acá, donde no cuesta nada.
 *
 * === Esconder no autoriza ===
 *
 * La llave es la misma que ya usa el semáforo del cliente y la aplica la API: `lider` y `usuario`
 * reciben 403 en las dos rutas. Este `catch` existe para mostrar una pantalla que se entienda, no
 * para decidir quién entra; sin él la ruta mostraría el límite de error genérico.
 */
export default async function FocalsPage () {
  const yo = await cargarYo()
  const todas = puedeVerTodosLosFocals(yo.data)
  const [[cuentas, error], logos] = await Promise.all([cargarCartera(todas), cargarLogos()])

  if (error !== null) {
    return (
      <section className="flex flex-col gap-4">
        <TituloModulo titulo={GLOSARIO.focal.plural} />
        <SinPermiso />
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <TituloModulo
        titulo={GLOSARIO.focal.plural}
        descripcion={descripcionDeFocals(todas)}
      />

      {cuentas.length === 0
        ? <CarteraVacia todas={todas} />
        : <PanelFocals cuentas={cuentas} hoy={hoyEnSantiago()} mostrarFocal={todas} logos={logos} />}
    </section>
  )
}

/**
 * El vacío dice cosas distintas según quién mire: a una gerencia, que no hay ni un cliente con
 * semáforo calculado, que es un problema del cron y no suyo; a un Focal, que o no responde por
 * ninguna cuenta o la foto del día todavía no existe. Un solo texto para los dos mandaría a la
 * gerencia a buscarse en una pestaña de cliente. El texto lo arma `textoDeCarteraVacia`.
 */
function CarteraVacia ({ todas }: { todas: boolean }) {
  const { titulo, descripcion } = textoDeCarteraVacia(todas)

  return <Vacio titulo={titulo} descripcion={descripcion} />
}

/**
 * Los clientes y los {@link GLOSARIO.espacio} de quien mira, ya agrupados.
 *
 * El 403 se devuelve como valor y no se relanza porque cambia la pantalla entera, no un pedazo.
 * Cualquier otro error sube y lo muestra el límite de error de la ruta: un 500 de la API no es lo
 * mismo que "no tienes permiso" y no puede contarse igual.
 *
 * @param todas si la pantalla es la cartera entera y no la propia
 * @returns las cuentas agrupadas, o el error de permiso que impidió armarlas
 */
async function cargarCartera (todas: boolean): Promise<[CuentaFocal[], ErrorApi | null]> {
  try {
    const [clientes, espacios] = await Promise.all([
      pedir<ScoreCliente[]>(todas ? RUTA_CLIENTES_TODOS : RUTA_CLIENTES_FOCAL),
      pedir<ScoreEspacio[]>(todas ? RUTA_ESPACIOS_TODOS : RUTA_ESPACIOS_FOCAL)
    ])

    return [agruparPorCliente(clientes.data, espacios.data), null]
  } catch (fallo) {
    if (fallo instanceof ErrorApi && fallo.codigo === 'forbidden') return [[], fallo]

    throw fallo
  }
}

/**
 * El logo de cada cliente, por id, para ponerle cara a su tarjeta.
 *
 * Sale de `/clients/minimos`, la ruta que no exige permiso de clientes y devuelve solo id, nombre,
 * logo y si está activo. Es opcional: si falla o el cliente no tiene logo, la tarjeta cae a sus
 * iniciales, y la pantalla no tiene por qué romperse por una imagen.
 *
 * @returns el logo por id de cliente; vacío si no se pudo pedir
 */
async function cargarLogos (): Promise<Record<number, string>> {
  const { datos } = await pedirOpcional<ClienteMinimo[]>(RUTA_LOGOS)
  const logos: Record<number, string> = {}

  for (const cliente of datos ?? []) {
    if (cliente.image_url !== null && cliente.image_url !== '') logos[cliente.id] = cliente.image_url
  }

  return logos
}
