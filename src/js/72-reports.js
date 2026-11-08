/* Sky reports: observers tell Starcast what the sky really looks like, and the report is stored
   with what Starcast forecast for that spot and hour (table sky_reports, supabase/schema.sql).
   Anyone can send one; nobody can read other people's. The totals feed the accuracy numbers. */
const REPORT = { open:false, cloud:null, transp:'', seeing:'', note:'', busy:false, msg:'', err:false };
const CLOUD_CHOICES = [[0,'Clear'],[25,'Mostly clear'],[50,'Partly cloudy'],[75,'Mostly cloudy'],[100,'Overcast']];
const REPORT_GAP = 15*60e3; // one report per device every 15 minutes

function reportsOn(){ return !MODE.embed && ACC.on && !!ACC.client; }
function reportHTML(){
  if(!reportsOn()) return '';
  const last = store.get('lastReport', 0), wait = last + REPORT_GAP - Date.now();
  const opt = (v,l,cur) => `<option value="${v}" ${String(cur)===String(v)?'selected':''}>${l}</option>`;
  let h = `<details class="report" ${REPORT.open?'open':''} id="reportBox"><summary>Report your sky right now</summary><div class="rbody">`;
  if(wait > 0 && !REPORT.msg){
    h += `<p class="note" style="margin:0">Thanks for your last report. You can send another in ${Math.ceil(wait/60e3)} min.</p>`;
  } else if(REPORT.msg && !REPORT.err){
    h += `<p class="note" style="margin:0;color:var(--good)">${esc(REPORT.msg)}</p>`;
  } else {
    h += `<p class="note" style="margin:0">What does the sky look like at ${esc(locName())} now? Your answer is saved next to Starcast’s forecast for this hour, so the forecast can be checked and improved.</p>
      <div class="nights" role="group" aria-label="Cloud cover">${CLOUD_CHOICES.map(([v,l])=>`<button type="button" data-rcloud="${v}" aria-pressed="${REPORT.cloud===v}">${l}</button>`).join('')}</div>
      <div class="form">
        <label class="f">Transparency (optional)<select id="rTransp">${opt('','Not sure',REPORT.transp)}${[[5,'5 · Excellent, Milky Way crisp'],[4,'4 · Good'],[3,'3 · Average'],[2,'2 · Poor, hazy'],[1,'1 · Very poor']].map(([v,l])=>opt(v,l,REPORT.transp)).join('')}</select></label>
        <label class="f">Seeing (optional)<select id="rSeeing">${opt('','Not sure',REPORT.seeing)}${[[5,'5 · Steady, fine detail'],[4,'4 · Good'],[3,'3 · Average'],[2,'2 · Poor, shimmering'],[1,'1 · Boiling']].map(([v,l])=>opt(v,l,REPORT.seeing)).join('')}</select></label>
        <label class="f wide">Note (optional)<input type="text" id="rNote" maxlength="280" value="${esc(REPORT.note)}" placeholder="e.g. thin haze to the south"></label>
      </div>
      <div class="row"><button class="btn primary" id="rSend" ${REPORT.cloud==null||REPORT.busy?'disabled':''}>${REPORT.busy?'Sending…':'Send report'}</button>
      ${REPORT.err ? `<span class="note" style="color:var(--bad)">${esc(REPORT.msg)}</span>` : ''}</div>
      <p class="note" style="margin:0">The location is rounded to about 10 km. No name or email is attached unless you're signed in.</p>`;
  }
  return h + `</div></details>`;
}
function wireReport(){
  const box=$('#reportBox'); if(!box) return;
  box.ontoggle=()=>{ REPORT.open=box.open; };
  box.querySelectorAll('[data-rcloud]').forEach(b=>b.onclick=()=>{ REPORT.cloud=+b.dataset.rcloud; REPORT.err=false; REPORT.msg=''; keepScroll(renderPanel); });
  const t=$('#rTransp'); if(t) t.onchange=()=>{ REPORT.transp=t.value; };
  const s=$('#rSeeing'); if(s) s.onchange=()=>{ REPORT.seeing=s.value; };
  const n=$('#rNote'); if(n) n.oninput=()=>{ REPORT.note=n.value; };
  const go=$('#rSend'); if(go) go.onclick=sendReport;
}
function keepScroll(fn){ const b=$('#pbody'), y=b?b.scrollTop:0; fn(); if(b) b.scrollTop=y; }
async function sendReport(){
  if(REPORT.cloud==null || REPORT.busy) return;
  const i = nowIndex(), w = wxAt(i);
  const num = v => (v==null || isNaN(v)) ? null : Math.round(v*10)/10;
  const row = {
    observed_at: new Date().toISOString(),
    lat: Math.round(S.sel.lat*10)/10, lon: Math.round(S.sel.lon*10)/10,
    cloud: REPORT.cloud,
    transparency: REPORT.transp ? +REPORT.transp : null,
    seeing: REPORT.seeing ? +REPORT.seeing : null,
    note: REPORT.note.trim().slice(0,280) || null,
    fc_cloud: w ? num(w.cloud) : null, fc_seeing: w ? num(w.seeing) : null, fc_transp: w ? num(w.transp) : null,
    fc_source: S.point ? 'point' : GL.ready ? 'gfs' : S.grid ? 'grid' : null,
    app_version: 'v3.6'
  };
  REPORT.busy=true; REPORT.err=false; REPORT.msg=''; keepScroll(renderPanel);
  try{
    const { error } = await ACC.client.from('sky_reports').insert(row);
    if(error) throw error;
    store.set('lastReport', Date.now());
    Object.assign(REPORT, { cloud:null, transp:'', seeing:'', note:'', msg:'Thanks! Your report was sent.' });
    toast('Report sent');
  }catch(e){
    console.warn('Sky report failed', e);
    REPORT.err=true; REPORT.msg='The report couldn’t be sent. Check your connection and try again.';
  }
  REPORT.busy=false; keepScroll(renderPanel);
}
