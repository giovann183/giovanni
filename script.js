/* ==========================================================================
   Study Planner — script.js
   Vanilla JS single-page app. All data lives in localStorage.
   ========================================================================== */
(function () {
"use strict";

/* ---------------------------------------------------------------------- */
/* Constants                                                               */
/* ---------------------------------------------------------------------- */
const DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const DAY_SHORT = { "Senin":"Sen","Selasa":"Sel","Rabu":"Rab","Kamis":"Kam","Jumat":"Jum","Sabtu":"Sab","Minggu":"Min" };
const MONTH_NAMES = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const QUOTES = [
  "Sedikit demi sedikit, lama-lama jadi bukit. 🌱",
  "Kamu tidak harus sempurna, kamu hanya harus mulai. ✨",
  "Belajar hari ini, bangga di masa depan. 🚀",
  "Fokus 25 menit lebih baik daripada scroll 2 jam. ⏱️",
  "Istirahat itu penting, tapi jangan lupa kembali belajar. 🌤️",
  "Kesalahan adalah bukti bahwa kamu sedang mencoba. 💪",
  "Satu halaman hari ini, satu langkah lebih dekat ke tujuan. 📖",
  "Masa depanmu dibentuk oleh kebiasaan hari ini. 🌟",
];
const CHECKLIST_DEFAULT = ["Belajar materi", "Membaca catatan", "Mengerjakan latihan", "Review materi"];
const PRIORITY_ORDER = { "Tinggi": 0, "Sedang": 1, "Rendah": 2 };

const LS_USERS = "sp_users_v1";
const LS_SESSION = "sp_session_v1";
const dataKey = (u) => `sp_data_v1_${u}`;

/* ---------------------------------------------------------------------- */
/* Storage layer                                                          */
/* ---------------------------------------------------------------------- */
const Store = {
  loadUsers() { return JSON.parse(localStorage.getItem(LS_USERS) || "{}"); },
  saveUsers(u) { localStorage.setItem(LS_USERS, JSON.stringify(u)); },
  getSession() { return localStorage.getItem(LS_SESSION) || null; },
  setSession(username) { localStorage.setItem(LS_SESSION, username); },
  clearSession() { localStorage.removeItem(LS_SESSION); },
  loadData(username) {
    const raw = localStorage.getItem(dataKey(username));
    if (raw) return JSON.parse(raw);
    return {
      schedule: [], study: [], tasks: [],
      settings: { theme: "light", notifEnabled: false, remindHour: "07:00", displayName: username === "__guest__" ? "Tamu" : username },
      dismissedReminders: [],
    };
  },
  saveData(username, data) { localStorage.setItem(dataKey(username), JSON.stringify(data)); },
};

/* ---------------------------------------------------------------------- */
/* App State                                                              */
/* ---------------------------------------------------------------------- */
const App = {
  user: null,
  data: null,
  route: "dashboard",
  scheduleFilterDay: "Semua",
  scheduleSearch: "",
  taskFilterStatus: "Semua",
  taskFilterSubject: "Semua",
  taskSearch: "",
  taskSort: "deadline",
  calMonth: new Date().getMonth(),
  calYear: new Date().getFullYear(),
  calSelected: null,
};

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function save() { Store.saveData(App.user, App.data); }
function todayISO() { return isoDate(new Date()); }
function isoDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function parseISO(iso) { const [y,m,d] = iso.split("-").map(Number); return new Date(y, m-1, d); }
function todayDayName() { return DAYS[(new Date().getDay() + 6) % 7]; }
function fmtDateHuman(iso) {
  if (!iso) return "-";
  const d = parseISO(iso);
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function minutesBetween(startHHMM, endHHMM) {
  const [sh, sm] = startHHMM.split(":").map(Number);
  const [eh, em] = endHHMM.split(":").map(Number);
  return Math.max(0, (eh*60+em) - (sh*60+sm));
}

/* ---------------------------------------------------------------------- */
/* Toasts                                                                  */
/* ---------------------------------------------------------------------- */
function toast(msg, type = "info", timeout = 4200) {
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 220);
  }, timeout);
}

