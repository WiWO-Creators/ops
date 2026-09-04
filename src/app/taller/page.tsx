'use client'

import { useState } from 'react'
import { Muestra, SeccionTaller } from '@/componentes/estructura/Muestra'
import { Boton } from '@/componentes/formularios/Boton'
import { Segmentado, type OpcionSegmentada } from '@/componentes/formularios/Segmentado'
import { Cargando, ErrorEstado, SinPermiso, Vacio } from '@/componentes/estado/Estados'
import { Avatar, GrupoAvatares } from '@/componentes/presentadores/Avatar'
import { Etiquetas } from '@/componentes/presentadores/Etiqueta'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { CargandoConOrbe, Orbe, SuperposicionOrbe } from '@/componentes/estado/Orbe'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto, Entrada } from '@/componentes/formularios/Entrada'
import {
  ContenidoSelector, DisparadorSelector, Opcion, Selector
} from '@/componentes/formularios/Selector'
import {
  CerrarDialogo, ContenidoDialogo, Dialogo, DisparadorDialogo
} from '@/componentes/superposiciones/Dialogo'
import { Cajon, ContenidoCajon, DisparadorCajon } from '@/componentes/superposiciones/Cajon'
import {
  ContenidoMenu, DisparadorMenu, ItemMenu, MenuContextual, SeparadorMenu
} from '@/componentes/superposiciones/MenuContextual'
import {
  CeldaEncabezado, CeldaTabla, CuerpoTabla, EncabezadoTabla, FilaTabla, Tabla
} from '@/componentes/datos/Tabla'
import { nombrar } from '@/dominio/glosario'

/** Estados de Proceso tal como los devuelve `lookups`, ordenados por `order` y no por `id`. */
const ESTADOS = [
  { id: 1, name: 'No iniciado', color: '#64748b' },
  { id: 4, name: 'En progreso', color: '#3b82f6' },
  { id: 3, name: 'En pruebas', color: '#0284c7' },
  { id: 2, name: 'Esperando respuesta', color: '#84cc16' },
  { id: 5, name: 'Completado', color: '#22c55e' }
]

/** Las tres lecturas de un listado, con los iconos que usa el producto. */
const VISTAS: readonly OpcionSegmentada[] = [
  { valor: 'tabla', etiqueta: 'Tabla', icono: 'tabla' },
  { valor: 'tablero', etiqueta: 'Tablero', icono: 'tablero' },
  { valor: 'tarjetas', etiqueta: 'Tarjetas', icono: 'tarjetas' }
]

/** La escala del Gantt: mismo control, sin iconos, porque cuatro duraciones no tienen dibujo. */
const ESCALAS: readonly OpcionSegmentada[] = [
  { valor: 'dia', etiqueta: 'Día' },
  { valor: 'semana', etiqueta: 'Semana' },
  { valor: 'mes', etiqueta: 'Mes' },
  { valor: 'anio', etiqueta: 'Año' }
]

const PERSONAS = [
  { id: 1, full_name: 'Ana Ríos' },
  { id: 2, full_name: 'Bruno Cabral' },
  { id: 3, full_name: 'Carla Méndez' },
  { id: 4, full_name: 'Diego Sosa' },
  { id: 5, full_name: 'Elena Paz' }
]

