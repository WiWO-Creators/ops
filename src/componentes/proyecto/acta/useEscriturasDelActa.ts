'use client'

import { useState } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { useAviso } from '@/componentes/estado/useAviso'
import { temaDeMarca, type CodigoDeMarca } from '@/dominio/marcas-acta'
import type { Acta } from '@/datos/recursos'

interface OpcionesDeEscrituras {
  acta: Acta
  /** Donde se escribe el acta original. */
  ruta: string
  /** Escribe sobre el acta original o la traduccion activa. Ver `useIdiomaDelActa`. */
  escribirEnLoVisible: (cuerpo: Record<string, string>) => Promise<string | null>
  onCambiada: (acta: Acta) => void
  onBorrada: () => void
  setError: (mensaje: string | null) => void
}

export interface EscriturasDelActa {
  cambiandoMarca: boolean
  cambiandoPrivacidad: boolean
  borrando: boolean
  cambiarMarca: (codigo: CodigoDeMarca) => Promise<void>
  cambiarPrivacidad: () => Promise<void>
  renombrar: (titulo: string) => Promise<string | null>
  borrar: () => Promise<void>
}

/**
 * Las escrituras del acta que no pasan por el editor: la marca que la firma, su nombre y borrarla.
 *
 * @param opciones el acta, su ruta, como escribir lo visible y como avisar cambios y errores
 * @returns las tres acciones y lo que tienen en vuelo
 */
export function useEscriturasDelActa ({
  acta,
  ruta,
  escribirEnLoVisible,
  onCambiada,
  onBorrada,
  setError
}: OpcionesDeEscrituras): EscriturasDelActa {
  const [cambiandoMarca, setCambiandoMarca] = useState(false)
  const [cambiandoPrivacidad, setCambiandoPrivacidad] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const aviso = useAviso()

  /**
   * Marca el acta como privada (solo superadmins) o la devuelve a todo el equipo.
   *
   * Se pide confirmación al hacerla privada porque, desde ese momento, el resto del equipo deja de
   * verla y el autor, si no es superadmin, pierde el acceso a su propia acta.
   */
  async function cambiarPrivacidad (): Promise<void> {
    const privada = acta.private !== true

    if (privada && !confirm('Solo los superadmins podrán ver este Meeting Paper; el resto del equipo, incluido su autor, dejará de verlo. ¿Continuar?')) return

    setCambiandoPrivacidad(true)
    setError(null)

    const resultado = await escribirEnBff<Acta>(ruta, 'PATCH', { private: privada })

    setCambiandoPrivacidad(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    onCambiada(resultado.datos)
  }

  /**
   * Cambia la marca que firma el acta.
   *
   * Se puede cambiar después de creada porque el acta se escribe antes de saber quién la firma:
   * una reunión que empezó siendo de WiWO termina facturándose por MGC, y hasta ahora eso obligaba
   * a rehacer el documento entero. La API ya aceptaba `brand` en la edición; lo que faltaba era
   * poder decirlo desde acá.
   */
  async function cambiarMarca (codigo: CodigoDeMarca): Promise<void> {
    if (codigo === acta.brand) return

    setCambiandoMarca(true)
    setError(null)

    const resultado = await escribirEnBff<Acta>(ruta, 'PATCH', { brand: codigo })

    setCambiandoMarca(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    onCambiada(resultado.datos)
    aviso.exito(`«${acta.title}» ahora lo firma ${temaDeMarca(codigo).nombre}.`)
  }

  /**
   * Le cambia el nombre al documento que se esta viendo: el acta original o la traduccion activa.
   *
   * Son las dos rutas de `guardar()` y por el mismo motivo, que aca es todavia mas visible: el `h2`
   * muestra el titulo de la traduccion cuando hay una, y renombrar desde ahi el acta en español
   * dejaria a la persona cambiando un nombre que no es el que tiene delante.
   *
   * Manda **solo** `title`. Mandar tambien el contenido convertiria un renombre en una reescritura
   * del documento con lo que esta pantalla tuviera cargado, que no es lo que nadie pidio al abrir
   * "Renombrar", y sobre una traduccion seria ademas el HTML del idioma equivocado.
   *
   * Nada se pinta antes de que la API conteste: sin adelanto optimista no hay nada que revertir
   * cuando el `422` llega, y el titulo de la cabecera sigue siendo el que ya estaba.
   *
   * @param titulo el titulo elegido, ya recortado y validado por el dialogo
   * @returns el mensaje de error de la API, o `null` si quedo guardado
   */
  async function renombrar (titulo: string): Promise<string | null> {
    setError(null)

    const fallo = await escribirEnLoVisible({ title: titulo })

    if (fallo === null) aviso.exito(`Se renombró a «${titulo}».`)

    return fallo
  }

  /** Borra el acta y le avisa a quien la monta. */
  async function borrar (): Promise<void> {
    setBorrando(true)

    const resultado = await escribirEnBff(ruta, 'DELETE')

    setBorrando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    aviso.exito(`«${acta.title}» se eliminó.`)
    onBorrada()
  }

  return { cambiandoMarca, cambiandoPrivacidad, borrando, cambiarMarca, cambiarPrivacidad, renombrar, borrar }
}
