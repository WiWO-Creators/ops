/**
 * Una grua horquilla levanta un pallet: la carga sube por el mastil, se asienta y vuelve a empezar.
 *
 * Es la unica de las cuatro escenas sin golpe, asi que el movimiento es el opuesto —largo y
 * continuo— y el ciclo dura casi el doble. Lo que las une es el encuadre, el suelo en `y=102` y el
 * casco como unica mancha de color.
 *
 * @returns Escena SVG decorativa; el mensaje accesible pertenece a la bienvenida.
 */
export function EscenaGruaHorquilla () {
  return (
    <svg
      viewBox="34 8 116 102"
      className="escena-grua text-texto-tenue h-auto w-64 max-w-full"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line className="stroke-linea" x1="18" y1="102" x2="162" y2="102" />

      {/* El maquina completa se hunde un poco cuando la carga despega: sin eso el pallet parece
          flotar por su cuenta en vez de colgar de algo que aguanta peso. */}
      <g className="escena-maquina">
        {/* Techo de proteccion. Las dos columnas nacen del chasis, no del aire. */}
        <path d="M50 74V50h36v24" />

        <g className="escena-conductor">
          <circle className="fill-superficie" cx="66" cy="63" r="9" />
          <circle cx="71" cy="66" r="0.8" fill="currentColor" stroke="none" />
          <path className="fill-acento stroke-acento" d="M57 63a9 9 0 0 1 18 0z" />
          <rect className="fill-acento stroke-acento" x="54" y="61" width="24" height="3.5" rx="1.75" />
        </g>

        <rect className="fill-superficie" x="46" y="74" width="42" height="18" rx="3" />

        {/* Las ruedas giran con un solo radio: dos o tres se pisan entre si a este tamaño. */}
        <g className="escena-rueda fill-superficie" style={{ '--centro': '56px 96px' } as React.CSSProperties}>
          <circle cx="56" cy="96" r="6.5" />
          <line x1="56" y1="96" x2="56" y2="90" strokeWidth="1.5" />
        </g>
        <g className="escena-rueda fill-superficie" style={{ '--centro': '80px 96px' } as React.CSSProperties}>
          <circle cx="80" cy="96" r="6.5" />
          <line x1="80" y1="96" x2="80" y2="90" strokeWidth="1.5" />
        </g>

        {/* Mastil. Fijo: lo que sube es la horquilla, no la torre. */}
        <line x1="92" y1="96" x2="92" y2="42" />
        <line x1="97" y1="96" x2="97" y2="42" />
        <line x1="90" y1="42" x2="99" y2="42" strokeWidth="2" />
      </g>

      {/* Horquilla y carga viajan en el mismo grupo: si el pallet se moviera aparte, se despegaria de
          los brazos en cuanto alguien toque una de las dos animaciones. */}
      <g className="escena-horquilla">
        {/* El brazo sobresale del pallet a proposito: una horquilla que termina justo donde termina la
            carga queda escondida debajo y el pallet parece pegado al mastil. */}
        <path d="M99 78v22h29" />
        <rect className="fill-superficie-elevada" x="101" y="94" width="22" height="6" rx="1" />
        <rect className="fill-superficie-elevada" x="104" y="80" width="16" height="14" rx="1.5" />
      </g>
    </svg>
  )
}
