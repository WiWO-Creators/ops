'use client'

import { MatrizAsignacion } from '@/componentes/formularios/MatrizAsignacion'
import { SelectorClientes, type ClienteElegible } from '@/componentes/formularios/SelectorClientes'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { EnlaceCliente } from '@/componentes/presentadores/EnlaceCliente'
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

/** Un Cliente en la forma que dibuja el selector. */
function comoElegible (cliente: ClienteElegible | Cliente): ClienteElegible {
  return { id: cliente.id, company: cliente.company, image_url: cliente.image_url }
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
  const nombrePlural = GLOSARIO.cliente.plural.toLowerCase()
  const clienteSingular = GLOSARIO.cliente.singular.toLowerCase()
  const focal = GLOSARIO.focal.singular.toLowerCase()
  const espacios = GLOSARIO.espacio.plural.toLowerCase()
  const procesos = GLOSARIO.proceso.plural.toLowerCase()

  return (
    <MatrizAsignacion<ClienteElegible, ClienteElegible>
      clave={String(personaId)}
      puedeEditar={capacidades.includes('edit')}
      cargar={async (senal) => {
        const [disponibles, focales] = await Promise.all([
          pedirSobre<Cliente[]>(`clients?per_page=${CLIENTES_A_TRAER}`, senal),
          pedirSobre<ClienteElegible[]>(rutaDeFocales(personaId), senal)
        ])

        return { opciones: disponibles.data.map(comoElegible), asignados: focales.data }
      }}
      guardar={(ids) => escribirEnBff<ClienteElegible[]>(rutaDeFocales(personaId), 'PUT', { clientes: ids })}
      idDe={(cliente) => cliente.id}
      comoOpcion={comoElegible}
      textos={{
        cargando: `Cargando los ${nombrePlural}…`,
        falloDeCarga: `No se pudieron cargar los ${nombrePlural}.`,
        leyenda: `${GLOSARIO.cliente.plural} de los que ${nombre} es ${GLOSARIO.focal.singular}`,
        descripcion: (
          <p className="text-texto-tenue mb-2 text-xs">
            El {focal} responde por la cuenta y ve todos sus {espacios} y todas sus {procesos}.
          </p>
        ),
        sinNinguno: `${nombre} no quedará como ${focal} de ningún ${clienteSingular}.`,
        guardar: `Guardar ${nombrePlural}`,
        exito: `${GLOSARIO.cliente.plural} de «${nombre}» actualizados.`,
        vacio: {
          titulo: `${nombre} no es ${focal} de ningún ${clienteSingular}`,
          descripcion: `Quien sea ${focal} de una cuenta verá todos sus ${espacios} y todas sus ${procesos}.`
        }
      }}
      selector={(clientes, elegidos, onCambiar) => (
        <SelectorClientes clientes={clientes} elegidos={elegidos} onCambiar={onCambiar} />
      )}
      chipConImagen
      chip={(cliente) => (
        <>
          <Avatar nombre={cliente.company} imagen={cliente.image_url} tamano="chico" />
          <EnlaceCliente id={cliente.id} nombre={cliente.company} className="max-w-52" />
        </>
      )}
    />
  )
}
