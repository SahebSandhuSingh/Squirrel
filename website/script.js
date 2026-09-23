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
    { name: "Shades", src: "assets/avatar-1.jpg" },
    { name: "Headband", src: "assets/avatar-2.jpg" },
    { name: "Hoodie", src: "assets/avatar-3.jpg" },
    { name: "Cap", src: "assets/avatar-4.jpg" },
    { name: "Headphones", src: "assets/avatar-5.jpg" },
  ];

  const track = $("#avatarTrack");
  AVATARS.forEach((a, i) => {
    const btn = document.createElement("button");
    btn.className = "avatar";
    btn.type = "button";
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-label", `${a.name} avatar`);
    btn.setAttribute("aria-selected", i === 0 ? "true" : "false");
    btn.innerHTML = `<img src="${a.src}" alt="" loading="lazy" />`;
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
