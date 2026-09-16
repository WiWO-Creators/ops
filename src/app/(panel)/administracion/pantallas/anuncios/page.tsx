import type { ReactElement } from 'react'
import { AnunciosDePantalla } from '@/componentes/administracion/AnunciosDePantalla'
import { ErrorEstado, SinPermiso } from '@/componentes/estado/Estados'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { ErrorApi } from '@/datos/errores'
import { pedir, pedirOpcional } from '@/datos/servidor'
import { rutaDeAnuncios } from '@/dominio/anuncios-panel'
import type { AnuncioDePantallaEnPanel, PantallaDeAreaEnPanel } from '@/datos/recursos'

export const metadata = { title: 'Anuncios de pantalla · WiWO Ops' }

/**
 * La pantalla global cuando la API todavia no tiene ninguna.
 *
 * `GET /accesos/pantallas/global` responde 404 mientras nadie haya emitido su codigo, y aun asi el
 * alcance **existe**: se pueden cargar anuncios de toda la compañia antes de colgar el primer
 * televisor, igual que se pueden cargar los de un area antes de que tenga codigo. Sin esta fila, un
 * 404 esconderia del selector la unica opcion que no depende de que exista un area.
 */
const GLOBAL_SIN_CREAR: PantallaDeAreaEnPanel = {
  area_id: null,
  area_name: 'Toda la compañía',
  global: true,
  shared: false,
  code: null,
  title: null,
  scenes: [],
  created_at: null,
  last_seen_at: null
}

interface Cargado {
  pantallas: PantallaDeAreaEnPanel[]
  anuncios: AnuncioDePantallaEnPanel[]
  aviso: string | null
}

/**
 * Los anuncios que se publican en los televisores de la pared.
 *
 * Es la otra mitad de la pantalla de Pantallas: alli se decide **que escenas** muestra un televisor y
 * cuanto dura cada una; acá se escribe lo unico que no sale solo de la actividad del equipo. Van
 * separadas porque son dos trabajos distintos —configurar un aparato una vez, publicar un aviso cada
 * semana— y porque el segundo lo hace mas gente que el primero.
 *
 * **Sin compuerta por rol acá, a proposito**, igual que en Pantallas: la de verdad la pone la API, que
 * exige superadministrador en toda la rama `/accesos`. Una segunda copia de esa regla puede quedar
 * desincronizada de la que manda, y esconder no autoriza.
 */
export default async function AnunciosDePantallaPage (): Promise<ReactElement> {
  const cargado = await cargar()

  return (
    <section className="flex flex-col gap-4">
      <TituloModulo
        titulo="Anuncios de pantalla"
        descripcion="Los avisos que salen en el televisor de un área o en el de toda la compañía. Cada uno ocupa una pantalla entera de la rotación, y se puede programar para que aparezca y desaparezca solo."
      />

      <ComoSeVen />

      {cargado instanceof ErrorApi
        ? cargado.codigo === 'forbidden'
          ? <SinPermiso />
          : <ErrorEstado detalle={cargado.message} />
        : (
          <AnunciosDePantalla
            pantallas={cargado.pantallas}
            inicial={cargado.anuncios}
            avisoDeCarga={cargado.aviso}
          />
          )}
    </section>
  )
}

/**
 * Lo que hay que saber antes de publicar el primero.
 *
 * Va acá y no en un manual porque las tres cosas se aprenden a la mala: que la escena desaparece si no
 * hay nada vigente, que cada anuncio alarga la vuelta entera, y que una imagen puede estar bien
 * guardada y no verse en el panel.
 */
function ComoSeVen (): ReactElement {
  return (
    <details className="border-linea bg-superficie-elevada rounded-lg border p-4">
      <summary className="text-texto cursor-pointer text-sm font-medium">
        Cómo salen los anuncios en la pared
      </summary>

      <div className="text-texto-tenue mt-3 flex flex-col gap-3 text-sm">
        <p>
          <strong className="text-texto">Cada anuncio es una pantalla entera</strong> dentro de la
          rotación, y dura lo que diga la escena «Anuncios» en la configuración de esa pantalla. Tres
          anuncios alargan la vuelta tres veces: con muchos, quien pase por delante deja de ver el
          resto.
        </p>
        <p>
          <strong className="text-texto">Sin ningún anuncio vigente, la escena no se muestra</strong> —
          no queda un hueco negro. Programar un aviso para la semana que viene no ensucia la pantalla
          de esta.
        </p>
        <p>
          <strong className="text-texto">Si una imagen no se previsualiza acá</strong>, no es que se
          haya perdido: la imagen se sirve por la dirección del televisor, y esa dirección no existe
          hasta que la pantalla tiene código. Genérale uno en Pantallas y aparecerá.
        </p>
      </div>
    </details>
  )
}

/**
 * Trae el inventario de alcances y los anuncios del primero, o el error de la API como valor.
 *
 * Separada de la página para no construir JSX dentro del `try`, igual que en el resto de
 * Administración: React no renderiza el JSX en el momento en que se lee, así que un error de render
 * ahí no lo atraparía el `catch` — y el lint del proyecto lo rechaza.
 *
 * Las dos peticiones accesorias van con `pedirOpcional` porque ninguna de las dos puede tumbar la
 * página: la pantalla global puede no existir todavía, y los anuncios de un alcance sin pantalla
 * pueden contestar cualquier cosa. Lo único que se pide en firme es el inventario de áreas, que es lo
 * que da sentido al selector — sin él no hay nada que administrar.
 */
async function cargar (): Promise<Cargado | ErrorApi> {
  try {
    const areas = await pedir<PantallaDeAreaEnPanel[]>('/accesos/pantallas')
    const global = await pedirOpcional<PantallaDeAreaEnPanel>('/accesos/pantallas/global')
    const primera = global.datos ?? GLOBAL_SIN_CREAR
    const anuncios = await pedirOpcional<AnuncioDePantallaEnPanel[]>(`/${rutaDeAnuncios(primera)}`)

    return {
      pantallas: [primera, ...areas.data],
      anuncios: anuncios.datos ?? [],
      aviso: anuncios.error
    }
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}
