import { Suspense } from 'react'
import { VistaAccesos } from '@/componentes/administracion/accesos/VistaAccesos'
import { Cargando, ErrorEstado, SinPermiso } from '@/componentes/estado/Estados'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { ErrorApi } from '@/datos/errores'
import { pedir } from '@/datos/servidor'
import type { CatalogoDeAccesos } from '@/datos/accesos'
import type { Yo } from '@/datos/tipos'

export const metadata = { title: 'Accesos · WiWO Ops' }

/**
 * Trae el catálogo entero, o el error de la API como valor.
 *
 * Separada de la página para no construir JSX dentro del `try`, igual que en `/administracion`: el
 * lint del proyecto rechaza un `catch` que envuelva render.
 */
async function cargar (): Promise<CatalogoDeAccesos | ErrorApi> {
  try {
    const { data } = await pedir<CatalogoDeAccesos>('/accesos/catalogo')

    return data
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}

/**
 * Accesos: quién puede qué, en una sola pantalla.
 *
 * Antes esto estaba repartido en cinco lugares que no se veían entre sí: los escalones vivían
 * escritos a mano en dos archivos del frontend, el mapa de roles solo en `tbloptions`, el área y el
 * cargo en la ficha de cada persona, el árbol en `/equipo/jerarquia`, y los interruptores del modelo
 * de permisos en ningún lado —se cambiaban con un `UPDATE` a mano—. El resultado era que nadie podía
 * responder "por qué esta persona ve esto" sin abrir la base.
 *
 * **Los escalones ya no están hardcodeados**: salen de `GET /accesos/catalogo`, con su piso, su
 * alcance y cuánta gente los usa. `componentes/equipo/nivel.ts` y `nivelBase.ts` siguen existiendo
 * porque los usan las dos puertas viejas de la ficha de una persona, y cambiarlas es otro trabajo.
 *
 * `is_superadmin` se revisa antes de pedir nada: todas las rutas de `/accesos` ya exigen
 * superadministrador —ahí está la compuerta real— pero pedirlas igual gastaría un viaje que sabemos
 * que vuelve 403. Es la misma llave que decide si «Administración» aparece en la barra lateral, así
 * que entrar por URL directa tampoco pinta nada.
 */
export default async function AccesosPage () {
  const { data: yo } = await pedir<Yo>('/me')

  if (!yo.is_superadmin) return <SinPermiso className="mt-10" />

  const catalogo = await cargar()

  if (catalogo instanceof ErrorApi) {
    if (catalogo.codigo === 'forbidden') return <SinPermiso className="mt-10" />

    return <ErrorEstado detalle={catalogo.message} className="mt-10" />
  }

  return (
    <section className="flex flex-col gap-4">
      <TituloModulo
        titulo="Accesos"
        descripcion="La escalera de permisos y quién está en ella: escalones, roles, personas, áreas y cargos, y los interruptores que deciden de dónde sale el acceso de todo el equipo."
      />

      {/* El `Suspense` no es decorativo: `Pestanas` usa `useSearchParams`, y sin ese límite el build
          de la ruta falla. Mismo motivo que en `/administracion`. */}
      <Suspense fallback={<Cargando alto="min-h-36" mensaje="Cargando los accesos…" />}>
        <VistaAccesos inicial={catalogo} actorId={yo.id} />
      </Suspense>
    </section>
  )
}
