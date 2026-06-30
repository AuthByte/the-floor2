import { memo, useState } from "react";
import { investorAvatarUrl, investorInitials } from "../lib/investorAvatar";

interface Props {
  agentKey: string;
  name: string;
  accent?: string;
  size?: number;
  speaking?: boolean;
}

/** Portrait slot — uses `/public/avatars/{key}.png` when you add headshots. */
export const InvestorAvatar = memo(function InvestorAvatar({
  agentKey,
  name,
  accent = "#22ff66",
  size = 28,
  speaking = false,
}: Props) {
  const [useFallback, setUseFallback] = useState(false);
  const px = `${size}px`;
  const border = speaking ? "border-phos/60" : "border-wire-700";

  if (useFallback) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center border bg-ink-900 font-bold uppercase ${border}`}
        style={{
          width: px,
          height: px,
          fontSize: size < 32 ? 9 : 10,
          color: accent,
          boxShadow: speaking ? `0 0 10px ${accent}44` : undefined,
        }}
        aria-hidden
      >
        {investorInitials(name)}
      </div>
    );
  }

  return (
    <img
      src={investorAvatarUrl(agentKey)}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 border object-cover object-top ${border}`}
      style={{
        width: px,
        height: px,
        imageRendering: "auto",
        boxShadow: speaking ? `0 0 10px ${accent}44` : undefined,
      }}
      onError={() => setUseFallback(true)}
      loading="lazy"
      decoding="async"
    />
  );
});
