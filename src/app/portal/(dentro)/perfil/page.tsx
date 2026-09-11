import type { Metadata } from 'next'
import { pedirPortal } from '@/datos/servidor'
import type { EmpresaPortal, YoPortal } from '@/datos/tipos'
import { Bloque, Datos } from '../detalle'

export const metadata: Metadata = { title: 'Mi perfil · Portal de clientes' }

/**
 * Perfil del contacto y datos de su empresa.
 *
 * Solo lectura: el portal del cliente no escribe nada, y editar estos datos vive en la ficha del
 * cliente del panel. Mostrarlos igual importa —es donde el contacto verifica que el correo y el
 * telefono con los que lo ubicamos son los que usa— aunque para corregirlos tenga que avisarnos.
 *
 * Los rotulos son los mismos que los de `componentes/cliente/campos.ts`: el mismo dato no puede
 * llamarse distinto segun quien lo mire.
 */
export default async function PerfilPagina () {
  const [yo, empresa] = await Promise.all([
    pedirPortal<YoPortal>('/portal/me'),
    pedirPortal<EmpresaPortal>('/portal/company')
  ])

  const contacto = yo.data
  const datos = empresa.data

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-texto text-xl font-semibold">Mi perfil</h1>

      <Bloque titulo="Tus datos">
        <Datos
          filas={[
            ['Nombre', contacto.full_name],
            ['Cargo', contacto.title],
            ['Correo', contacto.email],
            ['Teléfono', contacto.phonenumber],
            ['Contacto principal', contacto.is_primary ? 'Sí' : 'No']
          ]}
        />
      </Bloque>

      <Bloque titulo="Tu empresa">
        <Datos
          filas={[
            ['Nombre o razón social', datos.company],
            ['RUT', datos.vat],
            ['Teléfono', datos.phonenumber],
            ['Sitio web', datos.website],
            ['Dirección', datos.address],
            ['Ciudad', datos.city],
            ['Región', datos.state],
            ['Código postal', datos.zip]
          ]}
        />
      </Bloque>

      {/* Facturacion y envio son las dos direcciones de la empresa, no el modulo de ventas: llegan
          solo si el contacto es primario y la opcion esta habilitada, y la API no emite las claves
          en otro caso, asi que preguntar por `undefined` alcanza. */}
      {datos.billing !== undefined && (
        <Bloque titulo="Facturación">
          <Datos
            filas={[
              ['Calle', datos.billing.street],
              ['Ciudad', datos.billing.city],
              ['Región', datos.billing.state],
              ['Código postal', datos.billing.zip],
              ['País', datos.billing.country]
            ]}
          />
        </Bloque>
      )}

      {datos.shipping !== undefined && (
        <Bloque titulo="Envío">
          <Datos
            filas={[
              ['Calle', datos.shipping.street],
              ['Ciudad', datos.shipping.city],
              ['Región', datos.shipping.state],
              ['Código postal', datos.shipping.zip],
              ['País', datos.shipping.country]
            ]}
          />
        </Bloque>
      )}

      <p className="text-texto-sutil text-sm">
        ¿Necesitas cambiar algún dato? Escríbenos y lo actualizamos.
      </p>
    </section>
  )
}
