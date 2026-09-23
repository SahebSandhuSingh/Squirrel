(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- Mobile nav ---------------- */
  const nav = $(".nav");
  const toggle = $("#navToggle");
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  $$(".nav-links a").forEach((a) =>
    a.addEventListener("click", () => {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    })
  );

  /* Highlight the nav link for the section in view */
  const sectionLinks = $$(".nav-links a");
  const sections = sectionLinks
    .map((a) => document.querySelector(a.getAttribute("href")))
    .filter(Boolean);
  const spy = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        sectionLinks.forEach((a) =>
          a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id)
        );
      });
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );
  sections.forEach((s) => spy.observe(s));

  /* ---------------- Avatars ---------------- */
  const AVATARS = [
    { name: "Shades", fur: "#c8743a", outfit: "#151515", acc: "shades" },
    { name: "Headband", fur: "#b86a3c", outfit: "#ff2d9b", acc: "headband" },
    { name: "Hoodie", fur: "#6b4a3a", outfit: "#1d1d1f", acc: "hood" },
    { name: "Cap", fur: "#d0823f", outfit: "#2f3b22", acc: "cap" },
    { name: "Beats", fur: "#b5663a", outfit: "#8fa2c9", acc: "phones" },
    { name: "Crown", fur: "#c77b45", outfit: "#d7ff1f", acc: "crown" },
  ];

  const accessory = {
    shades: `<rect x="36" y="53" width="21" height="13" rx="5" fill="#0a0a0a"/><rect x="63" y="53" width="21" height="13" rx="5" fill="#0a0a0a"/><path d="M57 58h6" stroke="#0a0a0a" stroke-width="3"/><path d="M40 56l6 0" stroke="#555" stroke-width="2" stroke-linecap="round"/>`,
    headband: `<path d="M27 46 Q60 30 93 46 L91 54 Q60 39 29 54 Z" fill="#ff2d9b"/><path d="M28 50 Q60 36 92 50" stroke="#fff" stroke-width="1.5" fill="none" opacity=".6"/>`,
    hood: `<path d="M18 110 Q14 40 60 22 Q106 40 102 110 Z" fill="#1d1d1f"/><path d="M28 104 Q26 52 60 40 Q94 52 92 104" fill="none" stroke="#2c2c2f" stroke-width="3"/>`,
    cap: `<path d="M30 46 Q32 22 60 22 Q88 22 90 46 Z" fill="#3c4d2a"/><path d="M58 44 Q88 40 104 48 Q88 52 60 50 Z" fill="#2c3a1f"/><rect x="55" y="27" width="10" height="7" rx="2" fill="#d7ff1f"/>`,
    phones: `<path d="M24 62 Q24 18 60 18 Q96 18 96 62" fill="none" stroke="#1a1a1a" stroke-width="6"/><rect x="16" y="54" width="14" height="22" rx="6" fill="#a855f7"/><rect x="90" y="54" width="14" height="22" rx="6" fill="#a855f7"/>`,
    crown: `<path d="M40 34 L44 16 L52 26 L60 12 L68 26 L76 16 L80 34 Z" fill="#d7ff1f" stroke="#0b0b0b" stroke-width="2" stroke-linejoin="round"/>`,
  };

  function squirrel({ fur, outfit, acc }) {
    const hoodBehind = acc === "hood" ? accessory.hood : "";
    const front = acc === "hood" ? "" : accessory[acc];
    return `<svg viewBox="0 0 120 132" aria-hidden="true">
      <path d="M92 126 Q128 96 110 58 Q100 34 116 20 Q84 22 88 62 Q92 92 76 118 Z" fill="${fur}" opacity=".85"/>
      ${hoodBehind}
      <path d="M26 132 Q28 98 60 96 Q92 98 94 132 Z" fill="${outfit}"/>
      <path d="M52 98 L60 110 L68 98" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="2"/>
      <path d="M32 44 L30 16 L50 34 Z" fill="${fur}"/><path d="M35 38 L34 24 L45 34 Z" fill="#f2a2a8"/>
      <path d="M88 44 L90 16 L70 34 Z" fill="${fur}"/><path d="M85 38 L86 24 L75 34 Z" fill="#f2a2a8"/>
      <ellipse cx="60" cy="64" rx="34" ry="31" fill="${fur}"/>
      <ellipse cx="60" cy="78" rx="21" ry="15" fill="#f4dcc0"/>
      <circle cx="47" cy="60" r="6" fill="#111"/><circle cx="73" cy="60" r="6" fill="#111"/>
      <circle cx="49" cy="58" r="2" fill="#fff"/><circle cx="75" cy="58" r="2" fill="#fff"/>
      <ellipse cx="60" cy="72" rx="4.5" ry="3.2" fill="#2a1a14"/>
      <path d="M54 79 Q60 84 66 79" fill="none" stroke="#2a1a14" stroke-width="2" stroke-linecap="round"/>
      <ellipse cx="38" cy="74" rx="5" ry="3" fill="#ff8fa3" opacity=".45"/><ellipse cx="82" cy="74" rx="5" ry="3" fill="#ff8fa3" opacity=".45"/>
      ${front}
    </svg>`;
  }

  const track = $("#avatarTrack");
  AVATARS.forEach((a, i) => {
    const btn = document.createElement("button");
    btn.className = "avatar";
    btn.type = "button";
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-label", `${a.name} avatar`);
    btn.setAttribute("aria-selected", i === 0 ? "true" : "false");
    btn.innerHTML = squirrel(a);
    btn.addEventListener("click", () => {
      $$(".avatar", track).forEach((b) => b.setAttribute("aria-selected", "false"));
      btn.setAttribute("aria-selected", "true");
    });
    track.appendChild(btn);
  });

  const scrollByCard = (dir) => {
    const card = $(".avatar", track);
    const step = card ? card.getBoundingClientRect().width + 14 : 150;
    track.scrollBy({ left: dir * step, behavior: reduceMotion ? "auto" : "smooth" });
  };
  $(".car-btn.prev").addEventListener("click", () => scrollByCard(-1));
  $(".car-btn.next").addEventListener("click", () => scrollByCard(1));

  /* ---------------- Leaderboard ---------------- */
  const BOARD = {
    week: [
      ["Aarav", 25430, "#f0b38b"],
      ["Meera", 21980, "#ff9fcf"],
      ["Rohan", 18640, "#c98c68"],
      ["Diya", 16210, "#e3b594"],
      ["Kabir", 14980, "#d7a07a"],
    ],
    month: [
      ["Meera", 98410, "#ff9fcf"],
      ["Aarav", 94720, "#f0b38b"],
      ["Ishaan", 81305, "#b8e0ff"],
      ["Rohan", 77960, "#c98c68"],
      ["Anaya", 70115, "#d9c2ff"],
    ],
    all: [
      ["Kabir", 412880, "#d7a07a"],
      ["Meera", 398210, "#ff9fcf"],
      ["Aarav", 377045, "#f0b38b"],
      ["Zoya", 341990, "#ffe08a"],
      ["Diya", 322460, "#e3b594"],
    ],
  };
  const lbList = $("#lbList");
  const fmt = new Intl.NumberFormat("en-US");
  function renderBoard(range) {
    lbList.innerHTML = BOARD[range]
      .map(
        ([name, score, c], i) => `<li>
          <span class="lb-rank">${i + 1}</span>
          <span class="lb-face" style="--c:${c}">${name[0]}</span>
          <span class="lb-name">${name}</span>
          <span class="lb-score">${fmt.format(score)}</span>
        </li>`
      )
      .join("");
  }
  $$(".lb-tabs button").forEach((tab) =>
    tab.addEventListener("click", () => {
      $$(".lb-tabs button").forEach((t) => {
        t.classList.toggle("on", t === tab);
        t.setAttribute("aria-selected", String(t === tab));
      });
      renderBoard(tab.dataset.range);
    })
  );
  renderBoard("week");

  /* ---------------- Stat counters ---------------- */
  const countUp = (el) => {
    const target = Number(el.dataset.count);
    const suffix = el.dataset.suffix || "";
    if (reduceMotion) { el.textContent = target + suffix; return; }
    const dur = 1200;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const statObs = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { countUp(e.target); obs.unobserve(e.target); }
      });
    },
    { threshold: 0.6 }
  );
  $$("[data-count]").forEach((el) => statObs.observe(el));

  /* ---------------- Phone: live run timer ---------------- */
  const runTime = $("#runTime");
  const pauseBtn = $("#pauseBtn");
  let seconds = 28 * 60 + 16;
  let running = !reduceMotion;
  const renderTime = () => {
    const m = Math.floor(seconds / 60);
    const s = String(seconds % 60).padStart(2, "0");
    runTime.textContent = `${m}:${s}`;
  };
  const setRunning = (on) => {
    running = on;
    pauseBtn.classList.toggle("paused", !on);
    pauseBtn.textContent = on ? "❚❚" : "▶";
    pauseBtn.setAttribute("aria-label", on ? "Pause run" : "Resume run");
  };
  setRunning(running);
  setInterval(() => { if (running) { seconds++; renderTime(); } }, 1000);
  pauseBtn.addEventListener("click", () => setRunning(!running));

  /* ---------------- Modals ---------------- */
  const joinModal = $("#joinModal");
  const videoModal = $("#videoModal");
  const openModal = (m) => (typeof m.showModal === "function" ? m.showModal() : m.setAttribute("open", ""));

  $$("[data-open-modal]").forEach((b) => b.addEventListener("click", () => openModal(joinModal)));
  $("#watchVideo").addEventListener("click", () => openModal(videoModal));
  [joinModal, videoModal].forEach((m) =>
    m.addEventListener("click", (e) => { if (e.target === m) m.close(); })
  );

  const form = $("#joinForm");
  const errorEl = $("#formError");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = form.elements.name;
    const email = form.elements.email;
    [name, email].forEach((f) => f.removeAttribute("aria-invalid"));

    if (!name.value.trim()) {
      name.setAttribute("aria-invalid", "true");
      errorEl.textContent = "Tell us what to call you.";
      name.focus();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
      email.setAttribute("aria-invalid", "true");
      errorEl.textContent = "That email doesn't look right.";
      email.focus();
      return;
    }
    errorEl.textContent = "";
    // Hook up your waitlist backend here, e.g.
    // fetch("/api/waitlist", { method: "POST", body: new FormData(form) })
    $("#modalForm").hidden = true;
    $("#modalSuccess").hidden = false;
    form.reset();
  });
  joinModal.addEventListener("close", () => {
    $("#modalForm").hidden = false;
    $("#modalSuccess").hidden = true;
    errorEl.textContent = "";
  });

  /* ---------------- Reveal on scroll ---------------- */
  const revealTargets = $$(".pillar, .step, .tile, .leaderboard, .avatars, .faq details, .phone-wrap, .game-copy");
  if (!reduceMotion && "IntersectionObserver" in window) {
    revealTargets.forEach((el) => el.classList.add("reveal"));
    const ro = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((e) => {
          if (e.isIntersecting) { e.target.classList.add("in"); obs.unobserve(e.target); }
        });
      },
      { threshold: 0.15 }
    );
    revealTargets.forEach((el) => ro.observe(el));
  }

  $("#year").textContent = new Date().getFullYear();
})();
