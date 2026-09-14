'use client'

import { PantallaCaida } from '@/componentes/estado/PantallaCaida'

/**
 * Red de contencion de la ficha publica.
 *
 * **Sin detalle tecnico, y no por prolijidad**: esta URL la abre cualquiera, asi que el mensaje crudo
 * del servidor —rutas, nombres de tabla, el host de la API— quedaria publicado en internet abierto.
 * El mensaje viaja al incidente, que solo lee un superadministrador.
 *
 * El codigo del incidente puede no llegar: quien abre la ficha con el enlace no tiene sesion, y el
 * alta de incidentes la exige. En ese caso el aviso sale sin numero y remite al soporte igual — es
 * la unica pantalla del producto donde eso pasa, y pedir una sesion para poder reportar un error
 * seria peor que no registrarlo.
 *
 * El 404 no llega hasta aca: lo atiende `notFound()` en la pagina, porque un token inventado,
 * revocado, vencido o reemplazado tiene que verse igual que los otros tres.
 */
export default function ErrorDeFichaPublica ({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
  return (
    <main className="bg-superficie mx-auto flex min-h-dvh max-w-2xl items-center p-6">
      <PantallaCaida
        error={error}
        reset={reset}
        detalle="No pudimos cargar esta vista. Prueba de nuevo en un momento."
        className="w-full"
      />
    </main>
  )
}
