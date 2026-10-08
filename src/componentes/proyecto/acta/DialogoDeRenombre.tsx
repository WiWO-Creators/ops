'use client'

import { useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { CerrarDialogo, Dialogo, ContenidoDialogo } from '@/componentes/superposiciones/Dialogo'
import { LARGO_MAXIMO_TITULO, motivoParaRechazarTitulo } from '@/dominio/actas'
import { GLOSARIO } from '@/dominio/glosario'

/**
 * Pide el nombre nuevo del Meeting Paper.
 *
 * === POR QUÉ UN DIÁLOGO Y NO UN TÍTULO EDITABLE EN SITIO ===
 *
 * El `h2` es el encabezado del documento, no un campo: esta misma pantalla la monta el cliente en
 * sólo lectura, y en el panel la abre mucha más gente para leer un acta que para renombrarla. Un
 * campo de texto permanente ahí le cambia el peso visual al título para todos por una acción que
 * casi nadie va a usar, y deja el renombre a un clic de distraído en la pantalla que más se abre.
 *
 * Es además el patrón con el que ya se renombra en el panel —ver `DialogoDeCargo` en
 * `PanelAreasCargos`— y el que trae de Radix, sin escribirlo, lo que un renombre necesita: `Escape`
 * que descarta, el foco atrapado dentro del formulario y devuelto al `⋯` al cerrar, y un nombre
 * accesible que dice qué se abrió.
 *
 * === POR QUÉ EL BOTÓN NO SE APAGA CON UN TÍTULO INVÁLIDO ===
 *
 * Un "Guardar" deshabilitado no explica por qué: quien borró el título y ve el botón apagado no
 * tiene de dónde deducir que el problema es el campo vacío, y con un lector de pantalla el control
 * ni siquiera se anuncia. Se deja pulsable y la validación contesta con el motivo, que se cuelga del
 * propio campo —`Campo` lo emite con `role="alert"` y `aria-describedby`— y no del banner de la
 * pantalla, que queda detrás del diálogo y no se ve.
 */
export function DialogoDeRenombre ({
  titulo,
  esTraduccion,
  onGuardar,
  onCerrar
}: {
  /** El título que se está viendo, que es con el que arranca el campo. */
  titulo: string
  /** Si lo que se renombra es una traducción y no el acta original. Solo cambia lo que se explica. */
  esTraduccion: boolean
  /** Manda el renombre; devuelve el mensaje de error de la API, o `null` si quedó guardado. */
  onGuardar: (titulo: string) => Promise<string | null>
  onCerrar: () => void
}): ReactElement {
  const [nombre, setNombre] = useState(titulo)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Valida lo escrito y lo manda, si de verdad hay algo que cambiar. */
  async function guardar (): Promise<void> {
    const motivo = motivoParaRechazarTitulo(nombre)

    if (motivo !== null) {
      setError(motivo)

      return
    }

    const limpio = nombre.trim()

    // Confirmar sin haber cambiado nada es cerrar el diálogo, no una escritura: un `PATCH` con el
    // mismo título igual movería `date_updated` y firmaría el acta como corregida por quien no la
    // corrigió.
    if (limpio === titulo) {
      onCerrar()

      return
    }

    setGuardando(true)
    setError(null)

    const fallo = await onGuardar(limpio)

    setGuardando(false)

    // El diálogo se queda abierto con lo tecleado: si la API lo rechazó, cerrarlo perdería el único
    // lugar donde existe ese texto y dejaría el error sin el campo al que corregir.
    if (fallo !== null) {
      setError(fallo)

      return
    }

    onCerrar()
  }

  return (
    <Dialogo open onOpenChange={(abierto) => { if (!abierto) onCerrar() }}>
      <ContenidoDialogo
        titulo={`Renombrar «${titulo}»`}
        descripcion={esTraduccion
          ? 'Cambia el nombre de esta traducción. El Meeting Paper original conserva el suyo.'
          : `Es el nombre con el que aparece en la lista de ${GLOSARIO.acta.plural} del ${GLOSARIO.espacio.singular.toLowerCase()}.`}
        ancho="chico"
      >
        <form
          onSubmit={(evento) => { evento.preventDefault(); void guardar() }}
          className="flex flex-col gap-5"
        >
          <Campo etiqueta="Título" requerido error={error ?? undefined}>
            {(props) => (
              <Entrada
                {...props}
                value={nombre}
                // El tope vive en el control y no sólo en la validación: avisar de que sobran
                // caracteres después de haber escrito trescientos llega tarde.
                maxLength={LARGO_MAXIMO_TITULO}
                disabled={guardando}
                onChange={(evento) => { setNombre(evento.target.value); setError(null) }}
              />
            )}
          </Campo>

          <div className="flex justify-end gap-2">
            <CerrarDialogo asChild>
              <Boton variante="sutil" type="button">Cancelar</Boton>
            </CerrarDialogo>
            <Boton variante="primario" type="submit" cargando={guardando}>Guardar</Boton>
          </div>
        </form>
      </ContenidoDialogo>
    </Dialogo>
  )
}
