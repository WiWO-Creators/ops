'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Boton } from '@/componentes/formularios/Boton'
import { CLASES_CASILLA } from '@/componentes/formularios/Entrada'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import {
  CerrarDialogo,
  ContenidoDialogo,
  Dialogo,
  DisparadorDialogo
} from '@/componentes/superposiciones/Dialogo'
import type { FichaPersona } from '@/datos/recursos'
import type { ModeloDePermisos } from '@/datos/tipos'
import { NIVELES, cuerpoDeNivel, nivelDe, type Nivel } from './nivel'

interface PropsDialogoNivel {
  persona: FichaPersona
  /** `id` de quien edita: decide si el nivel propio se puede bajar. */
  actorId: number
}

/**
 * El nivel de una persona: colaborador, administrador o superadministrador.
 *
 * Antes eran dos casillas sueltas —`is_admin` y `is_superadmin`— que admitían una combinación que no
 * significa nada: superadministrador sin ser administrador. En el panel viejo esa combinación deja a
 * la persona **sin permisos**, porque `staff_can()` de Perfex no conoce la columna `superadmin`. Un
 * control de tres opciones no puede expresar el estado inválido.
 *
 * El nivel no es un permiso: los permisos dicen qué puede hacer alguien dentro de un área, y el nivel
 * dice quién manda. Administrador saltea la matriz entera —`is_admin()` contesta que sí a todo— y
 * superadministrador abre además la configuración de la instalación, que es lo único que ni siquiera
 * un administrador toca.
 *
 * **Solo lo monta la ficha cuando quien mira es superadministrador**, porque la API rechaza al resto
 * con 422 `solo_superadmin`: dibujar un control que la API va a rechazar es ofrecer algo que no
 * existe.
 *
 * Los dos casos que la API frena con 409 y que acá se adelantan, para que la persona lea el motivo
 * antes de intentarlo y no después:
 *
 * - **Bajarse el nivel uno mismo**: en la ficha propia el nivel se lee pero no se ofrece. Nadie se
 *   degrada por accidente en la ficha que más se abre, la suya.
 * - **Quitárselo al último que queda**: eso no se puede saber desde el cliente sin contar los
 *   superadministradores de toda la instalación, así que lo sigue frenando la API y el mensaje se
 *   muestra tal cual llega.
 */
export function DialogoNivel ({ persona, actorId }: PropsDialogoNivel) {
  const [abierto, setAbierto] = useState(false)

  return (
    <Dialogo open={abierto} onOpenChange={setAbierto}>
      <DisparadorDialogo asChild>
        <Boton variante="sutil" tamano="chico">Nivel</Boton>
      </DisparadorDialogo>

      <ContenidoDialogo
        titulo={`Nivel de ${persona.full_name}`}
        descripcion="Administrador saltea los permisos por área. Superadministrador abre además la configuración de la instalación."
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
  const nivelPuesto = nivelDe(persona)
  const [nivel, setNivel] = useState<Nivel>(nivelPuesto)
  const [modelo, setModelo] = useState<ModeloDePermisos>(persona.modelo_permisos)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const esUnoMismo = persona.id === actorId
  const sinCambios = nivel === nivelPuesto && modelo === persona.modelo_permisos

  /**
   * Manda solo lo que cambió.
   *
   * Un PATCH que repite el valor que ya estaba igual dispara los guards de la API —bajarse el nivel a
   * uno mismo, por ejemplo— aunque no cambie nada. Mandar solo lo que cambió evita ese 409 inútil.
   */
  async function guardar (): Promise<void> {
    setGuardando(true)
    setError(null)

    // Contra las banderas REALES de la persona, no contra las que su nivel implicaria: una cuenta
    // en el estado invalido —superadministrador sin ser administrador— necesita que se escriban las
    // dos, y `nivelDe()` ya la lee como superadministrador.
    const cuerpo: Record<string, unknown> = { ...cuerpoDeNivel(nivel, persona) }

    if (modelo !== persona.modelo_permisos) cuerpo.modelo_permisos = modelo

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
      <div className="flex flex-col gap-2">
        {/* En la ficha propia el nivel se lee pero no se toca: nadie se degrada por accidente en la
            ficha que mas se abre, la suya. Se muestra como texto en vez de un control apagado —un
            control que no responde invita a intentarlo y no explica por que no anda. */}
        {esUnoMismo
          ? <p className="text-sm font-medium">{NIVELES.find((opcion) => opcion.valor === nivel)?.etiqueta}</p>
          : (
              <Segmentado
                etiqueta="Nivel"
                activo={nivel}
                opciones={NIVELES.map((opcion) => ({ valor: opcion.valor, etiqueta: opcion.etiqueta }))}
                onElegir={(valor) => { setNivel(valor as Nivel) }}
              />
            )}
        <p className="text-texto-tenue text-sm">
          {esUnoMismo
            ? 'No puedes cambiarte el nivel a ti mismo: pídeselo a otro superadministrador.'
            : NIVELES.find((opcion) => opcion.valor === nivel)?.ayuda}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            id="modelo-permisos"
            className={CLASES_CASILLA}
            checked={modelo === 'nuevo'}
            disabled={guardando}
            aria-describedby="modelo-permisos-ayuda"
            onChange={(evento) => { setModelo(evento.target.checked ? 'nuevo' : 'viejo') }}
          />
          Permisos consolidados
        </label>
        <p id="modelo-permisos-ayuda" className="text-texto-tenue pl-6 text-sm">
          Le muestra las cuatro áreas que el producto usa de verdad en lugar de las doce de Perfex. No
          cambia lo que puede hacer, solo lo que se ve y se puede editar. Se puede apagar.
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
