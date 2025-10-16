// public/script.js — fixes recommendations display (logic unchanged)
// All function names and element IDs preserved so backend works unchanged
'use strict';

let token = null;
let user = null;

function setAuth(t,u){
  token = t; user = u;
  if (t && u) {
    localStorage.setItem("linknitt_token", t);
    localStorage.setItem("linknitt_user", JSON.stringify(u));
    const nb = document.getElementById('nav-logout');
    if (nb) nb.classList.remove('d-none');
  } else {
    localStorage.removeItem("linknitt_token");
    localStorage.removeItem("linknitt_user");
    const nb = document.getElementById('nav-logout');
    if (nb) nb.classList.add('d-none');
  }
}

function restoreAuth(){
  const t = localStorage.getItem("linknitt_token");
  const u = localStorage.getItem("linknitt_user");
  if (t && u) { token = t; user = JSON.parse(u); showApp(); loadAll(); }
}
restoreAuth();

// ========== UI Helpers ==========
function escapeHtml(unsafe) {
  return String(unsafe)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

function showToast(message, title = "LinkNITT") {
  const root = document.getElementById('toast-container');
  if (!root) { alert(message); return; }
  const id = 'toast-'+Date.now();
  const div = document.createElement('div');
  div.innerHTML = `
  <div id="${id}" class="toast shadow" role="alert" aria-live="assertive" aria-atomic="true" data-bs-delay="3200">
    <div class="toast-header" style="background:linear-gradient(90deg,#7b61ff,#00c3a3); color:white;">
      <strong class="me-auto">${escapeHtml(title)}</strong>
      <small class="text-white-50">now</small>
      <button type="button" class="btn-close btn-close-white ms-2" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
    <div class="toast-body">${escapeHtml(String(message))}</div>
  </div>`;
  root.appendChild(div.firstElementChild);
  const toastEl = document.getElementById(id);
  const bs = new bootstrap.Toast(toastEl);
  bs.show();
  toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
}

function showMsg(msg, el="auth-msg"){
  const container = document.getElementById(el);
  if (!container) { showToast(msg); return; }
  container.innerHTML = `<div class="alert alert-info alert-dismissible fade show" role="alert">
    ${escapeHtml(String(msg))}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  </div>`;
  setTimeout(()=>{ if (container) container.innerHTML = ""; },3800);
}

// ========== Auth ==========
async function register(){
  const name = document.getElementById("reg-name").value;
  const email = document.getElementById("reg-email").value;
  const password = document.getElementById("reg-password").value;
  const role = document.getElementById("reg-role").value;
  const dept = document.getElementById("reg-dept").value || null;
  try {
    const res = await fetch("/register",{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({name,email,password,role,dept}) });
    const j = await res.json();
    if (j.error) showMsg(j.error); else showMsg(j.message || "Registered — please login");
  } catch (e) { showToast("Network error: "+e.message); }
}

async function login(){
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  try {
    const res = await fetch("/login",{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({email,password}) });
    const j = await res.json();
    if (j.error) { showMsg(j.error); return; }
    setAuth(j.token, j.user || { name: j.name, role: j.role });
    showApp();
    loadAll();
    showToast("Welcome, "+(j.user?.name || j.name || "User")+"!");
  } catch (e) { showToast("Network error: "+e.message); }
}

function logout(){ setAuth(null,null); location.reload(); }

function showApp(){
  document.getElementById("auth").style.display = "none";
  document.getElementById("app").style.display = "block";
  document.getElementById("welcome").innerText = user.name || "User";
  document.getElementById("user-dept").innerText = user.dept ? ("Dept: "+user.dept) : "";
  const roleBadge = document.getElementById('user-role-badge');
  if (roleBadge) roleBadge.innerText = user.role || "";
  if (user.role === "Faculty") {
    document.getElementById("faculty-add").style.display = "block";
    document.getElementById("faculty-job").style.display = "block";
    document.getElementById("faculty-mentor").style.display = "block";
  }
  if (user.role === "Student") {
    document.getElementById("student-mentor").style.display = "block";
  }
  const nb = document.getElementById('nav-logout');
  if (nb) nb.classList.remove('d-none');
}

// ========== Marketplace (unchanged) ==========
async function addItem(){
  const item = document.getElementById("new-item").value;
  try {
    const res = await fetch("/items", { method:"POST", headers:{"Content-Type":"application/json","Authorization":"Bearer "+token}, body:JSON.stringify({item})});
    const j = await res.json(); showToast(j.message || j.error || "Done"); loadItems();
  } catch (e) { showToast("Network error: "+e.message); }
}

// async function loadItems(){
//   try {
//     const res = await fetch("/items");
//     const list = await res.json();
//     const el = document.getElementById("items"); el.innerHTML = "";
//     if (!Array.isArray(list) || list.length === 0) { el.innerHTML = `<div class="list-empty">No items found.</div>`; return; }
//     list.forEach(i => {
//       const itemEl = document.createElement("div");
//       itemEl.className = "list-group-item d-flex justify-content-between align-items-start";
//       itemEl.innerHTML = `<div>
//           <div class="fw-semibold">${escapeHtml(i.item)}</div>
//           <div class="small-muted">By ${escapeHtml(i.seller || "-")}</div>
//         </div>`;
//       if (user && user.role==="Student") {
//         const btn = document.createElement("button");
//         btn.className = "btn action-buy btn-sm";
//         btn.style.borderRadius = "8px";
//         btn.innerText = "Buy";
//         btn.onclick = ()=>buy(i.item);
//         itemEl.appendChild(btn);
//       }
//       el.appendChild(itemEl);
//     });
//   } catch (e) { showToast("Network error: "+e.message); }
// }

async function loadItems(){
  const el = document.getElementById("items");
  // show a loading indicator (spinner)
  el.innerHTML = `<div class="list-empty"><div class="spinner-border spinner-border-sm" role="status" style="vertical-align:middle;margin-right:8px"></div>Loading items…</div>`;

  try {
    const res = await fetch("/items", { cache: "no-store" });
    // log full response for debugging
    console.log("loadItems: fetch /items response:", res);
    // try to capture text in case JSON parse fails
    const txt = await res.text();
    let parsed;
    try {
      parsed = txt ? JSON.parse(txt) : null;
    } catch(parseErr) {
      console.warn("loadItems: response text is not JSON:", txt);
      parsed = null;
    }

    // If non-2xx, show helpful error
    if (!res.ok) {
      console.error("loadItems: HTTP error", res.status, parsed || txt);
      el.innerHTML = `<div class="list-empty">Failed to load items (HTTP ${res.status}). See console for details.</div><pre style="max-height:200px;overflow:auto;background:#f8f9fa;padding:8px;margin-top:8px;border-radius:6px;">${escapeHtml(txt || JSON.stringify(parsed || {}, null, 2))}</pre>`;
      return;
    }

    // Determine the actual list of items from a variety of possible response shapes
    let list = null;

    // 1) If server returned an array directly
    if (Array.isArray(parsed)) {
      list = parsed;
    }
    // 2) Common wrapper: { items: [...] } or { data: [...] }
    else if (parsed && Array.isArray(parsed.items)) {
      list = parsed.items;
    } else if (parsed && Array.isArray(parsed.data)) {
      list = parsed.data;
    }
    // 3) Neo4j-style: { records: [...] } — try to extract meaningful values
    else if (parsed && Array.isArray(parsed.records)) {
      // records might be an array of plain objects or objects with _fields/_keys
      // Try some heuristics to convert to an array of { item:..., seller:... }
      list = parsed.records.map(r => {
        // if record is plain object with item/name/title directly
        if (r && typeof r === 'object' && (r.item || r.name || r.title)) {
          return r;
        }
        // if neo4j driver-style: r._fields is an array of objects or strings
        if (r && Array.isArray(r._fields) && r._fields.length > 0) {
          // find first field that looks like an object with item/name/title
          const objField = r._fields.find(f => f && typeof f === 'object' && (f.item || f.name || f.title));
          if (objField) return objField;
          // otherwise return the first field (string)
          return { item: r._fields[0] };
        }
        // fallback: return the raw record
        return r;
      });
    }

    // 4) If nothing found, but parsed is an object, try to flatten any first array property
    if (!Array.isArray(list) && parsed && typeof parsed === 'object') {
      const maybeArrayProp = Object.values(parsed).find(v => Array.isArray(v));
      if (maybeArrayProp) list = maybeArrayProp;
    }

    // If still not an array, show the raw JSON to help debugging
    if (!Array.isArray(list)) {
      console.warn("loadItems: couldn't normalize response into array. parsed:", parsed);
      el.innerHTML = `<div class="list-empty">No items found (unexpected response shape). Check console/network.</div>
                      <pre style="max-height:300px;overflow:auto;background:#f8f9fa;padding:8px;margin-top:8px;border-radius:6px;">${escapeHtml(txt || JSON.stringify(parsed || {}, null, 2))}</pre>`;
      return;
    }

    // Render the array
    el.innerHTML = "";
    if (list.length === 0) {
      el.innerHTML = `<div class="list-empty">No items found.</div>`;
      return;
    }

    const frag = document.createDocumentFragment();
    list.forEach(i => {
      // tolerate many possible shapes: plain string, {item}, {name}, nested
      let name, seller;
      if (typeof i === 'string') {
        name = i;
        seller = "-";
      } else if (i && typeof i === 'object') {
        // if backend returns full nodes: sometimes item property is nested, e.g., { item: { name: 'X' } }
        const potentialItem = i.item || i.name || i.title;
        if (potentialItem && typeof potentialItem === 'object') {
          name = potentialItem.name || potentialItem.item || potentialItem.title || JSON.stringify(potentialItem);
        } else {
          name = potentialItem || i.label || i.id || 'Unnamed item';
        }

        // seller may be string, object, or missing
        if (i.seller && typeof i.seller === 'object') {
          seller = i.seller.name || i.seller.email || JSON.stringify(i.seller);
        } else {
          seller = i.seller || i.sellerName || i.seller_email || "-";
        }
      } else {
        name = String(i);
        seller = "-";
      }

      // final fallback
      name = name || 'Unnamed item';
      seller = seller || "-";

      const itemEl = document.createElement("div");
      itemEl.className = "list-group-item d-flex justify-content-between align-items-start";

      const left = document.createElement("div");
      left.innerHTML = `<div class="fw-semibold">${escapeHtml(name)}</div>
                        <div class="small-muted">By ${escapeHtml(seller)}</div>`;
      itemEl.appendChild(left);

      if (user && user.role === "Student") {
        const btn = document.createElement("button");
        btn.className = "btn action-buy btn-sm";
        btn.style.borderRadius = "8px";
        btn.innerText = "Buy";
        btn.onclick = () => buy(name);
        itemEl.appendChild(btn);
      }

      frag.appendChild(itemEl);
    });

    el.appendChild(frag);
  } catch (e) {
    console.error("loadItems error:", e);
    showToast("Failed to load items: " + (e.message || e));
    el.innerHTML = `<div class="list-empty">Failed to load items.</div>`;
  }
}


async function buy(item){
  try {
    const res = await fetch("/buy",{ method:"POST", headers:{"Content-Type":"application/json","Authorization":"Bearer "+token}, body:JSON.stringify({item})});
    const j = await res.json(); showToast(j.message || j.error || "Bought"); loadItems();
  } catch (e) { showToast("Network error: "+e.message); }
}

// ========== Jobs ==========
async function loadJobs(){
  try {
    const res = await fetch("/jobs"); const list = await res.json();
    const el = document.getElementById("jobs"); el.innerHTML = "";
    if (!Array.isArray(list) || list.length === 0) { el.innerHTML = `<div class="list-empty">No jobs posted.</div>`; return; }
    list.forEach(j => {
      const jobEl = document.createElement("div"); jobEl.className="list-group-item";
      jobEl.innerHTML = `<div class="d-flex w-100 justify-content-between"><h6 class="mb-1">${escapeHtml(j.title)}</h6></div>
        <p class="mb-1 small-muted">${escapeHtml(j.desc || "")}</p>
        <div class="small-muted">Posted by ${escapeHtml(j.poster || "-")}</div>`;
      if (user && user.role==="Student") {
        const btn = document.createElement("button");
        btn.className = "btn action-apply btn-sm mt-2";
        btn.style.borderRadius = "8px";
        btn.innerText = "Apply";
        btn.onclick = ()=>applyJob(j.title);
        jobEl.appendChild(btn);
      }
      el.appendChild(jobEl);
    });
  } catch (e) { showToast("Network error: "+e.message); }
}

async function postJob(){
  const title = document.getElementById("job-title").value; const desc = document.getElementById("job-desc").value;
  try {
    const res = await fetch("/jobs",{ method:"POST", headers:{"Content-Type":"application/json","Authorization":"Bearer "+token}, body:JSON.stringify({title,desc})});
    const j = await res.json(); showToast(j.message || j.error || "Posted"); loadJobs();
  } catch (e) { showToast("Network error: "+e.message); }
}

async function applyJob(title){
  try {
    const res = await fetch("/jobs/apply",{ method:"POST", headers:{"Content-Type":"application/json","Authorization":"Bearer "+token}, body:JSON.stringify({title})});
    const j = await res.json(); showToast(j.message || j.error || "Applied"); loadJobs();
  } catch (e) { showToast("Network error: "+e.message); }
}

// ========== Mentors ==========
async function loadMentors(){
  try {
    const res = await fetch("/mentors"); const list = await res.json();
    const el = document.getElementById("mentors"); el.innerHTML = "";
    if (!Array.isArray(list) || list.length === 0) { el.innerHTML = `<div class="list-empty">No mentors available.</div>`; return; }
    list.forEach(m => {
      const mEl = document.createElement("div"); mEl.className="list-group-item d-flex justify-content-between align-items-start";
      mEl.innerHTML = `<div>
        <div class="fw-semibold">${escapeHtml(m.name || "Unknown")}</div>
        <div class="small-muted">Topics: ${escapeHtml(Array.isArray(m.topics) ? m.topics.join(", ") : (m.topics || "-"))}</div>
      </div>`;
      el.appendChild(mEl);
    });
  } catch (e) { showToast("Network error: "+e.message); }
}

async function offerMentor(){
  const topic=document.getElementById("mentor-topic").value; const note=document.getElementById("mentor-note").value; const capacity=document.getElementById("mentor-capacity").value||1;
  try {
    const res=await fetch("/mentors/offer",{ method:"POST", headers:{"Content-Type":"application/json","Authorization":"Bearer "+token}, body:JSON.stringify({topic,note,capacity})});
    const j=await res.json(); showToast(j.message||j.error||"Offered"); loadMentors();
  } catch (e) { showToast("Network error: "+e.message); }
}

async function requestMentor(){
  const facultyEmail=document.getElementById("mentor-fac-email").value; const topic=document.getElementById("mentor-topic-req").value;
  try {
    const res=await fetch("/mentors/request",{ method:"POST", headers:{"Content-Type":"application/json","Authorization":"Bearer "+token}, body:JSON.stringify({facultyEmail,topic})});
    const j=await res.json(); showToast(j.message||j.error||"Requested");
  } catch (e) { showToast("Network error: "+e.message); }
}

// ========== RECOMMENDATIONS (fixed display) ==========
async function getRecommend(){
  const btn = document.getElementById('recs-btn');
  if (btn) { btn.disabled = true; btn.innerText = 'Loading…'; }

  try {
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch("/recommend", { headers });
    if (!res.ok) {
      const err = await res.json().catch(()=>({ error: 'Failed to fetch recommendations' }));
      showToast(err.error || ('Recommend failed: ' + res.status));
      if (btn) { btn.disabled = false; btn.innerText = 'Get Recommendations'; }
      return;
    }
    const j = await res.json(); 
    console.log(j)
    renderRecommendations(j);
  } catch (e) {
    showToast("Network error: " + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerText = 'Get Recommendations'; }
  }
}

function renderRecommendations(data) {
  const el = document.getElementById('recs');
  el.innerHTML = '';

  if (!data || (Array.isArray(data) && data.length === 0) || (typeof data === 'object' && Object.keys(data).length === 0)) {
    el.innerHTML = `<div class="small-muted">No recommendations available.</div>`;
    return;
  }

  // Normalize arrays (backend returns { items:[], mentors:[], jobs:[] })
  const items = Array.isArray(data.items) ? data.items : [];
  const mentors = Array.isArray(data.mentors) ? data.mentors : [];
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];

  // Create a 3-col grid
  const grid = document.createElement('div');
  grid.className = 'recs-grid';

  // Items column
  const colItems = document.createElement('div');
  colItems.className = 'rec-col';
  const cardItems = document.createElement('div');
  cardItems.className = 'card-custom';
  cardItems.innerHTML = `<div class="d-flex justify-content-between align-items-center mb-2"><h6 class="mb-0">Suggested items</h6><small class="small-muted">${items.length} found</small></div>`;
  if (items.length === 0) {
    const empty = document.createElement('div'); empty.className='list-empty'; empty.innerText = 'No item recommendations.';
    cardItems.appendChild(empty);
  } else {
    const list = document.createElement('div'); list.className = 'list-group';
    items.forEach(it => {
      const itemName = escapeHtml(it);
      const row = document.createElement('div');
      row.className = 'list-group-item d-flex justify-content-between align-items-center';
      row.innerHTML = `<div><div class="fw-semibold">${itemName}</div></div>`;
      // optionally allow buy if logged in and student
      if (user && user.role === 'Student') {
        const b = document.createElement('button');
        b.className = 'btn btn-sm action-buy';
        b.style.borderRadius = '8px';
        b.innerText = 'Buy';
        b.onclick = ()=>buy(it);
        row.appendChild(b);
      }
      list.appendChild(row);
    });
    cardItems.appendChild(list);
  }
  colItems.appendChild(cardItems);
  grid.appendChild(colItems);

  // Mentors column
  const colMent = document.createElement('div'); colMent.className = 'rec-col';
  const cardMent = document.createElement('div'); cardMent.className = 'card-custom';
  cardMent.innerHTML = `<div class="d-flex justify-content-between align-items-center mb-2"><h6 class="mb-0">Mentors</h6><small class="small-muted">${mentors.length} found</small></div>`;
  if (mentors.length === 0) {
    const empty = document.createElement('div'); empty.className='list-empty'; empty.innerText = 'No mentor recommendations.';
    cardMent.appendChild(empty);
  } else {
    const list = document.createElement('div'); list.className = 'list-group';
    mentors.forEach(m => {
      const name = escapeHtml(m);
      const row = document.createElement('div'); row.className = 'list-group-item';
      row.innerHTML = `<div class="fw-semibold">${name}</div><div class="small-muted">Faculty — same department</div>`;
      list.appendChild(row);
    });
    cardMent.appendChild(list);
  }
  colMent.appendChild(cardMent);
  grid.appendChild(colMent);

  // Jobs column
  const colJobs = document.createElement('div'); colJobs.className = 'rec-col';
  const cardJobs = document.createElement('div'); cardJobs.className = 'card-custom';
  cardJobs.innerHTML = `<div class="d-flex justify-content-between align-items-center mb-2"><h6 class="mb-0">Jobs</h6><small class="small-muted">${jobs.length} found</small></div>`;
  if (jobs.length === 0) {
    const empty = document.createElement('div'); empty.className='list-empty'; empty.innerText = 'No job recommendations.';
    cardJobs.appendChild(empty);
  } else {
    const list = document.createElement('div'); list.className = 'list-group';
    jobs.forEach(job => {
      const title = escapeHtml(job);
      const row = document.createElement('div');
      row.className = 'list-group-item d-flex justify-content-between align-items-start';
      row.innerHTML = `<div><div class="fw-semibold">${title}</div><div class="small-muted">Recommended for you</div></div>`;
      // show "Apply" if student
      if (user && user.role === 'Student') {
        const b = document.createElement('button');
        b.className = 'btn btn-sm action-apply';
        b.style.borderRadius = '8px';
        b.innerText = 'Apply';
        b.onclick = ()=>applyJob(job);
        row.appendChild(b);
      }
      list.appendChild(row);
    });
    cardJobs.appendChild(list);
  }
  colJobs.appendChild(cardJobs);
  grid.appendChild(colJobs);

  el.appendChild(grid);
}

// ========== load all ==========
async function loadAll(){ await loadItems(); await loadJobs(); await loadMentors(); }

// ========== Seed ==========
async function seed(){
  const secret = prompt("Enter seed secret (from Replit Secrets):");
  if (!secret) return;
  try {
    const res = await fetch(`/seed?secret=${encodeURIComponent(secret)}`);
    const j = await res.json(); showToast(j.message||j.error||"Seed complete"); location.reload();
  } catch (e) { showToast("Network error: "+e.message); }
}
