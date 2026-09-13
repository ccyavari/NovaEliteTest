// ===== CONFIG =====
const LEAGUE_ID = "1318997229251354624"; // Nova Kai league ID

const API = "https://api.sleeper.app/v1";
const PLAYERS_CACHE_KEY = "nk_players_cache_v1";
const PLAYERS_CACHE_TTL = 1000 * 60 * 60 * 24; // 24h

// ===== STATE =====
let state = {
  league: null,
  rosters: [],
  users: [],
  players: {},
  nflState: null,
  selectedWeek: 1,
};

// ===== HELPERS =====
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${url}`);
  return res.json();
}

function rosterOwnerName(rosterId) {
  const roster = state.rosters.find(r => r.roster_id === rosterId);
  if (!roster) return "Unknown";
  const user = state.users.find(u => u.user_id === roster.owner_id);
  return user ? (user.display_name || user.username) : "Unknown";
}

function rosterTeamName(rosterId) {
  const roster = state.rosters.find(r => r.roster_id === rosterId);
  if (!roster) return "Unknown Team";
  const user = state.users.find(u => u.user_id === roster.owner_id);
  return (user && user.metadata && user.metadata.team_name) || rosterOwnerName(rosterId);
}

function playerName(playerId) {
  if (playerId === undefined || playerId === null) return "—";
  if (typeof playerId === "string" && !/^\d+$/.test(playerId)) return playerId; // DEF like "PHI"
  const p = state.players[playerId];
  if (!p) return playerId;
  return p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim() || playerId;
}

function playerPos(playerId) {
  const p = state.players[playerId];
  if (!p) return "";
  return p.position || "";
}

// ===== PLAYERS CACHE (large file, cache in localStorage) =====
async function loadPlayers() {
  try {
    const cached = localStorage.getItem(PLAYERS_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.ts < PLAYERS_CACHE_TTL) {
        state.players = parsed.data;
        return;
      }
    }
  } catch (e) {
    console.warn("Player cache read failed", e);
  }
  try {
    const data = await fetchJSON(`${API}/players/nfl`);
    state.players = data;
    try {
      localStorage.setItem(PLAYERS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
    } catch (e) {
      console.warn("Player cache write failed (likely too large)", e);
    }
  } catch (e) {
    console.warn("Failed to load players list", e);
    state.players = {};
  }
}

// ===== TABS =====
function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
    });
  });
}

// ===== RENDER: HEADER / OVERVIEW STATS =====
function renderHeader() {
  document.getElementById("season-label").textContent = `${state.league.season} Season`;
  document.getElementById("week-label").textContent = `Week ${state.nflState?.week ?? "—"}`;
  document.getElementById("status-label").textContent = "Live from Sleeper";
  document.getElementById("stat-week").textContent = state.nflState?.week ?? "—";
  document.getElementById("stat-teams").textContent = state.rosters.length || "—";
}

function computeStandings() {
  const standings = state.rosters.map(r => {
    const wins = r.settings?.wins ?? 0;
    const losses = r.settings?.losses ?? 0;
    const ties = r.settings?.ties ?? 0;
    const fpts = (r.settings?.fpts ?? 0) + (r.settings?.fpts_decimal ?? 0) / 100;
    const fptsAgainst = (r.settings?.fpts_against ?? 0) + (r.settings?.fpts_against_decimal ?? 0) / 100;
    return {
      rosterId: r.roster_id,
      team: rosterTeamName(r.roster_id),
      manager: rosterOwnerName(r.roster_id),
      wins, losses, ties, fpts, fptsAgainst,
    };
  });
  standings.sort((a, b) => (b.wins - a.wins) || (b.fpts - a.fpts));
  return standings;
}

function renderStandings() {
  const standings = computeStandings();
  const tbody = document.querySelector("#standings-table tbody");
  tbody.innerHTML = "";
  standings.forEach((s, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${s.team}</td>
      <td>${s.manager}</td>
      <td>${s.wins}-${s.losses}${s.ties ? "-" + s.ties : ""}</td>
      <td>${s.fpts.toFixed(1)}</td>
      <td>${s.fptsAgainst.toFixed(1)}</td>
    `;
    tbody.appendChild(tr);
  });
  if (standings.length) {
    document.getElementById("stat-leader").textContent = standings[0].team;
  }
}

