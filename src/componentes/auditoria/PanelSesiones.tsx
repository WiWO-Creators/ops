import { Avatar } from '@/componentes/presentadores/Avatar'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Vacio } from '@/componentes/estado/Estados'
import { CeldaEncabezado, CeldaTabla, CuerpoTabla, EncabezadoTabla, FilaTabla, Tabla } from '@/componentes/datos/Tabla'
import type { SesionAbierta } from '@/datos/auditoria'
import { agruparSesiones } from './presentacion'
import { formatearFecha } from '@/lib/fechas'

/**
 * Quién tiene una sesión abierta ahora, y desde dónde se pidió.
 *
 * === POR QUÉ SE AGRUPA POR PERSONA ===
 *
 * La API devuelve una fila por **token de acceso**, y eso es correcto de su lado: es lo que hay en la
 * tabla. Pero la API rota el par de tokens cada hora sin cerrar el anterior, así que una sola persona
 * trabajando deja dos o tres filas vivas que son la misma sesión. Pintadas una por una, el bloque se
 * vuelve una lista de veinte veces el mismo nombre y deja de contestar la pregunta que se le hace.
 *
 * Acá se agrupan por persona: desde cuándo (el más viejo de sus tokens vivos), cuándo dio señales por
 * última vez (el más nuevo), y cuántos tokens sostienen esa sesión, que es el dato que se pierde al
 * agrupar y por eso se muestra.
 *
 * === LO QUE FALTA, DICHO EN LA PANTALLA ===
 *
 * Se pidió "logins, IP y dispositivo". Están los dos primeros; el tercero **no existe**:
 *
 *   - `ip` y el cliente son los de **quien llamó a la API**, y ops-v2 la llama desde su propio
 *     servidor para que el token no llegue nunca al navegador. Hoy dicen "el servidor de Ops", no
 *     "el computador de Fulana". Por eso la columna se llama "Origen de la llamada": rotularla
 *     "Dispositivo" sería inventar un dato.
 *   - El navegador con el que entró cada persona no se registra en ninguna parte. Para tenerlo, el
 *     BFF tendría que reenviar su `User-Agent` y su `X-Forwarded-For`, y eso es una decisión de
 *     privacidad propia, no un detalle de implementación.
 *
 * No se refresca solo: una sesión dura una hora, y un bloque que parpadea cada cuarenta segundos sin
 * cambiar nada sólo distrae de lo que sí cambia.
 */

export function PanelSesiones ({ sesiones, error }: { sesiones: SesionAbierta[], error: string | null }) {
  const filas = agruparSesiones(sesiones)

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-texto text-titulo font-semibold">Sesiones abiertas</h2>
        <p className="text-texto-sutil text-xs">
          Quién tiene ahora mismo una sesión vigente en Ops. La sesión se renueva sola cada hora: la
          columna de tokens dice cuántas renovaciones sostienen la misma sesión.
        </p>
      </div>

      {error !== null && <p className="text-texto-peligro text-sm">{error}</p>}

      {error === null && filas.length === 0 && (
        <Vacio
          titulo="Ninguna sesión abierta"
          descripcion="Nadie tiene un acceso vigente en este momento."
          className="border-linea bg-superficie-hundida rounded-tarjeta border"
        />
      )}

      {filas.length > 0 && (
        <Tabla>
          <EncabezadoTabla>
            <FilaTabla>
              <CeldaEncabezado>Persona</CeldaEncabezado>
              <CeldaEncabezado>Entró</CeldaEncabezado>
              <CeldaEncabezado>Última actividad</CeldaEncabezado>
              <CeldaEncabezado numerica>Tokens</CeldaEncabezado>
              <CeldaEncabezado>Origen de la llamada</CeldaEncabezado>
            </FilaTabla>
          </EncabezadoTabla>
          <CuerpoTabla>
            {filas.map((fila) => (
              <FilaTabla key={fila.clave}>
                <CeldaTabla>
                  <span className="flex flex-wrap items-center gap-2">
                    <Avatar
                      nombre={fila.persona?.full_name ?? 'Cuenta eliminada'}
                      imagen={fila.persona?.profile_image_url}
                      tamano="chico"
                    />
                    <span className="text-texto font-medium">
                      {fila.persona?.full_name ?? 'Cuenta eliminada'}
                    </span>
                    {fila.suplantada !== null && (
                      <Insignia tono="peligro" tamano="chico">
                        Abierta por {fila.suplantada.full_name}
                      </Insignia>
                    )}
                  </span>
                </CeldaTabla>
                <CeldaTabla sinCortar>{formatearFecha(fila.desde, true)}</CeldaTabla>
                <CeldaTabla sinCortar>{formatearFecha(fila.ultima, true)}</CeldaTabla>
                <CeldaTabla numerica>{fila.tokens}</CeldaTabla>
                {/* Sólo los tres primeros: una sesión de todo el día pasa por muchas renovaciones y
                    la lista entera desborda la fila. El `title` conserva todos, que es el mismo
                    criterio que ya usan `GrupoAvatares` y `Etiquetas`. */}
                <CeldaTabla className="text-texto-tenue" title={fila.origenes.join(', ')}>
                  {fila.origenes.slice(0, 3).join(' / ')}
                  {fila.origenes.length > 3 ? ` +${fila.origenes.length - 3}` : ''}
                </CeldaTabla>
              </FilaTabla>
            ))}
          </CuerpoTabla>
        </Tabla>
      )}

      <p className="text-texto-sutil max-w-prose text-xs">
        El origen es el de quien llamó a la API. Como el panel llama desde el servidor de Ops, para
        las sesiones del panel dice el servidor y no el equipo de la persona: el navegador con el que
        entró no queda registrado en ninguna parte.
      </p>
    </section>
  )
}
