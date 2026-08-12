const FB={"apiKey": "AIzaSyA9xYUXl1HV7kpjWfIGWQiIPJh5KJX-IrQ", "authDomain": "cinezen-9088f.firebaseapp.com", "projectId": "cinezen-9088f", "storageBucket": "cinezen-9088f.firebasestorage.app", "messagingSenderId": "421006278615", "appId": "1:421006278615:web:ef177cc74e74585e669592"};
const ADMIN_UID="mFj8ohY5bKgenY5PneMCCHyyuox2";
const IMG='https://image.tmdb.org/t/p/w500';
const LS='cinezen_admin_session';
let session=null;
let suggestTimer;
let suggestionResults=[];
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
async function removeMovie(docId){
  await ensureSession();
  const url=`https://firestore.googleapis.com/v1/projects/${FB.projectId}/databases/(default)/documents/latest_movies/${encodeURIComponent(docId)}?key=${FB.apiKey}`;
  const r=await fetch(url,{method:'DELETE',headers:authHeader()});
  if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error?.message||'Remove failed')}
}

function card(m,published=false){
 const poster=m.poster_path||m.posterPath;
 const year=(m.release_date||'').slice(0,4)||m.year||'—';
 return `<article class="card"><div class="poster"><img src="${poster?IMG+poster:''}" alt=""></div><div class="body">
 <h3>${escapeHtml(m.title||'Untitled')}</h3><div class="meta">${year} • ${(m.original_language||m.language||'').toUpperCase()}</div>
 <button class="${published?'ghost remove':'primary'}" data-id="${published ? (m.docId||m.tmdbId||m.id) : (m.id||m.tmdbId)}">${published?'Remove':'Publish / Now Available'}</button></div></article>`;
}

function parseRequestDoc(doc){
  const f=doc.fields||{};
  return {
    docId:(doc.name||'').split('/').pop(),
    tmdbId:Number(f.tmdbId?.integerValue||0),
    title:f.title?.stringValue||'',
    year:f.year?.stringValue||'',
    posterPath:f.posterPath?.stringValue||'',
    language:f.language?.stringValue||'',
    requestedAt:f.requestedAt?.timestampValue||''
  };
}
async function listRequests(){
  const r=await fetch(fsUrl('movie_requests')+'&pageSize=100');
  const d=await r.json();
  if(!r.ok) throw new Error(d.error?.message||'Request list failed');
  return (d.documents||[]).map(parseRequestDoc)
    .sort((a,b)=>String(b.requestedAt).localeCompare(String(a.requestedAt)));
}
async function deleteRequest(docId){
  await ensureSession();
  const url=`https://firestore.googleapis.com/v1/projects/${FB.projectId}/databases/(default)/documents/movie_requests/${encodeURIComponent(docId)}?key=${FB.apiKey}`;
  const r=await fetch(url,{method:'DELETE',headers:authHeader()});
  if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error?.message||'Delete request failed')}
}
async function refreshRequests(){
  try{
    const list=await listRequests();
    $('requestCount').textContent=list.length+' pending';
    $('requestsEmpty').classList.toggle('hidden',list.length>0);
    $('requests').innerHTML=list.map(m=>`
      <article class="card">
        <div class="poster"><img src="${m.posterPath?IMG+m.posterPath:''}" alt=""></div>
        <div class="body">
          <h3>${escapeHtml(m.title||'Untitled')}</h3>
          <div class="meta">${m.year||'—'} • ${(m.language||'').toUpperCase()}</div>
          <button class="primary req-publish" data-id="${m.tmdbId}" data-doc="${m.docId}">Publish / Now Available</button>
          <button class="ghost remove req-delete" data-doc="${m.docId}" style="margin-top:8px">Delete Request</button>
        </div>
      </article>`).join('');
    $('requests').querySelectorAll('.req-publish').forEach(b=>b.onclick=async()=>{
      b.disabled=true;b.textContent='Publishing...';
      try{
        await publishMovie({id:Number(b.dataset.id)});
        await deleteRequest(b.dataset.doc);
        await refreshPublished();await refreshRequests();
        await refreshRequests();
      }catch(e){
        b.disabled=false;b.textContent='Publish / Now Available';
        alert(e.message);
      }
    });
    $('requests').querySelectorAll('.req-delete').forEach(b=>b.onclick=async()=>{
      if(!confirm('Delete this request?')) return;
      try{
        await deleteRequest(b.dataset.doc);
        await refreshRequests();
      }catch(e){ alert(e.message); }
    });
  }catch(e){
    $('requestCount').textContent=e.message;
  }
}

