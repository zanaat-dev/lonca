// Landing interactions: waitlist forms, copy chips, code tabs, live numbers,
// the comparison reveal and the closing pattern.

const MESSAGES = {
  tr: {
    invalid: 'Geçerli bir e-posta adresi yaz.',
    sending: 'Gönderiliyor…',
    ok: 'Listedesin. Panel açılınca ilk haberi sen alacaksın.',
    error: 'Kaydedemedik. Biraz sonra tekrar dene ya da hello@zanaat.dev adresine yaz.',
    closed:
      'Bekleme listesi çok yakında açılıyor. Şimdilik hello@zanaat.dev adresine yazabilirsin.',
  },
  en: {
    invalid: 'Enter a valid email address.',
    sending: 'Sending…',
    ok: 'You are on the list. You will hear first when the panel opens.',
    error: 'We could not save that. Try again shortly or write to hello@zanaat.dev.',
    closed: 'The waitlist opens very soon. Until then, write to hello@zanaat.dev.',
  },
} as const;

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function mountWaitlist(form: HTMLFormElement) {
  const lang = form.dataset.lang === 'en' ? 'en' : 'tr';
  const m = MESSAGES[lang];
  const endpoint = form.dataset.endpoint ?? '';
  const note =
    form.querySelector<HTMLElement>('.form-note') ??
    (form.nextElementSibling as HTMLElement | null);
  const input = form.querySelector<HTMLInputElement>('input[type="email"]');
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const say = (text: string, state: 'ok' | 'error' | 'info') => {
    if (!note) return;
    note.textContent = text;
    note.dataset.state = state;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!input || !button) return;
    const email = input.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      say(m.invalid, 'error');
      input.focus();
      return;
    }
    if (!endpoint) {
      say(m.closed, 'info');
      return;
    }
    const data = new FormData(form);
    button.disabled = true;
    say(m.sending, 'info');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          lang,
          source: form.classList.contains('waitlist-full') ? 'codesign' : 'hero',
          needs: data.getAll('needs').map(String),
          volume: String(data.get('volume') ?? ''),
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      form.reset();
      say(m.ok, 'ok');
    } catch {
      say(m.error, 'error');
    } finally {
      button.disabled = false;
    }
  });
}

export function mountCopy(el: HTMLButtonElement) {
  const text = el.dataset.copy ?? '';
  const done = el.dataset.copied ?? 'Copied';
  const code = el.querySelector('code');
  el.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      if (code) {
        code.textContent = done;
        setTimeout(() => (code.textContent = text), 1400);
      }
    } catch {
      if (!code) return;
      const range = document.createRange();
      range.selectNodeContents(code);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  });
}

export function mountTabs(card: HTMLElement) {
  const tabs = [...card.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const select = (tab: HTMLButtonElement) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls') ?? '');
      if (panel) panel.hidden = !on;
    }
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      select(next);
      next.focus();
    });
  });
}

// Marks [data-reveal] blocks once they enter the viewport. Content is visible
// by default; the class only plays the comparison strike-through.
export function mountReveal() {
  const els = document.querySelectorAll<HTMLElement>('[data-reveal]');
  if (reduceMotion() || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      }
    },
    { threshold: 0.35 },
  );
  els.forEach((el) => io.observe(el));
}

// Closing band: a slow drift of the Lonca icon's square units.
export function mountPattern(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let w = 0;
  let h = 0;
  let raf = 0;
  let visible = false;
  const cell = 28;
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = r.width;
    h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(0);
  };
  const hash = (x: number, y: number) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const draw = (t: number) => {
    ctx.clearRect(0, 0, w, h);
    const shift = (t / 90) % cell;
    for (let y = -1; y * cell < h + cell; y++) {
      for (let x = -1; x * cell < w + cell; x++) {
        const v = hash(x, y);
        if (v < 0.82) continue;
        const pulse = 0.5 + 0.5 * Math.sin(t / 1400 + v * 40);
        ctx.fillStyle = `rgba(62, 119, 210, ${0.05 + pulse * 0.12})`;
        const size = v > 0.95 ? cell - 6 : v > 0.9 ? (cell - 6) / 2 : (cell - 6) / 4;
        ctx.fillRect(x * cell + shift + 3, y * cell + 3, size, size);
      }
    }
  };
  const loop = (now: number) => {
    draw(now);
    raf = visible ? requestAnimationFrame(loop) : 0;
  };
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting && !reduceMotion();
    if (visible && !raf) raf = requestAnimationFrame(loop);
  }).observe(canvas);
  resize();
}
