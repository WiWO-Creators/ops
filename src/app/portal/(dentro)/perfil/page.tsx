import type { Metadata } from 'next'
import { pedirPortal } from '@/datos/servidor'
import type { EmpresaPortal, YoPortal } from '@/datos/tipos'
import { Bloque, Datos } from '../detalle'

export const metadata: Metadata = { title: 'Mi perfil · Portal de clientes' }

/**
 * Perfil del contacto y datos de su empresa.
 *
 * Solo lectura: editarlos es una escritura, y sigue viviendo en el portal viejo. Mostrarlos igual
 * importa —es donde alguien verifica que el correo al que le llegan las facturas es el correcto—
 * aunque para cambiarlos tenga que ir a otro lado.
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
            ['Razón social', datos.company],
            ['CUIT', datos.vat],
            ['Teléfono', datos.phonenumber],
            ['Sitio web', datos.website],
            ['Dirección', datos.address],
            ['Ciudad', datos.city],
            ['Provincia', datos.state],
            ['Código postal', datos.zip]
          ]}
        />
      </Bloque>

      {/* Facturacion y envio solo llegan si el contacto es primario y la opcion esta habilitada: la
          API no emite las claves en otro caso, asi que preguntar por `undefined` alcanza. */}
      {datos.billing !== undefined && (
        <Bloque titulo="Facturación">
          <Datos
            filas={[
              ['Calle', datos.billing.street],
              ['Ciudad', datos.billing.city],
              ['Provincia', datos.billing.state],
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
              ['Provincia', datos.shipping.state],
              ['Código postal', datos.shipping.zip],
              ['País', datos.shipping.country]
            ]}
          />
        </Bloque>
      )}

      <p className="text-texto-sutil text-sm">
        ¿Necesitás cambiar algún dato? Escribinos y lo actualizamos.
      </p>
    </section>
  )
}
