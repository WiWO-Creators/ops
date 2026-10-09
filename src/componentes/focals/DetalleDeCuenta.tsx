'use client'

import Link from 'next/link'
import { CLASES_DE_ENLACE_DE_FICHA, EnlaceDeFicha } from './EnlaceDeFicha'
import { FilaEspacio, ProyectoUnico, type EstadosRedactados } from './FilaEspacio'
import { EnlaceCliente } from '@/componentes/presentadores/EnlaceCliente'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { DesgloseSenales, Puntaje } from '@/componentes/clientes/SemaforoCliente'
import {
  nombresDeFocales,
  rutaDeFocalesDelCliente,
  type CuentaFocal,
  type EstadoDeSalud,
  type ScoreEspacio
} from '@/datos/focals'
import type { ScoreCliente } from '@/datos/recursos'
import { EXPLICACION_DE_FORMULA, esProyectoUnico, nombreDeCuenta } from '@/dominio/cartera'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'

interface PropsDetalle {
  cuenta: CuentaFocal
  mostrarFocal: boolean
  /** Los párrafos redactados en esta sesión; mandan sobre el que trajo el servidor. */
  estados: EstadosRedactados
  onEstado: (proyecto: number, estado: EstadoDeSalud) => void
  /** Los Proyectos que hicieron aparecer a esta cuenta en la búsqueda; marcados en la lista. */
  coincidencias: readonly number[]
}

/**
 * El detalle de una cuenta, para el panel lateral: su puntaje, por qué lo tiene y sus Proyectos.
 *
 * Vive en un panel y no debajo de la fila: abierto en la lista empuja a las demás cuentas fuera de la
 * pantalla, y comparar una con otra obligaba a abrir y cerrar. En el panel la lista no se mueve.
 *
 * @param cuenta la cuenta con sus Proyectos
 * @param mostrarFocal si la pantalla es la cartera entera, y por tanto hay que poder nombrar al focal
 * @param estados los estados redactados en esta sesión, por Proyecto
 * @param onEstado recibe un estado recién redactado, para que el panel lo conserve
 * @param coincidencias los Proyectos que coincidieron con la búsqueda
 */
export function DetalleDeCuenta ({ cuenta, mostrarFocal, estados, onEstado, coincidencias }: PropsDetalle) {
  const { cliente, espacios } = cuenta
  const nombre = nombreDeCuenta(cuenta)
  const proyectoUnico = esProyectoUnico(cuenta)

  return (
    <div className="flex flex-col gap-5">
      <Puntaje score={cliente.score} semaforo={cliente.semaforo} variacion={cliente.variacion} />

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-texto-tenue text-xs antetitulo">Por qué el cliente tiene ese puntaje</h3>

          <EnlaceDeFicha etiqueta="Ficha del cliente">
            <EnlaceCliente id={cliente.client_id} nombre={nombre} className={CLASES_DE_ENLACE_DE_FICHA} />
          </EnlaceDeFicha>
        </div>

        <DesgloseSenales senales={cliente.senales} />
        <p className="text-texto-tenue text-xs">{EXPLICACION_DE_FORMULA}</p>
        {mostrarFocal && nombresDeFocales(cliente).length === 0 && <SinFocalAccion clienteId={cliente.client_id} />}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-texto-tenue text-xs antetitulo">
          {proyectoUnico === null
            ? `Sus ${GLOSARIO.espacio.plural.toLowerCase()}`
            : `Su ${GLOSARIO.espacio.singular.toLowerCase()}`}
        </h3>
        <ListaEspacios
          espacios={espacios}
          proyectoUnico={proyectoUnico}
          estados={estados}
          onEstado={onEstado}
          coincidencias={coincidencias}
        />
      </section>
    </div>
  )
}

/**
 * "Ana Pérez" (la columna ya se llama Focal), o la falta de focal dicha con todas las letras.
 *
 * Solo aparece en la cartera entera. Sin este renglón la pantalla de una gerencia es una lista de
 * clientes ordenada por puntaje y nada más: sirve para ver qué está mal, no para saber con quién
 * hablarlo, que es la mitad de la pregunta.
 *
 * Una cuenta sin focal se dibuja como tal —y no se omite el renglón— porque es justamente el caso
 * que hay que ver: un cliente del que nadie responde no tiene a quién reclamarle el rojo. Por eso
 * lleva tono de aviso y el resto de las cuentas, sólo el nombre en gris: lo que hay que encontrar
 * acá es la ausencia.
 */
export function QuienResponde ({ cliente }: { cliente: ScoreCliente }) {
  const nombres = nombresDeFocales(cliente)
  const focal = GLOSARIO.focal.singular

  if (nombres.length === 0) {
    return (
      <Insignia tono="aviso" tamano="chico" className="self-start">
        Sin {focal.toLowerCase()}
      </Insignia>
    )
  }

  return (
    <span className="text-texto block max-w-56 truncate text-sm">{nombres.join(', ')}</span>
  )
}

/** Los {@link GLOSARIO.espacio} de una cuenta, del peor al mejor. */
function ListaEspacios (
  { espacios, proyectoUnico, estados, onEstado, coincidencias }: {
    espacios: ScoreEspacio[]
    /** El Proyecto cuyo desglose ya se mostró en la cuenta; con él no hay lista que desplegar. */
    proyectoUnico: ScoreEspacio | null
    estados: EstadosRedactados
    onEstado: (proyecto: number, estado: EstadoDeSalud) => void
    coincidencias: readonly number[]
  }
) {
  if (espacios.length === 0) {
    return (
      <p className="text-texto-tenue text-sm">
        Este cliente no tiene ningún {GLOSARIO.espacio.singular.toLowerCase()}, así que no hay nada
        que puntuar acá abajo.
      </p>
    )
  }

  if (proyectoUnico !== null) {
    return (
      <ProyectoUnico
        espacio={proyectoUnico}
        estado={estados[proyectoUnico.project_id] ?? proyectoUnico.estado}
        onEstado={onEstado}
        coincide={coincidencias.includes(proyectoUnico.project_id)}
      />
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {espacios.map((espacio) => (
        <li key={espacio.project_id}>
          <FilaEspacio
            espacio={espacio}
            estado={estados[espacio.project_id] ?? espacio.estado}
            onEstado={onEstado}
            coincide={coincidencias.includes(espacio.project_id)}
          />
        </li>
      ))}
    </ul>
  )
}

/**
 * Lo que se puede hacer con una cuenta de la que nadie responde: ir a nombrar al focal.
 *
 * Es un enlace dentro del detalle y no en la insignia de la fila porque la fila entera es un botón y
 * un enlace adentro de un botón no es HTML válido.
 *
 * @param clienteId el cliente sin focal
 */
function SinFocalAccion ({ clienteId }: { clienteId: number }) {
  return (
    <p className="text-texto-tenue flex flex-wrap items-center gap-x-2 text-sm">
      Nadie responde por esta cuenta.
      <Link
        href={rutaDeFocalesDelCliente(clienteId)}
        className={cn(CLASES_DE_ENLACE_DE_FICHA, 'pointer-coarse:flex pointer-coarse:min-h-11 pointer-coarse:items-center')}
      >
        Asignar {GLOSARIO.focal.singular.toLowerCase()}
      </Link>
    </p>
  )
}
