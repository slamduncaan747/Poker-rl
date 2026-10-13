/** System diagram: the GTO path (top) and the exploitation path (bottom) meet in the policy tilt. */
export function ArchitectureDiagram() {
  const box = (x: number, y: number, w: number, h: number, title: string, sub: string[], tone: 'gto' | 'exploit' | 'neutral' | 'gold') => {
    const stroke = tone === 'gto' ? '#3b8ff0' : tone === 'exploit' ? '#e85f2a' : tone === 'gold' ? '#fbbf24' : '#3d4a60';
    const fill = tone === 'gto' ? 'rgba(59,143,240,0.08)' : tone === 'exploit' ? 'rgba(232,95,42,0.08)' : tone === 'gold' ? 'rgba(251,191,36,0.08)' : 'rgba(28,37,54,0.6)';
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} rx={14} fill={fill} stroke={stroke} strokeOpacity={0.7} strokeWidth={1.5} />
        <text x={x + w / 2} y={y + 26} textAnchor="middle" fontSize="14" fontWeight="700" fill="#e6ebf2" fontFamily="Space Grotesk, Inter, sans-serif">
          {title}
        </text>
        {sub.map((s, i) => (
          <text key={i} x={x + w / 2} y={y + 46 + i * 16} textAnchor="middle" fontSize="11.5" fill="#94a1b8">
            {s}
          </text>
        ))}
      </g>
    );
  };
  const arrow = (d: string, color: string, label?: { x: number; y: number; t: string }) => (
    <g>
      <path d={d} fill="none" stroke={color} strokeWidth={2} markerEnd={`url(#ah-${color.slice(1)})`} />
      {label && (
        <text x={label.x} y={label.y} textAnchor="middle" fontSize="11" fill={color} fontFamily="JetBrains Mono, monospace">
          {label.t}
        </text>
      )}
    </g>
  );
  const colors = ['#3b8ff0', '#e85f2a', '#fbbf24', '#64738c'];
  return (
    <div className="overflow-x-auto">
      <svg viewBox="0 0 1040 430" className="min-w-[760px]" role="img" aria-label="System architecture diagram">
        <defs>
          {colors.map((c) => (
            <marker key={c} id={`ah-${c.slice(1)}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={c} />
            </marker>
          ))}
        </defs>

        <text x={20} y={30} fontSize="11" fill="#3b8ff0" fontWeight="700" letterSpacing="2">
          GTO LAYER · OFFLINE MCCFR
        </text>
        <text x={20} y={252} fontSize="11" fill="#e85f2a" fontWeight="700" letterSpacing="2">
          EXPLOIT LAYER · ONLINE MODEL + OFFLINE PPO
        </text>

        {box(20, 46, 190, 92, 'Game state', ['hole cards · board', 'betting history'], 'neutral')}
        {box(260, 46, 210, 92, 'Card abstraction', ['169 preflop classes', '32 E[HS²] buckets / street'], 'gto')}
        {box(520, 46, 210, 92, 'CFR blueprint', ['external-sampling MCCFR', 'linear CFR + pruning'], 'gto')}

        {box(20, 268, 190, 92, 'Public actions', ['every hand played', '+ cards seen at showdown'], 'neutral')}
        {box(260, 268, 210, 92, 'Opponent model', ['16 Beta-Bernoulli', 'posteriors (GTO prior)'], 'exploit')}
        {box(520, 268, 210, 92, 'Policy network', ['MLP 36→64→64→4', 'trained with PPO'], 'exploit')}

        {box(790, 150, 230, 112, 'Policy tilt', ['σ(a) ∝ σ_GTO(a) · exp(λ·Δ_g(a))', 'within-group mix kept', 'λ = 0 ⇒ exactly GTO'], 'gold')}
        {box(840, 330, 130, 60, 'Action', [], 'neutral')}

        {arrow('M210,92 L256,92', '#64738c')}
        {arrow('M470,92 L516,92', '#3b8ff0', { x: 493, y: 84, t: 'bucket' })}
        {arrow('M730,92 C770,92 780,140 800,150', '#3b8ff0', { x: 776, y: 88, t: 'σ_GTO' })}
        {arrow('M210,314 L256,314', '#64738c')}
        {arrow('M470,314 L516,314', '#e85f2a', { x: 493, y: 306, t: 'x_opp' })}
        {arrow('M730,314 C770,314 780,262 800,262', '#e85f2a', { x: 772, y: 330, t: 'Δ (4 groups)' })}
        {arrow('M625,138 L625,264', '#3b8ff0', { x: 690, y: 205, t: 'σ_GTO mass, state' })}
        {arrow('M905,262 L905,326', '#fbbf24')}

        <g>
          <rect x={800} y={46} width={210} height={64} rx={12} fill="rgba(28,37,54,0.6)" stroke="#3d4a60" strokeDasharray="4 4" />
          <text x={905} y={72} textAnchor="middle" fontSize="12.5" fontWeight="700" fill="#e6ebf2">
            Exploit gate λ
          </text>
          <text x={905} y={92} textAnchor="middle" fontSize="11" fill="#94a1b8">
            user slider · risk budget
          </text>
        </g>
        {arrow('M905,110 L905,146', '#64738c')}

        <text x={20} y={410} fontSize="11" fill="#64738c">
          Safety by construction: Bayesian shrinkage (no data ⇒ GTO features) · bounded Δ = 3·tanh(·) · L2 trust region to the blueprint · optional profit-based risk budget
        </text>
      </svg>
    </div>
  );
}
