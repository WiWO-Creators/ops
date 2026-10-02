'use client'

import Link from 'next/link'
import { MatrizAsignacion } from '@/componentes/formularios/MatrizAsignacion'
import { SelectorClientes, type ClienteElegible } from '@/componentes/formularios/SelectorClientes'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { pedirSobre } from '@/datos/cliente'
import type { Cliente } from '@/datos/recursos'
import { rutaDeSupervisionDePersona, type ClienteSupervisado } from '@/datos/supervision'
import type { Capacidad } from '@/datos/tipos'
import { AVISO_FOCALES_ENTRAN_SOLOS, enlaceDeHoja, hoyEnSantiago, mensajeDeRechazo } from '@/dominio/supervision'

/** El tope de la API por página: con cien, la cartera se cortaba a mitad del alfabeto. */
const CLIENTES_A_TRAER = 500

/** Un cliente supervisado en la forma que dibuja el selector. */
function comoElegible (cliente: ClienteSupervisado): ClienteElegible {
  return { id: cliente.client_id, company: cliente.company, image_url: null }
}

/**
 * Pestaña Supervisión de la ficha de una persona: qué clientes supervisa cada día.
 *
 * Es la misma relación que la pestaña Supervisión del Cliente, mirada desde la persona: sirve para
 * repartirle de una vez las cuentas a un lead nuevo. La ficha solo la muestra a personas de escalón
 * Lead o superior, que son las únicas que la API acepta como supervisoras.
 *
 * Edita con `customers.edit`, el mismo permiso que la pestaña del Cliente; sin él se ve en solo
 * lectura.
 *
 * @param personaId la persona que se está mirando
 * @param nombre su nombre de pila, para los textos
 * @param capacidades capacidades sobre `customers`, de `permissions` de `/me`
 */
export function SupervisionPersona ({ personaId, nombre, capacidades }: {
  personaId: number
  nombre: string
  capacidades: Capacidad[]
}) {
  const puedeEditar = capacidades.includes('edit')

  return (
    <MatrizAsignacion<ClienteElegible, ClienteSupervisado>
      clave={`${personaId}:${puedeEditar}`}
      puedeEditar={puedeEditar}
      cargar={async (senal) => {
        const [disponibles, supervisados] = await Promise.all([
          puedeEditar ? pedirSobre<Cliente[]>(`clients?per_page=${CLIENTES_A_TRAER}`, senal) : Promise.resolve({ data: [] }),
          pedirSobre<ClienteSupervisado[]>(rutaDeSupervisionDePersona(personaId), senal)
        ])

        return {
          opciones: disponibles.data.map((c) => ({ id: c.id, company: c.company, image_url: c.image_url })),
          asignados: supervisados.data
        }
      }}
      guardar={(ids) => escribirEnBff<ClienteSupervisado[]>(rutaDeSupervisionDePersona(personaId), 'PUT', { client_ids: ids })}
      idDe={(cliente) => cliente.client_id}
      comoOpcion={comoElegible}
      explicarRechazo={(rechazo) => mensajeDeRechazo(rechazo.mensaje, rechazo.estado, rechazo.detalles)}
      textos={{
        cargando: 'Cargando la supervisión…',
        falloDeCarga: 'No se pudo cargar la supervisión.',
        leyenda: `Clientes que ${nombre} supervisa`,
        descripcion: (
          <>
            <p className="text-texto-tenue mb-2 text-xs">
              Cada día recibe una hoja con las tareas de su gente a cargo y de sus clientes que vencen ese
              día, siguen atrasadas o se completaron ese día; la revisa y la firma.
            </p>
            <p className="text-texto-aviso mb-2 text-xs">{AVISO_FOCALES_ENTRAN_SOLOS}</p>
          </>
        ),
        sinNinguno: `${nombre} no supervisará ningún cliente.`,
        guardar: 'Guardar clientes',
        exito: `Supervisión de «${nombre}» actualizada.`,
        vacio: {
          titulo: `${nombre} no supervisa ningún cliente extra`,
          descripcion: `${AVISO_FOCALES_ENTRAN_SOLOS} Los supervisores extra se asignan en la ficha del cliente, pestaña Supervisión.`
        }
      }}
      selector={(clientes, elegidos, onCambiar) => (
        <SelectorClientes clientes={clientes} elegidos={elegidos} onCambiar={onCambiar} />
      )}
      chip={(cliente) => cliente.company}
      antesDeLaLista={<p className="text-texto-tenue text-xs">{AVISO_FOCALES_ENTRAN_SOLOS}</p>}
      extra={(
        <Link href={enlaceDeHoja(hoyEnSantiago(), personaId)} className="text-acento text-sm font-semibold underline underline-offset-4">
          Ver la hoja de hoy
        </Link>
      )}
    />
  )
}