async function refreshPublished(){
 try{
   const list=await listPublished();
   $('count').textContent=list.length+' published';
   $('publishedEmpty').classList.toggle('hidden',list.length>0);
   $('published').innerHTML=list.map(x=>card(x,true)).join('');
   $('published').querySelectorAll('button').forEach(b=>b.onclick=async()=>{if(confirm('Remove this movie from Now Available?')){await removeMovie(b.dataset.id);await refreshPublished();await refreshRequests();}});
 }catch(e){$('count').textContent=e.message}
}


function hideSuggestions(){
  $('suggestions').classList.add('hidden');
  $('suggestions').innerHTML='';
}
function renderSuggestions(list){
  suggestionResults=list.slice(0,8);
  const box=$('suggestions');
  if(!suggestionResults.length){ hideSuggestions(); return; }
  box.innerHTML=suggestionResults.map((m,i)=>{
    const year=(m.release_date||'').slice(0,4)||'—';
    const poster=m.poster_path?IMG+m.poster_path:'';
    return `<div class="suggestion" data-index="${i}">
      ${poster?`<img src="${poster}" alt="">`:`<div style="width:42px;height:58px;background:#171c28;border-radius:7px"></div>`}
      <div><div class="stitle">${escapeHtml(m.title||m.original_title||'Untitled')}</div>
      <div class="smeta">${year} • ${(m.original_language||'').toUpperCase()}</div></div>
    </div>`;
  }).join('');
  box.classList.remove('hidden');
  box.querySelectorAll('.suggestion').forEach(x=>x.onclick=()=>{
    const m=suggestionResults[Number(x.dataset.index)];
    $('movieSearch').value=m.title||m.original_title||'';
    hideSuggestions();
    showSearchResults([m]);
  });
}
function showSearchResults(list){
  $('results').innerHTML=list.slice(0,20).map(x=>card(x,false)).join('');
  $('searchMsg').textContent=list.length?'Select the exact movie and publish it.':'No results';
  $('results').querySelectorAll('button').forEach(b=>b.onclick=async()=>{
    b.disabled=true;b.textContent='Publishing...';
    try{
      const m=list.find(x=>String(x.id)===String(b.dataset.id));
      await publishMovie(m);
      b.textContent='Published ✓';
      await refreshPublished();await refreshRequests();
    }catch(e){
      b.disabled=false;
      b.textContent='Publish / Now Available';
      alert(e.message)
    }
  });
}

$('loginForm').onsubmit=async e=>{e.preventDefault();$('loginMsg').textContent='Logging in...';try{await login($('email').value.trim(),$('password').value);showApp(true);$('loginMsg').textContent='';await refreshPublished();await refreshRequests();}catch(err){$('loginMsg').textContent=err.message}};
$('logout').onclick=()=>{localStorage.removeItem(LS);session=null;showApp(false)};
$('searchBtn').onclick=async()=>{
  const q=$('movieSearch').value.trim();
  if(!q)return;
  hideSuggestions();
  $('searchMsg').textContent='Searching...';
  try{
    const list=await searchTMDB(q);
    showSearchResults(list);
  }catch(e){
    $('searchMsg').textContent=e.message;
  }
};

$('movieSearch').addEventListener('input',()=>{
  clearTimeout(suggestTimer);
  const q=$('movieSearch').value.trim();
  if(q.length<2){hideSuggestions();return;}
  suggestTimer=setTimeout(async()=>{
    try{
      const list=await searchTMDB(q);
      renderSuggestions(list);
    }catch(e){
      hideSuggestions();
    }
  },300);
});
$('movieSearch').addEventListener('keydown',e=>{
  if(e.key==='Enter'){
    e.preventDefault();
    hideSuggestions();
    $('searchBtn').click();
  }
});
document.addEventListener('click',e=>{
  if(!e.target.closest('.searchWrap')) hideSuggestions();
});

try{session=JSON.parse(localStorage.getItem(LS)||'null')}catch{session=null}
if(session?.uid===ADMIN_UID){showApp(true);refreshPublished();refreshRequests()}else{showApp(false)}
