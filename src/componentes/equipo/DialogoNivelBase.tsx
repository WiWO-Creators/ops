'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import {
  ContenidoSelector,
  DisparadorSelector,
  Opcion,
  Selector
} from '@/componentes/formularios/Selector'
import {
  CerrarDialogo,
  ContenidoDialogo,
  Dialogo,
  DisparadorDialogo
} from '@/componentes/superposiciones/Dialogo'
import { pedirSobre } from '@/datos/cliente'
import type { FichaPersona } from '@/datos/recursos'
import type { NivelPermiso } from '@/datos/tipos'
import {
  HEREDADO,
  NIVELES_BASE,
  etiquetaDeNivel,
  loTapaLaBandera,
  nivelDelValor,
  valorDelNivel
} from './nivelBase'

/** Lo que devuelve `GET|PUT /staff/{id}/nivel`. */
interface NivelDeLaPersona {
  /** El escalón que gobierna hoy, con banderas, override y rol ya resueltos por la API. */
  nivel: NivelPermiso
  /** Solo el override, o `null` si la persona hereda el de su rol. */
  nivel_asignado: NivelPermiso | null
}

interface PropsDialogoNivelBase {
  persona: FichaPersona
  /** `id` de quien edita: decide si el escalón propio se puede tocar. */
  actorId: number
}

/**
 * En qué escalón de la escalera de permisos está una persona.
 *
 * Va **junto al diálogo de Nivel**, no en su lugar, y el reparto entre los dos está explicado en
 * `nivelBase.ts`: acá se escriben los cinco escalones de abajo, que viven en una tabla propia; allá
 * las dos banderas de Perfex, que son las que abren el panel y la configuración.
 *
 * **Solo lo monta la ficha cuando quien mira es superadministrador**, porque la API rechaza al resto
 * con 403: dibujar un control que la API va a rechazar es ofrecer algo que no existe.
 *
 * Los guards son los mismos que ya tenía el diálogo de Nivel, por el mismo motivo:
 *
 * - **En la ficha propia el escalón se lee pero no se toca.** Nadie se cambia el acceso por accidente
 *   en la ficha que más se abre, la suya. Se bloquea el cambio entero y no solo la subida: bajarse
 *   uno mismo también deja una cuenta trabada sin que nadie más se entere. La API lo frena igual con
 *   409; acá se adelanta para que el motivo se lea antes de intentarlo y no después.
 * - **El guard del último superadministrador no se repite**, y no es un olvido: esta puerta no puede
 *   dar ni quitar esa condición, así que no hay nada que dejar sin cubrir. Sigue viviendo donde el
 *   rol se reparte de verdad, en el diálogo de Nivel.
 *
 * El estado se pide al abrir y no viaja en `persona`: `GET /staff/{id}` no trae el escalón, y traerlo
 * en la ficha entera obligaría a que cada listado lo cargue para una pantalla que casi nadie abre.
 */
export function DialogoNivelBase ({ persona, actorId }: PropsDialogoNivelBase) {
  const [abierto, setAbierto] = useState(false)

  return (
    <Dialogo open={abierto} onOpenChange={setAbierto}>
      <DisparadorDialogo asChild>
        <Boton variante="sutil" tamano="chico">Escalón</Boton>
      </DisparadorDialogo>

      <ContenidoDialogo
        titulo={`Escalón de ${persona.full_name}`}
        descripcion="Dónde está esta persona en la escalera de permisos. Administrador y superadministrador se reparten en «Nivel»."
      >
        {/* El estado vive en el cuerpo y no acá: Radix no renderiza el contenido cerrado, así que al
            abrir se vuelve a pedir a la API en vez de mostrar lo último que se vio. */}
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
  const [puesto, setPuesto] = useState<NivelDeLaPersona | null>(null)
  const [elegido, setElegido] = useState<string>(HEREDADO)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const esUnoMismo = persona.id === actorId

  useEffect(() => {
    const control = new AbortController()

    pedirSobre<NivelDeLaPersona>(`staff/${persona.id}/nivel`, control.signal)
      .then((sobre) => {
        setPuesto(sobre.data)
        setElegido(valorDelNivel(sobre.data.nivel_asignado))
      })
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return

        setError(fallo instanceof Error ? fallo.message : 'No se pudo leer el escalón de esta persona.')
      })

    return () => { control.abort() }
  }, [persona.id])

  async function guardar (): Promise<void> {
    setGuardando(true)
    setError(null)

    const resultado = await escribirEnBff<NivelDeLaPersona>(
      `staff/${persona.id}/nivel`,
      'PUT',
      { nivel: nivelDelValor(elegido) }
    )

    setGuardando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    cerrar()
    router.refresh()
  }

  if (puesto === null) {
    return (
      <p className={error === null ? 'text-texto-tenue text-sm' : 'text-peligro text-sm'}>
        {error ?? 'Cargando el escalón…'}
      </p>
    )
  }

  const sinCambios = elegido === valorDelNivel(puesto.nivel_asignado)
  const ayudaDelElegido = NIVELES_BASE.find((opcion) => opcion.valor === elegido)?.ayuda

  return (
    <form onSubmit={(evento) => { evento.preventDefault(); void guardar() }} className="flex flex-col gap-5">
      <p className="text-sm">
        Hoy manda: <strong className="font-medium">{etiquetaDeNivel(puesto.nivel)}</strong>
        {puesto.nivel_asignado === null && ', heredado de su rol.'}
      </p>

      {/* Decirlo o mentir: `Acceso\Permisos::nivel()` lee las banderas ANTES que esta tabla, así que
          sobre un administrador el escalón se guarda y no gobierna hasta que le quiten la condición. */}
      {loTapaLaBandera(puesto.nivel) && (
        <p className="text-texto-tenue text-sm">
          Su condición de {etiquetaDeNivel(puesto.nivel).toLowerCase()} tapa este escalón: lo que elijas
          queda guardado y empieza a valer el día que se la quiten, en «Nivel».
        </p>
      )}

      {esUnoMismo
        ? (
            <p className="text-texto-tenue text-sm">
              No puedes cambiarte el escalón a ti mismo: pídeselo a otro superadministrador.
            </p>
          )
        : (
            <Campo etiqueta="Escalón" ayuda={ayudaDelElegido}>
              {(props) => (
                <Selector value={elegido} onValueChange={setElegido} disabled={guardando}>
                  <DisparadorSelector marcador="Elige un escalón" id={props.id} />
                  <ContenidoSelector>
                    {/* Heredar no es ser `usuario`: el rol puede dar `head` o `gerente`. */}
                    <Opcion value={HEREDADO}>El que dé su rol</Opcion>
                    {NIVELES_BASE.map((opcion) => (
                      <Opcion key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</Opcion>
                    ))}
                  </ContenidoSelector>
                </Selector>
              )}
            </Campo>
          )}

      {error !== null && <p className="text-peligro text-sm">{error}</p>}

      <div className="flex justify-end gap-2">
        <CerrarDialogo asChild>
          <Boton variante="sutil" type="button">Cancelar</Boton>
        </CerrarDialogo>
        {!esUnoMismo && (
          <Boton type="submit" disabled={guardando || sinCambios}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Boton>
        )}
      </div>
    </form>
  )
}
