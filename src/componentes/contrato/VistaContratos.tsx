'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { MenuAccionesFila } from '@/componentes/datos/MenuAccionesFila'
import { Boton } from '@/componentes/formularios/Boton'
import { FormularioRecurso } from '@/componentes/proyecto/FormularioRecurso'
import type { OpcionCampo } from '@/componentes/proyecto/formulario'
import { EnlaceCliente } from '@/componentes/presentadores/EnlaceCliente'
import { mensajeDeRespuesta } from '@/datos/cliente'
import type { AccesoContratos, Contrato } from '@/datos/recursos'
import type { OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'
import { CONTRATOS } from '@/definiciones/contratos'
import {
  camposDeAcceso,
  camposDeContrato,
  REGISTRO_NUEVO_CONTRATO,
  registroDeAcceso,
  registroDeContrato
} from './campos'

/**
 * Listado de contratos (WIW-0502).
 *
 * Quien llega aca ya paso la puerta de la API, y esa puerta es la seccion entera: todos pueden crear
 * y editar, asi que no hay capacidades que mirar. El superadmin ademas ve «Acceso», donde elige que
 * areas ven la seccion y si la ven los administradores.
 */
interface PropsVistaContratos {
  /** Primera pagina ya resuelta en el servidor: sin esto la tabla parpadearia al montar. */
  inicial: ResultadoLista<Contrato>
  opcionesDeFiltro: Record<string, OpcionFiltro[]>
  /** Clientes activos para el formulario. */
  clientes: OpcionCampo[]
  /** Tipos de contrato para el formulario. */
  tipos: OpcionCampo[]
  /** Configuracion de la puerta; solo llega si quien mira es superadmin. */
  acceso?: AccesoContratos
  /** Todas las areas del equipo, para el dialogo de acceso. */
  areas: OpcionCampo[]
}

/** El contrato que se esta editando y como recargar su pagina de la tabla al terminar. */
interface Edicion {
  contrato: Contrato
  recargar: () => void
}

export function VistaContratos ({ inicial, opcionesDeFiltro, clientes, tipos, acceso, areas }: PropsVistaContratos) {
  const router = useRouter()
  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState<Edicion | null>(null)
  const [configurando, setConfigurando] = useState(false)

  const campos = useMemo(() => camposDeContrato(clientes, tipos), [clientes, tipos])

  // Se memoiza porque `TablaRecurso` la usa como dependencia de sus efectos: una definicion nueva en
  // cada render volveria a pedir la pagina en bucle.
  const definicion = useMemo(() => ({
    ...CONTRATOS,
    columnas: CONTRATOS.columnas.map((columna) => {
      if (columna.clave === 'subject') {
        return {
          ...columna,
          presentar: (contrato: Contrato) => (
            <Link
              href={`/contratos/${contrato.id}`}
              className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
            >
              {contrato.subject === '' ? `Contrato #${contrato.id}` : contrato.subject}
            </Link>
          )
        }
      }

      if (columna.clave === 'client') {
        return {
          ...columna,
          presentar: (contrato: Contrato) => (
            contrato.client === null ? '' : <EnlaceCliente id={contrato.client.id} nombre={contrato.client.company} />
          )
        }
      }

      return columna
    })
  }), [])

  /**
   * Guarda la configuracion de acceso con `PUT`, que `FormularioRecurso` no hace solo.
   *
   * @param cuerpo `area_ids` y `admin`, ya convertidos por el formulario.
   * @returns El mensaje de error, o `null` si se guardo.
   */
  async function guardarAcceso (cuerpo: Record<string, unknown>): Promise<string | null> {
    const respuesta = await fetch('/api/bff/contratos/acceso', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(cuerpo)
    })

    return respuesta.ok ? null : await mensajeDeRespuesta(respuesta)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end gap-2">
        {acceso !== undefined && (
          <Boton tamano="chico" variante="secundario" onClick={() => { setConfigurando(true) }}>
            <ShieldCheck aria-hidden className="size-4" />
            Acceso
          </Boton>
        )}
        <Boton tamano="chico" variante="primario" onClick={() => { setCreando(true) }}>
          Nuevo contrato
        </Boton>
      </div>

      <TablaRecurso
        definicion={definicion}
        inicial={inicial}
        claveFila={(contrato) => contrato.id}
        opcionesDeFiltro={opcionesDeFiltro}
        filaExtra={(contrato, recargar) => (
          <MenuAccionesFila onEditar={() => { setEditando({ contrato, recargar }) }} />
        )}
      />

      <FormularioRecurso
        abierto={creando}
        onAbiertoCambia={setCreando}
        titulo="Nuevo contrato"
        descripcion="El texto del contrato y la firma se siguen gestionando en el panel."
        campos={campos}
        ruta="contratos"
        metodo="POST"
        registro={REGISTRO_NUEVO_CONTRATO}
        avisoExito="Contrato creado."
        onGuardado={() => { router.refresh() }}
        columnas={2}
        ancho="grande"
      />

      {editando !== null && (
        <FormularioRecurso
          key={editando.contrato.id}
          abierto
          onAbiertoCambia={(abierto) => { if (!abierto) setEditando(null) }}
          titulo="Editar contrato"
          campos={campos}
          ruta={`contratos/${editando.contrato.id}`}
          metodo="PATCH"
          registro={registroDeContrato(editando.contrato)}
          avisoExito="Contrato actualizado."
          onGuardado={() => { editando.recargar() }}
          columnas={2}
          ancho="grande"
        />
      )}

      {acceso !== undefined && (
        <FormularioRecurso
          abierto={configurando}
          onAbiertoCambia={setConfigurando}
          titulo="Quién ve los contratos"
          descripcion="Quien entra ve, crea y edita todos los contratos."
          campos={camposDeAcceso(areas)}
          ruta="contratos/acceso"
          metodo="PATCH"
          registro={registroDeAcceso(acceso)}
          enviar={guardarAcceso}
          avisoExito="Acceso actualizado."
          onGuardado={() => { router.refresh() }}
        />
      )}
    </div>
  )
}
