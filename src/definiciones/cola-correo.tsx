import { Insignia, type TonoInsignia } from '@/componentes/presentadores/Insignia'
import { Fecha } from '@/componentes/presentadores/Fecha'
import type { EstadoCorreo, FilaColaCorreo } from '../datos/recursos.ts'
import type { DefinicionRecurso } from './tipos.ts'

/**
 * Rótulo y tono de cada estado de `tblmail_queue`.
 *
 * No es `comoInsignia` (eso resuelve contra un catálogo de `/lookups`, y los cuatro estados son fijos
 * del contrato, no configurables desde el panel): se pinta la insignia directo en `presentar`.
 */
const ESTADOS: Record<EstadoCorreo, { etiqueta: string, tono: TonoInsignia }> = {
  pending: { etiqueta: 'Pendiente', tono: 'neutro' },
  sending: { etiqueta: 'Enviando', tono: 'acento' },
  sent: { etiqueta: 'Enviado', tono: 'exito' },
  failed: { etiqueta: 'Falló', tono: 'peligro' }
}

/**
 * Definición del visor de la cola de correo (`GET /notifications/mail-queue`).
 *
 * Solo lectura: la API no expone reintentar ni borrar, así que esta definición no lleva `acciones`.
 * `TablaRecurso` sin ese arreglo se comporta como una tabla simple con filtro, orden y paginación —
 * exactamente lo que hace falta para verificar el interruptor sin escribir nada.
 */
export const COLA_CORREO: DefinicionRecurso<FilaColaCorreo> = {
  ruta: 'notifications/mail-queue',
  titulo: { singular: 'Correo', plural: 'Cola de correo' },

  columnas: [
    { clave: 'to', encabezado: 'Para', presentar: (f) => f.to },
    { clave: 'subject', encabezado: 'Asunto', presentar: (f) => f.subject },
    {
      clave: 'status',
      encabezado: 'Estado',
      presentar: (f) => {
        const { etiqueta, tono } = ESTADOS[f.status]
        return <Insignia tono={tono}>{etiqueta}</Insignia>
      }
    },
    { clave: 'date', encabezado: 'Fecha', ordenPor: 'date', presentar: (f) => <Fecha valor={f.date} conHora /> },
    { clave: 'from', encabezado: 'Remitente', ocultaPorDefecto: true, presentar: (f) => f.from },
    { clave: 'engine', encabezado: 'Motor', ocultaPorDefecto: true, presentar: (f) => f.engine },
    {
      clave: 'attachments',
      encabezado: 'Adjuntos',
      numerica: true,
      ocultaPorDefecto: true,
      presentar: (f) => f.attachments
    }
  ],

  filtros: [
    {
      clave: 'status',
      etiqueta: 'Estado',
      tipo: 'seleccion',
      opciones: [
        { valor: 'pending', etiqueta: 'Pendiente' },
        { valor: 'sending', etiqueta: 'Enviando' },
        { valor: 'sent', etiqueta: 'Enviado' },
        { valor: 'failed', etiqueta: 'Falló' }
      ]
    },
    { clave: 'fecha', etiqueta: 'Fecha', tipo: 'rangoFechas', clavesRango: ['date_from', 'date_to'] }
  ],

  ordenables: ['date', 'status'],
  ordenPorDefecto: '-date',
  busqueda: true,
  includes: []
}
