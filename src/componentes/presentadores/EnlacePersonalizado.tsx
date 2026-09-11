import type { ReactElement } from 'react'
import { enlaceConApodo, esEnlaceValido } from '@/dominio/campos-personalizados'

/**
 * Muestra el nombre de un enlace personalizado sin interpretar el HTML heredado de Perfex.
 * @param props Valor original del campo, como URL o ancla heredada.
 * @returns Un enlace HTTP(S) seguro, un aviso si es inválido o una raya si está vacío.
 */
export function EnlacePersonalizado ({ valor }: { valor: string | null }): ReactElement {
  if (valor === null || valor.trim() === '') return <>—</>
  const enlace = enlaceConApodo(valor)
  if (!esEnlaceValido(enlace.url)) return <>Enlace no válido</>
  const nombre = enlace.apodo_link || 'Abrir enlace'
  return (
    <a href={enlace.url} target="_blank" rel="noopener noreferrer" title={nombre}
      className="text-acento inline-block max-w-64 truncate align-middle underline underline-offset-4">
      {nombre}
    </a>
  )
}
