import { notFound } from 'next/navigation'
import type { ReactElement, ReactNode } from 'react'
import { Logo } from '@/componentes/estructura/Logo'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { BarraProgreso } from '@/componentes/proyecto/CabeceraProyecto'
import { llamarApiTipado } from '@/datos/api'
import { ErrorApi } from '@/datos/errores'
import { GLOSARIO } from '@/dominio/glosario'
import { avancePublico } from '@/lib/enlace-publico'
import type { ProcesoPublico } from '@/datos/recursos'

/**
 * El nombre de la Tarea **no** va en el titulo.
 *
 * El titulo viaja a la barra del navegador, al historial compartido y a cualquier previsualizacion
 * de enlace. Quien reenvia el enlace decide a quien le muestra el contenido; el titulo se filtra solo.
 */
export const metadata = { title: `${GLOSARIO.proceso.singular} · WiWO Ops` }

/**
 * Ficha publica de una Tarea, para cualquiera con el enlace.
 *
 * Tercera ruta sin sesion del proyecto, junto a `/sala/<token>` y `/clave/<token>`: queda fuera del
 * armazon del panel —sin barra lateral y sin aurora— porque quien la abre es anonimo por definicion.
 *
 * Por eso **no usa `pedir()`**, que exige sesion y redirige a `/colab`, ni pasa por el BFF, que solo
 * sabe reenviar con el token de una persona adosado: llama a la API desde el servidor, igual que
 * `sala/[token]`.
 *
 * **A diferencia del enlace de clave, este no se quema al abrirse**: vive 30 dias, se abre las veces
 * que haga falta y se revoca a mano desde el panel.
 *
 * Se muestra exactamente lo que manda la API y ni un dato mas. No hay una segunda peticion "para
 * completar la ficha": cada campo que apareciera aca sin estar en la lista blanca del backend seria
 * una fuga hacia internet abierto.
 */
export default async function FichaPublicaDeTarea (props: PageProps<'/tarea/[token]'>): Promise<ReactElement> {
  const { token } = await props.params

  let tarea: ProcesoPublico

  try {
    const sobre = await llamarApiTipado<ProcesoPublico>(`/public/tasks/${encodeURIComponent(token)}`)
    tarea = sobre.data
  } catch (error) {
    // Inventado, revocado, vencido o reemplazado: la API responde el mismo 404 a proposito, y la
    // pantalla no puede deshacer eso distinguiendolos. Cualquier otro codigo es un problema real y
    // lo levanta `error.tsx`.
    if (error instanceof ErrorApi && error.estado === 404) notFound()

    throw error
  }

  const avance = avancePublico(tarea.progress)

  return (
    <main className="bg-superficie mx-auto flex min-h-dvh max-w-2xl flex-col gap-5 p-6">
      <header className="flex flex-col gap-3">
        <h1 className="font-titular text-texto text-xl leading-snug font-extrabold">{tarea.name}</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          {tarea.status !== null && (
            <Insignia tamano="chico" color={tarea.status.color}>{tarea.status.name}</Insignia>
          )}
          {tarea.priority !== null && (
            <Insignia tamano="chico" color={tarea.priority.color}>{tarea.priority.name}</Insignia>
          )}
          {tarea.task_type !== null && (
            <Insignia tamano="chico" tono="contorno">{tarea.task_type.name}</Insignia>
          )}
        </div>
      </header>

      <section
        aria-label="Avance"
        className="border-linea bg-superficie-elevada rounded-tarjeta flex flex-col gap-2 border p-4"
      >
        {/* Sin porcentaje no se dibuja una barra en cero: diria que el trabajo no arranco, cuando lo
            que pasa es que no hay lista de control con que medirlo. Queda solo la linea que lo
            explica. */}
        {avance.porcentaje !== null && (
          <div className="flex items-center gap-3">
            <BarraProgreso porcentaje={avance.porcentaje} className="min-w-0 flex-1" />
            <span data-numerico className="text-texto text-sm font-semibold tabular-nums">
              {avance.porcentaje}%
            </span>
          </div>
        )}
        <p className="text-texto-sutil text-xs">{avance.detalle}</p>
      </section>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Dato etiqueta="Inicio"><Fecha valor={tarea.start_date} /></Dato>
        <Dato etiqueta="Entrega"><Fecha valor={tarea.due_date} /></Dato>
        <Dato etiqueta="Cierre">
          {tarea.date_finished === null
            ? <span className="text-texto-sutil">{tarea.is_completed ? 'Terminada' : SIN_DATO}</span>
            : <Fecha valor={tarea.date_finished} conHora />}
        </Dato>
      </dl>

      <footer className="text-texto-sutil mt-auto flex items-center gap-2 pt-6 text-xs">
        <Logo tamano="chico" />
        <span>· Vista de sólo lectura</span>
      </footer>
    </main>
  )
}

const SIN_DATO = '—'

/**
 * Un par etiqueta/valor de la ficha, con la etiqueta en versalita.
 *
 * Es el mismo `Dato` que usa `DetalleTarea`, escrito de nuevo aca en vez de exportado desde alli: ese
 * archivo es `'use client'` y arrastra el detalle entero —catalogos, cronometros, arbol de Drive— a
 * una ruta anonima que no tiene sesion para pedir nada de eso.
 */
function Dato ({ etiqueta, children }: { etiqueta: string, children: ReactNode }): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-texto-sutil text-xs font-medium tracking-[0.08em] uppercase">{etiqueta}</dt>
      <dd className="text-texto min-w-0 text-sm">{children}</dd>
    </div>
  )
}