/* ---------------------------------------------------------------------- */
/* Modal helper                                                           */
/* ---------------------------------------------------------------------- */
function openModal(title, bodyHtml, opts = {}) {
  const root = document.getElementById("modal-root");
  root.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal-box" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="modal-close" id="modal-close-btn" aria-label="Tutup">✕</button>
        </div>
        <div id="modal-body">${bodyHtml}</div>
      </div>
    </div>`;
  document.getElementById("modal-close-btn").onclick = closeModal;
  document.getElementById("modal-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "modal-backdrop") closeModal();
  });
  if (opts.onOpen) opts.onOpen();
}
function closeModal() { document.getElementById("modal-root").innerHTML = ""; }

function confirmModal(title, text, onConfirm, confirmLabel = "Hapus", danger = true) {
  openModal(title, `
    <p class="modal-confirm-text">${text}</p>
    <div class="modal-actions">
      <button class="btn btn-secondary btn-block" id="cm-cancel">Batal</button>
      <button class="btn ${danger ? "btn-danger" : "btn-primary"} btn-block" id="cm-ok">${confirmLabel}</button>
    </div>
  `);
  document.getElementById("cm-cancel").onclick = closeModal;
  document.getElementById("cm-ok").onclick = () => { onConfirm(); closeModal(); };
}

/* ---------------------------------------------------------------------- */
/* Auth                                                                    */
/* ---------------------------------------------------------------------- */
function initAuth() {
  document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".auth-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const isLogin = tab.dataset.tab === "login";
      document.getElementById("login-form").classList.toggle("hidden", !isLogin);
      document.getElementById("register-form").classList.toggle("hidden", isLogin);
    });
  });

  document.getElementById("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;
    const errEl = document.getElementById("login-error");
    errEl.textContent = "";
    if (!username || !password) { errEl.textContent = "Nama pengguna dan password wajib diisi."; return; }
    const users = Store.loadUsers();
    if (!users[username] || users[username] !== password) {
      errEl.textContent = "Nama pengguna atau password salah.";
      return;
    }
    loginAs(username);
  });

  document.getElementById("register-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const username = document.getElementById("register-username").value.trim();
    const password = document.getElementById("register-password").value;
    const password2 = document.getElementById("register-password2").value;
    const errEl = document.getElementById("register-error");
    errEl.textContent = "";
    if (!username || !password || !password2) { errEl.textContent = "Semua kolom wajib diisi."; return; }
    if (password.length < 4) { errEl.textContent = "Password minimal 4 karakter."; return; }
    if (password !== password2) { errEl.textContent = "Password tidak cocok."; return; }
    const users = Store.loadUsers();
    if (users[username]) { errEl.textContent = "Nama pengguna sudah digunakan."; return; }
    users[username] = password;
    Store.saveUsers(users);
    toast("Akun berhasil dibuat! Selamat belajar 🎉", "success");
    loginAs(username);
  });

  document.getElementById("guest-btn").addEventListener("click", () => loginAs("__guest__"));
  document.getElementById("logout-btn").addEventListener("click", () => {
    confirmModal("Keluar", "Yakin ingin keluar dari akun ini?", () => logout(), "Keluar", false);
  });
}

function loginAs(username) {
  App.user = username;
  App.data = Store.loadData(username);
  if (!App.data.settings.displayName) App.data.settings.displayName = username === "__guest__" ? "Tamu" : username;
  save();
  Store.setSession(username);
  applyTheme(App.data.settings.theme);
  document.getElementById("auth-screen").classList.add("hidden");
  document.getElementById("app-shell").classList.remove("hidden");
  navigate("dashboard");
  scheduleReminderCheck();
}

function logout() {
  Store.clearSession();
  App.user = null; App.data = null;
  document.getElementById("app-shell").classList.add("hidden");
  document.getElementById("auth-screen").classList.remove("hidden");
  document.getElementById("login-form").reset();
}

/* ---------------------------------------------------------------------- */
/* Theme                                                                   */
/* ---------------------------------------------------------------------- */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.getElementById("theme-toggle-btn").textContent = theme === "dark" ? "☀️" : "🌙";
}
function toggleTheme() {
  const cur = App.data.settings.theme === "dark" ? "light" : "dark";
  App.data.settings.theme = cur;
  save();
  applyTheme(cur);
}

/* ---------------------------------------------------------------------- */
/* Navigation                                                              */
/* ---------------------------------------------------------------------- */
const ROUTE_TITLES = {
  dashboard: "Dashboard", schedule: "Jadwal Pelajaran", study: "Jadwal Belajar",
  tasks: "Tugas", reminders: "Pengingat", calendar: "Kalender", stats: "Statistik", settings: "Pengaturan",
};

function navigate(route) {
  App.route = route;
  document.getElementById("topbar-title").textContent = ROUTE_TITLES[route] || "Study Planner";
  document.querySelectorAll(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.route === route));
  document.querySelectorAll(".bnav-item").forEach((n) => n.classList.toggle("active", n.dataset.route === route));
  closeSidebar();
  render();
}

function closeSidebar() {
  document.querySelector(".sidebar").classList.remove("open");
  const bd = document.querySelector(".sidebar-backdrop");
  if (bd) bd.classList.remove("show");
}

function initNav() {
  document.querySelectorAll(".nav-item, .bnav-item").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.route));
  });
  document.getElementById("hamburger-btn").addEventListener("click", () => {
    let bd = document.querySelector(".sidebar-backdrop");
    if (!bd) {
      bd = document.createElement("div");
      bd.className = "sidebar-backdrop";
      bd.addEventListener("click", closeSidebar);
      document.body.appendChild(bd);
    }
    document.querySelector(".sidebar").classList.add("open");
    bd.classList.add("show");
  });
  document.getElementById("theme-toggle-btn").addEventListener("click", toggleTheme);
}

/* ---------------------------------------------------------------------- */
/* Reminder computation                                                    */
/* ---------------------------------------------------------------------- */
// Returns { level: 'overdue'|'today'|'tomorrow'|'soon'|null, daysLeft }
function reminderLevel(task) {
  if (task.status === "Selesai") return { level: null, daysLeft: null };
  const now = new Date();
  const deadline = parseDeadline(task);
  const diffMs = deadline - now;
  const diffDays = Math.ceil(diffMs / 86400000);
  if (diffMs < 0) return { level: "overdue", daysLeft: diffDays };
  const todayStr = todayISO();
  if (task.deadlineDate === todayStr) return { level: "today", daysLeft: 0 };
  const tmr = new Date(); tmr.setDate(tmr.getDate() + 1);
  if (task.deadlineDate === isoDate(tmr)) return { level: "tomorrow", daysLeft: 1 };
  const d2 = new Date(); d2.setDate(d2.getDate() + 2);
  if (task.deadlineDate === isoDate(d2)) return { level: "soon", daysLeft: 2 };
  return { level: null, daysLeft: diffDays };
}
function parseDeadline(task) {
  const [y,m,d] = task.deadlineDate.split("-").map(Number);
  const [hh,mm] = (task.deadlineTime || "23:59").split(":").map(Number);
  return new Date(y, m-1, d, hh, mm);
}
function urgencyPill(task) {
  if (task.status === "Selesai") return `<span class="pill pill-green">✅ Selesai</span>`;
  const { level } = reminderLevel(task);
  if (level === "overdue") return `<span class="pill pill-red">❗ Lewat deadline</span>`;
  if (level === "today") return `<span class="pill pill-red">🔴 Hari ini</span>`;
  if (level === "tomorrow") return `<span class="pill pill-orange">🟠 Besok</span>`;
  if (level === "soon") return `<span class="pill pill-orange">🟠 2 hari lagi</span>`;
  return `<span class="pill pill-green">🟢 Masih cukup waktu</span>`;
}
function countdownText(task) {
  const now = new Date();
  const deadline = parseDeadline(task);
  let diff = deadline - now;
  if (diff <= 0) return "Sudah lewat";
  const days = Math.floor(diff / 86400000); diff -= days*86400000;
  const hours = Math.floor(diff / 3600000); diff -= hours*3600000;
  const mins = Math.floor(diff / 60000); diff -= mins*60000;
  const secs = Math.floor(diff / 1000);
  if (days > 0) return `${days}h ${hours}j ${mins}m lagi`;
  if (hours > 0) return `${hours}j ${mins}m ${secs}d lagi`;
  return `${mins}m ${secs}d lagi`;
}

function activeReminders() {
  return App.data.tasks
    .map((t) => ({ task: t, ...reminderLevel(t) }))
    .filter((r) => r.level && !App.data.dismissedReminders.includes(r.task.id + "_" + r.level));
}

function updateReminderBadge() {
  const n = activeReminders().length;
  ["nav-reminder-badge", "nav-reminder-badge-m"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = n > 9 ? "9+" : String(n);
    el.classList.toggle("show", n > 0);
  });
}

let reminderCheckTimer = null;
function scheduleReminderCheck() {
  runReminderCheck();
  if (reminderCheckTimer) clearInterval(reminderCheckTimer);
  reminderCheckTimer = setInterval(runReminderCheck, 60000);
}
function runReminderCheck() {
  if (!App.data) return;
  updateReminderBadge();
  const reminders = activeReminders();
  const seenKey = "sp_seen_toast_" + todayISO();
  let seen = JSON.parse(sessionStorage.getItem(seenKey) || "[]");
  reminders.forEach((r) => {
    const key = r.task.id + "_" + r.level;
    if (seen.includes(key)) return;
    seen.push(key);
    const msgs = {
      overdue: `❗ Deadline tugas "${escapeHtml(r.task.name)}" telah lewat.`,
      today: `🔴 Tugas "${escapeHtml(r.task.name)}" dikumpulkan HARI INI!`,
      tomorrow: `🚨 Tugas "${escapeHtml(r.task.name)}" dikumpulkan BESOK!`,
      soon: `⚠️ Tugas "${escapeHtml(r.task.name)}" dikumpulkan 2 hari lagi!`,
    };
    toast(msgs[r.level], r.level === "soon" ? "warning" : "danger");
    if (App.data.settings.notifEnabled && "Notification" in window && Notification.permission === "granted") {
      try { new Notification("Study Planner", { body: msgs[r.level] }); } catch (e) {}
    }
  });
  sessionStorage.setItem(seenKey, JSON.stringify(seen));
}

/* ---------------------------------------------------------------------- */
/* Render dispatcher                                                       */
/* ---------------------------------------------------------------------- */
function render() {
  const c = document.getElementById("view-container");
  updateReminderBadge();
  removeFab();
  switch (App.route) {
    case "dashboard": c.innerHTML = renderDashboard(); afterDashboard(); break;
    case "schedule": c.innerHTML = renderSchedule(); afterSchedule(); addFab(() => openScheduleModal()); break;
    case "study": c.innerHTML = renderStudy(); afterStudy(); addFab(() => openStudyModal()); break;
    case "tasks": c.innerHTML = renderTasks(); afterTasks(); addFab(() => openTaskModal()); break;
    case "reminders": c.innerHTML = renderReminders(); afterReminders(); break;
    case "calendar": c.innerHTML = renderCalendar(); afterCalendar(); break;
    case "stats": c.innerHTML = renderStats(); break;
    case "settings": c.innerHTML = renderSettings(); afterSettings(); break;
    default: c.innerHTML = "<p>Halaman tidak ditemukan.</p>";
  }
  startCountdownTicker();
}

function addFab(onClick) {
  const fab = document.createElement("button");
  fab.className = "fab"; fab.id = "fab-btn"; fab.textContent = "+";
  fab.addEventListener("click", onClick);
  document.querySelector(".main-content").appendChild(fab);
}
function removeFab() { const f = document.getElementById("fab-btn"); if (f) f.remove(); }

/* ---------------------------------------------------------------------- */
/* Countdown ticker (updates chips every second without full re-render)    */
/* ---------------------------------------------------------------------- */
let countdownTimer = null;
function startCountdownTicker() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    document.querySelectorAll("[data-countdown-id]").forEach((el) => {
      const task = App.data.tasks.find((t) => t.id === el.dataset.countdownId);
      if (task) el.textContent = countdownText(task);
    });
  }, 1000);
}

/* ---------------------------------------------------------------------- */
/* DASHBOARD                                                               */
/* ---------------------------------------------------------------------- */
function renderDashboard() {
  const today = todayDayName();
  const todaySchedule = App.data.schedule.filter((s) => s.day === today).sort((a,b)=>a.startTime.localeCompare(b.startTime));
  const undone = App.data.tasks.filter((t) => t.status !== "Selesai");
  const nearest = [...undone].sort((a,b)=> parseDeadline(a)-parseDeadline(b))[0];
  const nowMin = new Date().getHours()*60+new Date().getMinutes();
  const nextClass = todaySchedule.find((s) => {
    const [h,m] = s.startTime.split(":").map(Number);
    return h*60+m >= nowMin;
  });
  const quote = QUOTES[new Date().getDate() % QUOTES.length];
  const dateStr = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const todayStudy = App.data.study.filter((s) => s.date === todayISO());
  const studyDoneToday = todayStudy.filter((s) => s.done).length;
  const studyPct = todayStudy.length ? Math.round((studyDoneToday/todayStudy.length)*100) : 0;
  const ringCirc = 2*Math.PI*38;
  const ringOffset = ringCirc - (studyPct/100)*ringCirc;

  return `
    <div class="hero-card">
      <h2 class="hero-greeting">Halo, ${escapeHtml(App.data.settings.displayName)}! 👋</h2>
      <p class="hero-date">${dateStr}</p>
      <div class="hero-quote">💡 ${quote}</div>
    </div>

    <div class="stat-row">
      <div class="stat-card"><span class="stat-icon">📚</span><span class="stat-value">${todaySchedule.length}</span><span class="stat-label">Pelajaran hari ini</span></div>
      <div class="stat-card"><span class="stat-icon">📝</span><span class="stat-value">${undone.length}</span><span class="stat-label">Tugas belum selesai</span></div>
      <div class="stat-card"><span class="stat-icon">⏰</span><span class="stat-value">${nearest ? fmtDateHuman(nearest.deadlineDate) : "-"}</span><span class="stat-label">Deadline terdekat</span></div>
      <div class="stat-card"><span class="stat-icon">🔔</span><span class="stat-value">${activeReminders().length}</span><span class="stat-label">Pengingat aktif</span></div>
    </div>

    <div class="grid-2">
      <div class="card">
        <h3 class="section-title">📅 Jadwal Hari Ini <span class="pill pill-blue">${today}</span></h3>
        ${todaySchedule.length === 0 ? emptyState("📭","Tidak ada pelajaran hari ini.") :
          todaySchedule.map((s) => `
            <div class="list-row">
              <span class="list-dot" style="background:var(--color-primary)"></span>
              <div class="list-row-main">
                <div class="list-row-title">${escapeHtml(s.subject)} ${s.favorite ? "⭐" : ""}</div>
                <div class="list-row-sub">${s.startTime}–${s.endTime}${s.room ? " · "+escapeHtml(s.room) : ""}</div>
              </div>
            </div>`).join("")}
        ${nextClass ? `<div class="entity-notes">➡️ Selanjutnya: <b>${escapeHtml(nextClass.subject)}</b> pukul ${nextClass.startTime}</div>` : ""}
      </div>

      <div class="card">
        <h3 class="section-title">🎯 Tugas Terdekat</h3>
        ${nearest ? `
          <div class="list-row">
            <div class="list-row-main">
              <div class="list-row-title">${escapeHtml(nearest.name)}</div>
              <div class="list-row-sub">${escapeHtml(nearest.subject)} · ${fmtDateHuman(nearest.deadlineDate)} ${nearest.deadlineTime}</div>
            </div>
            ${urgencyPill(nearest)}
          </div>
          <div class="entity-notes">⏳ <span data-countdown-id="${nearest.id}">${countdownText(nearest)}</span></div>
        ` : emptyState("🎉","Tidak ada tugas tertunda. Mantap!")}
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <h3 class="section-title">📖 Progress Belajar Hari Ini</h3>
      <div class="progress-ring-wrap">
        <div class="progress-ring">
          <svg width="96" height="96" viewBox="0 0 96 96">
            <circle class="progress-ring-bg" cx="48" cy="48" r="38"></circle>
            <circle class="progress-ring-fill" cx="48" cy="48" r="38" stroke-dasharray="${ringCirc}" stroke-dashoffset="${ringOffset}"></circle>
          </svg>
          <div class="progress-ring-label">${studyPct}%</div>
        </div>
        <div>
          <div class="list-row-title">${studyDoneToday} dari ${todayStudy.length} sesi selesai</div>
          <div class="list-row-sub">Sesi belajar terjadwal untuk hari ini</div>
          <button class="btn btn-secondary btn-sm" id="dash-goto-study" style="margin-top:10px">Buka Jadwal Belajar</button>
        </div>
      </div>
    </div>
  `;
}
function afterDashboard() {
  const btn = document.getElementById("dash-goto-study");
  if (btn) btn.addEventListener("click", () => navigate("study"));
}
function emptyState(icon, text) {
  return `<div class="list-empty"><span class="list-empty-icon">${icon}</span>${text}</div>`;
}

/* ---------------------------------------------------------------------- */
/* SCHEDULE (Jadwal Pelajaran)                                             */
/* ---------------------------------------------------------------------- */
function renderSchedule() {
  const dayFilter = App.scheduleFilterDay;
  let list = App.data.schedule.slice();
  if (dayFilter !== "Semua") list = list.filter((s) => s.day === dayFilter);
  if (App.scheduleSearch) {
    const q = App.scheduleSearch.toLowerCase();
    list = list.filter((s) => s.subject.toLowerCase().includes(q) || (s.teacher||"").toLowerCase().includes(q));
  }
  list.sort((a,b) => DAYS.indexOf(a.day)-DAYS.indexOf(b.day) || a.startTime.localeCompare(b.startTime));

  return `
    <p class="page-lead">Kelola jadwal mata pelajaran sekolahmu, Senin sampai Minggu.</p>
    <div class="toolbar">
      <input type="text" id="sch-search" placeholder="🔍 Cari mata pelajaran / guru" value="${escapeHtml(App.scheduleSearch)}">
      <span class="spacer"></span>
    </div>
    <div class="day-tabs" id="sch-day-tabs">
      <button class="day-tab ${dayFilter==="Semua"?"active":""}" data-day="Semua">Semua</button>
      ${DAYS.map((d) => `<button class="day-tab ${dayFilter===d?"active":""}" data-day="${d}">${DAY_SHORT[d]}</button>`).join("")}
    </div>
    <div id="sch-list">
      ${list.length === 0 ? emptyState("📚","Belum ada jadwal. Tambahkan mata pelajaran pertamamu!") :
        list.map(scheduleCardHtml).join("")}
    </div>
  `;
}
function scheduleCardHtml(s) {
  return `
    <div class="entity-card" style="border-left-color: ${s.favorite ? "var(--color-warning)" : "var(--color-primary)"}">
      <div class="entity-top">
        <div>
          <p class="entity-title">${escapeHtml(s.subject)}</p>
          <div class="entity-meta">
            <span>📅 ${s.day}</span>
            <span>🕐 ${s.startTime}–${s.endTime}</span>
            ${s.teacher ? `<span>👤 ${escapeHtml(s.teacher)}</span>` : ""}
            ${s.room ? `<span>🚪 ${escapeHtml(s.room)}</span>` : ""}
          </div>
        </div>
        <div class="entity-actions">
          <button class="fav-star ${s.favorite?"active":""}" data-fav="${s.id}" title="Favorit">★</button>
          <button class="btn-icon" data-edit-sch="${s.id}" title="Edit">✏️</button>
          <button class="btn-icon" data-del-sch="${s.id}" title="Hapus">🗑️</button>
        </div>
      </div>
      ${s.notes ? `<div class="entity-notes">${escapeHtml(s.notes)}</div>` : ""}
    </div>`;
}
function afterSchedule() {
  document.getElementById("sch-search").addEventListener("input", (e) => { App.scheduleSearch = e.target.value; render(); });
  document.querySelectorAll("#sch-day-tabs .day-tab").forEach((btn) => {
    btn.addEventListener("click", () => { App.scheduleFilterDay = btn.dataset.day; render(); });
  });
  document.querySelectorAll("[data-fav]").forEach((btn) => btn.addEventListener("click", () => {
    const item = App.data.schedule.find((s) => s.id === btn.dataset.fav);
    item.favorite = !item.favorite; save(); render();
  }));
  document.querySelectorAll("[data-edit-sch]").forEach((btn) => btn.addEventListener("click", () => openScheduleModal(btn.dataset.editSch)));
  document.querySelectorAll("[data-del-sch]").forEach((btn) => btn.addEventListener("click", () => {
    confirmModal("Hapus Jadwal", "Yakin ingin menghapus jadwal pelajaran ini?", () => {
      App.data.schedule = App.data.schedule.filter((s) => s.id !== btn.dataset.delSch);
      save(); render(); toast("Jadwal dihapus.", "success");
    });
  }));
}
function openScheduleModal(id) {
  const editing = id ? App.data.schedule.find((s) => s.id === id) : null;
  openModal(editing ? "Edit Jadwal Pelajaran" : "Tambah Jadwal Pelajaran", `
    <form id="sch-form">
      <label>Nama mata pelajaran
        <input type="text" id="f-subject" value="${editing ? escapeHtml(editing.subject) : ""}" placeholder="cth. Matematika">
      </label>
      <div class="field-error" id="err-subject"></div>
      <label>Hari
        <select id="f-day">${DAYS.map((d) => `<option value="${d}" ${editing && editing.day===d?"selected":""}>${d}</option>`).join("")}</select>
      </label>
      <div class="form-row">
        <label>Jam mulai<input type="time" id="f-start" value="${editing ? editing.startTime : "07:00"}"></label>
        <label>Jam selesai<input type="time" id="f-end" value="${editing ? editing.endTime : "08:00"}"></label>
      </div>
      <div class="field-error" id="err-time"></div>
      <label>Nama guru (opsional)<input type="text" id="f-teacher" value="${editing ? escapeHtml(editing.teacher||"") : ""}"></label>
      <label>Ruang kelas (opsional)<input type="text" id="f-room" value="${editing ? escapeHtml(editing.room||"") : ""}"></label>
      <label>Catatan (opsional)<textarea id="f-notes">${editing ? escapeHtml(editing.notes||"") : ""}</textarea></label>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary btn-block" id="sch-cancel">Batal</button>
        <button type="submit" class="btn btn-primary btn-block">${editing ? "Simpan" : "Tambah"}</button>
      </div>
    </form>
  `);
  document.getElementById("sch-cancel").onclick = closeModal;
  document.getElementById("sch-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const subject = document.getElementById("f-subject").value.trim();
    const start = document.getElementById("f-start").value;
    const end = document.getElementById("f-end").value;
    document.getElementById("err-subject").textContent = "";
    document.getElementById("err-time").textContent = "";
    let ok = true;
    if (!subject) { document.getElementById("err-subject").textContent = "Nama mata pelajaran wajib diisi."; ok = false; }
    if (!start || !end || start >= end) { document.getElementById("err-time").textContent = "Jam tidak valid — jam selesai harus setelah jam mulai."; ok = false; }
    if (!ok) return;
    const payload = {
      subject, day: document.getElementById("f-day").value, startTime: start, endTime: end,
      teacher: document.getElementById("f-teacher").value.trim(),
      room: document.getElementById("f-room").value.trim(),
      notes: document.getElementById("f-notes").value.trim(),
      favorite: editing ? editing.favorite : false,
    };
    if (editing) Object.assign(editing, payload);
    else App.data.schedule.push({ id: uid(), ...payload });
    save(); closeModal(); render();
    toast(editing ? "Jadwal diperbarui." : "Jadwal ditambahkan.", "success");
  });
}

/* ---------------------------------------------------------------------- */
/* STUDY PLAN (Jadwal Belajar)                                             */
/* ---------------------------------------------------------------------- */
function renderStudy() {
  const list = App.data.study.slice().sort((a,b) => (a.date+a.startTime).localeCompare(b.date+b.startTime));
  return `
    <p class="page-lead">Rencanakan sesi belajar mandiri dan pantau progresnya.</p>
    <div id="study-list">
      ${list.length === 0 ? emptyState("📖","Belum ada jadwal belajar. Yuk buat rencana belajar pertamamu!") :
        list.map(studyCardHtml).join("")}
    </div>
  `;
}
function studyCardHtml(s) {
  const checklist = s.checklist || [];
  const doneCount = checklist.filter((c) => c.done).length;
  return `
    <div class="entity-card ${s.done ? "done" : ""}" style="border-left-color: ${s.done ? "var(--color-success)" : "var(--color-accent)"}">
      <div class="entity-top">
        <div>
          <p class="entity-title ${s.done?"strike":""}">${escapeHtml(s.topic)}</p>
          <div class="entity-meta">
            <span>📅 ${fmtDateHuman(s.date)}</span>
            <span>🕐 ${s.startTime}–${s.endTime}</span>
            ${checklist.length ? `<span>✅ ${doneCount}/${checklist.length}</span>` : ""}
          </div>
          ${s.target ? `<div class="entity-notes">🎯 Target: ${escapeHtml(s.target)}</div>` : ""}
        </div>
        <div class="entity-actions">
          <button class="btn-icon" data-toggle-study="${s.id}" title="${s.done ? "Tandai belum selesai" : "Tandai selesai"}">${s.done ? "↩️" : "✔️"}</button>
          <button class="btn-icon" data-edit-study="${s.id}" title="Edit">✏️</button>
          <button class="btn-icon" data-del-study="${s.id}" title="Hapus">🗑️</button>
        </div>
      </div>
      ${s.notes ? `<div class="entity-notes">${escapeHtml(s.notes)}</div>` : ""}
      <div class="checklist" id="checklist-${s.id}">
        ${checklist.map((c) => `
          <div class="checklist-item ${c.done?"done":""}">
            <input type="checkbox" id="cl-${c.id}" data-checklist-toggle="${s.id}:${c.id}" ${c.done?"checked":""}>
            <label for="cl-${c.id}">${escapeHtml(c.text)}</label>
          </div>`).join("")}
        <div class="checklist-add">
          <input type="text" placeholder="Tambah checklist..." data-checklist-input="${s.id}">
          <button class="btn btn-secondary btn-sm" data-checklist-add="${s.id}">Tambah</button>
        </div>
      </div>
    </div>`;
}
function afterStudy() {
  document.querySelectorAll("[data-edit-study]").forEach((btn) => btn.addEventListener("click", () => openStudyModal(btn.dataset.editStudy)));
  document.querySelectorAll("[data-del-study]").forEach((btn) => btn.addEventListener("click", () => {
    confirmModal("Hapus Jadwal Belajar", "Yakin ingin menghapus sesi belajar ini?", () => {
      App.data.study = App.data.study.filter((s) => s.id !== btn.dataset.delStudy);
      save(); render(); toast("Jadwal belajar dihapus.", "success");
    });
  }));
  document.querySelectorAll("[data-toggle-study]").forEach((btn) => btn.addEventListener("click", () => {
    const item = App.data.study.find((s) => s.id === btn.dataset.toggleStudy);
    item.done = !item.done; save(); render();
    if (item.done) toast("Sesi belajar ditandai selesai! 🎉", "success");
  }));
  document.querySelectorAll("[data-checklist-toggle]").forEach((cb) => cb.addEventListener("change", () => {
    const [sid, cid] = cb.dataset.checklistToggle.split(":");
    const s = App.data.study.find((x) => x.id === sid);
    const c = s.checklist.find((x) => x.id === cid);
    c.done = cb.checked; save(); render();
  }));
  document.querySelectorAll("[data-checklist-add]").forEach((btn) => btn.addEventListener("click", () => {
    const sid = btn.dataset.checklistAdd;
    const input = document.querySelector(`[data-checklist-input="${sid}"]`);
    const text = input.value.trim();
    if (!text) return;
    const s = App.data.study.find((x) => x.id === sid);
    s.checklist = s.checklist || [];
    s.checklist.push({ id: uid(), text, done: false });
    save(); render();
  }));
}
function openStudyModal(id) {
  const editing = id ? App.data.study.find((s) => s.id === id) : null;
  const subjects = [...new Set(App.data.schedule.map((s) => s.subject))];
  openModal(editing ? "Edit Jadwal Belajar" : "Tambah Jadwal Belajar", `
    <form id="study-form">
      <label>Mata pelajaran / topik
        <input type="text" id="f-topic" list="subject-list" value="${editing ? escapeHtml(editing.topic) : ""}" placeholder="cth. Matematika — Persamaan Linear">
        <datalist id="subject-list">${subjects.map((s) => `<option value="${escapeHtml(s)}">`).join("")}</datalist>
      </label>
      <div class="field-error" id="err-topic"></div>
      <label>Tanggal<input type="date" id="f-date" value="${editing ? editing.date : todayISO()}"></label>
      <div class="form-row">
        <label>Jam mulai<input type="time" id="f-start" value="${editing ? editing.startTime : "19:00"}"></label>
        <label>Jam selesai<input type="time" id="f-end" value="${editing ? editing.endTime : "20:00"}"></label>
      </div>
      <div class="field-error" id="err-time"></div>
      <label>Target belajar<input type="text" id="f-target" value="${editing ? escapeHtml(editing.target||"") : ""}" placeholder="cth. Selesaikan 10 soal latihan"></label>
      <label>Catatan<textarea id="f-notes">${editing ? escapeHtml(editing.notes||"") : ""}</textarea></label>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary btn-block" id="study-cancel">Batal</button>
        <button type="submit" class="btn btn-primary btn-block">${editing ? "Simpan" : "Tambah"}</button>
      </div>
    </form>
  `);
  document.getElementById("study-cancel").onclick = closeModal;
  document.getElementById("study-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const topic = document.getElementById("f-topic").value.trim();
    const date = document.getElementById("f-date").value;
    const start = document.getElementById("f-start").value;
    const end = document.getElementById("f-end").value;
    document.getElementById("err-topic").textContent = "";
    document.getElementById("err-time").textContent = "";
    let ok = true;
    if (!topic) { document.getElementById("err-topic").textContent = "Topik belajar wajib diisi."; ok = false; }
    if (!date) { document.getElementById("err-time").textContent = "Tanggal wajib diisi."; ok = false; }
    else if (!start || !end || start >= end) { document.getElementById("err-time").textContent = "Jam tidak valid — jam selesai harus setelah jam mulai."; ok = false; }
    if (!ok) return;
    const payload = {
      topic, date, startTime: start, endTime: end,
      target: document.getElementById("f-target").value.trim(),
      notes: document.getElementById("f-notes").value.trim(),
    };
    if (editing) Object.assign(editing, payload);
    else App.data.study.push({ id: uid(), ...payload, done: false, checklist: CHECKLIST_DEFAULT.map((t) => ({ id: uid(), text: t, done: false })) });
    save(); closeModal(); render();
    toast(editing ? "Jadwal belajar diperbarui." : "Jadwal belajar ditambahkan.", "success");
  });
}

/* ---------------------------------------------------------------------- */
/* TASKS (Tugas)                                                           */
/* ---------------------------------------------------------------------- */
function renderTasks() {
  let list = App.data.tasks.slice();
  if (App.taskFilterStatus !== "Semua") list = list.filter((t) => t.status === App.taskFilterStatus);
  if (App.taskFilterSubject !== "Semua") list = list.filter((t) => t.subject === App.taskFilterSubject);
  if (App.taskSearch) {
    const q = App.taskSearch.toLowerCase();
    list = list.filter((t) => t.name.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q));
  }
  if (App.taskSort === "deadline") list.sort((a,b) => parseDeadline(a)-parseDeadline(b));
  else if (App.taskSort === "priority") list.sort((a,b) => PRIORITY_ORDER[a.priority]-PRIORITY_ORDER[b.priority]);
  else if (App.taskSort === "name") list.sort((a,b) => a.name.localeCompare(b.name));

  const subjects = [...new Set(App.data.tasks.map((t) => t.subject))];

  return `
    <p class="page-lead">Semua tugas sekolahmu, diurutkan berdasarkan deadline terdekat.</p>
    <div class="toolbar">
      <input type="text" id="task-search" placeholder="🔍 Cari tugas" value="${escapeHtml(App.taskSearch)}">
      <select id="task-filter-status">
        ${["Semua","Belum dikerjakan","Sedang dikerjakan","Selesai"].map((s) => `<option ${App.taskFilterStatus===s?"selected":""}>${s}</option>`).join("")}
      </select>
      <select id="task-filter-subject">
        <option ${App.taskFilterSubject==="Semua"?"selected":""}>Semua</option>
        ${subjects.map((s) => `<option ${App.taskFilterSubject===s?"selected":""}>${escapeHtml(s)}</option>`).join("")}
      </select>
      <select id="task-sort">
        <option value="deadline" ${App.taskSort==="deadline"?"selected":""}>Urutkan: Deadline</option>
        <option value="priority" ${App.taskSort==="priority"?"selected":""}>Urutkan: Prioritas</option>
        <option value="name" ${App.taskSort==="name"?"selected":""}>Urutkan: Nama</option>
      </select>
    </div>
    <div id="task-list">
      ${list.length === 0 ? emptyState("📝","Tidak ada tugas yang cocok. Tambahkan tugas baru!") :
        list.map(taskCardHtml).join("")}
    </div>
  `;
}
function taskCardHtml(t) {
  const prioColor = t.priority === "Tinggi" ? "var(--color-danger)" : t.priority === "Sedang" ? "var(--color-warning)" : "var(--color-success)";
  return `
    <div class="entity-card ${t.status==="Selesai"?"done":""}" style="border-left-color:${t.status==="Selesai"?"var(--color-success)":prioColor}">
      <div class="entity-top">
        <div>
          <p class="entity-title ${t.status==="Selesai"?"strike":""}">${escapeHtml(t.name)}</p>
          <div class="entity-meta">
            <span>📘 ${escapeHtml(t.subject)}</span>
            <span>📅 ${fmtDateHuman(t.deadlineDate)} ${t.deadlineTime}</span>
            <span>🚩 ${t.priority}</span>
          </div>
          <div class="entity-meta" style="margin-top:6px">
            ${urgencyPill(t)}
            <span class="pill pill-gray">${t.status}</span>
            ${t.status !== "Selesai" ? `<span class="countdown-chip" data-countdown-id="${t.id}">${countdownText(t)}</span>` : ""}
          </div>
        </div>
        <div class="entity-actions">
          <button class="btn-icon" data-edit-task="${t.id}" title="Edit">✏️</button>
          <button class="btn-icon" data-del-task="${t.id}" title="Hapus">🗑️</button>
        </div>
      </div>
      ${t.description ? `<div class="entity-notes">${escapeHtml(t.description)}</div>` : ""}
      <div class="modal-actions" style="margin-top:12px">
        ${t.status !== "Selesai" ? `<button class="btn btn-primary btn-sm btn-block" data-complete-task="${t.id}">✔️ Selesaikan Tugas</button>`
          : `<button class="btn btn-secondary btn-sm btn-block" data-uncomplete-task="${t.id}">↩️ Batal Selesai</button>`}
      </div>
    </div>`;
}
function afterTasks() {
  document.getElementById("task-search").addEventListener("input", (e) => { App.taskSearch = e.target.value; render(); });
  document.getElementById("task-filter-status").addEventListener("change", (e) => { App.taskFilterStatus = e.target.value; render(); });
  document.getElementById("task-filter-subject").addEventListener("change", (e) => { App.taskFilterSubject = e.target.value; render(); });
  document.getElementById("task-sort").addEventListener("change", (e) => { App.taskSort = e.target.value; render(); });
  document.querySelectorAll("[data-edit-task]").forEach((btn) => btn.addEventListener("click", () => openTaskModal(btn.dataset.editTask)));
  document.querySelectorAll("[data-del-task]").forEach((btn) => btn.addEventListener("click", () => {
    confirmModal("Hapus Tugas", "Yakin ingin menghapus tugas ini?", () => {
      App.data.tasks = App.data.tasks.filter((t) => t.id !== btn.dataset.delTask);
      save(); render(); toast("Tugas dihapus.", "success");
    });
  }));
  document.querySelectorAll("[data-complete-task]").forEach((btn) => btn.addEventListener("click", () => {
    const t = App.data.tasks.find((x) => x.id === btn.dataset.completeTask);
    t.status = "Selesai"; save(); render(); toast(`Tugas "${escapeHtml(t.name)}" selesai! 🎉`, "success");
  }));
  document.querySelectorAll("[data-uncomplete-task]").forEach((btn) => btn.addEventListener("click", () => {
    const t = App.data.tasks.find((x) => x.id === btn.dataset.uncompleteTask);
    t.status = "Sedang dikerjakan"; save(); render();
  }));
}
function openTaskModal(id) {
  const editing = id ? App.data.tasks.find((t) => t.id === id) : null;
  const subjects = [...new Set([...App.data.schedule.map((s) => s.subject), ...App.data.tasks.map((t) => t.subject)])];
  openModal(editing ? "Edit Tugas" : "Tambah Tugas", `
    <form id="task-form">
      <label>Nama tugas
        <input type="text" id="f-name" value="${editing ? escapeHtml(editing.name) : ""}" placeholder="cth. Mengerjakan halaman 45–50">
      </label>
      <div class="field-error" id="err-name"></div>
      <label>Mata pelajaran
        <input type="text" id="f-subject" list="task-subject-list" value="${editing ? escapeHtml(editing.subject) : ""}" placeholder="cth. Matematika">
        <datalist id="task-subject-list">${subjects.map((s) => `<option value="${escapeHtml(s)}">`).join("")}</datalist>
      </label>
      <div class="field-error" id="err-subject"></div>
      <label>Deskripsi tugas<textarea id="f-desc">${editing ? escapeHtml(editing.description||"") : ""}</textarea></label>
      <div class="form-row">
        <label>Tanggal diberikan<input type="date" id="f-given" value="${editing ? editing.dateGiven : todayISO()}"></label>
        <label>Tanggal deadline<input type="date" id="f-deadline" value="${editing ? editing.deadlineDate : todayISO()}"></label>
      </div>
      <div class="form-row">
        <label>Jam deadline<input type="time" id="f-deadline-time" value="${editing ? editing.deadlineTime : "23:59"}"></label>
        <label>Prioritas
          <select id="f-priority">
            ${["Tinggi","Sedang","Rendah"].map((p) => `<option ${editing && editing.priority===p?"selected":""}>${p}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="field-error" id="err-deadline"></div>
      <label>Status
        <select id="f-status">
          ${["Belum dikerjakan","Sedang dikerjakan","Selesai"].map((s) => `<option ${editing && editing.status===s?"selected":""}>${s}</option>`).join("")}
        </select>
      </label>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary btn-block" id="task-cancel">Batal</button>
        <button type="submit" class="btn btn-primary btn-block">${editing ? "Simpan" : "Tambah"}</button>
      </div>
    </form>
  `);
  document.getElementById("task-cancel").onclick = closeModal;
  document.getElementById("task-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("f-name").value.trim();
    const subject = document.getElementById("f-subject").value.trim();
    const deadlineDate = document.getElementById("f-deadline").value;
    const deadlineTime = document.getElementById("f-deadline-time").value;
    document.getElementById("err-name").textContent = "";
    document.getElementById("err-subject").textContent = "";
    document.getElementById("err-deadline").textContent = "";
    let ok = true;
    if (!name) { document.getElementById("err-name").textContent = "Nama tugas tidak boleh kosong."; ok = false; }
    if (!subject) { document.getElementById("err-subject").textContent = "Mata pelajaran tidak boleh kosong."; ok = false; }
    if (!deadlineDate || isNaN(parseISO(deadlineDate).getTime())) { document.getElementById("err-deadline").textContent = "Tanggal deadline tidak valid."; ok = false; }
    else if (!deadlineTime) { document.getElementById("err-deadline").textContent = "Jam deadline wajib diisi."; ok = false; }
    if (!ok) return;
    const payload = {
      name, subject, description: document.getElementById("f-desc").value.trim(),
      dateGiven: document.getElementById("f-given").value,
      deadlineDate, deadlineTime,
      priority: document.getElementById("f-priority").value,
      status: document.getElementById("f-status").value,
    };
    if (editing) Object.assign(editing, payload);
    else App.data.tasks.push({ id: uid(), ...payload });
    save(); closeModal(); render();
    toast(editing ? "Tugas diperbarui." : "Tugas ditambahkan.", "success");
  });
}

