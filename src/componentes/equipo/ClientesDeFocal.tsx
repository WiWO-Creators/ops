'use client'

import { useEffect, useState } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { SelectorClientes, type ClienteElegible } from '@/componentes/formularios/SelectorClientes'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Cargando, Vacio } from '@/componentes/estado/Estados'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { pedirSobre } from '@/datos/cliente'
import type { Cliente } from '@/datos/recursos'
import { GLOSARIO } from '@/dominio/glosario'
import type { Capacidad } from '@/datos/tipos'

/**
 * Cuantos Clientes se traen para el selector.
 *
 * El mismo tope que usan los otros combos de Cliente: el maximo que la API acepta en una pagina.
 * Con cien, la cartera —que pasa de ciento veinte— se cortaba a mitad del alfabeto y los ultimos no
 * se podian asignar.
 */
const CLIENTES_A_TRAER = 500

/** `GET`/`PUT /staff/{id}/focales`, con el id ya escapado. La ruta conserva el nombre de la API. */
function rutaDeFocales (personaId: number): string {
  return `staff/${encodeURIComponent(String(personaId))}/focales`
}

/** Los mismos ids, sin importar el orden en que se eligieron. */
function mismosClientes (unos: number[], otros: number[]): boolean {
  if (unos.length !== otros.length) return false

  const ordenados = [...otros].sort((a, b) => a - b)

  return [...unos].sort((a, b) => a - b).every((id, i) => id === ordenados[i])
}

/**
 * Pestaña Clientes de la ficha de una persona: de que cuentas es {@link GLOSARIO.focal}.
 *
 * Es la misma relacion que edita la pestaña {@link GLOSARIO.focal} del Cliente, mirada desde el otro
 * lado. Existia una sola direccion —pararse en el Cliente y elegir personas—, que sirve para armar
 * el equipo de una cuenta pero no para dar de alta a alguien y repartirle sus cuentas de golpe, que
 * es como se trabaja cuando entra gente nueva.
 *
 * **Nombrar a alguien {@link GLOSARIO.focal} reparte acceso.** Quien figure acá ve todos los
 * {@link GLOSARIO.espacio} y todas las {@link GLOSARIO.proceso} de esos Clientes, aunque no sea
 * miembro de ninguno. La pantalla lo dice con esas palabras a proposito: una lista de empresas al
 * lado de una persona se lee como un dato de contacto, y esto no lo es.
 *
 * Edita con `customers.edit` y no con el permiso de la ficha de persona, que es el mismo que pide la
 * pestaña del Cliente: si esta pantalla pidiera menos, seria el atajo para hacer lo que alla no se
 * puede. Sin ese permiso la pestaña sigue visible en solo lectura, igual que la del Cliente: saber
 * por que cuentas responde alguien no es informacion reservada.
 *
 * La lista que llega ya viene recortada por la visibilidad de quien mira, y guardar solo toca lo que
 * se mostro: un Cliente que no se ve no se puede agregar ni se pierde al guardar.
 *
 * @param personaId la persona que se esta mirando
 * @param nombre su nombre de pila, para los textos de la pantalla
 * @param capacidades capacidades sobre `customers`, de `permissions` de `/me`
 */
