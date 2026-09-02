import readXlsxFile from 'read-excel-file';
import { DETECTION_POINTS, OCCURRENCE_TABLE } from './config';

function mapDet(r) {
  const M = { 'Recepción':'Recepción','Autocontrol':'Autocontrol','Autocontrol & Scrap':'Autocontrol','IPPM':'IPPM','Scrap':'Scrap','Quality Gate':'Quality Gate','Fast Audit':'Fast Audit','Auditoría de Producto':'Auditoría de Producto','Auditoría de producto':'Auditoría de Producto','Antena':'Antena','SCA':'SCA','CPA/SCA':'SCA','TDF/TTV':'TDF/TTV','Garantía':'Garantía' };
  return M[(r||'').toString().trim()] || null;
}
function findVal(row, s, e) { for (let c = s; c <= e && c < row.length; c++) { const v = row[c]; if (v != null && v !== '' && String(v).trim() !== '') return String(v).trim(); } return null; }
function calcOcc(pct) { if (pct <= 0) return 1; for (let i = OCCURRENCE_TABLE.length - 1; i >= 0; i--) if (pct >= OCCURRENCE_TABLE[i].pct) return OCCURRENCE_TABLE[i].occ; return 1; }

function parseRows(rows) {
  const h = rows[0], isAmp = h.length > 100, recs = [];
  if (isAmp) {
    for (let i = 2; i < rows.length; i++) { const r = rows[i]; if (!r || r.length < 92) continue; const det=findVal(r,9,19),seat=findVal(r,20,23),qd=findVal(r,24,53),qt=findVal(r,54,86),mod=findVal(r,87,91),comp=findVal(r,92,124),def=findVal(r,125,r.length-1); if(!det||!seat||!comp||!def)continue; const dp=mapDet(det);if(!dp)continue; recs.push({dp,quad:qd||qt||'N/A',model:mod||'N/A',comp,def}); }
  } else {
    const c11=String(h[11]||'').toLowerCase(),hasSeq=c11.includes('secuencia')||c11.includes('número');
    const qdc=hasSeq?12:11,qtc=13,cm=14,cc=15,ds=16;
    let sr=1;if(rows.length>1){const t=String(rows[1][9]||'').trim().toLowerCase();if(t==='response'||t==='')sr=2;}
    for(let i=sr;i<rows.length;i++){const r=rows[i];if(!r||r.length<cc+1)continue;const det=r[9],seat=r[10],mod=r[cm],comp=r[cc];if(!det||!seat||!comp)continue;const def=findVal(r,ds,r.length-1);if(!def||def.toLowerCase()==='response')continue;const dp=mapDet(String(det).trim());if(!dp)continue;let q=null;const v1=r[qdc],v2=r[qtc];if(v1&&String(v1).trim()&&String(v1).toLowerCase()!=='response')q=String(v1).trim();else if(v2&&String(v2).trim()&&String(v2).toLowerCase()!=='response')q=String(v2).trim();recs.push({dp,quad:q||'N/A',model:(mod&&String(mod).trim())||'N/A',comp:String(comp).trim(),def});}
  }
  return recs;
}

export async function processExcelFile(file, bancosCtrl, defectosDb) {
  const result = await readXlsxFile(file);
  let rows; if(Array.isArray(result)&&result.length>0)rows=(result[0]&&result[0].data)?result[0].data:Array.isArray(result[0])?result:null;
  if(!rows||rows.length<3)throw new Error('El archivo no tiene datos suficientes');
  const recs=parseRows(rows);if(recs.length===0)throw new Error('No se encontraron registros válidos.');
  const bancos=bancosCtrl||recs.length;
  const groups={};
  for(const r of recs){const key=`${r.def}||${r.quad}||${r.model}`;if(!groups[key])groups[key]={def:r.def,quad:r.quad,model:r.model,comp:r.comp,count:0,dps:{}};groups[key].count++;groups[key].dps[r.dp]=(groups[key].dps[r.dp]||0)+1;}
  const qaRows=[];
  for(const g of Object.values(groups)){
    const dbMatch=defectosDb[g.def];const db=dbMatch||{severidad:3,costo_interno:1,costo_externo:4};const sev=db.severidad;
    let hasI=false,hasE=false;for(const dp of DETECTION_POINTS){if(g.dps[dp.key]>0){if(dp.scope==='int')hasI=true;else hasE=true;}}
    const costo=(hasI&&hasE)?Math.max(db.costo_interno,db.costo_externo):hasE?db.costo_externo:db.costo_interno;
    const pct=g.count/bancos,occ=calcOcc(pct);let det=0;const dpB={};for(const dp of DETECTION_POINTS){if(g.dps[dp.key]>0){det+=dp.weight;dpB[dp.key]=dp.weight;}}if(det===0)det=4;
    qaRows.push({concat:`${g.def} en el sector ${g.quad} del modelo ${g.model}`,defectName:g.def,model:g.model,quadrant:g.quad,component:g.comp,severidad:sev,cantDefectos:g.count,ocurrenciaPct:pct,ocurrencia:occ,detectabilidad:det,dpBreakdown:dpB,dpCounts:{...g.dps},costo,costoInterno:db.costo_interno,costoExterno:db.costo_externo,index:sev*occ*det*costo,notInDb:!dbMatch});
  }
  qaRows.sort((a,b)=>b.index-a.index);
  const totalDef=qaRows.reduce((s,r)=>s+r.cantDefectos,0),totalIdx=qaRows.reduce((s,r)=>s+r.index,0);
  let cumIdx=0;for(const r of qaRows){cumIdx+=r.index;const p=cumIdx/totalIdx;r.voz=p<=0.5?'AA':p<=0.7?'A':p<=0.9?'B':'C';}
  qaRows.forEach((r,i)=>{r.vozNum=i+1;});
  return{qaRows,totalRecords:recs.length,totalDefectTypes:qaRows.length,bancosControlados:bancos,totalDefects:totalDef,format:rows[0].length>100?'ampliado':'condensado',summary:{AA:qaRows.filter(r=>r.voz==='AA').length,A:qaRows.filter(r=>r.voz==='A').length,B:qaRows.filter(r=>r.voz==='B').length,C:qaRows.filter(r=>r.voz==='C').length}};
}

export function unifyVoices(qaRows, destNum, origenNums) {
  const dest=qaRows.find(r=>r.vozNum===destNum);if(!dest)return qaRows;
  const origenSet=new Set(origenNums),toMerge=qaRows.filter(r=>origenSet.has(r.vozNum));
  for(const src of toMerge){dest.cantDefectos+=src.cantDefectos;for(const[k,v] of Object.entries(src.dpBreakdown)){if(!dest.dpBreakdown[k])dest.dpBreakdown[k]=v;}}
  let det=0;for(const dp of DETECTION_POINTS){if(dest.dpBreakdown[dp.key])det+=dp.weight;}dest.detectabilidad=det||4;
  dest.index=dest.severidad*dest.ocurrencia*dest.detectabilidad*dest.costo;
  const filtered=qaRows.filter(r=>!origenSet.has(r.vozNum));filtered.sort((a,b)=>b.index-a.index);
  const totalIdx=filtered.reduce((s,r)=>s+r.index,0);let cumIdx=0;
  filtered.forEach((r,i)=>{r.vozNum=i+1;cumIdx+=r.index;const p=cumIdx/totalIdx;r.voz=p<=0.5?'AA':p<=0.7?'A':p<=0.9?'B':'C';});
  return filtered;
}