/* ---------------------------------------------------------------------- */
/* REMINDERS PAGE                                                          */
/* ---------------------------------------------------------------------- */
function renderReminders() {
  const groups = { today: [], tomorrow: [], soon: [], overdue: [] };
  App.data.tasks.forEach((t) => {
    const { level } = reminderLevel(t);
    if (level) groups[level].push(t);
  });
  const today = todayDayName();
  const upcomingClasses = App.data.schedule.filter((s) => s.day === today);
  const upcomingStudy = App.data.study.filter((s) => s.date === todayISO() && !s.done);

  const groupHtml = (title, dotClass, items, level) => `
    <div class="reminder-group">
      <div class="reminder-group-title"><span class="list-dot" style="background:${dotClass}"></span>${title} (${items.length})</div>
      ${items.length === 0 ? emptyState("✨","Tidak ada.") : items.map((t) => `
        <div class="entity-card" style="border-left-color:${dotClass}">
          <div class="entity-top">
            <div>
              <p class="entity-title">${escapeHtml(t.name)}</p>
              <div class="entity-meta"><span>📘 ${escapeHtml(t.subject)}</span><span>📅 ${fmtDateHuman(t.deadlineDate)} ${t.deadlineTime}</span></div>
            </div>
          </div>
          <div class="modal-actions" style="margin-top:10px">
            <button class="btn btn-secondary btn-sm" data-remind-read="${t.id}:${level}">Tandai dibaca</button>
            <button class="btn btn-primary btn-sm" data-remind-done="${t.id}">Tugas selesai</button>
            <button class="btn btn-danger btn-sm" data-remind-delete="${t.id}:${level}">Hapus</button>
          </div>
        </div>`).join("")}
    </div>`;

  return `
    <p class="page-lead">Semua pengingat deadline dan jadwal, dikelompokkan agar mudah dipantau.</p>
    ${groupHtml("🔴 Hari Ini", "var(--color-danger)", groups.today, "today")}
    ${groupHtml("🟠 Besok", "var(--color-warning)", groups.tomorrow, "tomorrow")}
    ${groupHtml("🟡 2 Hari Lagi", "var(--color-warning)", groups.soon, "soon")}
    ${groupHtml("❗ Lewat Deadline", "var(--color-danger)", groups.overdue, "overdue")}

    <div class="reminder-group">
      <div class="reminder-group-title">🔵 Pengingat Jadwal Belajar (${upcomingStudy.length})</div>
      ${upcomingStudy.length === 0 ? emptyState("✨","Tidak ada sesi belajar tersisa hari ini.") : upcomingStudy.map((s) => `
        <div class="list-row"><span class="list-dot" style="background:var(--color-accent)"></span>
          <div class="list-row-main"><div class="list-row-title">${escapeHtml(s.topic)}</div><div class="list-row-sub">${s.startTime}–${s.endTime}</div></div>
        </div>`).join("")}
    </div>
    <div class="reminder-group">
      <div class="reminder-group-title">📚 Pengingat Mata Pelajaran (${upcomingClasses.length})</div>
      ${upcomingClasses.length === 0 ? emptyState("✨","Tidak ada pelajaran hari ini.") : upcomingClasses.map((s) => `
        <div class="list-row"><span class="list-dot" style="background:var(--color-primary)"></span>
          <div class="list-row-main"><div class="list-row-title">${escapeHtml(s.subject)}</div><div class="list-row-sub">${s.startTime}–${s.endTime}${s.room?" · "+escapeHtml(s.room):""}</div></div>
        </div>`).join("")}
    </div>
  `;
}
function afterReminders() {
  document.querySelectorAll("[data-remind-read]").forEach((btn) => btn.addEventListener("click", () => {
    const key = btn.dataset.remindRead;
    if (!App.data.dismissedReminders.includes(key)) App.data.dismissedReminders.push(key);
    save(); render(); toast("Pengingat ditandai sudah dibaca.", "success");
  }));
  document.querySelectorAll("[data-remind-delete]").forEach((btn) => btn.addEventListener("click", () => {
    const key = btn.dataset.remindDelete;
    if (!App.data.dismissedReminders.includes(key)) App.data.dismissedReminders.push(key);
    save(); render(); toast("Pengingat dihapus.", "success");
  }));
  document.querySelectorAll("[data-remind-done]").forEach((btn) => btn.addEventListener("click", () => {
    const t = App.data.tasks.find((x) => x.id === btn.dataset.remindDone);
    t.status = "Selesai"; save(); render(); toast(`Tugas "${escapeHtml(t.name)}" selesai! 🎉`, "success");
  }));
}