export default function TallerPage () {
  const [vista, setVista] = useState('tabla')
  const [escala, setEscala] = useState('semana')

  return (
    <>
      <SeccionTaller
        titulo="Insignia"
        nota="Estado, prioridad o categoría. Cuando el color viene de la base se pinta como punto y el fondo queda neutro: los colores de estado de Perfex fueron elegidos para puntos de 8 px en Bootstrap 3, no para contrastar contra texto."
      >
        <Muestra etiqueta="tono">
          <Insignia tono="neutro">Neutro</Insignia>
          <Insignia tono="acento">Acento</Insignia>
          <Insignia tono="exito">Completado</Insignia>
          <Insignia tono="aviso">Vence hoy</Insignia>
          <Insignia tono="peligro">Vencido</Insignia>
          <Insignia tono="contorno">Contorno</Insignia>
        </Muestra>
        <Muestra etiqueta="color de la base">
          {ESTADOS.map((estado) => (
            <Insignia key={estado.id} color={estado.color}>{estado.name}</Insignia>
          ))}
        </Muestra>
        <Muestra etiqueta="tamaño">
          <Insignia tamano="chico">Chico</Insignia>
          <Insignia tamano="medio">Medio</Insignia>
        </Muestra>
      </SeccionTaller>

      <SeccionTaller
        titulo="Avatar"
        nota="Sin foto, las iniciales sobre un color derivado del nombre: el mismo nombre da siempre el mismo color, sin guardar nada. La luminosidad es fija, así que todos contrastan igual."
      >
        <Muestra etiqueta="tamaño">
          <Avatar nombre="Ana Ríos" tamano="chico" />
          <Avatar nombre="Ana Ríos" tamano="medio" />
          <Avatar nombre="Ana Ríos" tamano="grande" />
        </Muestra>
        <Muestra etiqueta="nombres distintos">
          {PERSONAS.map((persona) => (
            <Avatar key={persona.id} nombre={persona.full_name} />
          ))}
        </Muestra>
        <Muestra etiqueta="un solo nombre">
          <Avatar nombre="Ana" />
        </Muestra>
        <Muestra etiqueta="imagen rota">
          <Avatar nombre="Bruno Cabral" imagen="/no-existe.png" />
        </Muestra>
        <Muestra etiqueta="grupo con excedente">
          <GrupoAvatares personas={PERSONAS} />
        </Muestra>
        <Muestra etiqueta="grupo vacío">
          <GrupoAvatares personas={[]} />
        </Muestra>
      </SeccionTaller>

      <SeccionTaller
        titulo="Fecha"
        nota="La forma absoluta va visible y la relativa en el tooltip: en una tabla de plazos, “3 de septiembre” se compara entre filas y “en 2 semanas” no. Como vencimiento, el color se decide por día calendario."
      >
        <Muestra etiqueta="fecha sin hora">
          <Fecha valor="2026-09-03" />
        </Muestra>
        <Muestra etiqueta="instante con hora">
          <Fecha valor="2026-08-24T14:03:00Z" conHora />
        </Muestra>
        <Muestra etiqueta="vencimiento">
          <Fecha valor="2020-01-15" comoVencimiento />
          <Fecha valor="2030-06-01" comoVencimiento />
        </Muestra>
        <Muestra etiqueta="sin fecha">
          <Fecha valor={null} />
        </Muestra>
      </SeccionTaller>

      <SeccionTaller titulo="Etiquetas" nota="El excedente se resume en un contador para no romper el alto de la fila.">
        <Muestra etiqueta="pocas">
          <Etiquetas etiquetas={[{ id: 1, name: 'urgente' }, { id: 2, name: 'cliente-clave' }]} />
        </Muestra>
        <Muestra etiqueta="con excedente">
          <Etiquetas
            etiquetas={[
              { id: 1, name: 'urgente' },
              { id: 2, name: 'cliente-clave' },
              { id: 3, name: 'bloqueado' },
              { id: 4, name: 'diseño' }
            ]}
          />
        </Muestra>
      </SeccionTaller>

      <SeccionTaller
        titulo="Botón"
        nota="Mientras carga queda deshabilitado: sin eso, un doble clic en Guardar manda dos peticiones, y en creación eso son dos registros. El indicador es el orbe, no un borde girando: es el mismo lenguaje de “está pasando algo” en todo el producto."
      >
        <Muestra etiqueta="variante">
          <Boton variante="primario">Primario</Boton>
          <Boton variante="marca">Marca</Boton>
          <Boton variante="secundario">Secundario</Boton>
          <Boton variante="sutil">Sutil</Boton>
          <Boton variante="peligro">Peligro</Boton>
        </Muestra>
        <Muestra etiqueta="tamaño">
          <Boton tamano="chico">Chico</Boton>
          <Boton tamano="medio">Medio</Boton>
          <Boton tamano="grande">Grande</Boton>
        </Muestra>
        <Muestra etiqueta="cargando y deshabilitado">
          <Boton variante="primario" cargando>Guardando</Boton>
          <Boton variante="secundario" cargando soloIcono aria-label="Guardando">✓</Boton>
          <Boton disabled>Deshabilitado</Boton>
        </Muestra>
      </SeccionTaller>

      <SeccionTaller
        titulo="Segmentado"
        nota="El único control de cambio de vista del producto. Es un grupo de botones y no un tablist: las opciones son formas de leer los mismos datos, no paneles hermanos. Las flechas mueven el foco pero no eligen — elegir dispara una navegación, y recorrer cuatro escalas con la flecha lanzaría cuatro recargas antes de llegar a la que se quería."
      >
        <Muestra etiqueta="vistas (chico)">
          <Segmentado etiqueta="Presentación del listado" opciones={VISTAS} activo={vista} onElegir={setVista} />
        </Muestra>
        <Muestra etiqueta="vistas (medio)">
          <Segmentado etiqueta="Presentación del listado" tamano="medio" opciones={VISTAS} activo={vista} onElegir={setVista} />
        </Muestra>
        <Muestra etiqueta="sin iconos, etiqueta visible">
          <Segmentado etiqueta="Escala" etiquetaVisible opciones={ESCALAS} activo={escala} onElegir={setEscala} />
        </Muestra>
        <Muestra etiqueta="alineado con Botón">
          <Segmentado etiqueta="Presentación del listado" opciones={VISTAS} activo={vista} onElegir={setVista} />
          <Boton tamano="chico">Refrescar</Boton>
        </Muestra>
        <Muestra etiqueta="sin ninguna puesta">
          <Segmentado etiqueta="Escala" opciones={ESCALAS} activo={null} onElegir={setEscala} />
        </Muestra>
        <Muestra etiqueta="opciones que navegan">
          <Segmentado
            etiqueta="Presentación de tareas"
            activo="tabla"
            opciones={[
              { valor: 'tabla', etiqueta: 'Tabla', icono: 'tabla', href: '/procesos' },
              { valor: 'tablero', etiqueta: 'Tablero', icono: 'tablero', href: '/procesos/tablero' }
            ]}
          />
        </Muestra>
      </SeccionTaller>

      <SeccionTaller
        titulo="Estados"
        nota="Un vacío sin salida deja a la persona sin saber qué hacer. “Sin permiso” no ofrece reintentar, porque no hay nada que reintentar. Cargar se comunica de una sola forma en todo el producto: el orbe dentro de su ventana. La ventana recorta el halo —si no, se derrama sobre lo que tiene al lado— y su alto reserva el hueco del contenido que viene, para que la pantalla no salte al llegar."
      >
        <Muestra etiqueta="cargando: panel entero, sin mensaje" className="w-full">
          <Cargando alto="min-h-36" className="w-full" />
        </Muestra>
        <Muestra etiqueta="cargando: dentro de una tarjeta, con mensaje" className="w-full max-w-xs">
          <Cargando alto="min-h-40" mensaje="Cargando las tareas…" className="w-full" />
        </Muestra>
        <Muestra etiqueta="vacío" className="w-full">
          <Vacio
            titulo={`No hay ${nombrar('proceso', 2).toLowerCase()}`}
            descripcion="Cuando se cree el primero, aparece acá."
            accion={<Boton variante="primario" tamano="chico">Crear {nombrar('proceso').toLowerCase()}</Boton>}
            className="w-full"
          />
        </Muestra>
        <Muestra etiqueta="error" className="w-full">
          <ErrorEstado detalle="No se pudo conectar con la API." className="w-full" />
        </Muestra>
        <Muestra etiqueta="sin permiso" className="w-full">
          <SinPermiso className="w-full" />
        </Muestra>
      </SeccionTaller>

      <SeccionTaller
        titulo="Orbe"
        nota="El Thinking Orb, portado de neo.wiwo.me. No es una esfera con fondo: es un campo de luz cuyas capas se suman entre ellas, aisladas de lo que haya debajo, así que se ve igual sobre claro, sobre oscuro o sobre una imagen. El halo es lo que le recorta la silueta: mientras hay algo en curso, ese borde se deforma. La medida que se le pide es el hueco que ocupa, halo incluido. En reposo sólo respiran los tamaños que aparecen de a uno; el chico y el mediano se repiten por fila y por botón, así que ahí queda de verdad quieto y deformarse sigue significando “está pasando algo”."
      >
        <Muestra etiqueta="en reposo: quieto en chico y medio, respirando en grande y marca">
          <Orbe tamano="chico" />
          <Orbe tamano="medio" />
          <Orbe tamano="grande" />
          <Orbe tamano="marca" />
        </Muestra>
        <Muestra etiqueta="los siete estados">
          {(['idle', 'listening', 'thinking', 'generating', 'routing', 'success', 'error'] as const).map((estado) => (
            <span key={estado} className="flex flex-col items-center gap-2">
              <Orbe tamano="medio" estado={estado} />
              <span className="text-texto-sutil text-xs">{estado}</span>
            </span>
          ))}
        </Muestra>
        <Muestra etiqueta="carga en línea">
          <CargandoConOrbe mensaje="Guardando…" retardoMs={0} />
        </Muestra>
        <Muestra etiqueta="dentro de un botón: lo pone la prop cargando, no se arma a mano">
          <Boton variante="primario" cargando>Pensando</Boton>
        </Muestra>
        <Muestra etiqueta="superpuesto y acotado" className="w-full">
          <div className="border-linea rounded-tarjeta relative h-40 w-full overflow-hidden border">
            <p className="text-texto-sutil p-4 text-sm">
              La superposición se acota a este panel, no a la pantalla: la operación afecta a esto y no a todo.
            </p>
            <SuperposicionOrbe acotada mensaje="Pensando…" submensaje="La IA está mejorando tu texto" />
          </div>
        </Muestra>
      </SeccionTaller>

      <SeccionTaller
        titulo="Formularios"
        nota="Los controles son de radio chico y los botones son píldora: ese contraste es una decisión de Neo, y es lo que separa visualmente “acción” de “dato”."
      >
        <Muestra etiqueta="campo con ayuda" className="w-full max-w-sm">
          <Campo etiqueta="Nombre" ayuda="Como aparecerá en la lista." requerido className="w-full">
            {(props) => <Entrada placeholder="Revisar el contrato" {...props} />}
          </Campo>
        </Muestra>
        <Muestra etiqueta="campo con error" className="w-full max-w-sm">
          <Campo etiqueta="Correo" error="Ese correo ya está en uso." className="w-full">
            {(props) => <Entrada defaultValue="ana@wiwo.me" {...props} />}
          </Campo>
        </Muestra>
        <Muestra etiqueta="área de texto" className="w-full max-w-sm">
          <Campo etiqueta="Descripción" className="w-full">
            {(props) => <AreaTexto placeholder="Crece con lo que escribas" {...props} />}
          </Campo>
        </Muestra>
        <Muestra etiqueta="selector" className="w-full max-w-sm">
          <Campo etiqueta="Prioridad" className="w-full">
            {(props) => (
              <Selector>
                <DisparadorSelector marcador="Elige una" id={props.id} />
                <ContenidoSelector>
                  <Opcion value="1">Baja</Opcion>
                  <Opcion value="2">Media</Opcion>
                  <Opcion value="3">Alta</Opcion>
                  <Opcion value="4">Urgente</Opcion>
                </ContenidoSelector>
              </Selector>
            )}
          </Campo>
        </Muestra>
        <Muestra etiqueta="deshabilitado" className="w-full max-w-sm">
          <Entrada disabled defaultValue="No se puede editar" />
        </Muestra>
      </SeccionTaller>

      <SeccionTaller
        titulo="Superposiciones"
        nota="Sobre Radix: el manejo de foco, el cierre con Escape y el aria son exactamente el trabajo que no conviene reimplementar. Ninguna usa backdrop-filter, salvo la del orbe, que es transitoria."
      >
        <Muestra etiqueta="diálogo">
          <Dialogo>
            <DisparadorDialogo asChild>
              <Boton variante="primario">Abrir diálogo</Boton>
            </DisparadorDialogo>
            <ContenidoDialogo
              titulo={`Crear ${nombrar('proceso').toLowerCase()}`}
              descripcion="Sólo lo obligatorio; el resto se completa en el detalle."
            >
              <div className="flex flex-col gap-4">
                <Campo etiqueta="Nombre" requerido>
                  {(props) => <Entrada placeholder="Revisar el contrato" {...props} />}
                </Campo>
                <div className="flex justify-end gap-2">
                  <CerrarDialogo asChild>
                    <Boton variante="sutil">Cancelar</Boton>
                  </CerrarDialogo>
                  <CerrarDialogo asChild>
                    <Boton variante="primario">Crear</Boton>
                  </CerrarDialogo>
                </div>
              </div>
            </ContenidoDialogo>
          </Dialogo>
        </Muestra>
        <Muestra etiqueta="cajón (lateral en escritorio, hoja en móvil)">
          <Cajon>
            <DisparadorCajon asChild>
              <Boton>Abrir cajón</Boton>
            </DisparadorCajon>
            <ContenidoCajon titulo="Detalle" descripcion="Se edita bloque a bloque, sin un envío de 200 campos.">
              <p className="text-texto-tenue text-sm">
                En pantallas angostas entra desde abajo: un panel de 448 px en un teléfono de 390 px no es
                un panel lateral.
              </p>
            </ContenidoCajon>
          </Cajon>
        </Muestra>
        <Muestra etiqueta="menú de acciones">
          <MenuContextual>
            <DisparadorMenu asChild>
              <Boton variante="secundario">Acciones</Boton>
            </DisparadorMenu>
            <ContenidoMenu>
              <ItemMenu>Marcar completado</ItemMenu>
              <ItemMenu>Duplicar</ItemMenu>
              <SeparadorMenu />
              <ItemMenu peligroso>Eliminar</ItemMenu>
            </ContenidoMenu>
          </MenuContextual>
        </Muestra>
      </SeccionTaller>

      <SeccionTaller
        titulo="Tabla"
        nota="Encabezado sin mayúsculas forzadas —Neo se las quita explícitamente a Bootstrap— y cifras de ancho fijo: sin eso una columna de importes baila al actualizarse, porque el 1 es más angosto que el 8."
      >
        <Muestra etiqueta="con columna numérica" className="w-full">
          <Tabla>
            <EncabezadoTabla>
              <tr>
                <CeldaEncabezado>{nombrar('proceso')}</CeldaEncabezado>
                <CeldaEncabezado>Estado</CeldaEncabezado>
                <CeldaEncabezado>Vence</CeldaEncabezado>
                <CeldaEncabezado numerica>Horas</CeldaEncabezado>
              </tr>
            </EncabezadoTabla>
            <CuerpoTabla>
              {[
                { id: 1, nombre: 'Revisar el contrato', estado: ESTADOS[1], vence: '2026-09-03', horas: '1.111,00' },
                { id: 2, nombre: 'Migrar los adjuntos', estado: ESTADOS[0], vence: '2020-01-15', horas: '88,50' },
                { id: 3, nombre: 'Publicar la guía', estado: ESTADOS[4], vence: null, horas: '8,00' }
              ].map((fila) => (
                <FilaTabla key={fila.id} interactiva>
                  <CeldaTabla>{fila.nombre}</CeldaTabla>
                  <CeldaTabla>
                    <Insignia color={fila.estado?.color}>{fila.estado?.name}</Insignia>
                  </CeldaTabla>
                  <CeldaTabla><Fecha valor={fila.vence} comoVencimiento /></CeldaTabla>
                  <CeldaTabla numerica>{fila.horas}</CeldaTabla>
                </FilaTabla>
              ))}
            </CuerpoTabla>
          </Tabla>
        </Muestra>
      </SeccionTaller>

      <SeccionTaller
        titulo="Glosario"
        nota="Ningún componente escribe estos nombres a mano: todos leen de src/dominio/glosario.ts, así que un renombre futuro es un archivo y no una búsqueda global."
      >
        <Muestra etiqueta="singular / plural">
          <span className="text-sm">
            {(['proceso', 'espacio', 'hito', 'automatizacion'] as const)
              .map((clave) => `${nombrar(clave)} · ${nombrar(clave, 2)}`)
              .join('   |   ')}
          </span>
        </Muestra>
      </SeccionTaller>
    </>
  )
}
