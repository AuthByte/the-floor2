import type { FloorPostAuthor } from "../../lib/floorSocial/types";



interface Props {

  author: FloorPostAuthor;

  onClick?: () => void;

}



export function AuthorChip({ author, onClick }: Props) {

  const initial = (author.displayName[0] ?? "D").toUpperCase();



  const avatar = author.avatarUrl ? (

    <img

      src={author.avatarUrl}

      alt=""

      className="h-7 w-7 rounded-full border border-wire-700 object-cover"

    />

  ) : (

    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-brass/30 bg-brass/10 font-mono text-[10px] font-bold text-brass">

      {initial}

    </span>

  );



  const label = (

    <span className="font-mono text-[11px] font-medium text-wire-200">{author.displayName}</span>

  );



  if (!onClick) {

    return (

      <div className="flex items-center gap-2">

        {avatar}

        {label}

      </div>

    );

  }



  return (

    <button

      type="button"

      onClick={(e) => {

        e.stopPropagation();

        onClick();

      }}

      className="flex items-center gap-2 rounded transition hover:opacity-80"

    >

      {avatar}

      {label}

    </button>

  );

}

