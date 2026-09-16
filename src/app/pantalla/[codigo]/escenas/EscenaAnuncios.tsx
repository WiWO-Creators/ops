import type { ReactNode } from 'react'
import { cn } from '@/lib/clases'
import { CUERPO_COLUMNA, Nada } from './piezas'
import type { AnuncioEnPantalla } from '@/datos/pantalla-area'

/**
 * Un anuncio, a pantalla completa.
 *
 * === POR QUE UN ANUNCIO ES UNA PANTALLA Y NO UNA FILA ===
 *
 * Todo lo demas que muestra esta pared se calcula solo a partir de lo que el area hace: jornadas,
 * cronometros, Tareas. Un anuncio es lo unico que alguien se sento a escribir para que otro lo lea, y
 * casi siempre es una foto —el afiche de la salida de fin de mes, el horario del feriado—. Metido como
 * una fila de un tablero seria una miniatura con un texto de 2.7vmin: publicar y no comunicar.
 *
 * Por eso la rejilla de `anuncios` vale 1 (`REJILLAS` en `src/dominio/pantalla-area.ts`) y el paginado
 * que ya existia hace el resto: N anuncios son N entradas del guion, cada una con su duracion, y cero
 * anuncios son cero entradas — la escena sale del guion sin ninguna regla nueva.
 *
 * === `CONTAIN` SOBRE UN FONDO DESENFOCADO, Y NO `COVER` ===
 *
 * Un anuncio llega con la proporcion que tenga: una foto apaisada, una captura de pantalla vertical, o
 * un afiche cuadrado hecho en el telefono. Ninguna de las dos salidas obvias sirve:
 *
 * - **`cover`** llena la pared sin bandas, pero **recorta**. Y lo que recorta de un afiche es
 *   justamente lo que hace falta: la fecha del borde inferior, el nombre del lugar. Un anuncio que
 *   pierde la mitad de su informacion es peor que no mostrarlo.
 * - **`contain` a secas** no pierde nada, pero una foto vertical en una pared apaisada deja dos bandas
 *   negras de medio metro cada una, que es exactamente la "franja fea" que no se quiere.
 * - **Estirar** para que calce no se discute: deforma caras.
 *
 * La salida es la de siempre en video: `contain` para la imagen de verdad —nada se recorta, nada se
 * deforma— y **la misma imagen, ampliada y desenfocada, rellenando el fondo**. Las bandas dejan de ser
 * bandas y pasan a ser un halo del color de la propia foto. El navegador descarga el archivo una sola
 * vez: el fondo es un `background-image` con la misma URL, asi que sale de la cache.
 *
 * === UNA IMAGEN QUE NO CARGA NO PUEDE DEJAR VEINTE SEGUNDOS EN BLANCO ===
 *
 * El televisor se queda sin red a mitad de ciclo con mas frecuencia de la que nadie admite. Debajo de
 * la imagen, **siempre**, hay una capa con lo que se pueda decir sin ella: el titulo y el texto si el
 * anuncio los tiene, y una linea sobria si es un anuncio que era solo la foto. Si la `<img>` falla, el
 * navegador no dibuja nada —lleva `alt=""`— y esa capa queda a la vista sola, sin un estado, sin un
 * `onError` y por lo tanto sin `'use client'`. Es el mismo recurso que usa `Cara` en `piezas.tsx` con
 * el disco de color debajo del avatar.
 */
export function EscenaAnuncios ({ items, ocultos }: {
  items: AnuncioEnPantalla[]
  ocultos: number
}): ReactNode {
  // Con la rejilla en 1 siempre llega exactamente uno. El vacio es la rendija entre el render y el
  // sondeo siguiente: `construirGuion()` ya saca del guion la escena sin anuncios.
  const anuncio = items[0]

  if (anuncio === undefined) return <Nada texto="Ningún anuncio publicado" />

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {anuncio.tipo === 'texto'
        ? <SoloTexto titulo={anuncio.titulo} texto={anuncio.texto} />
        : <ConImagen anuncio={anuncio} />}

      {ocultos > 0 && (
        <p className={cn('text-texto-sutil absolute right-0 bottom-0 tabular-nums', CUERPO_COLUMNA)}>
          +{ocultos} más
        </p>
      )}
    </div>
  )
}

