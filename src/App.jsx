import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { processExcelFile, unifyVoices, buildGiroFromReportes } from './engine';
import { DETECTION_POINTS, TURNOS, ORIGENES, DESTINOS, TIPOS_MATERIAL, DESTINO_COLORS, todayLocal } from './config';
import * as XLSX from 'xlsx';
import readXlsxFile from 'read-excel-file';
import KioskApp from './Kiosk';
import ScrapKioskApp from './ScrapKiosk';
import { fetchDefectos, upsertDefecto, deleteDefecto, bulkUpsertDefectos, saveGiro, fetchGiros, fetchGiro, deleteGiro, updateGiroRows, savePdca, fetchPdcas, saveUnificacion, fetchLineas, signIn, signOut, getSession, onAuthChange, subscribeGiros, subscribePdca, fetchScrapEventos, saveScrapEvento, deleteScrapEvento, subscribeScrap, fetchTiposAsiento, saveTipoAsiento, deleteTipoAsiento, fetchPartesAsiento, savePartesAsiento, deletePartesAsiento, fetchModelos, saveModelo, deleteModelo, fetchCuadrantes, saveCuadrante, deleteCuadrante, fetchReportesDefectos, countReportesPendientes, fetchProduccionDiaria, upsertProduccionDiaria } from './supabase';

const VC={AA:'#DC2626',A:'#991B1B',B:'#71717A',C:'#D4D4D8'};
const Voz=({v})=><span className="voz-badge" data-voz={v} style={{background:VC[v],color:'#FAFAFA',padding:'2px 8px',borderRadius:4,fontWeight:700,fontSize:12,letterSpacing:1}}>{v}</span>;
const Btn=({children,onClick,bg='#3F3F46',color='#FAFAFA',style,...p})=><button onClick={onClick} style={{padding:'7px 16px',background:bg,color,border:'none',borderRadius:6,fontWeight:600,fontSize:13,...style}} {...p}>{children}</button>;

