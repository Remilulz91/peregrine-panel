interface FalconMarkProps {
  /** Classes CSS (taille et couleur via `text-...`). */
  className?: string;
}

/**
 * Logo de Peregrine : un faucon stylise en vol.
 * La couleur est heritee du texte (`currentColor`), ce qui permet de la
 * regler avec une classe Tailwind comme `text-falcon`.
 */
export default function FalconMark({ className }: FalconMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M32 18 C30 22 27 25 21 26 C14 27 7 30 2 36 C9 34 15 34 21 36 C16 40 13 45 12 51 C18 45 25 41 32 39 C39 41 46 45 52 51 C51 45 48 40 43 36 C49 34 55 34 62 36 C57 30 50 27 43 26 C37 25 34 22 32 18 Z" />
    </svg>
  );
}
