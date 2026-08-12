const FB={"apiKey": "AIzaSyA9xYUXl1HV7kpjWfIGWQiIPJh5KJX-Ir0", "authDomain": "cinezen-9088f.firebaseapp.com", "projectId": "cinezen-9088f", "storageBucket": "cinezen-9088f.firebasestorage.app", "messagingSenderId": "421006278615", "appId": "1:421006278615:web:ef177cc74e74585e665952"};
const ADMIN_UID="mFj8ohY5bKgenY5PneMCCHyyuox2";
const IMG='https://image.tmdb.org/t/p/w500';
const LS='cinezen_admin_session';
let session=null;
const $=id=>document.getElementById(id);

function showApp(ok){
  $('loginView').classList.toggle('hidden',ok);
  $('appView').classList.toggle('hidden',!ok);
  $('logout').classList.toggle('hidden',!ok);
}
function authHeader(){return session?.idToken?{Authorization:'Bearer '+session.idToken}:{}}
async function ensureSession(){
  if(!session?.refreshToken) throw new Error('Please login again.');
  if(session.expiresAt && Date.now()<session.expiresAt) return session;
  const r=await fetch(`https://securetoken.googleapis.com/v1/token?key=${FB.apiKey}`,{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'refresh_token',refresh_token:session.refreshToken})
  });
  const d=await r.json();
  if(!r.ok) throw new Error('Session expired. Please login again.');
  session.idToken=d.id_token;
  session.refreshToken=d.refresh_token||session.refreshToken;
  session.uid=d.user_id||session.uid;
  session.expiresAt=Date.now()+(Number(d.expires_in||3600)-60)*1000;
  localStorage.setItem(LS,JSON.stringify(session));
  return session;
}
function escapeHtml(s=''){return s.replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}

async function login(email,password){
  const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FB.apiKey}`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email,password,returnSecureToken:true})
  });
  const d=await r.json();
  if(!r.ok) throw new Error(d.error?.message||'Login failed');
  if(d.localId!==ADMIN_UID) throw new Error('This account is not authorized as CineZen admin.');
  session={idToken:d.idToken,refreshToken:d.refreshToken,uid:d.localId,email:d.email,expiresAt:Date.now()+(Number(d.expiresIn||3600)-60)*1000};
  localStorage.setItem(LS,JSON.stringify(session));
  return session;
}
async function searchTMDB(q){
  const r=await fetch('/api/tmdb?action=search&q='+encodeURIComponent(q)+'&page=1');
  const d=await r.json();
  if(!r.ok) throw new Error(d.error||'TMDB search failed');
  return d.results||[];
}
async function movieDetails(id){
  const r=await fetch('/api/tmdb?action=details&id='+id);
  const d=await r.json(); if(!r.ok)throw new Error(d.error||'Details failed'); return d;
}
function fsUrl(path=''){return `https://firestore.googleapis.com/v1/projects/${FB.projectId}/databases/(default)/documents/${path}?key=${FB.apiKey}`}
function fvString(v){return v?.stringValue||''}
function fvInt(v){return Number(v?.integerValue||0)}
function parseDoc(doc){
 const f=doc.fields||{};
 return {docId:(doc.name||'').split('/').pop(),tmdbId:fvInt(f.tmdbId),title:fvString(f.title),year:fvString(f.year),posterPath:fvString(f.posterPath),language:fvString(f.language),rating:Number(f.rating?.doubleValue||f.rating?.integerValue||0)};
}
async function listPublished(){
  const r=await fetch(fsUrl('latest_movies')+'&pageSize=100');
  const d=await r.json(); if(!r.ok)throw new Error(d.error?.message||'Firestore read failed');
  return (d.documents||[]).map(parseDoc);
}
async function publishMovie(m){
  await ensureSession();
  const d=await movieDetails(m.id);
  const year=(d.release_date||'').slice(0,4);
  const fields={
    tmdbId:{integerValue:String(d.id)},
    title:{stringValue:d.title||''},
    year:{stringValue:year},
    releaseDate:{stringValue:d.release_date||''},
    posterPath:{stringValue:d.poster_path||''},
    language:{stringValue:d.original_language||''},
    overview:{stringValue:d.overview||''},
    rating:{doubleValue:Number(d.vote_average||0)},
    publishedAt:{timestampValue:new Date().toISOString()}
  };
  const url=`https://firestore.googleapis.com/v1/projects/${FB.projectId}/databases/(default)/documents/latest_movies/${d.id}?key=${FB.apiKey}`;
  const r=await fetch(url,{method:'PATCH',headers:{'Content-Type':'application/json',...authHeader()},body:JSON.stringify({fields})});
  const x=await r.json(); if(!r.ok)throw new Error(x.error?.message||'Publish failed'); return x;
}
async function removeMovie(id){
  await ensureSession();
  const url=`https://firestore.googleapis.com/v1/projects/${FB.projectId}/databases/(default)/documents/latest_movies/${id}?key=${FB.apiKey}`;
  const r=await fetch(url,{method:'DELETE',headers:authHeader()});
  if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error?.message||'Remove failed')}
}

function card(m,published=false){
 const poster=m.poster_path||m.posterPath;
 const year=(m.release_date||'').slice(0,4)||m.year||'—';
 return `<article class="card"><div class="poster"><img src="${poster?IMG+poster:''}" alt=""></div><div class="body">
 <h3>${escapeHtml(m.title||'Untitled')}</h3><div class="meta">${year} • ${(m.original_language||m.language||'').toUpperCase()}</div>
 <button class="${published?'ghost remove':'primary'}" data-id="${m.id||m.tmdbId}">${published?'Remove':'Publish / Now Available'}</button></div></article>`;
}
async function refreshPublished(){
 try{
   const list=await listPublished();
   $('count').textContent=list.length+' published';
   $('publishedEmpty').classList.toggle('hidden',list.length>0);
   $('published').innerHTML=list.map(x=>card(x,true)).join('');
   $('published').querySelectorAll('button').forEach(b=>b.onclick=async()=>{if(confirm('Remove this movie from Now Available?')){await removeMovie(b.dataset.id);await refreshPublished();}});
 }catch(e){$('count').textContent=e.message}
}

$('loginForm').onsubmit=async e=>{e.preventDefault();$('loginMsg').textContent='Logging in...';try{await login($('email').value.trim(),$('password').value);showApp(true);$('loginMsg').textContent='';await refreshPublished();}catch(err){$('loginMsg').textContent=err.message}};
$('logout').onclick=()=>{localStorage.removeItem(LS);session=null;showApp(false)};
$('searchBtn').onclick=async()=>{const q=$('movieSearch').value.trim();if(!q)return;$('searchMsg').textContent='Searching...';try{const list=await searchTMDB(q);$('results').innerHTML=list.slice(0,20).map(x=>card(x,false)).join('');$('searchMsg').textContent=list.length?'Select the exact movie and publish it.':'No results';$('results').querySelectorAll('button').forEach(b=>b.onclick=async()=>{b.disabled=true;b.textContent='Publishing...';try{const m=list.find(x=>String(x.id)===String(b.dataset.id));await publishMovie(m);b.textContent='Published ✓';await refreshPublished();}catch(e){b.disabled=false;b.textContent='Publish / Now Available';alert(e.message)}});}catch(e){$('searchMsg').textContent=e.message}};

try{session=JSON.parse(localStorage.getItem(LS)||'null')}catch{session=null}
if(session?.uid===ADMIN_UID){showApp(true);refreshPublished()}else{showApp(false)}
