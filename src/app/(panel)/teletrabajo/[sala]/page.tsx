import { notFound } from 'next/navigation'
import { pedir } from '@/datos/servidor'
import { ErrorApi } from '@/datos/errores'
import { firmarEntrada, quienEstaEn } from '@/datos/teletrabajo'
import {
  espacioDeSala,
  esNombreDeSalaValido,
  identidadDe,
  puedeEntrar,
  salaComunPorId
} from '@/dominio/teletrabajo'
import { Sala } from './Sala'
import type { Espacio } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'

export const metadata = { title: 'Sala · Teletrabajo · WiWO Ops' }

/**
 * Una videollamada.
 *
 * Esta pantalla es el control de acceso del modulo. Ninguna otra parte del sistema comprueba nada:
 * LiveKit abre la sala a cualquiera que traiga un token firmado, y el unico que firma es este
 * archivo. Si la comprobacion de aca se saltea, la sala queda abierta.
 *
 * El orden importa: primero se resuelve quien mira y a que sala quiere entrar, despues se pregunta
 * si puede, y **solo entonces** se firma. Firmar antes para "ver si hace falta" seria emitir la
 * credencial que despues se decide no entregar.
 *
 * Quien no puede entrar recibe un 404, no un 403. Una sala privada que responde "no tienes permiso"
 * confirma que existe y quienes la usan; una que responde "no existe" no dice nada.
 *
 * La identidad se calcula ACA y viaja tambien como prop, ademas de ir dentro del token: la pantalla
 * necesita saber cual de las fichas es la propia, y leerla del JWT en el navegador seria descifrar
 * a mano algo que el servidor ya tiene resuelto.
 */
export default async function SalaDeTeletrabajoPage (props: PageProps<'/teletrabajo/[sala]'>) {
  const { sala } = await props.params

  if (!esNombreDeSalaValido(sala)) notFound()

  const { data: yo } = await pedir<Yo>('/me')

  const comun = salaComunPorId(sala)
  const espacioId = espacioDeSala(sala)

  // Solo las salas de Espacio necesitan mirar la API: las comunes las abre cualquiera del equipo y
  // pedir el Espacio de una sala que no lo es seria una llamada garantizada a fallar.
  const espacio = espacioId === null ? null : await espacioDe(espacioId)

  const miembros = espacio?.members?.map((miembro) => miembro.id) ?? null

  if (!puedeEntrar(sala, yo.id, miembros)) notFound()

  // `randomUUID` distingue esta pestaña de otra de la misma persona. Ver `identidadDe`.
  const identidad = identidadDe(yo.id, crypto.randomUUID().slice(0, 8))

  // La firma y la consulta de quien esta dentro no dependen una de la otra, y la segunda va contra
  // otro servidor: encadenarlas le sumaria su latencia entera a la antesala.
  const [entrada, dentro] = await Promise.all([
    firmarEntrada(sala, identidad, yo.full_name, yo.profile_image_url),
    quienEstaEn(sala)
  ])

  return (
    <Sala
      token={entrada.token}
      url={entrada.url}
      titulo={comun?.nombre ?? espacio?.name ?? sala}
      esPrivada={comun === null}
      yo={{ nombre: yo.full_name, imagen: yo.profile_image_url }}
      miIdentidad={identidad}
      dentro={dentro}
    />
  )
}

/**
 * Trae un Espacio con sus miembros.
 *
 * `include=members` no es opcional: sin el, la API devuelve el Espacio sin `members` y la sala
 * quedaria cerrada para todos, incluidos quienes si la integran.
 *
 * @param id Id del Espacio.
 * @returns El Espacio, o `null` si no existe o no es visible para quien mira.
 */
async function espacioDe (id: number): Promise<Espacio | null> {
  try {
    const { data } = await pedir<Espacio>(`/projects/${id}?include=members`)

    return data
  } catch (fallo) {
    // Solo los errores del contrato se convierten en "sala sin acceso". Cualquier otra cosa se
    // relanza: `pedir` corta con `redirect()` cuando la sesion vencio, y eso viaja como excepcion.
    // Atraparla aca dejaria a quien perdio la sesion mirando un 404 en vez de la pantalla de acceso.
    if (fallo instanceof ErrorApi) return null

    throw fallo
  }
}
