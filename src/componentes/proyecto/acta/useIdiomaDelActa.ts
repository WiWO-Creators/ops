'use client'

import { useState } from 'react'
import { escribirEnBff, leerDelBff } from '@/componentes/datos/mutaciones'
import { conIdioma } from '@/dominio/fuente-proyecto'
import { IDIOMAS, type CodigoDeIdioma, type IdiomaDelActa } from '@/dominio/idiomas-acta'
import type { Acta, TraduccionActa } from '@/datos/recursos'

/** El idioma en el que se esta leyendo el acta, junto a lo que ya se trajo de la API. */
interface EstadoDeIdioma {
  /** A que acta pertenece. Cambia el acta, el idioma vuelve al original: ver donde se usa. */
  actaId: number
  codigo: CodigoDeIdioma
  /** Las traducciones ya traidas en esta visita, por codigo. El español nunca esta: es `content`. */
  traducciones: Partial<Record<CodigoDeIdioma, TraduccionActa>>
  /** Si hay una lectura o una traduccion en vuelo, para el girador del selector. */
  cargando: boolean
}

interface OpcionesDeIdioma {
  acta: Acta
  /** El Proyecto del acta: arma la ruta de `/ia/*` que traduce. */
  proyectoId: number
  /** Donde se escribe el acta original. */
  ruta: string
  /** Donde viven sus traducciones, sin el codigo de idioma. */
  rutaTraducciones: string
  /** Pedir una traduccion nueva gasta: `puedeEditar` y `conIa`. */
  puedeTraducir: boolean
  onCambiada: (acta: Acta) => void
  setError: (mensaje: string | null) => void
}

export interface LecturaEnIdioma {
  idioma: CodigoDeIdioma
  infoIdioma: IdiomaDelActa
  /** La traduccion que se esta viendo, o `null` si se lee el original en español. */
  traduccionActiva: TraduccionActa | null
  /** El documento que se esta viendo: el original en español, o la traduccion elegida. */
  htmlActivo: string
  tituloActivo: string
  /** Los idiomas que ya tienen traduccion guardada. */
  yaTraducidos: string[]
  cambiandoIdioma: boolean
  confirmandoRetraduccion: boolean
  setConfirmandoRetraduccion: (abierto: boolean) => void
  elegirIdioma: (codigo: CodigoDeIdioma) => Promise<void>
  traducir: (codigo: CodigoDeIdioma) => Promise<void>
  volverATraducir: () => void
  escribirEnLoVisible: (cuerpo: Record<string, string>) => Promise<string | null>
}

/**
 * El idioma en el que se lee un acta: cual se ve, lo ya traido, pedir traducciones nuevas y
 * escribir sobre el documento que se tiene delante.
 *
 * @param opciones el acta, sus rutas, si se puede traducir y como avisar cambios y errores
 * @returns el documento visible y las acciones sobre su idioma
 */
