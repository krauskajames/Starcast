/* Accounts: sign in with Google (Supabase Auth) and keep saved spots, gear, the observing log
   and settings in sync across devices. Without an account Starcast works exactly as before,
   keeping everything in this browser.

   Data lives in two tables (see supabase/schema.sql):
   - user_state: one JSON document per person holding the synced settings below
   - saved_locations: saved spots as PostGIS points, written through sync_saved_locations() */

// Filled in from the Supabase dashboard: Project Settings -> API. The publishable (anon) key is
// meant to be public; row-level security in the database keeps each person's data private.
const SUPABASE_URL = '';
const SUPABASE_ANON_KEY = '';

const SYNC_KEYS = ['saved','gears','gearIdx','interests','log','checks','alertRules','units','defBortle','theme','basemap','layer','ov','photoIso','frameTarget','jupFlip','driveRadius','layerOpacity','frameBarlow'];
const LIST_IDS = { saved:'cid', gears:'id', log:'id', checks:'id' };
const ACC = { on: !!(SUPABASE_URL && SUPABASE_ANON_KEY && typeof supabase!=='undefined' && /^https?:$/.test(location.protocol)),
  client:null, user:null, status:'', dirty:new Set(), timer:null, ready:false, menu:false, confirmDelete:false };

function readLocal(){ const o={}; SYNC_KEYS.forEach(k=>{ const v=store.get(k,undefined); if(v!==undefined) o[k]=v; }); return o; }
function mergeState(local, cloud){
  const out=Object.assign({}, local, cloud);
  for(const [k,idk] of Object.entries(LIST_IDS)){
    const a=Array.isArray(cloud[k])?cloud[k]:[], b=Array.isArray(local[k])?local[k]:[];
    if(!a.length && !b.length) continue;
    const seen=new Set(a.map(x=>x&&x[idk]).filter(Boolean));
    out[k]=a.concat(b.filter(x=>!x || !x[idk] || !seen.has(x[idk])));
  }
  if(Array.isArray(out.gears)) out.gearIdx=Math.max(0,Math.min(out.gearIdx||0,out.gears.length-1));
  return out;
}
const same = (a,b) => JSON.stringify(a)===JSON.stringify(b);

function setAccStatus(s){ ACC.status=s; renderAccount(); }
function spotsForCloud(){
  return (store.get('saved',[])||[]).map(x=>({ client_id:x.cid, name:x.name, lat:+x.lat, lon:+x.lon, bortle:x.bortle||null, is_home:!!x.home, alerts:x.alerts!==false,
    horizon: Array.isArray(x.horizon)&&x.horizon.length===8 ? x.horizon.map(v=>Math.round(+v||0)) : null })).filter(x=>x.client_id && isFinite(x.lat) && isFinite(x.lon));
}
async function pushNow(){
  clearTimeout(ACC.timer);
  if(!ACC.user || !ACC.ready) return;
  const keys=[...ACC.dirty]; ACC.dirty.clear();
  setAccStatus('Saving…');
  try{
    const { error } = await ACC.client.from('user_state').upsert({ user_id:ACC.user.id, data:readLocal(), updated_at:new Date().toISOString() });
    if(error) throw error;
    if(keys.includes('saved') || keys.includes('*')){ const r = await ACC.client.rpc('sync_saved_locations', { spots: spotsForCloud() }); if(r.error) throw r.error; }
    setAccStatus('Synced');
  }catch(e){
    console.warn('Sync failed', e); keys.forEach(k=>ACC.dirty.add(k));
    setAccStatus('Not synced yet; retrying');
    ACC.timer=setTimeout(pushNow, 30e3);
  }
}
store.onChange = k => { if(!ACC.user || !ACC.ready || !SYNC_KEYS.includes(k)) return; ACC.dirty.add(k); clearTimeout(ACC.timer); ACC.timer=setTimeout(pushNow, 1500); setAccStatus('Saving…'); };

// On sign-in: combine this device's data with the account's, then keep both in step.
async function onSignedIn(user){
  ACC.user=user; ACC.ready=false; setAccStatus('Loading your data…');
  try{
    const { data, error } = await ACC.client.from('user_state').select('data').eq('user_id', user.id).maybeSingle();
    if(error) throw error;
    const local=readLocal(), cloud=(data&&data.data)||{};
    const merged = data ? mergeState(local, cloud) : local;
    ACC.ready=true;
    if(!same(merged, cloud)){ ACC.dirty.add('*'); }
    if(!same(merged, local)){
      // write the combined data and reload once so every part of the app picks it up
      Object.entries(merged).forEach(([k,v])=>{ try{ localStorage.setItem('starcast.'+k, JSON.stringify(v)); }catch(e){} });
      if(ACC.dirty.size) await pushNow();
      let reloaded=false; try{ reloaded = sessionStorage.getItem('starcast.merged')==='1'; sessionStorage.setItem('starcast.merged','1'); }catch(e){}
      if(!reloaded){ location.reload(); return; }
    }
    if(ACC.dirty.size) await pushNow(); else setAccStatus('Synced');
  }catch(e){ console.warn('Could not load account data', e); ACC.ready=false; setAccStatus('Couldn’t reach your account; using this device’s data'); }
}