/* ---------------------------------------------------------------------- */
/* CALENDAR                                                                 */
/* ---------------------------------------------------------------------- */
function renderCalendar() {
  const y = App.calYear, m = App.calMonth;
  const first = new Date(y, m, 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const todayIso = todayISO();
  const sel = App.calSelected;

  const cellHtml = cells.map((d) => {
    if (!d) return `<div class="cal-cell empty"></div>`;
    const iso = `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const dayName = DAYS[(new Date(y,m,d).getDay()+6)%7];
    const hasSchedule = App.data.schedule.some((s) => s.day === dayName);
    const hasStudy = App.data.study.some((s) => s.date === iso);
    const hasTask = App.data.tasks.some((t) => t.deadlineDate === iso);
    const classes = ["cal-cell"];
    if (iso === todayIso) classes.push("today");
    if (iso === sel) classes.push("selected");
    return `<div class="${classes.join(" ")}" data-cal-date="${iso}">
      <span>${d}</span>
      <span class="cal-dots">
        ${hasSchedule ? '<span class="cal-dot" style="background:var(--color-primary)"></span>' : ""}
        ${hasStudy ? '<span class="cal-dot" style="background:var(--color-accent)"></span>' : ""}
        ${hasTask ? '<span class="cal-dot" style="background:var(--color-danger)"></span>' : ""}
      </span>
    </div>`;
  }).join("");

  let detailHtml = "";
  if (sel) {
    const dayName = DAYS[(parseISO(sel).getDay()+6)%7];
    const daySchedule = App.data.schedule.filter((s) => s.day === dayName);
    const dayStudy = App.data.study.filter((s) => s.date === sel);
    const dayTasks = App.data.tasks.filter((t) => t.deadlineDate === sel);
    detailHtml = `
      <div class="card" style="margin-top:16px">
        <h3 class="section-title">📌 ${fmtDateHuman(sel)}</h3>
        ${daySchedule.length===0 && dayStudy.length===0 && dayTasks.length===0 ? emptyState("🗓️","Tidak ada agenda pada tanggal ini.") : `
          ${daySchedule.map((s) => `<div class="list-row"><span class="list-dot" style="background:var(--color-primary)"></span><div class="list-row-main"><div class="list-row-title">📚 ${escapeHtml(s.subject)}</div><div class="list-row-sub">${s.startTime}–${s.endTime}</div></div></div>`).join("")}
          ${dayStudy.map((s) => `<div class="list-row"><span class="list-dot" style="background:var(--color-accent)"></span><div class="list-row-main"><div class="list-row-title">📖 ${escapeHtml(s.topic)}</div><div class="list-row-sub">${s.startTime}–${s.endTime}</div></div></div>`).join("")}
          ${dayTasks.map((t) => `<div class="list-row"><span class="list-dot" style="background:var(--color-danger)"></span><div class="list-row-main"><div class="list-row-title">📝 ${escapeHtml(t.name)}</div><div class="list-row-sub">Deadline ${t.deadlineTime}</div></div>${urgencyPill(t)}</div>`).join("")}
        `}
      </div>`;
  }

  return `
    <div class="card">
      <div class="cal-header">
        <button class="btn btn-secondary btn-sm" id="cal-prev">← Sebelumnya</button>
        <h3 class="section-title mt-0" style="margin:0">${MONTH_NAMES[m]} ${y}</h3>
        <button class="btn btn-secondary btn-sm" id="cal-next">Berikutnya →</button>
      </div>
      <div class="cal-grid">
        ${["Sen","Sel","Rab","Kam","Jum","Sab","Min"].map((d) => `<div class="cal-dow">${d}</div>`).join("")}
        ${cellHtml}
      </div>
      <div class="cal-legend">
        <span><span class="cal-dot" style="background:var(--color-primary)"></span>Jadwal sekolah</span>
        <span><span class="cal-dot" style="background:var(--color-accent)"></span>Jadwal belajar</span>
        <span><span class="cal-dot" style="background:var(--color-danger)"></span>Deadline tugas</span>
      </div>
    </div>
    ${detailHtml}
  `;
}
function afterCalendar() {
  document.getElementById("cal-prev").addEventListener("click", () => {
    App.calMonth--; if (App.calMonth < 0) { App.calMonth = 11; App.calYear--; } render();
  });
  document.getElementById("cal-next").addEventListener("click", () => {
    App.calMonth++; if (App.calMonth > 11) { App.calMonth = 0; App.calYear++; } render();
  });
  document.querySelectorAll("[data-cal-date]").forEach((cell) => cell.addEventListener("click", () => {
    App.calSelected = App.calSelected === cell.dataset.calDate ? null : cell.dataset.calDate;
    render();
  }));
}

/* ---------------------------------------------------------------------- */
/* STATS                                                                    */
/* ---------------------------------------------------------------------- */
function renderStats() {
  const doneStudy = App.data.study.filter((s) => s.done);
  const totalMinutes = doneStudy.reduce((sum, s) => sum + minutesBetween(s.startTime, s.endTime), 0);
  const totalHours = (totalMinutes / 60).toFixed(1);
  const sessions = doneStudy.length;
  const tasksDone = App.data.tasks.filter((t) => t.status === "Selesai").length;
  const tasksUndone = App.data.tasks.filter((t) => t.status !== "Selesai").length;
  const tasksLate = App.data.tasks.filter((t) => t.status !== "Selesai" && reminderLevel(t).level === "overdue").length;
  const totalTasks = App.data.tasks.length;
  const completionPct = totalTasks ? Math.round((tasksDone/totalTasks)*100) : 0;

  const now = new Date();
  const weekAgo = new Date(); weekAgo.setDate(now.getDate() - 7);
  const weekStudy = App.data.study.filter((s) => s.done && parseISO(s.date) >= weekAgo && parseISO(s.date) <= now);
  const weekTotal = App.data.study.filter((s)=>parseISO(s.date)>=weekAgo && parseISO(s.date)<=now).length;
  const weekPctSafe = weekTotal ? Math.round((weekStudy.length/weekTotal)*100) : 0;

  return `
    <p class="page-lead">Ringkasan progres belajar dan penyelesaian tugasmu.</p>
    <div class="stat-row">
      <div class="stat-card"><span class="stat-icon">⏱️</span><span class="stat-value">${totalHours} jam</span><span class="stat-label">Total jam belajar</span></div>
      <div class="stat-card"><span class="stat-icon">📖</span><span class="stat-value">${sessions}</span><span class="stat-label">Sesi belajar</span></div>
      <div class="stat-card"><span class="stat-icon">✅</span><span class="stat-value">${tasksDone}</span><span class="stat-label">Tugas selesai</span></div>
      <div class="stat-card"><span class="stat-icon">📌</span><span class="stat-value">${tasksUndone}</span><span class="stat-label">Tugas belum selesai</span></div>
    </div>
    <div class="stat-row" style="grid-template-columns:repeat(2,1fr)">
      <div class="stat-card"><span class="stat-icon">⏰</span><span class="stat-value">${tasksLate}</span><span class="stat-label">Tugas terlambat</span></div>
      <div class="stat-card"><span class="stat-icon">📊</span><span class="stat-value">${completionPct}%</span><span class="stat-label">Persentase penyelesaian tugas</span></div>
    </div>
    <div class="card">
      <h3 class="section-title">Progress belajar minggu ini: ${weekPctSafe}%</h3>
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${weekPctSafe}%"></div></div>
      <p class="text-soft" style="font-size:12.5px;margin-top:10px">${weekStudy.length} dari ${weekTotal} sesi belajar 7 hari terakhir selesai.</p>
    </div>
    <div class="card" style="margin-top:16px">
      <h3 class="section-title">Penyelesaian Tugas</h3>
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${completionPct}%"></div></div>
      <p class="text-soft" style="font-size:12.5px;margin-top:10px">${tasksDone} dari ${totalTasks} tugas selesai.</p>
    </div>
  `;
}

/* ---------------------------------------------------------------------- */
/* SETTINGS                                                                 */
/* ---------------------------------------------------------------------- */
function renderSettings() {
  const s = App.data.settings;
  return `
    <p class="page-lead">Sesuaikan tampilan dan preferensi aplikasi.</p>
    <div class="card">
      <h3 class="section-title">Profil</h3>
      <label>Nama pengguna<input type="text" id="set-name" value="${escapeHtml(s.displayName)}"></label>
      <button class="btn btn-primary btn-sm" id="set-save-name">Simpan Nama</button>
    </div>

    <div class="card" style="margin-top:16px">
      <h3 class="section-title">Tampilan &amp; Notifikasi</h3>
      <div class="settings-row">
        <div><div class="settings-row-label">Mode gelap</div><div class="settings-row-sub">Nyaman untuk belajar malam hari</div></div>
        <label class="switch"><input type="checkbox" id="set-theme" ${s.theme==="dark"?"checked":""}><span class="switch-track"></span></label>
      </div>
      <div class="settings-row">
        <div><div class="settings-row-label">Notifikasi browser</div><div class="settings-row-sub">Kirim notifikasi sistem untuk pengingat deadline</div></div>
        <label class="switch"><input type="checkbox" id="set-notif" ${s.notifEnabled?"checked":""}><span class="switch-track"></span></label>
      </div>
      <div class="settings-row">
        <div><div class="settings-row-label">Waktu pengingat harian</div><div class="settings-row-sub">Jam pengecekan pengingat otomatis</div></div>
        <input type="time" id="set-remind-hour" value="${s.remindHour}" style="width:120px">
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <h3 class="section-title">Data</h3>
      <div class="settings-row">
        <div><div class="settings-row-label">Ekspor data</div><div class="settings-row-sub">Simpan semua data sebagai file JSON</div></div>
        <button class="btn btn-secondary btn-sm" id="set-export">⬇️ Ekspor</button>
      </div>
      <div class="settings-row">
        <div><div class="settings-row-label">Impor data</div><div class="settings-row-sub">Pulihkan data dari file JSON</div></div>
        <label class="btn btn-secondary btn-sm" style="cursor:pointer">⬆️ Impor<input type="file" id="set-import" accept="application/json" style="display:none"></label>
      </div>
      <div class="settings-row">
        <div><div class="settings-row-label">Hapus semua data</div><div class="settings-row-sub">Menghapus jadwal, tugas, dan pengingat</div></div>
        <button class="btn btn-danger btn-sm" id="set-clear">Hapus</button>
      </div>
      <div class="settings-row">
        <div><div class="settings-row-label">Reset aplikasi</div><div class="settings-row-sub">Hapus data dan kembali ke halaman masuk</div></div>
        <button class="btn btn-danger btn-sm" id="set-reset">Reset</button>
      </div>
    </div>
  `;
}
function afterSettings() {
  document.getElementById("set-save-name").addEventListener("click", () => {
    const v = document.getElementById("set-name").value.trim();
    if (!v) { toast("Nama tidak boleh kosong.", "danger"); return; }
    App.data.settings.displayName = v; save(); toast("Nama disimpan.", "success"); render();
  });
  document.getElementById("set-theme").addEventListener("change", (e) => {
    App.data.settings.theme = e.target.checked ? "dark" : "light"; save(); applyTheme(App.data.settings.theme);
  });
  document.getElementById("set-notif").addEventListener("change", async (e) => {
    if (e.target.checked && "Notification" in window) {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { e.target.checked = false; toast("Izin notifikasi ditolak browser.", "warning"); return; }
    }
    App.data.settings.notifEnabled = e.target.checked; save();
    toast(e.target.checked ? "Notifikasi browser diaktifkan." : "Notifikasi browser dimatikan.", "success");
  });
  document.getElementById("set-remind-hour").addEventListener("change", (e) => {
    App.data.settings.remindHour = e.target.value; save(); toast("Waktu pengingat disimpan.", "success");
  });
  document.getElementById("set-export").addEventListener("click", exportData);
  document.getElementById("set-import").addEventListener("change", importData);
  document.getElementById("set-clear").addEventListener("click", () => {
    confirmModal("Hapus Semua Data", "Semua jadwal, tugas, dan pengingat akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.", () => {
      const name = App.data.settings.displayName, theme = App.data.settings.theme;
      App.data = { schedule: [], study: [], tasks: [], settings: { theme, notifEnabled: false, remindHour: "07:00", displayName: name }, dismissedReminders: [] };
      save(); render(); toast("Semua data telah dihapus.", "success");
    }, "Hapus Semua");
  });
  document.getElementById("set-reset").addEventListener("click", () => {
    confirmModal("Reset Aplikasi", "Aplikasi akan menghapus semua data akun ini dan kembali ke halaman masuk. Tindakan ini tidak dapat dibatalkan.", () => {
      localStorage.removeItem(dataKey(App.user));
      logout();
      toast("Aplikasi telah direset.", "success");
    }, "Reset");
  });
}
function exportData() {
  const blob = new Blob([JSON.stringify(App.data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `study-planner-${App.user}-${todayISO()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast("Data berhasil diekspor.", "success");
}
function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || typeof parsed !== "object") throw new Error("invalid");
      App.data = {
        schedule: Array.isArray(parsed.schedule) ? parsed.schedule : [],
        study: Array.isArray(parsed.study) ? parsed.study : [],
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        settings: parsed.settings || App.data.settings,
        dismissedReminders: Array.isArray(parsed.dismissedReminders) ? parsed.dismissedReminders : [],
      };
      save(); applyTheme(App.data.settings.theme); render();
      toast("Data berhasil diimpor.", "success");
    } catch (err) {
      toast("File tidak valid. Gagal mengimpor data.", "danger");
    }
    e.target.value = "";
  };
  reader.readAsText(file);
}

/* ---------------------------------------------------------------------- */
/* Init                                                                     */
/* ---------------------------------------------------------------------- */
function init() {
  initAuth();
  initNav();
  const session = Store.getSession();
  if (session) loginAs(session);
}
document.addEventListener("DOMContentLoaded", init);

})();
