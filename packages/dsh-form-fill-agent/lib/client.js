window.__ModuleLoader__.load({
 id: 'dsh-form-fill-agent',
 factory(require) {
  function apply(ctx) {
   let React, portal;
   try { React=require('react');portal=require('react-dom').createPortal; } catch {}
   if(typeof React?.createElement!=='function'||!ctx.slots?.inject||!ctx.slots?.register)return;
   const h=React.createElement,prefix='session-dsh-form-fill-agent-';
   const owned=id=>typeof id==='string'&&id.startsWith(prefix);
   const disposers=[],sessionTasks=new Map();let panel=null;
   const current=()=>ctx.sessions?.list?.getSnapshot?.().current;
   function register(name,component){ctx.slots.inject(name,()=>ctx.slots.register({name,id:'form-fill-agent',order:120},component))}
   function openPanel(id,step='import'){
    if(!owned(id))return;
    panel?.({id,step});
   }
   async function start(){
    const list=ctx.workspaces?.list?.getSnapshot?.(),items=list?.items||[];
    const workspace=items.find(w=>w.sessionIds?.includes(current()))||items.find(w=>w.workspaceId===list?.recentWorkspaceId)||items[0];
    if(!workspace||!ctx.sessions?.create) { window.open('/form-fill/','_blank','noopener');return; }
    const id=prefix+crypto.randomUUID();
    const result=await ctx.sessions.create({workspaceId:workspace.workspaceId,sessionId:id});
    if(result!==id)throw Error('宿主不支持独立业务会话');
    await ctx.sessions.open(id);
    ctx.conversation?.input?.shell?.(id)?.setDraft('请帮我填写表格中的空白字段，先核验填写预览，再生成新副本。');
   }
   register('sidebar.footer.action',()=>h('a',{href:'/form-fill/',target:'_blank',rel:'noopener noreferrer',onClick:async e=>{
    if(!ctx.sessions?.create)return;e.preventDefault();try{await start()}catch{window.open('/form-fill/','_blank','noopener')}
   }},'▦ AI填表'));
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
    const content=h('div',{style:{padding:'10px',display:'flex',gap:'8px',flexWrap:'wrap'}},h('strong',null,'AI填表'),...[
     ['导入表格','import'],['字段设置','rules'],['主体核验','identity'],['填写预览','preview'],['任务历史','history']
    ].map(([label,step])=>h('button',{key:step,type:'button',onClick:()=>openPanel(sessionId,step)},label)));
    return h('div',{ref},mount?portal(content,mount):content);
   }
   function Panel(){
    const [view,setView]=React.useState(null),frame=React.useRef(null),[active,setActive]=React.useState(current()),[wide,setWide]=React.useState(innerWidth>=1100);
    React.useEffect(()=>{const resize=()=>setWide(innerWidth>=1100);window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[]);
    React.useEffect(()=>{panel=setView;const timer=setInterval(()=>setActive(current()),200);return()=>{panel=null;clearInterval(timer)}},[]);
    React.useEffect(()=>{if(view&&current()!==view.id)setView(null)},[active,view?.id]);
    React.useEffect(()=>{frame.current?.contentWindow?.postMessage({type:'ff-navigate',step:view?.step},location.origin)},[view?.step]);
    React.useEffect(()=>{
     const receive=async event=>{
      if(event.origin!==location.origin||event.source!==frame.current?.contentWindow||current()!==view?.id)return;
      if(event.data?.type==='ff-task'&&/^[a-f0-9-]{36}$/.test(event.data.taskId)){sessionTasks.set(view.id,event.data.taskId);return}
      if(event.data?.type!=='ff-draft')return;
      const {taskId,revision,requirements}=event.data;
      if(!/^[a-f0-9-]{36}$/.test(taskId)||!Number.isSafeInteger(revision))return;
      let ok=false;
      try{
       const shell=ctx.conversation?.input?.shell?.(view.id);
       if(!shell?.setDraft)throw Error('missing input');
       const prompt='请使用企查查填写任务，调用 form_fill_enrich，taskId='+taskId+'，expectedRevision='+revision+'。只填空白，完成后在工作台预览，由我确认写回。'+String(requirements||'').slice(0,1000);
       if(shell.setDraft(prompt)===false)throw Error('draft rejected');
       await ctx.sessions.open(view.id);ok=true;
       document.querySelector('[data-composer-card] textarea, [data-composer-card] [contenteditable=true]')?.focus();
      }catch{}
      frame.current?.contentWindow?.postMessage({type:'ff-draft-result',ok},location.origin);
     };
     window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);
    },[view?.id]);
    React.useEffect(()=>{
     if(!view)return;
     const container=document.querySelector('[data-composer-card]')?.closest('[data-phase]')||document.querySelector('[data-slot="conversation"]'),previous=container?.style.paddingRight;
     const adjust=()=>{if(container)container.style.paddingRight=innerWidth>=1100?'calc(min(48vw, 640px) + 1px)':previous||''};
     adjust();window.addEventListener('resize',adjust);return()=>{window.removeEventListener('resize',adjust);if(container)container.style.paddingRight=previous};
    },[view?.id]);
    if(!view||active!==view.id)return null;
    return portal(h('section',{'aria-label':'AI填表工作台',style:{position:'fixed',right:0,top:0,bottom:0,width:wide?'min(48vw, 640px)':'100%',zIndex:1000,background:'Canvas',color:'CanvasText',display:'flex',flexDirection:'column',borderLeft:'1px solid #71818c'}},
     h('div',{style:{padding:'10px',display:'flex',justifyContent:'space-between'}},h('strong',null,'AI填表 · 当前任务'),h('button',{onClick:()=>setView(null)},'关闭工作台')),
     h('iframe',{ref:frame,title:'AI填表任务',src:'/form-fill/?session='+encodeURIComponent(view.id)+(sessionTasks.has(view.id)?'#task='+sessionTasks.get(view.id):''),onLoad:()=>frame.current.contentWindow.postMessage({type:'ff-navigate',step:view.step},location.origin),style:{border:0,width:'100%',flex:1}})),document.body);
   }
   register('conversation.input.dock',Menu);
   register('conversation.input.overlay',props=>owned(props.sessionId)?h('button',{type:'button',onClick:()=>openPanel(props.sessionId,'identity')},'提示词生成'):null);
   register('shell.overlay',Panel);
   ctx.effect?.(()=>()=>{for(const dispose of disposers)dispose()});
  }
  return {name:'form-fill-agent',inject:['slots','sessions','workspaces','conversation'],apply};
 }
});
