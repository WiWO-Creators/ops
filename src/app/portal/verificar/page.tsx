import type { Metadata } from 'next'
import { Logo } from '@/componentes/estructura/Logo'
import { PanelVidrio } from '@/componentes/superposiciones/PanelVidrio'

export const metadata: Metadata = { title: 'Verificá tu correo · Portal de clientes' }

/**
 * Pantalla para el contacto que todavia no verifico su correo.
 *
 * Vive fuera del layout autenticado a proposito: ese layout manda acá a quien no verifico, asi que
 * ponerla adentro seria un bucle de redirecciones.
 *
 * No ofrece reenviar el correo: reenviarlo es una escritura, y el portal nuevo es de solo lectura.
 * El enlace de verificacion se envia desde el panel, como hasta ahora.
 */
export default function VerificarPagina () {
  return (
    <main className="fondo-marca grid h-dvh place-items-center overflow-y-auto p-6">
      <PanelVidrio className="w-full max-w-md p-8">
        <Logo />
        <h1 className="font-titular text-texto mt-6 text-xl font-semibold">Verificá tu correo</h1>
        <p className="text-texto-tenue mt-2 text-sm">
          Te enviamos un enlace de verificación al correo con el que entraste. Abrilo para poder ver
          tus proyectos y documentos.
        </p>
        <p className="text-texto-sutil mt-4 text-sm">
          Si no te llegó, escribinos y te lo reenviamos.
        </p>
      </PanelVidrio>
    </main>
  )
}
