'use client'

import { useState, type ReactElement } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { pedirSobre } from '@/datos/cliente'
import { Vacio } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { FormularioRecurso } from '@/componentes/proyecto/FormularioRecurso'
import type { CampoFormulario } from '@/componentes/proyecto/formulario'
import type { CategoriaMotivo, MotivoIteracion } from '@/datos/recursos'

/**
 * El catálogo de motivos de iteración, administrable.
 *
 * Es lo que convierte al catálogo en cerrado *para quien registra* y abierto *para quien lo
 * administra*. Sin esta pantalla la lista sería una constante en el código y cambiarla costaría un
 * despliegue, que es exactamente lo que el pedido excluye.
 *
 * **La lista que se ve al principio es provisional.** La sembró la migración `0681` derivándola de
 * los motivos que ya existían en la base, porque el negocio todavía no entregó la suya (decisión 5
 * del documento del 15/09). Cada motivo sembrado se muestra marcado, y el aviso de arriba dice que
 * se puede reemplazar entero: es información que quien administra necesita antes de armar un
 * reporte sobre estos datos.
 *
 * **Un motivo no se borra nunca: se desactiva.** La API no tiene borrado real —su `DELETE` escribe
 * `activo = 0` y devuelve el motivo— porque un motivo que alguna iteración usó dejaría el histórico
 * sin categoría justo en el reporte que se arma para discutir retrabajo con el cliente. Por eso esta
 * pantalla ofrece un solo botón y no dos: uno que dijera "Borrar" y dejara la fila viva al recargar
 * sería una mentira sobre lo que acaba de pasar. Desactivar saca el motivo del formulario de
 * iteraciones y lo deja legible donde ya se eligió, que es lo que casi siempre se quiere.
 */

/** Las tres categorías, en el orden en que se leen: de lo que depende de nosotros a lo que no. */
const CATEGORIAS: Array<{ valor: CategoriaMotivo, etiqueta: string, explicacion: string }> = [
  {
    valor: 'error_evitable',
    etiqueta: 'Error evitable',
    explicacion: 'El trabajo tuvo que rehacerse por algo que estaba a la vista.'
  },
  {
    valor: 'ajuste_de_contenido',
    etiqueta: 'Ajuste de contenido',
    explicacion: 'El alcance es el mismo; cambió una preferencia sobre lo entregado.'
  },
  {
    valor: 'cambio_de_alcance',
    etiqueta: 'Cambio de alcance',
    explicacion: 'Apareció trabajo que no estaba pedido.'
  }
]

const CAMPOS: CampoFormulario[] = [
  { clave: 'name', etiqueta: 'Motivo', tipo: 'texto', requerido: true, maximo: 160 },
  {
    clave: 'category',
    etiqueta: 'Categoría',
    tipo: 'seleccion',
    requerido: true,
    opciones: CATEGORIAS.map((categoria) => ({ valor: categoria.valor, etiqueta: categoria.etiqueta })),
    ayuda: 'Es lo que permite separar el retrabajo que se pudo evitar del que pidió el cliente.'
  },
  {
    clave: 'description',
    etiqueta: 'Cuándo elegirlo',
    tipo: 'area',
    maximo: 255,
    sinAsistenteIa: true,
    ayuda: 'Una línea para que dos personas elijan el mismo motivo ante el mismo caso.'
  }
]

/** La ruta con los desactivados incluidos: sin ellos no habria forma de volver a activarlos. */
const RUTA_CON_INACTIVOS = 'motivos-iteracion?incluir_inactivos=1'

