'use client'

import { useState } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import {
  AVISOS_DE_CONTACTO, avisosTodos, cuerpoDeContacto, PERMISOS_PORTAL, revisarContacto
} from '@/dominio/contactos'
import { cn } from '@/lib/clases'
import type { AvisosDeContacto, ContactoCompleto, PermisoPortal } from '@/datos/recursos'

interface PropsDialogoContacto {
  clienteId: number
  /** El contacto que se edita. Ausente es un alta. */
  contacto?: ContactoCompleto
  onCerrar: () => void
  onGuardado: () => void
}

/** Clases de una casilla nativa. Nativa y no una primitiva: es una casilla, no un control nuevo. */
const CASILLA = 'size-4 shrink-0 accent-[var(--color-acento)] cursor-pointer'

/**
 * Alta y edicion de un contacto de cliente.
 *
 * El formulario es el del panel clasico, con dos diferencias que se dicen en pantalla:
 *
 *   - **No manda el correo de bienvenida.** La API no envia correo en ninguna escritura, asi que la
 *     contraseña que se ponga acá hay que entregarla por otro medio. Decirlo en el formulario es lo
 *     unico que evita que alguien cree un contacto y se quede esperando que le llegue el aviso.
 *   - Los avisos por correo los manda **el panel**, no esta pantalla. Se editan igual porque son la
 *     misma fila de la base, pero quien los marca tiene que saber quien los dispara.
 *
 * Solo se lee el contacto al montar: quien abre el dialogo le pone una `key` distinta por contacto,
 * asi que editar otro monta un formulario nuevo en vez de sincronizar estado desde un efecto.
 */
