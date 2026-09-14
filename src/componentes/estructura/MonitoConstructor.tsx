/**
 * Muestra el constructor de bienvenida con golpes sincronizados y un muro que se arma.
 * @returns Escena SVG decorativa; el mensaje accesible pertenece a la bienvenida.
 */
export function MonitoConstructor () {
  return (
    <svg
      viewBox="34 8 116 102"
      className="monito-escena text-texto-tenue h-auto w-64 max-w-full"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* El muro, de abajo hacia arriba. Cada bloque entra con su propio retraso: es lo que hace que
          se lea como "esta construyendo" y no como "hay un dibujo de un muro". */}
      <g className="fill-superficie-elevada">
        <rect className="monito-bloque" style={{ '--retraso': '0ms' } as React.CSSProperties} x="100" y="88" width="20" height="12" rx="2" />
        <rect className="monito-bloque" style={{ '--retraso': '120ms' } as React.CSSProperties} x="122" y="88" width="20" height="12" rx="2" />
        <rect className="monito-bloque" style={{ '--retraso': '260ms' } as React.CSSProperties} x="100" y="74" width="20" height="12" rx="2" />
        <rect className="monito-bloque" style={{ '--retraso': '380ms' } as React.CSSProperties} x="122" y="74" width="20" height="12" rx="2" />
        {/* El de arriba es el que recibe el martillo, asi que entra ultimo. */}
        <rect className="monito-bloque" style={{ '--retraso': '440ms' } as React.CSSProperties} x="111" y="60" width="20" height="12" rx="2" />
      </g>

      {/* El suelo, para que el monito y el muro se apoyen en lo mismo. */}
      <line className="stroke-linea" x1="18" y1="102" x2="162" y2="102" />

      <g className="monito-cuerpo">
        {/* Piernas y brazo de atras primero: quedan detras del torso sin necesidad de recortes. */}
        <line x1="55" y1="87" x2="50" y2="102" />
        <line x1="61" y1="87" x2="66" y2="102" />
        <line x1="51" y1="68" x2="43" y2="79" />

        <rect className="fill-superficie" x="50" y="63" width="16" height="24" rx="7" />
        <circle className="fill-superficie" cx="58" cy="50" r="11" />
        <circle cx="63" cy="54" r="0.8" fill="currentColor" stroke="none" />
        <path d="M59 58q3 2 5-1" strokeWidth="1.5" />

        {/* El casco tapa la mitad de arriba de la cabeza y no la cabeza entera: si la cubre toda deja
            de leerse como alguien con casco y pasa a ser una mancha con patas. El arco es exactamente
            la mitad superior del circulo, asi que apoya en el borde y no flota.
            Es lo unico con color de marca: en un dibujo de dos trazos, una sola mancha de color dice
            "de aca es" mejor que teñir todo. */}
        <path className="fill-acento stroke-acento" d="M47 50a11 11 0 0 1 22 0z" />
        <rect className="fill-acento stroke-acento" x="44" y="48" width="28" height="4" rx="2" />

        {/* El hombro es la esquina inferior izquierda del grupo; el mango alcanza el bloque superior. */}
        <g className="monito-brazo">
          <line x1="65" y1="68" x2="82" y2="62" />
          <line x1="82" y1="62" x2="111" y2="42" />
          <rect
            className="fill-texto-tenue"
            x="104.5"
            y="38"
            width="13"
            height="8"
            rx="1.5"
            transform="rotate(55 111 42)"
          />
        </g>
      </g>

      {/* Las chispas del golpe. Comparten duracion con el brazo para caer en el fotograma del impacto;
          separarlas seria dejar que se despeguen en cuanto alguien toque una de las dos. */}
      <g className="monito-chispas stroke-acento">
        <line x1="112" y1="56" x2="107" y2="50" />
        <line x1="117" y1="54" x2="118" y2="46" />
        <line x1="122" y1="57" x2="128" y2="52" />
      </g>
    </svg>
  )
}
