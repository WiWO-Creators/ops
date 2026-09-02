'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ControlesTabla, PaginacionTabla } from '@/componentes/datos/ControlesTabla'
import { clavesVisiblesPorDefecto } from '@/componentes/datos/tabla'
import { retrasoDeAparicion } from '@/componentes/datos/TablaRecurso'
import { Vacio } from '@/componentes/estado/Estados'
import { CargandoConOrbe } from '@/componentes/estado/Orbe'
import { Boton } from '@/componentes/formularios/Boton'
import { Segmentado, type OpcionSegmentada } from '@/componentes/formularios/Segmentado'
import { FormularioRecurso } from '@/componentes/proyecto/FormularioRecurso'
import type { OpcionCampo } from '@/componentes/proyecto/formulario'
import { GLOSARIO } from '@/dominio/glosario'
import { construirConsulta, leerConsulta } from '@/datos/consulta'
import type { Cliente } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import { CLIENTES } from '@/definiciones/clientes'
import type { EstadoConsulta, OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'
import { cn } from '@/lib/clases'
import { camposDeCliente } from './campos'
import { TablaClientes } from './TablaClientes'
import { TarjetaCliente } from './TarjetaCliente'

/**
 * Listado de Clientes en tabla o en tarjetas.
 *
 * Es el mismo patron que `/espacios` (`TarjetasProyectos.tsx`), a proposito: el control de vista, la
 * clave de la URL (`?vista=`) y el orden de las opciones son identicos, asi que cambiar de pantalla no
 * obliga a releer el control. Nada de esto reimplementa el motor: la consulta se lee y se arma con
 * `leerConsulta` / `construirConsulta`, los controles son `ControlesTabla` y el paginador
 * `PaginacionTabla`. Lo unico propio es como se pinta cada fila.
 *
 * **No hay pastillas de estado.** `/espacios` las tiene porque el backend expone `GET /projects/stats`
 * con el conteo por estado; para clientes no existe un equivalente (ver `V1.php`,
 * `recursoClientesRuta`), y contar los `active` de la pagina visible seria dar por total lo que es una
 * pagina de veinticinco.
 *
 * Como en Espacios, la vista de tarjetas no pide la pagina desde el navegador: al escribir la consulta
 * en la URL, Next vuelve a ejecutar la pagina de servidor y baja las filas ya resueltas.
 */

export type PresentacionCliente = 'tarjetas' | 'tabla'

const VISTAS: readonly OpcionSegmentada[] = [
  // `tabla` primero aunque no sea la de por defecto en Espacios: el control arranca por la misma
  // opcion en todo el producto. Aca la de por defecto SI es tabla — ver `vistaInicial`.
  { valor: 'tabla', etiqueta: 'Tabla', icono: 'tabla' },
  { valor: 'tarjetas', etiqueta: 'Tarjetas', icono: 'tarjetas' }
]

interface PropsVistaClientes {
  /** Pagina ya resuelta en el servidor para la consulta que dice la URL. */
  inicial: ResultadoLista<Cliente>
  capacidades?: Capacidad[]
  opcionesDeFiltro?: Record<string, OpcionFiltro[]>
  /** Vista que pedia la URL al entrar. Por defecto, tabla. */
  vistaInicial: PresentacionCliente
  /** Catalogo `countries` de `GET /lookups`, para el formulario de alta. */
  paises: OpcionCampo[]
  /** Catalogo `currencies`. */
  monedas: OpcionCampo[]
}

/**
 * El listado con su alternador de presentacion.
 *
 * La vista vive en la URL y en ningun otro lado: asi un enlace la conserva. El motor de tabla
 * preserva los parametros que no son suyos al filtrar, de modo que filtrar dentro de la tabla ya no
 * devuelve a las tarjetas.
 *
 * A diferencia de Espacios, la vista por defecto es **tabla**: un cliente se busca por RUT o por
 * teléfono, y esas dos comparaciones se hacen en columnas, no en tarjetas.
 */
export function VistaClientes ({
  inicial,
  capacidades = [],
  opcionesDeFiltro,
  vistaInicial,
  paises,
  monedas
}: PropsVistaClientes) {
  const router = useRouter()
  const params = useSearchParams()
  const [creando, setCreando] = useState(false)
  const vista: PresentacionCliente = params.get('vista') === 'tarjetas' ? 'tarjetas' : vistaInicial

  /** Cambia de presentacion conservando filtros, orden y pagina. */
  function cambiarVista (elegida: PresentacionCliente): void {
    const query = new URLSearchParams(params.toString())
    query.set('vista', elegida)

    router.replace(`?${query.toString()}`, { scroll: false })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmentado
          etiqueta="Presentación del listado"
          opciones={VISTAS}
          activo={vista}
          onElegir={(valor) => { cambiarVista(valor as PresentacionCliente) }}
        />

        {capacidades.includes('create') && (
          <Boton tamano="chico" variante="primario" onClick={() => { setCreando(true) }}>
            Nuevo {GLOSARIO.cliente.singular.toLowerCase()}
          </Boton>
        )}
      </div>

      {vista === 'tabla'
        ? (
          <TablaClientes
            inicial={inicial}
            capacidades={capacidades}
            opcionesDeFiltro={opcionesDeFiltro}
          />
          )
        : <TarjetasClientes resultado={inicial} opcionesDeFiltro={opcionesDeFiltro} />}

      {capacidades.includes('create') && (
        <FormularioRecurso
          abierto={creando}
          onAbiertoCambia={setCreando}
          titulo={`Nuevo ${GLOSARIO.cliente.singular.toLowerCase()}`}
          descripcion="El contacto se agrega después, desde la ficha del cliente."
          campos={camposDeCliente(paises, monedas)}
          ruta="clients"
          metodo="POST"
          onGuardado={() => { router.refresh() }}
          columnas={2}
          ancho="grande"
        />
      )}
    </div>
  )
}

/**
 * Grilla de tarjetas de Cliente, con los mismos controles y paginador que la tabla.
 *
 * @param resultado filas y paginacion de la pagina vigente
 * @param opcionesDeFiltro catalogos de `/lookups`, para los filtros
 */
function TarjetasClientes ({
  resultado,
  opcionesDeFiltro
}: {
  resultado: ResultadoLista<Cliente>
  opcionesDeFiltro?: Record<string, OpcionFiltro[]>
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [pendiente, iniciarTransicion] = useTransition()

  // `ControlesTabla` incluye el selector de columnas, que en tarjetas no cambia nada: se le pasa el
  // estado igual porque el control es del motor y no se toca desde aca.
  const [visibles, setVisibles] = useState(() => clavesVisiblesPorDefecto(CLIENTES.columnas))

  const estado = useMemo(
    () => leerConsulta(new URLSearchParams(params.toString()), CLIENTES),
    [params]
  )

  /**
   * Aplica un cambio parcial de la consulta escribiendolo en la URL, igual que el motor de tabla.
   *
   * `replace` y no `push`: cada filtro seria una entrada del historial. La transicion mantiene la
   * grilla anterior en pantalla mientras el servidor resuelve la nueva pagina, en vez de vaciarla.
   */
  function cambiar (parcial: Partial<EstadoConsulta>): void {
    const query = new URLSearchParams(construirConsulta({ ...estado, ...parcial }, CLIENTES))
    query.set('vista', 'tarjetas')

    iniciarTransicion(() => { router.replace(`?${query.toString()}`, { scroll: false }) })
  }

  return (
    <div className="flex flex-col gap-3">
      <ControlesTabla
        definicion={CLIENTES}
        estado={estado}
        visibles={visibles}
        opcionesDeFiltro={opcionesDeFiltro}
        onCambiar={cambiar}
        onVisibles={setVisibles}
        sinColumnas
      />

      {resultado.filas.length === 0
        ? (
          <Vacio
            titulo={`No hay ${CLIENTES.titulo.plural.toLowerCase()}`}
            descripcion="Probá quitando filtros o buscando otra cosa."
          />
          )
        : (
          <div className="relative" aria-busy={pendiente}>
            {/* Igual que en la tabla: refrescar atenua las tarjetas viejas en vez de taparlas, y el
                aviso va en un chip sobre la esquina. Sin indicador, la atenuacion se lee como un fallo. */}
            {pendiente && <CargandoConOrbe mensaje="Actualizando…" className="absolute right-2 top-2 z-10" />}
            <ul
              className={cn(
                'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3',
                pendiente && 'opacity-60 transition-opacity'
              )}
            >
              {/* El escalonado es del montaje: el `key` por id hace que un refresco reutilice los
                  mismos `<li>`, asi que las tarjetas ya pintadas no vuelven a entrar. */}
              {resultado.filas.map((cliente, indice) => (
                <li
                  key={cliente.id}
                  className="animate-entrar-abajo flex"
                  style={{ animationDelay: retrasoDeAparicion(indice) }}
                >
                  <TarjetaCliente cliente={cliente} className="w-full" />
                </li>
              ))}
            </ul>
          </div>
          )}

      <PaginacionTabla paginacion={resultado.paginacion} onCambiar={cambiar} />
    </div>
  )
}
