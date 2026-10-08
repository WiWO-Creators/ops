import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { RecorridoDeContacto } from '@/componentes/cliente/actividad-portal/RecorridoDeContacto'
import { Vacio, ErrorEstado, SinPermiso } from '@/componentes/estado/Estados'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { ErrorApi } from '@/datos/errores'
import { pedir } from '@/datos/servidor'
import type { ContactoCompleto } from '@/datos/recursos'

export const metadata = { title: 'Actividad del contacto · WiWO Ops' }

/**
 * Recorrido de un contacto por el portal, sesión por sesión.
 *
 * La ruta lleva el cliente y el contacto: si el contacto no es de ese cliente se trata como
 * inexistente, para que cambiar un número en la URL no muestre el rastro de otra empresa bajo un
 * nombre que no es. La API ya exige que el cliente sea visible para quien pregunta.
 */
export default async function ActividadDeContactoPage (props: PageProps<'/clientes/[id]/actividad/[contacto]'>) {
  const { id, contacto: contactoId } = await props.params

  let contacto: ContactoCompleto

  try {
    contacto = (await pedir<ContactoCompleto>(`/contacts/${encodeURIComponent(contactoId)}`)).data
  } catch (error) {
    if (!(error instanceof ErrorApi)) throw error
    if (error.codigo === 'forbidden') return <SinPermiso />
    if (error.codigo === 'not_found') return <NoEncontrado clienteId={id} />

    return <ErrorEstado detalle={error.message} />
  }

  if (String(contacto.client_id) !== id) return <NoEncontrado clienteId={id} />

  return (
    <section className="flex flex-col gap-8">
      <Link
        href={`/clientes/${id}?tab=actividad`}
        className="text-texto-tenue hover:text-texto flex w-fit items-center gap-1.5 text-sm"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Actividad del portal
      </Link>
      <TituloModulo
        titulo={contacto.full_name}
        descripcion={`${contacto.title ?? 'Contacto'} · ${contacto.email}. Todo lo que hizo en el portal, de la sesión más reciente a la más antigua.`}
      />
      <RecorridoDeContacto contactoId={contacto.id} />
    </section>
  )
}

/** El contacto no existe o no es de ese cliente. */
function NoEncontrado ({ clienteId }: { clienteId: string }) {
  return (
    <Vacio
      titulo="Ese contacto no existe"
      descripcion="Puede que lo hayan borrado, o que el enlace esté mal escrito."
      accion={
        <Link href={`/clientes/${clienteId}?tab=actividad`} className="text-acento text-sm font-semibold underline underline-offset-4">
          Volver a la actividad del portal
        </Link>
      }
    />
  )
}
