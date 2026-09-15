import type { ReactElement } from 'react'
import { Logo } from '@/componentes/estructura/Logo'
import { Refrescador } from '@/app/sala/[token]/Refrescador'
import './pantalla.css'

/** Cada cuanto vuelve a intentarlo una pantalla desenlazada. */
const MINUTOS_DE_REINTENTO = 10

/**
 * Lo que muestra un televisor cuyo enlace ya no sirve.
 *
 * **El texto no distingue por que fallo.** Inventado, revocado, o el area borrada son el mismo
 * mensaje, igual que en la API: decirle a quien prueba codigos cual de los tres le toco seria
 * confirmarle cuales existen.
 *
 * **Reintenta solo, y es la unica ruta publica donde eso tiene sentido.** Si alguien regenera el
 * enlace desde el panel y lo vuelve a pegar, esta pantalla no se entera; pero si lo que paso fue una
 * revocacion que despues se deshizo, o un despliegue a medias, la pared vuelve sola en diez minutos
 * en vez de esperar a que alguien suba con una escalera. `Refrescador` se reusa tal cual de
 * `/sala/[token]`: son las mismas veintiocho lineas y el mismo problema.
 */
export default function PantallaSinEnlace (): ReactElement {
  return (
    <main className="pantalla-raiz bg-superficie text-texto flex h-dvh flex-col items-center justify-center gap-[3vmin] p-[6vmin] text-center">
      <Refrescador segundos={MINUTOS_DE_REINTENTO * 60} />

      <p className="text-texto text-[6vmin] font-semibold">Esta pantalla ya no está enlazada</p>
      <p className="text-texto-tenue max-w-[80vmin] text-[3.4vmin]">
        Pide un enlace nuevo en Ops, en Administración → Pantallas.
      </p>

      <footer className="text-texto-sutil mt-[4vmin]">
        <Logo tamano="chico" />
      </footer>
    </main>
  )
}
