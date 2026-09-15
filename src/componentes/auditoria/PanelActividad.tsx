import { Suspense } from 'react'
import { PanelEnVivo } from '@/componentes/auditoria/PanelEnVivo'
import { PanelSesiones } from '@/componentes/auditoria/PanelSesiones'
import { VistaHistorial } from '@/componentes/auditoria/VistaHistorial'
import { Cargando, ErrorEstado, SinPermiso } from '@/componentes/estado/Estados'
import { construirConsulta, leerConsulta } from '@/datos/consulta'
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
import type { Sobre } from '@/datos/tipos'
import { AUDITORIA } from '@/definiciones/auditoria'

/**
 * Pide un recurso de la auditoría y devuelve el error de la API **como valor** en vez de lanzarlo.
 *
 * Los cinco bloques son independientes: que la tabla de sesiones falle no puede dejar sin "Ahora
 * mismo" a quien está investigando algo. Separada del panel para no armar JSX dentro del `try`,
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
 * La pestaña de actividad: lo que era la pantalla de auditoría entera.
 *
 * Contesta tres preguntas, en el orden en que se hacen cuando algo pasó:
 *
 *   1. **¿Qué está pasando ahora?** Quién está conectado, en qué pantalla, y —destacado— si alguien
 *      está entrando con la cuenta de otra persona.
 *   2. **¿Quién tiene la puerta abierta?** Las sesiones vigentes y desde dónde se pidieron.
 *   3. **¿Qué pasó antes?** El historial completo de `tblactivity_log`, con filtros y paginación.
 *
 * Los tres bloques viven juntos y no en tres pestañas porque las tres preguntas se hacen juntas:
 * quien abre esto porque vio algo raro necesita ver el aviso de suplantación y el historial a la
 * vez. Lo que sí es otra pestaña es la calidad de las tareas, que no es la misma pregunta ni la mira
 * la misma gente.
 *
 * La compuerta es `is_superadmin`, la misma que exige la API en las cuatro rutas que usa. La resuelve
 * la página antes de montar este panel: pedir cinco rutas que sabemos que vuelven `403` serían cinco
 * viajes tirados. `is_admin` NO sirve para esto y por eso no se usa: en esta base la tiene una docena
 * de personas.
 *
 * @param params Los parámetros de la URL, ya normalizados por la página.
 */
export async function PanelActividad ({ params }: { params: URLSearchParams }) {
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

  // El historial es el bloque del que cuelga la pestaña: si ése falla, no hay auditoría que mostrar
  // y un error grande dice más que tres bloques a medias.
  if (historial instanceof ErrorApi) {
    if (historial.codigo === 'forbidden') return <SinPermiso className="mt-10" />

    return <ErrorEstado detalle={historial.message} className="mt-10" />
  }

  return (
    <div className="flex flex-col gap-8">
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
    </div>
  )
}
