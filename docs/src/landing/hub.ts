// The hub diagram: marketplace lines converge into the Lonca engine and leave
// for "your own code" (solid, today) and "Lonca Panel" (dashed, soon). Drawn on
// a canvas at runtime so the order dots can travel along the lines.
// Geometry is in the comp's hub box: 470 x 235 design units.

type Pt = [number, number];
type Curve = { from: Pt; c1: Pt; c2: Pt; to: Pt; dashed?: boolean };

const W = 470;
const H = 235;
// The canvas extends PAD units beyond the hub box on every side.
const PAD = 60;
const CW = W + PAD * 2;
const CH = H + PAD * 2;

const IN: Curve[] = [
  { from: [98, 68.5], c1: [140, 68.5], c2: [140, 122], to: [174, 122] },
  { from: [98, 135.5], c1: [135, 135.5], c2: [140, 136], to: [174, 136] },
  { from: [98, 204.5], c1: [140, 204.5], c2: [140, 150], to: [174, 150] },
];
const OUT: Curve[] = [
  { from: [252, 134], c1: [292, 134], c2: [292, 90], to: [330, 90] },
  { from: [252, 134], c1: [292, 134], c2: [292, 183.5], to: [330, 183.5], dashed: true },
];
const NODE: Pt = [213, 136];

const LINE = '#3a3d42';
const DOT = '#3e77d2';
const DOT_SOFT = 'rgba(91, 143, 230, 0.55)';

function at(c: Curve, t: number): Pt {
  const u = 1 - t;
  const x =
    u * u * u * c.from[0] + 3 * u * u * t * c.c1[0] + 3 * u * t * t * c.c2[0] + t * t * t * c.to[0];
  const y =
    u * u * u * c.from[1] + 3 * u * u * t * c.c1[1] + 3 * u * t * t * c.c2[1] + t * t * t * c.to[1];
  return [x, y];
}

function draw(ctx: CanvasRenderingContext2D, s: number, time: number | null) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, CW * s, CH * s);
  ctx.translate(PAD * s, PAD * s);

  // Glow behind the engine node.
  const g = ctx.createRadialGradient(
    NODE[0] * s,
    NODE[1] * s,
    0,
    NODE[0] * s,
    NODE[1] * s,
    140 * s,
  );
  g.addColorStop(0, 'rgba(240, 243, 250, 0.9)');
  g.addColorStop(0.22, 'rgba(225, 230, 242, 0.42)');
  g.addColorStop(0.5, 'rgba(200, 206, 222, 0.12)');
  g.addColorStop(1, 'rgba(10, 11, 12, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(-PAD * s, -PAD * s, CW * s, CH * s);

  ctx.lineWidth = 1.2 * s;
  ctx.strokeStyle = LINE;
  for (const c of [...IN, ...OUT]) {
    ctx.setLineDash(c.dashed ? [4 * s, 4 * s] : []);
    ctx.beginPath();
    ctx.moveTo(c.from[0] * s, c.from[1] * s);
    ctx.bezierCurveTo(c.c1[0] * s, c.c1[1] * s, c.c2[0] * s, c.c2[1] * s, c.to[0] * s, c.to[1] * s);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  const dot = (p: Pt, r: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p[0] * s, p[1] * s, r * s, 0, Math.PI * 2);
    ctx.fill();
  };

  // Fixed ports on the node and the mid-line markers from the comp.
  for (const c of IN) {
    dot(c.to, 3.2, DOT);
    dot(at(c, 0.42), 3.2, DOT);
  }
  dot(OUT[0].from, 3.2, DOT);

  // Travelling order dots: in from each marketplace, out to code (and,
  // fainter, to the panel that is still coming).
  if (time !== null) {
    const period = 2600;
    IN.forEach((c, i) => {
      const t = ((time + i * 700) % period) / period;
      dot(at(c, t), 2.2, DOT_SOFT);
    });
    const tOut = ((time + 1300) % period) / period;
    dot(at(OUT[0], tOut), 2.2, DOT_SOFT);
    const tPanel = ((time + 400) % (period * 1.6)) / (period * 1.6);
    dot(at(OUT[1], tPanel), 1.8, 'rgba(91, 143, 230, 0.28)');
  }
}

export function mountHub(root: HTMLElement) {
  const canvas = root.querySelector('canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let scale = 1;
  let visible = true;
  let raf = 0;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    scale = canvas.width / CW;
    draw(ctx, scale, reduce.matches ? null : performance.now());
  };

  const loop = (now: number) => {
    draw(ctx, scale, now);
    raf = visible && !reduce.matches ? requestAnimationFrame(loop) : 0;
  };

  new ResizeObserver(resize).observe(root);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !raf && !reduce.matches) raf = requestAnimationFrame(loop);
  }).observe(root);
  reduce.addEventListener('change', resize);
  resize();
  if (!reduce.matches) raf = requestAnimationFrame(loop);
}
