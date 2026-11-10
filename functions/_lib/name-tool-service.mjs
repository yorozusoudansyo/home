import { release } from './name-tool-release.mjs';

const COOKIE = '__Secure-name_tool_access';
const TTL = 30 * 60;
const PURPOSES = ['Excelの資料作成', 'PowerPointの資料作成', 'ExcelからPowerPointの作成', '社内でのAI活用・研修', 'その他'];
const CHALLENGES = ['お客様名を伏せる作業が大変', '元の名前に戻す作業が大変', '置き換え漏れが心配', '社内で使える方法が分からない', 'まず試してみたい', 'その他'];
const headers = {'Cache-Control':'private, no-store, max-age=0', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer'};
const json = (data, status=200, extra={}) => new Response(JSON.stringify(data), {status, headers:{...headers,'Content-Type':'application/json; charset=utf-8',...extra}});
async function digest(value) {return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))), x=>x.toString(16).padStart(2,'0')).join('');}
const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), x=>x.toString(16).padStart(2,'0')).join('');
async function readJson(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw Error('形式を確認してください。');
  const reader=request.body?.getReader();if(!reader)throw Error('回答がありません。');
  const chunks=[];let size=0;try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();throw Error('回答が長すぎます。');}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw Error('回答の形式を確認してください。');}
}
function validate(data) {
  if(!data || typeof data!=='object' || Array.isArray(data))throw Error('回答を確認してください。');
  if(typeof data.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.id))throw Error('ページを再読み込みして回答してください。');
  const email=typeof data.email==='string'?data.email.trim().toLowerCase():'';
  if(email.length>254||!/^[^\s@<>\u0000-\u001f]+@[^\s@<>\u0000-\u001f]+\.[^\s@<>\u0000-\u001f]+$/.test(email))throw Error('メールアドレスを確認してください。');
  if(!PURPOSES.includes(data.purpose))throw Error('用途を選んでください。');
  if(!Array.isArray(data.challenges)||!data.challenges.length||data.challenges.length>CHALLENGES.length||data.challenges.some(x=>!CHALLENGES.includes(x)))throw Error('困りごとを1つ以上選んでください。');
  const note=typeof data.note==='string'?data.note.trim():'';
  if(note.length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(note))throw Error('補足は1,000文字以内で入力してください。');
  if(data.privacy!==true)throw Error('回答の取り扱いをご確認ください。');
  if(data.marketing!==true&&data.marketing!==false)throw Error('任意の案内配信の選択を確認してください。');
  if(data.website)throw Error('送信できませんでした。');
  return {id:data.id,email,purpose:data.purpose,challenges:[...new Set(data.challenges)].sort(),note,marketing:data.marketing};
}
async function granted(request,db) {
  const cookie=request.headers.get('cookie')||'';
  const token=cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if(!token||!/^[0-9a-f]{64}$/.test(token))return false;
  const row=await db.prepare('SELECT id FROM name_tool_surveys WHERE grant_hash = ? AND grant_expires > ? AND release_key = ?').bind(await digest(token),Date.now(),release.key).first();
  return row||null;
}
async function submit(request,db) {
  const data=validate(await readJson(request));
  const payloadHash=await digest(JSON.stringify({...data,id:undefined}));
  const previous=await db.prepare('SELECT payload_hash FROM name_tool_surveys WHERE id = ?').bind(data.id).first();
  if(previous&&previous.payload_hash!==payloadHash)return json({error:'回答内容が変わっています。ページを再読み込みしてください。'},409);
  if(!previous){const count=await db.prepare('SELECT COUNT(*) AS count FROM name_tool_surveys WHERE email = ? AND created_at >= ?').bind(data.email,new Date(Date.now()-3600000).toISOString()).first();if(Number(count?.count)>=5)return json({error:'しばらく時間を置いてからお試しください。'},429);}
  const token=random(),hash=await digest(token),expires=Date.now()+TTL*1000;
  await db.prepare(`INSERT INTO name_tool_surveys (id,email,purpose,challenges,note,marketing,privacy_version,release_key,payload_hash,grant_hash,grant_expires,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET grant_hash=excluded.grant_hash,grant_expires=excluded.grant_expires
    WHERE name_tool_surveys.payload_hash = excluded.payload_hash`).bind(data.id,data.email,data.purpose,JSON.stringify(data.challenges),data.note,data.marketing?1:0,'2026-11-10',release.key,payloadHash,hash,expires,new Date().toISOString()).run();
  if(!await db.prepare('SELECT id FROM name_tool_surveys WHERE grant_hash = ?').bind(hash).first())return json({error:'回答を保存できませんでした。もう一度お試しください。'},503);
  return json({saved:true,expiresAt:expires,release:release.key},200,{'Set-Cookie':`${COOKIE}=${token}; Path=/api/name-tool; HttpOnly; Secure; SameSite=Strict; Max-Age=${TTL}`});
}
function csvCell(value){let text=String(value??'');if(/^[\s\uFEFF]*[=+@\-\t\r\n]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
async function adminDenied(request,env) {
  const expected=env.NAME_TOOL_ADMIN_TOKEN;
  if(!expected||expected.length<32)return json({error:'回答管理の接続設定が必要です。'},503);
  const actual=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
  if(await digest(actual)!==await digest(expected))return json({error:'管理キーを確認してください。'},401);
  return null;
}
async function statistics(request,env){
  const denied=await adminDenied(request,env);if(denied)return denied;
  const surveys=await env.NAME_TOOL_DB.prepare('SELECT COUNT(*) AS answers,COUNT(DISTINCT email) AS emails FROM name_tool_surveys').first();
  const total=await env.NAME_TOOL_DB.prepare('SELECT COUNT(*) AS downloads,COUNT(DISTINCT s.email) AS emails FROM name_tool_download_events d JOIN name_tool_surveys s ON s.id = d.response_id').first();
  const grouped=await env.NAME_TOOL_DB.prepare('SELECT d.file_id,d.file_name,COUNT(*) AS downloads,COUNT(DISTINCT s.email) AS emails,MAX(d.downloaded_at) AS latest FROM name_tool_download_events d JOIN name_tool_surveys s ON s.id = d.response_id GROUP BY d.file_id,d.file_name ORDER BY downloads DESC,d.file_id').all();
  const known=new Set((grouped.results||[]).map(r=>r.file_id));
  return json({answers:Number(surveys.answers),answerEmails:Number(surveys.emails),downloads:Number(total.downloads),downloadEmails:Number(total.emails),files:[...(grouped.results||[]),...release.files.filter(f=>!known.has(f.id)).map(f=>({file_id:f.id,file_name:f.name,downloads:0,emails:0,latest:null}))],measuredAt:new Date().toISOString(),definition:'ファイルの配信開始回数。PCへの保存完了を保証しません。重複除外はメールアドレス単位で、本人確認はしていません。'});
}
async function exportCsv(request,env) {
  const denied=await adminDenied(request,env);if(denied)return denied;
  const url=new URL(request.url),before=url.searchParams.get('before'),beforeId=url.searchParams.get('beforeId')||'';
  if(before&&!/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(before))return json({error:'日時の形式を確認してください。'},400);
  if(beforeId&&!/^[0-9a-f-]{36}$/i.test(beforeId))return json({error:'回答IDの形式を確認してください。'},400);
  const result=await env.NAME_TOOL_DB.prepare('SELECT id,email,purpose,challenges,note,marketing,privacy_version,release_key,created_at FROM name_tool_surveys WHERE created_at < ? OR (created_at = ? AND id < ?) ORDER BY created_at DESC,id DESC LIMIT 1000').bind(before||'9999',before||'9999',beforeId).all();
  const rows=result.results||[];
  const csv='\uFEFF'+[['回答ID','メールアドレス','用途','困りごと','補足','案内配信への同意','取り扱い説明の版','配布版','回答日時（UTC）'],...rows.map(r=>[r.id,r.email,r.purpose,JSON.parse(r.challenges).join(' / '),r.note,r.marketing?'希望する':'希望しない',r.privacy_version,r.release_key,r.created_at])].map(row=>row.map(csvCell).join(',')).join('\r\n');
  return new Response(csv,{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="name-tool-survey.csv"','X-Export-Count':String(rows.length),'X-Next-Before':rows.length===1000?rows.at(-1).created_at:'','X-Next-Before-Id':rows.length===1000?rows.at(-1).id:''}});
}
export async function handleNameTool(request,env) {
  const url=new URL(request.url),route=url.pathname.replace(/^\/api\/name-tool\/?/,'');
  if(request.method==='POST'&&request.headers.get('origin')!==url.origin)return json({error:'このページから送信し直してください。'},403);
  if(request.headers.get('sec-fetch-site')==='cross-site')return json({error:'このページから操作してください。'},403);
  if(!env.NAME_TOOL_DB)return json({error:'ダウンロードの準備中です。しばらくしてからお試しください。'},503);
  try {
    if(route==='status'||route==='survey'){
      const ready=await env.NAME_TOOL_DB.prepare('SELECT COUNT(*) AS count FROM name_tool_release_chunks WHERE release_key = ?').bind(release.key).first();
      if(Number(ready?.count)!==release.files.reduce((sum,file)=>sum+file.chunks,0))return json({error:'配布ファイルの準備中です。時間を置いてお試しください。'},503);
    }
    if(route==='survey'&&request.method==='POST')return await submit(request,env.NAME_TOOL_DB);
    if(route==='admin/export'&&request.method==='GET')return await exportCsv(request,env);
    if(route==='admin/stats'&&request.method==='GET')return await statistics(request,env);
    if(route==='status'&&request.method==='GET')return json({ready:true,granted:Boolean(await granted(request,env.NAME_TOOL_DB)),release:release.key,files:release.files});
    if(route==='download'&&request.method==='GET'){
      const response=await granted(request,env.NAME_TOOL_DB);
      if(!response)return json({error:'アンケートに回答してからダウンロードしてください。30分を過ぎた場合は再度回答してください。'},403);
      const file=release.files.find(f=>f.id===url.searchParams.get('file'));if(!file)return json({error:'ファイルが見つかりません。'},404);
      const chunks=await env.NAME_TOOL_DB.prepare('SELECT chunk_index,payload FROM name_tool_release_chunks WHERE release_key = ? AND file_id = ? ORDER BY chunk_index').bind(release.key,file.id).all();
      const rows=chunks.results||[];if(rows.length!==file.chunks||rows.some((r,i)=>r.chunk_index!==i))return json({error:'配布ファイルの準備中です。時間を置いてお試しください。'},503);
      const bytes=new Uint8Array(file.size);let offset=0;for(const row of rows){const chunk=Uint8Array.from(atob(row.payload),c=>c.charCodeAt(0));bytes.set(chunk,offset);offset+=chunk.length;}
      const checksum=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
      if(offset!==file.size||checksum!==file.sha256)return json({error:'配布ファイルを確認できませんでした。時間を置いてお試しください。'},503);
      await env.NAME_TOOL_DB.prepare('INSERT INTO name_tool_download_events (id,response_id,release_key,file_id,file_name,downloaded_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),response.id,release.key,file.id,file.name,new Date().toISOString()).run();
      return new Response(bytes,{headers:{...headers,'Content-Type':file.type,'Content-Disposition':`attachment; filename="${file.id}.${file.ext}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Content-Length':String(bytes.length)}});
    }
    return json({error:'ページが見つかりません。'},404);
  } catch(error) {
    // Never return database errors, request payloads, or email addresses.
    if(route==='survey'&&error.message&&!/SQLITE|D1|database|syntax|table|column/i.test(error.message)){
      const messages=['形式を確認してください。','回答がありません。','回答が長すぎます。','回答の形式を確認してください。','回答を確認してください。','ページを再読み込みして回答してください。','メールアドレスを確認してください。','用途を選んでください。','困りごとを1つ以上選んでください。','補足は1,000文字以内で入力してください。','回答の取り扱いをご確認ください。','任意の案内配信の選択を確認してください。','送信できませんでした。'];
      if(messages.includes(error.message))return json({error:error.message},400);
    }
    return json({error:'処理を完了できませんでした。時間を置いてからお試しください。'},503);
  }
}