export function ClientesDeFocal ({ personaId, nombre, capacidades }: {
  personaId: number
  nombre: string
  capacidades: Capacidad[]
}) {
  const puedeEditar = capacidades.includes('edit')

  const [catalogo, setCatalogo] = useState<ClienteElegible[]>([])
  const [asignados, setAsignados] = useState<ClienteElegible[]>([])
  const [elegidos, setElegidos] = useState<number[]>([])
  const [cargando, setCargando] = useState(true)
  const [cargado, setCargado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nombrePlural = GLOSARIO.cliente.plural.toLowerCase()

  useEffect(() => {
    const aborto = new AbortController()

    void Promise.all([
      pedirSobre<Cliente[]>(`clients?per_page=${CLIENTES_A_TRAER}`, aborto.signal),
      pedirSobre<ClienteElegible[]>(rutaDeFocales(personaId), aborto.signal)
    ]).then(([disponibles, focales]) => {
      if (aborto.signal.aborted) return

      // Conserva los Clientes que ya estan aunque no entren en la pagina que se pidio: sin esto, el
      // selector los mostraria vacios y guardar los sacaria sin que nadie lo pidiera.
      setCatalogo([...new Map(
        [...disponibles.data, ...focales.data].map((cliente) => [cliente.id, {
          id: cliente.id,
          company: cliente.company,
          image_url: cliente.image_url
        }])
      ).values()])
      setAsignados(focales.data)
      setElegidos(focales.data.map((cliente) => cliente.id))
      setCargado(true)
    }).catch((fallo: unknown) => {
      if (!aborto.signal.aborted) {
        setError(fallo instanceof Error ? fallo.message : `No se pudieron cargar los ${nombrePlural}.`)
      }
    }).finally(() => {
      if (!aborto.signal.aborted) setCargando(false)
    })

    return () => aborto.abort()
  }, [personaId, nombrePlural])

  /** Reemplaza la lista entera; una lista vacia deja a la persona sin ninguna cuenta a cargo. */
  async function guardar (evento: React.FormEvent) {
    evento.preventDefault()
    if (!cargado || enviando) return

    setEnviando(true)
    setError(null)
    setGuardado(false)

    const resultado = await escribirEnBff<ClienteElegible[]>(
      rutaDeFocales(personaId), 'PUT', { clientes: elegidos }
    )
    setEnviando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }

    setAsignados(resultado.datos)
    setElegidos(resultado.datos.map((cliente) => cliente.id))
    setGuardado(true)
  }

  if (cargando) return <Cargando alto="min-h-36" mensaje={`Cargando los ${nombrePlural}…`} />

  if (!cargado) {
    return (
      <p role="alert" className="text-texto-peligro text-sm">
        {error ?? `No se pudieron cargar los ${nombrePlural}.`} Recarga la página si el problema continúa.
      </p>
    )
  }

  if (!puedeEditar) return <ListaDeClientes clientes={asignados} nombre={nombre} />

  return (
    <form onSubmit={guardar} className="flex w-full max-w-md flex-col gap-3">
      <fieldset disabled={enviando} className="min-w-0">
        <legend className="mb-1 text-sm font-medium">
          {GLOSARIO.cliente.plural} de los que {nombre} es {GLOSARIO.focal.singular}
        </legend>
        <p className="text-texto-tenue mb-2 text-xs">
          El {GLOSARIO.focal.singular.toLowerCase()} responde por la cuenta y ve todos
          sus {GLOSARIO.espacio.plural.toLowerCase()} y todas sus {GLOSARIO.proceso.plural.toLowerCase()}.
        </p>
        <SelectorClientes clientes={catalogo} elegidos={elegidos} onCambiar={setElegidos} />
        {elegidos.length === 0 && (
          <p className="text-texto-tenue mt-2 text-xs">
            {nombre} no quedará como {GLOSARIO.focal.singular.toLowerCase()} de ningún {GLOSARIO.cliente.singular.toLowerCase()}.
          </p>
        )}
      </fieldset>

      {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}
      {guardado && (
        <p role="status" className="text-texto-tenue text-xs">
          {GLOSARIO.cliente.plural} actualizados.
        </p>
      )}

      <div>
        <Boton
          type="submit"
          tamano="chico"
          variante="primario"
          disabled={enviando || mismosClientes(elegidos, asignados.map((cliente) => cliente.id))}
          cargando={enviando}
        >
          Guardar {nombrePlural}
        </Boton>
      </div>
    </form>
  )
}

/** Por qué cuentas responde hoy, para quien no puede cambiarlo. */
function ListaDeClientes ({ clientes, nombre }: { clientes: ClienteElegible[], nombre: string }) {
  if (clientes.length === 0) {
    return (
      <Vacio
        titulo={`${nombre} no es ${GLOSARIO.focal.singular.toLowerCase()} de ningún ${GLOSARIO.cliente.singular.toLowerCase()}`}
        descripcion={`Quien sea ${GLOSARIO.focal.singular.toLowerCase()} de una cuenta verá todos sus ${GLOSARIO.espacio.plural.toLowerCase()} y todas sus ${GLOSARIO.proceso.plural.toLowerCase()}.`}
      />
    )
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {clientes.map((cliente) => (
        <li
          key={cliente.id}
          className="bg-relleno-neutro text-relleno-neutro-contenido rounded-control flex items-center gap-2 py-1 pl-1 pr-3 text-sm"
        >
          <Avatar nombre={cliente.company} imagen={cliente.image_url} tamano="chico" />
          <span className="max-w-52 truncate">{cliente.company}</span>
        </li>
      ))}
    </ul>
  )
}