export function DialogoContacto ({ clienteId, contacto, onCerrar, onGuardado }: PropsDialogoContacto) {
  const editando = contacto !== undefined

  const [campos, setCampos] = useState({
    firstname: contacto?.firstname ?? '',
    lastname: contacto?.lastname ?? '',
    email: contacto?.email ?? '',
    phonenumber: contacto?.phonenumber ?? '',
    title: contacto?.title ?? '',
    password: ''
  })
  const [permisos, setPermisos] = useState<PermisoPortal[]>(contacto?.permissions ?? [])
  const [avisos, setAvisos] = useState<AvisosDeContacto>(
    contacto?.email_notifications ?? avisosTodos(true)
  )
  const [guardando, setGuardando] = useState(false)
  const [errorApi, setErrorApi] = useState<string | null>(null)
  /**
   * Campos que la persona ya toco.
   *
   * Un formulario en blanco no esta "mal completado": esta vacio. Mostrar "Poné el nombre" antes de
   * que nadie escriba nada convierte el alta en una pantalla que reta de entrada, y ademas entrena a
   * ignorar los errores en rojo. El error aparece cuando el campo se deja, no cuando se abre.
   */
  const [tocados, setTocados] = useState<Record<string, boolean>>({})

  const errores = revisarContacto(campos)
  const hayErrores = Object.keys(errores).length > 0

  /** El error de un campo, solo si ya lo tocaron. */
  const errorDe = (clave: string): string | undefined => (tocados[clave] === true ? errores[clave] : undefined)

  /** Marca un campo como tocado al salir de el. */
  const alSalir = (clave: string) => () => setTocados({ ...tocados, [clave]: true })

  /** Marca o desmarca una seccion del portal. */
  function alternarPermiso (clave: PermisoPortal): void {
    setPermisos(permisos.includes(clave)
      ? permisos.filter((p) => p !== clave)
      : [...permisos, clave])
  }

  async function guardar (): Promise<void> {
    if (hayErrores) return

    setGuardando(true)
    setErrorApi(null)

    const cuerpo = cuerpoDeContacto(campos, permisos, avisos)

    const resultado = editando
      ? await escribirEnBff<ContactoCompleto>(`contacts/${contacto.id}`, 'PATCH', cuerpo)
      : await escribirEnBff<ContactoCompleto>(`clients/${clienteId}/contacts`, 'POST', cuerpo)

    setGuardando(false)

    if (!resultado.ok) {
      setErrorApi(resultado.mensaje)
      return
    }

    onGuardado()
  }

  return (
    <Dialogo open onOpenChange={(abierto) => { if (!abierto) onCerrar() }}>
      <ContenidoDialogo
        titulo={editando ? 'Editar contacto' : 'Contacto nuevo'}
        descripcion={editando ? contacto.email : 'Una persona del cliente a la que se le escribe.'}
        ancho="grande"
      >
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Nombre" requerido error={errorDe('firstname')}>
              {(props) => (
                <Entrada
                  {...props}
                  value={campos.firstname}
                  autoFocus
                  onBlur={alSalir('firstname')}
                  onChange={(e) => setCampos({ ...campos, firstname: e.target.value })}
                />
              )}
            </Campo>

            <Campo etiqueta="Apellido" requerido error={errorDe('lastname')}>
              {(props) => (
                <Entrada
                  {...props}
                  value={campos.lastname}
                  onBlur={alSalir('lastname')}
                  onChange={(e) => setCampos({ ...campos, lastname: e.target.value })}
                />
              )}
            </Campo>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Correo" requerido error={errorDe('email')}>
              {(props) => (
                <Entrada
                  {...props}
                  type="email"
                  value={campos.email}
                  onBlur={alSalir('email')}
                  onChange={(e) => setCampos({ ...campos, email: e.target.value })}
                />
              )}
            </Campo>

            <Campo etiqueta="Teléfono">
              {(props) => (
                <Entrada
                  {...props}
                  type="tel"
                  value={campos.phonenumber}
                  onChange={(e) => setCampos({ ...campos, phonenumber: e.target.value })}
                />
              )}
            </Campo>
          </div>

          <Campo etiqueta="Cargo">
            {(props) => (
              <Entrada
                {...props}
                value={campos.title}
                placeholder="Administración, Gerencia…"
                onChange={(e) => setCampos({ ...campos, title: e.target.value })}
              />
            )}
          </Campo>

          <fieldset className="border-linea flex flex-col gap-3 border-t pt-4">
            <legend className="sr-only">Acceso al portal</legend>
            <p className="text-texto text-sm font-medium">Acceso al portal</p>

            <Campo
              etiqueta={editando ? 'Contraseña nueva' : 'Contraseña'}
              ayuda={
                editando
                  ? 'Dejala vacía para no cambiarla. Si preferís que la elija él, cerrá esto y generale un enlace de acceso desde la lista.'
                  : 'Opcional, y casi siempre de más: con el botón de la llave en la lista de contactos generás un enlace para que elija la suya. Si la ponés acá, entregásela vos: no sale ningún correo.'
              }
              error={errorDe('password')}
            >
              {(props) => (
                <Entrada
                  {...props}
                  type="password"
                  autoComplete="new-password"
                  value={campos.password}
                  onBlur={alSalir('password')}
                  onChange={(e) => setCampos({ ...campos, password: e.target.value })}
                />
              )}
            </Campo>

            <div>
              <p className="text-texto-tenue mb-2 text-xs font-medium">Qué ve en el portal</p>
              <ul className="grid gap-1.5 sm:grid-cols-3">
                {PERMISOS_PORTAL.map((permiso) => (
                  <li key={permiso.clave}>
                    <label className="text-texto flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className={CASILLA}
                        checked={permisos.includes(permiso.clave)}
                        onChange={() => alternarPermiso(permiso.clave)}
                      />
                      {permiso.etiqueta}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </fieldset>

          <fieldset className="border-linea flex flex-col gap-2 border-t pt-4">
            <legend className="sr-only">Avisos por correo</legend>
            <p className="text-texto text-sm font-medium">Avisos por correo</p>
            {/* Quien marca esto tiene que saber quien dispara los correos, o va a probar desde ops y
                concluir que la casilla no funciona. */}
            <p className="text-texto-sutil text-xs">
              Los manda el panel clásico, no esta pantalla.
            </p>

            <ul className="grid gap-1.5 sm:grid-cols-3">
              {AVISOS_DE_CONTACTO.map((aviso) => (
                <li key={aviso.clave}>
                  <label className="text-texto flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className={CASILLA}
                      checked={avisos[aviso.clave]}
                      onChange={() => setAvisos({ ...avisos, [aviso.clave]: !avisos[aviso.clave] })}
                    />
                    {aviso.etiqueta}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          {errorApi !== null && (
            <p role="alert" className={cn('text-texto-peligro text-sm')}>{errorApi}</p>
          )}

          <div className="flex justify-end gap-2">
            <CerrarDialogo asChild>
              <Boton variante="sutil">Cancelar</Boton>
            </CerrarDialogo>
            <Boton
              variante="primario"
              cargando={guardando}
              disabled={hayErrores}
              onClick={() => { void guardar() }}
            >
              {editando ? 'Guardar cambios' : 'Crear contacto'}
            </Boton>
          </div>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}