export function useIdiomaDelActa ({
  acta,
  proyectoId,
  ruta,
  rutaTraducciones,
  puedeTraducir,
  onCambiada,
  setError
}: OpcionesDeIdioma): LecturaEnIdioma {
  const [confirmandoRetraduccion, setConfirmandoRetraduccion] = useState(false)
  /**
   * Todo lo del idioma en un estado, junto al id del acta al que pertenece.
   *
   * Va atado al `actaId` porque el listado navega por `?acta=` sin desmontar este componente: al
   * pasar de un acta a otra, el idioma tiene que volver al original. Compararlo durante el render
   * —y no reponerlo desde un `useEffect`— es lo que evita el ciclo de renders en cascada que ese
   * efecto provocaba: acá no hay un segundo render, el valor correcto ya sale del primero.
   *
   * `traducciones` es memoria de la pantalla y no un cache de verdad: ir del inglés al español y de
   * vuelta al inglés no vuelve a pegarle a la API, pero recargar la página empieza de cero, que es
   * lo correcto porque otra persona pudo haberla corregido mientras tanto.
   */
  const [estadoIdioma, setEstadoIdioma] = useState<EstadoDeIdioma>(
    () => ({ actaId: acta.id, codigo: 'es', traducciones: {}, cargando: false })
  )
  const vigente: EstadoDeIdioma = estadoIdioma.actaId === acta.id
    ? estadoIdioma
    : { actaId: acta.id, codigo: 'es', traducciones: {}, cargando: false }
  const idioma = vigente.codigo
  const traducciones = vigente.traducciones

  const infoIdioma = IDIOMAS[idioma]
  const traduccionActiva = idioma === 'es' ? null : traducciones[idioma] ?? null
  const yaTraducidos = acta.translations ?? []

  /** Fija el idioma visible y su traduccion, siempre atados al acta que se esta mirando. */
  function fijarIdioma (codigo: CodigoDeIdioma, traduccion?: TraduccionActa): void {
    setEstadoIdioma({
      actaId: acta.id,
      codigo,
      traducciones: traduccion === undefined
        ? vigente.traducciones
        : { ...vigente.traducciones, [codigo]: traduccion },
      cargando: false
    })
  }

  /** Enciende o apaga el girador del selector sin tocar el idioma ni lo ya traido. */
  function marcarCargando (cargando: boolean): void {
    setEstadoIdioma({ ...vigente, cargando })
  }

  /**
   * Escribe sobre lo que se esta viendo: el acta original o la traduccion activa.
   *
   * Son dos rutas y no una con un parametro porque son dos recursos: corregir el acta cambia el
   * documento del que salen todas las traducciones, y corregir una traduccion cambia solo esa. Si
   * las dos escribieran en el mismo lugar, arreglar una palabra del ingles pisaria el español.
   *
   * Sobre una traduccion alcanza con dejar la nueva en pantalla: la lista del Espacio muestra el
   * titulo del original, que este camino no toca. Sobre el original, quien monta esta pantalla
   * vuelve a pedir el acta y la lista de Meeting Papers: sin eso, el listado seguiria mostrando lo
   * de antes hasta que alguien recargue.
   *
   * @param cuerpo los campos que se cambian, y solo esos
   * @returns el mensaje de error de la API, o `null` si quedo guardado
   */
  async function escribirEnLoVisible (cuerpo: Record<string, string>): Promise<string | null> {
    if (traduccionActiva !== null) {
      const enIdioma = await escribirEnBff<TraduccionActa>(
        conIdioma(rutaTraducciones, idioma), 'PATCH', cuerpo
      )

      if (!enIdioma.ok) return enIdioma.mensaje

      fijarIdioma(idioma, enIdioma.datos)

      return null
    }

    const resultado = await escribirEnBff<Acta>(ruta, 'PATCH', cuerpo)

    if (!resultado.ok) return resultado.mensaje

    onCambiada(resultado.datos)

    return null
  }

  /**
   * Cambia el idioma en el que se lee el acta, pidiendola si hace falta.
   *
   * Tres caminos, en este orden: el español no se pide —es `acta.content`—; un idioma ya traducido
   * se lee de la ruta del Espacio, que responde con la IA apagada; y uno que no existe todavia se le
   * pide al modelo, lo que exige `puedeTraducir` y tarda.
   *
   * Que exista se decide con `acta.translations` y no probando el GET a ver si da 404: el 404 es la
   * respuesta correcta a "no esta traducida", pero gastarlo para averiguar algo que la ficha ya dijo
   * deja un error en la consola del navegador cada vez que alguien abre el selector.
   */
  async function elegirIdioma (codigo: CodigoDeIdioma): Promise<void> {
    if (codigo === idioma) return

    setError(null)

    if (codigo === 'es' || traducciones[codigo] !== undefined) {
      fijarIdioma(codigo)

      return
    }

    if (!yaTraducidos.includes(codigo)) {
      await traducirSiSePuede(codigo)

      return
    }

    marcarCargando(true)

    const resultado = await leerDelBff<TraduccionActa>(conIdioma(rutaTraducciones, codigo))

    if (!resultado.ok) {
      marcarCargando(false)
      setError(resultado.mensaje)

      return
    }

    fijarIdioma(codigo, resultado.datos)
  }

  /** Un idioma sin traduccion se pide al modelo solo si este sujeto puede pagarla. */
  async function traducirSiSePuede (codigo: CodigoDeIdioma): Promise<void> {
    if (!puedeTraducir) {
      setError(`Este Meeting Paper todavía no está traducido al ${IDIOMAS[codigo].nombre.toLowerCase()}.`)

      return
    }

    await traducir(codigo)
  }

  /**
   * Le pide al modelo el acta en otro idioma y la deja a la vista.
   *
   * Es la llamada mas cara de esta pantalla despues de generar el acta, y por eso la API guarda el
   * resultado: la segunda vez que alguien elija ese idioma sale de la base, no del modelo. Vuelve a
   * pedirla solo quien usa "Volver a traducir", que es el camino para descartar una mala.
   *
   * `onCambiada` con la lista de idiomas actualizada: sin eso, el selector seguiria creyendo que el
   * idioma no existe y la proxima eleccion volveria a pagar una traduccion.
   */
  async function traducir (codigo: CodigoDeIdioma): Promise<void> {
    marcarCargando(true)
    setError(null)

    const resultado = await escribirEnBff<TraduccionActa>(
      `ia/proyectos/${proyectoId}/acta-traducir`, 'POST', { acta_id: acta.id, idioma: codigo }
    )

    if (!resultado.ok) {
      marcarCargando(false)
      setError(resultado.mensaje)

      return
    }

    fijarIdioma(codigo, resultado.datos)
    onCambiada({
      ...acta,
      translations: yaTraducidos.includes(codigo) ? yaTraducidos : [...yaTraducidos, codigo].sort()
    })
  }

  /**
   * Descarta la traduccion que se esta viendo y la pide de nuevo.
   *
   * Se pregunta antes solo cuando alguien la corrigio a mano —`updated_by` deja de ser `null`—,
   * porque eso es lo unico que se pierde de verdad: volver a traducir lo que escribio el modelo no
   * pierde trabajo de nadie.
   */
  function volverATraducir (): void {
    if (traduccionActiva === null) return

    const corregida = traduccionActiva.updated_by !== null && traduccionActiva.updated_by !== undefined

    if (corregida) {
      setConfirmandoRetraduccion(true)
      return
    }

    void traducir(idioma)
  }

  return {
    idioma,
    infoIdioma,
    traduccionActiva,
    htmlActivo: traduccionActiva?.content ?? acta.content ?? '',
    tituloActivo: traduccionActiva?.title ?? acta.title,
    yaTraducidos,
    cambiandoIdioma: vigente.cargando,
    confirmandoRetraduccion,
    setConfirmandoRetraduccion,
    elegirIdioma,
    traducir,
    volverATraducir,
    escribirEnLoVisible
  }
}
