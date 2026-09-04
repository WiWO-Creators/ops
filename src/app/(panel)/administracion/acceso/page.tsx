import { AccesoGoogle } from '@/componentes/administracion/AccesoGoogle'
import { ErrorEstado, SinPermiso } from '@/componentes/estado/Estados'
import { leerAjustes } from '@/datos/ajustes'
import { ErrorApi } from '@/datos/errores'
import { pedir } from '@/datos/servidor'
import type { Ajustes } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'

export const metadata = { title: 'Acceso con Google · WiWO Ops' }

/**
 * Trae los ajustes de la instalacion, o el error de la API como valor.
 *
 * Separada de la pagina por lo mismo que en `administracion/correo`: React no renderiza el JSX en el
 * momento en que se lee, asi que un error de render dentro del `try` no lo atraparia el `catch` — y
 * el lint del proyecto lo rechaza (`react-hooks/error-boundaries`). Acá el `try` solo espera.
 */
async function cargarAjustes (): Promise<Ajustes | ErrorApi> {
  try {
    return await leerAjustes()
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}

/**
 * Configuracion del login con Google del equipo.
 *
 * Los dominios autorizados viven en `tbloptions` y se editan desde acá justamente para no volver a
 * necesitar un despliegue —ni una variable de entorno— cada vez que entra o sale una agencia.
 *
 * `is_superadmin` se revisa antes de pedir los ajustes: `PATCH /settings` ya exige superadmin del
 * lado de la API —ahi esta la compuerta real—, pero la lectura no —los seis valores de solo lectura
 * los necesita cualquiera para pintar—, asi que sin esta comprobacion la pantalla se dibujaria
 * entera, por URL directa, para alguien que no puede guardar nada. Es la misma llave que decide si
 * la seccion aparece en la barra lateral (`seccionesDe` en el layout del panel).
 */
export default async function AdministracionAccesoPage () {
  const { data: yo } = await pedir<Yo>('/me')

  if (!yo.is_superadmin) return <SinPermiso className="mt-10" />

  const ajustes = await cargarAjustes()

  if (ajustes instanceof ErrorApi) {
    if (ajustes.codigo === 'forbidden') return <SinPermiso className="mt-10" />

    return <ErrorEstado detalle={ajustes.message} className="mt-10" />
  }

  return (
    <section className="flex flex-col gap-8">
      <div>
        <h1 className="text-texto text-xl font-semibold">Acceso con Google</h1>
        <p className="text-texto-tenue mt-1 text-sm">
          Quién puede entrar a Ops con su cuenta de Google. Se guarda en los ajustes de la instalación, así que
          sumar o sacar un dominio no necesita tocar código ni volver a desplegar.
        </p>
      </div>

      <AccesoGoogle inicial={ajustes} />
    </section>
  )
}
