import { CeldaEncabezado, CeldaTabla, CuerpoTabla, EncabezadoTabla, FilaTabla, Tabla } from '@/componentes/datos/Tabla'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Vacio } from '@/componentes/estado/Estados'
import type { Contacto } from '@/datos/recursos'
import { ordenarContactos } from './cliente'

/**
 * Pestaña Contactos: las personas del cliente a las que se les escribe.
 *
 * El contacto primario va primero y marcado: quien abre esta pestaña casi siempre busca a quien hay
 * que llamar, no la lista completa. El correo y el telefono son enlaces reales (`mailto:`, `tel:`)
 * porque copiar un mail a mano desde una tabla es exactamente el trabajo que la pantalla evita.
 *
 * La API devuelve solo los contactos activos: el panel clasico hace lo mismo.
 *
 * @param contactos Los contactos tal como los trajo `include=contacts`.
 * @returns La tabla de contactos, o el estado vacio.
 */
export function ListaContactos ({ contactos }: { contactos: Contacto[] | undefined }) {
  const filas = ordenarContactos(contactos)

  if (filas.length === 0) {
    return (
      <Vacio
        titulo="Este cliente no tiene contactos activos"
        descripcion="Los contactos se crean desde el panel clásico: la API v1 expone clientes y contactos de solo lectura."
      />
    )
  }

  // El ancho se acota: cuatro columnas cortas estiradas a 1400px dejan el correo y el telefono en
  // extremos opuestos de la pantalla, y la fila deja de leerse como una fila.
  return (
    <div className="max-w-4xl">
      <Tabla>
        <EncabezadoTabla>
          <tr>
            <CeldaEncabezado>Nombre</CeldaEncabezado>
            <CeldaEncabezado>Cargo</CeldaEncabezado>
            <CeldaEncabezado>Correo</CeldaEncabezado>
            <CeldaEncabezado>Teléfono</CeldaEncabezado>
          </tr>
        </EncabezadoTabla>

        <CuerpoTabla>
          {filas.map((contacto) => (
            <FilaTabla key={contacto.id}>
              <CeldaTabla>
                <span className="flex items-center gap-2">
                  <Avatar nombre={contacto.full_name} tamano="chico" />
                  <span className="text-texto font-medium">{contacto.full_name}</span>
                  {contacto.is_primary && <Insignia tono="acento" tamano="chico">Principal</Insignia>}
                </span>
              </CeldaTabla>

              <CeldaTabla className="text-texto-tenue">{contacto.title ?? '—'}</CeldaTabla>

              <CeldaTabla>
                <a href={`mailto:${contacto.email}`} className="text-acento underline-offset-4 hover:underline">
                  {contacto.email}
                </a>
              </CeldaTabla>

              <CeldaTabla>
                {contacto.phonenumber === null
                  ? <span className="text-texto-sutil">—</span>
                  : (
                    <a href={`tel:${contacto.phonenumber}`} className="text-texto hover:text-acento">
                      {contacto.phonenumber}
                    </a>
                    )}
              </CeldaTabla>
            </FilaTabla>
          ))}
        </CuerpoTabla>
      </Tabla>
    </div>
  )
}
