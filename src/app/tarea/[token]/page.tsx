import { notFound } from 'next/navigation'
import type { ReactElement, ReactNode } from 'react'
import { Logo } from '@/componentes/estructura/Logo'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Etiquetas } from '@/componentes/presentadores/Etiqueta'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { BarraProgreso } from '@/componentes/proyecto/CabeceraProyecto'
import { CabeceraFichaTarea } from '@/componentes/proyecto/CabeceraFichaTarea'
import { llamarApiTipado } from '@/datos/api'
import { ErrorApi } from '@/datos/errores'
import { camposLegibles } from '@/dominio/campos-personalizados'
import { GLOSARIO } from '@/dominio/glosario'
import { avancePublico, tiempoLegible } from '@/lib/enlace-publico'
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
 *
 * **Cada seccion opcional se dibuja solo si llego su clave**, que es lo que eligio quien genero el
 * enlace. Llegada y vacia —una descripcion en blanco, cero comentarios— se dibuja con su linea de "no
 * hay": quien compartio eligio mostrarla, y un hueco haria pensar que el enlace esta roto.
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
  const campos = tarea.custom_fields === undefined
    ? undefined
    : camposLegibles(tarea.custom_fields.map((campo, indice) => ({ ...campo, id: indice, slug: '' })))

  return (
    <main className="bg-superficie mx-auto flex min-h-dvh max-w-2xl flex-col gap-5 p-6">
      <header className="flex flex-col gap-3">
        {/* `nivel={1}`: esto es una pagina y su titulo es el H1. La misma cabecera que el modal, que
            monta la suya un nivel mas abajo porque el dialogo ya aporta el encabezado que lo nombra.
            La marca y el codigo no viajan en `/public/tasks/{token}` —la lista blanca del backend no
            los incluye— y la cabecera simplemente no los pinta. */}
        <CabeceraFichaTarea titulo={tarea.name} nivel={1} />
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

      {tarea.description !== undefined && (
        <Seccion titulo="Descripción">
          {tarea.description === ''
            ? <p className="text-texto-sutil text-sm">Sin descripción.</p>
            : <p className="text-texto-tenue max-w-prose text-sm whitespace-pre-line">{tarea.description}</p>}
        </Seccion>
      )}

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

        {tarea.checklist !== undefined && tarea.checklist.length > 0 && (
          <ul className="border-linea-suave mt-1 flex flex-col gap-1 border-t pt-3">
            {tarea.checklist.map((item, indice) => (
              <li key={indice} className="flex items-baseline gap-2 text-sm">
                <span
                  aria-hidden
                  className={`w-3 shrink-0 text-center ${item.finished ? 'text-texto-exito' : 'text-texto-sutil'}`}
                >
                  {item.finished ? '✓' : '·'}
                </span>
                <span className={item.finished ? 'text-texto-tenue line-through' : 'text-texto'}>
                  {item.description}
                </span>
                <span className="sr-only">{item.finished ? '(hecho)' : '(pendiente)'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Dato etiqueta="Inicio"><Fecha valor={tarea.start_date} /></Dato>
        <Dato etiqueta="Entrega"><Fecha valor={tarea.due_date} /></Dato>
        <Dato etiqueta="Cierre">
          {tarea.date_finished === null
            ? <span className="text-texto-sutil">{tarea.is_completed ? 'Terminada' : SIN_DATO}</span>
            : <Fecha valor={tarea.date_finished} conHora />}
        </Dato>
        {tarea.project !== undefined && (
          <>
            <Dato etiqueta={GLOSARIO.espacio.singular}>{tarea.project?.name ?? SIN_DATO}</Dato>
            <Dato etiqueta="Cliente">{tarea.project?.client ?? SIN_DATO}</Dato>
            <Dato etiqueta={GLOSARIO.hito.singular}>{tarea.project?.milestone ?? SIN_DATO}</Dato>
          </>
        )}
        {tarea.assignees !== undefined && (
          <Dato etiqueta="Asignados">
            {tarea.assignees.length === 0 ? SIN_DATO : tarea.assignees.join(', ')}
          </Dato>
        )}
        {tarea.tags !== undefined && (
          <Dato etiqueta="Etiquetas">
            {tarea.tags.length === 0
              ? SIN_DATO
              : <Etiquetas etiquetas={tarea.tags.map((nombre, indice) => ({ id: indice, name: nombre }))} maximo={8} />}
          </Dato>
        )}
        {tarea.logged_seconds !== undefined && (
          <Dato etiqueta="Tiempo registrado">
            <span data-numerico className="tabular-nums">{tiempoLegible(tarea.logged_seconds)}</span>
          </Dato>
        )}
        {campos?.map((campo) => (
          <Dato key={campo.id} etiqueta={campo.nombre}>
            {campo.enlace === null
              ? <span className="break-words whitespace-pre-line">{campo.texto}</span>
              : (
                <a href={campo.enlace} target="_blank" rel="noreferrer noopener" className="text-acento break-all underline underline-offset-4">
                  {campo.texto}
                </a>
                )}
          </Dato>
        ))}
      </dl>

      {tarea.attachments !== undefined && (
        <Seccion titulo="Archivos">
          {tarea.attachments.length === 0
            ? <p className="text-texto-sutil text-sm">Sin archivos adjuntos.</p>
            : (
              <ul className="flex flex-col gap-2">
                {tarea.attachments.map((adjunto, indice) => (
                  <li key={indice} className="rounded-chico border-linea border p-3 text-sm">
                    {adjunto.url === null
                      ? <span className="text-texto break-all">{adjunto.name}</span>
                      : (
                        <a href={adjunto.url} target="_blank" rel="noreferrer noopener" className="text-acento break-all underline underline-offset-4">
                          {adjunto.name}
                        </a>
                        )}
                  </li>
                ))}
              </ul>
              )}
        </Seccion>
      )}

      {tarea.comments !== undefined && (
        <Seccion titulo="Comentarios">
          {tarea.comments.length === 0
            ? <p className="text-texto-sutil text-sm">Todavía no hay comentarios.</p>
            : (
              <ul className="flex flex-col gap-2">
                {tarea.comments.map((comentario, indice) => (
                  <li key={indice} className="rounded-chico border-linea bg-superficie-elevada flex flex-col gap-1 border p-3">
                    <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                      <span className="text-texto font-semibold">{comentario.author ?? 'Sin nombre'}</span>
                      {comentario.from_client && <span className="text-texto-sutil">· Cliente</span>}
                      {comentario.date_added !== null && (
                        <span className="text-texto-sutil"><Fecha valor={comentario.date_added} conHora /></span>
                      )}
                    </div>
                    <p className="text-texto-tenue text-sm break-words whitespace-pre-line">{comentario.content}</p>
                  </li>
                ))}
              </ul>
              )}
        </Seccion>
      )}

      <footer className="text-texto-sutil mt-auto flex items-center gap-2 pt-6 text-xs">
        <Logo tamano="chico" />
        <span>· Vista de sólo lectura</span>
      </footer>
    </main>
  )
}

const SIN_DATO = '—'

/** Una seccion opcional de la ficha, con su titulo. */
function Seccion ({ titulo, children }: { titulo: string, children: ReactNode }): ReactElement {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-texto-tenue text-sm font-semibold">{titulo}</h2>
      {children}
    </section>
  )
}

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
