import Link from 'next/link'
import { Suspense } from 'react'
import { AccesoGoogle } from '@/componentes/administracion/AccesoGoogle'
import { FormularioDeAjustes } from '@/componentes/administracion/FormularioDeAjustes'
import { PanelAvisosPorCorreo } from '@/componentes/administracion/PanelAvisosPorCorreo'
import { Cargando, ErrorEstado, SinPermiso } from '@/componentes/estado/Estados'
import { Pestanas, type Panel } from '@/componentes/proyecto/Pestanas'
import { leerAjustes } from '@/datos/ajustes'
import { ErrorApi } from '@/datos/errores'
import { cargarLookups } from '@/datos/lookups'
import { pedir } from '@/datos/servidor'
import { clavesDelGrupo, dominiosDeAjustes } from '@/dominio/ajustes'
import type { Ajustes, Lookups } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'

export const metadata = { title: 'Administración · WiWO Ops' }

/** Los grupos de `GET /settings` que se dibujan solos con el formulario generico, en orden. */
const GRUPOS_GENERICOS = ['procesos', 'cronometro', 'listados']

/**
 * Trae los ajustes de la instalacion y los catalogos, o el error de la API como valor.
 *
 * Separada de la pagina para no construir JSX dentro del `try`: React no renderiza el JSX en el
 * momento en que se lee, asi que un error de render ahi no lo atraparia el `catch` — y el lint del
 * proyecto lo rechaza (`react-hooks/error-boundaries`). Acá el `try` solo espera.
 *
 * Los catalogos hacen falta porque tres dominios de `/settings` son ids y no textos: la prioridad y
 * el estado por defecto de una Tarea, y el rol de quien entra nuevo.
 */
async function cargar (): Promise<{ ajustes: Ajustes, lookups: Lookups } | ErrorApi> {
  try {
    const [ajustes, lookups] = await Promise.all([leerAjustes(), cargarLookups()])

    return { ajustes, lookups }
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}

/**
 * Administración: todas las opciones del superadministrador en una sola sección.
 *
 * Antes eran dos pantallas sueltas en la barra —el correo y el acceso con Google— y quince opciones
 * de `GET /settings` que no tenían ningún control en Ops: para prender la capa de IA había que
 * escribir `tbloptions` a mano. Están las cuatro pestañas acá porque son lo mismo: cosas que cambian
 * el comportamiento de la instalación **para todo el mundo**, y que por eso la API deja escribir
 * solo a un superadministrador.
 *
 * Cada pestaña guarda por su cuenta y ninguna pisa a la otra: `PATCH /settings` escribe unicamente
 * las claves presentes en el cuerpo, así que tres formularios con tres copias del mismo `Ajustes`
 * no se sobreescriben entre sí.
 *
 * `is_superadmin` se revisa antes de pedir nada más: las rutas de abajo ya exigen superadmin del
 * lado de la API —ahí está la compuerta real—, pero pedirlas igual gastaría viajes que sabemos que
 * van a volver 403. La comprobación es la misma que decide si la sección aparece en la barra
 * lateral (`seccionesDe` en el layout), y está acá para que entrar por URL directa tampoco pinte
 * nada.
 */
export default async function AdministracionPage () {
  const { data: yo } = await pedir<Yo>('/me')

  if (!yo.is_superadmin) return <SinPermiso className="mt-10" />

  const cargado = await cargar()

  if (cargado instanceof ErrorApi) {
    if (cargado.codigo === 'forbidden') return <SinPermiso className="mt-10" />

    return <ErrorEstado detalle={cargado.message} className="mt-10" />
  }

  const { ajustes, lookups } = cargado
  const dominios = dominiosDeAjustes(lookups)

  const paneles: Panel[] = [
    {
      clave: 'opciones',
      etiqueta: 'Opciones',
      contenido: (
        <div className="flex flex-col gap-8">
          {GRUPOS_GENERICOS.map((grupo) => (
            <FormularioDeAjustes
              key={grupo}
              inicial={ajustes}
              grupo={grupo}
              claves={clavesDelGrupo(ajustes, grupo)}
              dominios={dominios}
            />
          ))}
        </div>
      )
    },
    {
      clave: 'ia',
      etiqueta: 'IA',
      contenido: (
        <FormularioDeAjustes
          inicial={ajustes}
          grupo="ia"
          claves={clavesDelGrupo(ajustes, 'ia')}
          dominios={dominios}
        >
          <DondeSeUsaLaIa />
        </FormularioDeAjustes>
      )
    },
    { clave: 'acceso', etiqueta: 'Acceso con Google', contenido: <AccesoGoogle inicial={ajustes} /> },
    { clave: 'correo', etiqueta: 'Avisos por correo', contenido: <PanelAvisosPorCorreo /> }
  ]

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-texto text-xl font-semibold">Administración</h1>
        <p className="text-texto-tenue mt-1 text-sm">
          Todo lo que cambia el comportamiento de Ops para el equipo entero. Solo lo ve —y solo lo puede
          guardar— un superadministrador.
        </p>
        {/* La casilla entrante es una pantalla aparte y no una pestaña mas: tiene su propio listado
            paginado de fichas, y meterlo en una pestaña obligaria a bajarlo en cada visita a
            Administracion aunque nadie lo mire. El enlace vive aca porque si no, a la pantalla solo
            se llega escribiendo la URL. */}
        <Link
          href="/administracion/correos-entrantes"
          className="text-acento mt-3 inline-block text-sm font-semibold underline underline-offset-4"
        >
          Casilla entrante: briefs y puntajes de los correos que llegan
        </Link>
      </div>

      {/* El `Suspense` no es decorativo: `Pestanas` usa `useSearchParams`, y sin ese límite el build
          de la ruta falla. Mismo motivo que en el detalle de un Proyecto. */}
      <Suspense fallback={<Cargando alto="min-h-36" mensaje="Cargando la administración…" />}>
        <Pestanas paneles={paneles} etiqueta="Secciones de administración" />
      </Suspense>
    </section>
  )
}

/**
 * Dónde se nota el interruptor de la IA.
 *
 * Va junto al interruptor y no en la documentación porque quien lo apaga tiene que saber qué deja de
 * aparecer: la API responde **404** a toda la rama `/ia/*` cuando está en cero, y las pantallas
 * dejan de ofrecer la función en vez de mostrar un botón que falla.
 */
function DondeSeUsaLaIa () {
  return (
    <div className="border-linea bg-superficie-hundida rounded-tarjeta flex flex-col gap-2 border p-4 text-sm">
      <p className="text-texto font-medium">Qué se apaga con el interruptor</p>
      <ul className="text-texto-tenue list-disc pl-5">
        <li>El resumen del día en Inicio.</li>
        <li>El análisis y el chat de un Proyecto (la pestaña «IA» deja de existir).</li>
        <li>«Completar campos» al crear una Tarea desde texto libre.</li>
      </ul>
      <p className="text-texto-sutil text-xs">
        Las claves y los modelos de los proveedores no son un ajuste: viven en el <code>.env</code> del
        servidor. Si faltan, la función responde 503 aunque el interruptor esté encendido.
      </p>
    </div>
  )
}
