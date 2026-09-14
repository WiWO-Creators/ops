'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Boton } from '@/componentes/formularios/Boton'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import {
  CerrarDialogo,
  ContenidoDialogo,
  Dialogo,
  DisparadorDialogo
} from '@/componentes/superposiciones/Dialogo'
import {
  ROLES_DE_SISTEMA, cuerpoDeRolDeSistema, rolDeSistemaDe, type RolDeSistema
} from '@/dominio/rol-sistema'
import type { FichaPersona } from '@/datos/recursos'

interface PropsDialogoRolSistema {
  persona: FichaPersona
  /** `id` de quien edita: decide si el rol propio se puede bajar. */
  actorId: number
}

/**
 * El rol de sistema de una persona: usuario, administrador o superadministrador.
 *
 * Es el eje 1 del modelo de permisos y no tiene nada que ver con el escalón jerárquico, que se
 * reparte en `/administracion/accesos`: acá se decide **qué filas ve** y si abre la configuración de
 * la instalación; allá, qué puesto ocupa en el árbol.
 *
 * Antes eran dos casillas sueltas —`is_admin` y `is_superadmin`— que admitían una combinación que no
 * significa nada: superadministrador sin ser administrador. En el panel viejo esa combinación deja a
 * la persona **sin permisos**, porque `staff_can()` de Perfex no conoce la columna `superadmin`. Un
 * control de tres opciones no puede expresar el estado inválido.
 *
 * **Solo lo monta la ficha cuando quien mira es superadministrador**, porque la API rechaza al resto
 * con 422 `solo_superadmin`: dibujar un control que la API va a rechazar es ofrecer algo que no
 * existe.
 *
 * Los dos casos que la API frena con 409 y que acá se adelantan, para que la persona lea el motivo
 * antes de intentarlo y no después:
 *
 * - **Bajarse el rol uno mismo**: en la ficha propia el rol se lee pero no se ofrece. Nadie se
 *   degrada por accidente en la ficha que más se abre, la suya.
 * - **Quitárselo al último que queda**: eso no se puede saber desde el cliente sin contar los
 *   superadministradores de toda la instalación, así que lo sigue frenando la API y el mensaje se
 *   muestra tal cual llega.
 */
export function DialogoRolSistema ({ persona, actorId }: PropsDialogoRolSistema) {
  const [abierto, setAbierto] = useState(false)

  return (
    <Dialogo open={abierto} onOpenChange={setAbierto}>
      <DisparadorDialogo asChild>
        <Boton variante="sutil" tamano="chico">Rol de sistema</Boton>
      </DisparadorDialogo>

      <ContenidoDialogo
        titulo={`Rol de sistema de ${persona.full_name}`}
        descripcion="Administrador ve todas las filas del producto. Superadministrador abre además la configuración de la instalación."
      >
        {/* El estado vive en el cuerpo y no acá: Radix no renderiza el contenido cerrado, así que al
            abrir arranca siempre con lo último que devolvió la API. */}
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
  const rolPuesto = rolDeSistemaDe(persona)
  const [rol, setRol] = useState<RolDeSistema>(rolPuesto)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const esUnoMismo = persona.id === actorId
  const sinCambios = rol === rolPuesto

  /**
   * Manda solo lo que cambió.
   *
   * Un PATCH que repite el valor que ya estaba igual dispara los guards de la API —bajarse el rol a
   * uno mismo, por ejemplo— aunque no cambie nada. Mandar solo lo que cambió evita ese 409 inútil.
   */
  async function guardar (): Promise<void> {
    setGuardando(true)
    setError(null)

    // Contra las banderas REALES de la persona, no contra las que su rol implicaria: una cuenta en
    // el estado invalido —superadministrador sin ser administrador— necesita que se escriban las
    // dos, y `rolDeSistemaDe()` ya la lee como superadministrador.
    const resultado = await escribirEnBff(
      `staff/${persona.id}`, 'PATCH', cuerpoDeRolDeSistema(rol, persona)
    )

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
      <div className="flex flex-col gap-2">
        {/* En la ficha propia el rol se lee pero no se toca: nadie se degrada por accidente en la
            ficha que mas se abre, la suya. Se muestra como texto en vez de un control apagado —un
            control que no responde invita a intentarlo y no explica por que no anda. */}
        {esUnoMismo
          ? <p className="text-sm font-medium">{ROLES_DE_SISTEMA.find((opcion) => opcion.valor === rol)?.etiqueta}</p>
          : (
              <Segmentado
                etiqueta="Rol de sistema"
                activo={rol}
                opciones={ROLES_DE_SISTEMA.map((opcion) => ({ valor: opcion.valor, etiqueta: opcion.etiqueta }))}
                onElegir={(valor) => { setRol(valor as RolDeSistema) }}
              />
            )}
        <p className="text-texto-tenue text-sm">
          {esUnoMismo
            ? 'No puedes cambiarte el rol a ti mismo: pídeselo a otro superadministrador.'
            : ROLES_DE_SISTEMA.find((opcion) => opcion.valor === rol)?.ayuda}
        </p>
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
