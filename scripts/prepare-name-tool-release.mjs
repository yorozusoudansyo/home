import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const source=path.resolve(process.argv[2]||'../local-name-tool');
const inputs=[{id:'app',path:'お客様名の置き換え・復元.html',type:'text/html',label:'アプリ本体'}, {id:'manual',path:'操作マニュアル/お客様名の置き換えと復元 操作マニュアル.pdf',type:'application/pdf',label:'操作マニュアル'}];
for(const name of(await readdir(path.join(source,'samples'))).filter(n=>/\.(xlsx|pptx)$/.test(n)).sort())inputs.push({id:'sample-'+String(inputs.length-1).padStart(2,'0'),path:'samples/'+name,type:name.endsWith('xlsx')?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/vnd.openxmlformats-officedocument.presentationml.presentation',label:'練習用サンプル'});
if(inputs.length!==12)throw Error('Expected only the app, manual, and 10 fake-data samples');
const payloads=[],manifest=[];
for(const item of inputs){const data=await readFile(path.join(source,item.path)),name=path.basename(item.path),sha256=createHash('sha256').update(data).digest('hex');payloads.push(data);manifest.push({id:item.id,name,label:item.label,type:item.type,ext:path.extname(name).slice(1),size:data.length,chunks:Math.ceil(data.length/49152),sha256});}
const release={key:'2026-11-10-'+createHash('sha256').update(JSON.stringify(manifest)).digest('hex').slice(0,12),files:manifest};
await writeFile('functions/_lib/name-tool-release.mjs','// Public file metadata only. Actual downloads are in the private D1 database.\nexport const release='+JSON.stringify(release)+';\n');
await mkdir('.local',{recursive:true});
const sql=[];for(const [index,data]of payloads.entries())for(let offset=0,chunk=0;offset<data.length;offset+=49152,chunk++)sql.push(`INSERT OR REPLACE INTO name_tool_release_chunks (release_key,file_id,chunk_index,payload) VALUES ('${release.key}','${manifest[index].id}',${chunk},'${data.subarray(offset,offset+49152).toString('base64')}');`);
await writeFile('.local/name-tool-release.sql',sql.join('\n')+'\n');
console.log(JSON.stringify({release:release.key,files:manifest.length,bytes:manifest.reduce((n,f)=>n+f.size,0)}));