async function signIn(){
  setAccStatus('Opening Google…');
  const { error } = await ACC.client.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: location.origin + location.pathname } });
  if(error){ setAccStatus('Sign-in failed: '+error.message); }
}
async function signOut(){
  if(ACC.dirty.size) await pushNow();
  await ACC.client.auth.signOut();
  ACC.user=null; ACC.ready=false; ACC.menu=false; setAccStatus(''); try{ sessionStorage.removeItem('starcast.merged'); }catch(e){}
  toast('Signed out. Your data stays on this device too.');
}
async function deleteCloudData(){
  if(!ACC.user) return;
  setAccStatus('Deleting…');
  try{
    const a = await ACC.client.from('saved_locations').delete().eq('user_id', ACC.user.id); if(a.error) throw a.error;
    const b = await ACC.client.from('user_state').delete().eq('user_id', ACC.user.id); if(b.error) throw b.error;
    ACC.confirmDelete=false; await ACC.client.auth.signOut(); ACC.user=null; ACC.ready=false; ACC.menu=false; setAccStatus('');
    toast('Your Starcast data was deleted from the cloud. This device keeps its copy.');
  }catch(e){ setAccStatus('Delete failed: '+(e.message||e)); }
}

function renderAccount(){
  const btn=$('#accountBtn'), pop=$('#accountPop'); if(!btn||!pop) return;
  btn.hidden=!ACC.on;
  if(!ACC.on) return;
  const u=ACC.user, md=(u&&u.user_metadata)||{}, name=md.full_name||md.name||(u&&u.email)||'';
  btn.textContent = u ? (name.split(' ')[0] || 'Account') : 'Sign in';
  btn.setAttribute('aria-expanded', ACC.menu);
  pop.hidden=!ACC.menu;
  if(!ACC.menu) return;
  if(!u){
    pop.innerHTML = `<p class="note" style="margin:0 0 10px">Sign in to keep your saved spots, gear, observing log and settings on every device. Without an account, they stay in this browser.</p>
      <button class="btn primary gbtn" id="accGoogle"><svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Sign in with Google</button>
      <p class="note" style="margin:8px 0 0">By signing in you agree to the <a href="terms.html" target="_blank" rel="noopener">Terms</a> and <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.</p>
      ${ACC.status?`<p class="note" style="margin:8px 0 0">${esc(ACC.status)}</p>`:''}`;
  } else {
    pop.innerHTML = `<div class="row" style="gap:10px;margin-bottom:8px">${md.avatar_url?`<img src="${esc(md.avatar_url)}" alt="" width="32" height="32" style="border-radius:50%" referrerpolicy="no-referrer">`:''}
        <div style="min-width:0"><b>${esc(name)}</b><div class="sub" style="overflow:hidden;text-overflow:ellipsis">${esc(u.email||'')}</div></div></div>
      <p class="sub" style="margin:0 0 10px"><span class="dot" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${/Synced/.test(ACC.status)?'var(--good)':'var(--warn)'};margin-right:6px"></span>${esc(ACC.status||'Synced')}</p>
      <div class="row"><button class="btn" id="accOut">Sign out</button></div>
      ${ACC.confirmDelete ? `<div class="alert danger" style="margin-top:10px"><p>Delete your saved spots, gear, log and settings from Starcast’s cloud? This device keeps its own copy.</p><div class="row" style="margin-top:6px"><button class="btn danger" id="accDelYes">Delete cloud data</button><button class="btn ghost" id="accDelNo">Keep it</button></div></div>`
        : `<button class="more" id="accDel" style="margin-top:8px;font-size:12px">Delete my data from the cloud…</button>`}`;
  }
  const g=$('#accGoogle'); if(g) g.onclick=signIn;
  const o=$('#accOut'); if(o) o.onclick=signOut;
  const d=$('#accDel'); if(d) d.onclick=()=>{ ACC.confirmDelete=true; renderAccount(); };
  const dy=$('#accDelYes'); if(dy) dy.onclick=deleteCloudData;
  const dn=$('#accDelNo'); if(dn) dn.onclick=()=>{ ACC.confirmDelete=false; renderAccount(); };
}
function initAccount(){
  const btn=$('#accountBtn');
  if(!ACC.on){ renderAccount(); return; }
  ACC.client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, flowType:'pkce', storageKey:'starcast.auth' } });
  btn.onclick=e=>{ e.stopPropagation(); ACC.menu=!ACC.menu; ACC.confirmDelete=false; renderAccount(); };
  $('#accountPop').addEventListener('click', e=>e.stopPropagation()); // clicks inside the menu never close it
  document.addEventListener('click', e=>{ if(ACC.menu && e.target!==btn){ ACC.menu=false; renderAccount(); } });
  document.addEventListener('keydown', e=>{ if(e.key==='Escape' && ACC.menu){ ACC.menu=false; renderAccount(); btn.focus(); } });
  window.addEventListener('beforeunload', ()=>{ if(ACC.dirty.size) pushNow(); });
  ACC.client.auth.onAuthStateChange((event, session)=>{
    const u = session && session.user;
    if(u && (!ACC.user || ACC.user.id!==u.id)) setTimeout(()=>onSignedIn(u), 0);
    if(!u && ACC.user){ ACC.user=null; ACC.ready=false; renderAccount(); }
  });
  renderAccount();
}
