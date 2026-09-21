'use client'

import { useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { TriangleAlert } from 'lucide-react'
import { mensajeDeRespuesta } from '@/datos/cliente'
import type { Estado, Interruptor } from './tipos'

export function Tablero ({ estado, escritura }: { estado: Estado, escritura: string }) {
  const { titulo, migraciones, reloj, base, operador, ocupantes } = estado
  const pendientes = migraciones.pendientes.length
  const peligrosos = estado.interruptores.filter(i => i.peligro && i.valor).length

  return (
    <div className="pn">
      <header className="pn__cab">
        <span className="pn__pulso" aria-hidden="true" />
        <h1 className="pn__titulo">{titulo}</h1>
        <p className="pn__clave" style={{ marginLeft: 'auto' }}>
          {operador.nombre} · {ocupantes} con acceso
        </p>
      </header>

      <div className="pn__cuerpo">
        <section className="pn__bloque" style={{ '--i': 0 } as CSSProperties}>
          <p className="pn__rotulo">Esquema</p>
          <p className={pendientes > 0 ? 'pn__cifra pn__cifra--mal' : 'pn__cifra'}>
            {pendientes}
          </p>
          <p className="pn__clave" style={{ marginTop: '.3rem' }}>
            {pendientes === 1 ? 'migración pendiente' : 'migraciones pendientes'}
          </p>

          <div style={{ marginTop: '1rem' }}>
            <div className="pn__fila">
              <span className="pn__clave">Aplicadas</span>
              <span className="pn__valor">{migraciones.aplicadas} de {migraciones.en_disco}</span>
            </div>
            {migraciones.ultima !== null && (
              <div className="pn__fila">
                <span className="pn__clave">Última</span>
                <span className="pn__valor">{migraciones.ultima.archivo}</span>
              </div>
            )}
          </div>

          {pendientes > 0 && (
            <ul className="pn__lista">
              {migraciones.pendientes.map(archivo => <li key={archivo}>{archivo}</li>)}
            </ul>
          )}
        </section>

        <section className="pn__bloque" style={{ '--i': 1 } as CSSProperties}>
          <p className="pn__rotulo">Reloj y motor</p>
          <p className={reloj.alineados ? 'pn__cifra' : 'pn__cifra pn__cifra--mal'}>
            {reloj.desfase_segundos > 0 ? '+' : ''}{reloj.desfase_segundos}s
          </p>
          <p className="pn__clave" style={{ marginTop: '.3rem' }}>
            desfase entre PHP y la base
          </p>

          <div style={{ marginTop: '1rem' }}>
            <div className="pn__fila">
              <span className="pn__clave">PHP ({reloj.zona_php})</span>
              <span className="pn__valor">{reloj.php}</span>
            </div>
            <div className="pn__fila">
              <span className="pn__clave">Base</span>
              <span className="pn__valor">{reloj.base}</span>
            </div>
            <div className="pn__fila">
              <span className="pn__clave">Motor</span>
              <span className="pn__valor">{base.version}</span>
            </div>
          </div>

          {!reloj.alineados && (
            <p className="pn__aviso">
              Los dos relojes no coinciden. Una fecha guardada no es la que se muestra, y eso explica
              vencimientos que parecen errores de lógica.
            </p>
          )}
        </section>

        <Interruptores
          interruptores={estado.interruptores}
          peligrososEncendidos={peligrosos}
          escritura={escritura}
        />
      </div>
    </div>
  )
}

function Interruptores ({ interruptores, peligrososEncendidos, escritura }: {
  interruptores: Interruptor[]
  peligrososEncendidos: number
  escritura: string
}) {
  const router = useRouter()
  const [enVuelo, setEnVuelo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function alternar (int: Interruptor) {
    const siguiente = !int.valor

    if (int.peligro && siguiente) {
      const ok = window.confirm(
        `"${int.etiqueta}" se nota fuera de esta instalación: manda correo, abre la puerta de entrada `
        + 'o gasta con un proveedor externo. ¿Encenderlo igual?'
      )
      if (!ok) return
    }

    setEnVuelo(int.clave)
    setError(null)

    try {
      const respuesta = await fetch(escritura, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [int.clave]: siguiente })
      })

      if (!respuesta.ok) {
        setError(await mensajeDeRespuesta(respuesta))
        return
      }

      // El valor lo vuelve a leer el servidor: creerle al navegador dejaria la pantalla diciendo algo
      // distinto de lo que quedo en `tbloptions` si la escritura se normalizo de otra forma.
      router.refresh()
    } catch {
      setError('Se perdió la conexión con el servidor. El interruptor no cambió.')
    } finally {
      setEnVuelo(null)
    }
  }

  return (
    <section className="pn__bloque pn__ancho" style={{ '--i': 2 } as CSSProperties}>
      <p className="pn__rotulo">
        Interruptores · {peligrososEncendidos} con efecto externo encendido
      </p>

      <div>
        {interruptores.map(int => (
          <button
            key={int.clave}
            type="button"
            className="pn__int"
            disabled={enVuelo !== null}
            aria-pressed={int.valor}
            onClick={() => { void alternar(int) }}
          >
            <span>
              <span className="pn__int-nombre">
                {int.peligro && <TriangleAlert size={13} aria-hidden="true" color="#f2b705" />}
                {int.etiqueta}
              </span>
              <span className="pn__int-grupo">{int.grupo} · {int.clave}</span>
            </span>
            <span
              className={[
                'pn__llave',
                int.valor ? 'pn__llave--on' : '',
                int.peligro ? 'pn__llave--peligro' : ''
              ].filter(Boolean).join(' ')}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>

      {error !== null && <p className="pn__error">{error}</p>}

      <p className="pn__aviso">
        Todo lo que se toque acá queda registrado en la auditoría con tu nombre.
      </p>
    </section>
  )
}
