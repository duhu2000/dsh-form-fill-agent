window.__ModuleLoader__.load({
 id: 'dsh-form-fill-agent',
 factory(require) {
  const SIDEBAR_TAB='dsh-form-fill-agent:workbench';
  const SIDEBAR_HELP='内嵌工作台暂不可用。原生对话与独立填表页面仍可使用，输入和已保存任务不会清除。启用内嵌工作台需与宿主匹配的 Better Sidebar（>=0.17.1 <0.19.0），请按安装说明选择版本。';
  // The only adapter allowed to reveal host panels. No geometry or business writes.
  function createSidebarAdapter(service,component,icon){
   const version=/^0\.(17|18)\.(\d+)$/.exec(service?.version||'');
   if(!version||version[1]==='17'&&Number(version[2])<1||!Array.isArray(service.features)||!['targetedOpen','stateSubscription'].every(f=>service.features.includes(f))||!['registerTab','isTabEnabled','openTab','closeTab','getSnapshot','subscribeState'].every(k=>typeof service[k]==='function'))throw Error(SIDEBAR_HELP);
   const targets=new Map(),pending=new Set(),opened=new Map();let disposed=false;
   const contains=(node,id)=>node?.kind==='leaf'?node.tabs.some(t=>t.id===id):node?.children?.some(c=>contains(c,id));
   const flush=()=>{
    if(disposed)return;const id=service.getSnapshot().sessionId,target=targets.get(id);
    if(!target||!pending.has(id))return;
    pending.delete(id);
    target.store.reduce(state=>{
     if(state.floats?.some(f=>f.tab.id===target.tabId))return state;
     if(contains(state.bottomSplits,target.tabId))return state.bottomOpen?state:{...state,bottomOpen:true};
     if(contains(state.splits,target.tabId))return state.panelOpen?state:{...state,panelOpen:true};
     return state;
    });
   };
   const unregister=service.registerTab({id:SIDEBAR_TAB,title:'AI 填表',icon,order:20,single:true,hidden:true,component});
   const unsubscribe=service.subscribeState(flush);
   return {
    open(scope){if(disposed)throw Error(SIDEBAR_HELP);if(!service.isTabEnabled(SIDEBAR_TAB))throw Error('AI填表 Tab 已禁用，请在 Better Sidebar 设置中启用。');opened.set(scope.sessionId,scope);pending.add(scope.sessionId);service.openTab({type:SIDEBAR_TAB},scope);flush();},
    attach(scope,store,tab){if(disposed)return()=>{};if(typeof store?.reduce!=='function')throw Error(SIDEBAR_HELP);const target={store,tabId:tab.id};targets.set(scope.sessionId,target);flush();return()=>{if(targets.get(scope.sessionId)===target)targets.delete(scope.sessionId)};},
    dispose(){if(disposed)return;disposed=true;unsubscribe();pending.clear();targets.clear();for(const scope of opened.values())service.closeTab(SIDEBAR_TAB,scope);opened.clear();unregister();}
   };
  }
  // Admission, not draft changes or runtime polling, owns automatic reveal.
  function installSubmittedWorkbenchBridge(sessions,reveal){
   let active,activeFace,stop=()=>{},disposed=false;const seen=new Set();
   const owned=id=>typeof id==='string'&&id.startsWith('session-dsh-form-fill-agent-');
   const admitted=(id,text,identity)=>{
    if(disposed||!owned(id))return;
    const task=String(text||'').match(/taskId=([a-f0-9-]{36})/i)?.[1];
    const revision=String(text||'').match(/expectedRevision=(\d+)/)?.[1];
    const key=task&&revision?`${id}:${task}:${revision}`:identity;
    if(seen.has(key))return;seen.add(key);
    if(sessions.list.getSnapshot().current!==id)return;
    // openPanel reports companion errors through the visible manual fallback.
    try{reveal(id,'preview')}catch{}
   };
   const connect=()=>{
    const id=sessions?.list?.getSnapshot?.()?.current,face=owned(id)?sessions.binding?.(id)?.session:undefined;
    if(id===active&&face===activeFace)return;
    stop();stop=()=>{};active=id;activeFace=face;if(!owned(id))return;
    if(typeof face?.beginSubmission==='function'){
     const original=face.beginSubmission;
     const wrapped=function(input){const identity={};return original.call(this,{...input,onRetire:settlement=>{
      try{input.onRetire?.(settlement)}finally{if(settlement.reason==='observed')admitted(id,input.text,identity)}
     }})};
     face.beginSubmission=wrapped;stop=()=>{if(face.beginSubmission===wrapped)face.beginSubmission=original};
    }
   };
   connect();const unsubscribe=sessions?.list?.subscribe?.(connect);
   return()=>{disposed=true;stop();unsubscribe?.();seen.clear()};
  }
  const INITIAL_TEMPLATE_ID='dsh-initial-draft/form-fill/1';
  const INITIAL_TEMPLATE_TEXT='请帮我填写企业信息表。请上传 Excel 模板，说明主体定位列和需要填写的字段；也可点击左上角「提示词生成」设置填写规则。例如：按“企业名称”定位，只填空白单元格，补充统一社会信用代码、法定代表人和注册地址，并生成新文件。';
  // Full text equality is the collision-free fingerprint; never trim/normalize user edits.
  function createInitialDraftController({current,shell,storage,subscribeCurrent,defer=fn=>Promise.resolve().then(fn)}){
   const entries=new Map();let disposed=false;
   const key=id=>INITIAL_TEMPLATE_ID+':'+id;
   const persist=(id,entry)=>{try{storage.setItem(key(id),JSON.stringify({state:entry.state,templateId:INITIAL_TEMPLATE_ID,fingerprint:INITIAL_TEMPLATE_TEXT,untouched:entry.untouched}));return true}catch{return false}};
   const snapshot=face=>{
    const state=face?.state?.getSnapshot?.(),editor=face?.editor;
    if(!state||typeof state.draft!=='string'||!Array.isArray(state.imageIds)||!Number.isSafeInteger(state.draftRev)||typeof editor?.isComposing!=='function'||typeof editor?.getRootElement!=='function'||typeof editor?.update!=='function')return null;
    return {draft:state.draft,rev:state.draftRev,empty:state.draft===''&&state.imageIds.length===0&&state.phase==='plain'&&Array.isArray(state.occurrences)&&state.occurrences.length===0,ready:!!editor.getRootElement(),composing:editor.isComposing()};
   };
   const skip=(id,e)=>{e.state='skipped';e.untouched=false;persist(id,e)};
   return {
    // Called only after this entry's create succeeds, before the asynchronous open.
    arm(id){
     if(disposed||!id?.startsWith('session-dsh-form-fill-agent-')||entries.has(id))return;
     try{if(storage.getItem(key(id)))return}catch{return}
     let face;try{face=shell(id)}catch{return}
     const first=snapshot(face),e={state:'unseen',face,first,untouched:false};entries.set(id,e);
     if(!first||!first.empty||first.composing||typeof face?.setDraft!=='function'||typeof face.state.subscribe!=='function'||!persist(id,e)){skip(id,e);return}
     let visited=current()===id;
     e.sessionOff=subscribeCurrent?.(()=>{if(current()===id)visited=true;else if(visited&&e.state==='unseen')skip(id,e)});
     e.off=face.state.subscribe(()=>{
      const next=snapshot(face);
      if(e.writing)return;
      if(e.state==='unseen'&&(!next||next.rev!==first.rev||!next.empty||next.composing))skip(id,e);
      if(e.state==='initialized'&&next?.rev!==e.seedRev){e.untouched=false;persist(id,e)}
     });
    },
    async attempt(id){
     const e=entries.get(id);if(disposed||e?.state!=='unseen')return false;
     const before=snapshot(e.face);
     if(current()!==id||!before||!before.empty||before.composing||before.rev!==e.first.rev){skip(id,e);return false}
     if(!before.ready)return false;
     // All asynchronous work precedes this second snapshot and synchronous public write.
     return defer(()=>{
      const after=snapshot(e.face);
      if(disposed||e.state!=='unseen')return false;
      if(current()!==id||!after?.ready||!after.empty||after.composing||after.rev!==before.rev){skip(id,e);return false}
      e.state='initialized';e.untouched=true;
      if(!persist(id,e)){skip(id,e);return false}
      try{e.writing=true;e.face.editor.update(()=>e.face.setDraft(INITIAL_TEMPLATE_TEXT),{discrete:true,tag:'skip-dom-selection'});e.seedRev=snapshot(e.face)?.rev;if(snapshot(e.face)?.draft!==INITIAL_TEMPLATE_TEXT){skip(id,e);return false}return true}
      catch{skip(id,e);return false}finally{e.writing=false}
     });
    },
    expire(id){const e=entries.get(id);if(e?.state==='unseen')skip(id,e)},
    isTemplate(id,text){const e=entries.get(id);return e?.state==='initialized'&&e.untouched&&text===INITIAL_TEMPLATE_TEXT&&snapshot(e.face)?.rev===e.seedRev},
    dispose(){disposed=true;for(const [id,e] of entries){if(e.state==='unseen')skip(id,e);e.off?.();e.sessionOff?.()}entries.clear()}
   };
  }
  function apply(ctx) {
   let React, portal;
   try { React=require('react');portal=require('react-dom').createPortal; } catch {}
   if(typeof React?.createElement!=='function'||!ctx.slots?.inject||!ctx.slots?.register)return;
   const h=React.createElement,prefix='session-dsh-form-fill-agent-';
   const owned=id=>typeof id==='string'&&id.startsWith(prefix);
   const disposers=[],sessionTasks=new Map(),lastDrafts=new Map(),views=new Map(),viewListeners=new Set();let sidebar,pendingStart,activePlugin=true,sidebarError=SIDEBAR_HELP;
   const paths={table:'M3 4h18v16H3zM3 9h18M9 9v11',upload:'M12 16V3M7 8l5-5 5 5M4 14v7h16v-7',check:'M3 5h2v2H3zM9 6h12M3 11h2v2H3zM9 12h12M3 17h2v2H3zM9 18h12',search:'M17 17l5 5M19 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',history:'M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v6l4 2',spark:'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z'};
   const icon=(name='table')=>h('svg',{className:'ff-icon',viewBox:'0 0 24 24','aria-hidden':true},h('path',{d:paths[name]}));
   const mark=()=>h('span',{className:'ff-mark'},icon());
   const theme=()=>document.documentElement.hasAttribute('data-ds-dark-theme')?'dark':getComputedStyle(document.documentElement).colorScheme==='light'?'light':matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';
   if(typeof document!=='undefined'&&document.head?.append){const css=document.createElement('link');css.rel='stylesheet';css.href='/form-fill/brand.css';css.dataset.formFillStyle='true';document.head.append(css);disposers.push(()=>css.remove())}
   const current=()=>ctx.sessions?.list?.getSnapshot?.().current;
   let draftStorage;try{draftStorage=window.sessionStorage}catch{}
   const initialDraft=createInitialDraftController({current,subscribeCurrent:fn=>ctx.sessions?.list?.subscribe?.(fn),shell:id=>ctx.conversation?.input?.shell?.(id),storage:draftStorage});
   disposers.push(()=>initialDraft.dispose());
   function register(name,component){ctx.slots.inject(name,()=>ctx.slots.register({name,id:'form-fill-agent',order:120},component))}
   function openPanel(id,step='import'){
    if(!activePlugin||!owned(id))return;
    try{
     if(!sidebar)throw Error(sidebarError);
     const workspace=ctx.workspaces?.list?.getSnapshot?.().items?.find(w=>w.sessionIds?.includes(id));
     views.set(id,{id,step});sidebar.open({sessionId:id,...(workspace?.path?{cwd:workspace.path}:{})});
     for(const listener of viewListeners)listener();
    }catch(error){sidebarError=error.message;for(const listener of viewListeners)listener(sidebarError)}
   }
   async function start(){
    if(pendingStart)return pendingStart;
    pendingStart=createSession().finally(()=>pendingStart=null);return pendingStart;
   }
   async function createSession(){
    const list=ctx.workspaces?.list?.getSnapshot?.(),items=list?.items||[];
    const workspace=items.find(w=>w.sessionIds?.includes(current()))||items.find(w=>w.workspaceId===list?.recentWorkspaceId)||items[0];
    if(!workspace||!ctx.sessions?.create) { window.open('/form-fill/','_blank','noopener');return; }
    const id=prefix+crypto.randomUUID();
    const result=await ctx.sessions.create({workspaceId:workspace.workspaceId,sessionId:id});
    if(result!==id)throw Error('宿主不支持独立业务会话');
    initialDraft.arm(id);
    await ctx.sessions.open(id);
    // Input mounting is bounded; any user edit or Session switch consumes eligibility.
    if(ctx.conversation?.input?.shell)for(let i=0;i<20&&activePlugin;i++){
     if(await initialDraft.attempt(id))break;
     if(current()!==id)break;
     await new Promise(resolve=>setTimeout(resolve,50));
    }
    initialDraft.expire(id);
   }
   const launcher=()=>h('a',{className:'ff-launcher',href:'/form-fill/',target:'_blank',rel:'noopener noreferrer','aria-label':'AI 填表',onClick:async e=>{
    if(!ctx.sessions?.create)return;e.preventDefault();try{await start()}catch{window.open('/form-fill/','_blank','noopener')}
   }},icon(),h('span',null,'AI 填表'));
   function Sidebar(){
    const [mount,setMount]=React.useState(null);
    React.useEffect(()=>{
     const nodes=new Set();let last;
     const sync=()=>{const target=document.querySelector('[data-slot="sidebar.workspaces"]');if(!target?.parentElement)return;if(last?.isConnected)return;const node=document.createElement('div');node.dataset.formFillTop='true';node.className='ff-ui ff-top';node.dataset.ffTheme=theme();target.before(node);nodes.add(node);last=node;setMount(node)};
     sync();const observer=new MutationObserver(sync);observer.observe(document.body,{childList:true,subtree:true});
     return()=>{observer.disconnect();for(const node of nodes)node.remove()};
    },[]);
    return mount?portal(launcher(),mount):h('div',{className:'ff-ui'},launcher());
   }
   register('sidebar.footer.action',React.useState&&portal?Sidebar:launcher);
   if(!React.useState||!React.useEffect||!portal||!ctx.sessions?.list)return;
   function installSessionBridge(navigation){
    const original=navigation?.startSession,descriptor=navigation&&Object.getOwnPropertyDescriptor(navigation,'startSession');
    if(typeof original!=='function')return;
    let disposed=false,pending;
    const wrapped=function(workspaceId){
     const previous=current();if(disposed||!owned(previous))return original.call(this,workspaceId);
     if(pending)return pending;
     const list=ctx.workspaces.list.getSnapshot();
     const target=workspaceId||list.items.find(w=>w.sessionIds?.includes(previous))?.workspaceId||list.recentWorkspaceId;
     if(!target)return original.call(this,workspaceId);
     pending=ctx.sessions.create({workspaceId:target}).then(id=>{if(!disposed&&current()===previous)ctx.sessions.open(id)}).finally(()=>pending=null);
     return pending;
    };
    try{navigation.startSession=wrapped;const dispose=()=>{disposed=true;if(navigation.startSession===wrapped){if(descriptor)Object.defineProperty(navigation,'startSession',descriptor);else delete navigation.startSession}};disposers.push(dispose);return dispose}catch{}
   }
   if(ctx.workspaces?.startSession)installSessionBridge(ctx.workspaces);
   else ctx.inject?.(['uiWorkspace'],scope=>{const dispose=installSessionBridge(scope.uiWorkspace);scope.effect?.(()=>dispose)});
   function Hero({sessionId}){
    const [mount,setMount]=React.useState(null);
    React.useEffect(()=>{
     if(!owned(sessionId))return;
     let mount,original,previous,disposed=false;
     const release=()=>{
      mount?.remove();mount=undefined;
      if(original?.style.display==='none')original.style.display=previous;
      original=undefined;setMount(null);
     };
     const sync=()=>{
      if(disposed)return;
      if(!activePlugin||current()!==sessionId){if(mount||original)release();return;}
      const marker=[...document.querySelectorAll('[data-form-fill-session]')].find(n=>n.dataset.formFillSession===sessionId);
      const hero=marker?.closest('[data-phase="hero"]'),title=hero?.querySelector('[class*="headlineText"]');
      // This only replaces the host welcome brand, never a user-owned Session title.
      if(!title||!['探索未至之境','Into the Unknown'].includes(title.textContent.trim())){if(mount||original)release();return;}
      if(mount?.isConnected&&original===title.parentElement)return;
      if(mount||original)release();
      original=title.parentElement;previous=original.style.display;original.style.display='none';
      mount=document.createElement('div');mount.className='ff-ui ff-hero';mount.dataset.ffTheme=theme();original.before(mount);setMount(mount);
     };
     const marker=[...document.querySelectorAll('[data-form-fill-session]')].find(n=>n.dataset.formFillSession===sessionId);
     const scope=marker?.closest('[data-slot="conversation"]')||marker?.closest('[data-phase="hero"]');
     const observer=new MutationObserver(sync);
     if(scope)observer.observe(scope,{childList:true,subtree:true,characterData:true});
     const unsubscribe=ctx.sessions.list.subscribe?.(sync);
     const dispose=()=>{if(disposed)return;disposed=true;observer.disconnect();if(typeof unsubscribe==='function')unsubscribe();release();};
     disposers.push(dispose);sync();
     return()=>{dispose();const index=disposers.indexOf(dispose);if(index>=0)disposers.splice(index,1);};
    },[sessionId]);
    return mount?portal(h('div',{className:'ff-brand ff-hero-brand'},mark(),h('h1',null,'AI 填表智能体')),mount):null;
   }

   function Menu({sessionId}){
    const ref=React.useRef(null),[mount,setMount]=React.useState(null),[error,setError]=React.useState('');
    React.useEffect(()=>{const report=message=>setError(message||'');viewListeners.add(report);return()=>viewListeners.delete(report)},[]);
    React.useEffect(()=>{
     if(!owned(sessionId)||!ref.current)return;
     const marker=ref.current,seat=marker.closest('[data-composer-seat]'),card=seat?.querySelector('[data-composer-card]');
     if(!card)return;
     let branch=card;while(branch.parentElement&&branch.parentElement!==seat&&!branch.parentElement.contains(marker))branch=branch.parentElement;
     if(!branch.parentElement?.contains(marker)||branch.contains(marker))return;
     const node=document.createElement('div');node.dataset.formFillMount='true';branch.after(node);setMount(node);
     return()=>{node.remove();setMount(null)};
    },[sessionId]);
    if(!owned(sessionId))return null;
    const content=h('div',{className:'ff-ui','data-ff-theme':theme()},h('nav',{className:'ff-shortcuts','aria-label':'AI填表快捷菜单'},...[
     ['导入表格','import','upload'],['字段设置','rules','check'],['主体核验','identity','search'],['填写预览','preview','table'],['任务历史','history','history']
    ].map(([label,step,symbol])=>h('button',{key:step,type:'button',onClick:()=>openPanel(sessionId,step)},icon(symbol),h('span',{className:'ff-shortcut-label'},label)))),error?h('div',{className:'ff-sidebar-help',role:'alert'},h('p',null,error),h('a',{href:'/form-fill/?session='+encodeURIComponent(sessionId)+(sessionTasks.has(sessionId)?'#task='+sessionTasks.get(sessionId):''),target:'_blank',rel:'noopener noreferrer'},'打开独立填表页面'),h('p',null,'独立页面生成的指令请复制到对话框后发送。')):null);
    return h('div',{ref,'data-form-fill-session':sessionId},h(Hero,{sessionId}),mount?portal(content,mount):content);
   }
   function WorkbenchTab({scope,store,tab,visible}){
    const id=scope.sessionId,frame=React.useRef(null),ready=React.useRef(false);
    const [view,setView]=React.useState(()=>views.get(id)||{id,step:'import'});
    const [src]=React.useState(()=>'/form-fill/?workspace='+encodeURIComponent(ctx.workspaces?.list?.getSnapshot?.().items?.find(w=>w.sessionIds?.includes(id))?.workspaceId||'')+'&session='+encodeURIComponent(id)+(sessionTasks.has(id)?'#task='+sessionTasks.get(id):''));
    React.useEffect(()=>{
     const update=()=>{const next=views.get(id);if(next)setView(next)};viewListeners.add(update);
     const detach=sidebar?.attach(scope,store,tab);return()=>{viewListeners.delete(update);detach?.()};
    },[id,store,tab.id]);
    React.useEffect(()=>{
     const sync=()=>{frame.current?.contentWindow?.postMessage({type:'ff-theme',theme:theme()},location.origin)};
     const observer=new MutationObserver(sync);observer.observe(document.documentElement,{attributes:true,attributeFilter:['class','style','data-ds-dark-theme']});const media=matchMedia('(prefers-color-scheme:dark)');media.addEventListener('change',sync);sync();
     return()=>{observer.disconnect();media.removeEventListener('change',sync)};
    },[]);
    React.useEffect(()=>{if(ready.current)frame.current?.contentWindow?.postMessage({type:'ff-navigate',step:view.step},location.origin)},[view]);
    React.useEffect(()=>{
     const receive=async event=>{
      if(event.origin!==location.origin||event.source!==frame.current?.contentWindow)return;
      if(event.data?.type==='ff-open-origin'){const target=event.data.sessionId;const known=ctx.workspaces?.list?.getSnapshot?.().items?.some(w=>w.sessionIds?.includes(target));try{if(current()!==id||!owned(target)||!known||typeof ctx.sessions.open!=='function')throw Error('来源会话不可用');await ctx.sessions.open(target)}catch{frame.current?.contentWindow?.postMessage({type:'ff-origin-unavailable'},location.origin)}return}
      if(event.data?.type==='ff-capabilities'){frame.current.contentWindow.postMessage({type:'ff-capabilities-result',mappingDraft:2},location.origin);return}
      if(event.data?.type==='ff-view'&&ready.current&&['import','rules','identity','preview','download','history'].includes(event.data.step)){views.set(view.id,{id:view.id,step:event.data.step});return}
      if(event.data?.type==='ff-wizard-state'){if(!event.data.open&&event.data.focusComposer)setTimeout(()=>{if(current()===view.id)document.querySelector('[data-composer-card] textarea, [data-composer-card] [contenteditable=true]')?.focus()},0);return}
      if(event.data?.type==='ff-task'&&/^[a-f0-9-]{36}$/.test(event.data.taskId)){sessionTasks.set(view.id,event.data.taskId);return}
      if(event.data?.type!=='ff-draft'||current()!==view.id)return;
      const {taskId,revision,requirements}=event.data;
      if(!/^[a-f0-9-]{36}$/.test(taskId)||!Number.isSafeInteger(revision))return;
      let ok=false;
      try{
       const shell=ctx.conversation?.input?.shell?.(view.id);
       if(!shell?.setDraft)throw Error('missing input');
       const prompt=String(event.data.summary||'填写已上传表格中的空白字段，保留原值，核验后生成新副本。').slice(0,1000)+'\n'+String(requirements||'').slice(0,1000)+'\n执行关联：调用 form_fill_enrich，taskId='+taskId+'，expectedRevision='+revision+(event.data.retryOnly===true?'，mode=retry（只重试失败、取消或未开始的查询，保留成功结果）':'')+'。字段范围以工作台确认设置为准。';
       const readDraft=()=>shell.state?.getSnapshot?.()?.draft??document.querySelector('[data-composer-card] textarea')?.value;
       let draft=readDraft();if(typeof draft!=='string')throw Error('cannot read draft');
       const mode=event.data.mode;
       const prior=lastDrafts.get(view.id),unchanged=draft===prior?.value;
       if(initialDraft.isTemplate(view.id,draft))draft='';
       if(draft.trim()&&!unchanged&&(!['replace','append'].includes(mode)||event.data.expectedDraft!==draft)){
        frame.current.contentWindow.postMessage({type:'ff-draft-conflict',draft},location.origin);return;
       }
       const prefix=unchanged?prior.prefix:mode==='append'?draft+'\n\n':'';
       const next=prefix+prompt;
       if(shell.setDraft(next)===false)throw Error('draft rejected');lastDrafts.set(view.id,{value:next,prefix});
       await ctx.sessions.open(view.id);ok=true;
       document.querySelector('[data-composer-card] textarea, [data-composer-card] [contenteditable=true]')?.focus();
      }catch{}
      frame.current?.contentWindow?.postMessage({type:'ff-draft-result',ok},location.origin);
     };
     window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);
    },[view?.id]);

    if(!owned(id))return h('p',null,'请从 AI填表入口打开对应业务会话。');
    return h('section',{className:'ff-ui ff-tab-content','data-ff-theme':theme(),'aria-label':'AI填表工作台'},
     h('div',{className:'ff-tab-head'},h('div',{className:'ff-brand'},mark(),h('h2',null,'AI填表工作台'))),
     h('iframe',{ref:frame,title:'AI填表任务',src,onLoad:()=>{ready.current=true;frame.current.contentWindow.postMessage({type:'ff-theme',theme:theme()},location.origin);frame.current.contentWindow.postMessage({type:'ff-navigate',step:(views.get(id)||view).step},location.origin)}}));
   }
   const connect=scope=>{
    try{const adapter=createSidebarAdapter(scope.betterSidebar,props=>h(WorkbenchTab,{...props,key:props.scope.sessionId}),icon());sidebar=adapter;sidebarError='';const disconnect=()=>{if(sidebar===adapter)sidebar=undefined;adapter.dispose()};scope.effect?.(()=>disconnect);disposers.push(disconnect)}catch(error){sidebarError=error.message}
   };
   if(ctx.inject)ctx.inject(['betterSidebar'],connect);else if(ctx.betterSidebar)connect(ctx);
   disposers.push(installSubmittedWorkbenchBridge(ctx.sessions,openPanel));
   register('conversation.input.dock',Menu);
   register('conversation.input.overlay',props=>owned(props.sessionId)?h('div',{className:'ff-ui','data-ff-theme':theme()},h('button',{className:'ff-prompt',type:'button',onClick:()=>openPanel(props.sessionId,'wizard')},icon('spark'),'提示词生成')):null);
   ctx.effect?.(()=>()=>{activePlugin=false;for(const dispose of disposers)dispose();viewListeners.clear();views.clear();sessionTasks.clear();lastDrafts.clear()});
  }
  return {createSidebarAdapter,installSubmittedWorkbenchBridge,createInitialDraftController,INITIAL_TEMPLATE_ID,INITIAL_TEMPLATE_TEXT,name:'form-fill-agent',inject:['slots','sessions','workspaces','conversation'],apply};
 }
});
