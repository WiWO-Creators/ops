import { rotularMes } from '@/dominio/gestion'

/**
 * El selector de mes del tablero.
 *
 * Es un `<form method="get">` con un `<select>` y un botón, igual que el tablero de indicadores del
 * panel, y por el mismo motivo: el estado vive en la URL. Al enviarlo cambia `?mes=`, el servidor
 * vuelve a pedir y la pantalla se repinta. Sin `useState`, sin `useEffect`, sin un byte de
 * JavaScript propio — y el resultado se comparte por enlace, que es exactamente lo que alguien hace
 * con un tablero antes de una reunión mensual.
 *
 * El desplegable sólo ofrece los meses que la API acepta (`RecursoGestion::MESES_ATRAS` y nada del
 * futuro). Ofrecer uno más sería ofrecer un 422.
 *
 * @param mes el mes que se está mirando, `YYYY-MM`
 * @param meses los meses ofrecidos, del más nuevo al más viejo
 * @param espacioId el {espacio} elegido, para que el formulario no lo pierda al cambiar de mes
 */
export function SelectorDeMes (
  { mes, meses, espacioId }: { mes: string, meses: string[], espacioId?: string }
) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3">
      {espacioId !== undefined && <input type="hidden" name="project_id" value={espacioId} />}

      <label className="flex flex-col gap-1">
        <span className="text-texto-tenue text-xs font-medium">Mes</span>
        <select
          name="mes"
          defaultValue={mes}
          className="border-linea rounded-medio bg-superficie text-texto h-9 border px-2 text-sm"
        >
          {meses.map((opcion) => (
            <option key={opcion} value={opcion}>{rotularMes(opcion)}</option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        className="border-linea rounded-medio bg-superficie-elevada text-texto hover:bg-hover h-9 cursor-pointer border px-4 text-sm font-medium"
      >
        Ver mes
      </button>
    </form>
  )
}
