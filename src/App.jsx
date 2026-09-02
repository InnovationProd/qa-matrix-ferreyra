import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { processExcelFile, unifyVoices } from './engine';
import { DETECTION_POINTS, TURNOS, ORIGENES, DESTINOS, TIPOS_MATERIAL, DESTINO_COLORS } from './config';
import * as XLSX from 'xlsx';
import readXlsxFile from 'read-excel-file';
import { fetchDefectos, upsertDefecto, deleteDefecto, bulkUpsertDefectos, saveGiro, fetchGiros, fetchGiro, deleteGiro, updateGiroRows, savePdca, fetchPdcas, saveUnificacion, fetchLineas, signIn, signOut, getSession, onAuthChange, subscribeGiros, subscribePdca, fetchScrapEventos, saveScrapEvento, deleteScrapEvento, subscribeScrap } from './supabase';

const VC={AA:'#DC2626',A:'#EA580C',B:'#CA8A04',C:'#16A34A'};
const Voz=({v})=><span className="voz-badge" data-voz={v} style={{background:VC[v],color:'#fff',padding:'2px 8px',borderRadius:4,fontWeight:700,fontSize:12,letterSpacing:1}}>{v}</span>;
const Btn=({children,onClick,bg='#334155',color='#F8FAFC',style,...p})=><button onClick={onClick} style={{padding:'7px 16px',background:bg,color,border:'none',borderRadius:6,fontWeight:600,fontSize:13,...style}} {...p}>{children}</button>;

