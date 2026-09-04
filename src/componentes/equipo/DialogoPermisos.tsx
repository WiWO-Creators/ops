'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Boton } from '@/componentes/formularios/Boton'
import { CLASES_CASILLA } from '@/componentes/formularios/Entrada'
import {
  CerrarDialogo,
  ContenidoDialogo,
  Dialogo,
  DisparadorDialogo
} from '@/componentes/superposiciones/Dialogo'
import type { AreaDeCatalogo, FichaPersona } from '@/datos/recursos'
import {
  alternar,
  areasFueraDeLaMatriz,
  cuerpoDePermisos,
  matrizEditable,
  seleccionInicial,
  type AreaEditable,
  type MapaDePermisos
} from './permisos'

interface PropsDialogoPermisos {
  persona: FichaPersona
  /** `GET /roles/catalogo`, ya pedido por el Server Component de la ficha. */
  catalogo: AreaDeCatalogo[]
  /** Permisos de quien edita (`permissions` de `/me`): deciden que casillas puede tocar. */
  permisosDelActor: MapaDePermisos
  actorEsAdmin: boolean
}

/**
 * Editor de los permisos individuales de una persona.
 *
 * Es lo que permite dar acceso sin pasar por el rol: el rol solo pre-marca la matriz cuando se lo
 * aplica, y el acceso real de cada persona vive fila por fila en `tblstaff_permissions`. Aca se edita
 * esa fila, sin tocar el rol ni el de nadie mas.
 *
 * Guarda con `PATCH /staff/{id}`. Que viaja y que no lo decide `permisos.ts`, con sus pruebas: el
 * contrato de la API es "solo se reescribe el area que se nombra", y equivocarlo borra permisos en
 * silencio.
 */
export function DialogoPermisos ({ persona, catalogo, permisosDelActor, actorEsAdmin }: PropsDialogoPermisos) {
  const [abierto, setAbierto] = useState(false)
  const matriz = useMemo(
    () => matrizEditable(catalogo, permisosDelActor, actorEsAdmin),
    [catalogo, permisosDelActor, actorEsAdmin]
  )

  return (
    <Dialogo open={abierto} onOpenChange={setAbierto}>
      <DisparadorDialogo asChild>
        <Boton variante="sutil" tamano="chico">Permisos</Boton>
      </DisparadorDialogo>

      <ContenidoDialogo
        titulo={`Permisos de ${persona.full_name}`}
        descripcion="Se guardan en su ficha, uno por uno. No dependen del rol: el rol sólo los copia cuando se aplica."
        ancho="grande"
      >
        {/* El formulario se monta recien al abrir —Radix no renderiza el contenido cerrado—, asi que
            arranca siempre con lo ultimo que devolvio la API y no con lo que habia al cargar la
            pagina. Por eso el estado de las casillas vive adentro y no aca. */}
        <CuerpoDelDialogo persona={persona} matriz={matriz} cerrar={() => { setAbierto(false) }} />
      </ContenidoDialogo>
    </Dialogo>
  )
}

interface PropsCuerpo {
  persona: FichaPersona
  matriz: AreaEditable[]
  cerrar: () => void
}

/**
 * La matriz de casillas y el guardado, o el motivo por el que no hay nada que editar.
 *
 * A un administrador no se le dibuja: la API le vacia `tblstaff_permissions` a proposito —`is_admin()`
 * contesta que si a todo— y ofrecer casillas que no se guardan seria mentir.
 */
function CuerpoDelDialogo ({ persona, matriz, cerrar }: PropsCuerpo) {
  const router = useRouter()
  const [seleccion, setSeleccion] = useState<MapaDePermisos>(() => seleccionInicial(persona.permissions, matriz))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fuera = areasFueraDeLaMatriz(persona.permissions, matriz)

  /** Manda la matriz completa y refresca la ficha, o deja el error a la vista sin cerrar. */
  async function guardar (): Promise<void> {
    setGuardando(true)
    setError(null)

    const resultado = await escribirEnBff(
      `staff/${persona.id}`,
      'PATCH',
      { permissions: cuerpoDePermisos(seleccion, matriz) }
    )

    setGuardando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    cerrar()
    router.refresh()
  }

  if (persona.is_admin) {
    return (
      <p className="text-texto-tenue text-sm">
        Es administrador: tiene todo, y mientras lo sea la API no guarda permisos por área. Para darle
        permisos individuales, primero sacale el administrador.
      </p>
    )
  }

  if (matriz.length === 0) {
    return (
      <p className="text-texto-tenue text-sm">
        No podés otorgar ningún permiso: sólo se reparte lo que uno mismo tiene.
      </p>
    )
  }

  return (
    <form onSubmit={(evento) => { evento.preventDefault(); void guardar() }} className="flex flex-col gap-5">
      {/* Dos columnas desde `sm`: son quince áreas, y apiladas obligan a scrollear el diálogo entero
          para ver si Facturas quedó marcada. */}
      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        {matriz.map((area) => (
          <AreaDeCasillas
            key={area.feature}
            area={area}
            marcadas={seleccion[area.feature] ?? []}
            bloqueado={guardando}
            alAlternar={(capacidad) => { setSeleccion(alternar(seleccion, area.feature, capacidad)) }}
          />
        ))}
      </div>

      {fuera.length > 0 && (
        <div className="border-linea border-t pt-4">
          <p className="text-texto-tenue text-xs">
            Además tiene esto, que esta pantalla no toca —son módulos del panel clásico, o áreas que
            no administrás—:
          </p>
          <ul className="text-texto-sutil mt-1 text-xs">
            {fuera.map((area) => (
              <li key={area.nombre}>{area.nombre}: {area.capacidades}</li>
            ))}
          </ul>
        </div>
      )}

      {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}

      <div className="flex justify-end gap-2">
        <CerrarDialogo asChild>
          <Boton type="button" variante="sutil" disabled={guardando}>Cancelar</Boton>
        </CerrarDialogo>
        <Boton type="submit" variante="primario" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar permisos'}
        </Boton>
      </div>
    </form>
  )
}

interface PropsArea {
  area: AreaEditable
  marcadas: string[]
  bloqueado: boolean
  alAlternar: (capacidad: string) => void
}

/**
 * Un área con sus capacidades.
 *
 * Las que quien edita no posee se dibujan deshabilitadas y lo dicen: la API rechaza otorgarlas
 * (`escalada`), y una casilla que no se puede marcar sin explicación se lee como un error de la
 * pantalla. Si la persona ya las tiene, quedan marcadas y viajan intactas al guardar.
 */
function AreaDeCasillas ({ area, marcadas, bloqueado, alAlternar }: PropsArea) {
  return (
    <fieldset>
      <legend className="text-texto mb-2 text-sm font-medium">{area.nombre}</legend>
      <ul className="flex flex-col gap-1.5">
        {area.capacidades.map((capacidad) => (
          <li key={capacidad.clave}>
            <label className={
              capacidad.editable
                ? 'text-texto flex cursor-pointer items-center gap-2 text-sm'
                : 'text-texto-tenue flex cursor-not-allowed items-center gap-2 text-sm'
            }>
              <input
                type="checkbox"
                className={CLASES_CASILLA}
                checked={marcadas.includes(capacidad.clave)}
                disabled={bloqueado || !capacidad.editable}
                onChange={() => { alAlternar(capacidad.clave) }}
              />
              {capacidad.nombre}
              {!capacidad.editable && <span className="text-texto-sutil text-xs">(no podés darlo)</span>}
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  )
}
