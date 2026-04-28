import type { Vendor } from "@/data/multiModelStudy";

interface VendorLogoProps {
  vendor: Vendor;
  className?: string;
  size?: number;
  color?: string;
}

/**
 * Official brand marks pulled from Simple Icons CDN (cdn.simpleicons.org).
 * Color stripped by simpleicons; tint via the requested hex.
 *
 * - Claude   -> anthropic   (Claude is Anthropic's product, official Anthropic mark)
 * - Gemini   -> googlegemini
 * - Kimi K2  -> Moonshot AI doesn't have a Simple Icons slug; use NVIDIA mark
 *               since we serve Kimi K2 via NVIDIA NIM endpoint.
 */
const SLUG: Record<Vendor, string> = {
  kimi: "nvidia",
  claude: "anthropic",
  gemini: "googlegemini",
};

// Official brand hexes (used when `color` not explicitly passed)
const BRAND_HEX: Record<Vendor, string> = {
  kimi:   "76B900",   // NVIDIA green (NIM-served)
  claude: "D97757",   // Anthropic warm coral-clay
  gemini: "4285F4",   // Google blue
};

export function VendorLogo({ vendor, className = "w-5 h-5", size, color }: VendorLogoProps) {
  const slug = SLUG[vendor];
  const hex = (color ?? `#${BRAND_HEX[vendor]}`).replace("#", "");
  const url = `https://cdn.simpleicons.org/${slug}/${hex}`;
  const px = size ?? 20;
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={url}
      alt={`${vendor} logo`}
      width={px}
      height={px}
      className={className}
      style={{ width: px, height: px, objectFit: "contain" }}
    />
  );
}