export default function App(){
  const[session,setSession]=useState(null);
  const[authLoading,setAuthLoading]=useState(true);
  const[kioskMode,setKioskMode]=useState(false);
  const[scrapKioskMode,setScrapKioskMode]=useState(false);
  const[tiposAsientoAdmin,setTiposAsientoAdmin]=useState([]);
  const[partesAsientoAdmin,setPartesAsientoAdmin]=useState([]);
  const[newParteAsiento,setNewParteAsiento]=useState({tipoAsiento:'',nombre:''});
  const[modelosAdmin,setModelosAdmin]=useState([]);
  const[cuadrantesAdmin,setCuadrantesAdmin]=useState([]);
  const[newTipoAsiento,setNewTipoAsiento]=useState('');
  const[newModelo,setNewModelo]=useState('');
  const[newCuadrante,setNewCuadrante]=useState({tipoAsiento:'',parteAsiento:'',nombre:''});
  const[giroSource,setGiroSource]=useState('excel'); // 'excel' | 'bd'
  const[reportesDesde,setReportesDesde]=useState('');
  const[reportesHasta,setReportesHasta]=useState('');
  const[reportesPendientes,setReportesPendientes]=useState([]);
  const[loadingReportes,setLoadingReportes]=useState(false);
  const[gerGirosList,setGerGirosList]=useState({X6S:[],KP1:[]});
  const[gerGiroData,setGerGiroData]=useState({X6S:null,KP1:null});
  const[gerScrap,setGerScrap]=useState({X6S:[],KP1:[]});
  const[gerPdca,setGerPdca]=useState({X6S:{},KP1:{}});
  const[gerDesde,setGerDesde]=useState(todayLocal());
  const[gerHasta,setGerHasta]=useState(todayLocal());
  const[gerReportes,setGerReportes]=useState({X6S:[],KP1:[]});
  const[gerProduccion,setGerProduccion]=useState({X6S:[],KP1:[]});
  const[gerDailyForm,setGerDailyForm]=useState({
    X6S:{fecha:todayLocal(),piezasTotales:'',piezasEntregadas:'',bancosControlados:''},
    KP1:{fecha:todayLocal(),piezasTotales:'',piezasEntregadas:'',bancosControlados:''},
  });
  const[gerLoading,setGerLoading]=useState(false);
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
  const defectosParsed=useMemo(()=>defectos.map(d=>{const idx=d.nombre.indexOf(' - ');return{...d,componenteParsed:idx===-1?d.nombre:d.nombre.slice(0,idx).trim(),defectoParte:idx===-1?'':d.nombre.slice(idx+3).trim()};}),[defectos]);
  const componentesUnicos=useMemo(()=>[...new Set(defectosParsed.map(d=>d.componenteParsed))].sort((a,b)=>a.localeCompare(b)),[defectosParsed]);
  const defectosPorComponente=useCallback((comp)=>defectosParsed.filter(d=>d.componenteParsed===comp).sort((a,b)=>a.defectoParte.localeCompare(b.defectoParte)),[defectosParsed]);
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
    try{const saved=await saveGiro({...res,name,date:todayLocal(),piezasTotales:pt,diasTrabajados:dt,piezasEntregadas:pe},linea);if(saved?.id){setGiroId(saved.id);localStorage.setItem(`activeGiro_${linea}`,saved.id);const pd=await fetchPdcas(saved.id);setPdcaMap(pd);}}catch(e){console.warn(e);}
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
    XLSX.writeFile(wb,`Defectos_${linea}_${todayLocal()}.xlsx`);
  },[defectos,occurrenceMap,linea]);

  const loadHistory=useCallback(async()=>{try{const g=await fetchGiros(linea);setGiros(g);}catch(e){console.error(e);}setPage('history');},[linea]);

  const loadGerencial=useCallback(async()=>{
    setGerLoading(true);
    try{
      const LINEAS=['X6S','KP1'];
      const girosLists={},giroDatas={},scraps={},pdcas={},reportes={},produccion={};
      for(const L of LINEAS){
        const gs=await fetchGiros(L);girosLists[L]=gs;
        const savedId=localStorage.getItem(`activeGiro_${L}`);
        const targetId=(savedId&&gs.some(g=>g.id===savedId))?savedId:(gs[0]?.id||null);
        giroDatas[L]=targetId?await fetchGiro(targetId):null;
        scraps[L]=await fetchScrapEventos(L);
        pdcas[L]=targetId?await fetchPdcas(targetId):{};
        reportes[L]=await fetchReportesDefectos(L,gerDesde,gerHasta);
        produccion[L]=await fetchProduccionDiaria(L,gerDesde,gerHasta);
      }
      setGerGirosList(girosLists);setGerGiroData(giroDatas);setGerScrap(scraps);setGerPdca(pdcas);
      setGerReportes(reportes);setGerProduccion(produccion);
    }catch(e){console.error(e);}
    setGerLoading(false);
    setPage('gerencial');
  },[gerDesde,gerHasta]);

  const refetchGerDateRange=useCallback(async(desde,hasta)=>{
    setGerLoading(true);
    try{
      const LINEAS=['X6S','KP1'];
      const reportes={},produccion={};
      for(const L of LINEAS){
        reportes[L]=await fetchReportesDefectos(L,desde,hasta);
        produccion[L]=await fetchProduccionDiaria(L,desde,hasta);
      }
      setGerReportes(reportes);setGerProduccion(produccion);
    }catch(e){console.error(e);}
    setGerLoading(false);
  },[]);

  const handleSaveProduccionDiaria=useCallback(async(L)=>{
    const f=gerDailyForm[L];
    const pt=parseInt(f.piezasTotales),pe=parseInt(f.piezasEntregadas),bc=parseInt(f.bancosControlados);
    if(!pt&&!pe&&!bc){alert('Ingresá al menos un valor');return;}
    try{
      await upsertProduccionDiaria(L,f.fecha,{piezasTotales:pt||0,piezasEntregadas:pe||0,bancosControlados:bc||0,diasTrabajados:1});
      const produccion=await fetchProduccionDiaria(L,gerDesde,gerHasta);
      setGerProduccion(p=>({...p,[L]:produccion}));
      setGerDailyForm(p=>({...p,[L]:{fecha:todayLocal(),piezasTotales:'',piezasEntregadas:'',bancosControlados:''}}));
    }catch(e){alert('Error: '+e.message);}
  },[gerDailyForm,gerDesde,gerHasta]);

  const changeGerGiro=useCallback(async(L,giroId)=>{
    if(!giroId){setGerGiroData(p=>({...p,[L]:null}));setGerPdca(p=>({...p,[L]:{}}));return;}
    try{const g=await fetchGiro(giroId);setGerGiroData(p=>({...p,[L]:g}));const pd=await fetchPdcas(giroId);setGerPdca(p=>({...p,[L]:pd}));}catch(e){alert('Error: '+e.message);}
  },[]);
  const loadGiro=useCallback(async(id)=>{try{setLoading(true);const g=await fetchGiro(id);const pd=await fetchPdcas(id);
    // Recalculate notInDb flag against current defectos list
    const rows=g.qa_rows.map(r=>({...r,notInDb:!defectosDb[r.defectName]}));
    setResult({qaRows:rows,totalRecords:g.total_records,totalDefectTypes:g.total_defect_types,bancosControlados:g.bancos_controlados,totalDefects:g.total_defects,summary:g.summary,format:g.format,piezasTotales:g.piezas_totales,diasTrabajados:g.dias_trabajados,piezasEntregadas:g.piezas_entregadas});setGiroId(id);setGiroName(g.name);setPdcaMap(pd);localStorage.setItem(`activeGiro_${linea}`,id);setPage('matrix');}catch(e){alert('Error: '+e.message);}setLoading(false);},[defectosDb,linea]);
  const handleDeleteGiro=useCallback(async(id,e)=>{e.stopPropagation();if(!confirm('¿Eliminar este giro?'))return;try{await deleteGiro(id);setGiros(prev=>prev.filter(g=>g.id!==id));}catch(err){alert('Error: '+err.message);}},[]);

  const handlePrint=useCallback(()=>{setFilter('AA');setSelectedRow(null);setTimeout(()=>window.print(),300);},[]);
  const handlePrintAll=useCallback(()=>{setFilter('ALL');setSelectedRow(null);setTimeout(()=>window.print(),300);},[]);

  const openScrapForm=useCallback((prefill)=>{
    let comp=prefill?.componente||'',defParte='';
    if(prefill?.defectoNombre){
      const idx=prefill.defectoNombre.indexOf(' - ');
      comp=idx===-1?prefill.defectoNombre:prefill.defectoNombre.slice(0,idx).trim();
      defParte=idx===-1?'':prefill.defectoNombre.slice(idx+3).trim();
    }
    setScrapForm({
      giroId:prefill?.giroId||null,vozNum:prefill?.vozNum||null,
      componente:comp,defectoParte:defParte,
      fecha:todayLocal(),turno:'A',origen:'Producción',destino:'Scrap',
      tipoMaterial:'Cuenta Plena',cantidad:1,costoUnitario:'',notas:'',
    });
    setPage('scrap');
  },[]);
  const handleSaveScrap=useCallback(async()=>{
    if(!scrapForm)return;
    if(!scrapForm.componente){alert('Seleccioná el componente');return;}
    if(!scrapForm.defectoParte){alert('Seleccioná el defecto');return;}
    const cant=parseInt(scrapForm.cantidad);const costo=parseFloat(scrapForm.costoUnitario);
    if(!cant||cant<1){alert('Ingresá una cantidad válida');return;}
    if(isNaN(costo)||costo<0){alert('Ingresá un costo unitario válido');return;}
    const defectoNombre=`${scrapForm.componente} - ${scrapForm.defectoParte}`;
    try{
      await saveScrapEvento({...scrapForm,defectoNombre,cantidad:cant,costoUnitario:costo},linea);
      const fresh=await fetchScrapEventos(linea);setScrapEventos(fresh);
      setScrapForm(null);
    }catch(e){alert('Error: '+e.message);}
  },[scrapForm,linea]);
  const handleDeleteScrap=useCallback(async(id)=>{
    if(!confirm('¿Eliminar este registro de scrap?'))return;
    try{await deleteScrapEvento(id);setScrapEventos(prev=>prev.filter(e=>e.id!==id));}catch(e){alert('Error: '+e.message);}
  },[]);

  const loadCatalogosAdmin=useCallback(async()=>{
    if(!linea)return;
    try{
      const[ta,pa,mo,cu]=await Promise.all([fetchTiposAsiento(linea),fetchPartesAsiento(linea),fetchModelos(linea),fetchCuadrantes(linea)]);
      setTiposAsientoAdmin(ta);setPartesAsientoAdmin(pa);setModelosAdmin(mo);setCuadrantesAdmin(cu);
    }catch(e){console.error(e);}
  },[linea]);

  const handleAddTipoAsiento=useCallback(async()=>{
    if(!newTipoAsiento.trim())return;
    try{await saveTipoAsiento(newTipoAsiento.trim(),linea);setNewTipoAsiento('');loadCatalogosAdmin();}catch(e){alert('Error: '+e.message);}
  },[newTipoAsiento,linea,loadCatalogosAdmin]);
  const handleDeleteTipoAsiento=useCallback(async(id)=>{if(!confirm('¿Eliminar?'))return;try{await deleteTipoAsiento(id);loadCatalogosAdmin();}catch(e){alert('Error: '+e.message);}},[loadCatalogosAdmin]);

  const handleAddParteAsiento=useCallback(async()=>{
    if(!newParteAsiento.nombre.trim()||!newParteAsiento.tipoAsiento)return;
    try{await savePartesAsiento(newParteAsiento.nombre.trim(),newParteAsiento.tipoAsiento,linea);setNewParteAsiento(p=>({...p,nombre:''}));loadCatalogosAdmin();}catch(e){alert('Error: '+e.message);}
  },[newParteAsiento,linea,loadCatalogosAdmin]);
  const handleDeleteParteAsiento=useCallback(async(id)=>{if(!confirm('¿Eliminar?'))return;try{await deletePartesAsiento(id);loadCatalogosAdmin();}catch(e){alert('Error: '+e.message);}},[loadCatalogosAdmin]);

  const handleAddModelo=useCallback(async()=>{
    if(!newModelo.trim())return;
    try{await saveModelo(newModelo.trim(),linea);setNewModelo('');loadCatalogosAdmin();}catch(e){alert('Error: '+e.message);}
  },[newModelo,linea,loadCatalogosAdmin]);
  const handleDeleteModelo=useCallback(async(id)=>{if(!confirm('¿Eliminar?'))return;try{await deleteModelo(id);loadCatalogosAdmin();}catch(e){alert('Error: '+e.message);}},[loadCatalogosAdmin]);

  const handleAddCuadrante=useCallback(async()=>{
    if(!newCuadrante.nombre.trim()||!newCuadrante.tipoAsiento||!newCuadrante.parteAsiento)return;
    try{await saveCuadrante(newCuadrante.nombre.trim(),newCuadrante.tipoAsiento,newCuadrante.parteAsiento,linea);setNewCuadrante(p=>({...p,nombre:''}));loadCatalogosAdmin();}catch(e){alert('Error: '+e.message);}
  },[newCuadrante,linea,loadCatalogosAdmin]);
  const handleDeleteCuadrante=useCallback(async(id)=>{if(!confirm('¿Eliminar?'))return;try{await deleteCuadrante(id);loadCatalogosAdmin();}catch(e){alert('Error: '+e.message);}},[loadCatalogosAdmin]);

  const handleBuscarReportes=useCallback(async()=>{
    setLoadingReportes(true);
    try{const rows=await fetchReportesDefectos(linea,reportesDesde,reportesHasta);setReportesPendientes(rows);}catch(e){alert('Error: '+e.message);}
    setLoadingReportes(false);
  },[linea,reportesDesde,reportesHasta]);

  const handleProcessFromDb=useCallback(async()=>{
    const b=parseInt(bancos);if(!b||b<1){setError('Ingresá la cantidad de bancos controlados');return;}
    const pt=parseInt(piezasTotales);if(!pt||pt<1){setError('Ingresá la cantidad de piezas totales producidas');return;}
    const dt=parseInt(diasTrabajados);if(!dt||dt<1){setError('Ingresá los días trabajados');return;}
    const pe=parseInt(piezasEntregadas);if(!pe||pe<1){setError('Ingresá la cantidad de piezas entregadas al cliente');return;}
    if(reportesPendientes.length===0){setError('No hay reportes cargados en ese rango de fechas');return;}
    setLoading(true);setError(null);
    try{
      const res=buildGiroFromReportes(reportesPendientes,b,defectosDb);
      setResult({...res,piezasTotales:pt,diasTrabajados:dt,piezasEntregadas:pe});
      const name=giroName||`Giro ${new Date().toLocaleDateString('es-AR')}`;
      const saved=await saveGiro({...res,name,date:todayLocal(),piezasTotales:pt,diasTrabajados:dt,piezasEntregadas:pe},linea);
      if(saved?.id){
        setGiroId(saved.id);localStorage.setItem(`activeGiro_${linea}`,saved.id);
        const pd=await fetchPdcas(saved.id);setPdcaMap(pd);
      }
      setPage('matrix');
    }catch(err){setError(err.message);}
    setLoading(false);
  },[bancos,piezasTotales,diasTrabajados,piezasEntregadas,reportesPendientes,defectosDb,giroName,linea]);

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
    const scrapRate=pe>0?(scrapQty/pe*100):null;
    const dppm=pe>0?(defAntena/pe*1000000):null;
    const custPpm=pe>0?(defCustomerPPM/pe*1000000):null;
    const ippm=bc>0?(defIPPM/bc*1000000):null;
    const piezasDia=dt>0?(pt/dt):null;

    return{fpy,rework,scrapRate,scrapQty,scrapUSD,devolQty,reworkQty,dppm,custPpm,ippm,piezasDia,defAntena,defCustomerPPM,defIPPM};
  },[result,scrapEventos,giroId]);

  const kaizenStatus=useMemo(()=>result?calcKaizenStatus(result.qaRows,pdcaMap):null,[result,pdcaMap]);

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
    for(const e of scrapOnly){const key=e.defecto_nombre;if(!byPart[key])byPart[key]={usd:0,qty:0};byPart[key].usd+=Number(e.monto||0);byPart[key].qty+=e.cantidad;}
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

  const th={padding:'8px 5px',textAlign:'center',color:'#A1A1AA',fontWeight:600,fontSize:10,textTransform:'uppercase',borderBottom:'2px solid #3F3F46',whiteSpace:'nowrap',position:'sticky',top:0,background:'#1F1F23',zIndex:10};
  const td={padding:'6px 5px',textAlign:'center',whiteSpace:'nowrap',fontSize:11};

  // Line selector component
  const LineSelector=()=>lineas.length>1?(
    <div style={{display:'flex',gap:6}}>
      {lineas.map(l=><Btn key={l.id} onClick={()=>setLinea(l.id)} bg={linea===l.id?'#B91C1C':'#3F3F46'} color={linea===l.id?'#121212':'#A1A1AA'} style={{padding:'5px 14px',fontSize:12,fontWeight:700}}>{l.id}</Btn>)}
    </div>
  ):null;

  // ── LOGIN ──
  if(authLoading)return<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',color:'#A1A1AA'}}>Cargando...</div>;
  if(kioskMode)return<KioskApp onExit={()=>setKioskMode(false)}/>;
  if(scrapKioskMode)return<ScrapKioskApp onExit={()=>setScrapKioskMode(false)}/>;
  if(!session)return(
    <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'linear-gradient(165deg,#121212,#1F1F23 50%,#121212)',padding:24}}>
      <div style={{textAlign:'center',marginBottom:40}}><div style={{fontSize:14,fontWeight:600,letterSpacing:4,color:'#B91C1C',textTransform:'uppercase',marginBottom:8}}>World Class Manufacturing</div><h1 style={{fontSize:42,fontWeight:700,color:'#FAFAFA',margin:0}}>Matriz QA</h1></div>
      <div style={{display:'flex',gap:20,alignItems:'stretch',flexWrap:'wrap',justifyContent:'center',width:'100%',maxWidth:1080}}>
        <div style={{flex:'1 1 280px',background:'rgba(30,41,59,0.8)',borderRadius:16,padding:28,border:'2px solid #B91C1C',display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',textAlign:'center'}}>
          <div style={{fontSize:44,marginBottom:12}}>📷</div>
          <h2 style={{fontSize:17,fontWeight:700,color:'#FAFAFA',marginBottom:8}}>Cargar Defectos</h2>
          <p style={{fontSize:12,color:'#A1A1AA',marginBottom:18}}>Acceso directo para operarios de planta — sin usuario ni contraseña</p>
          <Btn bg="#B91C1C" color="#121212" onClick={()=>setKioskMode(true)} style={{padding:'11px 24px',fontSize:14}}>Ingresar a módulo de carga</Btn>
        </div>
        <div style={{flex:'1 1 280px',background:'rgba(30,41,59,0.8)',borderRadius:16,padding:28,border:'2px solid #DC2626',display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',textAlign:'center'}}>
          <div style={{fontSize:44,marginBottom:12}}>🗑️</div>
          <h2 style={{fontSize:17,fontWeight:700,color:'#FAFAFA',marginBottom:8}}>Registrar Scrap</h2>
          <p style={{fontSize:12,color:'#A1A1AA',marginBottom:18}}>Acceso directo para registrar eventos de scrap — sin usuario ni contraseña</p>
          <Btn bg="#DC2626" color="#FAFAFA" onClick={()=>setScrapKioskMode(true)} style={{padding:'11px 24px',fontSize:14}}>Ingresar a módulo de carga</Btn>
        </div>
        <form onSubmit={handleLogin} style={{flex:'1 1 280px',background:'rgba(30,41,59,0.8)',borderRadius:16,padding:28,border:'1px solid #3F3F46'}}>
          <h2 style={{fontSize:17,fontWeight:600,color:'#FAFAFA',marginBottom:18,textAlign:'center'}}>Gestión QA — Iniciar sesión</h2>
          <label style={{display:'block',marginBottom:14}}><span style={{fontSize:12,fontWeight:600,color:'#A1A1AA',display:'block',marginBottom:6}}>Email</span><input type="email" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} required style={{width:'100%',padding:'10px 14px',borderRadius:8,border:'1px solid #52525B',background:'#1F1F23',color:'#FAFAFA',fontSize:14}}/></label>
          <label style={{display:'block',marginBottom:20}}><span style={{fontSize:12,fontWeight:600,color:'#A1A1AA',display:'block',marginBottom:6}}>Contraseña</span><input type="password" value={loginPass} onChange={e=>setLoginPass(e.target.value)} required style={{width:'100%',padding:'10px 14px',borderRadius:8,border:'1px solid #52525B',background:'#1F1F23',color:'#FAFAFA',fontSize:14}}/></label>
          {authError&&<div style={{padding:'10px 14px',background:'#450A0A',borderRadius:8,color:'#FCA5A5',fontSize:13,marginBottom:14}}>{authError}</div>}
          <button type="submit" style={{width:'100%',padding:12,background:'#B91C1C',color:'#121212',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:'pointer'}}>Ingresar</button>
        </form>
      </div>
    </div>
  );

  // ── HOME ──
  if(page==='home')return(
    <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'linear-gradient(165deg,#121212,#1F1F23 50%,#121212)',padding:24}}>
      <div style={{position:'absolute',top:20,right:20,display:'flex',alignItems:'center',gap:12}}><span style={{fontSize:12,color:'#71717A'}}>{session.user.email}</span><Btn onClick={handleLogout} style={{padding:'5px 12px',fontSize:11}}>Salir</Btn></div>
      <div style={{textAlign:'center',marginBottom:24}} className="fade-in"><div style={{fontSize:14,fontWeight:600,letterSpacing:4,color:'#B91C1C',textTransform:'uppercase',marginBottom:8}}>World Class Manufacturing</div><h1 style={{fontSize:42,fontWeight:700,color:'#FAFAFA',margin:0}}>Matriz QA</h1></div>
      <div style={{marginBottom:32}}><LineSelector/></div>
      {linea&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:16,maxWidth:700,width:'100%'}}>
        {result&&<HC icon="📈" title="Giro Activo" desc={giroName} onClick={()=>setPage('matrix')} hl/>}
        <HC icon="📊" title="Nuevo Giro" desc="Cargar Excel de SurveyMonkey" onClick={()=>setPage('upload')}/>
        <HC icon="📋" title="Historial" desc="Ver giros anteriores" onClick={loadHistory}/>
        <HC icon="⚙️" title="Defectos" desc="Editar severidad y costos" onClick={()=>setPage('defectos')}/>
        <HC icon="🗑️" title="Scrap" desc="Dashboard de seguimiento de scrap" onClick={()=>{setScrapForm(null);setPage('scrap');}}/>
        <HC icon="🧩" title="Catálogos" desc="Tipos de asiento, modelos, cuadrantes" onClick={()=>{loadCatalogosAdmin();setPage('catalogos');}}/>
        <HC icon="📈" title="Dashboard Gerencial" desc="X6S vs KP1 — vista unificada" onClick={loadGerencial}/>
      </div>}
    </div>
  );

  // ── UPLOAD ──
  if(page==='upload')return(
    <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'linear-gradient(165deg,#121212,#1F1F23 50%,#121212)',padding:24}}>
      <Btn onClick={()=>{setPage('home');setPendingFile(null);setError(null);setReportesPendientes([]);}} style={{position:'absolute',top:20,left:20}}>← Inicio</Btn>
      <div style={{textAlign:'center',marginBottom:20}}><h2 style={{fontSize:28,fontWeight:700,color:'#FAFAFA'}}>Nuevo Giro — {linea}</h2><p style={{color:'#A1A1AA',fontSize:14}}>Defectos en base: {defectos.length}</p></div>

      <div style={{display:'flex',gap:8,marginBottom:24}}>
        <Btn bg={giroSource==='excel'?'#B91C1C':'#3F3F46'} color={giroSource==='excel'?'#121212':'#A1A1AA'} onClick={()=>setGiroSource('excel')}>📄 Importar Excel</Btn>
        <Btn bg={giroSource==='bd'?'#B91C1C':'#3F3F46'} color={giroSource==='bd'?'#121212':'#A1A1AA'} onClick={()=>setGiroSource('bd')}>🗄️ Desde Base de Datos (Kiosco)</Btn>
      </div>

      {giroSource==='excel'?(<>
      {!pendingFile?(
        <div onDragOver={e=>{e.preventDefault();e.stopPropagation();setDragOver(true);}} onDragLeave={e=>{e.preventDefault();setDragOver(false);}} onDrop={e=>{e.preventDefault();setDragOver(false);handleFileDrop(e.dataTransfer?.files?.[0]);}} onClick={()=>fileRef.current?.click()} style={{width:'100%',maxWidth:520,border:`2px dashed ${dragOver?'#B91C1C':'#52525B'}`,borderRadius:16,padding:'48px 40px',textAlign:'center',cursor:'pointer',background:dragOver?'rgba(245,158,11,0.06)':'rgba(30,41,59,0.6)'}}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={e=>{handleFileDrop(e.target?.files?.[0]);e.target.value='';}} style={{display:'none'}}/>
          <div style={{fontSize:56,marginBottom:16}}>📊</div><p style={{fontSize:18,fontWeight:600,color:'#FAFAFA',margin:'0 0 8px'}}>Arrastrá el archivo Excel</p><p style={{fontSize:14,color:'#71717A',margin:'0 0 16px'}}>SurveyMonkey (.xlsx)</p><Btn bg="#B91C1C" color="#121212">Seleccionar archivo</Btn>
        </div>
      ):(
        <div style={{width:'100%',maxWidth:520,background:'rgba(30,41,59,0.8)',borderRadius:16,padding:32,border:'1px solid #3F3F46'}}>
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:24}}><span style={{fontSize:32}}>📄</span><div><div style={{fontWeight:600,color:'#FAFAFA'}}>{pendingFile.name}</div><div style={{color:'#71717A',fontSize:12}}>{(pendingFile.size/1024).toFixed(0)} KB</div></div><button onClick={()=>setPendingFile(null)} style={{marginLeft:'auto',background:'none',border:'none',color:'#71717A',cursor:'pointer',fontSize:18}}>✕</button></div>
          <label style={{display:'block',marginBottom:16}}><span style={{fontSize:12,fontWeight:600,color:'#A1A1AA',textTransform:'uppercase',letterSpacing:1,display:'block',marginBottom:6}}>Nombre del giro</span><input value={giroName} onChange={e=>setGiroName(e.target.value)} placeholder={`Giro ${new Date().toLocaleDateString('es-AR')}`} style={{width:'100%',padding:'10px 14px',borderRadius:8,border:'1px solid #52525B',background:'#1F1F23',color:'#FAFAFA',fontSize:14}}/></label>
          <label style={{display:'block',marginBottom:16}}><span style={{fontSize:12,fontWeight:600,color:'#B91C1C',textTransform:'uppercase',letterSpacing:1,display:'block',marginBottom:6}}>Bancos controlados *</span><input type="number" min="1" value={bancos} onChange={e=>setBancos(e.target.value)} placeholder="Ej: 5000" style={{width:'100%',padding:'10px 14px',borderRadius:8,border:'1px solid #B91C1C',background:'#1F1F23',color:'#FAFAFA',fontSize:16,fontWeight:700,fontFamily:"'IBM Plex Mono'"}}/><span style={{fontSize:11,color:'#71717A',marginTop:4,display:'block'}}>Piezas individuales controladas (usado para IPPM)</span></label>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
            <label style={{display:'block'}}><span style={{fontSize:11,fontWeight:600,color:'#A1A1AA',textTransform:'uppercase',letterSpacing:0.5,display:'block',marginBottom:6}}>Piezas totales producidas *</span><input type="number" min="1" value={piezasTotales} onChange={e=>setPiezasTotales(e.target.value)} placeholder="Ej: 4800" style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1px solid #52525B',background:'#1F1F23',color:'#FAFAFA',fontSize:14,fontWeight:700,fontFamily:"'IBM Plex Mono'"}}/></label>
            <label style={{display:'block'}}><span style={{fontSize:11,fontWeight:600,color:'#A1A1AA',textTransform:'uppercase',letterSpacing:0.5,display:'block',marginBottom:6}}>Días trabajados *</span><input type="number" min="1" value={diasTrabajados} onChange={e=>setDiasTrabajados(e.target.value)} placeholder="Ej: 20" style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1px solid #52525B',background:'#1F1F23',color:'#FAFAFA',fontSize:14,fontWeight:700,fontFamily:"'IBM Plex Mono'"}}/></label>
          </div>
          <label style={{display:'block',marginBottom:24}}><span style={{fontSize:11,fontWeight:600,color:'#A1A1AA',textTransform:'uppercase',letterSpacing:0.5,display:'block',marginBottom:6}}>Piezas entregadas al cliente *</span><input type="number" min="1" value={piezasEntregadas} onChange={e=>setPiezasEntregadas(e.target.value)} placeholder="Ej: 4750" style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1px solid #52525B',background:'#1F1F23',color:'#FAFAFA',fontSize:14,fontWeight:700,fontFamily:"'IBM Plex Mono'"}}/><span style={{fontSize:11,color:'#71717A',marginTop:4,display:'block'}}>Usado para Customer DPPM y PPM</span></label>
          <Btn onClick={handleProcess} disabled={loading} bg={loading?'#52525B':'#B91C1C'} color="#121212" style={{width:'100%',padding:12,fontSize:15}}>{loading?'Generando...':'Generar Matriz QA'}</Btn>
        </div>
      )}
      </>):(
      <div style={{width:'100%',maxWidth:520,background:'rgba(30,41,59,0.8)',borderRadius:16,padding:32,border:'1px solid #3F3F46'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
          <label style={{display:'block'}}><span style={{fontSize:11,fontWeight:600,color:'#A1A1AA',display:'block',marginBottom:6}}>Desde</span><input type="date" value={reportesDesde} onChange={e=>setReportesDesde(e.target.value)} style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1px solid #52525B',background:'#1F1F23',color:'#FAFAFA',fontSize:13}}/></label>
          <label style={{display:'block'}}><span style={{fontSize:11,fontWeight:600,color:'#A1A1AA',display:'block',marginBottom:6}}>Hasta</span><input type="date" value={reportesHasta} onChange={e=>setReportesHasta(e.target.value)} style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1px solid #52525B',background:'#1F1F23',color:'#FAFAFA',fontSize:13}}/></label>
        </div>
        <Btn onClick={handleBuscarReportes} disabled={loadingReportes} style={{width:'100%',marginBottom:16}}>{loadingReportes?'Buscando...':'🔍 Buscar reportes pendientes'}</Btn>
        {reportesPendientes.length>0&&<div style={{background:'#121212',borderRadius:8,padding:'10px 14px',marginBottom:16,border:'1px solid #D4D4D8',fontSize:13,color:'#E4E4E7'}}>✓ {reportesPendientes.length} reportes encontrados (sin usar en otro giro)</div>}
        {reportesPendientes.length===0&&(reportesDesde||reportesHasta)&&!loadingReportes&&<div style={{background:'#121212',borderRadius:8,padding:'10px 14px',marginBottom:16,border:'1px solid #52525B',fontSize:12,color:'#A1A1AA'}}>Sin reportes en ese rango de fechas</div>}
        {reportesPendientes.length>0&&<div style={{fontSize:11,color:'#71717A',marginBottom:16}}>Estos reportes pueden reutilizarse en otros giros (ej: un giro semanal y uno mensual que se superponen) sin duplicarse en el mismo giro.</div>}

        <label style={{display:'block',marginBottom:16}}><span style={{fontSize:12,fontWeight:600,color:'#A1A1AA',textTransform:'uppercase',letterSpacing:1,display:'block',marginBottom:6}}>Nombre del giro</span><input value={giroName} onChange={e=>setGiroName(e.target.value)} placeholder={`Giro ${new Date().toLocaleDateString('es-AR')}`} style={{width:'100%',padding:'10px 14px',borderRadius:8,border:'1px solid #52525B',background:'#1F1F23',color:'#FAFAFA',fontSize:14}}/></label>
        <label style={{display:'block',marginBottom:16}}><span style={{fontSize:12,fontWeight:600,color:'#B91C1C',textTransform:'uppercase',letterSpacing:1,display:'block',marginBottom:6}}>Bancos controlados *</span><input type="number" min="1" value={bancos} onChange={e=>setBancos(e.target.value)} placeholder="Ej: 5000" style={{width:'100%',padding:'10px 14px',borderRadius:8,border:'1px solid #B91C1C',background:'#1F1F23',color:'#FAFAFA',fontSize:16,fontWeight:700,fontFamily:"'IBM Plex Mono'"}}/></label>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
          <label style={{display:'block'}}><span style={{fontSize:11,fontWeight:600,color:'#A1A1AA',display:'block',marginBottom:6}}>Piezas totales *</span><input type="number" min="1" value={piezasTotales} onChange={e=>setPiezasTotales(e.target.value)} style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1px solid #52525B',background:'#1F1F23',color:'#FAFAFA',fontSize:14,fontWeight:700,fontFamily:"'IBM Plex Mono'"}}/></label>
          <label style={{display:'block'}}><span style={{fontSize:11,fontWeight:600,color:'#A1A1AA',display:'block',marginBottom:6}}>Días trabajados *</span><input type="number" min="1" value={diasTrabajados} onChange={e=>setDiasTrabajados(e.target.value)} style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1px solid #52525B',background:'#1F1F23',color:'#FAFAFA',fontSize:14,fontWeight:700,fontFamily:"'IBM Plex Mono'"}}/></label>
        </div>
        <label style={{display:'block',marginBottom:24}}><span style={{fontSize:11,fontWeight:600,color:'#A1A1AA',display:'block',marginBottom:6}}>Piezas entregadas al cliente *</span><input type="number" min="1" value={piezasEntregadas} onChange={e=>setPiezasEntregadas(e.target.value)} style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1px solid #52525B',background:'#1F1F23',color:'#FAFAFA',fontSize:14,fontWeight:700,fontFamily:"'IBM Plex Mono'"}}/></label>
        <Btn onClick={handleProcessFromDb} disabled={loading||reportesPendientes.length===0} bg={loading||reportesPendientes.length===0?'#52525B':'#B91C1C'} color="#121212" style={{width:'100%',padding:12,fontSize:15}}>{loading?'Generando...':'Generar Matriz QA'}</Btn>
      </div>
      )}
      {error&&<div style={{marginTop:24,padding:'16px 24px',background:'#450A0A',borderRadius:12,color:'#FCA5A5',fontSize:14,maxWidth:520}}>⚠️ {error}</div>}
    </div>
  );

  // ── DASHBOARD GERENCIAL ──
  if(page==='gerencial'){
    const LINEAS=['X6S','KP1'];
    const LC={X6S:'#B91C1C',KP1:'#A1A1AA'};
    return(
      <div style={{minHeight:'100vh',padding:24,maxWidth:1500,margin:'0 auto'}}>
        <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:16,flexWrap:'wrap'}}><Btn onClick={()=>setPage('home')}>← Inicio</Btn><h2 style={{fontSize:22,fontWeight:700,color:'#FAFAFA',margin:0}}>Dashboard Gerencial</h2>{gerLoading&&<span style={{fontSize:12,color:'#A1A1AA'}}>Cargando...</span>}</div>

        <div style={{display:'flex',gap:10,alignItems:'end',marginBottom:24,background:'#1F1F23',padding:14,borderRadius:10,border:'1px solid #3F3F46',flexWrap:'wrap'}}>
          <div><label style={{fontSize:10,color:'#A1A1AA',display:'block',marginBottom:4}}>Desde</label><input type="date" value={gerDesde} onChange={e=>{setGerDesde(e.target.value);refetchGerDateRange(e.target.value,gerHasta);}} style={{padding:'7px 10px',borderRadius:6,border:'1px solid #52525B',background:'#121212',color:'#FAFAFA',fontSize:12}}/></div>
          <div><label style={{fontSize:10,color:'#A1A1AA',display:'block',marginBottom:4}}>Hasta</label><input type="date" value={gerHasta} onChange={e=>{setGerHasta(e.target.value);refetchGerDateRange(gerDesde,e.target.value);}} style={{padding:'7px 10px',borderRadius:6,border:'1px solid #52525B',background:'#121212',color:'#FAFAFA',fontSize:12}}/></div>
          <Btn onClick={()=>{const t=todayLocal();setGerDesde(t);setGerHasta(t);refetchGerDateRange(t,t);}} style={{fontSize:11}}>Hoy</Btn>
          <span style={{fontSize:11,color:'#71717A',marginLeft:8}}>Los indicadores WCM y de Scrap se calculan para este rango — independiente del Giro seleccionado abajo</span>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:24}}>
          {LINEAS.map(L=>{
            const g=gerGiroData[L];
            const scrapInRange=(gerScrap[L]||[]).filter(e=>e.fecha>=gerDesde&&e.fecha<=gerHasta);
            const kpi=calcWcmKpisDateRange(gerReportes[L],gerProduccion[L],scrapInRange);
            const scrapStats=computeScrapStats(scrapInRange);
            const kaizen=g?calcKaizenStatus(g.qa_rows,gerPdca[L]):null;
            const df=gerDailyForm[L];
            return(
              <div key={L} style={{background:'#1F1F23',borderRadius:14,padding:20,border:`2px solid ${LC[L]}`}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:8}}>
                  <h3 style={{fontSize:20,fontWeight:700,color:LC[L],margin:0}}>{L}</h3>
                  <select value={g?.id||''} onChange={e=>changeGerGiro(L,e.target.value)} style={{padding:'6px 10px',borderRadius:6,border:'1px solid #52525B',background:'#121212',color:'#FAFAFA',fontSize:12,maxWidth:220}}>
                    {(gerGirosList[L]||[]).length===0&&<option value="">Sin giros</option>}
                    {(gerGirosList[L]||[]).map(gi=><option key={gi.id} value={gi.id}>{gi.name} · {gi.date}</option>)}
                  </select>
                </div>

                {!g?<p style={{color:'#71717A',fontSize:12,marginBottom:12}}>Sin giros cargados para {L} — la parte de voces AA/A/B/C y Kaizen no está disponible, pero los indicadores WCM de abajo sí funcionan (son independientes del Giro).</p>:(<>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(90px,1fr))',gap:8,marginBottom:16}}>
                    <MiniKpi l="Bancos" v={g.bancos_controlados?.toLocaleString()}/>
                    <MiniKpi l="Defectos" v={g.total_defects}/>
                    <MiniKpi l="AA" v={g.summary?.AA} c="#DC2626"/>
                    <MiniKpi l="A" v={g.summary?.A} c="#991B1B"/>
                    <MiniKpi l="B" v={g.summary?.B} c="#71717A"/>
                    <MiniKpi l="C" v={g.summary?.C} c="#D4D4D8"/>
                  </div>
                  {kaizen&&(
                    <div style={{background:'#121212',borderRadius:10,padding:14,border:'1px solid #3F3F46',marginBottom:16}}>
                      <div style={{fontSize:11,color:'#A1A1AA',marginBottom:8,fontWeight:600,textTransform:'uppercase',letterSpacing:1}}>🔄 Estado Proyectos Kaizen (PDCA) — Giro seleccionado</div>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8}}>
                        <MiniKpi l="Plan" v={kaizen.P} c="#A1A1AA"/>
                        <MiniKpi l="Do" v={kaizen.D} c="#B91C1C"/>
                        <MiniKpi l="Check" v={kaizen.C} c="#D4D4D8"/>
                        <MiniKpi l="Act" v={kaizen.A} c="#D4D4D8"/>
                        <MiniKpi l="Sin iniciar" v={kaizen.sinIniciar} c="#52525B"/>
                      </div>
                    </div>
                  )}
                </>)}

                <div style={{fontSize:10,color:'#B91C1C',fontWeight:600,textTransform:'uppercase',letterSpacing:1,marginBottom:10,borderTop:'1px solid #3F3F46',paddingTop:14}}>Indicadores WCM · {gerDesde===gerHasta?gerDesde:`${gerDesde} → ${gerHasta}`}</div>

                <div style={{background:'#121212',borderRadius:10,padding:12,border:'1px dashed #52525B',marginBottom:16}}>
                  <div style={{fontSize:10,color:'#A1A1AA',marginBottom:8,fontWeight:600,textTransform:'uppercase',letterSpacing:0.5}}>Cargar producción diaria</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr auto',gap:6,alignItems:'end'}}>
                    <div><label style={{fontSize:9,color:'#71717A'}}>Fecha</label><input type="date" value={df.fecha} onChange={e=>setGerDailyForm(p=>({...p,[L]:{...p[L],fecha:e.target.value}}))} style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid #52525B',background:'#1F1F23',color:'#FAFAFA',fontSize:11}}/></div>
                    <div><label style={{fontSize:9,color:'#71717A'}}>Piezas Tot.</label><input type="number" value={df.piezasTotales} onChange={e=>setGerDailyForm(p=>({...p,[L]:{...p[L],piezasTotales:e.target.value}}))} style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid #52525B',background:'#1F1F23',color:'#FAFAFA',fontSize:11}}/></div>
                    <div><label style={{fontSize:9,color:'#71717A'}}>Entregadas</label><input type="number" value={df.piezasEntregadas} onChange={e=>setGerDailyForm(p=>({...p,[L]:{...p[L],piezasEntregadas:e.target.value}}))} style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid #52525B',background:'#1F1F23',color:'#FAFAFA',fontSize:11}}/></div>
                    <div><label style={{fontSize:9,color:'#71717A'}}>Bancos</label><input type="number" value={df.bancosControlados} onChange={e=>setGerDailyForm(p=>({...p,[L]:{...p[L],bancosControlados:e.target.value}}))} style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid #52525B',background:'#1F1F23',color:'#FAFAFA',fontSize:11}}/></div>
                    <Btn bg="#B91C1C" color="#121212" onClick={()=>handleSaveProduccionDiaria(L)} style={{padding:'6px 12px',fontSize:11}}>✓</Btn>
                  </div>
                  {kpi&&<p style={{fontSize:9,color:'#71717A',marginTop:8}}>Acumulado del rango: {kpi.pt.toLocaleString()} totales · {kpi.pe.toLocaleString()} entregadas · {kpi.bc.toLocaleString()} bancos</p>}
                </div>

                {kpi?(
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',gap:8,marginBottom:16}}>
                    <WcmCard label="FPY" value={kpi.fpy!=null?`${kpi.fpy.toFixed(1)}%`:'—'} color={kpi.fpy>=95?'#D4D4D8':kpi.fpy>=85?'#71717A':'#DC2626'} sub="Sin retrabajo"/>
                    <WcmCard label="Rework" value={kpi.rework!=null?`${kpi.rework.toFixed(1)}%`:'—'} color={kpi.rework<=5?'#D4D4D8':kpi.rework<=15?'#71717A':'#DC2626'} sub="Retrabajo"/>
                    <WcmCard label="Scrap Rate" value={kpi.scrapQty>0&&kpi.scrapRate!=null?`${kpi.scrapRate.toFixed(1)}%`:'N/D'} color={kpi.scrapQty>0?'#DC2626':'#52525B'} sub={`${kpi.scrapQty} pzs / entregadas`}/>
                    <WcmCard label="Cust. DPPM" value={kpi.dppm!=null?Math.round(kpi.dppm).toLocaleString():'—'} color="#B91C1C" sub="Antena"/>
                    <WcmCard label="Cust. PPM" value={kpi.custPpm!=null?Math.round(kpi.custPpm).toLocaleString():'—'} color="#B91C1C" sub="SCA+TDF+Gtía"/>
                    <WcmCard label="Internal PPM" value={kpi.ippm!=null?Math.round(kpi.ippm).toLocaleString():'—'} color="#A1A1AA" sub="IPPM"/>
                  </div>
                ):<p style={{color:'#DC2626',fontSize:12,marginBottom:16}}>⚠️ Sin producción cargada para este rango en {L} — cargá los datos arriba.</p>}

                {(<>
                  <div style={{background:'#121212',borderRadius:10,padding:14,border:'1px solid #3F3F46'}}>
                    <div style={{fontSize:11,color:'#A1A1AA',marginBottom:8,fontWeight:600,textTransform:'uppercase',letterSpacing:1}}>🗑️ Scrap (USD) — Acumulado</div>
                    <div style={{display:'flex',gap:20,marginBottom:14}}>
                      <div><div style={{fontSize:26,fontWeight:700,color:'#DC2626',fontFamily:"'IBM Plex Mono'"}}>${scrapStats.totalScrapUSD.toLocaleString(undefined,{maximumFractionDigits:0})}</div><div style={{fontSize:10,color:'#71717A'}}>USD</div></div>
                      <div><div style={{fontSize:26,fontWeight:700,color:'#FAFAFA',fontFamily:"'IBM Plex Mono'"}}>{scrapStats.totalScrapQty}</div><div style={{fontSize:10,color:'#71717A'}}>Piezas</div></div>
                    </div>

                    {scrapStats.totalAllUSD>0&&(
                      <div style={{marginBottom:14}}>
                        <div style={{fontSize:10,color:'#A1A1AA',marginBottom:6,fontWeight:600,textTransform:'uppercase',letterSpacing:0.5}}>Destino final del material no conforme (USD)</div>
                        <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>{DESTINOS.map(d=>{const v=scrapStats.porDestino[d]||0;const pct=v/scrapStats.totalAllUSD*100;return v>0?(<span key={d} style={{fontSize:11,color:'#FAFAFA'}}><span style={{display:'inline-block',width:8,height:8,borderRadius:2,background:DESTINO_COLORS[d],marginRight:5}}/>{d}: ${v.toFixed(0)} ({pct.toFixed(1)}%)</span>):null;})}</div>
                      </div>
                    )}

                    {scrapStats.top5USD.length>0&&(<div style={{marginBottom:14}}>
                      <div style={{fontSize:10,color:'#B91C1C',marginBottom:6,fontWeight:600,textTransform:'uppercase',letterSpacing:0.5}}>Scrap (USD) — Top 5</div>
                      {scrapStats.top5USD.map(([name,v],i)=>{const max=scrapStats.top5USD[0][1].usd;return(<div key={i} style={{marginBottom:6}}><div style={{fontSize:10,color:'#E4E4E7',marginBottom:2}}>{name}</div><div style={{display:'flex',alignItems:'center',gap:6}}><div style={{flex:1,height:10,background:'#3F3F46',borderRadius:2}}><div style={{height:'100%',width:`${v.usd/max*100}%`,background:'#DC2626',borderRadius:2}}/></div><span style={{fontSize:10,fontWeight:700,color:'#FAFAFA',fontFamily:"'IBM Plex Mono'",minWidth:44,textAlign:'right'}}>${v.usd.toFixed(0)}</span></div></div>);})}
                    </div>)}

                    {scrapStats.top5Qty.length>0&&(<div style={{marginBottom:14}}>
                      <div style={{fontSize:10,color:'#A1A1AA',marginBottom:6,fontWeight:600,textTransform:'uppercase',letterSpacing:0.5}}>Scrap (Cantidad) — Top 5</div>
                      {scrapStats.top5Qty.map(([name,v],i)=>{const max=scrapStats.top5Qty[0][1].qty;return(<div key={i} style={{marginBottom:6}}><div style={{fontSize:10,color:'#E4E4E7',marginBottom:2}}>{name}</div><div style={{display:'flex',alignItems:'center',gap:6}}><div style={{flex:1,height:10,background:'#3F3F46',borderRadius:2}}><div style={{height:'100%',width:`${v.qty/max*100}%`,background:'#A1A1AA',borderRadius:2}}/></div><span style={{fontSize:10,fontWeight:700,color:'#FAFAFA',fontFamily:"'IBM Plex Mono'",minWidth:30,textAlign:'right'}}>{v.qty}</span></div></div>);})}
                    </div>)}

                    {scrapStats.modoFallaUSD.length>0&&(<div style={{marginBottom:14}}>
                      <div style={{fontSize:10,color:'#B91C1C',marginBottom:6,fontWeight:600,textTransform:'uppercase',letterSpacing:0.5}}>Modo de falla — más impacto (USD)</div>
                      {scrapStats.modoFallaUSD.map(([name,v],i)=>{const max=scrapStats.modoFallaUSD[0][1].usd;return(<div key={i} style={{marginBottom:5}}><div style={{fontSize:10,color:'#E4E4E7',marginBottom:2}}>{name}</div><div style={{display:'flex',alignItems:'center',gap:6}}><div style={{flex:1,height:8,background:'#3F3F46',borderRadius:2}}><div style={{height:'100%',width:`${v.usd/max*100}%`,background:'#991B1B',borderRadius:2}}/></div><span style={{fontSize:9,fontWeight:700,color:'#FAFAFA',fontFamily:"'IBM Plex Mono'",minWidth:40,textAlign:'right'}}>${v.usd.toFixed(0)}</span></div></div>);})}
                    </div>)}

                    {scrapStats.modoFallaQty.length>0&&(<div style={{marginBottom:14}}>
                      <div style={{fontSize:10,color:'#A1A1AA',marginBottom:6,fontWeight:600,textTransform:'uppercase',letterSpacing:0.5}}>Modo de falla — más impacto (Cantidad)</div>
                      {scrapStats.modoFallaQty.map(([name,v],i)=>{const max=scrapStats.modoFallaQty[0][1].qty;return(<div key={i} style={{marginBottom:5}}><div style={{fontSize:10,color:'#E4E4E7',marginBottom:2}}>{name}</div><div style={{display:'flex',alignItems:'center',gap:6}}><div style={{flex:1,height:8,background:'#3F3F46',borderRadius:2}}><div style={{height:'100%',width:`${v.qty/max*100}%`,background:'#71717A',borderRadius:2}}/></div><span style={{fontSize:9,fontWeight:700,color:'#FAFAFA',fontFamily:"'IBM Plex Mono'",minWidth:26,textAlign:'right'}}>{v.qty}</span></div></div>);})}
                    </div>)}

                    {scrapStats.trend.length>0&&(<div>
                      <div style={{fontSize:10,color:'#B91C1C',marginBottom:6,fontWeight:600,textTransform:'uppercase',letterSpacing:0.5}}>Scrap Total por día (USD)</div>
                      <div style={{display:'flex',gap:5,alignItems:'end',height:80,overflowX:'auto'}}>
                        {scrapStats.trend.map(([d,v],i)=>{const max=Math.max(...scrapStats.trend.map(t=>t[1]));return(<div key={i} title={`${d}: $${v.toFixed(0)}`} style={{display:'flex',flexDirection:'column',alignItems:'center',minWidth:28}}><span style={{fontSize:8,color:'#A1A1AA',marginBottom:2}}>${v.toFixed(0)}</span><div style={{width:16,height:`${Math.max(v/max*54,4)}px`,background:'#DC2626',borderRadius:'2px 2px 0 0'}}/><span style={{fontSize:7,color:'#71717A',marginTop:2}}>{d.slice(5)}</span></div>);})}
                      </div>
                    </div>)}

                    {scrapStats.totalAllUSD===0&&<p style={{fontSize:11,color:'#52525B',textAlign:'center',padding:10}}>Sin eventos de scrap para {L}</p>}
                  </div>
                </>)}
              </div>
            );
          })}
        </div>

        {(()=>{
          const scrapX=(gerScrap.X6S||[]).filter(e=>e.fecha>=gerDesde&&e.fecha<=gerHasta);
          const scrapK=(gerScrap.KP1||[]).filter(e=>e.fecha>=gerDesde&&e.fecha<=gerHasta);
          const kx=calcWcmKpisDateRange(gerReportes.X6S,gerProduccion.X6S,scrapX);
          const kk=calcWcmKpisDateRange(gerReportes.KP1,gerProduccion.KP1,scrapK);
          if(!kx||!kk)return null;
          return(
          <div style={{background:'#1F1F23',borderRadius:14,padding:20,border:'1px solid #3F3F46'}}>
            <h3 style={{fontSize:14,fontWeight:600,color:'#B91C1C',marginBottom:16,textTransform:'uppercase',letterSpacing:1}}>Comparativa X6S vs KP1 — {gerDesde===gerHasta?gerDesde:`${gerDesde} → ${gerHasta}`}</h3>
            {['fpy','rework'].map(metric=>{
              const label=metric==='fpy'?'FPY (First Pass Yield)':'Rework Rate';
              const max=Math.max(kx[metric]||0,kk[metric]||0,1);
              return(
                <div key={metric} style={{marginBottom:14}}>
                  <div style={{fontSize:12,color:'#A1A1AA',marginBottom:6}}>{label}</div>
                  {[['X6S',kx[metric],LC.X6S],['KP1',kk[metric],LC.KP1]].map(([name,val,color])=>(
                    <div key={name} style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
                      <span style={{width:36,fontSize:12,color:'#A1A1AA',fontWeight:600}}>{name}</span>
                      <div style={{flex:1,height:16,background:'#121212',borderRadius:4}}><div style={{height:'100%',width:`${(val||0)/max*100}%`,background:color,borderRadius:4}}/></div>
                      <span style={{width:56,fontSize:12,fontWeight:700,color,fontFamily:"'IBM Plex Mono'",textAlign:'right'}}>{val!=null?`${val.toFixed(1)}%`:'—'}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          );
        })()}
      </div>
    );
  }

  // ── CATÁLOGOS ──
  if(page==='catalogos')return(
    <div style={{minHeight:'100vh',padding:24,maxWidth:1000,margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:24}}><Btn onClick={()=>setPage('home')}>← Inicio</Btn><h2 style={{fontSize:22,fontWeight:700,color:'#FAFAFA',margin:0}}>Catálogos — {linea}</h2></div>
      <p style={{fontSize:12,color:'#71717A',marginBottom:20}}>Estos catálogos alimentan el Módulo de Carga de Defectos (kiosco) para la línea {linea}.</p>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:20}}>
        <div style={{background:'#1F1F23',borderRadius:12,padding:16,border:'1px solid #3F3F46'}}>
          <h3 style={{fontSize:13,fontWeight:600,color:'#B91C1C',marginBottom:12,textTransform:'uppercase',letterSpacing:1}}>Tipos de Asiento</h3>
          <div style={{display:'flex',gap:8,marginBottom:12}}><input value={newTipoAsiento} onChange={e=>setNewTipoAsiento(e.target.value)} placeholder="Ej: Delantero" style={{flex:1,padding:'7px 10px',borderRadius:6,border:'1px solid #52525B',background:'#121212',color:'#FAFAFA',fontSize:13}}/><Btn bg="#B91C1C" color="#121212" onClick={handleAddTipoAsiento}>+</Btn></div>
          {tiposAsientoAdmin.map(t=>(<div key={t.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid #3F3F46'}}><span style={{fontSize:13,color:'#FAFAFA'}}>{t.nombre}</span><button onClick={()=>handleDeleteTipoAsiento(t.id)} style={{background:'none',border:'none',color:'#450A0A',cursor:'pointer'}}>🗑️</button></div>))}
          {tiposAsientoAdmin.length===0&&<p style={{fontSize:12,color:'#52525B'}}>Sin datos</p>}
        </div>

        <div style={{background:'#1F1F23',borderRadius:12,padding:16,border:'1px solid #3F3F46'}}>
          <h3 style={{fontSize:13,fontWeight:600,color:'#B91C1C',marginBottom:12,textTransform:'uppercase',letterSpacing:1}}>Modelos</h3>
          <div style={{display:'flex',gap:8,marginBottom:12}}><input value={newModelo} onChange={e=>setNewModelo(e.target.value)} placeholder="Ej: Drive" style={{flex:1,padding:'7px 10px',borderRadius:6,border:'1px solid #52525B',background:'#121212',color:'#FAFAFA',fontSize:13}}/><Btn bg="#B91C1C" color="#121212" onClick={handleAddModelo}>+</Btn></div>
          {modelosAdmin.map(m=>(<div key={m.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid #3F3F46'}}><span style={{fontSize:13,color:'#FAFAFA'}}>{m.nombre}</span><button onClick={()=>handleDeleteModelo(m.id)} style={{background:'none',border:'none',color:'#450A0A',cursor:'pointer'}}>🗑️</button></div>))}
          {modelosAdmin.length===0&&<p style={{fontSize:12,color:'#52525B'}}>Sin datos</p>}
        </div>
      </div>

      <div style={{background:'#1F1F23',borderRadius:12,padding:16,border:'1px solid #3F3F46',marginBottom:20}}>
        <h3 style={{fontSize:13,fontWeight:600,color:'#B91C1C',marginBottom:12,textTransform:'uppercase',letterSpacing:1}}>Partes de Asiento (Respaldo/Asiento, por Tipo de Asiento)</h3>
        <p style={{fontSize:11,color:'#71717A',marginBottom:10}}>Ej: Delantero → "Respaldo", "Asiento". Trasero Bipartido → "Respaldo 60%", "Respaldo 40%", "Asiento 60%", "Asiento 40%".</p>
        <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
          <select value={newParteAsiento.tipoAsiento} onChange={e=>setNewParteAsiento(p=>({...p,tipoAsiento:e.target.value}))} style={{padding:'7px 10px',borderRadius:6,border:'1px solid #52525B',background:'#121212',color:'#FAFAFA',fontSize:13}}><option value="">Tipo de asiento...</option>{tiposAsientoAdmin.map(t=><option key={t.id} value={t.nombre}>{t.nombre}</option>)}</select>
          <input value={newParteAsiento.nombre} onChange={e=>setNewParteAsiento(p=>({...p,nombre:e.target.value}))} placeholder="Ej: Respaldo 60%" style={{flex:1,minWidth:140,padding:'7px 10px',borderRadius:6,border:'1px solid #52525B',background:'#121212',color:'#FAFAFA',fontSize:13}}/>
          <Btn bg="#B91C1C" color="#121212" onClick={handleAddParteAsiento}>+</Btn>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:8}}>
          {tiposAsientoAdmin.map(t=>{
            const list=partesAsientoAdmin.filter(p=>p.tipo_asiento===t.nombre);
            if(list.length===0)return null;
            return(<div key={t.id} style={{background:'#121212',borderRadius:8,padding:10,border:'1px solid #3F3F46'}}>
              <div style={{fontSize:11,color:'#A1A1AA',marginBottom:6,fontWeight:600}}>{t.nombre}</div>
              {list.map(p=>(<div key={p.id} style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'3px 0'}}><span style={{color:'#FAFAFA'}}>{p.nombre}</span><button onClick={()=>handleDeleteParteAsiento(p.id)} style={{background:'none',border:'none',color:'#450A0A',cursor:'pointer',fontSize:11}}>✕</button></div>))}
            </div>);
          })}
        </div>
        {partesAsientoAdmin.length===0&&<p style={{fontSize:12,color:'#52525B'}}>Sin datos — sin esto, los Cuadrantes no van a tener de qué depender.</p>}
      </div>

      <div style={{background:'#1F1F23',borderRadius:12,padding:16,border:'1px solid #3F3F46'}}>
        <h3 style={{fontSize:13,fontWeight:600,color:'#B91C1C',marginBottom:12,textTransform:'uppercase',letterSpacing:1}}>Cuadrantes (por Tipo de Asiento + Respaldo/Asiento)</h3>
        <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
          <select value={newCuadrante.tipoAsiento} onChange={e=>setNewCuadrante(p=>({...p,tipoAsiento:e.target.value,parteAsiento:''}))} style={{padding:'7px 10px',borderRadius:6,border:'1px solid #52525B',background:'#121212',color:'#FAFAFA',fontSize:13}}><option value="">Tipo de asiento...</option>{tiposAsientoAdmin.map(t=><option key={t.id} value={t.nombre}>{t.nombre}</option>)}</select>
          <select value={newCuadrante.parteAsiento} onChange={e=>setNewCuadrante(p=>({...p,parteAsiento:e.target.value}))} disabled={!newCuadrante.tipoAsiento} style={{padding:'7px 10px',borderRadius:6,border:'1px solid #52525B',background:'#121212',color:'#FAFAFA',fontSize:13,opacity:newCuadrante.tipoAsiento?1:0.5}}><option value="">Respaldo/Asiento...</option>{partesAsientoAdmin.filter(p=>p.tipo_asiento===newCuadrante.tipoAsiento).map(p=><option key={p.id} value={p.nombre}>{p.nombre}</option>)}</select>
          <input value={newCuadrante.nombre} onChange={e=>setNewCuadrante(p=>({...p,nombre:e.target.value}))} placeholder="Ej: F2" style={{flex:1,minWidth:120,padding:'7px 10px',borderRadius:6,border:'1px solid #52525B',background:'#121212',color:'#FAFAFA',fontSize:13}}/>
          <Btn bg="#B91C1C" color="#121212" onClick={handleAddCuadrante}>+</Btn>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:8}}>
          {tiposAsientoAdmin.flatMap(t=>partesAsientoAdmin.filter(p=>p.tipo_asiento===t.nombre).map(p=>({t,pa:p.nombre}))).map(({t,pa})=>{
            const list=cuadrantesAdmin.filter(c=>c.tipo_asiento===t.nombre&&c.parte_asiento===pa);
            if(list.length===0)return null;
            return(<div key={`${t.id}-${pa}`} style={{background:'#121212',borderRadius:8,padding:10,border:'1px solid #3F3F46'}}>
              <div style={{fontSize:11,color:'#A1A1AA',marginBottom:6,fontWeight:600}}>{t.nombre} · {pa}</div>
              {list.map(c=>(<div key={c.id} style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'3px 0'}}><span style={{color:'#FAFAFA'}}>{c.nombre}</span><button onClick={()=>handleDeleteCuadrante(c.id)} style={{background:'none',border:'none',color:'#450A0A',cursor:'pointer',fontSize:11}}>✕</button></div>))}
            </div>);
          })}
        </div>
      </div>
    </div>
  );

  // ── DEFECTOS ──
  if(page==='defectos'){const filtered=defSearch?defectos.filter(d=>d.nombre.toLowerCase().includes(defSearch.toLowerCase())):defectos;return(
    <div style={{minHeight:'100vh',padding:24,maxWidth:1100,margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24,flexWrap:'wrap',gap:12}}>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>{result?<Btn onClick={()=>setPage('matrix')}>← Matriz</Btn>:<Btn onClick={()=>setPage('home')}>← Inicio</Btn>}{result&&<span style={{fontSize:11,color:'#B91C1C',fontWeight:600}}>Giro activo: {giroName}</span>}</div>
        <h2 style={{fontSize:22,fontWeight:700,color:'#FAFAFA',margin:0}}>Defectos {linea} ({defectos.length})</h2>
        <div style={{display:'flex',gap:8}}><Btn bg="#B91C1C" color="#121212" onClick={()=>setEditDef({nombre:'',severidad:3,costo_interno:1,costo_externo:4})}>+ Nuevo</Btn><Btn onClick={()=>defFileRef.current?.click()}>📤 Cargar Excel</Btn><Btn onClick={handleDownloadDefectos} bg="#D4D4D8" color="#FAFAFA">📥 Descargar</Btn><input ref={defFileRef} type="file" accept=".xlsx,.xls,.csv" onChange={e=>{if(e.target.files[0])handleUploadDefectos(e.target.files[0]);e.target.value='';}} style={{display:'none'}}/></div>
      </div>
      <p style={{fontSize:12,color:'#71717A',marginBottom:16}}>Excel: A=Nombre, B=Severidad, C=Costo Interno, D=Costo Externo (fila 1=encabezado)</p>
      <input placeholder="Buscar defecto..." value={defSearch} onChange={e=>setDefSearch(e.target.value)} style={{width:'100%',padding:'10px 14px',borderRadius:8,border:'1px solid #52525B',background:'#1F1F23',color:'#FAFAFA',fontSize:14,marginBottom:16}}/>
      {editDef&&<div style={{background:'#1F1F23',borderRadius:12,padding:20,marginBottom:16,border:'2px solid #B91C1C'}}><div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr auto',gap:10,alignItems:'end'}}>
        <div><label style={{fontSize:11,color:'#A1A1AA'}}>Nombre</label><input value={editDef.nombre} onChange={e=>setEditDef(p=>({...p,nombre:e.target.value}))} style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #52525B',background:'#121212',color:'#FAFAFA',fontSize:13}}/></div>
        <div><label style={{fontSize:11,color:'#A1A1AA'}}>Severidad</label><input type="number" min="1" max="10" value={editDef.severidad} onChange={e=>setEditDef(p=>({...p,severidad:parseInt(e.target.value)||3}))} style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #52525B',background:'#121212',color:'#FAFAFA',fontSize:13}}/></div>
        <div><label style={{fontSize:11,color:'#A1A1AA'}}>C.Int</label><input type="number" min="1" value={editDef.costo_interno} onChange={e=>setEditDef(p=>({...p,costo_interno:parseInt(e.target.value)||1}))} style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #52525B',background:'#121212',color:'#FAFAFA',fontSize:13}}/></div>
        <div><label style={{fontSize:11,color:'#A1A1AA'}}>C.Ext</label><input type="number" min="1" value={editDef.costo_externo} onChange={e=>setEditDef(p=>({...p,costo_externo:parseInt(e.target.value)||4}))} style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #52525B',background:'#121212',color:'#FAFAFA',fontSize:13}}/></div>
        <div style={{display:'flex',gap:6}}><Btn bg="#D4D4D8" onClick={()=>handleSaveDef(editDef)}>✓</Btn><Btn onClick={()=>setEditDef(null)}>✕</Btn></div>
      </div></div>}
      <div style={{overflowX:'auto',borderRadius:12,border:'1px solid #3F3F46'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr style={{background:'#1F1F23'}}><th style={{...th,textAlign:'left',minWidth:280}}>Defecto</th><th style={th}>Sev</th><th style={th}>C.Int</th><th style={th}>C.Ext</th><th style={th}>Ocurr.</th><th style={th}>Acciones</th></tr></thead><tbody>
        {filtered.map((d,i)=>{const occ=occurrenceMap[d.nombre]||0;return(<tr key={d.id} style={{background:i%2===0?'#121212':'#18181B',borderBottom:'1px solid #1F1F23'}}><td style={{...td,textAlign:'left',fontSize:13}}>{d.nombre}</td><td style={td}>{d.severidad}</td><td style={td}>{d.costo_interno}</td><td style={td}>{d.costo_externo}</td><td style={{...td,fontWeight:occ>0?700:400,color:occ>0?'#B91C1C':'#52525B'}}>{occ}</td><td style={td}><div style={{display:'flex',gap:4,justifyContent:'center'}}><Btn onClick={()=>setEditDef({...d})} style={{padding:'4px 10px',fontSize:11}}>✏️</Btn><Btn onClick={()=>handleDeleteDef(d.id)} bg="#450A0A" style={{padding:'4px 10px',fontSize:11}}>🗑️</Btn></div></td></tr>);})}
      </tbody></table></div>
    </div>
  );}

  // ── HISTORY ──
  if(page==='history')return(
    <div style={{minHeight:'100vh',padding:24,maxWidth:900,margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:24}}><Btn onClick={()=>setPage('home')}>← Inicio</Btn><h2 style={{fontSize:22,fontWeight:700,color:'#FAFAFA',margin:0}}>Historial — {linea}</h2></div>
      {giros.length===0?<p style={{color:'#71717A',textAlign:'center',padding:40}}>No hay giros guardados para {linea}</p>:
      <div style={{display:'grid',gap:12}}>{giros.map(g=>(
        <div key={g.id} onClick={()=>loadGiro(g.id)} style={{background:'#1F1F23',borderRadius:12,padding:'16px 20px',border:'1px solid #3F3F46',cursor:'pointer',transition:'border-color .2s'}} onMouseEnter={e=>e.currentTarget.style.borderColor='#B91C1C'} onMouseLeave={e=>e.currentTarget.style.borderColor='#3F3F46'}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><div><div style={{fontWeight:600,color:'#FAFAFA',fontSize:16}}>{g.name}</div><div style={{color:'#71717A',fontSize:12,marginTop:2}}>{g.date} · {g.bancos_controlados?.toLocaleString()} bancos · {g.total_defects} defectos</div></div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>{g.summary&&Object.entries(g.summary).map(([k,v])=><span key={k} style={{padding:'2px 8px',borderRadius:4,fontSize:11,fontWeight:700,background:VC[k],color:'#FAFAFA'}}>{k}:{v}</span>)}<button onClick={e=>handleDeleteGiro(g.id,e)} style={{padding:'6px 10px',background:'#450A0A',color:'#FCA5A5',border:'none',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:600,marginLeft:8}}>🗑️</button></div></div>
        </div>
      ))}</div>}
    </div>
  );

  // ── SCRAP ──
  if(page==='scrap')return(
    <div style={{minHeight:'100vh',padding:24,maxWidth:1400,margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20,flexWrap:'wrap',gap:12}}>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>{result?<Btn onClick={()=>setPage('matrix')}>← Matriz</Btn>:<Btn onClick={()=>setPage('home')}>← Inicio</Btn>}<h2 style={{fontSize:22,fontWeight:700,color:'#FAFAFA',margin:0}}>Scrap — {linea}</h2></div>
        <Btn bg="#B91C1C" color="#121212" onClick={()=>openScrapForm({giroId})}>+ Registrar evento</Btn>
      </div>

      {scrapForm&&(
        <div style={{background:'#1F1F23',borderRadius:12,padding:20,marginBottom:20,border:'2px solid #B91C1C'}}>
          <h3 style={{fontSize:14,fontWeight:600,color:'#B91C1C',marginBottom:14,textTransform:'uppercase',letterSpacing:1}}>Nuevo registro de resolución</h3>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12,marginBottom:14}}>
            <div><label style={{fontSize:11,color:'#B91C1C',display:'block',marginBottom:4}}>Componente *</label><select value={scrapForm.componente} onChange={e=>setScrapForm(p=>({...p,componente:e.target.value,defectoParte:''}))} style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #B91C1C',background:'#121212',color:'#FAFAFA',fontSize:13}}><option value="">Seleccionar...</option>{componentesUnicos.map(c=><option key={c} value={c}>{c}</option>)}</select>{componentesUnicos.length===0&&<span style={{fontSize:10,color:'#DC2626',display:'block',marginTop:3}}>Sin defectos cargados para {linea}</span>}</div>
            <div><label style={{fontSize:11,color:'#B91C1C',display:'block',marginBottom:4}}>Defecto *</label><select value={scrapForm.defectoParte} onChange={e=>setScrapForm(p=>({...p,defectoParte:e.target.value}))} disabled={!scrapForm.componente} style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #B91C1C',background:scrapForm.componente?'#121212':'#1F1F23',color:'#FAFAFA',fontSize:13,opacity:scrapForm.componente?1:0.5}}><option value="">Seleccionar...</option>{defectosPorComponente(scrapForm.componente).map(d=><option key={d.id} value={d.defectoParte}>{d.defectoParte}</option>)}</select></div>
            <div><label style={{fontSize:11,color:'#A1A1AA',display:'block',marginBottom:4}}>Fecha</label><input type="date" value={scrapForm.fecha} onChange={e=>setScrapForm(p=>({...p,fecha:e.target.value}))} style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #52525B',background:'#121212',color:'#FAFAFA',fontSize:13}}/></div>
            <div><label style={{fontSize:11,color:'#A1A1AA',display:'block',marginBottom:4}}>Turno</label><select value={scrapForm.turno} onChange={e=>setScrapForm(p=>({...p,turno:e.target.value}))} style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #52525B',background:'#121212',color:'#FAFAFA',fontSize:13}}>{TURNOS.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
            <div><label style={{fontSize:11,color:'#A1A1AA',display:'block',marginBottom:4}}>Origen</label><select value={scrapForm.origen} onChange={e=>setScrapForm(p=>({...p,origen:e.target.value}))} style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #52525B',background:'#121212',color:'#FAFAFA',fontSize:13}}>{ORIGENES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
            <div><label style={{fontSize:11,color:'#A1A1AA',display:'block',marginBottom:4}}>Destino final *</label><select value={scrapForm.destino} onChange={e=>setScrapForm(p=>({...p,destino:e.target.value}))} style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #52525B',background:'#121212',color:'#FAFAFA',fontSize:13}}>{DESTINOS.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
            <div><label style={{fontSize:11,color:'#A1A1AA',display:'block',marginBottom:4}}>Tipo material</label><select value={scrapForm.tipoMaterial} onChange={e=>setScrapForm(p=>({...p,tipoMaterial:e.target.value}))} style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #52525B',background:'#121212',color:'#FAFAFA',fontSize:13}}>{TIPOS_MATERIAL.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
            <div><label style={{fontSize:11,color:'#A1A1AA',display:'block',marginBottom:4}}>Cantidad *</label><input type="number" min="1" value={scrapForm.cantidad} onChange={e=>setScrapForm(p=>({...p,cantidad:e.target.value}))} style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #52525B',background:'#121212',color:'#FAFAFA',fontSize:13,fontFamily:"'IBM Plex Mono'"}}/></div>
            <div><label style={{fontSize:11,color:'#B91C1C',display:'block',marginBottom:4}}>Costo unitario (USD) *</label><input type="number" min="0" step="0.01" value={scrapForm.costoUnitario} onChange={e=>setScrapForm(p=>({...p,costoUnitario:e.target.value}))} placeholder="Ej: 12.50" style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #B91C1C',background:'#121212',color:'#FAFAFA',fontSize:13,fontFamily:"'IBM Plex Mono'"}}/></div>
          </div>
          {scrapForm.giroId&&<div style={{fontSize:11,color:'#D4D4D8',marginBottom:10}}>✓ Vinculado a un Giro de QA {scrapForm.vozNum?`· Voz #${scrapForm.vozNum}`:''} — este defecto ya cuenta como reportado, no se duplica en la Matriz</div>}
          {!scrapForm.giroId&&<div style={{fontSize:11,color:'#71717A',marginBottom:10}}>Sin vincular a un Giro — solo aparecerá en este dashboard de Scrap</div>}
          <label style={{display:'block',marginBottom:14}}><span style={{fontSize:11,color:'#A1A1AA',display:'block',marginBottom:4}}>Notas</span><textarea value={scrapForm.notas} onChange={e=>setScrapForm(p=>({...p,notas:e.target.value}))} rows={2} style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #52525B',background:'#121212',color:'#FAFAFA',fontSize:13,resize:'vertical',fontFamily:'inherit'}}/></label>
          <div style={{display:'flex',gap:8}}><Btn bg="#D4D4D8" onClick={handleSaveScrap}>✓ Guardar</Btn><Btn onClick={()=>setScrapForm(null)}>Cancelar</Btn></div>
        </div>
      )}

      {/* Filters */}
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'end',marginBottom:20,background:'#1F1F23',padding:14,borderRadius:10,border:'1px solid #3F3F46'}}>
        <div><label style={{fontSize:10,color:'#A1A1AA',display:'block',marginBottom:4}}>Desde</label><input type="date" value={scrapFilters.desde} onChange={e=>setScrapFilters(p=>({...p,desde:e.target.value}))} style={{padding:'6px 10px',borderRadius:6,border:'1px solid #52525B',background:'#121212',color:'#FAFAFA',fontSize:12}}/></div>
        <div><label style={{fontSize:10,color:'#A1A1AA',display:'block',marginBottom:4}}>Hasta</label><input type="date" value={scrapFilters.hasta} onChange={e=>setScrapFilters(p=>({...p,hasta:e.target.value}))} style={{padding:'6px 10px',borderRadius:6,border:'1px solid #52525B',background:'#121212',color:'#FAFAFA',fontSize:12}}/></div>
        <div><label style={{fontSize:10,color:'#A1A1AA',display:'block',marginBottom:4}}>Turno</label><select value={scrapFilters.turno} onChange={e=>setScrapFilters(p=>({...p,turno:e.target.value}))} style={{padding:'6px 10px',borderRadius:6,border:'1px solid #52525B',background:'#121212',color:'#FAFAFA',fontSize:12}}><option value="ALL">Todos</option>{TURNOS.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
        <div><label style={{fontSize:10,color:'#A1A1AA',display:'block',marginBottom:4}}>Origen</label><select value={scrapFilters.origen} onChange={e=>setScrapFilters(p=>({...p,origen:e.target.value}))} style={{padding:'6px 10px',borderRadius:6,border:'1px solid #52525B',background:'#121212',color:'#FAFAFA',fontSize:12}}><option value="ALL">Todos</option>{ORIGENES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
        <div><label style={{fontSize:10,color:'#A1A1AA',display:'block',marginBottom:4}}>Tipo material</label><select value={scrapFilters.tipoMaterial} onChange={e=>setScrapFilters(p=>({...p,tipoMaterial:e.target.value}))} style={{padding:'6px 10px',borderRadius:6,border:'1px solid #52525B',background:'#121212',color:'#FAFAFA',fontSize:12}}><option value="ALL">Todos</option>{TIPOS_MATERIAL.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
        {(scrapFilters.desde||scrapFilters.hasta||scrapFilters.turno!=='ALL'||scrapFilters.origen!=='ALL'||scrapFilters.tipoMaterial!=='ALL')&&<Btn onClick={()=>setScrapFilters({desde:'',hasta:'',turno:'ALL',origen:'ALL',tipoMaterial:'ALL'})} style={{fontSize:11}}>Limpiar filtros</Btn>}
      </div>

      {/* Summary cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:20}}>
        <div style={{background:'#1F1F23',borderRadius:12,padding:16,border:'1px solid #3F3F46'}}><div style={{fontSize:11,color:'#A1A1AA',marginBottom:6}}>🗑️ Scrap (USD) — Acumulado</div><div style={{fontSize:28,fontWeight:700,color:'#DC2626',fontFamily:"'IBM Plex Mono'"}}>${scrapDashboard.totalScrapUSD.toLocaleString(undefined,{maximumFractionDigits:0})}</div></div>
        <div style={{background:'#1F1F23',borderRadius:12,padding:16,border:'1px solid #3F3F46'}}><div style={{fontSize:11,color:'#A1A1AA',marginBottom:6}}>📦 Scrap (Cantidad)</div><div style={{fontSize:28,fontWeight:700,color:'#FAFAFA',fontFamily:"'IBM Plex Mono'"}}>{scrapDashboard.totalScrapQty.toLocaleString()}</div></div>
        <div style={{background:'#1F1F23',borderRadius:12,padding:16,border:'1px solid #3F3F46',gridColumn:'span 2'}}>
          <div style={{fontSize:11,color:'#A1A1AA',marginBottom:8}}>Destino final del material no conforme (USD)</div>
          <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>{DESTINOS.map(d=>{const v=scrapDashboard.porDestino[d]||0;const pct=scrapDashboard.totalAllUSD>0?(v/scrapDashboard.totalAllUSD*100):0;return v>0?(<div key={d} style={{display:'flex',alignItems:'center',gap:6}}><span style={{width:10,height:10,borderRadius:2,background:DESTINO_COLORS[d]}}/><span style={{fontSize:12,color:'#FAFAFA'}}>{d}: ${v.toFixed(0)} ({pct.toFixed(1)}%)</span></div>):null;})}</div>
        </div>
      </div>

      {/* Top 5 tables */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:20}}>
        <div style={{background:'#1F1F23',borderRadius:12,padding:16,border:'1px solid #3F3F46'}}>
          <h4 style={{fontSize:12,fontWeight:600,color:'#B91C1C',marginBottom:10,textTransform:'uppercase',letterSpacing:1}}>Scrap (USD) — Top 5</h4>
          {scrapDashboard.top5USD.length===0?<p style={{color:'#52525B',fontSize:12}}>Sin datos</p>:scrapDashboard.top5USD.map(([name,v],i)=>{const max=scrapDashboard.top5USD[0][1].usd;return(<div key={i} style={{marginBottom:8}}><div style={{fontSize:11,color:'#E4E4E7',marginBottom:3}}>{name}</div><div style={{display:'flex',alignItems:'center',gap:6}}><div style={{flex:1,height:14,background:'#3F3F46',borderRadius:3}}><div style={{height:'100%',width:`${v.usd/max*100}%`,background:'#DC2626',borderRadius:3}}/></div><span style={{fontSize:11,fontWeight:700,color:'#FAFAFA',fontFamily:"'IBM Plex Mono'",minWidth:50,textAlign:'right'}}>${v.usd.toFixed(0)}</span></div></div>);})}
        </div>
        <div style={{background:'#1F1F23',borderRadius:12,padding:16,border:'1px solid #3F3F46'}}>
          <h4 style={{fontSize:12,fontWeight:600,color:'#A1A1AA',marginBottom:10,textTransform:'uppercase',letterSpacing:1}}>Scrap (Cantidad) — Top 5</h4>
          {scrapDashboard.top5Qty.length===0?<p style={{color:'#52525B',fontSize:12}}>Sin datos</p>:scrapDashboard.top5Qty.map(([name,v],i)=>{const max=scrapDashboard.top5Qty[0][1].qty;return(<div key={i} style={{marginBottom:8}}><div style={{fontSize:11,color:'#E4E4E7',marginBottom:3}}>{name}</div><div style={{display:'flex',alignItems:'center',gap:6}}><div style={{flex:1,height:14,background:'#3F3F46',borderRadius:3}}><div style={{height:'100%',width:`${v.qty/max*100}%`,background:'#A1A1AA',borderRadius:3}}/></div><span style={{fontSize:11,fontWeight:700,color:'#FAFAFA',fontFamily:"'IBM Plex Mono'",minWidth:36,textAlign:'right'}}>{v.qty}</span></div></div>);})}
        </div>
      </div>

      {/* Modo de falla */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:20}}>
        <div style={{background:'#1F1F23',borderRadius:12,padding:16,border:'1px solid #3F3F46'}}>
          <h4 style={{fontSize:12,fontWeight:600,color:'#B91C1C',marginBottom:10,textTransform:'uppercase',letterSpacing:1}}>Modo de falla — más impacto (USD)</h4>
          {scrapDashboard.modoFallaUSD.length===0?<p style={{color:'#52525B',fontSize:12}}>Sin datos</p>:scrapDashboard.modoFallaUSD.map(([name,v],i)=>{const max=scrapDashboard.modoFallaUSD[0][1].usd;return(<div key={i} style={{marginBottom:7}}><div style={{fontSize:11,color:'#E4E4E7',marginBottom:2}}>{name}</div><div style={{display:'flex',alignItems:'center',gap:6}}><div style={{flex:1,height:10,background:'#3F3F46',borderRadius:2}}><div style={{height:'100%',width:`${v.usd/max*100}%`,background:'#991B1B',borderRadius:2}}/></div><span style={{fontSize:10,fontWeight:700,color:'#FAFAFA',fontFamily:"'IBM Plex Mono'",minWidth:44,textAlign:'right'}}>${v.usd.toFixed(0)}</span></div></div>);})}
        </div>
        <div style={{background:'#1F1F23',borderRadius:12,padding:16,border:'1px solid #3F3F46'}}>
          <h4 style={{fontSize:12,fontWeight:600,color:'#A1A1AA',marginBottom:10,textTransform:'uppercase',letterSpacing:1}}>Modo de falla — más impacto (Cantidad)</h4>
          {scrapDashboard.modoFallaQty.length===0?<p style={{color:'#52525B',fontSize:12}}>Sin datos</p>:scrapDashboard.modoFallaQty.map(([name,v],i)=>{const max=scrapDashboard.modoFallaQty[0][1].qty;return(<div key={i} style={{marginBottom:7}}><div style={{fontSize:11,color:'#E4E4E7',marginBottom:2}}>{name}</div><div style={{display:'flex',alignItems:'center',gap:6}}><div style={{flex:1,height:10,background:'#3F3F46',borderRadius:2}}><div style={{height:'100%',width:`${v.qty/max*100}%`,background:'#71717A',borderRadius:2}}/></div><span style={{fontSize:10,fontWeight:700,color:'#FAFAFA',fontFamily:"'IBM Plex Mono'",minWidth:30,textAlign:'right'}}>{v.qty}</span></div></div>);})}
        </div>
      </div>

      {/* Trend */}
      <div style={{background:'#1F1F23',borderRadius:12,padding:16,marginBottom:20,border:'1px solid #3F3F46'}}>
        <h4 style={{fontSize:12,fontWeight:600,color:'#B91C1C',marginBottom:10,textTransform:'uppercase',letterSpacing:1}}>Scrap Total por día (USD)</h4>
        {scrapDashboard.trend.length===0?<p style={{color:'#52525B',fontSize:12}}>Sin datos</p>:
          <div style={{display:'flex',gap:6,alignItems:'end',height:100,overflowX:'auto'}}>
            {scrapDashboard.trend.map(([d,v],i)=>{const max=Math.max(...scrapDashboard.trend.map(t=>t[1]));return(<div key={i} title={`${d}: $${v.toFixed(0)}`} style={{display:'flex',flexDirection:'column',alignItems:'center',minWidth:36}}><span style={{fontSize:9,color:'#A1A1AA',marginBottom:3}}>${v.toFixed(0)}</span><div style={{width:20,height:`${Math.max((v/max*70),4)}px`,background:'#DC2626',borderRadius:'3px 3px 0 0'}}/><span style={{fontSize:8,color:'#71717A',marginTop:3,writingMode:'vertical-rl'}}>{d.slice(5)}</span></div>);})}
          </div>
        }
      </div>

      {/* Event list */}
      <div style={{overflowX:'auto',borderRadius:12,border:'1px solid #3F3F46'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead><tr style={{background:'#1F1F23'}}><th style={th}>Fecha</th><th style={th}>Turno</th><th style={{...th,textAlign:'left'}}>Defecto</th><th style={th}>Origen</th><th style={th}>Destino</th><th style={th}>Material</th><th style={th}>Cant.</th><th style={th}>Costo U.</th><th style={th}>Monto</th><th style={th}>Giro</th><th style={th}>—</th></tr></thead>
          <tbody>{scrapFiltered.map((e,i)=>(<tr key={e.id} style={{background:i%2===0?'#121212':'#18181B',borderBottom:'1px solid #1F1F23'}}>
            <td style={td}>{e.fecha}</td><td style={td}>{e.turno||'—'}</td><td style={{...td,textAlign:'left'}}>{e.defecto_nombre}</td><td style={td}>{e.origen||'—'}</td>
            <td style={td}><span style={{padding:'2px 8px',borderRadius:4,fontSize:10,fontWeight:700,background:DESTINO_COLORS[e.destino]||'#3F3F46',color:'#FAFAFA'}}>{e.destino}</span></td>
            <td style={td}>{e.tipo_material||'—'}</td><td style={{...td,fontWeight:700}}>{e.cantidad}</td><td style={td}>${Number(e.costo_unitario).toFixed(2)}</td><td style={{...td,fontWeight:700,color:'#B91C1C',fontFamily:"'IBM Plex Mono'"}}>${Number(e.monto).toFixed(2)}</td>
            <td style={td}>{e.giro_id?'✓':'—'}</td><td style={td}><button onClick={()=>handleDeleteScrap(e.id)} style={{background:'none',border:'none',color:'#450A0A',cursor:'pointer',fontSize:13}}>🗑️</button></td>
          </tr>))}</tbody>
        </table>
        {scrapFiltered.length===0&&<p style={{textAlign:'center',padding:30,color:'#71717A',fontSize:13}}>No hay registros de scrap para {linea} con estos filtros</p>}
      </div>
    </div>
  );

  // ── MATRIX ──
  if(!result)return null;
  const{summary,totalRecords,totalDefectTypes,bancosControlados,totalDefects}=result;
  return(
    <div style={{minHeight:'100vh'}}>
      <div className="print-header" style={{background:'linear-gradient(135deg,#1F1F23,#121212)',borderBottom:'1px solid #3F3F46',padding:'14px 24px',position:'sticky',top:0,zIndex:50}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12,maxWidth:1900,margin:'0 auto'}}>
          <div><div style={{fontSize:11,fontWeight:600,letterSpacing:3,color:'#B91C1C',textTransform:'uppercase'}}>WCM · Pilar Calidad · {linea}</div><h1 style={{fontSize:20,fontWeight:700,color:'#FAFAFA',margin:'2px 0 0'}}>{giroName||'Matriz QA'}</h1></div>
          <div style={{display:'flex',gap:8}} className="no-print"><Btn onClick={handlePrint} bg="#52525B" color="#FAFAFA">🖨️ Imprimir AA</Btn><Btn onClick={handlePrintAll} bg="#52525B" color="#FAFAFA" style={{fontSize:11}}>🖨️ Todas</Btn><Btn onClick={()=>{setScrapForm(null);setPage('scrap');}}>🗑️ Scrap</Btn><Btn onClick={()=>setPage('defectos')}>⚙️ Defectos</Btn><Btn onClick={()=>setPage('home')}>← Inicio</Btn><Btn onClick={()=>{setPage('home');setResult(null);setFilter('ALL');setSearch('');setPendingFile(null);setBancos('');setPiezasTotales('');setDiasTrabajados('');setPiezasEntregadas('');setGiroName('');setPdcaMap({});setGiroId(null);if(linea)localStorage.removeItem(`activeGiro_${linea}`);}} bg="#450A0A" color="#FCA5A5" style={{fontSize:11}}>Cerrar giro</Btn></div>
        </div>
      </div>
      <div style={{padding:'16px 24px',maxWidth:1900,margin:'0 auto'}}>
        <div className="fade-in" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:10,marginBottom:16}}>
          {[{l:'Registros',v:totalRecords,i:'📋'},{l:'Bancos',v:bancosControlados.toLocaleString(),i:'🏭'},{l:'Defectos',v:totalDefects,i:'🔍'},{l:'Tipos',v:totalDefectTypes,i:'📊'},{l:'AA',v:summary.AA,c:VC.AA,i:'🔴'},{l:'A',v:summary.A,c:VC.A,i:'🟠'},{l:'B',v:summary.B,c:VC.B,i:'🟡'},{l:'C',v:summary.C,c:VC.C,i:'🟢'},notInDbCount>0?{l:'Sin registro',v:notInDbCount,c:'#DC2626',i:'⚠️'}:null].filter(Boolean).map((k,i)=>(<div key={i} className="print-kpi" style={{background:'#1F1F23',borderRadius:10,padding:'10px 12px',border:'1px solid #3F3F46'}}><div style={{fontSize:10,color:'#A1A1AA',marginBottom:3}}>{k.i} {k.l}</div><div style={{fontSize:22,fontWeight:700,color:k.c||'#FAFAFA',fontFamily:"'IBM Plex Mono'"}}>{k.v}</div></div>))}
        </div>

        {wcmKpis?(
          <div style={{background:'#1F1F23',borderRadius:10,padding:14,marginBottom:16,border:'1px solid #3F3F46'}}>
            <h3 style={{fontSize:12,fontWeight:600,color:'#B91C1C',margin:'0 0 10px',textTransform:'uppercase',letterSpacing:1}}>Indicadores WCM {result.piezasTotales?`· ${result.piezasTotales.toLocaleString()} pzs · ${result.diasTrabajados} días · ${result.piezasEntregadas.toLocaleString()} entregadas`:''}</h3>
            <div className="fade-in" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10}}>
              <WcmCard label="FPY (First Pass Yield)" value={wcmKpis.fpy!=null?`${wcmKpis.fpy.toFixed(2)}%`:'—'} color={wcmKpis.fpy>=95?'#D4D4D8':wcmKpis.fpy>=85?'#71717A':'#DC2626'} sub="Sin retrabajo" />
              <WcmCard label="Rework Rate" value={wcmKpis.rework!=null?`${wcmKpis.rework.toFixed(2)}%`:'—'} color={wcmKpis.rework<=5?'#D4D4D8':wcmKpis.rework<=15?'#71717A':'#DC2626'} sub="Retrabajo" />
              <WcmCard label="Scrap Rate" value={wcmKpis.scrapRate!=null?`${wcmKpis.scrapRate.toFixed(2)}%`:'N/D'} color={wcmKpis.scrapQty>0?(wcmKpis.scrapRate<=2?'#D4D4D8':wcmKpis.scrapRate<=5?'#71717A':'#DC2626'):'#52525B'} sub={wcmKpis.scrapQty>0?`${wcmKpis.scrapQty} pzs · $${wcmKpis.scrapUSD.toFixed(0)}`:'Sin eventos vinculados'} />
              <WcmCard label="Customer DPPM" value={wcmKpis.dppm!=null?Math.round(wcmKpis.dppm).toLocaleString():'—'} color="#B91C1C" sub={`Antena: ${wcmKpis.defAntena} defectos`} />
              <WcmCard label="Customer PPM" value={wcmKpis.custPpm!=null?Math.round(wcmKpis.custPpm).toLocaleString():'—'} color="#B91C1C" sub={`SCA+TDF+Gtía: ${wcmKpis.defCustomerPPM}`} />
              <WcmCard label="Internal PPM" value={wcmKpis.ippm!=null?Math.round(wcmKpis.ippm).toLocaleString():'—'} color="#A1A1AA" sub={`IPPM: ${wcmKpis.defIPPM} defectos`} />
              <WcmCard label="COPQ" value="N/D" color="#52525B" sub="Gestión aparte" />
            </div>
          </div>
        ):(
          <div className="no-print" style={{background:'#1F1F23',borderRadius:10,padding:'10px 14px',marginBottom:16,border:'1px dashed #3F3F46',fontSize:12,color:'#71717A'}}>
            ℹ️ Este giro no tiene datos de piezas totales / entregadas cargados — los indicadores WCM (FPY, PPM, etc.) no están disponibles. Se piden al generar un giro nuevo.
          </div>
        )}
        {kaizenStatus&&(
          <div style={{background:'#1F1F23',borderRadius:10,padding:14,marginBottom:16,border:'1px solid #3F3F46'}}>
            <h3 style={{fontSize:12,fontWeight:600,color:'#B91C1C',margin:'0 0 10px',textTransform:'uppercase',letterSpacing:1}}>🔄 Estado Proyectos Kaizen (PDCA)</h3>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(100px,1fr))',gap:10}}>
              <MiniKpi l="Plan" v={kaizenStatus.P} c="#A1A1AA"/>
              <MiniKpi l="Do" v={kaizenStatus.D} c="#B91C1C"/>
              <MiniKpi l="Check" v={kaizenStatus.C} c="#D4D4D8"/>
              <MiniKpi l="Act (Completado)" v={kaizenStatus.A} c="#D4D4D8"/>
              <MiniKpi l="Sin iniciar" v={kaizenStatus.sinIniciar} c="#52525B"/>
            </div>
          </div>
        )}
        <div style={{background:'#1F1F23',borderRadius:10,padding:14,marginBottom:16,border:'1px solid #3F3F46'}}><h3 style={{fontSize:12,fontWeight:600,color:'#B91C1C',margin:'0 0 10px',textTransform:'uppercase',letterSpacing:1}}>Pareto</h3><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{pareto.slice(0,10).map(([c,n],i)=>{const p=(n/totalDefects*100).toFixed(1);return(<div key={i} style={{flex:'1 1 auto',minWidth:100,background:'#121212',borderRadius:6,padding:'6px 10px',border:'1px solid #3F3F46'}}><div style={{fontSize:10,color:'#A1A1AA'}}>{c}</div><div style={{display:'flex',alignItems:'baseline',gap:4}}><span style={{fontSize:18,fontWeight:700,color:'#FAFAFA',fontFamily:"'IBM Plex Mono'"}}>{n}</span><span style={{fontSize:10,color:'#71717A'}}>{p}%</span></div><div style={{height:2,background:'#3F3F46',borderRadius:1,marginTop:3}}><div style={{height:'100%',width:`${Math.min(+p,100)}%`,background:'#B91C1C',borderRadius:1}}/></div></div>);})}</div></div>
        <div className="no-print" style={{display:'flex',gap:6,alignItems:'center',marginBottom:12,flexWrap:'wrap'}}>
          {['ALL','AA','A','B','C'].map(f=><Btn key={f} onClick={()=>setFilter(f)} bg={filter===f?(f==='ALL'?'#B91C1C':VC[f]):'#3F3F46'} color={filter===f?'#121212':'#A1A1AA'} style={{padding:'5px 12px',fontSize:12}}>{f==='ALL'?'Todas':f} ({f==='ALL'?totalDefectTypes:summary[f]})</Btn>)}
          <input placeholder="Buscar..." value={search} onChange={e=>setSearch(e.target.value)} style={{marginLeft:'auto',padding:'6px 12px',borderRadius:6,border:'1px solid #52525B',background:'#1F1F23',color:'#FAFAFA',fontSize:12,width:200}}/>
        </div>
        <div style={{overflowX:'auto',borderRadius:10,border:'1px solid #3F3F46'}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:1400}}><thead><tr style={{background:'#1F1F23'}}>
          <th style={th}>#</th><th style={th}>Voz</th><th style={{...th,textAlign:'left',minWidth:220}}>Modo de Falla</th><th style={th}>S</th><th style={th}>Qty</th><th style={th}>O</th><th style={th}>D</th><th style={th}>C</th><th style={{...th,color:'#B91C1C'}}>Índice</th><th style={{...th,borderLeft:'2px solid #3F3F46'}}>PDCA</th><th style={th}>Resp.</th>
          {DETECTION_POINTS.map(dp=><th key={dp.key} style={{...th,color:dp.scope==='ext'?'#B91C1C':'#A1A1AA',fontSize:9}}>{dp.label}</th>)}
        </tr></thead><tbody>
          {filteredRows.map((row,i)=>{const sel=selectedRow===row.vozNum;const pc=pdcaMap[row.vozNum]||{responsable:'',plan:false,do_step:false,check:false,act:false,comments:''};const nodb=row.notInDb;return[
            <tr key={row.vozNum} className={nodb?'print-nodb':''} onClick={()=>setSelectedRow(sel?null:row.vozNum)} style={{background:sel?'#27272A':nodb?(i%2===0?'#18181B':'#1F1F23'):(i%2===0?'#121212':'#18181B'),cursor:'pointer',borderBottom:`1px solid ${nodb?'#7F1D1D':'#1F1F23'}`,borderLeft:nodb?'3px solid #DC2626':'3px solid transparent'}} onMouseEnter={e=>{if(!sel)e.currentTarget.style.background='#1F1F23';}} onMouseLeave={e=>{if(!sel)e.currentTarget.style.background=sel?'#27272A':nodb?(i%2===0?'#18181B':'#1F1F23'):(i%2===0?'#121212':'#18181B');}}>
              <td style={td}>{row.vozNum}</td><td style={td}><Voz v={row.voz}/></td><td style={{...td,textAlign:'left',fontWeight:500,fontSize:11,color:nodb?'#DC2626':'#E4E4E7'}}>{row.concat}{nodb&&<span style={{fontSize:9,color:'#7F1D1D',marginLeft:6}} title="Defecto no encontrado en la lista única. Usando valores por defecto (S=3, CI=1, CE=4)">⚠ sin registro</span>}</td><td style={td}>{row.severidad}</td><td style={{...td,fontWeight:700}}>{row.cantDefectos}</td><td style={td}>{row.ocurrencia}</td><td style={td}>{row.detectabilidad}</td><td style={td}>{row.costo}</td><td className="print-index" style={{...td,fontWeight:700,color:'#B91C1C',fontSize:13,fontFamily:"'IBM Plex Mono'"}}>{row.index}</td>
              <td style={{...td,borderLeft:'2px solid #3F3F46'}} onClick={e=>e.stopPropagation()}><div style={{display:'flex',gap:2,justifyContent:'center'}}>{['P','D','C','A'].map((l,li)=>{const f=['plan','do_step','check','act'][li];const ck=pc[f];return(<button key={l} onClick={()=>handlePdca(row.vozNum,f,!ck)} style={{width:20,height:20,borderRadius:3,border:'none',fontSize:9,fontWeight:700,cursor:'pointer',background:ck?'#D4D4D8':'#3F3F46',color:ck?'#FAFAFA':'#71717A'}}>{l}</button>);})}</div></td>
              <td style={{...td,fontSize:10,maxWidth:70,overflow:'hidden',textOverflow:'ellipsis',color:pc.responsable?'#FAFAFA':'#52525B'}}>{pc.responsable||'—'}</td>
              {DETECTION_POINTS.map(dp=>{const v=row.dpBreakdown[dp.key];return<td key={dp.key} className={v?(dp.scope==='ext'?'dp-ext':'dp-int'):''} style={{...td,color:v?(dp.scope==='ext'?'#B91C1C':'#A1A1AA'):'#1F1F23',fontSize:10}}>{v||'·'}</td>;})}
            </tr>,
            sel&&<tr key={`d-${row.vozNum}`}><td colSpan={11+DETECTION_POINTS.length} style={{padding:'14px 16px',background:'#1F1F23',borderBottom:'2px solid #B91C1C'}}><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
              <div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:8,marginBottom:12}}><Dt l="Componente" v={row.component}/><Dt l="Ocurrencia %" v={`${(row.ocurrenciaPct*100).toFixed(4)}%`} m/><Dt l="C.Int" v={row.costoInterno} m/><Dt l="C.Ext" v={row.costoExterno} m/><Dt l="C.Usado" v={row.costo} m h/><Dt l="Fórmula" v={`${row.severidad}×${row.ocurrencia}×${row.detectabilidad}×${row.costo}=${row.index}`} m h/></div>
                <div style={{marginTop:8,padding:'10px 12px',background:'#121212',borderRadius:8,border:'1px solid #3F3F46'}}><div style={{fontSize:10,color:'#B91C1C',fontWeight:600,textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>Unificar voces</div><div style={{display:'flex',gap:8,alignItems:'center'}} onClick={e=>e.stopPropagation()}><input placeholder="Nros de voz (ej: 5,8,12)" value={unifyTarget?.vozNum===row.vozNum?unifyTarget.inputVal:''} onChange={e=>setUnifyTarget({vozNum:row.vozNum,inputVal:e.target.value})} style={{flex:1,padding:'6px 10px',borderRadius:6,border:'1px solid #52525B',background:'#1F1F23',color:'#FAFAFA',fontSize:12}}/><Btn bg="#B91C1C" color="#121212" onClick={()=>{if(unifyTarget?.vozNum===row.vozNum)handleUnify(row.vozNum,unifyTarget.inputVal);}} style={{padding:'6px 12px',fontSize:11}}>Unificar</Btn></div><p style={{fontSize:10,color:'#71717A',marginTop:4}}>Las ocurrencias se suman y las voces indicadas se eliminan</p></div>
                <div style={{marginTop:8}} onClick={e=>e.stopPropagation()}><Btn bg="#7F1D1D" color="#FCA5A5" onClick={()=>openScrapForm({giroId,vozNum:row.vozNum,defectoNombre:row.defectName,componente:row.component})} style={{width:'100%',fontSize:11}}>🗑️ Registrar resolución (Scrap/Devolución/Retrabajo)</Btn></div>
              </div>
              <div><div style={{marginBottom:8}}><span style={{fontSize:10,color:'#71717A',textTransform:'uppercase'}}>Responsable</span><input value={pc.responsable} onChange={e=>handlePdca(row.vozNum,'responsable',e.target.value)} placeholder="Asignar..." onClick={e=>e.stopPropagation()} style={{width:'100%',padding:'6px 10px',borderRadius:6,border:'1px solid #52525B',background:'#121212',color:'#FAFAFA',fontSize:13,marginTop:4}}/></div>
                <div><span style={{fontSize:10,color:'#71717A',textTransform:'uppercase'}}>Comentarios</span><textarea value={pc.comments} onChange={e=>handlePdca(row.vozNum,'comments',e.target.value)} placeholder="Notas..." onClick={e=>e.stopPropagation()} rows={2} style={{width:'100%',padding:'6px 10px',borderRadius:6,border:'1px solid #52525B',background:'#121212',color:'#FAFAFA',fontSize:12,marginTop:4,resize:'vertical',fontFamily:'inherit'}}/></div>
                <div style={{display:'flex',gap:8,marginTop:8}}>{[['plan','Plan'],['do_step','Do'],['check','Check'],['act','Act']].map(([f,l])=>(<label key={f} style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer',fontSize:12}} onClick={e=>e.stopPropagation()}><input type="checkbox" checked={pc[f]} onChange={e=>handlePdca(row.vozNum,f,e.target.checked)} style={{accentColor:'#D4D4D8'}}/><span style={{color:pc[f]?'#D4D4D8':'#A1A1AA',fontWeight:600}}>{l}</span></label>))}</div>
              </div>
            </div></td></tr>,
          ];})}
        </tbody></table></div>
        <div className="no-print" style={{textAlign:'center',padding:'16px 0 40px',color:'#52525B',fontSize:11}}>{filteredRows.length} de {totalDefectTypes} voces · Bancos: {bancosControlados.toLocaleString()}</div>
      </div>
    </div>
  );
}

function HC({icon,title,desc,onClick,hl}){return<div onClick={onClick} style={{background:hl?'#27272A':'#1F1F23',borderRadius:16,padding:'32px 24px',border:`1px solid ${hl?'#B91C1C':'#3F3F46'}`,cursor:'pointer',textAlign:'center',transition:'border-color .2s'}} onMouseEnter={e=>e.currentTarget.style.borderColor='#B91C1C'} onMouseLeave={e=>e.currentTarget.style.borderColor=hl?'#B91C1C':'#3F3F46'}><div style={{fontSize:40,marginBottom:12}}>{icon}</div><div style={{fontWeight:700,color:'#FAFAFA',fontSize:18,marginBottom:4}}>{title}</div><div style={{color:hl?'#B91C1C':'#71717A',fontSize:13}}>{desc}</div></div>;}
function Dt({l,v,m,h}){return<div><div style={{fontSize:9,color:'#71717A',textTransform:'uppercase',letterSpacing:1}}>{l}</div><div style={{fontWeight:600,color:h?'#B91C1C':'#FAFAFA',fontFamily:m?"'IBM Plex Mono',monospace":'inherit',fontSize:m?11:12}}>{v}</div></div>;}
function WcmCard({label,value,color,sub}){return<div className="print-kpi" style={{background:'#121212',borderRadius:8,padding:'10px 12px',border:'1px solid #3F3F46'}}><div style={{fontSize:10,color:'#A1A1AA',marginBottom:4}}>{label}</div><div style={{fontSize:20,fontWeight:700,color,fontFamily:"'IBM Plex Mono'"}}>{value}</div><div style={{fontSize:9,color:'#71717A',marginTop:2}}>{sub}</div></div>;}
function MiniKpi({l,v,c}){return<div style={{background:'#121212',borderRadius:8,padding:'8px 10px',border:'1px solid #3F3F46',textAlign:'center'}}><div style={{fontSize:9,color:'#71717A'}}>{l}</div><div style={{fontSize:16,fontWeight:700,color:c||'#FAFAFA',fontFamily:"'IBM Plex Mono'"}}>{v??'—'}</div></div>;}

// Pure helper: computes WCM indicators for ANY giro row (snake_case, as returned by fetchGiro),
// used by the Dashboard Gerencial to show KPIs for a selected/past giro of either línea.
function calcWcmKpisFromGiro(g, scrapEventos) {
  if (!g || !g.piezas_totales) return null;
  const qaRows = g.qa_rows || [];
  const pt = g.piezas_totales, dt = g.dias_trabajados, pe = g.piezas_entregadas, defTotal = g.total_defects, bc = g.bancos_controlados;
  const dpTotals = {}; for (const r of qaRows) { for (const [k, v] of Object.entries(r.dpCounts || {})) dpTotals[k] = (dpTotals[k] || 0) + v; }
  const defAntena = dpTotals['Antena'] || 0;
  const defCustomerPPM = (dpTotals['SCA'] || 0) + (dpTotals['TDF/TTV'] || 0) + (dpTotals['Garantía'] || 0);
  const defIPPM = dpTotals['IPPM'] || 0;
  const linkedScrap = (scrapEventos || []).filter(e => e.giro_id === g.id);
  const scrapQty = linkedScrap.filter(e => e.destino === 'Scrap').reduce((s, e) => s + e.cantidad, 0);
  const devolQty = linkedScrap.filter(e => e.destino === 'Devolución Proveedor').reduce((s, e) => s + e.cantidad, 0);
  const scrapUSD = linkedScrap.filter(e => e.destino === 'Scrap').reduce((s, e) => s + Number(e.monto || 0), 0);
  const reworkQty = Math.max(0, defTotal - scrapQty - devolQty);
  return {
    fpy: pt > 0 ? ((pt - defTotal) / pt * 100) : null,
    rework: pt > 0 ? (reworkQty / pt * 100) : null,
    scrapRate: pe > 0 ? (scrapQty / pe * 100) : null,
    dppm: pe > 0 ? (defAntena / pe * 1000000) : null,
    custPpm: pe > 0 ? (defCustomerPPM / pe * 1000000) : null,
    ippm: bc > 0 ? (defIPPM / bc * 1000000) : null,
    scrapQty, scrapUSD, devolQty, reworkQty, defAntena, defCustomerPPM, defIPPM,
  };
}

// Pure helper: WCM indicators computed from a DATE RANGE (not a giro), using raw reportes_defectos
// counts + daily production entries + scrap events. Used by Dashboard Gerencial.
function calcWcmKpisDateRange(reportes, produccionRows, scrapEventsInRange) {
  const pt = (produccionRows || []).reduce((s, r) => s + (r.piezas_totales || 0), 0);
  const pe = (produccionRows || []).reduce((s, r) => s + (r.piezas_entregadas || 0), 0);
  const bc = (produccionRows || []).reduce((s, r) => s + (r.bancos_controlados || 0), 0);
  if (pt === 0 && pe === 0 && bc === 0) return null;
  const defTotal = (reportes || []).length;
  const dpTotals = {};
  for (const r of (reportes || [])) dpTotals[r.deteccion] = (dpTotals[r.deteccion] || 0) + 1;
  const defAntena = dpTotals['Antena'] || 0;
  const defCustomerPPM = (dpTotals['SCA'] || 0) + (dpTotals['TDF/TTV'] || 0) + (dpTotals['Garantía'] || 0);
  const defIPPM = dpTotals['IPPM'] || 0;
  const scrapOnly = (scrapEventsInRange || []).filter(e => e.destino === 'Scrap');
  const devolOnly = (scrapEventsInRange || []).filter(e => e.destino === 'Devolución Proveedor');
  const scrapQty = scrapOnly.reduce((s, e) => s + e.cantidad, 0);
  const devolQty = devolOnly.reduce((s, e) => s + e.cantidad, 0);
  const scrapUSD = scrapOnly.reduce((s, e) => s + Number(e.monto || 0), 0);
  const reworkQty = Math.max(0, defTotal - scrapQty - devolQty);
  return {
    fpy: pt > 0 ? ((pt - defTotal) / pt * 100) : null,
    rework: pt > 0 ? (reworkQty / pt * 100) : null,
    scrapRate: pe > 0 ? (scrapQty / pe * 100) : null,
    dppm: pe > 0 ? (defAntena / pe * 1000000) : null,
    custPpm: pe > 0 ? (defCustomerPPM / pe * 1000000) : null,
    ippm: bc > 0 ? (defIPPM / bc * 1000000) : null,
    scrapQty, scrapUSD, devolQty, reworkQty, defAntena, defCustomerPPM, defIPPM, defTotal, pt, pe, bc,
  };
}
// based on the highest checkbox marked true. Used by both Matriz QA and Dashboard Gerencial.
function calcKaizenStatus(qaRows, pdcaMap) {
  const counts = { P: 0, D: 0, C: 0, A: 0, sinIniciar: 0 };
  for (const r of (qaRows || [])) {
    const p = (pdcaMap || {})[r.vozNum];
    if (!p) { counts.sinIniciar++; continue; }
    if (p.act) counts.A++;
    else if (p.check) counts.C++;
    else if (p.do_step) counts.D++;
    else if (p.plan) counts.P++;
    else counts.sinIniciar++;
  }
  return counts;
}

// Pure helper: full scrap indicator set (destino breakdown, top5, modo de falla, trend) for a list of events.
function computeScrapStats(events) {
  const list = events || [];
  const scrapOnly = list.filter(e => e.destino === 'Scrap');
  const totalScrapUSD = scrapOnly.reduce((s, e) => s + Number(e.monto || 0), 0);
  const totalScrapQty = scrapOnly.reduce((s, e) => s + e.cantidad, 0);
  const porDestino = {};
  for (const e of list) porDestino[e.destino] = (porDestino[e.destino] || 0) + Number(e.monto || 0);
  const totalAllUSD = Object.values(porDestino).reduce((a, b) => a + b, 0);
  const byPart = {};
  for (const e of scrapOnly) { const key = e.defecto_nombre; if (!byPart[key]) byPart[key] = { usd: 0, qty: 0 }; byPart[key].usd += Number(e.monto || 0); byPart[key].qty += e.cantidad; }
  const top5USD = Object.entries(byPart).sort((a, b) => b[1].usd - a[1].usd).slice(0, 5);
  const top5Qty = Object.entries(byPart).sort((a, b) => b[1].qty - a[1].qty).slice(0, 5);
  const modoFallaUSD = Object.entries(byPart).sort((a, b) => b[1].usd - a[1].usd).slice(0, 8);
  const modoFallaQty = Object.entries(byPart).sort((a, b) => b[1].qty - a[1].qty).slice(0, 8);
  const byDay = {};
  for (const e of scrapOnly) byDay[e.fecha] = (byDay[e.fecha] || 0) + Number(e.monto || 0);
  const trend = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0]));
  return { totalScrapUSD, totalScrapQty, porDestino, totalAllUSD, top5USD, top5Qty, modoFallaUSD, modoFallaQty, trend };
}