export default function App(){
  const[session,setSession]=useState(null);
  const[authLoading,setAuthLoading]=useState(true);
  const[authError,setAuthError]=useState('');
  const[loginEmail,setLoginEmail]=useState('');
  const[loginPass,setLoginPass]=useState('');
  const[lineas,setLineas]=useState([]);
  const[linea,setLinea]=useState(null);
  const[page,setPage]=useState('home');
  const[result,setResult]=useState(null);
  const[giroId,setGiroId]=useState(null);
  const[giroName,setGiroName]=useState('');
  const[error,setError]=useState(null);
  const[loading,setLoading]=useState(false);
  const[filter,setFilter]=useState('ALL');
  const[search,setSearch]=useState('');
  const[selectedRow,setSelectedRow]=useState(null);
  const[bancos,setBancos]=useState('');
  const[piezasTotales,setPiezasTotales]=useState('');
  const[diasTrabajados,setDiasTrabajados]=useState('');
  const[piezasEntregadas,setPiezasEntregadas]=useState('');
  const[pendingFile,setPendingFile]=useState(null);
  const[pdcaMap,setPdcaMap]=useState({});
  const[defectos,setDefectos]=useState([]);
  const[defSearch,setDefSearch]=useState('');
  const[editDef,setEditDef]=useState(null);
  const[giros,setGiros]=useState([]);
  const[unifyTarget,setUnifyTarget]=useState(null);
  const[dragOver,setDragOver]=useState(false);
  const[scrapEventos,setScrapEventos]=useState([]);
  const[scrapForm,setScrapForm]=useState(null); // form data when adding new event, null = closed
  const[scrapFilters,setScrapFilters]=useState({desde:'',hasta:'',turno:'ALL',origen:'ALL',tipoMaterial:'ALL'});
  const fileRef=useRef(null);const defFileRef=useRef(null);

  // Auth
  useEffect(()=>{getSession().then(s=>{setSession(s);setAuthLoading(false);});const{data:l}=onAuthChange(s=>setSession(s));return()=>l?.subscription?.unsubscribe();},[]);
  // Load lineas once authenticated
  useEffect(()=>{if(session)fetchLineas().then(ls=>{setLineas(ls);if(ls.length>0&&!linea)setLinea(ls[0].id);}).catch(console.error);},[session]);
  // Load defectos when linea changes, restore active giro from localStorage
  useEffect(()=>{
    if(!session||!linea)return;
    fetchDefectos(linea).then(setDefectos).catch(console.error);
    fetchScrapEventos(linea).then(setScrapEventos).catch(console.error);
    // Check if there's a saved active giro for this linea
    const savedId=localStorage.getItem(`activeGiro_${linea}`);
    if(savedId){
      fetchGiro(savedId).then(g=>{
        const pd=fetchPdcas(g.id);
        const rows=g.qa_rows.map(r=>({...r}));
        setResult({qaRows:rows,totalRecords:g.total_records,totalDefectTypes:g.total_defect_types,bancosControlados:g.bancos_controlados,totalDefects:g.total_defects,summary:g.summary,format:g.format,piezasTotales:g.piezas_totales,diasTrabajados:g.dias_trabajados,piezasEntregadas:g.piezas_entregadas});
        setGiroId(g.id);setGiroName(g.name);
        pd.then(setPdcaMap).catch(console.error);
      }).catch(()=>{
        // Giro was deleted, clean up
        localStorage.removeItem(`activeGiro_${linea}`);
        setResult(null);setGiroId(null);setGiroName('');setPdcaMap({});
      });
    } else {
      setResult(null);setGiroId(null);setGiroName('');setPdcaMap({});
    }
  },[session,linea]);

  // Realtime: refresh scrap events for the linea
  useEffect(()=>{
    if(!session||!linea)return;
    const unsub=subscribeScrap(linea,()=>{fetchScrapEventos(linea).then(setScrapEventos).catch(console.error);});
    return unsub;
  },[session,linea]);

  // Realtime: refresh history list when another user creates/deletes a giro
  useEffect(()=>{
    if(!session||!linea)return;
    const unsub=subscribeGiros(linea,()=>{
      if(page==='history')fetchGiros(linea).then(setGiros).catch(console.error);
    });
    return unsub;
  },[session,linea,page]);
  // Realtime: refresh PDCA when another user updates it
  useEffect(()=>{
    if(!giroId)return;
    const unsub=subscribePdca(giroId,()=>{fetchPdcas(giroId).then(setPdcaMap).catch(console.error);});
    return unsub;
  },[giroId]);

  const defectosDb=useMemo(()=>{const m={};for(const d of defectos)m[d.nombre]={severidad:d.severidad,costo_interno:d.costo_interno,costo_externo:d.costo_externo};return m;},[defectos]);
  const occurrenceMap=useMemo(()=>{if(!result)return{};const m={};for(const r of result.qaRows)m[r.defectName]=(m[r.defectName]||0)+r.cantDefectos;return m;},[result]);

  const handleLogin=useCallback(async(e)=>{e.preventDefault();setAuthError('');try{await signIn(loginEmail,loginPass);}catch(err){setAuthError(err.message||'Credenciales incorrectas');}},[loginEmail,loginPass]);
  const handleLogout=useCallback(async()=>{await signOut();setSession(null);setPage('home');},[]);
  const handleFileDrop=useCallback((f)=>{if(!f)return;setPendingFile(f);setError(null);setResult(null);setPage('upload');},[]);
  const handleProcess=useCallback(async()=>{
    if(!pendingFile)return;
    const b=parseInt(bancos);if(!b||b<1){setError('Ingresá la cantidad de bancos controlados');return;}
    const pt=parseInt(piezasTotales);if(!pt||pt<1){setError('Ingresá la cantidad de piezas totales producidas');return;}
    const dt=parseInt(diasTrabajados);if(!dt||dt<1){setError('Ingresá los días trabajados');return;}
    const pe=parseInt(piezasEntregadas);if(!pe||pe<1){setError('Ingresá la cantidad de piezas entregadas al cliente');return;}
    setLoading(true);setError(null);
    try{const res=await processExcelFile(pendingFile,b,defectosDb);setResult({...res,piezasTotales:pt,diasTrabajados:dt,piezasEntregadas:pe});const name=giroName||`Giro ${new Date().toLocaleDateString('es-AR')}`;
    try{const saved=await saveGiro({...res,name,date:new Date().toISOString().split('T')[0],piezasTotales:pt,diasTrabajados:dt,piezasEntregadas:pe},linea);if(saved?.id){setGiroId(saved.id);localStorage.setItem(`activeGiro_${linea}`,saved.id);const pd=await fetchPdcas(saved.id);setPdcaMap(pd);}}catch(e){console.warn(e);}
    setPage('matrix');}catch(err){setError(err.message);}setLoading(false);
  },[pendingFile,bancos,piezasTotales,diasTrabajados,piezasEntregadas,giroName,defectosDb,linea]);

  const handlePdca=useCallback(async(vn,field,val)=>{setPdcaMap(prev=>{const cur=prev[vn]||{responsable:'',plan:false,do_step:false,check:false,act:false,comments:''};const up={...cur,[field]:val};if(giroId)savePdca(giroId,vn,up).catch(()=>{});return{...prev,[vn]:up};});},[giroId]);
  const handleUnify=useCallback(async(destNum,origenInput)=>{const origenNums=origenInput.split(',').map(s=>parseInt(s.trim())).filter(n=>!isNaN(n)&&n!==destNum);if(origenNums.length===0)return;const newRows=unifyVoices([...result.qaRows],destNum,origenNums);const totalDef=newRows.reduce((s,r)=>s+r.cantDefectos,0);const newSummary={AA:newRows.filter(r=>r.voz==='AA').length,A:newRows.filter(r=>r.voz==='A').length,B:newRows.filter(r=>r.voz==='B').length,C:newRows.filter(r=>r.voz==='C').length};setResult(prev=>({...prev,qaRows:newRows,totalDefectTypes:newRows.length,totalDefects:totalDef,summary:newSummary}));if(giroId){try{await updateGiroRows(giroId,newRows,newSummary);for(const o of origenNums)await saveUnificacion(giroId,destNum,o);}catch(e){console.warn(e);}}setUnifyTarget(null);setSelectedRow(null);},[result,giroId]);

  const handleSaveDef=useCallback(async(d)=>{try{const saved=await upsertDefecto(d,linea);setDefectos(prev=>{const idx=prev.findIndex(x=>x.id===saved.id);if(idx>=0){const n=[...prev];n[idx]=saved;return n;}return[...prev,saved].sort((a,b)=>a.nombre.localeCompare(b.nombre));});setEditDef(null);}catch(e){alert('Error: '+e.message);}},[linea]);
  const handleDeleteDef=useCallback(async(id)=>{if(!confirm('¿Eliminar este defecto?'))return;try{await deleteDefecto(id);setDefectos(prev=>prev.filter(d=>d.id!==id));}catch(e){alert('Error: '+e.message);}},[]);
  const handleUploadDefectos=useCallback(async(file)=>{try{const r=await readXlsxFile(file);const rows=(r[0]&&r[0].data)?r[0].data:r;const list=[];for(let i=1;i<rows.length;i++){const row=rows[i];const nombre=row[0];if(!nombre||typeof nombre!=='string')continue;list.push({nombre:String(nombre).trim(),severidad:parseInt(row[1])||3,costo_interno:parseInt(row[2])||1,costo_externo:parseInt(row[3])||4});}if(list.length===0){alert('No se encontraron defectos');return;}await bulkUpsertDefectos(list,linea);const fresh=await fetchDefectos(linea);setDefectos(fresh);alert(`${list.length} defectos actualizados`);}catch(e){alert('Error: '+e.message);}},[linea]);

  // Excel download using SheetJS
  const handleDownloadDefectos=useCallback(()=>{
    const data=[['Nombre','Severidad','Costo Interno','Costo Externo','Ocurrencia']];
    for(const d of defectos)data.push([d.nombre,d.severidad,d.costo_interno,d.costo_externo,occurrenceMap[d.nombre]||0]);
    const ws=XLSX.utils.aoa_to_sheet(data);
    ws['!cols']=[{wch:45},{wch:12},{wch:14},{wch:14},{wch:12}];
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Defectos');
    XLSX.writeFile(wb,`Defectos_${linea}_${new Date().toISOString().split('T')[0]}.xlsx`);
  },[defectos,occurrenceMap,linea]);

  const loadHistory=useCallback(async()=>{try{const g=await fetchGiros(linea);setGiros(g);}catch(e){console.error(e);}setPage('history');},[linea]);
  const loadGiro=useCallback(async(id)=>{try{setLoading(true);const g=await fetchGiro(id);const pd=await fetchPdcas(id);
    // Recalculate notInDb flag against current defectos list
    const rows=g.qa_rows.map(r=>({...r,notInDb:!defectosDb[r.defectName]}));
    setResult({qaRows:rows,totalRecords:g.total_records,totalDefectTypes:g.total_defect_types,bancosControlados:g.bancos_controlados,totalDefects:g.total_defects,summary:g.summary,format:g.format,piezasTotales:g.piezas_totales,diasTrabajados:g.dias_trabajados,piezasEntregadas:g.piezas_entregadas});setGiroId(id);setGiroName(g.name);setPdcaMap(pd);localStorage.setItem(`activeGiro_${linea}`,id);setPage('matrix');}catch(e){alert('Error: '+e.message);}setLoading(false);},[defectosDb,linea]);
  const handleDeleteGiro=useCallback(async(id,e)=>{e.stopPropagation();if(!confirm('¿Eliminar este giro?'))return;try{await deleteGiro(id);setGiros(prev=>prev.filter(g=>g.id!==id));}catch(err){alert('Error: '+err.message);}},[]);

  const handlePrint=useCallback(()=>{setFilter('AA');setSelectedRow(null);setTimeout(()=>window.print(),300);},[]);
  const handlePrintAll=useCallback(()=>{setFilter('ALL');setSelectedRow(null);setTimeout(()=>window.print(),300);},[]);

  const openScrapForm=useCallback((prefill)=>{
    setScrapForm({
      giroId:prefill?.giroId||null,vozNum:prefill?.vozNum||null,
      defectoNombre:prefill?.defectoNombre||'',componente:prefill?.componente||'',
      fecha:new Date().toISOString().split('T')[0],turno:'A',origen:'Producción',destino:'Scrap',
      tipoMaterial:'Cuenta Plena',cantidad:1,costoUnitario:'',notas:'',
    });
    setPage('scrap');
  },[]);
  const handleSaveScrap=useCallback(async()=>{
    if(!scrapForm)return;
    if(!scrapForm.defectoNombre){alert('Ingresá el nombre del defecto/parte');return;}
    const cant=parseInt(scrapForm.cantidad);const costo=parseFloat(scrapForm.costoUnitario);
    if(!cant||cant<1){alert('Ingresá una cantidad válida');return;}
    if(isNaN(costo)||costo<0){alert('Ingresá un costo unitario válido');return;}
    try{
      await saveScrapEvento({...scrapForm,cantidad:cant,costoUnitario:costo},linea);
      const fresh=await fetchScrapEventos(linea);setScrapEventos(fresh);
      setScrapForm(null);
    }catch(e){alert('Error: '+e.message);}
  },[scrapForm,linea]);
  const handleDeleteScrap=useCallback(async(id)=>{
    if(!confirm('¿Eliminar este registro de scrap?'))return;
    try{await deleteScrapEvento(id);setScrapEventos(prev=>prev.filter(e=>e.id!==id));}catch(e){alert('Error: '+e.message);}
  },[]);

  const notInDbCount=useMemo(()=>result?result.qaRows.filter(r=>r.notInDb).length:0,[result]);

  const filteredRows=useMemo(()=>{if(!result)return[];let r=result.qaRows;if(filter!=='ALL')r=r.filter(x=>x.voz===filter);if(search){const s=search.toLowerCase();r=r.filter(x=>x.concat.toLowerCase().includes(s)||x.component.toLowerCase().includes(s));}return r;},[result,filter,search]);
  const pareto=useMemo(()=>{if(!result)return[];const m={};for(const r of result.qaRows)m[r.component]=(m[r.component]||0)+r.cantDefectos;return Object.entries(m).sort((a,b)=>b[1]-a[1]);},[result]);

  const wcmKpis=useMemo(()=>{
    if(!result||!result.piezasTotales)return null;
    const {piezasTotales:pt,diasTrabajados:dt,piezasEntregadas:pe,totalDefects:defTotal,bancosControlados:bc,qaRows}=result;
    // Sum actual detection counts per point across all rows
    const dpTotals={};
    for(const r of qaRows){for(const[k,v] of Object.entries(r.dpCounts||{}))dpTotals[k]=(dpTotals[k]||0)+v;}
    const defAntena=dpTotals['Antena']||0;
    const defCustomerPPM=(dpTotals['SCA']||0)+(dpTotals['TDF/TTV']||0)+(dpTotals['Garantía']||0);
    const defIPPM=dpTotals['IPPM']||0;

    // Scrap events linked to this giro reclassify part of totalDefects as Scrap / Devolución (not reworked)
    const linkedScrap=scrapEventos.filter(e=>e.giro_id===giroId);
    const scrapQty=linkedScrap.filter(e=>e.destino==='Scrap').reduce((s,e)=>s+e.cantidad,0);
    const devolQty=linkedScrap.filter(e=>e.destino==='Devolución Proveedor').reduce((s,e)=>s+e.cantidad,0);
    const scrapUSD=linkedScrap.filter(e=>e.destino==='Scrap').reduce((s,e)=>s+Number(e.monto||0),0);
    const reworkQty=Math.max(0,defTotal-scrapQty-devolQty);

    const fpy=pt>0?((pt-defTotal)/pt*100):null;
    const rework=pt>0?(reworkQty/pt*100):null;
    const scrapRate=pt>0?(scrapQty/pt*100):null;
    const dppm=pe>0?(defAntena/pe*1000000):null;
    const custPpm=pe>0?(defCustomerPPM/pe*1000000):null;
    const ippm=bc>0?(defIPPM/bc*1000000):null;
    const piezasDia=dt>0?(pt/dt):null;

    return{fpy,rework,scrapRate,scrapQty,scrapUSD,devolQty,reworkQty,dppm,custPpm,ippm,piezasDia,defAntena,defCustomerPPM,defIPPM};
  },[result,scrapEventos,giroId]);

  const scrapFiltered=useMemo(()=>{
    let list=scrapEventos;
    if(scrapFilters.desde)list=list.filter(e=>e.fecha>=scrapFilters.desde);
    if(scrapFilters.hasta)list=list.filter(e=>e.fecha<=scrapFilters.hasta);
    if(scrapFilters.turno!=='ALL')list=list.filter(e=>e.turno===scrapFilters.turno);
    if(scrapFilters.origen!=='ALL')list=list.filter(e=>e.origen===scrapFilters.origen);
    if(scrapFilters.tipoMaterial!=='ALL')list=list.filter(e=>e.tipo_material===scrapFilters.tipoMaterial);
    return list;
  },[scrapEventos,scrapFilters]);

  const scrapDashboard=useMemo(()=>{
    const list=scrapFiltered;
    const scrapOnly=list.filter(e=>e.destino==='Scrap');
    const totalScrapUSD=scrapOnly.reduce((s,e)=>s+Number(e.monto||0),0);
    const totalScrapQty=scrapOnly.reduce((s,e)=>s+e.cantidad,0);
    // Pie by destino (all destinos, USD)
    const porDestino={};
    for(const e of list)porDestino[e.destino]=(porDestino[e.destino]||0)+Number(e.monto||0);
    const totalAllUSD=Object.values(porDestino).reduce((a,b)=>a+b,0);
    // Top 5 by part (defecto+componente) - USD and Cantidad, scrap only
    const byPart={};
    for(const e of scrapOnly){const key=`${e.componente?e.componente+' - ':''}${e.defecto_nombre}`;if(!byPart[key])byPart[key]={usd:0,qty:0};byPart[key].usd+=Number(e.monto||0);byPart[key].qty+=e.cantidad;}
    const top5USD=Object.entries(byPart).sort((a,b)=>b[1].usd-a[1].usd).slice(0,5);
    const top5Qty=Object.entries(byPart).sort((a,b)=>b[1].qty-a[1].qty).slice(0,5);
    // Modo de falla (defecto_nombre only) - USD and Cantidad
    const byDefect={};
    for(const e of scrapOnly){if(!byDefect[e.defecto_nombre])byDefect[e.defecto_nombre]={usd:0,qty:0};byDefect[e.defecto_nombre].usd+=Number(e.monto||0);byDefect[e.defecto_nombre].qty+=e.cantidad;}
    const modoFallaUSD=Object.entries(byDefect).sort((a,b)=>b[1].usd-a[1].usd).slice(0,8);
    const modoFallaQty=Object.entries(byDefect).sort((a,b)=>b[1].qty-a[1].qty).slice(0,8);
    // Trend by day
    const byDay={};
    for(const e of scrapOnly)byDay[e.fecha]=(byDay[e.fecha]||0)+Number(e.monto||0);
    const trend=Object.entries(byDay).sort((a,b)=>a[0].localeCompare(b[0]));
    return{totalScrapUSD,totalScrapQty,porDestino,totalAllUSD,top5USD,top5Qty,modoFallaUSD,modoFallaQty,trend};
  },[scrapFiltered]);

  const th={padding:'8px 5px',textAlign:'center',color:'#94A3B8',fontWeight:600,fontSize:10,textTransform:'uppercase',borderBottom:'2px solid #334155',whiteSpace:'nowrap',position:'sticky',top:0,background:'#1E293B',zIndex:10};
  const td={padding:'6px 5px',textAlign:'center',whiteSpace:'nowrap',fontSize:11};

  // Line selector component
  const LineSelector=()=>lineas.length>1?(
    <div style={{display:'flex',gap:6}}>
      {lineas.map(l=><Btn key={l.id} onClick={()=>setLinea(l.id)} bg={linea===l.id?'#F59E0B':'#334155'} color={linea===l.id?'#0F172A':'#94A3B8'} style={{padding:'5px 14px',fontSize:12,fontWeight:700}}>{l.id}</Btn>)}
    </div>
  ):null;

  // ── LOGIN ──
  if(authLoading)return<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',color:'#94A3B8'}}>Cargando...</div>;
  if(!session)return(
    <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'linear-gradient(165deg,#0F172A,#1E293B 50%,#0F172A)',padding:24}}>
      <div style={{textAlign:'center',marginBottom:40}}><div style={{fontSize:14,fontWeight:600,letterSpacing:4,color:'#F59E0B',textTransform:'uppercase',marginBottom:8}}>World Class Manufacturing</div><h1 style={{fontSize:42,fontWeight:700,color:'#F8FAFC',margin:0}}>Matriz QA</h1></div>
      <form onSubmit={handleLogin} style={{width:'100%',maxWidth:400,background:'rgba(30,41,59,0.8)',borderRadius:16,padding:32,border:'1px solid #334155'}}>
        <h2 style={{fontSize:20,fontWeight:600,color:'#F8FAFC',marginBottom:24,textAlign:'center'}}>Iniciar sesión</h2>
        <label style={{display:'block',marginBottom:16}}><span style={{fontSize:12,fontWeight:600,color:'#94A3B8',display:'block',marginBottom:6}}>Email</span><input type="email" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} required style={{width:'100%',padding:'10px 14px',borderRadius:8,border:'1px solid #475569',background:'#1E293B',color:'#F8FAFC',fontSize:14}}/></label>
        <label style={{display:'block',marginBottom:24}}><span style={{fontSize:12,fontWeight:600,color:'#94A3B8',display:'block',marginBottom:6}}>Contraseña</span><input type="password" value={loginPass} onChange={e=>setLoginPass(e.target.value)} required style={{width:'100%',padding:'10px 14px',borderRadius:8,border:'1px solid #475569',background:'#1E293B',color:'#F8FAFC',fontSize:14}}/></label>
        {authError&&<div style={{padding:'10px 14px',background:'#7F1D1D',borderRadius:8,color:'#FCA5A5',fontSize:13,marginBottom:16}}>{authError}</div>}
        <button type="submit" style={{width:'100%',padding:12,background:'#F59E0B',color:'#0F172A',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:'pointer'}}>Ingresar</button>
      </form>
    </div>
  );

  // ── HOME ──
  if(page==='home')return(
    <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'linear-gradient(165deg,#0F172A,#1E293B 50%,#0F172A)',padding:24}}>
      <div style={{position:'absolute',top:20,right:20,display:'flex',alignItems:'center',gap:12}}><span style={{fontSize:12,color:'#64748B'}}>{session.user.email}</span><Btn onClick={handleLogout} style={{padding:'5px 12px',fontSize:11}}>Salir</Btn></div>
      <div style={{textAlign:'center',marginBottom:24}} className="fade-in"><div style={{fontSize:14,fontWeight:600,letterSpacing:4,color:'#F59E0B',textTransform:'uppercase',marginBottom:8}}>World Class Manufacturing</div><h1 style={{fontSize:42,fontWeight:700,color:'#F8FAFC',margin:0}}>Matriz QA</h1></div>
      <div style={{marginBottom:32}}><LineSelector/></div>
      {linea&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:16,maxWidth:700,width:'100%'}}>
        {result&&<HC icon="📈" title="Giro Activo" desc={giroName} onClick={()=>setPage('matrix')} hl/>}
        <HC icon="📊" title="Nuevo Giro" desc="Cargar Excel de SurveyMonkey" onClick={()=>setPage('upload')}/>
        <HC icon="📋" title="Historial" desc="Ver giros anteriores" onClick={loadHistory}/>
        <HC icon="⚙️" title="Defectos" desc="Editar severidad y costos" onClick={()=>setPage('defectos')}/>
        <HC icon="🗑️" title="Scrap" desc="Dashboard de seguimiento de scrap" onClick={()=>{setScrapForm(null);setPage('scrap');}}/>
      </div>}
    </div>
  );

  // ── UPLOAD ──
  if(page==='upload')return(
    <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'linear-gradient(165deg,#0F172A,#1E293B 50%,#0F172A)',padding:24}}>
      <Btn onClick={()=>{setPage('home');setPendingFile(null);setError(null);}} style={{position:'absolute',top:20,left:20}}>← Inicio</Btn>
      <div style={{textAlign:'center',marginBottom:32}}><h2 style={{fontSize:28,fontWeight:700,color:'#F8FAFC'}}>Nuevo Giro — {linea}</h2><p style={{color:'#94A3B8',fontSize:14}}>Defectos en base: {defectos.length}</p></div>
      {!pendingFile?(
        <div onDragOver={e=>{e.preventDefault();e.stopPropagation();setDragOver(true);}} onDragLeave={e=>{e.preventDefault();setDragOver(false);}} onDrop={e=>{e.preventDefault();setDragOver(false);handleFileDrop(e.dataTransfer?.files?.[0]);}} onClick={()=>fileRef.current?.click()} style={{width:'100%',maxWidth:520,border:`2px dashed ${dragOver?'#F59E0B':'#475569'}`,borderRadius:16,padding:'48px 40px',textAlign:'center',cursor:'pointer',background:dragOver?'rgba(245,158,11,0.06)':'rgba(30,41,59,0.6)'}}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={e=>{handleFileDrop(e.target?.files?.[0]);e.target.value='';}} style={{display:'none'}}/>
          <div style={{fontSize:56,marginBottom:16}}>📊</div><p style={{fontSize:18,fontWeight:600,color:'#F8FAFC',margin:'0 0 8px'}}>Arrastrá el archivo Excel</p><p style={{fontSize:14,color:'#64748B',margin:'0 0 16px'}}>SurveyMonkey (.xlsx)</p><Btn bg="#F59E0B" color="#0F172A">Seleccionar archivo</Btn>
        </div>
      ):(
        <div style={{width:'100%',maxWidth:520,background:'rgba(30,41,59,0.8)',borderRadius:16,padding:32,border:'1px solid #334155'}}>
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:24}}><span style={{fontSize:32}}>📄</span><div><div style={{fontWeight:600,color:'#F8FAFC'}}>{pendingFile.name}</div><div style={{color:'#64748B',fontSize:12}}>{(pendingFile.size/1024).toFixed(0)} KB</div></div><button onClick={()=>setPendingFile(null)} style={{marginLeft:'auto',background:'none',border:'none',color:'#64748B',cursor:'pointer',fontSize:18}}>✕</button></div>
          <label style={{display:'block',marginBottom:16}}><span style={{fontSize:12,fontWeight:600,color:'#94A3B8',textTransform:'uppercase',letterSpacing:1,display:'block',marginBottom:6}}>Nombre del giro</span><input value={giroName} onChange={e=>setGiroName(e.target.value)} placeholder={`Giro ${new Date().toLocaleDateString('es-AR')}`} style={{width:'100%',padding:'10px 14px',borderRadius:8,border:'1px solid #475569',background:'#1E293B',color:'#F8FAFC',fontSize:14}}/></label>
          <label style={{display:'block',marginBottom:16}}><span style={{fontSize:12,fontWeight:600,color:'#F59E0B',textTransform:'uppercase',letterSpacing:1,display:'block',marginBottom:6}}>Bancos controlados *</span><input type="number" min="1" value={bancos} onChange={e=>setBancos(e.target.value)} placeholder="Ej: 5000" style={{width:'100%',padding:'10px 14px',borderRadius:8,border:'1px solid #F59E0B',background:'#1E293B',color:'#F8FAFC',fontSize:16,fontWeight:700,fontFamily:"'IBM Plex Mono'"}}/><span style={{fontSize:11,color:'#64748B',marginTop:4,display:'block'}}>Piezas individuales controladas (usado para IPPM)</span></label>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
            <label style={{display:'block'}}><span style={{fontSize:11,fontWeight:600,color:'#94A3B8',textTransform:'uppercase',letterSpacing:0.5,display:'block',marginBottom:6}}>Piezas totales producidas *</span><input type="number" min="1" value={piezasTotales} onChange={e=>setPiezasTotales(e.target.value)} placeholder="Ej: 4800" style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1px solid #475569',background:'#1E293B',color:'#F8FAFC',fontSize:14,fontWeight:700,fontFamily:"'IBM Plex Mono'"}}/></label>
            <label style={{display:'block'}}><span style={{fontSize:11,fontWeight:600,color:'#94A3B8',textTransform:'uppercase',letterSpacing:0.5,display:'block',marginBottom:6}}>Días trabajados *</span><input type="number" min="1" value={diasTrabajados} onChange={e=>setDiasTrabajados(e.target.value)} placeholder="Ej: 20" style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1px solid #475569',background:'#1E293B',color:'#F8FAFC',fontSize:14,fontWeight:700,fontFamily:"'IBM Plex Mono'"}}/></label>
          </div>
          <label style={{display:'block',marginBottom:24}}><span style={{fontSize:11,fontWeight:600,color:'#94A3B8',textTransform:'uppercase',letterSpacing:0.5,display:'block',marginBottom:6}}>Piezas entregadas al cliente *</span><input type="number" min="1" value={piezasEntregadas} onChange={e=>setPiezasEntregadas(e.target.value)} placeholder="Ej: 4750" style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1px solid #475569',background:'#1E293B',color:'#F8FAFC',fontSize:14,fontWeight:700,fontFamily:"'IBM Plex Mono'"}}/><span style={{fontSize:11,color:'#64748B',marginTop:4,display:'block'}}>Usado para Customer DPPM y PPM</span></label>
          <Btn onClick={handleProcess} disabled={loading} bg={loading?'#475569':'#F59E0B'} color="#0F172A" style={{width:'100%',padding:12,fontSize:15}}>{loading?'Generando...':'Generar Matriz QA'}</Btn>
        </div>
      )}
      {error&&<div style={{marginTop:24,padding:'16px 24px',background:'#7F1D1D',borderRadius:12,color:'#FCA5A5',fontSize:14,maxWidth:520}}>⚠️ {error}</div>}
    </div>
  );

  // ── DEFECTOS ──
  if(page==='defectos'){const filtered=defSearch?defectos.filter(d=>d.nombre.toLowerCase().includes(defSearch.toLowerCase())):defectos;return(
    <div style={{minHeight:'100vh',padding:24,maxWidth:1100,margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24,flexWrap:'wrap',gap:12}}>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>{result?<Btn onClick={()=>setPage('matrix')}>← Matriz</Btn>:<Btn onClick={()=>setPage('home')}>← Inicio</Btn>}{result&&<span style={{fontSize:11,color:'#F59E0B',fontWeight:600}}>Giro activo: {giroName}</span>}</div>
        <h2 style={{fontSize:22,fontWeight:700,color:'#F8FAFC',margin:0}}>Defectos {linea} ({defectos.length})</h2>
        <div style={{display:'flex',gap:8}}><Btn bg="#F59E0B" color="#0F172A" onClick={()=>setEditDef({nombre:'',severidad:3,costo_interno:1,costo_externo:4})}>+ Nuevo</Btn><Btn onClick={()=>defFileRef.current?.click()}>📤 Cargar Excel</Btn><Btn onClick={handleDownloadDefectos} bg="#16A34A" color="#fff">📥 Descargar</Btn><input ref={defFileRef} type="file" accept=".xlsx,.xls,.csv" onChange={e=>{if(e.target.files[0])handleUploadDefectos(e.target.files[0]);e.target.value='';}} style={{display:'none'}}/></div>
      </div>
      <p style={{fontSize:12,color:'#64748B',marginBottom:16}}>Excel: A=Nombre, B=Severidad, C=Costo Interno, D=Costo Externo (fila 1=encabezado)</p>
      <input placeholder="Buscar defecto..." value={defSearch} onChange={e=>setDefSearch(e.target.value)} style={{width:'100%',padding:'10px 14px',borderRadius:8,border:'1px solid #475569',background:'#1E293B',color:'#F8FAFC',fontSize:14,marginBottom:16}}/>
      {editDef&&<div style={{background:'#1E293B',borderRadius:12,padding:20,marginBottom:16,border:'2px solid #F59E0B'}}><div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr auto',gap:10,alignItems:'end'}}>
        <div><label style={{fontSize:11,color:'#94A3B8'}}>Nombre</label><input value={editDef.nombre} onChange={e=>setEditDef(p=>({...p,nombre:e.target.value}))} style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #475569',background:'#0F172A',color:'#F8FAFC',fontSize:13}}/></div>
        <div><label style={{fontSize:11,color:'#94A3B8'}}>Severidad</label><input type="number" min="1" max="10" value={editDef.severidad} onChange={e=>setEditDef(p=>({...p,severidad:parseInt(e.target.value)||3}))} style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #475569',background:'#0F172A',color:'#F8FAFC',fontSize:13}}/></div>
        <div><label style={{fontSize:11,color:'#94A3B8'}}>C.Int</label><input type="number" min="1" value={editDef.costo_interno} onChange={e=>setEditDef(p=>({...p,costo_interno:parseInt(e.target.value)||1}))} style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #475569',background:'#0F172A',color:'#F8FAFC',fontSize:13}}/></div>
        <div><label style={{fontSize:11,color:'#94A3B8'}}>C.Ext</label><input type="number" min="1" value={editDef.costo_externo} onChange={e=>setEditDef(p=>({...p,costo_externo:parseInt(e.target.value)||4}))} style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #475569',background:'#0F172A',color:'#F8FAFC',fontSize:13}}/></div>
        <div style={{display:'flex',gap:6}}><Btn bg="#16A34A" onClick={()=>handleSaveDef(editDef)}>✓</Btn><Btn onClick={()=>setEditDef(null)}>✕</Btn></div>
      </div></div>}
      <div style={{overflowX:'auto',borderRadius:12,border:'1px solid #334155'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr style={{background:'#1E293B'}}><th style={{...th,textAlign:'left',minWidth:280}}>Defecto</th><th style={th}>Sev</th><th style={th}>C.Int</th><th style={th}>C.Ext</th><th style={th}>Ocurr.</th><th style={th}>Acciones</th></tr></thead><tbody>
        {filtered.map((d,i)=>{const occ=occurrenceMap[d.nombre]||0;return(<tr key={d.id} style={{background:i%2===0?'#0F172A':'#131C2E',borderBottom:'1px solid #1E293B'}}><td style={{...td,textAlign:'left',fontSize:13}}>{d.nombre}</td><td style={td}>{d.severidad}</td><td style={td}>{d.costo_interno}</td><td style={td}>{d.costo_externo}</td><td style={{...td,fontWeight:occ>0?700:400,color:occ>0?'#F59E0B':'#475569'}}>{occ}</td><td style={td}><div style={{display:'flex',gap:4,justifyContent:'center'}}><Btn onClick={()=>setEditDef({...d})} style={{padding:'4px 10px',fontSize:11}}>✏️</Btn><Btn onClick={()=>handleDeleteDef(d.id)} bg="#7F1D1D" style={{padding:'4px 10px',fontSize:11}}>🗑️</Btn></div></td></tr>);})}
      </tbody></table></div>
    </div>
  );}

  // ── HISTORY ──
  if(page==='history')return(
    <div style={{minHeight:'100vh',padding:24,maxWidth:900,margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:24}}><Btn onClick={()=>setPage('home')}>← Inicio</Btn><h2 style={{fontSize:22,fontWeight:700,color:'#F8FAFC',margin:0}}>Historial — {linea}</h2></div>
      {giros.length===0?<p style={{color:'#64748B',textAlign:'center',padding:40}}>No hay giros guardados para {linea}</p>:
      <div style={{display:'grid',gap:12}}>{giros.map(g=>(
        <div key={g.id} onClick={()=>loadGiro(g.id)} style={{background:'#1E293B',borderRadius:12,padding:'16px 20px',border:'1px solid #334155',cursor:'pointer',transition:'border-color .2s'}} onMouseEnter={e=>e.currentTarget.style.borderColor='#F59E0B'} onMouseLeave={e=>e.currentTarget.style.borderColor='#334155'}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><div><div style={{fontWeight:600,color:'#F8FAFC',fontSize:16}}>{g.name}</div><div style={{color:'#64748B',fontSize:12,marginTop:2}}>{g.date} · {g.bancos_controlados?.toLocaleString()} bancos · {g.total_defects} defectos</div></div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>{g.summary&&Object.entries(g.summary).map(([k,v])=><span key={k} style={{padding:'2px 8px',borderRadius:4,fontSize:11,fontWeight:700,background:VC[k],color:'#fff'}}>{k}:{v}</span>)}<button onClick={e=>handleDeleteGiro(g.id,e)} style={{padding:'6px 10px',background:'#7F1D1D',color:'#FCA5A5',border:'none',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:600,marginLeft:8}}>🗑️</button></div></div>
        </div>
      ))}</div>}
    </div>
  );

  // ── SCRAP ──
  if(page==='scrap')return(
    <div style={{minHeight:'100vh',padding:24,maxWidth:1400,margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20,flexWrap:'wrap',gap:12}}>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>{result?<Btn onClick={()=>setPage('matrix')}>← Matriz</Btn>:<Btn onClick={()=>setPage('home')}>← Inicio</Btn>}<h2 style={{fontSize:22,fontWeight:700,color:'#F8FAFC',margin:0}}>Scrap — {linea}</h2></div>
        <Btn bg="#F59E0B" color="#0F172A" onClick={()=>openScrapForm({giroId})}>+ Registrar evento</Btn>
      </div>

      {scrapForm&&(
        <div style={{background:'#1E293B',borderRadius:12,padding:20,marginBottom:20,border:'2px solid #F59E0B'}}>
          <h3 style={{fontSize:14,fontWeight:600,color:'#F59E0B',marginBottom:14,textTransform:'uppercase',letterSpacing:1}}>Nuevo registro de resolución</h3>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12,marginBottom:14}}>
            <div><label style={{fontSize:11,color:'#94A3B8',display:'block',marginBottom:4}}>Defecto / Parte *</label><input value={scrapForm.defectoNombre} onChange={e=>setScrapForm(p=>({...p,defectoNombre:e.target.value}))} placeholder="Ej: Funda - Quemada" style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #475569',background:'#0F172A',color:'#F8FAFC',fontSize:13}}/></div>
            <div><label style={{fontSize:11,color:'#94A3B8',display:'block',marginBottom:4}}>Componente</label><input value={scrapForm.componente} onChange={e=>setScrapForm(p=>({...p,componente:e.target.value}))} placeholder="Ej: Funda" style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #475569',background:'#0F172A',color:'#F8FAFC',fontSize:13}}/></div>
            <div><label style={{fontSize:11,color:'#94A3B8',display:'block',marginBottom:4}}>Fecha</label><input type="date" value={scrapForm.fecha} onChange={e=>setScrapForm(p=>({...p,fecha:e.target.value}))} style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #475569',background:'#0F172A',color:'#F8FAFC',fontSize:13}}/></div>
            <div><label style={{fontSize:11,color:'#94A3B8',display:'block',marginBottom:4}}>Turno</label><select value={scrapForm.turno} onChange={e=>setScrapForm(p=>({...p,turno:e.target.value}))} style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #475569',background:'#0F172A',color:'#F8FAFC',fontSize:13}}>{TURNOS.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
            <div><label style={{fontSize:11,color:'#94A3B8',display:'block',marginBottom:4}}>Origen</label><select value={scrapForm.origen} onChange={e=>setScrapForm(p=>({...p,origen:e.target.value}))} style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #475569',background:'#0F172A',color:'#F8FAFC',fontSize:13}}>{ORIGENES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
            <div><label style={{fontSize:11,color:'#94A3B8',display:'block',marginBottom:4}}>Destino final *</label><select value={scrapForm.destino} onChange={e=>setScrapForm(p=>({...p,destino:e.target.value}))} style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #475569',background:'#0F172A',color:'#F8FAFC',fontSize:13}}>{DESTINOS.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
            <div><label style={{fontSize:11,color:'#94A3B8',display:'block',marginBottom:4}}>Tipo material</label><select value={scrapForm.tipoMaterial} onChange={e=>setScrapForm(p=>({...p,tipoMaterial:e.target.value}))} style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #475569',background:'#0F172A',color:'#F8FAFC',fontSize:13}}>{TIPOS_MATERIAL.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
            <div><label style={{fontSize:11,color:'#94A3B8',display:'block',marginBottom:4}}>Cantidad *</label><input type="number" min="1" value={scrapForm.cantidad} onChange={e=>setScrapForm(p=>({...p,cantidad:e.target.value}))} style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #475569',background:'#0F172A',color:'#F8FAFC',fontSize:13,fontFamily:"'IBM Plex Mono'"}}/></div>
            <div><label style={{fontSize:11,color:'#F59E0B',display:'block',marginBottom:4}}>Costo unitario (USD) *</label><input type="number" min="0" step="0.01" value={scrapForm.costoUnitario} onChange={e=>setScrapForm(p=>({...p,costoUnitario:e.target.value}))} placeholder="Ej: 12.50" style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #F59E0B',background:'#0F172A',color:'#F8FAFC',fontSize:13,fontFamily:"'IBM Plex Mono'"}}/></div>
          </div>
          {scrapForm.giroId&&<div style={{fontSize:11,color:'#16A34A',marginBottom:10}}>✓ Vinculado a un Giro de QA {scrapForm.vozNum?`· Voz #${scrapForm.vozNum}`:''} — este defecto ya cuenta como reportado, no se duplica en la Matriz</div>}
          {!scrapForm.giroId&&<div style={{fontSize:11,color:'#64748B',marginBottom:10}}>Sin vincular a un Giro — solo aparecerá en este dashboard de Scrap</div>}
          <label style={{display:'block',marginBottom:14}}><span style={{fontSize:11,color:'#94A3B8',display:'block',marginBottom:4}}>Notas</span><textarea value={scrapForm.notas} onChange={e=>setScrapForm(p=>({...p,notas:e.target.value}))} rows={2} style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #475569',background:'#0F172A',color:'#F8FAFC',fontSize:13,resize:'vertical',fontFamily:'inherit'}}/></label>
          <div style={{display:'flex',gap:8}}><Btn bg="#16A34A" onClick={handleSaveScrap}>✓ Guardar</Btn><Btn onClick={()=>setScrapForm(null)}>Cancelar</Btn></div>
        </div>
      )}

      {/* Filters */}
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'end',marginBottom:20,background:'#1E293B',padding:14,borderRadius:10,border:'1px solid #334155'}}>
        <div><label style={{fontSize:10,color:'#94A3B8',display:'block',marginBottom:4}}>Desde</label><input type="date" value={scrapFilters.desde} onChange={e=>setScrapFilters(p=>({...p,desde:e.target.value}))} style={{padding:'6px 10px',borderRadius:6,border:'1px solid #475569',background:'#0F172A',color:'#F8FAFC',fontSize:12}}/></div>
        <div><label style={{fontSize:10,color:'#94A3B8',display:'block',marginBottom:4}}>Hasta</label><input type="date" value={scrapFilters.hasta} onChange={e=>setScrapFilters(p=>({...p,hasta:e.target.value}))} style={{padding:'6px 10px',borderRadius:6,border:'1px solid #475569',background:'#0F172A',color:'#F8FAFC',fontSize:12}}/></div>
        <div><label style={{fontSize:10,color:'#94A3B8',display:'block',marginBottom:4}}>Turno</label><select value={scrapFilters.turno} onChange={e=>setScrapFilters(p=>({...p,turno:e.target.value}))} style={{padding:'6px 10px',borderRadius:6,border:'1px solid #475569',background:'#0F172A',color:'#F8FAFC',fontSize:12}}><option value="ALL">Todos</option>{TURNOS.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
        <div><label style={{fontSize:10,color:'#94A3B8',display:'block',marginBottom:4}}>Origen</label><select value={scrapFilters.origen} onChange={e=>setScrapFilters(p=>({...p,origen:e.target.value}))} style={{padding:'6px 10px',borderRadius:6,border:'1px solid #475569',background:'#0F172A',color:'#F8FAFC',fontSize:12}}><option value="ALL">Todos</option>{ORIGENES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
        <div><label style={{fontSize:10,color:'#94A3B8',display:'block',marginBottom:4}}>Tipo material</label><select value={scrapFilters.tipoMaterial} onChange={e=>setScrapFilters(p=>({...p,tipoMaterial:e.target.value}))} style={{padding:'6px 10px',borderRadius:6,border:'1px solid #475569',background:'#0F172A',color:'#F8FAFC',fontSize:12}}><option value="ALL">Todos</option>{TIPOS_MATERIAL.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
        {(scrapFilters.desde||scrapFilters.hasta||scrapFilters.turno!=='ALL'||scrapFilters.origen!=='ALL'||scrapFilters.tipoMaterial!=='ALL')&&<Btn onClick={()=>setScrapFilters({desde:'',hasta:'',turno:'ALL',origen:'ALL',tipoMaterial:'ALL'})} style={{fontSize:11}}>Limpiar filtros</Btn>}
      </div>

      {/* Summary cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:20}}>
        <div style={{background:'#1E293B',borderRadius:12,padding:16,border:'1px solid #334155'}}><div style={{fontSize:11,color:'#94A3B8',marginBottom:6}}>🗑️ Scrap (USD) — Acumulado</div><div style={{fontSize:28,fontWeight:700,color:'#DC2626',fontFamily:"'IBM Plex Mono'"}}>${scrapDashboard.totalScrapUSD.toLocaleString(undefined,{maximumFractionDigits:0})}</div></div>
        <div style={{background:'#1E293B',borderRadius:12,padding:16,border:'1px solid #334155'}}><div style={{fontSize:11,color:'#94A3B8',marginBottom:6}}>📦 Scrap (Cantidad)</div><div style={{fontSize:28,fontWeight:700,color:'#F8FAFC',fontFamily:"'IBM Plex Mono'"}}>{scrapDashboard.totalScrapQty.toLocaleString()}</div></div>
        <div style={{background:'#1E293B',borderRadius:12,padding:16,border:'1px solid #334155',gridColumn:'span 2'}}>
          <div style={{fontSize:11,color:'#94A3B8',marginBottom:8}}>Destino final del material no conforme (USD)</div>
          <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>{DESTINOS.map(d=>{const v=scrapDashboard.porDestino[d]||0;const pct=scrapDashboard.totalAllUSD>0?(v/scrapDashboard.totalAllUSD*100):0;return v>0?(<div key={d} style={{display:'flex',alignItems:'center',gap:6}}><span style={{width:10,height:10,borderRadius:2,background:DESTINO_COLORS[d]}}/><span style={{fontSize:12,color:'#F8FAFC'}}>{d}: ${v.toFixed(0)} ({pct.toFixed(1)}%)</span></div>):null;})}</div>
        </div>
      </div>

      {/* Top 5 tables */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:20}}>
        <div style={{background:'#1E293B',borderRadius:12,padding:16,border:'1px solid #334155'}}>
          <h4 style={{fontSize:12,fontWeight:600,color:'#F59E0B',marginBottom:10,textTransform:'uppercase',letterSpacing:1}}>Scrap (USD) — Top 5</h4>
          {scrapDashboard.top5USD.length===0?<p style={{color:'#475569',fontSize:12}}>Sin datos</p>:scrapDashboard.top5USD.map(([name,v],i)=>{const max=scrapDashboard.top5USD[0][1].usd;return(<div key={i} style={{marginBottom:8}}><div style={{fontSize:11,color:'#E2E8F0',marginBottom:3}}>{name}</div><div style={{display:'flex',alignItems:'center',gap:6}}><div style={{flex:1,height:14,background:'#334155',borderRadius:3}}><div style={{height:'100%',width:`${v.usd/max*100}%`,background:'#DC2626',borderRadius:3}}/></div><span style={{fontSize:11,fontWeight:700,color:'#F8FAFC',fontFamily:"'IBM Plex Mono'",minWidth:50,textAlign:'right'}}>${v.usd.toFixed(0)}</span></div></div>);})}
        </div>
        <div style={{background:'#1E293B',borderRadius:12,padding:16,border:'1px solid #334155'}}>
          <h4 style={{fontSize:12,fontWeight:600,color:'#38BDF8',marginBottom:10,textTransform:'uppercase',letterSpacing:1}}>Scrap (Cantidad) — Top 5</h4>
          {scrapDashboard.top5Qty.length===0?<p style={{color:'#475569',fontSize:12}}>Sin datos</p>:scrapDashboard.top5Qty.map(([name,v],i)=>{const max=scrapDashboard.top5Qty[0][1].qty;return(<div key={i} style={{marginBottom:8}}><div style={{fontSize:11,color:'#E2E8F0',marginBottom:3}}>{name}</div><div style={{display:'flex',alignItems:'center',gap:6}}><div style={{flex:1,height:14,background:'#334155',borderRadius:3}}><div style={{height:'100%',width:`${v.qty/max*100}%`,background:'#38BDF8',borderRadius:3}}/></div><span style={{fontSize:11,fontWeight:700,color:'#F8FAFC',fontFamily:"'IBM Plex Mono'",minWidth:36,textAlign:'right'}}>{v.qty}</span></div></div>);})}
        </div>
      </div>

      {/* Modo de falla */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:20}}>
        <div style={{background:'#1E293B',borderRadius:12,padding:16,border:'1px solid #334155'}}>
          <h4 style={{fontSize:12,fontWeight:600,color:'#F59E0B',marginBottom:10,textTransform:'uppercase',letterSpacing:1}}>Modo de falla — más impacto (USD)</h4>
          {scrapDashboard.modoFallaUSD.length===0?<p style={{color:'#475569',fontSize:12}}>Sin datos</p>:scrapDashboard.modoFallaUSD.map(([name,v],i)=>{const max=scrapDashboard.modoFallaUSD[0][1].usd;return(<div key={i} style={{marginBottom:7}}><div style={{fontSize:11,color:'#E2E8F0',marginBottom:2}}>{name}</div><div style={{display:'flex',alignItems:'center',gap:6}}><div style={{flex:1,height:10,background:'#334155',borderRadius:2}}><div style={{height:'100%',width:`${v.usd/max*100}%`,background:'#EA580C',borderRadius:2}}/></div><span style={{fontSize:10,fontWeight:700,color:'#F8FAFC',fontFamily:"'IBM Plex Mono'",minWidth:44,textAlign:'right'}}>${v.usd.toFixed(0)}</span></div></div>);})}
        </div>
        <div style={{background:'#1E293B',borderRadius:12,padding:16,border:'1px solid #334155'}}>
          <h4 style={{fontSize:12,fontWeight:600,color:'#38BDF8',marginBottom:10,textTransform:'uppercase',letterSpacing:1}}>Modo de falla — más impacto (Cantidad)</h4>
          {scrapDashboard.modoFallaQty.length===0?<p style={{color:'#475569',fontSize:12}}>Sin datos</p>:scrapDashboard.modoFallaQty.map(([name,v],i)=>{const max=scrapDashboard.modoFallaQty[0][1].qty;return(<div key={i} style={{marginBottom:7}}><div style={{fontSize:11,color:'#E2E8F0',marginBottom:2}}>{name}</div><div style={{display:'flex',alignItems:'center',gap:6}}><div style={{flex:1,height:10,background:'#334155',borderRadius:2}}><div style={{height:'100%',width:`${v.qty/max*100}%`,background:'#0EA5E9',borderRadius:2}}/></div><span style={{fontSize:10,fontWeight:700,color:'#F8FAFC',fontFamily:"'IBM Plex Mono'",minWidth:30,textAlign:'right'}}>{v.qty}</span></div></div>);})}
        </div>
      </div>

      {/* Trend */}
      <div style={{background:'#1E293B',borderRadius:12,padding:16,marginBottom:20,border:'1px solid #334155'}}>
        <h4 style={{fontSize:12,fontWeight:600,color:'#F59E0B',marginBottom:10,textTransform:'uppercase',letterSpacing:1}}>Scrap Total por día (USD)</h4>
        {scrapDashboard.trend.length===0?<p style={{color:'#475569',fontSize:12}}>Sin datos</p>:
          <div style={{display:'flex',gap:6,alignItems:'end',height:100,overflowX:'auto'}}>
            {scrapDashboard.trend.map(([d,v],i)=>{const max=Math.max(...scrapDashboard.trend.map(t=>t[1]));return(<div key={i} title={`${d}: $${v.toFixed(0)}`} style={{display:'flex',flexDirection:'column',alignItems:'center',minWidth:36}}><span style={{fontSize:9,color:'#94A3B8',marginBottom:3}}>${v.toFixed(0)}</span><div style={{width:20,height:`${Math.max((v/max*70),4)}px`,background:'#DC2626',borderRadius:'3px 3px 0 0'}}/><span style={{fontSize:8,color:'#64748B',marginTop:3,writingMode:'vertical-rl'}}>{d.slice(5)}</span></div>);})}
          </div>
        }
      </div>

      {/* Event list */}
      <div style={{overflowX:'auto',borderRadius:12,border:'1px solid #334155'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead><tr style={{background:'#1E293B'}}><th style={th}>Fecha</th><th style={th}>Turno</th><th style={{...th,textAlign:'left'}}>Defecto</th><th style={th}>Origen</th><th style={th}>Destino</th><th style={th}>Material</th><th style={th}>Cant.</th><th style={th}>Costo U.</th><th style={th}>Monto</th><th style={th}>Giro</th><th style={th}>—</th></tr></thead>
          <tbody>{scrapFiltered.map((e,i)=>(<tr key={e.id} style={{background:i%2===0?'#0F172A':'#131C2E',borderBottom:'1px solid #1E293B'}}>
            <td style={td}>{e.fecha}</td><td style={td}>{e.turno||'—'}</td><td style={{...td,textAlign:'left'}}>{e.componente?`${e.componente} - `:''}{e.defecto_nombre}</td><td style={td}>{e.origen||'—'}</td>
            <td style={td}><span style={{padding:'2px 8px',borderRadius:4,fontSize:10,fontWeight:700,background:DESTINO_COLORS[e.destino]||'#334155',color:'#fff'}}>{e.destino}</span></td>
            <td style={td}>{e.tipo_material||'—'}</td><td style={{...td,fontWeight:700}}>{e.cantidad}</td><td style={td}>${Number(e.costo_unitario).toFixed(2)}</td><td style={{...td,fontWeight:700,color:'#F59E0B',fontFamily:"'IBM Plex Mono'"}}>${Number(e.monto).toFixed(2)}</td>
            <td style={td}>{e.giro_id?'✓':'—'}</td><td style={td}><button onClick={()=>handleDeleteScrap(e.id)} style={{background:'none',border:'none',color:'#7F1D1D',cursor:'pointer',fontSize:13}}>🗑️</button></td>
          </tr>))}</tbody>
        </table>
        {scrapFiltered.length===0&&<p style={{textAlign:'center',padding:30,color:'#64748B',fontSize:13}}>No hay registros de scrap para {linea} con estos filtros</p>}
      </div>
    </div>
  );

  // ── MATRIX ──
  if(!result)return null;
  const{summary,totalRecords,totalDefectTypes,bancosControlados,totalDefects}=result;
  return(
    <div style={{minHeight:'100vh'}}>
      <div className="print-header" style={{background:'linear-gradient(135deg,#1E293B,#0F172A)',borderBottom:'1px solid #334155',padding:'14px 24px',position:'sticky',top:0,zIndex:50}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12,maxWidth:1900,margin:'0 auto'}}>
          <div><div style={{fontSize:11,fontWeight:600,letterSpacing:3,color:'#F59E0B',textTransform:'uppercase'}}>WCM · Pilar Calidad · {linea}</div><h1 style={{fontSize:20,fontWeight:700,color:'#F8FAFC',margin:'2px 0 0'}}>{giroName||'Matriz QA'}</h1></div>
          <div style={{display:'flex',gap:8}} className="no-print"><Btn onClick={handlePrint} bg="#1D4ED8" color="#fff">🖨️ Imprimir AA</Btn><Btn onClick={handlePrintAll} bg="#1D4ED8" color="#fff" style={{fontSize:11}}>🖨️ Todas</Btn><Btn onClick={()=>{setScrapForm(null);setPage('scrap');}}>🗑️ Scrap</Btn><Btn onClick={()=>setPage('defectos')}>⚙️ Defectos</Btn><Btn onClick={()=>setPage('home')}>← Inicio</Btn><Btn onClick={()=>{setPage('home');setResult(null);setFilter('ALL');setSearch('');setPendingFile(null);setBancos('');setPiezasTotales('');setDiasTrabajados('');setPiezasEntregadas('');setGiroName('');setPdcaMap({});setGiroId(null);if(linea)localStorage.removeItem(`activeGiro_${linea}`);}} bg="#7F1D1D" color="#FCA5A5" style={{fontSize:11}}>Cerrar giro</Btn></div>
        </div>
      </div>
      <div style={{padding:'16px 24px',maxWidth:1900,margin:'0 auto'}}>
        <div className="fade-in" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:10,marginBottom:16}}>
          {[{l:'Registros',v:totalRecords,i:'📋'},{l:'Bancos',v:bancosControlados.toLocaleString(),i:'🏭'},{l:'Defectos',v:totalDefects,i:'🔍'},{l:'Tipos',v:totalDefectTypes,i:'📊'},{l:'AA',v:summary.AA,c:VC.AA,i:'🔴'},{l:'A',v:summary.A,c:VC.A,i:'🟠'},{l:'B',v:summary.B,c:VC.B,i:'🟡'},{l:'C',v:summary.C,c:VC.C,i:'🟢'},notInDbCount>0?{l:'Sin registro',v:notInDbCount,c:'#D97706',i:'⚠️'}:null].filter(Boolean).map((k,i)=>(<div key={i} className="print-kpi" style={{background:'#1E293B',borderRadius:10,padding:'10px 12px',border:'1px solid #334155'}}><div style={{fontSize:10,color:'#94A3B8',marginBottom:3}}>{k.i} {k.l}</div><div style={{fontSize:22,fontWeight:700,color:k.c||'#F8FAFC',fontFamily:"'IBM Plex Mono'"}}>{k.v}</div></div>))}
        </div>

        {wcmKpis?(
          <div style={{background:'#1E293B',borderRadius:10,padding:14,marginBottom:16,border:'1px solid #334155'}}>
            <h3 style={{fontSize:12,fontWeight:600,color:'#F59E0B',margin:'0 0 10px',textTransform:'uppercase',letterSpacing:1}}>Indicadores WCM {result.piezasTotales?`· ${result.piezasTotales.toLocaleString()} pzs · ${result.diasTrabajados} días · ${result.piezasEntregadas.toLocaleString()} entregadas`:''}</h3>
            <div className="fade-in" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10}}>
              <WcmCard label="FPY (First Pass Yield)" value={wcmKpis.fpy!=null?`${wcmKpis.fpy.toFixed(2)}%`:'—'} color={wcmKpis.fpy>=95?'#16A34A':wcmKpis.fpy>=85?'#CA8A04':'#DC2626'} sub="Sin retrabajo" />
              <WcmCard label="Rework Rate" value={wcmKpis.rework!=null?`${wcmKpis.rework.toFixed(2)}%`:'—'} color={wcmKpis.rework<=5?'#16A34A':wcmKpis.rework<=15?'#CA8A04':'#DC2626'} sub="Retrabajo" />
              <WcmCard label="Scrap Rate" value={wcmKpis.scrapRate!=null?`${wcmKpis.scrapRate.toFixed(2)}%`:'N/D'} color={wcmKpis.scrapQty>0?(wcmKpis.scrapRate<=2?'#16A34A':wcmKpis.scrapRate<=5?'#CA8A04':'#DC2626'):'#475569'} sub={wcmKpis.scrapQty>0?`${wcmKpis.scrapQty} pzs · $${wcmKpis.scrapUSD.toFixed(0)}`:'Sin eventos vinculados'} />
              <WcmCard label="Customer DPPM" value={wcmKpis.dppm!=null?Math.round(wcmKpis.dppm).toLocaleString():'—'} color="#F59E0B" sub={`Antena: ${wcmKpis.defAntena} defectos`} />
              <WcmCard label="Customer PPM" value={wcmKpis.custPpm!=null?Math.round(wcmKpis.custPpm).toLocaleString():'—'} color="#F59E0B" sub={`SCA+TDF+Gtía: ${wcmKpis.defCustomerPPM}`} />
              <WcmCard label="Internal PPM" value={wcmKpis.ippm!=null?Math.round(wcmKpis.ippm).toLocaleString():'—'} color="#38BDF8" sub={`IPPM: ${wcmKpis.defIPPM} defectos`} />
              <WcmCard label="COPQ" value="N/D" color="#475569" sub="Gestión aparte" />
            </div>
          </div>
        ):(
          <div className="no-print" style={{background:'#1E293B',borderRadius:10,padding:'10px 14px',marginBottom:16,border:'1px dashed #334155',fontSize:12,color:'#64748B'}}>
            ℹ️ Este giro no tiene datos de piezas totales / entregadas cargados — los indicadores WCM (FPY, PPM, etc.) no están disponibles. Se piden al generar un giro nuevo.
          </div>
        )}
        <div style={{background:'#1E293B',borderRadius:10,padding:14,marginBottom:16,border:'1px solid #334155'}}><h3 style={{fontSize:12,fontWeight:600,color:'#F59E0B',margin:'0 0 10px',textTransform:'uppercase',letterSpacing:1}}>Pareto</h3><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{pareto.slice(0,10).map(([c,n],i)=>{const p=(n/totalDefects*100).toFixed(1);return(<div key={i} style={{flex:'1 1 auto',minWidth:100,background:'#0F172A',borderRadius:6,padding:'6px 10px',border:'1px solid #334155'}}><div style={{fontSize:10,color:'#94A3B8'}}>{c}</div><div style={{display:'flex',alignItems:'baseline',gap:4}}><span style={{fontSize:18,fontWeight:700,color:'#F8FAFC',fontFamily:"'IBM Plex Mono'"}}>{n}</span><span style={{fontSize:10,color:'#64748B'}}>{p}%</span></div><div style={{height:2,background:'#334155',borderRadius:1,marginTop:3}}><div style={{height:'100%',width:`${Math.min(+p,100)}%`,background:'#F59E0B',borderRadius:1}}/></div></div>);})}</div></div>
        <div className="no-print" style={{display:'flex',gap:6,alignItems:'center',marginBottom:12,flexWrap:'wrap'}}>
          {['ALL','AA','A','B','C'].map(f=><Btn key={f} onClick={()=>setFilter(f)} bg={filter===f?(f==='ALL'?'#F59E0B':VC[f]):'#334155'} color={filter===f?'#0F172A':'#94A3B8'} style={{padding:'5px 12px',fontSize:12}}>{f==='ALL'?'Todas':f} ({f==='ALL'?totalDefectTypes:summary[f]})</Btn>)}
          <input placeholder="Buscar..." value={search} onChange={e=>setSearch(e.target.value)} style={{marginLeft:'auto',padding:'6px 12px',borderRadius:6,border:'1px solid #475569',background:'#1E293B',color:'#F8FAFC',fontSize:12,width:200}}/>
        </div>
        <div style={{overflowX:'auto',borderRadius:10,border:'1px solid #334155'}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:1400}}><thead><tr style={{background:'#1E293B'}}>
          <th style={th}>#</th><th style={th}>Voz</th><th style={{...th,textAlign:'left',minWidth:220}}>Modo de Falla</th><th style={th}>S</th><th style={th}>Qty</th><th style={th}>O</th><th style={th}>D</th><th style={th}>C</th><th style={{...th,color:'#F59E0B'}}>Índice</th><th style={{...th,borderLeft:'2px solid #334155'}}>PDCA</th><th style={th}>Resp.</th>
          {DETECTION_POINTS.map(dp=><th key={dp.key} style={{...th,color:dp.scope==='ext'?'#F59E0B':'#94A3B8',fontSize:9}}>{dp.label}</th>)}
        </tr></thead><tbody>
          {filteredRows.map((row,i)=>{const sel=selectedRow===row.vozNum;const pc=pdcaMap[row.vozNum]||{responsable:'',plan:false,do_step:false,check:false,act:false,comments:''};const nodb=row.notInDb;return[
            <tr key={row.vozNum} className={nodb?'print-nodb':''} onClick={()=>setSelectedRow(sel?null:row.vozNum)} style={{background:sel?'#1E3A5F':nodb?(i%2===0?'#1C1207':'#211508'):(i%2===0?'#0F172A':'#131C2E'),cursor:'pointer',borderBottom:`1px solid ${nodb?'#92400E':'#1E293B'}`,borderLeft:nodb?'3px solid #D97706':'3px solid transparent'}} onMouseEnter={e=>{if(!sel)e.currentTarget.style.background='#1E293B';}} onMouseLeave={e=>{if(!sel)e.currentTarget.style.background=sel?'#1E3A5F':nodb?(i%2===0?'#1C1207':'#211508'):(i%2===0?'#0F172A':'#131C2E');}}>
              <td style={td}>{row.vozNum}</td><td style={td}><Voz v={row.voz}/></td><td style={{...td,textAlign:'left',fontWeight:500,fontSize:11,color:nodb?'#D97706':'#E2E8F0'}}>{row.concat}{nodb&&<span style={{fontSize:9,color:'#92400E',marginLeft:6}} title="Defecto no encontrado en la lista única. Usando valores por defecto (S=3, CI=1, CE=4)">⚠ sin registro</span>}</td><td style={td}>{row.severidad}</td><td style={{...td,fontWeight:700}}>{row.cantDefectos}</td><td style={td}>{row.ocurrencia}</td><td style={td}>{row.detectabilidad}</td><td style={td}>{row.costo}</td><td className="print-index" style={{...td,fontWeight:700,color:'#F59E0B',fontSize:13,fontFamily:"'IBM Plex Mono'"}}>{row.index}</td>
              <td style={{...td,borderLeft:'2px solid #334155'}} onClick={e=>e.stopPropagation()}><div style={{display:'flex',gap:2,justifyContent:'center'}}>{['P','D','C','A'].map((l,li)=>{const f=['plan','do_step','check','act'][li];const ck=pc[f];return(<button key={l} onClick={()=>handlePdca(row.vozNum,f,!ck)} style={{width:20,height:20,borderRadius:3,border:'none',fontSize:9,fontWeight:700,cursor:'pointer',background:ck?'#16A34A':'#334155',color:ck?'#fff':'#64748B'}}>{l}</button>);})}</div></td>
              <td style={{...td,fontSize:10,maxWidth:70,overflow:'hidden',textOverflow:'ellipsis',color:pc.responsable?'#F8FAFC':'#475569'}}>{pc.responsable||'—'}</td>
              {DETECTION_POINTS.map(dp=>{const v=row.dpBreakdown[dp.key];return<td key={dp.key} className={v?(dp.scope==='ext'?'dp-ext':'dp-int'):''} style={{...td,color:v?(dp.scope==='ext'?'#F59E0B':'#38BDF8'):'#1E293B',fontSize:10}}>{v||'·'}</td>;})}
            </tr>,
            sel&&<tr key={`d-${row.vozNum}`}><td colSpan={11+DETECTION_POINTS.length} style={{padding:'14px 16px',background:'#1E293B',borderBottom:'2px solid #F59E0B'}}><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
              <div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:8,marginBottom:12}}><Dt l="Componente" v={row.component}/><Dt l="Ocurrencia %" v={`${(row.ocurrenciaPct*100).toFixed(4)}%`} m/><Dt l="C.Int" v={row.costoInterno} m/><Dt l="C.Ext" v={row.costoExterno} m/><Dt l="C.Usado" v={row.costo} m h/><Dt l="Fórmula" v={`${row.severidad}×${row.ocurrencia}×${row.detectabilidad}×${row.costo}=${row.index}`} m h/></div>
                <div style={{marginTop:8,padding:'10px 12px',background:'#0F172A',borderRadius:8,border:'1px solid #334155'}}><div style={{fontSize:10,color:'#F59E0B',fontWeight:600,textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>Unificar voces</div><div style={{display:'flex',gap:8,alignItems:'center'}} onClick={e=>e.stopPropagation()}><input placeholder="Nros de voz (ej: 5,8,12)" value={unifyTarget?.vozNum===row.vozNum?unifyTarget.inputVal:''} onChange={e=>setUnifyTarget({vozNum:row.vozNum,inputVal:e.target.value})} style={{flex:1,padding:'6px 10px',borderRadius:6,border:'1px solid #475569',background:'#1E293B',color:'#F8FAFC',fontSize:12}}/><Btn bg="#F59E0B" color="#0F172A" onClick={()=>{if(unifyTarget?.vozNum===row.vozNum)handleUnify(row.vozNum,unifyTarget.inputVal);}} style={{padding:'6px 12px',fontSize:11}}>Unificar</Btn></div><p style={{fontSize:10,color:'#64748B',marginTop:4}}>Las ocurrencias se suman y las voces indicadas se eliminan</p></div>
                <div style={{marginTop:8}} onClick={e=>e.stopPropagation()}><Btn bg="#7C2D12" color="#FDBA74" onClick={()=>openScrapForm({giroId,vozNum:row.vozNum,defectoNombre:row.defectName,componente:row.component})} style={{width:'100%',fontSize:11}}>🗑️ Registrar resolución (Scrap/Devolución/Retrabajo)</Btn></div>
              </div>
              <div><div style={{marginBottom:8}}><span style={{fontSize:10,color:'#64748B',textTransform:'uppercase'}}>Responsable</span><input value={pc.responsable} onChange={e=>handlePdca(row.vozNum,'responsable',e.target.value)} placeholder="Asignar..." onClick={e=>e.stopPropagation()} style={{width:'100%',padding:'6px 10px',borderRadius:6,border:'1px solid #475569',background:'#0F172A',color:'#F8FAFC',fontSize:13,marginTop:4}}/></div>
                <div><span style={{fontSize:10,color:'#64748B',textTransform:'uppercase'}}>Comentarios</span><textarea value={pc.comments} onChange={e=>handlePdca(row.vozNum,'comments',e.target.value)} placeholder="Notas..." onClick={e=>e.stopPropagation()} rows={2} style={{width:'100%',padding:'6px 10px',borderRadius:6,border:'1px solid #475569',background:'#0F172A',color:'#F8FAFC',fontSize:12,marginTop:4,resize:'vertical',fontFamily:'inherit'}}/></div>
                <div style={{display:'flex',gap:8,marginTop:8}}>{[['plan','Plan'],['do_step','Do'],['check','Check'],['act','Act']].map(([f,l])=>(<label key={f} style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer',fontSize:12}} onClick={e=>e.stopPropagation()}><input type="checkbox" checked={pc[f]} onChange={e=>handlePdca(row.vozNum,f,e.target.checked)} style={{accentColor:'#16A34A'}}/><span style={{color:pc[f]?'#16A34A':'#94A3B8',fontWeight:600}}>{l}</span></label>))}</div>
              </div>
            </div></td></tr>,
          ];})}
        </tbody></table></div>
        <div className="no-print" style={{textAlign:'center',padding:'16px 0 40px',color:'#475569',fontSize:11}}>{filteredRows.length} de {totalDefectTypes} voces · Bancos: {bancosControlados.toLocaleString()}</div>
      </div>
    </div>
  );
}

function HC({icon,title,desc,onClick,hl}){return<div onClick={onClick} style={{background:hl?'#1E3A5F':'#1E293B',borderRadius:16,padding:'32px 24px',border:`1px solid ${hl?'#F59E0B':'#334155'}`,cursor:'pointer',textAlign:'center',transition:'border-color .2s'}} onMouseEnter={e=>e.currentTarget.style.borderColor='#F59E0B'} onMouseLeave={e=>e.currentTarget.style.borderColor=hl?'#F59E0B':'#334155'}><div style={{fontSize:40,marginBottom:12}}>{icon}</div><div style={{fontWeight:700,color:'#F8FAFC',fontSize:18,marginBottom:4}}>{title}</div><div style={{color:hl?'#F59E0B':'#64748B',fontSize:13}}>{desc}</div></div>;}
function Dt({l,v,m,h}){return<div><div style={{fontSize:9,color:'#64748B',textTransform:'uppercase',letterSpacing:1}}>{l}</div><div style={{fontWeight:600,color:h?'#F59E0B':'#F8FAFC',fontFamily:m?"'IBM Plex Mono',monospace":'inherit',fontSize:m?11:12}}>{v}</div></div>;}
function WcmCard({label,value,color,sub}){return<div className="print-kpi" style={{background:'#0F172A',borderRadius:8,padding:'10px 12px',border:'1px solid #334155'}}><div style={{fontSize:10,color:'#94A3B8',marginBottom:4}}>{label}</div><div style={{fontSize:20,fontWeight:700,color,fontFamily:"'IBM Plex Mono'"}}>{value}</div><div style={{fontSize:9,color:'#64748B',marginTop:2}}>{sub}</div></div>;}