export function MotivosDeIteracion ({ inicial }: { inicial: MotivoIteracion[] }): ReactElement {
  const [motivos, setMotivos] = useState<MotivoIteracion[]>(inicial)
  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState<MotivoIteracion | null>(null)
  const [fallo, setFallo] = useState<string | null>(null)
  const [enCurso, setEnCurso] = useState<number | null>(null)

  /**
   * Vuelve a pedir el catálogo entero.
   *
   * Se repite la lista completa en vez de parchear la fila tocada porque el orden lo decide el
   * servidor (`orden`, después nombre) y un alta puede caer en cualquier posición.
   */
  async function recargar (): Promise<void> {
    try {
      const sobre = await pedirSobre<MotivoIteracion[]>(RUTA_CON_INACTIVOS, new AbortController().signal)

      setMotivos(sobre.data)
      setFallo(null)
    } catch (error: unknown) {
      // La escritura ya entro: lo que fallo es volver a leer. Se avisa sin borrar lo que hay en
      // pantalla, que sigue siendo valido salvo por la fila que se acaba de tocar.
      setFallo(error instanceof Error
        ? error.message
        : 'Se guardó, pero no se pudo recargar el catálogo. Refrescá la página.')
    }
  }

  /** Enciende o apaga un motivo. Nunca lanza: el fallo se lee arriba de la tabla. */
  async function alternar (motivo: MotivoIteracion): Promise<void> {
    setFallo(null)
    setEnCurso(motivo.id)

    const resultado = await escribirEnBff<MotivoIteracion>(
      `motivos-iteracion/${encodeURIComponent(String(motivo.id))}`,
      'PATCH',
      { active: !motivo.active }
    )

    setEnCurso(null)

    if (!resultado.ok) {
      setFallo(resultado.mensaje)
      return
    }

    setMotivos((lista) => lista.map((fila) => fila.id === motivo.id ? resultado.datos : fila))
  }


  const hayProvisionales = motivos.some((motivo) => motivo.provisional)

  return (
    <div className="flex flex-col gap-4">
      {hayProvisionales && (
        <p className="border-linea bg-superficie-elevada text-texto-tenue rounded-tarjeta border p-3 text-sm">
          <strong className="text-texto">Esta lista es provisional.</strong> La sembró el equipo de
          desarrollo a partir de los motivos que ya estaban escritos en las iteraciones, para que la
          función se pueda usar desde el primer día. En cuanto el negocio defina la suya, se reemplaza
          desde acá: no hace falta desplegar nada.
        </p>
      )}

      <div className="flex items-center justify-end">
        <Boton variante="primario" tamano="chico" onClick={() => { setCreando(true) }}>
          Nuevo motivo
        </Boton>
      </div>

      {fallo !== null && <p className="text-peligro text-sm" role="alert">{fallo}</p>}

      {motivos.length === 0
        ? (
          <Vacio
            titulo="El catálogo está vacío"
            descripcion="Sin motivos, el formulario de iteraciones vuelve a pedir el motivo escrito a mano y no hay forma de agruparlas."
            accion={<Boton variante="primario" tamano="chico" onClick={() => { setCreando(true) }}>Nuevo motivo</Boton>}
          />
          )
        : (
          <div className="border-linea rounded-tarjeta overflow-x-auto border">
            <table className="w-full text-sm">
              <thead className="bg-superficie-elevada text-texto-tenue">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Motivo</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Categoría</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Cuándo elegirlo</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-linea-suave divide-y">
                {motivos.map((motivo) => (
                  <tr key={motivo.id} className={motivo.active ? '' : 'opacity-60'}>
                    <td className="px-3 py-2">
                      <span className="text-texto">{motivo.name}</span>
                      {motivo.provisional && (
                        <span className="text-texto-sutil ml-2 text-xs">provisional</span>
                      )}
                      {!motivo.active && (
                        <span className="text-texto-sutil ml-2 text-xs">desactivado</span>
                      )}
                    </td>
                    <td className="text-texto-tenue px-3 py-2">{motivo.category_label}</td>
                    <td className="text-texto-sutil px-3 py-2">{motivo.description ?? ''}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Boton
                          variante="sutil"
                          tamano="chico"
                          onClick={() => { setEditando(motivo) }}
                        >
                          Editar
                        </Boton>
                        <Boton
                          variante="sutil"
                          tamano="chico"
                          cargando={enCurso === motivo.id}
                          onClick={() => { void alternar(motivo) }}
                        >
                          {motivo.active ? 'Desactivar' : 'Activar'}
                        </Boton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}

      <dl className="text-texto-sutil flex flex-col gap-1 text-xs">
        {CATEGORIAS.map((categoria) => (
          <div key={categoria.valor} className="flex gap-2">
            <dt className="text-texto-tenue shrink-0 font-medium">{categoria.etiqueta}:</dt>
            <dd>{categoria.explicacion}</dd>
          </div>
        ))}
      </dl>

      <FormularioRecurso
        abierto={creando}
        onAbiertoCambia={setCreando}
        titulo="Nuevo motivo de iteración"
        descripcion="Aparece en el formulario de iteraciones de toda la empresa."
        campos={CAMPOS}
        ruta="motivos-iteracion"
        metodo="POST"
        ancho="chico"
        onGuardado={() => { void recargar() }}
      />

      <FormularioRecurso
        abierto={editando !== null}
        onAbiertoCambia={(abierto) => { if (!abierto) setEditando(null) }}
        titulo="Editar motivo"
        descripcion="Cambiar la categoría cambia cómo se agrupan las iteraciones que ya lo eligieron."
        campos={CAMPOS}
        ruta={editando === null ? 'motivos-iteracion' : `motivos-iteracion/${encodeURIComponent(String(editando.id))}`}
        metodo="PATCH"
        registro={editando === null ? null : { ...editando }}
        ancho="chico"
        onGuardado={() => { setEditando(null); void recargar() }}
      />
    </div>
  )
}
