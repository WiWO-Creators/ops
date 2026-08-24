import { Muestra, SeccionTaller } from '@/componentes/estructura/Muestra'
import { Boton } from '@/componentes/formularios/Boton'
import { Cargando, ErrorEstado, SinPermiso, Vacio } from '@/componentes/estado/Estados'
import { Avatar, GrupoAvatares } from '@/componentes/presentadores/Avatar'
import { Etiquetas } from '@/componentes/presentadores/Etiqueta'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { nombrar } from '@/dominio/glosario'

/** Estados de Proceso tal como los devuelve `lookups`, ordenados por `order` y no por `id`. */
const ESTADOS = [
  { id: 1, name: 'No iniciado', color: '#64748b' },
  { id: 4, name: 'En progreso', color: '#3b82f6' },
  { id: 3, name: 'En pruebas', color: '#0284c7' },
  { id: 2, name: 'Esperando respuesta', color: '#84cc16' },
  { id: 5, name: 'Completado', color: '#22c55e' }
]

const PERSONAS = [
  { id: 1, full_name: 'Ana Ríos' },
  { id: 2, full_name: 'Bruno Cabral' },
  { id: 3, full_name: 'Carla Méndez' },
  { id: 4, full_name: 'Diego Sosa' },
  { id: 5, full_name: 'Elena Paz' }
]

export default function TallerPage () {
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
        nota="Mientras carga queda deshabilitado: sin eso, un doble clic en Guardar manda dos peticiones, y en creación eso son dos registros."
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
          <Boton disabled>Deshabilitado</Boton>
        </Muestra>
      </SeccionTaller>

      <SeccionTaller
        titulo="Estados"
        nota="Un vacío sin salida deja a la persona sin saber qué hacer. “Sin permiso” no ofrece reintentar, porque no hay nada que reintentar."
      >
        <Muestra etiqueta="cargando" className="w-full">
          <Cargando filas={3} className="w-full" />
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
        titulo="Glosario"
        nota="Ningún componente escribe estos nombres a mano: todos leen de src/dominio/glosario.ts, así que un renombre futuro es un archivo y no una búsqueda global."
      >
        <Muestra etiqueta="singular / plural">
          <span className="text-sm">
            {(['proceso', 'proyecto', 'espacio', 'hito', 'automatizacion'] as const)
              .map((clave) => `${nombrar(clave)} · ${nombrar(clave, 2)}`)
              .join('   |   ')}
          </span>
        </Muestra>
      </SeccionTaller>
    </>
  )
}
