import type { Metadata } from 'next'
import { FormularioFijarClave } from './FormularioFijarClave'

export const metadata: Metadata = { title: 'Elige tu contraseña · Portal de clientes' }

/**
 * Pantalla donde el cliente fija su propia contraseña del portal.
 *
 * Es la segunda ruta publica del proyecto, junto con `/sala/<token>`: quien llega acá justamente NO
 * tiene sesion, y pedirle una seria pedirle la contraseña que viene a crear. La autoriza el token
 * del enlace, de un solo uso y con 72 horas de vida, que alguien del equipo genero desde la ficha
 * del cliente y le entrego por fuera del sistema.
 *
 * **El token no se verifica acá.** Canjearlo lo quema, asi que preguntarle a la API si sirve
 * gastaria el unico uso que tiene antes de que la persona escriba nada. El unico momento en que se
 * toca es al enviar el formulario, y ahi el error se muestra en la misma pantalla.
 *
 * Por eso tampoco se muestra a quien pertenece el enlace: la API no dice el nombre ni el correo del
 * contacto hasta despues del canje, y esta bien que no lo diga — un token inventado no puede servir
 * para averiguar quien existe.
 */
export default async function FijarClavePagina (props: PageProps<'/clave/[token]'>) {
  const { token } = await props.params

  return <FormularioFijarClave token={token} />
}
