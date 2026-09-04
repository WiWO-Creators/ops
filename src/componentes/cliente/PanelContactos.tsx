'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Check, Copy, KeyRound, Mail, Phone, Plus, Star, Trash2, UserPen } from 'lucide-react'
import { CeldaEncabezado, CeldaTabla, CuerpoTabla, EncabezadoTabla, FilaTabla, Tabla } from '@/componentes/datos/Tabla'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Boton } from '@/componentes/formularios/Boton'
import { Entrada } from '@/componentes/formularios/Entrada'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Vacio } from '@/componentes/estado/Estados'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { DialogoContacto } from './DialogoContacto'
import { ordenarContactosCompletos, PERMISOS_PORTAL } from '@/dominio/contactos'
import { formatearFecha } from '@/lib/fechas'
import { cn } from '@/lib/clases'
import type { Capacidad } from '@/datos/tipos'
import type { ContactoCompleto } from '@/datos/recursos'

interface PropsPanelContactos {
  clienteId: number
  contactos: ContactoCompleto[]
  /** `permissions.customers` de `GET /me`. Decide que controles se muestran. */
  capacidades: Capacidad[]
}

/**
 * Pestaña Contactos: las personas del cliente a las que se les escribe.
 *
 * El principal va primero y marcado, y despues los activos: quien abre esta pestaña casi siempre
 * busca a quien hay que llamar, no la lista completa. El correo y el telefono son enlaces reales
 * (`mailto:`, `tel:`) porque copiar un mail a mano desde una tabla es exactamente el trabajo que la
 * pantalla evita.
 *
 * **Los dados de baja se muestran**, atenuados y con su insignia. Esconderlos —que es lo que hacia
 * la version anterior— dejaba a un cliente con contactos inactivos exactamente igual que a uno sin
 * ninguno: sin forma de reactivarlos, y sin forma de saber que existieron.
 *
 * Los controles se podan con `permissions.customers`, pero eso solo esconde botones: quien no tiene
 * el permiso recibe 403 de la API igual.
 */
