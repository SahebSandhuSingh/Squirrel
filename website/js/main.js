(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fmt = new Intl.NumberFormat("en-US");
  document.documentElement.classList.add("js");

  // run fn once when el scrolls into view (immediately if IO is unavailable)
  const onVisible = (el, fn, threshold = 0.35) => {
    if (!el) return;
    if (!("IntersectionObserver" in window)) { fn(el); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { io.disconnect(); fn(el); } });
    }, { threshold });
    io.observe(el);
  };
  const faceStyle = ([x, y], s) => `--fx:${x};--fy:${y}${s ? `;--s:${s}` : ""}`;

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

  /* Solid header once scrolled; underline the link for the section in view */
  const sectionLinks = $$(".nav-links a:not(.btn)");
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
    { label: "The Runner", src: "assets/avatar-1.jpg", desc: "Park loops before sunrise. Lives for a negative split.",
      stats: { Speed: 0.9, Strength: 0.45, Social: 0.6 }, perk: "Starter perk: bonus XP on runs" },
    { label: "The Lifter", src: "assets/avatar-2.jpg", desc: "Gym at 6, protein at 7. Counts plates, not steps.",
      stats: { Speed: 0.4, Strength: 0.95, Social: 0.55 }, perk: "Starter perk: strength streak shield" },
    { label: "The Weekend Warrior", src: "assets/avatar-3.jpg", desc: "Quiet all week. Saturday football, Sunday trek.",
      stats: { Speed: 0.6, Strength: 0.65, Social: 0.85 }, perk: "Starter perk: double XP on weekends" },
    { label: "The Early Bird", src: "assets/avatar-4.jpg", desc: "Up before the city. First to every meetup.",
      stats: { Speed: 0.7, Strength: 0.55, Social: 0.75 }, perk: "Starter perk: dawn-patrol bonus" },
    { label: "The Night Moves", src: "assets/avatar-5.jpg", desc: "Headphones in, streetlights on. Late runs, big playlists.",
      stats: { Speed: 0.75, Strength: 0.5, Social: 0.65 }, perk: "Starter perk: night-run XP boost" },
  ];
  const grid = $("#avatarGrid");
  const profile = $("#avatarProfile");
  const renderProfile = (a) => {
    $("#apName").textContent = a.label;
    $("#apDesc").textContent = a.desc;
    $("#apPerk span").textContent = a.perk;
    $("#apStats").innerHTML = Object.entries(a.stats)
      .map(([k, v]) => `<div><dt>${k}</dt><dd><span class="bar" aria-hidden="true"><i style="--fill:${v}"></i></span></dd></div>`)
      .join("");
  };
  AVATARS.forEach((a, i) => {
    const btn = document.createElement("button");
    btn.className = "avatar";
    btn.type = "button";
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-selected", i === 0 ? "true" : "false");
    btn.innerHTML = `<span class="av-img"><img src="${a.src}" alt="" loading="lazy" /></span><span class="av-label">${a.label}</span>`;
    btn.addEventListener("click", () => {
      $$(".avatar", grid).forEach((b) => b.setAttribute("aria-selected", "false"));
      btn.setAttribute("aria-selected", "true");
      renderProfile(a);
      if (!reduceMotion) {
        [btn, profile].forEach((el) => {
          const cls = el === btn ? "pop" : "swap";
          el.classList.remove(cls);
          void el.offsetWidth; // restart the animation
          el.classList.add(cls);
        });
      }
    });
    grid.appendChild(btn);
  });
  renderProfile(AVATARS[0]);

  /* ---------------- Leaderboard ---------------- */
  // Face positions (centre x, y in px) inside assets/phone.jpg
  const FACES = {
    Aarav: [87, 808],
    Meera: [180, 808],
    Rohan: [273, 808],
    Diya: [365, 808],
    Kabir: [267, 232],
  };
  // [name, XP, streak in days] — sample data
  const BOARD = {
    week: [["Aarav", 25430, 12], ["Meera", 21980, 8], ["Rohan", 18640, 21], ["Diya", 16210, 5], ["Kabir", 14980, 3]],
    month: [["Meera", 98410, 8], ["Aarav", 94720, 12], ["Diya", 81305, 5], ["Rohan", 77960, 21], ["Kabir", 70115, 3]],
    all: [["Kabir", 412880, 3], ["Meera", 398210, 8], ["Aarav", 377045, 12], ["Rohan", 341990, 21], ["Diya", 322460, 5]],
  };
  const FLAME = '<svg class="i" aria-hidden="true"><use href="#i-flame"/></svg>';
  const CROWN = '<svg class="crown" viewBox="0 0 40 30"><path d="M3 26 L6 6 L14 16 L20 3 L26 16 L34 6 L37 26 Z"/></svg>';
  const rankCell = (i) => {
    if (i === 0) return `<span class="lb-rank" aria-label="Rank 1">${CROWN}</span>`;
    if (i === 2) return `<span class="lb-rank bronze" aria-label="Rank 3"><span>3</span></span>`;
    return `<span class="lb-rank">${i + 1}</span>`;
  };
  const lbList = $("#lbList");
  function renderBoard(range) {
    lbList.innerHTML = BOARD[range]
      .map(
        ([name, score, streak], i) => `<li${i === 0 ? ' class="first"' : ""}>
          ${rankCell(i)}
          <span class="face" style="${faceStyle(FACES[name])}" aria-hidden="true"></span>
          <span class="lb-who">
            <span class="lb-name">${name}</span>
            <span class="lb-streak">${FLAME}${streak} day streak${i === 0 ? ' <span class="lb-pace">· Pace setter</span>' : ""}</span>
          </span>
          <span class="lb-score">${fmt.format(score)}<small>XP</small></span>
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
    const decimals = Number(el.dataset.decimals || 0);
    const show = (v) => {
      const n = decimals ? v.toFixed(decimals) : Math.round(v);
      el.textContent = (el.dataset.format === "comma" ? fmt.format(n) : n) + suffix;
    };
    if (reduceMotion) { show(target); return; }
    const dur = 1200;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / dur, 1);
      show(target * (1 - Math.pow(1 - p, 3)));
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

  /* ---------------- Join early access ---------------- */
  const form = $("#joinForm");
  const email = $("#email");
  const msg = $("#joinMsg");
  const defaultMsg = msg.textContent;

  // every "Join early access" button scrolls to the form and puts the cursor in the email box
  $$("[data-join]").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      $("#join").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      setTimeout(() => email.focus({ preventScroll: true }), reduceMotion ? 0 : 600);
    })
  );

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
    email.setAttribute("aria-invalid", String(!ok));
    msg.classList.toggle("err", !ok);
    msg.classList.toggle("ok", ok);
    if (!ok) {
      msg.textContent = "Enter a valid email to join early access.";
      email.focus();
      return;
    }
    // Hook up your waitlist backend here, e.g.
    // fetch("/api/waitlist", { method: "POST", body: new FormData(form) })
    msg.textContent = "You're on the list. See you out there.";
    $(".pass").classList.add("done");
    form.reset();
  });
  email.addEventListener("input", () => {
    if (!msg.classList.contains("err")) return;
    email.removeAttribute("aria-invalid");
    msg.classList.remove("err");
    msg.textContent = defaultMsg;
  });

  /* ---------------- Video modal ---------------- */
  const videoModal = $("#videoModal");
  $("#watchVideo").addEventListener("click", () =>
    typeof videoModal.showModal === "function" ? videoModal.showModal() : videoModal.setAttribute("open", "")
  );
  videoModal.addEventListener("click", (e) => { if (e.target === videoModal) videoModal.close(); });

  /* ---------------- Hero: demo activity ticker ---------------- */
  const TICKS = [
    ["Aarav", "just completed a 5K", "Viman Nagar", "+420 XP"],
    ["Meera", "started a head-to-head", "Koregaon Park", "vs Rohan"],
    ["Rohan", "claimed a block", "Kharadi", "+900 XP"],
    ["Diya", "hit a 7 day streak", "Baner", "+150 XP"],
    ["Kabir", "joined a Sunday crew run", "Kalyani Nagar", "+80 XP"],
  ];
  const PIN = '<svg class="i" aria-hidden="true"><use href="#i-pin"/></svg>';
  const tickerItem = $("#tickerItem");
  if (tickerItem && !reduceMotion) {
    let t = 0;
    setInterval(() => {
      if (document.hidden) return;
      t = (t + 1) % TICKS.length;
      const [name, what, where, xp] = TICKS[t];
      tickerItem.classList.remove("in");
      tickerItem.classList.add("out");
      setTimeout(() => {
        tickerItem.innerHTML = `<i class="face" style="${faceStyle(FACES[name])}" aria-hidden="true"></i>
          <span><b>${name}</b> ${what}</span>
          <span class="chip chip-loc">${PIN}${where}</span>
          <span class="chip ${xp.startsWith("+") ? "chip-xp" : "chip-pink"}">${xp}</span>`;
        tickerItem.classList.remove("out");
        tickerItem.classList.add("in");
      }, 300);
    }, 3600);
  }

  /* ---------------- Progress bars, ring, XP blocks, strike-through ---------------- */
  // bars start empty and fill to their inline --fill value once visible
  if (!reduceMotion) {
    $$(".bar i[style*='--fill']").forEach((bar) => {
      const value = bar.style.getPropertyValue("--fill");
      if (bar.id === "zcFill") return;
      bar.style.setProperty("--fill", "0");
      onVisible(bar, () => requestAnimationFrame(() => bar.style.setProperty("--fill", value)), 0.6);
    });
    $$(".ring-fg").forEach((ring) => {
      const value = ring.style.getPropertyValue("--p");
      ring.style.setProperty("--p", "0");
      onVisible(ring, () => requestAnimationFrame(() => ring.style.setProperty("--p", value)), 0.6);
    });
  }
  onVisible($(".m-xp"), (el) => el.classList.add("lit"), 0.5);
  onVisible($(".what"), (el) => el.classList.add("in"), 0.4);

  /* ---------------- Tilt toward the pointer ---------------- */
  if (!reduceMotion && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    $$("[data-tilt]").forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        card.style.setProperty("--ry", `${(x * 6).toFixed(2)}deg`);
        card.style.setProperty("--rx", `${(-y * 6).toFixed(2)}deg`);
      });
      card.addEventListener("pointerleave", () => {
        card.style.removeProperty("--rx");
        card.style.removeProperty("--ry");
      });
    });
  }

  /* ---------------- Head-to-head: steps keep ticking while it's on screen ---------------- */
  const h2h = { me: 8420, them: 7890 };
  const h2hMe = $("#h2hMe");
  const h2hThem = $("#h2hThem");
  const h2hBar = $("#h2hBar");
  const h2hStatus = $("#h2hStatus");
  const renderH2H = () => {
    h2hMe.textContent = fmt.format(h2h.me);
    h2hThem.textContent = fmt.format(h2h.them);
    h2hBar.style.setProperty("--me", (h2h.me / (h2h.me + h2h.them)).toFixed(3));
    const winning = h2h.me >= h2h.them;
    const label = winning ? "You're winning" : "Rohan's ahead — move!";
    if (h2hStatus.textContent !== label) {
      h2hStatus.textContent = label;
      h2hStatus.classList.toggle("losing", !winning);
      h2hStatus.classList.remove("bump");
      void h2hStatus.offsetWidth;
      h2hStatus.classList.add("bump");
    }
  };
  if (!reduceMotion && "IntersectionObserver" in window) {
    let h2hTimer = null;
    new IntersectionObserver(([e]) => {
      clearInterval(h2hTimer);
      if (!e.isIntersecting) return;
      h2hTimer = setInterval(() => {
        h2h.me += Math.round(Math.random() * 40);
        h2h.them += Math.round(Math.random() * 46);
        renderH2H();
      }, 1400);
    }, { threshold: 0.4 }).observe($(".b-h2h"));
  }

  /* ---------------- Territory map ---------------- */
  const ZONES = {
    viman: { status: "Your crew", name: "Viman Nagar", pct: 0.82, meta: "2,340 XP to claim · Defended by 14 movers", c: "var(--lime)" },
    hinjewadi: { status: "Rival crew", name: "Hinjewadi", pct: 0.67, meta: "Held by Hinjewadi Hustlers · 4,100 XP to flip", c: "var(--pink)" },
    kharadi: { status: "Contested", name: "Kharadi", pct: 0.48, meta: "Neck and neck · 3 crews fighting for it", c: "var(--yellow)" },
  };
  const zoneCard = $("#zoneCard");
  $$(".zone-tag").forEach((tag) =>
    tag.addEventListener("click", () => {
      const z = ZONES[tag.dataset.zone];
      $$(".zone-tag").forEach((t) => t.setAttribute("aria-pressed", String(t === tag)));
      zoneCard.style.setProperty("--c", z.c);
      $("#zcStatus").textContent = z.status;
      $("#zcName").textContent = z.name;
      $("#zcPct").textContent = `${Math.round(z.pct * 100)}%`;
      $("#zcFill").style.setProperty("--fill", z.pct);
      $("#zcMeta").textContent = z.meta;
    })
  );

  /* ---------------- Small toggles: RSVP + follow ---------------- */
  const rsvp = $("#rsvpBtn");
  const going = $("#goingCount");
  rsvp.addEventListener("click", () => {
    const on = rsvp.getAttribute("aria-pressed") !== "true";
    rsvp.setAttribute("aria-pressed", String(on));
    rsvp.innerHTML = on ? "You're going ✓" : 'I\'m in <span class="arrow">→</span>';
    going.textContent = on ? "4" : "3";
  });
  $$(".follow").forEach((btn) =>
    btn.addEventListener("click", () => {
      const on = btn.getAttribute("aria-pressed") !== "true";
      btn.setAttribute("aria-pressed", String(on));
      btn.textContent = on ? "Following" : "Follow";
    })
  );

  /* ---------------- Right now: demo feed ---------------- */
  const FEED = [
    { name: "Aarav", what: "Completed 5K", where: "Viman Nagar", chip: ["+420 XP", "chip-xp"], c: "var(--lime)" },
    { name: "Meera", what: "Started a head-to-head", where: null, chip: ["vs Rohan", "chip-pink"], c: "var(--pink)" },
    { name: "Diya", what: "Finished today's challenge", where: "Baner", chip: ["7 day streak", "chip-orange"], c: "var(--orange)" },
    { name: "Rohan", what: "Claimed a block", where: "Kharadi", chip: ["Territory", "chip-yellow"], c: "var(--yellow)" },
    { name: "Kabir", what: "Joined Sunday long run", where: "Kalyani Nagar", chip: ["Crew", "chip-purple"], c: "var(--purple)" },
    { name: "Meera", what: "Levelled up", where: null, chip: ["Level 10", "chip-xp"], c: "var(--lime)" },
    { name: "Aarav", what: "Beat Kabir by 312 steps", where: null, chip: ["+500 XP", "chip-xp"], c: "var(--pink)" },
    { name: "Diya", what: "Defended the park", where: "Aundh", chip: ["Territory", "chip-yellow"], c: "var(--yellow)" },
  ];
  const feed = $("#feed");
  const feedRow = (f, ago) => {
    const li = document.createElement("li");
    li.style.setProperty("--c", f.c);
    li.innerHTML = `<span class="dot" aria-hidden="true"></span>
      <i class="face" style="${faceStyle(FACES[f.name])}" aria-hidden="true"></i>
      <span class="feed-text"><b>${f.name}</b><span>${f.what}</span>${f.where ? `<span class="chip chip-loc">${PIN}${f.where}</span>` : ""}</span>
      <span class="feed-meta"><span class="chip ${f.chip[1]}">${f.chip[0]}</span><time>${ago}</time></span>`;
    return li;
  };
  FEED.slice(0, 4).forEach((f, i) => feed.appendChild(feedRow(f, i === 0 ? "just now" : `${i * 2}m ago`)));
  if (!reduceMotion && "IntersectionObserver" in window) {
    let next = 4;
    let feedTimer = null;
    new IntersectionObserver(([e]) => {
      clearInterval(feedTimer);
      if (!e.isIntersecting) return;
      feedTimer = setInterval(() => {
        $$("time", feed).forEach((t, i) => { t.textContent = `${(i + 1) * 2}m ago`; });
        const li = feedRow(FEED[next % FEED.length], "just now");
        li.classList.add("new");
        feed.prepend(li);
        next += 1;
        while (feed.children.length > 5) feed.lastElementChild.remove();
      }, 3200);
    }, { threshold: 0.3 }).observe(feed);
  }

  /* ---------------- Launch countdown ---------------- */
  const LAUNCH = new Date(2026, 9, 2, 0, 0, 0); // 02 / 10 / 26, visitor's local time
  const pad = (n) => String(n).padStart(2, "0");
  const cd = { d: $("#cdDays"), h: $("#cdHours"), m: $("#cdMins"), s: $("#cdSecs") };
  const renderCountdown = () => {
    const left = Math.max(0, LAUNCH - Date.now());
    const sec = Math.floor(left / 1000);
    cd.d.textContent = pad(Math.floor(sec / 86400));
    cd.h.textContent = pad(Math.floor(sec / 3600) % 24);
    cd.m.textContent = pad(Math.floor(sec / 60) % 60);
    cd.s.textContent = pad(sec % 60);
    if (left === 0) $("#countdown").setAttribute("aria-label", "Squirrel Social is live");
  };
  renderCountdown();
  setInterval(renderCountdown, 1000);

  /* ---------------- Reveal on scroll ---------------- */
  const revealTargets = $$(
    ".pillar, .step, .module, .battle, .terr-copy, .terr-map-wrap, .avatars, .profile, .crew-wall, .live-head, .feed, " +
    ".board-col, .places-col, .why-row, .launch-inner, .join > *, .faq details, .footer-top"
  );
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
