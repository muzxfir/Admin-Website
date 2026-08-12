export default async function handler(req, res) {
  const token = process.env.TMDB_API_TOKEN;
  if (!token) return res.status(500).json({ error: 'TMDB_API_TOKEN is not configured in Vercel.' });

  const {
    action='discover', q='', page='1', genre='', language='',
    sort='popularity.desc', id=''
  } = req.query;

  const base='https://api.themoviedb.org/3';
  const params=new URLSearchParams({language:'en-US'});
  let path='';

  if(action==='genres'){
    path='/genre/movie/list';
  }else if(action==='search'){
    path='/search/movie';
    params.set('query',q);
    params.set('page',page);
    params.set('include_adult','false');
  }else if(action==='details'){
    if(!/^\d+$/.test(String(id))) return res.status(400).json({error:'Invalid movie id.'});
    path=`/movie/${id}`;
    params.set('append_to_response','videos,credits,similar');
  }else if(action==='trending'){
    path='/trending/movie/week';
    params.set('page',page);
  }else if(action==='upcoming'){
    path='/movie/upcoming';
    params.set('page',page);
    params.set('region','US');
  }else if(action==='toprated'){
    path='/movie/top_rated';
    params.set('page',page);
  }else{
    path='/discover/movie';
    params.set('page',page);
    params.set('include_adult','false');
    params.set('include_video','false');
    params.set('sort_by',sort||'popularity.desc');
    if(genre) params.set('with_genres',genre);
    if(language) params.set('with_original_language',language);
    if(sort==='vote_average.desc') params.set('vote_count.gte','100');
  }

  try{
    const response=await fetch(`${base}${path}?${params.toString()}`,{
      headers:{accept:'application/json',Authorization:`Bearer ${token}`}
    });
    const data=await response.json();
    if(!response.ok) return res.status(response.status).json({error:data.status_message||'TMDB error'});
    res.setHeader('Cache-Control',action==='details'?'s-maxage=1800, stale-while-revalidate=86400':'s-maxage=300, stale-while-revalidate=1800');
    return res.status(200).json(data);
  }catch(e){
    return res.status(500).json({error:'Unable to reach TMDB.'});
  }
}
