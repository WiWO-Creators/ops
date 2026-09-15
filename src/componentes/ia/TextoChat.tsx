import type { ReactElement, ReactNode } from 'react'
import Markdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface PropsTextoChat {
  texto: string
  className?: string
  marcadores?: Record<string, ReactNode>
}

/**
 * Presenta Markdown del asistente sin HTML, imágenes ni enlaces ejecutables.
 * @param texto Contenido completo o parcial de la respuesta.
 * @param className Estilos del contenedor que aporta la conversación.
 * @param marcadores Citas verificadas que sustituyen enlaces internos del chat antiguo.
 * @returns Contenido semántico con tablas y código contenidos en el ancho disponible.
 */
export function TextoChat ({ texto, className = '', marcadores = {} }: PropsTextoChat): ReactElement {
  return (
    <div className={`min-w-0 max-w-[65ch] break-words text-sm leading-[1.6] [overflow-wrap:anywhere] [&>*+*]:mt-3 ${className}`}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={defaultUrlTransform}
        components={{
          h1: ({ children }) => <h3 className="text-base font-semibold">{children}</h3>,
          h2: ({ children }) => <h3 className="text-base font-semibold">{children}</h3>,
          h3: ({ children }) => <h4 className="font-semibold">{children}</h4>,
          h4: ({ children }) => <h4 className="font-semibold">{children}</h4>,
          h5: ({ children }) => <h4 className="font-semibold">{children}</h4>,
          h6: ({ children }) => <h4 className="font-semibold">{children}</h4>,
          p: ({ children }) => <p>{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          ul: ({ children }) => <ul className="list-disc space-y-1.5 pl-5 marker:text-texto-sutil">{children}</ul>,
          ol: ({ children, start }) => <ol start={start} className="list-decimal space-y-1.5 pl-5 marker:text-texto-sutil">{children}</ol>,
          li: ({ children }) => <li className="pl-1 [&>ul]:mt-1.5 [&>ol]:mt-1.5 [&>p+p]:mt-2">{children}</li>,
          blockquote: ({ children }) => <blockquote className="border-linea text-texto-sutil border-l pl-3 [&>*+*]:mt-2">{children}</blockquote>,
          code: ({ children }) => <code className="bg-superficie-hundida rounded px-1 py-0.5 font-mono text-[0.9em]">{children}</code>,
          pre: ({ children }) => <pre className="bg-superficie-hundida rounded-control max-w-full overflow-x-auto p-3 text-xs leading-relaxed [&>code]:bg-transparent [&>code]:p-0">{children}</pre>,
          table: ({ children }) => <div className="max-w-full overflow-x-auto"><table className="w-full border-collapse text-left text-xs">{children}</table></div>,
          th: ({ children }) => <th className="border-linea border-b px-3 py-2 font-semibold">{children}</th>,
          td: ({ children }) => <td className="border-linea border-b px-3 py-2 align-top">{children}</td>,
          hr: () => <hr className="border-linea" />,
          img: () => null,
          a: ({ children, href }) => {
            if (href && Object.hasOwn(marcadores, href)) return <>{marcadores[href]}</>
            if (!href) return <span>{children}</span>
            return <a href={href} rel="noreferrer noopener" className="text-texto underline decoration-linea-fuerte underline-offset-4 hover:decoration-current">{children}</a>
          }
        }}
      >{texto}</Markdown>
    </div>
  )
}
