import { cn } from '@/lib/clases'

interface PropsPanelVidrio extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

/**
 * Tarjeta de vidrio liquido: el contenido flota sobre el fondo desenfocado en vez de taparlo.
 *
 * Es la unica superficie del sistema que usa `backdrop-filter` ademas del orbe, y la excepcion vale
 * solo mientras se cumpla la regla de Neo: **vidrio donde hay profundidad util**. Es decir, una por
 * pantalla y sobre un fondo que valga la pena dejar ver —el degradado de marca, una imagen—, nunca
 * como superficie repetida ni como reemplazo de una tarjeta comun. Cada instancia cuesta una
 * composicion de capa, y es exactamente lo que colgaba el panel actual en pantallas Retina.
 *
 * El estilo vive en `src/estilos/vidrio.css` y no acá: el desenfoque necesita pseudo-elementos,
 * `@supports` y `prefers-reduced-transparency`, que en utilidades sueltas serian ilegibles.
 *
 * El panel fuerza la rama oscura de los tokens, asi que los componentes del sistema que se metan
 * adentro —campos, botones, avisos— ya vienen con el contraste correcto sobre el vidrio y no hay que
 * escribirles colores a mano.
 */
export function PanelVidrio ({ children, className, ...resto }: PropsPanelVidrio) {
  return (
    <div className={cn('panel-vidrio', className)} {...resto}>
      {children}
    </div>
  )
}
