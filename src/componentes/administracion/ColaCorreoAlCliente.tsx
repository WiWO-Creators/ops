import type { ReactElement } from 'react'
import { CeldaEncabezado, CeldaTabla, CuerpoTabla, EncabezadoTabla, FilaTabla, Tabla } from '@/componentes/datos/Tabla'
import { Vacio } from '@/componentes/estado/Estados'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia, type TonoInsignia } from '@/componentes/presentadores/Insignia'
import { VisorColaCorreo, type ContadorDeCola } from './VisorColaCorreo'
import { avisoDelMotor } from '@/dominio/correo-cliente'
import { nombrar } from '@/dominio/glosario'
import type { EstadoCorreoCliente, FilaColaCorreoCliente } from '@/datos/recursos'
import type { ResumenColaCorreoCliente } from '@/datos/tipos'

/** Rótulo y tono de cada estado de `tblwiwo_correo_cliente_cola`. */
const ESTADOS: Record<EstadoCorreoCliente, { etiqueta: string, tono: TonoInsignia }> = {
  pendiente: { etiqueta: 'Pendiente', tono: 'neutro' },
  enviado: { etiqueta: 'Enviado', tono: 'exito' },
  error: { etiqueta: 'Falló', tono: 'peligro' }
}

/** Nombre legible de cada plantilla. Espeja `CorreoAlCliente::PLANTILLA_*`. */
const PLANTILLAS: Record<string, string> = {
  enlace_acceso_portal: 'Enlace de acceso al portal'
}

interface PropsColaCorreoAlCliente {
  filas: FilaColaCorreoCliente[]
  resumen: ResumenColaCorreoCliente
}

/**
 * El visor de `tblwiwo_correo_cliente_cola` (`GET /notifications/client-mail-queue`).
 *
 * Es una tabla estática, sin filtros ni paginación, a diferencia de la de Perfex: `TablaRecurso`
 * guarda el estado de la vista en la query de la URL sin espacio de nombres, así que dos en la misma
 * pantalla se pisarían el `page` y el `filter[status]` —y los estados de las dos colas ni siquiera se
 * llaman igual—. Muestra la primera página que trajo el servidor; el número real de filas lo dice el
 * resumen, que sí es de la cola entera.
 *
 * La cola no la vacía nadie, así que crece despacio y de un solo productor: el enlace de acceso al
 * portal. Cuando eso deje de ser cierto, esta tabla pide su propia pantalla, no filtros acá.
 */
export function ColaCorreoAlCliente ({ filas, resumen }: PropsColaCorreoAlCliente): ReactElement {
  const { titulo, detalle } = avisoDelMotor(resumen)

  const contadores: ContadorDeCola[] = [
    { clave: 'pendiente', etiqueta: 'pendientes', valor: resumen.pendiente, tono: 'neutro' },
    { clave: 'enviado', etiqueta: 'enviados', valor: resumen.enviado, tono: 'exito' },
    { clave: 'error', etiqueta: 'fallidos', valor: resumen.error, tono: 'peligro' }
  ]

  const aviso = (
    <div
      role="status"
      className="border-linea-fuerte bg-superficie-aviso text-texto-aviso rounded-tarjeta border-l-4 p-3 text-sm"
    >
      <p className="font-semibold">{titulo}</p>
      <p className="mt-1">{detalle}</p>
    </div>
  )

  return (
    <VisorColaCorreo contadores={contadores} total={resumen.total} aviso={aviso}>
      {filas.length === 0
        ? (
          <Vacio
            titulo="Todavía no hay nada anotado"
            descripcion={`Acá aparece cada vez que alguien genera el enlace de acceso al portal de un ${nombrar('cliente')}. Se anota la intención de escribirle; el correo no sale.`}
          />
          )
        : (
          <Tabla>
            <EncabezadoTabla>
              <tr>
                <CeldaEncabezado>Contacto</CeldaEncabezado>
                <CeldaEncabezado>Motivo</CeldaEncabezado>
                <CeldaEncabezado>Estado</CeldaEncabezado>
                <CeldaEncabezado>Anotada</CeldaEncabezado>
              </tr>
            </EncabezadoTabla>
            <CuerpoTabla>
              {filas.map((fila) => (
                <FilaTabla key={fila.id}>
                  <CeldaTabla>
                    {fila.contact === null
                      // El contacto se borró después de encolar: la fila se queda, con el hueco a la
                      // vista. Desaparecer sería perder la única constancia de lo que se anotó.
                      ? <span className="text-texto-sutil">Contacto borrado</span>
                      : (
                        <>
                          <span className="text-texto">{fila.contact.name}</span>
                          <span className="text-texto-tenue block text-xs">{fila.contact.email}</span>
                        </>
                        )}
                  </CeldaTabla>
                  <CeldaTabla>{PLANTILLAS[fila.template] ?? fila.template}</CeldaTabla>
                  <CeldaTabla>
                    <Insignia tono={ESTADOS[fila.status].tono}>{ESTADOS[fila.status].etiqueta}</Insignia>
                    {fila.error !== null && (
                      <span className="text-texto-peligro mt-1 block text-xs">{fila.error}</span>
                    )}
                  </CeldaTabla>
                  <CeldaTabla><Fecha valor={fila.created_at} conHora /></CeldaTabla>
                </FilaTabla>
              ))}
            </CuerpoTabla>
          </Tabla>
          )}
    </VisorColaCorreo>
  )
}
