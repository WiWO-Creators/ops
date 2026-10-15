'use client'

import { useEffect, useState } from 'react'
import { pedirSobre } from '@/datos/cliente'
import type { Yo } from '@/datos/tipos'

/** Lo que la edición conjunta necesita saber de quien edita: su cursor lleva su nombre y su color. */
export type YoEnVivo = Pick<Yo, 'id' | 'full_name' | 'profile_image_url'>

/**
 * Quien edita cuando `/me` no contesta. Con `id` 0 no figura en la lista de quiénes están editando
 * (ver `editoresDelDocumento`), pero su cursor igual lleva un nombre en vez de quedar en blanco.
 */
const ANONIMO: YoEnVivo = { id: 0, full_name: 'Alguien del equipo', profile_image_url: null }

/** La respuesta de `/me`, compartida por todos los editores de la pestaña. */
let conocido: YoEnVivo | null = null
let enVuelo: Promise<YoEnVivo> | null = null

/** Pide `/me` una sola vez por pestaña; un fallo no se guarda y el siguiente editor reintenta. */
async function leerYo (): Promise<YoEnVivo> {
  enVuelo ??= pedirSobre<Yo>('me', new AbortController().signal)
    .then(({ data }) => {
      conocido = { id: data.id, full_name: data.full_name, profile_image_url: data.profile_image_url }

      return conocido
    })
    .catch(() => {
      enVuelo = null

      return ANONIMO
    })

  return await enVuelo
}

/**
 * Quién es la persona que edita, para ponerle nombre y color a su cursor en la edición conjunta.
 *
 * @returns la persona, o `null` mientras no se sabe (un editor conjunto espera para montarse: el nombre
 *          del cursor se fija al crear el editor)
 */
export function useYoEnVivo (): YoEnVivo | null {
  const [yo, setYo] = useState<YoEnVivo | null>(conocido)

  useEffect(() => {
    if (conocido !== null) return

    let vigente = true

    void leerYo().then((persona) => { if (vigente) setYo(persona) })

    return () => { vigente = false }
  }, [])

  return yo
}