export function PanelContactos ({ clienteId, contactos, capacidades }: PropsPanelContactos) {
  const router = useRouter()
  const [editando, setEditando] = useState<ContactoCompleto | null>(null)
  const [creando, setCreando] = useState(false)
  const [ocupado, setOcupado] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enlace, setEnlace] = useState<{ contacto: string, url: string } | null>(null)

  const filas = ordenarContactosCompletos(contactos)
  const puedeEditar = capacidades.includes('edit')
  const puedeBorrar = capacidades.includes('delete')

  /**
   * Corre una escritura sobre un contacto y refresca.
   *
   * @param contactoId cual, para poder deshabilitar solo su fila
   * @param operacion la escritura
   */
  async function correr (
    contactoId: number,
    operacion: () => Promise<{ ok: boolean, mensaje?: string }>
  ): Promise<void> {
    setOcupado(contactoId)
    setError(null)

    const resultado = await operacion()

    setOcupado(null)

    if (!resultado.ok) {
      setError(resultado.mensaje ?? 'No se pudo guardar.')
      return
    }

    router.refresh()
  }

  /**
   * Genera el enlace de acceso al portal de un contacto y lo deja a la vista para copiarlo.
   *
   * No refresca la pantalla al terminar, a diferencia del resto de las escrituras: el enlace en
   * claro solo existe en esta respuesta, y un `router.refresh()` lo borraria antes de que nadie lo
   * copie. Tampoco se guarda en ningun lado — si se pierde, se genera otro.
   */
  async function generarEnlace (contacto: ContactoCompleto): Promise<void> {
    setOcupado(contacto.id)
    setError(null)
    setEnlace(null)

    const resultado = await escribirEnBff<{ token: string, expires_at: string }>(
      `contacts/${contacto.id}/access-link`,
      'POST'
    )

    setOcupado(null)

    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }

    setEnlace({
      contacto: contacto.full_name,
      url: `${globalThis.location.origin}/clave/${resultado.datos.token}`
    })
  }

  if (filas.length === 0) {
    return (
      <>
        <Vacio
          titulo="Este cliente todavía no tiene contactos"
          descripcion={
            puedeEditar
              ? 'Un contacto es la persona del cliente a la que se le escribe, y la que puede entrar al portal.'
              : 'Un contacto es la persona del cliente a la que se le escribe. No tienes permiso para crearlos.'
          }
          accion={
            puedeEditar
              ? (
                <Boton variante="primario" onClick={() => setCreando(true)}>
                  <Plus size={16} aria-hidden="true" />
                  Agregar contacto
                </Boton>
                )
              : undefined
          }
        />

        {creando && (
          <DialogoContacto
            clienteId={clienteId}
            onCerrar={() => setCreando(false)}
            onGuardado={() => {
              setCreando(false)
              router.refresh()
            }}
          />
        )}
      </>
    )
  }

  return (
    <div className="flex max-w-5xl flex-col gap-3">
      {puedeEditar && (
        <div className="flex justify-end">
          <Boton variante="secundario" tamano="chico" onClick={() => setCreando(true)}>
            <Plus size={14} aria-hidden="true" />
            Agregar contacto
          </Boton>
        </div>
      )}

      {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}

      {enlace !== null && <EnlaceGenerado enlace={enlace} onCerrar={() => setEnlace(null)} />}

      <Tabla>
        <EncabezadoTabla>
          <tr>
            <CeldaEncabezado>Nombre</CeldaEncabezado>
            <CeldaEncabezado>Cargo</CeldaEncabezado>
            <CeldaEncabezado>Contacto</CeldaEncabezado>
            <CeldaEncabezado>Portal</CeldaEncabezado>
            {(puedeEditar || puedeBorrar) && <CeldaEncabezado>Acciones</CeldaEncabezado>}
          </tr>
        </EncabezadoTabla>

        <CuerpoTabla>
          {filas.map((contacto) => (
            <FilaTabla key={contacto.id} className={cn(!contacto.active && 'opacity-60')}>
              <CeldaTabla>
                <span className="flex flex-wrap items-center gap-2">
                  <Avatar nombre={contacto.full_name} tamano="chico" />
                  <span className="text-texto font-medium">{contacto.full_name}</span>
                  {contacto.is_primary && <Insignia tono="acento" tamano="chico">Principal</Insignia>}
                  {/* El estado viaja en el texto y no solo en la opacidad: una fila mas clara no
                      dice "de baja" a quien no puede compararla con la de al lado. */}
                  {!contacto.active && <Insignia tono="contorno" tamano="chico">De baja</Insignia>}
                </span>
              </CeldaTabla>

              <CeldaTabla className="text-texto-tenue">{contacto.title ?? '—'}</CeldaTabla>

              <CeldaTabla>
                <span className="flex flex-col gap-0.5">
                  <a
                    href={`mailto:${contacto.email}`}
                    className="text-acento flex items-center gap-1.5 underline-offset-4 hover:underline"
                  >
                    <Mail size={12} aria-hidden="true" />
                    {contacto.email}
                  </a>
                  {contacto.phonenumber !== null && (
                    <a href={`tel:${contacto.phonenumber}`} className="text-texto-tenue hover:text-acento flex items-center gap-1.5">
                      <Phone size={12} aria-hidden="true" />
                      {contacto.phonenumber}
                    </a>
                  )}
                </span>
              </CeldaTabla>

              <CeldaTabla>
                <AccesoAlPortal contacto={contacto} />
              </CeldaTabla>

              {(puedeEditar || puedeBorrar) && (
                <CeldaTabla>
                  <span className="flex items-center gap-1">
                    {puedeEditar && (
                      <>
                        <Boton
                          variante="sutil"
                          tamano="chico"
                          soloIcono
                          title={contacto.is_primary ? 'Ya es el contacto principal' : 'Marcar como principal'}
                          aria-label={`Marcar a ${contacto.full_name} como principal`}
                          disabled={contacto.is_primary || ocupado !== null}
                          onClick={() => {
                            void correr(contacto.id, async () =>
                              await escribirEnBff(`contacts/${contacto.id}`, 'PATCH', { is_primary: true }))
                          }}
                        >
                          <Star
                            size={14}
                            aria-hidden="true"
                            className={cn(contacto.is_primary && 'text-texto-aviso fill-current')}
                          />
                        </Boton>

                        <Boton
                          variante="sutil"
                          tamano="chico"
                          soloIcono
                          title="Generar enlace para que elija su contraseña"
                          aria-label={`Generar enlace de acceso al portal para ${contacto.full_name}`}
                          disabled={ocupado !== null}
                          onClick={() => { void generarEnlace(contacto) }}
                        >
                          <KeyRound size={14} aria-hidden="true" />
                        </Boton>

                        <Boton
                          variante="sutil"
                          tamano="chico"
                          soloIcono
                          title="Editar"
                          aria-label={`Editar a ${contacto.full_name}`}
                          disabled={ocupado !== null}
                          onClick={() => setEditando(contacto)}
                        >
                          <UserPen size={14} aria-hidden="true" />
                        </Boton>

                        <Boton
                          variante="sutil"
                          tamano="chico"
                          cargando={ocupado === contacto.id}
                          onClick={() => {
                            void correr(contacto.id, async () =>
                              await escribirEnBff(`contacts/${contacto.id}`, 'PATCH', { active: !contacto.active }))
                          }}
                        >
                          {contacto.active ? 'Dar de baja' : 'Reactivar'}
                        </Boton>
                      </>
                    )}

                    {puedeBorrar && (
                      <Boton
                        variante="sutil"
                        tamano="chico"
                        soloIcono
                        title="Borrar"
                        aria-label={`Borrar a ${contacto.full_name}`}
                        disabled={ocupado !== null}
                        onClick={() => {
                          void correr(contacto.id, async () =>
                            await escribirEnBff(`contacts/${contacto.id}`, 'DELETE'))
                        }}
                      >
                        <Trash2 size={14} aria-hidden="true" className="text-texto-peligro" />
                      </Boton>
                    )}
                  </span>
                </CeldaTabla>
              )}
            </FilaTabla>
          ))}
        </CuerpoTabla>
      </Tabla>

      {creando && (
        <DialogoContacto
          clienteId={clienteId}
          onCerrar={() => setCreando(false)}
          onGuardado={() => {
            setCreando(false)
            router.refresh()
          }}
        />
      )}

      {editando !== null && (
        <DialogoContacto
          key={editando.id}
          clienteId={clienteId}
          contacto={editando}
          onCerrar={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

/**
 * Que ve el contacto en el portal, y si alguna vez entro.
 *
 * "Nunca entró" es un dato, no un vacio: distingue al contacto que tiene acceso y no lo usa del que
 * no lo tiene, y son dos conversaciones distintas con el cliente.
 */
function AccesoAlPortal ({ contacto }: { contacto: ContactoCompleto }) {
  if (contacto.permissions.length === 0) {
    return <span className="text-texto-sutil text-xs">Sin acceso</span>
  }

  const nombres = PERMISOS_PORTAL
    .filter((permiso) => contacto.permissions.includes(permiso.clave))
    .map((permiso) => permiso.etiqueta)

  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-texto-tenue text-xs">{nombres.join(', ')}</span>
      <span className="text-texto-sutil text-xs">
        {contacto.last_login === null ? 'Nunca entró' : `Último acceso: ${formatearFecha(contacto.last_login)}`}
      </span>
    </span>
  )
}

/**
 * El enlace recien generado, listo para copiar y mandar.
 *
 * Se muestra en un campo de solo lectura y no como texto suelto: un enlace de 70 caracteres se
 * selecciona mal con el mouse, y perderlo a medias significa que el cliente recibe un enlace roto.
 *
 * **Se ve una sola vez.** La API devuelve el token en claro solo en la respuesta que lo crea; acá no
 * se guarda en ningun lado, y cerrar el aviso lo pierde. Si eso pasa, se genera otro y el anterior
 * queda revocado.
 */
function EnlaceGenerado (
  { enlace, onCerrar }: { enlace: { contacto: string, url: string }, onCerrar: () => void }
) {
  const [copiado, setCopiado] = useState(false)

  async function copiar (): Promise<void> {
    try {
      await navigator.clipboard.writeText(enlace.url)
      setCopiado(true)
      globalThis.setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sin permiso de portapapeles (o sin HTTPS) no hay copia automatica: el campo es seleccionable
      // y ese es el plan B, asi que lo unico que falta es decirlo.
      setCopiado(false)
    }
  }

  return (
    <div className="rounded-medio border-linea bg-superficie-hundida flex flex-col gap-2 border p-3">
      <p className="text-texto text-sm font-medium">
        Enlace de acceso para {enlace.contacto}
      </p>

      <div className="flex items-center gap-2">
        <Entrada
          readOnly
          value={enlace.url}
          aria-label="Enlace de acceso al portal"
          onFocus={(e) => e.currentTarget.select()}
          className="font-mono text-xs"
        />
        <Boton variante="secundario" tamano="chico" onClick={() => { void copiar() }}>
          {copiado
            ? <Check size={14} aria-hidden="true" />
            : <Copy size={14} aria-hidden="true" />}
          {copiado ? 'Copiado' : 'Copiar'}
        </Boton>
        <Boton variante="sutil" tamano="chico" onClick={onCerrar}>Listo</Boton>
      </div>

      <p className="text-texto-tenue text-xs">
        Mándaselo por donde ya le escribes: acá no sale ningún correo. Vence en 72 horas, sirve una
        sola vez y con él elige su propia contraseña. Generar uno nuevo anula este.
      </p>
    </div>
  )
}