/**
 * Un anuncio con imagen, con o sin texto al lado.
 *
 * El reparto cambia con la orientacion y no por gusto: en una pared apaisada la imagen y el texto se
 * ponen en columnas —la imagen ocupa algo mas de la mitad, que es donde entra una foto apaisada sin
 * achicarse— y en una de pie se apilan, porque partir 92vmin de ancho en dos deja dos columnas donde
 * no cabe ni una frase ni una foto.
 *
 * Cuando el anuncio es solo imagen (`tipo: 'imagen'`), la columna de texto no existe y la foto ocupa la
 * pantalla entera. La API garantiza que en ese formato `titulo` y `texto` son `null`, pero acá se
 * comprueba el contenido y no el `tipo`: un contrato que cambie deja la escena fea, nunca rota.
 */
function ConImagen ({ anuncio }: { anuncio: AnuncioEnPantalla }): ReactNode {
  const conTexto = anuncio.titulo !== null || anuncio.texto !== null

  if (!conTexto) {
    return <Lamina url={anuncio.image_url} titulo={null} texto={null} />
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[1.35fr_1fr] gap-[3vmin] portrait:grid-cols-1 portrait:grid-rows-[1.2fr_1fr]">
      <Lamina url={anuncio.image_url} titulo={anuncio.titulo} texto={anuncio.texto} />

      <div className="flex min-h-0 flex-col justify-center gap-[2vmin]">
        <Titulo texto={anuncio.titulo} completo={anuncio.texto} apretado />
        <Cuerpo texto={anuncio.texto} apretado />
      </div>
    </div>
  )
}

/**
 * La imagen, con su fondo desenfocado y su respaldo debajo.
 *
 * El orden de las capas es el que importa: primero el respaldo —lo que se lee si la imagen no llega—,
 * encima el fondo desenfocado, y encima la imagen nitida. Las dos capas de arriba viven en el mismo
 * `div` absoluto, asi que si la URL falla las dos desaparecen juntas y queda el respaldo. No hace falta
 * detectar el fallo.
 *
 * @param url     la URL publica de la imagen, o `null` si el anuncio llego sin ella
 * @param titulo  el titulo del anuncio, para el respaldo; `null` si no tiene
 * @param texto   el texto del anuncio, para el respaldo; `null` si no tiene
 */
function Lamina ({ url, titulo, texto }: {
  url: string | null
  titulo: string | null
  texto: string | null
}): ReactNode {
  return (
    <div className="bg-superficie-elevada relative min-h-0 flex-1 overflow-hidden rounded-[1.5vmin]">
      <Respaldo titulo={titulo} texto={texto} />

      {url !== null && url !== '' && (
        <>
          <div
            aria-hidden
            className="absolute inset-0 scale-110 bg-cover bg-center blur-[3vmin] saturate-150"
            style={{ backgroundImage: `url("${encodeURI(url)}")` }}
          />

          {/*
            * No usa `next/image`: la imagen la sirve la API en otro dominio, cambia como mucho una vez
            * al dia y el televisor la pide una vez por vuelta. Optimizarla no ahorra nada y obligaria a
            * declarar el dominio en la configuracion de Next para una URL que depende del despliegue.
            */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            className="absolute inset-0 size-full object-contain"
          />
        </>
      )}
    </div>
  )
}

/**
 * Lo que se ve si la imagen no llega.
 *
 * Con titulo y texto, el anuncio se lee igual y nadie nota que falto la foto — que es lo mejor que
 * puede pasar. Sin ellos no hay nada que decir salvo la verdad: una linea sobria, en el tono del resto
 * de la pantalla, que es infinitamente mejor que veinte segundos de rectangulo vacio.
 */
function Respaldo ({ titulo, texto }: { titulo: string | null, texto: string | null }): ReactNode {
  if (titulo === null && texto === null) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-[4vmin] text-center">
        <p className="text-texto-tenue text-[4vmin]">No pudimos cargar la imagen del anuncio</p>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-[2vmin] p-[4vmin] text-center">
      <Titulo texto={titulo} completo={texto} apretado />
      <Cuerpo texto={texto} apretado />
    </div>
  )
}

