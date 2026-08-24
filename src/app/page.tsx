import { redirect } from 'next/navigation'

/**
 * Raiz temporal.
 *
 * Hasta que exista el panel (carril B), la raiz lleva al taller. Se reemplaza por el shell con la
 * navegacion cuando llegue.
 */
export default function Inicio () {
  redirect('/taller')
}
