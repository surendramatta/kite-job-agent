export default function MatchRing({ score, size = 54 }: { score: number; size?: number }) {
  const color = score >= 75 ? "var(--green)" : score >= 50 ? "var(--accent)" : "var(--amber)";
  const bg = `conic-gradient(${color} ${score * 3.6}deg, var(--border) 0deg)`;
  return (
    <div className="match-ring" style={{ width: size, height: size, background: bg }}>
      <div
        className="absolute rounded-full bg-white flex items-center justify-center"
        style={{ inset: 4 }}
      >
        <span style={{ color }}>{score}%</span>
      </div>
    </div>
  );
}
