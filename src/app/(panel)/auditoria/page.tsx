import { Suspense } from 'react'
import { PanelEnVivo } from '@/componentes/auditoria/PanelEnVivo'
import { PanelSesiones } from '@/componentes/auditoria/PanelSesiones'
import { VistaHistorial } from '@/componentes/auditoria/VistaHistorial'
import { Cargando, ErrorEstado, SinPermiso } from '@/componentes/estado/Estados'
import { construirConsulta, leerConsulta, paramsDeUrl } from '@/datos/consulta'
import { ErrorApi } from '@/datos/errores'
import { pedir } from '@/datos/servidor'
import { intervaloDeLatido } from '@/datos/auditoria'
import type {
  CatalogoAuditoria,
  MetaPresencia,
  PersonaConectada,
  RegistroAuditoria,
  SesionAbierta,
  SuplantacionViva
} from '@/datos/auditoria'
import type { Sobre, Yo } from '@/datos/tipos'
import { AUDITORIA } from '@/definiciones/auditoria'

export const metadata = { title: 'Auditoría · WiWO Ops' }

/**
 * Pide un recurso de la auditoría y devuelve el error de la API **como valor** en vez de lanzarlo.
 *
 * Los cinco bloques son independientes: que la tabla de sesiones falle no puede dejar sin "Ahora
 * mismo" a quien está investigando algo. Separada de la página para no armar JSX dentro del `try`,
 * por el mismo motivo que `administracion/page.tsx`.
 */
async function traer<T> (ruta: string): Promise<Sobre<T> | ErrorApi> {
  try {
    return await pedir<T>(ruta)
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}

/** El mensaje del error, o `null` si vino bien. */
function mensaje (resultado: unknown): string | null {
  return resultado instanceof ErrorApi ? resultado.message : null
}

/**
 * Centro de auditoría.
 *
 * Contesta tres preguntas, en el orden en que se hacen cuando algo pasó:
 *
 *   1. **¿Qué está pasando ahora?** Quién está conectado, en qué pantalla, y —destacado— si alguien
 *      está entrando con la cuenta de otra persona.
 *   2. **¿Quién tiene la puerta abierta?** Las sesiones vigentes y desde dónde se pidieron.
 *   3. **¿Qué pasó antes?** El historial completo de `tblactivity_log`, con filtros y paginación.
 *
 * === LA COMPUERTA ===
 *
 * `is_superadmin`, la misma que Administración y la misma que exige la API en las cuatro rutas que
 * usa esta pantalla. Se revisa **antes de pedir nada más**: las rutas ya devuelven 403 del otro lado
 * —ahí está la compuerta real— pero pedirlas igual gastaría cinco viajes que sabemos que vuelven
 * vacíos. Y está acá, y no sólo en la barra lateral, para que entrar por URL directa tampoco pinte
 * nada.
 *
 * `is_admin` NO sirve para esto y por eso no se usa: en esta base la tiene una docena de personas.
 * Ver `permissions` en `datos/tipos.ts`.
 *
 * === POR QUÉ TODO EN UNA PANTALLA Y NO EN PESTAÑAS ===
 *
 * Porque las tres preguntas se hacen juntas. Quien abre esto porque vio algo raro necesita ver el
 * aviso de suplantación y el historial a la vez; con pestañas, el aviso más importante de la pantalla
 * vive escondido detrás de un clic.
 */
export default async function AuditoriaPage (props: PageProps<'/auditoria'>) {
  const { data: yo } = await pedir<Yo>('/me')

  if (!yo.is_superadmin) return <SinPermiso className="mt-10" />

  const params = paramsDeUrl(await props.searchParams)
  const estado = leerConsulta(params, AUDITORIA)
  const consulta = construirConsulta(estado, AUDITORIA)
  const segundos = intervaloDeLatido()

  const [presencia, suplantaciones, sesiones, historial, catalogo] = await Promise.all([
    traer<PersonaConectada[]>('/presence'),
    traer<SuplantacionViva[]>('/sessions/impersonations'),
    // 200 y no la pagina por defecto: el bloque AGRUPA los tokens vivos por persona, y agrupar
    // media pagina daria conteos partidos. Los tokens de acceso vigentes estan acotados por el
    // tamaño del equipo, asi que una pagina generosa los trae todos.
    traer<SesionAbierta[]>('/sessions?per_page=200'),
    traer<RegistroAuditoria[]>(`/audit${consulta === '' ? '' : `?${consulta}`}`),
    traer<CatalogoAuditoria>('/audit/filters')
  ])

  // El historial es el bloque del que cuelga la pantalla: si ése falla, no hay auditoría que mostrar
  // y un error grande dice más que tres bloques a medias.
  if (historial instanceof ErrorApi) {
    if (historial.codigo === 'forbidden') return <SinPermiso className="mt-10" />

    return <ErrorEstado detalle={historial.message} className="mt-10" />
  }

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-texto text-xl font-semibold">Auditoría</h1>
        <p className="text-texto-tenue max-w-prose text-sm">
          Actividad de trabajo del equipo dentro de Ops: en qué pantalla está cada quien, qué sesiones
          hay abiertas y qué se hizo. No se registra nada de lo que se escribe ni nada fuera de la
          aplicación.
        </p>
      </div>

      <PanelEnVivo
        segundos={segundos}
        inicial={{
          conectados: presencia instanceof ErrorApi ? [] : presencia.data,
          meta: presencia instanceof ErrorApi ? null : (presencia.meta as MetaPresencia | undefined) ?? null,
          suplantaciones: suplantaciones instanceof ErrorApi ? [] : suplantaciones.data
        }}
      />

      <PanelSesiones
        sesiones={sesiones instanceof ErrorApi ? [] : sesiones.data}
        error={mensaje(sesiones)}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-texto text-titulo font-semibold">Historial de acciones</h2>

        {/* `TablaRecurso` usa `useSearchParams`: sin este límite de Suspense el build de la ruta falla. */}
        <Suspense fallback={<Cargando alto="min-h-36" mensaje="Cargando el historial…" />}>
          <VistaHistorial
            inicial={{ filas: historial.data, paginacion: historial.meta?.pagination }}
            catalogo={catalogo instanceof ErrorApi ? null : catalogo.data}
          />
        </Suspense>
      </section>
    </section>
  )
}