/**
 * Un anuncio sin imagen: el texto es todo lo que hay, y por eso es lo mas grande de la pantalla.
 *
 * Centrado y no alineado a la izquierda, al reves que las escenas de tablero: aquellas se recorren
 * buscando una fila —y para eso el borde izquierdo tiene que ser una linea recta— y esto se lee de una
 * vez, como un cartel.
 */
function SoloTexto ({ titulo, texto }: { titulo: string | null, texto: string | null }): ReactNode {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[3vmin] px-[8vmin] text-center">
      <Titulo texto={titulo} completo={texto} apretado={false} />
      <Cuerpo texto={texto} apretado={false} />
    </div>
  )
}

function Titulo ({ texto, completo, apretado }: {
  texto: string | null
  completo: string | null
  apretado: boolean
}): ReactNode {
  if (texto === null || texto === '') return null

  return (
    <p
      className="text-texto leading-tight font-bold text-balance"
      style={{ fontSize: escalaDelTitulo(texto.length, completo?.length ?? 0, apretado) }}
    >
      {texto}
    </p>
  )
}

function Cuerpo ({ texto, apretado }: { texto: string | null, apretado: boolean }): ReactNode {
  if (texto === null || texto === '') return null

  return (
    <p
      className="text-texto-tenue leading-snug text-pretty"
      style={{ fontSize: escalaDelCuerpo(texto.length, apretado) }}
    >
      {texto}
    </p>
  )
}

/**
 * De cuantos `vmin` sale el titulo, segun lo que haya que meter en la pantalla.
 *
 * === POR QUE LA LETRA CAMBIA DE TAMAÑO Y NO ES FIJA ===
 *
 * El resto de la pantalla tiene una escala de tres cuerpos y no se mueve, porque son tablas: la fila
 * mide lo que mide y lo que sobra se recorta con puntos suspensivos. Un anuncio no se puede recortar —
 * un aviso que dice "El lunes no se tra…" no es un aviso— y llega con entre cinco y mil doscientos
 * caracteres, decididos por quien lo escribio. La unica forma de que quepa entero **y** sea lo mas
 * grande posible es que el cuerpo dependa del largo.
 *
 * Los cortes salen de medir contra la banda util: en una pared apaisada entran unos 42 caracteres por
 * linea a 9vmin y unos 106 a 3vmin, y con el tope de 1200 caracteres de la API el escalon mas chico
 * deja el texto mas largo posible dentro de la pantalla con sitio de sobra. `apretado` es el caso de la
 * columna de al lado de una foto, que tiene la mitad del ancho: todo baja un escalon.
 *
 * El piso no baja de 3vmin aunque el texto sea larguisimo: por debajo de eso no se lee a cuatro metros,
 * y `pruebas/pantalla-area.browser.mjs` mide las dos cosas —que nada se salga del marco y que no
 * aparezca texto por debajo del piso tipografico—, que es lo que hace que esta funcion no pueda
 * resolver un desborde achicando la letra hasta que no se lea.
 *
 * @param largo     cuantos caracteres tiene el titulo
 * @param largoTexto cuantos tiene el texto que lo acompaña, 0 si no hay
 * @param apretado  si comparte la pantalla con una foto
 * @returns el cuerpo listo para un `style`, en `vmin`
 */
function escalaDelTitulo (largo: number, largoTexto: number, apretado: boolean): string {
  const total = largo + largoTexto
  const base = total <= 80 ? 9 : total <= 240 ? 7 : 5.5

  return `${apretado ? base * 0.72 : base}vmin`
}

/**
 * De cuantos `vmin` sale el texto de apoyo. Mismo criterio que `escalaDelTitulo`.
 *
 * @param largo    cuantos caracteres tiene
 * @param apretado si comparte la pantalla con una foto
 * @returns el cuerpo listo para un `style`, en `vmin`
 */
function escalaDelCuerpo (largo: number, apretado: boolean): string {
  const base = largo <= 120 ? 5.5 : largo <= 400 ? 4.2 : 3

  return `${apretado ? Math.max(base * 0.75, 3) : base}vmin`
}
