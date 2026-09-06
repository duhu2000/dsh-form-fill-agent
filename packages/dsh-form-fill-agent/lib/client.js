window.__ModuleLoader__.load({
 id: 'dsh-form-fill-agent',
 factory(require) {
  function apply(ctx) {
   let React, portal;
   try { React=require('react');portal=require('react-dom').createPortal; } catch {}
   if(typeof React?.createElement!=='function'||!ctx.slots?.inject||!ctx.slots?.register)return;
   const h=React.createElement,prefix='session-dsh-form-fill-agent-';
   const owned=id=>typeof id==='string'&&id.startsWith(prefix);
   const disposers=[],sessionTasks=new Map(),lastDrafts=new Map();let panel=null,pendingStart;
   const paths={table:'M3 4h18v16H3zM3 9h18M9 9v11',upload:'M12 16V3M7 8l5-5 5 5M4 14v7h16v-7',check:'M3 5h2v2H3zM9 6h12M3 11h2v2H3zM9 12h12M3 17h2v2H3zM9 18h12',search:'M17 17l5 5M19 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',history:'M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v6l4 2',spark:'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z'};
   const icon=(name='table')=>h('svg',{className:'ff-icon',viewBox:'0 0 24 24','aria-hidden':true},h('path',{d:paths[name]}));
   const mark=()=>h('span',{className:'ff-mark'},icon());
   const theme=()=>document.documentElement.hasAttribute('data-ds-dark-theme')?'dark':getComputedStyle(document.documentElement).colorScheme==='light'?'light':matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';
   if(typeof document!=='undefined'&&document.head?.append){const css=document.createElement('link');css.rel='stylesheet';css.href='/form-fill/brand.css';css.dataset.formFillStyle='true';document.head.append(css);disposers.push(()=>css.remove())}
   const current=()=>ctx.sessions?.list?.getSnapshot?.().current;
   function register(name,component){ctx.slots.inject(name,()=>ctx.slots.register({name,id:'form-fill-agent',order:120},component))}
   function openPanel(id,step='import'){
    if(!owned(id))return;
    panel?.({id,step});
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
    await ctx.sessions.open(id);
   }
   const launcher=()=>h('a',{className:'ff-launcher',href:'/form-fill/',target:'_blank',rel:'noopener noreferrer','aria-label':'AI填表',onClick:async e=>{
    if(!ctx.sessions?.create)return;e.preventDefault();try{await start()}catch{window.open('/form-fill/','_blank','noopener')}
   }},icon(),h('span',null,'AI填表'));
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
     let mount,original,previous;
     const sync=()=>{
      if(mount?.isConnected)return;
      const marker=[...document.querySelectorAll('[data-form-fill-session]')].find(n=>n.dataset.formFillSession===sessionId);
      const hero=marker?.closest('[data-phase="hero"]'),title=hero?.querySelector('[class*="headlineText"]');
      if(!title||!['探索未至之境','Into the Unknown'].includes(title.textContent.trim()))return;
      original=title.parentElement;previous=original.style.display;original.style.display='none';
      mount=document.createElement('div');mount.className='ff-ui ff-hero';mount.dataset.ffTheme=theme();original.before(mount);setMount(mount);
     };
     sync();const timer=setInterval(sync,200);return()=>{clearInterval(timer);mount?.remove();if(original?.style.display==='none')original.style.display=previous;setMount(null)};
    },[sessionId]);
    return mount?portal(h(React.Fragment,null,h('div',{className:'ff-brand ff-hero-brand'},mark(),h('h1',null,'AI填表智能体')),h('p',null,'上传已有表格，核对字段映射，确认后生成新副本。')),mount):null;
   }
   function Menu({sessionId}){
    const ref=React.useRef(null),[mount,setMount]=React.useState(null);
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
    ].map(([label,step,symbol])=>h('button',{key:step,type:'button',onClick:()=>openPanel(sessionId,step)},icon(symbol),label))));
    return h('div',{ref,'data-form-fill-session':sessionId},h(Hero,{sessionId}),mount?portal(content,mount):content);
   }
   function Panel(){
    const [view,setView]=React.useState(null),frame=React.useRef(null),[active,setActive]=React.useState(current()),[wide,setWide]=React.useState(innerWidth>=1100),[expanded,setExpanded]=React.useState(false),[modal,setModal]=React.useState(false);
    React.useEffect(()=>{
     const sync=()=>{const value=theme();document.querySelectorAll('.ff-ui').forEach(n=>n.dataset.ffTheme=value);frame.current?.contentWindow?.postMessage({type:'ff-theme',theme:value},location.origin)};
     const observer=new MutationObserver(sync);observer.observe(document.documentElement,{attributes:true,attributeFilter:['class','style','data-ds-dark-theme']});const media=matchMedia('(prefers-color-scheme:dark)');media.addEventListener('change',sync);sync();
     return()=>{observer.disconnect();media.removeEventListener('change',sync)};
    },[]);
    React.useEffect(()=>{const resize=()=>setWide(innerWidth>=1100);window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[]);
    React.useEffect(()=>{panel=setView;const timer=setInterval(()=>setActive(current()),200);return()=>{panel=null;clearInterval(timer)}},[]);
    React.useEffect(()=>{if(view&&current()!==view.id)setView(null);setModal(false)},[active,view?.id]);
    React.useEffect(()=>{frame.current?.contentWindow?.postMessage({type:'ff-navigate',step:view?.step},location.origin)},[view]);
    React.useEffect(()=>{
     const receive=async event=>{
      if(event.origin!==location.origin||event.source!==frame.current?.contentWindow||current()!==view?.id)return;
      if(event.data?.type==='ff-wizard-state'){setModal(event.data.open===true);if(!event.data.open&&event.data.focusComposer)setTimeout(()=>document.querySelector('[data-composer-card] textarea, [data-composer-card] [contenteditable=true]')?.focus(),0);return}
      if(event.data?.type==='ff-task'&&/^[a-f0-9-]{36}$/.test(event.data.taskId)){sessionTasks.set(view.id,event.data.taskId);return}
      if(event.data?.type!=='ff-draft')return;
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
    React.useEffect(()=>{
     if(!view||active!==view.id)return;
     const touched=new Map();
     const adjust=()=>{
      if(current()!==view.id)return;
      const marker=[...document.querySelectorAll('[data-form-fill-session]')].find(n=>n.dataset.formFillSession===view.id);
      const container=marker?document.querySelector('[data-composer-card]')?.closest('[data-phase]')||document.querySelector('[data-slot="conversation"]'):null;
      for(const node of touched.keys())if(node!==container){node.removeAttribute('data-form-fill-reserve');node.style.removeProperty('--ff-panel-inset')}
      if(!container)return;
      if(!touched.has(container))touched.set(container,container.style.getPropertyValue('--ff-panel-inset'));
      container.setAttribute('data-form-fill-reserve','true');
      container.style.setProperty('--ff-panel-inset',expanded?'calc(min(58vw, 860px) + 1px)':'calc(min(48vw, 640px) + 1px)');
     };
     adjust();const observer=new MutationObserver(adjust);observer.observe(document.body,{childList:true,subtree:true});
     return()=>{observer.disconnect();for(const [node,previous]of touched){node.removeAttribute('data-form-fill-reserve');if(previous)node.style.setProperty('--ff-panel-inset',previous);else node.style.removeProperty('--ff-panel-inset')}};
    },[view?.id,expanded,active]);
    if(!view||active!==view.id)return null;
    return portal(h('section',{className:'ff-ui ff-panel','data-ff-theme':theme(),'aria-label':'AI填表工作台',style:{width:modal?'100%':wide?(expanded?'min(58vw, 860px)':'min(48vw, 640px)'):'100%',...(modal?{background:'transparent',border:0}:{})}},
     h('div',{className:'ff-panel-head',hidden:modal},h('div',{className:'ff-brand'},mark(),h('h2',null,'AI填表')),h('div',{className:'ff-panel-actions'},h('button',{onClick:()=>setExpanded(v=>!v)},expanded?'收起展开':'展开工作台'),h('button',{onClick:()=>setView(null)},'关闭工作台'))),
     h('iframe',{ref:frame,title:'AI填表任务',src:'/form-fill/?session='+encodeURIComponent(view.id)+(sessionTasks.has(view.id)?'#task='+sessionTasks.get(view.id):''),onLoad:()=>{frame.current.contentWindow.postMessage({type:'ff-theme',theme:theme()},location.origin);frame.current.contentWindow.postMessage({type:'ff-navigate',step:view.step},location.origin)}})),document.body);
   }
   register('conversation.input.dock',Menu);
   register('conversation.input.overlay',props=>owned(props.sessionId)?h('div',{className:'ff-ui','data-ff-theme':theme()},h('button',{className:'ff-prompt',type:'button',onClick:()=>openPanel(props.sessionId,'wizard')},icon('spark'),'提示词生成')):null);
   register('shell.overlay',Panel);
   ctx.effect?.(()=>()=>{for(const dispose of disposers)dispose()});
  }
  return {name:'form-fill-agent',inject:['slots','sessions','workspaces','conversation'],apply};
 }
});
