import { Suspense } from 'react'
import Link from 'next/link'
import { SelectorTema } from '@/componentes/estructura/SelectorTema'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Logo } from '@/componentes/estructura/Logo'
import { ProveedorEnlaces } from '@/componentes/presentadores/ProveedorEnlaces'
import { pedirOpcional, pedirPortal, proyectoUnicoDelPortal } from '@/datos/servidor'
import type { YoPortal } from '@/datos/tipos'
import { navegacionDelPortal } from '@/dominio/portal'
import { BarraVerComoCliente } from '../BarraVerComoCliente'
import { BotonSalirPortal } from '../BotonSalirPortal'
import { NavegacionPortal } from '../NavegacionPortal'
import { ScrollSuave } from '@/componentes/estructura/ScrollSuave'
import { OrbeChatIA } from '@/componentes/ia/OrbeChatIA'
import { RastreadorPortal } from '@/componentes/portal/rastreo/RastreadorPortal'

/**
 * Armazon del portal del cliente.
 *
 * Hermano de `(panel)/layout.tsx`, no una variante suya: comparten el sistema de diseño y nada mas.
 * La navegacion va horizontal en el encabezado porque el portal tiene cinco destinos y no cuarenta —
 * una barra lateral de 220px seria peso muerto en la pantalla de alguien que entra a mirar el avance
 * de su proyecto y se va.
 *
 * Server Component: resuelve `/portal/me` una sola vez por navegacion y arma la navegacion con lo
 * que la API dijo que este contacto puede ver.
 *
 * Si la sesion es prestada ("ver como cliente", `suplantado_por` en `/portal/me`), monta arriba de
 * todo la franja que lo avisa y permite terminar.
 *
 * Tambien decide si monta el Thinking Orb del cliente: solo con `GET /portal/ia/capacidades` en
 * `habilitado: true` (`ia_habilitada` y `wiwo_portal_ia_chat` encendidas). Cualquier fallo de esa
 * consulta lo deja sin orbe: es una comodidad, y el portal no se cae por ella.
 */
export default async function PortalLayout ({ children }: { children: React.ReactNode }) {
  const [{ data: yo }, capacidades] = await Promise.all([
    pedirPortal<YoPortal>('/portal/me'),
    pedirOpcional<{ habilitado?: boolean }>('/portal/ia/capacidades', 'contacto')
  ])
  const conOrbe = capacidades.datos?.habilitado === true
  const unico = yo.secciones_habilitadas.includes('projects') ? await proyectoUnicoDelPortal() : null
  const secciones = navegacionDelPortal(yo.secciones_habilitadas, unico)

  return (
    // `esPortal` fijo en `true`: en el portal ninguna persona, cliente o proyecto se enlaza, sea cual
    // sea la capacidad. Ver `ProveedorEnlaces`.
    <ProveedorEnlaces permisos={{}} esPortal>
    {/* Primero, para que sus efectos corran antes que los de la pagina. `useSearchParams` pide
        `Suspense`. Con `rastreo` ausente o apagado no registra nada. */}
    <Suspense fallback={null}>
      <RastreadorPortal activo={yo.rastreo === true} quien={`${yo.id}-${yo.suplantado_por?.id ?? 0}`} />
    </Suspense>
    <div className="flex h-dvh flex-col overflow-hidden">
      {yo.suplantado_por != null && (
        <BarraVerComoCliente
          contacto={yo.full_name}
          suplantador={yo.suplantado_por.full_name}
          clienteId={yo.client_id}
        />
      )}
      {/* `relative z-10`: el logo del cliente cuelga por debajo del borde y tiene que quedar encima
          de la navegacion movil y del contenido que se desplaza detras. */}
      <header className="border-linea relative z-10 flex h-14 shrink-0 items-center gap-3 border-b px-4">
        {/* El perfil no esta en la navegacion: no es una seccion que la API habilite, sino los datos
            del propio contacto. El avatar es el lugar donde se lo busca, y lleva la marca de la
            empresa y no la cara de la persona: el portal es del cliente.

            El logo va grande y se sale por el borde inferior de la barra: el `Link` guarda el hueco
            en la fila y el avatar se posiciona absoluto dentro de el. Vive en la cabecera y no en el
            area que se desplaza, asi que queda fijo mientras el contenido corre por debajo. El anillo
            del color del fondo es el corte que lo separa de la linea de la barra. */}
        <Link
          href="/portal/perfil"
          title="Mi perfil"
          aria-label="Mi perfil"
          className="relative size-20 shrink-0 self-start"
        >
          <Avatar
            nombre={yo.client?.company ?? yo.full_name}
            imagen={yo.client?.image_url ?? null}
            className="ring-superficie bg-superficie-elevada absolute top-2 left-0 size-20 text-2xl shadow-md ring-4"
          />
        </Link>
        <Link href="/portal" aria-label="Inicio del portal" className="shrink-0">
          <Logo tamano="medio" />
        </Link>
        <NavegacionPortal secciones={secciones} className="hidden md:flex" />
        <SelectorTema className="ml-auto" />
        <BotonSalirPortal />
      </header>

      {/* En pantallas angostas la navegacion baja a su propia fila y se desplaza en horizontal:
          esconderla detras de un menu obliga a dos toques para lo unico que el portal ofrece. */}
      <NavegacionPortal
        secciones={secciones}
        className="border-linea flex shrink-0 gap-1 overflow-x-auto border-b py-2 pr-4 pl-28 md:hidden"
      />

      {/* En escritorio el logo cuelga sobre el contenido: el `pt-12` lo deja pasar sin tapar la
          primera linea. En movil lo absorbe la fila de navegacion, que ya corre su inicio. */}
      <ScrollSuave className="min-h-0 min-w-0 flex-1 p-4 md:pt-12">{children}</ScrollSuave>

      {conOrbe && <OrbeChatIA sujeto="contacto" />}
    </div>
    </ProveedorEnlaces>
  )
}
