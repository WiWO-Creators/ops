import { Coffee, FolderKanban, Users, type LucideIcon } from 'lucide-react'
import { pedir } from '@/datos/servidor'
import { ErrorApi } from '@/datos/errores'
import { SALAS_COMUNES, salaDeEspacio } from '@/dominio/teletrabajo'
import { GLOSARIO } from '@/dominio/glosario'
import { Tarjeta } from '@/componentes/estructura/Tarjeta'
import type { Espacio } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'

export const metadata = { title: 'Teletrabajo · WiWO Ops' }

/** Tope de Espacios que se traen para armar la lista de salas privadas. */
const TOPE_DE_ESPACIOS = 100

/**
 * Icono de cada sala comun.
 *
 * Vive aca y no en el catalogo porque `dominio/teletrabajo.ts` no importa React. Una sala sin
 * entrada en este mapa se pinta con `Users`, que es lo generico correcto y no un hueco.
 */
const ICONOS_DE_SALA: Record<string, LucideIcon> = {
  general: Users,
  cafe: Coffee
}

/**
 * Portada de Teletrabajo.
 *
 * Muestra las salas a las que esta persona **puede** entrar, no todas las que existen. Es una
 * decision de producto y no una comodidad: una sala listada y luego negada al abrirla convierte un
 * permiso en una puerta que se cierra en la cara.
 *
 * Por eso las privadas salen de `filter[member]`, que es la misma pregunta que despues repite
 * `[sala]/page.tsx` antes de firmar el token — aca para decidir que se ve, alla para decidir quien
 * entra. La segunda es la que manda; esta solo evita mostrar puertas cerradas.
 */
export default async function TeletrabajoPage () {
  const { data: yo } = await pedir<Yo>('/me')
  const espacios = await espaciosDe(yo.id)

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-titular text-pantalla font-extrabold tracking-tight text-texto">
          {GLOSARIO.teletrabajo.singular}
        </h1>
        <p className="mt-2 text-sm text-texto-tenue">
          Llamadas, video y pantalla compartida. El chat sigue donde estaba.
        </p>
        <span aria-hidden="true" className="mt-4 block h-1 w-24 rounded-control bg-gradiente-marca" />
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="font-titular text-titulo font-bold text-texto">Salas comunes</h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SALAS_COMUNES.map((sala) => (
            <Tarjeta
              key={sala.id}
              href={`/teletrabajo/${sala.id}`}
              titulo={sala.nombre}
              descripcion={sala.descripcion}
              icono={ICONOS_DE_SALA[sala.id] ?? Users}
              tono="acento"
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-titular text-titulo font-bold text-texto">
          Salas privadas
        </h2>

        <SalasPrivadas espacios={espacios} />
      </section>
    </div>
  )
}

/**
 * Las salas privadas de quien mira.
 *
 * Tres estados, y ninguno se pinta como los otros: no se pudieron cargar, no hay, o hay. Mostrar
 * "todavía no estás en ninguno" cuando en realidad fallo la consulta le diria a alguien que no
 * pertenece a nada, que es una afirmacion falsa sobre su trabajo.
 *
 * @param espacios Espacios que integra, o `null` si la consulta fallo.
 */
function SalasPrivadas ({ espacios }: { espacios: Espacio[] | null }) {
  if (espacios === null) {
    return (
      <p className="text-sm text-texto-tenue">
        No pudimos cargar tus {GLOSARIO.espacio.plural.toLowerCase()}, así que esta lista está
        incompleta. Las salas comunes de arriba siguen funcionando.
      </p>
    )
  }

  if (espacios.length === 0) {
    return (
      <p className="text-sm text-texto-tenue">
        Cada {GLOSARIO.espacio.singular.toLowerCase()} del que formes parte tiene su propia sala, y
        solo entran sus miembros. Todavía no estás en ninguno.
      </p>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {espacios.map((espacio) => {
        const sala = salaDeEspacio(espacio.id)

        // Un id que no sea entero positivo no da nombre de sala. No deberia pasar con datos de la
        // API, pero si pasa es mejor no pintar la tarjeta que pintar un enlace roto.
        if (sala === null) return null

        return (
          <Tarjeta
            key={espacio.id}
            href={`/teletrabajo/${sala}`}
            titulo={espacio.name}
            descripcion={espacio.client?.company ?? 'Solo para quienes integran el espacio.'}
            icono={FolderKanban}
            tono="violeta"
          />
        )
      })}
    </div>
  )
}

/**
 * Espacios que integra una persona.
 *
 * Un fallo aca no puede tumbar la pantalla: las salas comunes no dependen de esta consulta y tienen
 * que seguir abriendose aunque la API de Espacios este caida.
 *
 * @param staffId Id de quien mira.
 * @returns Los Espacios, o `null` si la consulta fallo.
 */
async function espaciosDe (staffId: number): Promise<Espacio[] | null> {
  try {
    const { data } = await pedir<Espacio[]>(
      `/projects?filter[member]=${staffId}&per_page=${TOPE_DE_ESPACIOS}&sort=name`
    )

    return data
  } catch (fallo) {
    // Solo los errores del contrato se degradan. `pedir` corta con `redirect()` cuando la sesion
    // vencio, y eso viaja como excepcion: atraparla dejaria la pantalla a medias en vez de mandar
    // a la de acceso.
    if (fallo instanceof ErrorApi) return null

    throw fallo
  }
}
