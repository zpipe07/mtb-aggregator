import { cn } from "@/lib/utils";

const CX = 32;
const CY = 32;
const KNOB_COUNT = 18;

/** Six spokes, tucked under the hub ring and the lime rim. */
const SPOKES = Array.from({ length: 6 }, (_, index) => {
  const angle = (index * Math.PI) / 3;
  const inner = 6;
  const outer = 17.15;
  return {
    x1: CX + inner * Math.cos(angle),
    y1: CY + inner * Math.sin(angle),
    x2: CX + outer * Math.cos(angle),
    y2: CY + outer * Math.sin(angle),
  };
});

type KnobbyWheelSpinnerProps = {
  className?: string;
  /**
   * Accessible name. The deals results overlay hides this graphic because
   * the region already exposes `aria-busy`.
   */
  label?: string;
};

/**
 * MTB tire spinner (ZAC-133, concept 05). Ink uses `currentColor`; the rim
 * and hub use `--primary` (lime, with a #a6e45a fallback). One rotation is
 * 2s. `prefers-reduced-motion` replaces the spin with an opacity pulse.
 */
export function KnobbyWheelSpinner({
  className,
  label = "Loading",
}: KnobbyWheelSpinnerProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      role="img"
      aria-label={label}
      className={cn(
        "size-12 origin-center animate-knobby-spin text-foreground",
        className,
      )}
    >
      <g
        stroke="currentColor"
        strokeWidth={1.55}
        strokeLinecap="butt"
      >
        {SPOKES.map((spoke) => (
          <line
            key={`${spoke.x2}-${spoke.y2}`}
            x1={spoke.x1}
            y1={spoke.y1}
            x2={spoke.x2}
            y2={spoke.y2}
          />
        ))}
      </g>
      <circle
        cx={CX}
        cy={CY}
        r={18.7}
        fill="none"
        stroke="var(--primary, #a6e45a)"
        strokeWidth={3}
      />
      <circle
        cx={CX}
        cy={CY}
        r={23.45}
        fill="none"
        stroke="currentColor"
        strokeWidth={6.7}
      />
      <g fill="currentColor">
        {Array.from({ length: KNOB_COUNT }, (_, index) => (
          <rect
            key={index * (360 / KNOB_COUNT)}
            x={29.35}
            y={2}
            width={5.3}
            height={5}
            rx={0.7}
            transform={`rotate(${index * (360 / KNOB_COUNT)} ${CX} ${CY})`}
          />
        ))}
      </g>
      <circle cx={CX} cy={CY} r={5.55} fill="currentColor" />
      <circle cx={CX} cy={CY} r={3.7} fill="var(--primary, #a6e45a)" />
    </svg>
  );
}
