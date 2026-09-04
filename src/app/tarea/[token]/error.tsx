'use client'

import { ErrorEstado } from '@/componentes/estado/Estados'

/**
 * Red de contencion de la ficha publica.
 *
 * **Sin detalle tecnico, y no por prolijidad**: esta URL la abre cualquiera, asi que el mensaje crudo
 * del servidor —rutas, nombres de tabla, el host de la API— quedaria publicado en internet abierto.
 *
 * El 404 no llega hasta aca: lo atiende `notFound()` en la pagina, porque un token inventado,
 * revocado, vencido o reemplazado tiene que verse igual que los otros tres.
 */
export default function ErrorDeFichaPublica ({ reset }: { error: Error & { digest?: string }, reset: () => void }) {
  return (
    <main className="bg-superficie mx-auto flex min-h-dvh max-w-2xl items-center p-6">
      <ErrorEstado
        detalle="No pudimos cargar esta vista. Prueba de nuevo en un momento."
        onReintentar={reset}
        className="w-full"
      />
    </main>
  )
}