// ===== RENDER: MATCHUPS =====
function buildMatchupCard(teamA, teamB) {
  const div = document.createElement("div");
  div.className = "matchup-card";
  div.innerHTML = `
    <div class="matchup-teams">
      <div class="matchup-team">
        <span class="team-name">${teamA.team}</span>
        <span class="manager-name">${teamA.manager}</span>
        <span class="score">${teamA.points.toFixed(1)}</span>
      </div>
      <div class="matchup-vs">VS</div>
      <div class="matchup-team">
        <span class="team-name">${teamB ? teamB.team : "BYE"}</span>
        <span class="manager-name">${teamB ? teamB.manager : ""}</span>
        <span class="score">${teamB ? teamB.points.toFixed(1) : "—"}</span>
      </div>
    </div>
  `;
  return div;
}

async function loadMatchupsForWeek(week) {
  const matchups = await fetchJSON(`${API}/league/${LEAGUE_ID}/matchups/${week}`);
  const byMatchupId = {};
  matchups.forEach(m => {
    const key = m.matchup_id ?? `solo-${m.roster_id}`;
    if (!byMatchupId[key]) byMatchupId[key] = [];
    byMatchupId[key].push(m);
  });
  return Object.values(byMatchupId).map(pair => {
    const [a, b] = pair;
    return {
      teamA: { team: rosterTeamName(a.roster_id), manager: rosterOwnerName(a.roster_id), points: a.points || 0 },
      teamB: b ? { team: rosterTeamName(b.roster_id), manager: rosterOwnerName(b.roster_id), points: b.points || 0 } : null,
    };
  });
}

async function renderOverviewMatchups() {
  const container = document.getElementById("overview-matchups");
  container.innerHTML = `<div class="loading-msg">Loading matchups&hellip;</div>`;
  try {
    const week = state.nflState?.week || 1;
    const pairs = await loadMatchupsForWeek(week);
    container.innerHTML = "";
    if (!pairs.length) {
      container.innerHTML = `<div class="empty-msg">No matchups found for this week.</div>`;
      return;
    }
    pairs.forEach(p => container.appendChild(buildMatchupCard(p.teamA, p.teamB)));
  } catch (e) {
    container.innerHTML = `<div class="empty-msg">Couldn't load matchups.</div>`;
    console.error(e);
  }
}

async function renderFullMatchups(week) {
  const container = document.getElementById("matchups-full");
  container.innerHTML = `<div class="loading-msg">Loading matchups&hellip;</div>`;
  try {
    const pairs = await loadMatchupsForWeek(week);
    container.innerHTML = "";
    if (!pairs.length) {
      container.innerHTML = `<div class="empty-msg">No matchups found for week ${week}.</div>`;
      return;
    }
    pairs.forEach(p => container.appendChild(buildMatchupCard(p.teamA, p.teamB)));
  } catch (e) {
    container.innerHTML = `<div class="empty-msg">Couldn't load matchups.</div>`;
    console.error(e);
  }
}

function setupWeekSelector() {
  const select = document.getElementById("week-select");
  const totalWeeks = 18;
  for (let w = 1; w <= totalWeeks; w++) {
    const opt = document.createElement("option");
    opt.value = w;
    opt.textContent = `Week ${w}`;
    select.appendChild(opt);
  }
  const currentWeek = state.nflState?.week || 1;
  select.value = currentWeek;
  select.addEventListener("change", () => renderFullMatchups(Number(select.value)));
  renderFullMatchups(currentWeek);
}

