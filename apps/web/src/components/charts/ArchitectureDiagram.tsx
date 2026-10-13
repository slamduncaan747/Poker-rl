const INK = '#e6e3dc';
const DIM = '#8c929a';
const LINE = '#5a5f66';
const ACC = '#e8743b';
const PAPER = '#15181b';
const MONO = 'Chivo Mono, ui-monospace, monospace';
const SANS = 'Chivo, ui-sans-serif, sans-serif';

type Tone = 'gto' | 'exploit' | 'neutral' | 'mix';

const strokeOf = (t: Tone) => (t === 'exploit' ? ACC : t === 'neutral' ? LINE : INK);

/** A numbered balloon, as on a technical drawing. */
function Balloon({ x, y, n, color = INK }: { x: number; y: number; n: number; color?: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={10} fill={PAPER} stroke={color} strokeWidth={1} />
      <text x={x} y={y + 3.5} textAnchor="middle" fontSize="10" fill={color} fontFamily={MONO}>
        {n}
      </text>
    </g>
  );
}

function Box({ x, y, w, h, n, title, sub, tone }: { x: number; y: number; w: number; h: number; n: number; title: string; sub: string[]; tone: Tone }) {
  const stroke = strokeOf(tone);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={PAPER} stroke={stroke} strokeWidth={tone === 'mix' ? 2 : 1.5} strokeDasharray={tone === 'neutral' ? '5 4' : undefined} />
      <text x={x + 16} y={y + 28} fontSize="14.5" fontWeight="700" fill={INK} fontFamily={SANS}>
        {title}
      </text>
      {sub.map((s, i) => (
        <text key={i} x={x + 16} y={y + 50 + i * 16} fontSize="10.5" fill={DIM} fontFamily={MONO}>
          {s}
        </text>
      ))}
      <Balloon x={x + w} y={y} n={n} color={tone === 'exploit' ? ACC : INK} />
    </g>
  );
}

/** Orthogonal connector with an open arrowhead and an optional mono label. */
function Wire({ d, color, label }: { d: string; color: string; label?: { x: number; y: number; t: string; anchor?: 'start' | 'middle' | 'end' } }) {
  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} markerEnd={`url(#tip-${color.slice(1)})`} />
      {label && (
        <text x={label.x} y={label.y} textAnchor={label.anchor ?? 'middle'} fontSize="10" fill={color} fontFamily={MONO} letterSpacing="0.5">
          {label.t}
        </text>
      )}
    </g>
  );
}

/** System diagram: the balanced path (top) and the adaptive path (bottom) meet in the policy tilt. */
export function ArchitectureDiagram() {
  return (
    <div className="overflow-x-auto">
      <svg viewBox="0 0 1060 470" className="min-w-[760px]" role="img" aria-label="System architecture: game state is abstracted into buckets for the CFR blueprint; public actions feed an opponent model and a PPO policy network; both meet in a policy tilt gated by lambda that produces the action.">
        <defs>
          {[INK, ACC, DIM].map((c) => (
            <marker key={c} id={`tip-${c.slice(1)}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M1,1 L9,5 L1,9" fill="none" stroke={c} strokeWidth="1.5" />
            </marker>
          ))}
        </defs>

        {/* layer frames */}
        <rect x={8} y={20} width={756} height={160} fill="none" stroke={LINE} strokeDasharray="2 5" />
        <text x={20} y={14} fontSize="10.5" fill={INK} fontFamily={MONO} letterSpacing="1.5">
          A · BALANCED LAYER · OFFLINE MCCFR
        </text>
        <rect x={8} y={250} width={756} height={160} fill="none" stroke={LINE} strokeDasharray="2 5" />
        <text x={20} y={244} fontSize="10.5" fill={ACC} fontFamily={MONO} letterSpacing="1.5">
          B · ADAPTIVE LAYER · ONLINE MODEL + OFFLINE PPO
        </text>

        <Box x={24} y={52} w={196} h={96} n={1} title="Game state" sub={['hole cards · board', 'betting history']} tone="neutral" />
        <Box x={276} y={52} w={210} h={96} n={2} title="Card abstraction" sub={['169 preflop classes', '32 E[HS²] buckets/street']} tone="gto" />
        <Box x={540} y={52} w={210} h={96} n={3} title="CFR blueprint" sub={['external-sampling MCCFR', 'linear CFR + pruning']} tone="gto" />

        <Box x={24} y={282} w={196} h={96} n={4} title="Public actions" sub={['every hand played', '+ showdown cards']} tone="neutral" />
        <Box x={276} y={282} w={210} h={96} n={5} title="Opponent model" sub={['16 Beta-Bernoulli', 'posteriors · GTO prior']} tone="exploit" />
        <Box x={540} y={282} w={210} h={96} n={6} title="Policy network" sub={['MLP 36→64→64→4', 'trained with PPO']} tone="exploit" />

        <Box x={818} y={168} w={224} h={124} n={7} title="Policy tilt" sub={['σ ∝ σ_GTO · exp(λ·Δ)', 'mix within group kept', 'λ = 0 ⇒ exactly GTO']} tone="mix" />
        <Box x={858} y={372} w={144} h={64} n={8} title="Action" sub={[]} tone="gto" />

        {/* exploit gate */}
        <rect x={818} y={52} width={224} height={64} fill={PAPER} stroke={LINE} strokeDasharray="5 4" />
        <text x={834} y={78} fontSize="13" fontWeight="700" fill={INK} fontFamily={SANS}>
          Gate λ
        </text>
        <text x={834} y={98} fontSize="10.5" fill={DIM} fontFamily={MONO}>
          mode switch · risk budget
        </text>

        <Wire d="M220,100 L272,100" color={DIM} />
        <Wire d="M486,100 L536,100" color={INK} label={{ x: 511, y: 92, t: 'bucket' }} />
        <Wire d="M750,100 L790,100 L790,210 L814,210" color={INK} label={{ x: 798, y: 160, t: 'σ_GTO', anchor: 'start' }} />
        <Wire d="M220,330 L272,330" color={DIM} />
        <Wire d="M486,330 L536,330" color={ACC} label={{ x: 511, y: 322, t: 'x_opp' }} />
        <Wire d="M750,330 L790,330 L790,250 L814,250" color={ACC} label={{ x: 798, y: 300, t: 'Δ ×4', anchor: 'start' }} />
        <Wire d="M645,148 L645,278" color={INK} label={{ x: 655, y: 218, t: 'σ_GTO mass · state', anchor: 'start' }} />
        <Wire d="M930,116 L930,164" color={DIM} />
        <Wire d="M930,292 L930,368" color={INK} />

        <text x={8} y={458} fontSize="10" fill={DIM} fontFamily={MONO} letterSpacing="0.5">
          SAFETY · no data ⇒ GTO features · Δ = 3·tanh(·) · L2 trust region to the blueprint · optional risk budget
        </text>
      </svg>
    </div>
  );
}
