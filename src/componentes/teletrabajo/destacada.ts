import type { TrackReferenceOrPlaceholder } from '@livekit/components-react'

/**
 * Elige que video mostrar en la mini llamada.
 *
 * El orden es el de una llamada real: quien habla ahora; si no habla nadie, alguien mas con la camara
 * prendida; si no, cualquier otra persona; y solo al final la ficha propia, que es la que menos
 * interesa ver pero la que queda cuando se esta a solas.
 *
 * @param pistas      Las pistas de camara de la sala, con marcador para quien la tiene apagada.
 * @param hablando    Identidades de quienes estan hablando, de mas a menos fuerte.
 * @param miIdentidad Identidad de quien mira.
 * @returns La pista a mostrar, o `null` si la sala todavia no tiene a nadie (ni a uno mismo).
 */
export function pistaDestacada (
  pistas: TrackReferenceOrPlaceholder[],
  hablando: string[],
  miIdentidad: string
): TrackReferenceOrPlaceholder | null {
  const ajenas = pistas.filter((pista) => pista.participant.identity !== miIdentidad)

  const queHabla = hablando
    .filter((identidad) => identidad !== miIdentidad)
    .map((identidad) => ajenas.find((pista) => pista.participant.identity === identidad))
    .find((pista) => pista !== undefined)

  return queHabla ??
    ajenas.find((pista) => pista.publication !== undefined && !pista.publication.isMuted) ??
    ajenas[0] ??
    pistas[0] ??
    null
}
