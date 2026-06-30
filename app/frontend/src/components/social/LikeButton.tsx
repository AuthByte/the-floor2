interface Props {
  count: number;
  liked: boolean;
  onToggle?: () => void;
  disabled?: boolean;
}

export function LikeButton({ count, liked, onToggle, disabled }: Props) {
  if (!onToggle) {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-wire-600">
        <span aria-hidden>{liked ? "♥" : "♡"}</span>
        {count}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition disabled:opacity-40 ${
        liked
          ? "border-siren/50 bg-siren/10 text-siren"
          : "border-wire-800 text-wire-500 hover:border-brass/40 hover:text-brass"
      }`}
    >
      <span aria-hidden>{liked ? "♥" : "♡"}</span>
      {count}
    </button>
  );
}
