'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Boton } from '@/componentes/formularios/Boton'
import { CLASES_CASILLA } from '@/componentes/formularios/Entrada'
import {
  CerrarDialogo,
  ContenidoDialogo,
  Dialogo,
  DisparadorDialogo
} from '@/componentes/superposiciones/Dialogo'
import type { FichaPersona } from '@/datos/recursos'

interface PropsDialogoRoles {
  persona: FichaPersona
  /** `id` de quien edita: decide si el interruptor de superadministrador se puede tocar. */
  actorId: number
}

/**
 * Reparte las dos condiciones que no son permisos: administrador y superadministrador.
 *
 * No vive en el editor de permisos porque no es lo mismo. Un permiso dice que puede hacer alguien
 * dentro de un modulo; estas dos banderas dicen quien manda: administrador saltea la matriz entera
 * —`is_admin()` de Perfex contesta que si a todo— y superadministrador abre ademas la configuracion
 * de la instalacion, que es lo unico que ni siquiera un administrador toca.
 *
 * **Solo lo monta la ficha cuando quien mira es superadministrador**, porque la API rechaza con 422
 * `solo_superadmin` a cualquier otro: dibujar un interruptor que la API va a rechazar es ofrecer algo
 * que no existe.
 *
 * Los dos casos que la API frena con 409 y que aca se adelantan, para que la persona lea el motivo
 * antes de intentarlo y no despues:
 *
 * - **Quitarse el rol uno mismo**: el interruptor propio queda deshabilitado. Nadie se degrada por
 *   accidente en la ficha que mas se abre, la suya.
 * - **Quitarselo al ultimo que queda**: eso no se puede saber desde el cliente sin contar los
 *   superadministradores de toda la instalacion, asi que ese lo sigue frenando la API y el mensaje se
 *   muestra tal cual llega.
 */
export function DialogoRoles ({ persona, actorId }: PropsDialogoRoles) {
  const [abierto, setAbierto] = useState(false)

  return (
    <Dialogo open={abierto} onOpenChange={setAbierto}>
      <DisparadorDialogo asChild>
        <Boton variante="sutil" tamano="chico">Roles</Boton>
      </DisparadorDialogo>

      <ContenidoDialogo
        titulo={`Roles de ${persona.full_name}`}
        descripcion="Administrador saltea los permisos por área. Superadministrador abre además la configuración de la instalación."
      >
        {/* El estado vive en el cuerpo y no aca: Radix no renderiza el contenido cerrado, asi que al
            abrir arranca siempre con lo ultimo que devolvio la API. */}
        <CuerpoDelDialogo persona={persona} actorId={actorId} cerrar={() => { setAbierto(false) }} />
      </ContenidoDialogo>
    </Dialogo>
  )
}

interface PropsCuerpo {
  persona: FichaPersona
  actorId: number
  cerrar: () => void
}

function CuerpoDelDialogo ({ persona, actorId, cerrar }: PropsCuerpo) {
  const router = useRouter()
  const [esAdmin, setEsAdmin] = useState(persona.is_admin)
  const [esSuperadmin, setEsSuperadmin] = useState(persona.is_superadmin)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const esUnoMismo = persona.id === actorId
  const sinCambios = esAdmin === persona.is_admin && esSuperadmin === persona.is_superadmin

  /**
   * Manda solo las banderas que cambiaron.
   *
   * Un PATCH que repite el valor que ya estaba igual dispara los guards de la API —quitarse el rol a
   * uno mismo, por ejemplo— aunque no cambie nada. Mandar solo lo que cambio evita ese 409 inutil.
   */
  async function guardar (): Promise<void> {
    setGuardando(true)
    setError(null)

    const cuerpo: { is_admin?: boolean, is_superadmin?: boolean } = {}

    if (esAdmin !== persona.is_admin) cuerpo.is_admin = esAdmin
    if (esSuperadmin !== persona.is_superadmin) cuerpo.is_superadmin = esSuperadmin

    const resultado = await escribirEnBff(`staff/${persona.id}`, 'PATCH', cuerpo)

    setGuardando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    cerrar()
    router.refresh()
  }

  return (
    <form onSubmit={(evento) => { evento.preventDefault(); void guardar() }} className="flex flex-col gap-5">
      <div className="flex flex-col gap-4">
        <Interruptor
          etiqueta="Administrador"
          ayuda="Ve y edita todo el producto. Mientras lo sea, sus permisos por área no se guardan."
          marcado={esAdmin}
          alCambiar={setEsAdmin}
          deshabilitado={guardando}
        />

        <Interruptor
          etiqueta="Superadministrador"
          ayuda={
            esUnoMismo
              ? 'No podés quitarte el rol a vos mismo: pedíselo a otro superadministrador.'
              : 'Suma la configuración de la instalación: avisos por correo y acceso con Google.'
          }
          marcado={esSuperadmin}
          alCambiar={setEsSuperadmin}
          deshabilitado={guardando || esUnoMismo}
        />
      </div>

      {error !== null && <p className="text-peligro text-sm">{error}</p>}

      <div className="flex justify-end gap-2">
        <CerrarDialogo asChild>
          <Boton variante="sutil" type="button">Cancelar</Boton>
        </CerrarDialogo>
        <Boton type="submit" disabled={guardando || sinCambios}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </Boton>
      </div>
    </form>
  )
}

interface PropsInterruptor {
  etiqueta: string
  ayuda: string
  marcado: boolean
  alCambiar: (valor: boolean) => void
  deshabilitado: boolean
}

/** Una casilla con su explicación debajo. La ayuda queda atada por `aria-describedby`. */
function Interruptor ({ etiqueta, ayuda, marcado, alCambiar, deshabilitado }: PropsInterruptor) {
  const id = `rol-${etiqueta.toLowerCase()}`

  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          id={id}
          className={CLASES_CASILLA}
          checked={marcado}
          disabled={deshabilitado}
          aria-describedby={`${id}-ayuda`}
          onChange={(evento) => { alCambiar(evento.target.checked) }}
        />
        {etiqueta}
      </label>
      <p id={`${id}-ayuda`} className="text-texto-tenue pl-6 text-sm">{ayuda}</p>
    </div>
  )
}
