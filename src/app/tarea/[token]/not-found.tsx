import type { ReactElement } from 'react'
import { Logo } from '@/componentes/estructura/Logo'
import { Vacio } from '@/componentes/estado/Estados'

/**
 * Lo que ve quien llega con un enlace que ya no sirve.
 *
 * Existe porque sin ella Next sirve su 404 crudo, y esta URL la abre gente de afuera: el unico
 * contacto que van a tener con el producto no puede ser una pagina en blanco en ingles.
 *
 * **El texto no distingue por que fallo.** Inventado, revocado, vencido o reemplazado por uno nuevo
 * son el mismo mensaje, igual que en la API: decirle a quien prueba tokens cual de los cuatro le toco
 * seria confirmarle cuales existen. Tampoco se ofrece reintentar ni entrar: no hay nada que
 * reintentar, y quien mira no tiene cuenta.
 */
export default function EnlaceInexistente (): ReactElement {
  return (
    <main className="bg-superficie mx-auto flex min-h-dvh max-w-2xl flex-col p-6">
      <div className="flex flex-1 items-center">
        <Vacio
          titulo="Este enlace ya no sirve"
          descripcion="Puede que haya vencido o que quien te lo pasó lo haya dado de baja. Pídele uno nuevo."
          className="w-full"
        />
      </div>
      <footer className="text-texto-sutil flex items-center gap-2 pt-6 text-xs">
        <Logo tamano="chico" />
      </footer>
    </main>
  )
}
