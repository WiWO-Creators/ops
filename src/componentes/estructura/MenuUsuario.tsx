'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LogOut, Moon, Sparkles, Sun, UserRound } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { aplicarTema, esOscuro } from '@/lib/tema'
import { hayNovedadesSinVer } from '@/dominio/novedades'
import { EVENTO_NOVEDADES_VISTAS, leerNovedadesVistas } from '@/lib/novedades-vistas'
import {
  ContenidoMenu,
  DisparadorMenu,
  ItemMenu,
  MenuContextual,
  SeparadorMenu
} from '@/componentes/superposiciones/MenuContextual'

interface PropsMenuUsuario {
  nombre: string
  imagen: string | null
  /** La fecha de la novedad más reciente, `YYYY-MM-DD`; `null` si no hay ninguna. */
  ultimaNovedad: string | null
}

/**
 * Se suscribe a los cambios de la marca de novedades: la de esta pestaña (evento propio) y la de
 * otras pestañas del mismo navegador (`storage`).
 *
 * @param avisar lo que React vuelve a leer cuando algo cambia
 * @returns la baja de la suscripción
 */
function suscribirNovedadesVistas (avisar: () => void): () => void {
  window.addEventListener(EVENTO_NOVEDADES_VISTAS, avisar)
  window.addEventListener('storage', avisar)

  return () => {
    window.removeEventListener(EVENTO_NOVEDADES_VISTAS, avisar)
    window.removeEventListener('storage', avisar)
  }
}

/**
 * Menu de la persona que mira: su perfil y la salida.
 *
 * El avatar era decorativo y "Salir" un boton suelto al lado. Como el avatar ya es el simbolo de la
 * cuenta en toda la interfaz, es tambien el lugar donde se espera encontrar lo que le pertenece: la
 * cuenta entera cuelga de ahi y la cabecera queda con un control en vez de dos.
 *
 * Sobre `MenuContextual` (Radix) y no sobre un `<details>`: flechas, `Escape` con devolucion del
 * foco al avatar y el `aria-expanded` del disparador vienen resueltos.
 *
 * `router.replace` y no `push` al salir: la pantalla del panel no debe quedar en el historial de
 * alguien que acaba de cerrar sesion. El `refresh` posterior tira el cache del router, que todavia
 * guarda arboles renderizados con la sesion vieja.
 */
export function MenuUsuario ({ nombre, imagen, ultimaNovedad }: PropsMenuUsuario) {
  const router = useRouter()
  const [saliendo, establecerSaliendo] = useState(false)
  // En el servidor no hay marca que leer: se asume vista para que el punto no destelle al hidratar
  // en quien ya las leyó. En el navegador aparece apenas se lee la marca real.
  const novedadesVistas = useSyncExternalStore(suscribirNovedadesVistas, leerNovedadesVistas, () => ultimaNovedad)
  const conNovedades = hayNovedadesSinVer(novedadesVistas, ultimaNovedad)

  async function salir (): Promise<void> {
    establecerSaliendo(true)

    try {
      await fetch('/api/sesion', { method: 'DELETE' })
    } finally {
      // Pase lo que pase con la API, la cookie ya se borro del lado del servidor o la sesion quedo
      // inservible: en los dos casos corresponde ir a entrar.
      router.replace('/colab')
      router.refresh()
    }
  }

  return (
    <MenuContextual>
      <DisparadorMenu
        aria-label={conNovedades ? `Cuenta de ${nombre}, hay novedades sin leer` : `Cuenta de ${nombre}`}
        className="relative rounded-full"
      >
        <Avatar nombre={nombre} imagen={imagen} />
        {conNovedades && (
          <span aria-hidden="true" className="bg-acento ring-superficie absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2" />
        )}
      </DisparadorMenu>

      <ContenidoMenu align="end">
        {/* El nombre encabeza el menu y no es una opcion: con varias sesiones abiertas —o suplantando
            a alguien— es lo unico que dice de quien es la cuenta antes de tocar nada. */}
        <p className="text-texto truncate px-2.5 py-1.5 text-sm font-semibold">{nombre}</p>

        <SeparadorMenu />

        <ItemMenu asChild>
          <Link href="/perfil">
            <UserRound className="size-4 shrink-0" aria-hidden="true" />
            Mi perfil
          </Link>
        </ItemMenu>

        <ItemMenu asChild>
          <Link href="/novedades">
            <Sparkles className="size-4 shrink-0" aria-hidden="true" />
            Novedades
            {conNovedades && (
              <span className="bg-acento ml-auto size-2 shrink-0 rounded-full">
                <span className="sr-only">sin leer</span>
              </span>
            )}
          </Link>
        </ItemMenu>

        {/* Solo bajo 480px, donde el selector de tema sale de la cabecera por falta de lugar: el tema
            sigue a un toque, en el menu de la cuenta, que es donde van las preferencias propias. Los
            dos rotulos se pintan y CSS elige, igual que los iconos del selector: el estado del tema
            vive en el DOM y leerlo en el render daria un rotulo equivocado al hidratar. */}
        <ItemMenu className="xs:hidden" onSelect={() => { aplicarTema(esOscuro() ? 'light' : 'dark') }}>
          <Moon className="size-4 shrink-0 oscuro:hidden" aria-hidden="true" />
          <Sun className="hidden size-4 shrink-0 oscuro:block" aria-hidden="true" />
          <span className="oscuro:hidden">Tema oscuro</span>
          <span className="hidden oscuro:inline">Tema claro</span>
        </ItemMenu>

        <SeparadorMenu />

        <ItemMenu peligroso disabled={saliendo} onSelect={() => { void salir() }}>
          <LogOut className="size-4 shrink-0" aria-hidden="true" />
          {saliendo ? 'Saliendo…' : 'Salir'}
        </ItemMenu>
      </ContenidoMenu>
    </MenuContextual>
  )
}
