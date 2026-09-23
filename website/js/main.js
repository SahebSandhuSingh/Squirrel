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
  $$(".nav-links a, .nav-menu-cta").forEach((a) =>
    a.addEventListener("click", () => {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    })
  );

  /* Solid header once scrolled; underline the link for the section in view */
  const sectionLinks = $$(".nav-links a");
  const sections = sectionLinks
    .map((a) => document.querySelector(a.getAttribute("href")))
    .filter(Boolean);
  const setActive = (id) =>
    sectionLinks.forEach((a) => {
      const on = a.getAttribute("href") === "#" + id;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  // after a nav click, keep that link underlined until its scroll finishes
  let lockedTo = null;
  let lockTimer;
  let lockedAt = 0;
  const unlock = () => { lockedTo = null; clearTimeout(lockTimer); };
  sectionLinks.forEach((a) =>
    a.addEventListener("click", () => {
      lockedTo = a.getAttribute("href").slice(1);
      lockedAt = performance.now();
      setActive(lockedTo);
      clearTimeout(lockTimer);
      lockTimer = setTimeout(unlock, 1500);
    })
  );
  // Chrome can fire a stray scrollend as the smooth scroll starts, so ignore early ones
  window.addEventListener("scrollend", () => {
    if (lockedTo && performance.now() - lockedAt > 250) setTimeout(unlock, 50);
  });

  let ticking = false;
  const onScroll = () => {
    ticking = false;
    nav.classList.toggle("scrolled", window.scrollY > 10);
    if (lockedTo) return;
    const line = window.innerHeight * 0.4;
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    // the footer (Community) sits last on the page, so it wins once you hit the bottom
    const current = atBottom
      ? sections.reduce((a, b) => (a.offsetTop > b.offsetTop ? a : b))
      : sections.filter((s) => s.getBoundingClientRect().top <= line)
          .reduce((a, b) => (a && a.offsetTop > b.offsetTop ? a : b), null);
    setActive(current ? current.id : "home");
  };
  onScroll();
  window.addEventListener("scroll", () => {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });

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
  // Face positions (centre x, y in px) inside assets/phone.jpg
  const FACES = {
    Aarav: [87, 808],
    Meera: [180, 808],
    Rohan: [273, 808],
    Diya: [365, 808],
    Kabir: [267, 232],
  };
  const BOARD = {
    week: [["Aarav", 25430], ["Meera", 21980], ["Rohan", 18640], ["Diya", 16210], ["Kabir", 14980]],
    month: [["Meera", 98410], ["Aarav", 94720], ["Diya", 81305], ["Rohan", 77960], ["Kabir", 70115]],
    all: [["Kabir", 412880], ["Meera", 398210], ["Aarav", 377045], ["Rohan", 341990], ["Diya", 322460]],
  };
  const lbList = $("#lbList");
  const fmt = new Intl.NumberFormat("en-US");
  function renderBoard(range) {
    lbList.innerHTML = BOARD[range]
      .map(
        ([name, score], i) => `<li>
          <span class="lb-rank">${i + 1}</span>
          <span class="face" style="--fx:${FACES[name][0]};--fy:${FACES[name][1]}" aria-hidden="true"></span>
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