// ===== RENDER: TRANSACTIONS =====
async function renderTransactions() {
  const list = document.getElementById("transaction-list");
  list.innerHTML = `<li class="loading-msg">Loading transactions&hellip;</li>`;
  try {
    const week = state.nflState?.week || 1;
    let allTx = [];
    const weeksToFetch = Array.from({ length: Math.min(week, 18) }, (_, i) => week - i).slice(0, 4);
    for (const w of weeksToFetch) {
      const tx = await fetchJSON(`${API}/league/${LEAGUE_ID}/transactions/${w}`);
      allTx = allTx.concat(tx);
    }
    allTx.sort((a, b) => (b.created || 0) - (a.created || 0));
    list.innerHTML = "";
    if (!allTx.length) {
      list.innerHTML = `<li class="empty-msg">No recent transactions.</li>`;
      return;
    }
    allTx.slice(0, 40).forEach(tx => {
      const li = document.createElement("li");
      const type = (tx.type || "move").toUpperCase();
      let desc = "";
      const adds = tx.adds ? Object.keys(tx.adds) : [];
      const drops = tx.drops ? Object.keys(tx.drops) : [];
      const rosterIds = tx.roster_ids || [];
      const managers = rosterIds.map(rid => rosterTeamName(rid)).join(", ");
      if (adds.length) desc += `Added ${adds.map(playerName).join(", ")}. `;
      if (drops.length) desc += `Dropped ${drops.map(playerName).join(", ")}.`;
      li.innerHTML = `<span class="tx-type">${type}</span>${managers ? managers + " — " : ""}${desc || "Details unavailable"}`;
      list.appendChild(li);
    });
  } catch (e) {
    list.innerHTML = `<li class="empty-msg">Couldn't load transactions.</li>`;
    console.error(e);
  }
}

// ===== RENDER: DRAFT =====
async function renderDraft() {
  const metaDiv = document.getElementById("draft-meta");
  const tbody = document.querySelector("#draft-table tbody");
  metaDiv.textContent = "Loading draft data\u2026";
  tbody.innerHTML = "";
  try {
    const drafts = await fetchJSON(`${API}/league/${LEAGUE_ID}/drafts`);
    if (!drafts.length) {
      metaDiv.textContent = "No draft found for this league.";
      return;
    }
    const draft = drafts[0];
    metaDiv.textContent = `${draft.season} Draft \u2014 ${draft.settings?.rounds || "?"} rounds \u2014 ${draft.type || ""}`;
    const picks = await fetchJSON(`${API}/draft/${draft.draft_id}/picks`);
    picks.sort((a, b) => a.pick_no - b.pick_no);
    picks.forEach(pick => {
      const tr = document.createElement("tr");
      const pid = pick.player_id;
      tr.innerHTML = `
        <td>${pick.pick_no}</td>
        <td>${pick.round}</td>
        <td>${playerName(pid)}</td>
        <td>${playerPos(pid)}</td>
        <td>${rosterTeamName(pick.roster_id)}</td>
      `;
      tbody.appendChild(tr);
    });
    if (!picks.length) {
      metaDiv.textContent += " (No picks recorded yet.)";
    }
  } catch (e) {
    metaDiv.textContent = "Couldn't load draft data.";
    console.error(e);
  }
}

// ===== BOOT =====
async function init() {
  setupTabs();
  try {
    const [league, rosters, users, nflState] = await Promise.all([
      fetchJSON(`${API}/league/${LEAGUE_ID}`),
      fetchJSON(`${API}/league/${LEAGUE_ID}/rosters`),
      fetchJSON(`${API}/league/${LEAGUE_ID}/users`),
      fetchJSON(`${API}/state/nfl`),
    ]);
    state.league = league;
    state.rosters = rosters;
    state.users = users;
    state.nflState = nflState;

    await loadPlayers();

    renderHeader();
    renderStandings();
    await renderOverviewMatchups();
    setupWeekSelector();
    await renderTransactions();
    await renderDraft();

    document.getElementById("stat-transactions").textContent = "See tab";
  } catch (e) {
    document.getElementById("status-label").textContent = "Couldn't load live data";
    console.error(e);
  }
}

document.addEventListener("DOMContentLoaded", init);
