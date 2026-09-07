'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LogOut, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Avatar } from '@/componentes/presentadores/Avatar'
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
export function MenuUsuario ({ nombre, imagen }: PropsMenuUsuario) {
  const router = useRouter()
  const [saliendo, establecerSaliendo] = useState(false)

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
      <DisparadorMenu aria-label={`Cuenta de ${nombre}`} className="rounded-full">
        <Avatar nombre={nombre} imagen={imagen} />
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

        <SeparadorMenu />

        <ItemMenu peligroso disabled={saliendo} onSelect={() => { void salir() }}>
          <LogOut className="size-4 shrink-0" aria-hidden="true" />
          {saliendo ? 'Saliendo…' : 'Salir'}
        </ItemMenu>
      </ContenidoMenu>
    </MenuContextual>
  )
}
