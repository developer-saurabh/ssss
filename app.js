(()=>{"use strict";
const $=id=>document.getElementById(id),fmt=(n,d=0)=>Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:d,minimumFractionDigits:d}),cr=n=>"₹ "+fmt((Number(n)||0)/1e7,2)+" Cr",money=n=>"₹ "+fmt(n,2),esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const STORE="dbotBusinessPlan",SCHEMA=2,RATE_UNITS=new Set(["₹/sq.ft."]);
const PHASES={manual:"Monthly values",percent:"% of Total",formula:"Formula (month-wise)",none:"Total only"};
const FORMULA_HELP="Excel-style formula. Start with =. Use row codes (A1, B2…), project inputs (SALEABLE_AREA, BUILTUP_AREA, CARPET_AREA, PLOT_AREA, SALES_UNITS, AVG_UNIT_AREA), + - * / ^ %, SUM(A1:A3), IF, ROUND, MIN, MAX, AVERAGE, IFERROR, MSP, MSP_AMOUNT.";
const sum=a=>a.reduce((x,y)=>x+(+y||0),0);
const evenPct=n=>{if(!n)return[];const b=Math.floor(10000/n)/100,a=Array(n).fill(b);a[n-1]=+(100-b*(n-1)).toFixed(2);return a};

/* ---------------- State ---------------- */
const S={tab:"revenue",view:"monthly",collapsed:new Set(),
slabs:[{upto:15000,rate:21000},{upto:30000,rate:25000},{upto:null,rate:28000}],
sections:[
{id:"revenue",name:"1. Revenue (Sales)",flow:"inflow",items:[
{id:"sales_area",name:"Sales Area (sq.ft.)",unit:"sq.ft.",formula:false,phase:"manual",base:0,monthly:[3500,4000,4500,4500,4500,4500,4500,4500,4500,4500,4500,3500]},
{id:"sales_units",name:"Sales Unit Nos",unit:"Nos.",formula:false,phase:"manual",base:0,monthly:[18,20,24,24,24,24,24,24,24,24,24,26]},
{id:"sales_msp",name:"Sales MSP (₹/sq.ft.)",unit:"₹/sq.ft.",formula:true,phase:"formula",expr:"IF(A1=0,0,A4/A1)",base:0},
{id:"sales_amount",name:"Sales Amount",unit:"₹",formula:true,phase:"formula",expr:"MSP_AMOUNT(A1)",base:0}]},
{id:"construction",name:"2. Construction Cost",flow:"outflow",items:[
{id:"civil_rate",name:"Civil Construction Cost (₹/sq.ft.)",unit:"₹/sq.ft.",formula:false,phase:"none",base:3500},
{id:"civil_total",name:"Total Construction Cost",unit:"₹",formula:true,phase:"percent",expr:"BUILTUP_AREA*B1",base:0,pct:[4,6,8,10,10,10,10,10,10,8,8,6]}]},
{id:"approval",name:"3. Approval Cost",flow:"outflow",items:[
{id:"approval_stat",name:"Approvals & Statutory",unit:"₹",formula:false,phase:"percent",base:150000000,pct:[40,20,10,10,5,5,5,5,0,0,0,0]}]},
{id:"other",name:"4. Other Costs",flow:"outflow",items:[
{id:"marketing",name:"Marketing & Sales",unit:"₹",formula:true,phase:"formula",expr:"A4*5%",base:0},
{id:"contingency",name:"Contingency",unit:"₹",formula:false,phase:"percent",base:75000000,pct:[8,8,8,8,8,8,8,8,9,9,9,9]}]}]};
let pending=null,timer,renderTimer;

function toast(t){$("toast").textContent=t;$("toast").classList.add("show");clearTimeout(timer);timer=setTimeout(()=>$("toast").classList.remove("show"),2500)}
function project(){let a=+$("saleableArea").value||0,u=+$("salesUnits").value||0;return{CARPET_AREA:+$("carpetArea").value||0,SALEABLE_AREA:a,BUILTUP_AREA:+$("builtupArea").value||0,PLOT_AREA:+$("plotArea").value||0,SALES_UNITS:u,AVG_UNIT_AREA:u?a/u:0}}
function months(){let a=$("startDate").value,b=$("endDate").value;if(!a||!b)return[];let d=new Date(a+"T00:00:00"),e=new Date(b+"T00:00:00");if(e<d)return[];d=new Date(d.getFullYear(),d.getMonth(),1);e=new Date(e.getFullYear(),e.getMonth(),1);let out=[];while(d<=e&&out.length<120){out.push({year:d.getFullYear(),month:d.getMonth(),label:d.toLocaleDateString("en-IN",{month:"short",year:"2-digit"})});d.setMonth(d.getMonth()+1)}return out}
function items(){return S.sections.flatMap(s=>s.items.map(i=>({...i,section:s})))}
function allItems(){return S.sections.flatMap(s=>s.items)}
function getItem(sec,id){return S.sections.find(s=>s.id===sec)?.items.find(i=>i.id===id)}
const isMoney=it=>it.unit==="₹"||it.unit==="%";
const additive=it=>it.unit==="%"||!RATE_UNITS.has(it.unit);
const dispUnit=it=>it.unit==="%"?"₹":it.unit;
function allowed(it){if(it.unit==="%")return[];return additive(it)?(it.formula?["formula","percent"]:["manual","percent"]):(it.formula?["formula","none"]:["none","manual"])}
function defaultPhase(u){return u==="₹"?"percent":RATE_UNITS.has(u)?"none":u==="%"?"none":"manual"}
function fixPhase(it){const a=allowed(it);if(a.length&&!a.includes(it.phase))it.phase=a[0]}
function normalize(){const n=months().length;S.sections.forEach(s=>{s.flow=s.flow||(s.id==="revenue"?"inflow":"outflow");s.items.forEach(i=>{i.monthly=Array.isArray(i.monthly)?i.monthly:[];i.pct=Array.isArray(i.pct)?i.pct:[];i.base=+i.base||0;i.formula=!!i.formula;i.expr=i.expr||"";if(!i.phase)i.phase=defaultPhase(i.unit);fixPhase(i)})});resize(n)}
function resize(n=months().length){allItems().forEach(i=>{["monthly","pct"].forEach(k=>{i[k]=i[k]||[];while(i[k].length<n)i[k].push(0);if(i[k].length>n)i[k].length=n})})}

/* ---------------- MSP slabs: tiered on cumulative AREA SOLD ---------------- */
function slabList(){let out=[],prev=0;S.slabs.forEach((s,i)=>{let last=i===S.slabs.length-1,hi=last?Infinity:Math.max(prev,+s.upto||0);out.push({lo:prev,hi,rate:+s.rate||0});prev=hi});return out}
function msp(a){const l=slabList();for(const s of l)if(a<=s.hi)return s.rate;return l.length?l[l.length-1].rate:0}
function slabAmount(from,area){if(!(area>0))return 0;let to=from+area,amt=0;for(const s of slabList()){let ov=Math.min(to,s.hi)-Math.max(from,s.lo);if(ov>0)amt+=ov*s.rate}return amt}

/* ---------------- Excel-style formula engine ---------------- */
const letter=i=>{let s="";i++;while(i>0){let m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26)}return s};
function codeMap(){let m=new Map;S.sections.forEach((s,si)=>s.items.forEach((it,ii)=>m.set(it.id,letter(si)+(ii+1))));return m}
function tokenize(src){let s=String(src??"").trim().replace(/^=+/,""),t=[],i=0;while(i<s.length){let c=s[i],rest=s.slice(i),m;
 if(/\s/.test(c)){i++;continue}
 if(c==="#")throw new Error("#REF! A referenced row was deleted");
 if((m=/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(rest))){t.push({t:"num",v:parseFloat(m[0])});i+=m[0].length;continue}
 if((m=/^[A-Za-z_][A-Za-z0-9_]*/.exec(rest))){t.push({t:"id",v:m[0].toUpperCase()});i+=m[0].length;continue}
 if((m=/^(<=|>=|<>|==|!=)/.exec(rest))){t.push({t:"op",v:m[0]==="=="?"=":m[0]==="!="?"<>":m[0]});i+=2;continue}
 if("+-*/^%(),:<>=".includes(c)){t.push({t:"op",v:c});i++;continue}
 if(c===";"){t.push({t:"op",v:","});i++;continue}
 throw new Error("#SYNTAX! Invalid character '"+c+"'")}return t}
function parse(src){const tk=tokenize(src);let p=0;const isOp=v=>tk[p]&&tk[p].t==="op"&&tk[p].v===v,next=()=>tk[p++],expect=v=>{if(!isOp(v))throw new Error("#SYNTAX! Expected '"+v+"'");p++};
 const cmp=()=>{let l=add();while(tk[p]&&tk[p].t==="op"&&["=","<>","<",">","<=",">="].includes(tk[p].v)){let o=next().v;l={k:"bin",o,l,r:add()}}return l};
 const add=()=>{let l=mul();while(isOp("+")||isOp("-")){let o=next().v;l={k:"bin",o,l,r:mul()}}return l};
 const mul=()=>{let l=pow();while(isOp("*")||isOp("/")){let o=next().v;l={k:"bin",o,l,r:pow()}}return l};
 const pow=()=>{let l=un();while(isOp("^")){next();l={k:"bin",o:"^",l,r:un()}}return l};
 const un=()=>{if(isOp("-")){next();return{k:"neg",a:un()}}if(isOp("+")){next();return un()}return post()};
 const post=()=>{let a=prim();while(isOp("%")){next();a={k:"pct",a}}return a};
 const prim=()=>{let x=next();if(!x)throw new Error("#SYNTAX! Incomplete formula");
  if(x.t==="num")return{k:"num",v:x.v};
  if(x.t==="id"){if(isOp("(")){next();let args=[];if(!isOp(")")){args.push(cmp());while(isOp(",")){next();args.push(cmp())}}expect(")");return{k:"fn",n:x.v,args}}
   if(isOp(":")){next();let y=next();if(!y||y.t!=="id")throw new Error("#SYNTAX! Invalid range");return{k:"range",a:x.v,b:y.v}}
   return{k:"ref",n:x.v}}
  if(x.t==="op"&&x.v==="("){let e=cmp();expect(")");return e}
  throw new Error("#SYNTAX! Unexpected '"+x.v+"'")};
 if(!tk.length)return{k:"num",v:0};
 const ast=cmp();if(p<tk.length)throw new Error("#SYNTAX! Unexpected '"+tk[p].v+"'");return ast}
const astCache=new Map;
function getAst(src){const k=String(src??"");if(!astCache.has(k)){try{astCache.set(k,{ast:parse(k)})}catch(e){astCache.set(k,{err:e.message})}}return astCache.get(k)}
function expandRange(a,b){const ra=/^([A-Z]+)(\d+)$/.exec(a),rb=/^([A-Z]+)(\d+)$/.exec(b);if(!ra||!rb||ra[1]!==rb[1])throw new Error("#REF! Range must be within one section, e.g. B1:B4");let lo=Math.min(+ra[2],+rb[2]),hi=Math.max(+ra[2],+rb[2]),out=[];for(let i=lo;i<=hi;i++)out.push(ra[1]+i);return out}
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const one=v=>{if(Array.isArray(v))throw new Error("#VALUE! A range can only be used inside a function like SUM");return v};
function ev(n,ctx){switch(n.k){
 case"num":return n.v;
 case"ref":if(n.n==="TRUE")return 1;if(n.n==="FALSE")return 0;if(!has(ctx,n.n))throw new Error("#NAME? Unknown name "+n.n);return ctx[n.n];
 case"neg":return-one(ev(n.a,ctx));
 case"pct":return one(ev(n.a,ctx))/100;
 case"range":return expandRange(n.a,n.b).map(c=>{if(!has(ctx,c))throw new Error("#REF! "+c+" does not exist");return ctx[c]});
 case"bin":{const a=one(ev(n.l,ctx)),b=one(ev(n.r,ctx));switch(n.o){case"+":return a+b;case"-":return a-b;case"*":return a*b;case"/":if(b===0)throw new Error("#DIV/0! Division by zero");return a/b;case"^":return Math.pow(a,b);case"=":return Math.abs(a-b)<1e-9?1:0;case"<>":return Math.abs(a-b)<1e-9?0:1;case"<":return a<b?1:0;case">":return a>b?1:0;case"<=":return a<=b?1:0;case">=":return a>=b?1:0}}
 case"fn":return callFn(n,ctx)}throw new Error("#SYNTAX!")}
function callFn(n,ctx){const A=n.args;
 if(n.n==="IF"){if(A.length<2)throw new Error("#N/A IF needs at least 2 arguments");return one(ev(A[0],ctx))?one(ev(A[1],ctx)):(A[2]?one(ev(A[2],ctx)):0)}
 if(n.n==="IFERROR"){try{const v=one(ev(A[0],ctx));if(!Number.isFinite(v))throw 0;return v}catch(e){return A[1]?one(ev(A[1],ctx)):0}}
 const v=A.flatMap(a=>{const x=ev(a,ctx);return Array.isArray(x)?x:[x]}),r=(x,d,f)=>{const k=Math.pow(10,d||0);return Math.sign(x)*f(Math.abs(x)*k+1e-9*(f===Math.round))/k};
 switch(n.n){
  case"SUM":return sum(v);case"AVERAGE":if(!v.length)throw new Error("#DIV/0! AVERAGE of nothing");return sum(v)/v.length;
  case"MIN":return v.length?Math.min(...v):0;case"MAX":return v.length?Math.max(...v):0;case"COUNT":return v.length;
  case"ROUND":return r(v[0],v[1],Math.round);case"ROUNDUP":return r(v[0],v[1],Math.ceil);case"ROUNDDOWN":return r(v[0],v[1],Math.floor);
  case"INT":return Math.floor(v[0]);case"ABS":return Math.abs(v[0]);case"SQRT":if(v[0]<0)throw new Error("#NUM! Negative square root");return Math.sqrt(v[0]);
  case"POWER":return Math.pow(v[0],v[1]);case"MOD":if(!v[1])throw new Error("#DIV/0! MOD by zero");return v[0]-v[1]*Math.floor(v[0]/v[1]);
  case"AND":return v.every(Boolean)?1:0;case"OR":return v.some(Boolean)?1:0;case"NOT":return v[0]?0:1;
  case"MSP":return msp(v[0]||0);
  case"MSP_AMOUNT":return slabAmount(ctx.CUM_SOLD_BEFORE||0,v[0]||0);
 }throw new Error("#NAME? Unknown function "+n.n+"()")}
function evalF(expr,ctx){const a=getAst(expr);if(a.err)throw new Error(a.err);const v=one(ev(a.ast,ctx));if(!Number.isFinite(v))throw new Error("#NUM! Result is not a number");return v}
function refsOf(node,out=new Set){if(!node)return out;if(node.k==="ref")out.add(node.n);else if(node.k==="range")expandRange(node.a,node.b).forEach(x=>out.add(x));else if(node.k==="fn"){if(node.n==="MSP_AMOUNT")out.add("SALES_AREA");node.args.forEach(a=>refsOf(a,out))}else{refsOf(node.a,out);refsOf(node.l,out);refsOf(node.r,out)}return out}
const shortErr=e=>{const m=/^#[A-Z\/0!?]+/.exec(e||"");return m?m[0]:"#ERROR"};

/* ---------------- Calculation ---------------- */
function calc(){const ms=months(),n=ms.length,p=project(),codes=codeMap(),all=allItems(),R={},look=new Map;
 all.forEach(it=>{R[it.id]={m:Array(n).fill(0),t:0,err:null,flat:false,ce:null};look.set(codes.get(it.id),it.id);look.set(it.id.toUpperCase(),it.id)});
 const secOf=new Map;S.sections.forEach(s=>s.items.forEach(i=>secOf.set(i.id,s)));
 // dependency graph + circular reference detection
 const deps=it=>{const d=new Set;if(it.unit==="%"){const a=it.applyOn||"";if(a.startsWith("SEC:"))S.sections.find(s=>s.id===a.slice(4))?.items.forEach(x=>{if(x.id!==it.id&&isMoney(x))d.add(x.id)});else if(a)d.add(a)}
  else if(it.formula||it.phase==="formula"){const g=getAst(it.expr);if(g.ast){try{refsOf(g.ast).forEach(r=>{if(look.has(r))d.add(look.get(r))})}catch(e){}}}return d};
 const D=new Map(all.map(it=>[it.id,deps(it)])),cyc=new Set,state=new Map,stack=[];
 const dfs=id=>{state.set(id,1);stack.push(id);for(const d of D.get(id)||[]){if(!D.has(d))continue;if(state.get(d)===1){stack.slice(stack.indexOf(d)).forEach(x=>cyc.add(x))}else if(!state.get(d))dfs(d)}stack.pop();state.set(id,2)};
 all.forEach(it=>{if(!state.get(it.id))dfs(it.id)});
 const ctxT=Object.assign(Object.create(null),p,{MONTHS:n,MONTH_INDEX:0,CUM_SOLD_BEFORE:0}),ctxM=Array.from({length:n},(_,i)=>Object.assign(Object.create(null),p,{MONTHS:n,MONTH_INDEX:i+1,CUM_SOLD_BEFORE:0}));
 const keys=it=>[codes.get(it.id),it.id.toUpperCase()],write=it=>{const r=R[it.id];keys(it).forEach(k=>{ctxT[k]=r.t;for(let i=0;i<n;i++)ctxM[i][k]=r.m[i]})};
 all.forEach(write);
 const sold=all.find(i=>i.id==="sales_area"),setCum=()=>{let c=0;for(let i=0;i<n;i++){ctxM[i].CUM_SOLD_BEFORE=c;c+=sold?(R[sold.id].m[i]||0):0}};
 const target=it=>{const a=it.applyOn||"";if(a.startsWith("SEC:")){const sec=S.sections.find(s=>s.id===a.slice(4)),o={m:Array(n).fill(0),t:0};if(!sec)throw new Error("#REF! Base section deleted");sec.items.forEach(x=>{const r=R[x.id];if(x.id!==it.id&&isMoney(x)&&!r.flat){o.t+=r.t;r.m.forEach((v,i)=>o.m[i]+=v)}});return o}
  if(!a)throw new Error("#N/A Select the cost this % applies on");const r=R[a];if(!r)throw new Error("#REF! Base item deleted");return r};
 const compute=it=>{const add=additive(it);let m=Array(n).fill(0),t=0,flat=false,err=null,ce=null;
  try{if(cyc.has(it.id))throw new Error("#CIRC! Circular reference");
   if(it.unit==="%"){const tg=target(it),pc=+it.base||0;m=tg.m.map(v=>v*pc/100);t=tg.t*pc/100}
   else if(it.phase==="manual"){m=m.map((_,i)=>+it.monthly[i]||0);t=add?sum(m):(+it.base||0)}
   else if(it.phase==="percent"){t=it.formula?evalF(it.expr,ctxT):(+it.base||0);m=m.map((_,i)=>t*(+it.pct[i]||0)/100)}
   else if(it.phase==="formula"){const g=getAst(it.expr);if(g.err)throw new Error(g.err);ce=Array(n).fill(null);m=m.map((_,i)=>{try{return evalF(it.expr,ctxM[i])}catch(e){ce[i]=e.message;return 0}});if(add)t=sum(m);else t=evalF(it.expr,ctxT)}
   else{t=it.formula?evalF(it.expr,ctxT):(+it.base||0);m=m.fill(t);flat=true}
  }catch(e){err=e.message||String(e);m=Array(n).fill(0);t=0;ce=null}
  const r=R[it.id],ch=Math.abs(r.t-t)>1e-6||m.some((v,i)=>Math.abs(v-r.m[i])>1e-6)||r.err!==err;Object.assign(r,{m,t,flat,err,ce});write(it);return ch};
 let pass=0,changed;do{setCum();changed=false;all.forEach(it=>{if(compute(it))changed=true});pass++}while(changed&&pass<all.length+3);setCum();
 const secs=S.sections.map(s=>{const m=Array(n).fill(0);let t=0;s.items.forEach(it=>{const r=R[it.id];if(isMoney(it)&&!r.flat){t+=r.t;r.m.forEach((v,i)=>m[i]+=v)}});return{sec:s,m,t}});
 const agg=f=>{const m=Array(n).fill(0);let t=0;secs.filter(x=>x.sec.flow===f).forEach(x=>{t+=x.t;x.m.forEach((v,i)=>m[i]+=v)});return{m,t}};
 const inf=agg("inflow"),out=agg("outflow"),net=inf.m.map((v,i)=>v-out.m[i]);let cc=0;const cum=net.map(v=>cc+=v);
 return{ms,n,p,codes,R,secs,inf,out,net,cum,ctxM}}

/* ---------------- Periods: Monthly / Quarterly (FY) / Annual (FY) ---------------- */
function periods(ms){if(S.view==="monthly")return ms.map((m,i)=>({label:m.label,idx:[i]}));const mp=new Map;
 ms.forEach((m,i)=>{const fy=m.month>=3?m.year:m.year-1,yy=String((fy+1)%100).padStart(2,"0");let key,label;if(S.view==="quarterly"){const q=Math.floor(((m.month+9)%12)/3)+1;key=fy+"Q"+q;label="Q"+q+" FY"+yy}else{key=String(fy);label="FY "+fy+"-"+yy}if(!mp.has(key))mp.set(key,{label,idx:[]});mp.get(key).idx.push(i)});return[...mp.values()]}
function aggCtx(per,c){if(per._ctx)return per._ctx;const x=Object.assign(Object.create(null),c.p,{MONTHS:c.n,MONTH_INDEX:per.idx[0]+1,CUM_SOLD_BEFORE:c.ctxM[per.idx[0]]?.CUM_SOLD_BEFORE||0});
 allItems().forEach(it=>{const r=c.R[it.id],s=per.idx.reduce((a,i)=>a+r.m[i],0),v=r.flat?r.t:additive(it)?s:s/per.idx.length;[c.codes.get(it.id),it.id.toUpperCase()].forEach(k=>x[k]=v)});return per._ctx=x}
function periodVal(it,per,c){const r=c.R[it.id];if(r.flat)return r.t;const s=per.idx.reduce((a,i)=>a+r.m[i],0);if(additive(it)||per.idx.length===1)return additive(it)?s:r.m[per.idx[0]];
 if(it.phase==="formula"){try{return evalF(it.expr,aggCtx(per,c))}catch(e){return 0}}return s/per.idx.length}
function valDisplay(v,unit){return unit==="₹"?cr(v):unit==="₹/sq.ft."?money(v):fmt(v,2)}

/* ---------------- Rendering ---------------- */
function targetOptions(it,c,secId){let h=`<option value="">— Apply % on —</option>`;
 h+=S.sections.filter(s=>s.id!==secId).map(s=>`<option value="SEC:${s.id}" ${it.applyOn==="SEC:"+s.id?"selected":""}>Section total: ${esc(s.name)}</option>`).join("");
 h+=allItems().filter(x=>x.id!==it.id&&isMoney(x)).map(x=>`<option value="${x.id}" ${it.applyOn===x.id?"selected":""}>${c.codes.get(x.id)} – ${esc(x.name)}</option>`).join("");return h}
function targetLabel(it,c){const a=it.applyOn||"";if(a.startsWith("SEC:"))return"Total of "+(S.sections.find(s=>s.id===a.slice(4))?.name||"?");const x=allItems().find(i=>i.id===a);return x?c.codes.get(x.id)+" "+x.name:"(not set)"}
function renderTabs(){const list=[...S.sections.map(s=>({id:s.id,label:s.name.replace(/^\d+\.\s*/,"")})),{id:"cashflow",label:"Cashflow"},{id:"all",label:"All (Single Sheet)"}];
 if(!list.some(x=>x.id===S.tab))S.tab=S.sections[0]?.id||"cashflow";
 $("tabs").innerHTML=list.map(x=>`<button type="button" class="tab ${S.tab===x.id?"active":""}" data-tab="${x.id}">${esc(x.label)}</button>`).join("")}
function renderSlabs(){const L=slabList();$("slabBody").innerHTML=S.slabs.map((s,i)=>{const last=i===S.slabs.length-1,lo=L[i].lo;
 const range=last?(i?"Above "+fmt(lo):"All area"):`<span class="inl">${i?fmt(lo+1)+" –":"Up to"} <input class="slabInput" type="number" step="any" data-field="slab" data-index="${i}" data-k="upto" value="${+s.upto||0}"></span>`;
 return`<tr><td>${i+1}</td><td>${range}</td><td><span class="inl">₹ <input class="slabInput" type="number" step="any" data-field="slab" data-index="${i}" data-k="rate" value="${+s.rate||0}"></span></td><td>${last?"":`<button type="button" class="mini" data-act="delslab" data-index="${i}" title="Remove slab">✕</button>`}</td></tr>`}).join("")}
function renderSalesSummary(c){const sa=c.R.sales_area,su=c.R.sales_units,amt=c.R.sales_amount?c.R.sales_amount.t:c.inf.t,area=sa?sa.t:0,avg=area?amt/area:0,w=[];
 $("salesAreaSummary").textContent=fmt(area)+" sq.ft.";$("salesUnitsSummary").textContent=fmt(su?su.t:0);$("salesMspSummary").textContent=money(avg)+" /sq.ft.";$("salesAmountSummary").textContent=cr(amt);$("appliedMsp").textContent=money(avg)+" /sq.ft.";
 if(area>c.p.SALEABLE_AREA+1e-6)w.push("Area sold exceeds saleable area by "+fmt(area-c.p.SALEABLE_AREA)+" sq.ft.");if(su&&su.t>c.p.SALES_UNITS)w.push("Units sold exceed total units by "+fmt(su.t-c.p.SALES_UNITS));
 $("mspBasis").innerHTML=esc(`Slab applied on cumulative area sold: ${fmt(area)} of ${fmt(c.p.SALEABLE_AREA)} sq.ft.`)+(w.length?`<br><span class="warn">⚠ ${esc(w.join(" · "))}</span>`:"")}
function rowHtml(sec,it,c,pers){const r=c.R[it.id],du=dispUnit(it),single=S.view==="monthly",d=`data-sec="${sec.id}" data-id="${it.id}"`,isP=it.unit==="%";
 let val;if(isP)val=`<span class="inl"><input class="manualInput" data-field="base" ${d} type="number" step="any" value="${+it.base||0}"> %</span>`;
 else if(it.formula)val=`<input class="formulaInput${r.err?" bad":""}" data-field="expr" ${d} value="${esc("="+(it.expr||"0"))}" title="${esc(r.err||FORMULA_HELP)}" spellcheck="false" autocomplete="off">`;
 else if(it.phase==="manual"&&additive(it))val=`<input class="manualInput" readonly value="${+r.t.toFixed(4)}" title="Total = sum of monthly values">`;
 else val=`<input class="manualInput" data-field="base" ${d} type="number" step="any" value="${+it.base||0}" title="${it.phase==="percent"?"Enter the Total – months are calculated from the % phasing":"Value"}">`;
 const ph=isP?`<select data-field="applyOn" ${d}>${targetOptions(it,c,sec.id)}</select>`:`<select data-field="phase" ${d}>${allowed(it).map(k=>`<option value="${k}" ${it.phase===k?"selected":""}>${PHASES[k]}</option>`).join("")}</select>${it.phase==="percent"?`<button type="button" class="mini" data-act="even" ${d} title="Spread 100% evenly across all months">Even</button>`:""}`;
 const ps=!isP&&it.phase==="percent"?sum(it.pct.slice(0,c.n)):null;
 let tot=r.err?`<span class="errtxt" title="${esc(r.err)}">${esc(shortErr(r.err))}</span>`:valDisplay(r.t,du);
 if(isP&&!r.err)tot+=`<div class="subval">${fmt(it.base,2)}% of ${esc(targetLabel(it,c))}</div>`;
 if(ps!==null)tot+=`<div class="subval ${Math.abs(ps-100)>0.01?"bad":"ok"}" title="Phasing must total 100%">Σ ${fmt(ps,2)}%</div>`;
 if(r.err)tot+=`<div class="subval bad">${esc(r.err.replace(/^#[A-Z\/0!?]+\s*/,""))}</div>`;
 const cells=pers.map(p=>{const i=p.idx[0];
  if(r.flat)return`<td class="calc muted" title="Rate – applies to all months">–</td>`;
  if(single&&!isP&&it.phase==="manual")return`<td><input class="manualInput cell" type="number" step="any" data-field="month" ${d} data-index="${i}" value="${+(it.monthly[i]||0)}"></td>`;
  if(single&&!isP&&it.phase==="percent")return`<td><span class="inl"><input class="manualInput cell pctInput" type="number" step="any" data-field="pct" ${d} data-index="${i}" value="${+(it.pct[i]||0)}"> %</span><div class="subval">${valDisplay(r.m[i],du)}</div></td>`;
  const ce=single&&r.ce&&r.ce[i];if(ce)return`<td class="calc errtxt" title="${esc(ce)}">${esc(shortErr(ce))}</td>`;
  const extra=!single&&!isP&&it.phase==="percent"?`<div class="subval">${fmt(p.idx.reduce((a,j)=>a+(+it.pct[j]||0),0),2)}%</div>`:"";
  return`<td class="calc">${valDisplay(periodVal(it,p,c),du)}${extra}</td>`}).join("");
 return`<tr${r.err?' class="rowerr"':""}><td class="code" title="Use this code in formulas">${c.codes.get(it.id)}</td><td>${esc(it.name)} <small class="unit">${esc(isP?"% of cost":it.unit||"")}</small></td><td><span class="tag ${it.formula||isP?"formulaTag":"manualTag"}">${isP?"Percentage":it.formula?"Formula":"Manual"}</span></td><td>${val}</td><td><input class="toggle" type="checkbox" data-act="formula" ${d} ${it.formula?"checked":""} ${isP?"disabled":""}></td><td>${ph}</td><td class="${it.formula||isP?"calc":""}">${tot}</td>${cells}<td><button type="button" data-act="delete" ${d} title="Delete item">⋮</button></td></tr>`}
function sectionHtml(sec,c,pers){const st=c.secs[S.sections.indexOf(sec)],closed=S.collapsed.has(sec.id);
 let h=`<article class="section"><div class="sectionhead"><button type="button" class="collapse" data-act="collapse" data-sec="${sec.id}">${closed?"›":"⌄"}</button><div class="sectionname">${esc(sec.name)}<span class="flowtag ${sec.flow}">${sec.flow==="inflow"?"Inflow":"Outflow"}</span></div><div class="sectotal">Total: ${cr(st.t)}</div><button type="button" class="btn" data-act="add" data-sec="${sec.id}">＋ Add Item</button></div>`;
 if(!closed){h+=`<div class="sectionbody"><table class="datatable"><thead><tr><th>#</th><th>Item</th><th>Input Type</th><th>Formula / Value</th><th>Formula</th><th>Phasing</th><th>Total</th>${pers.map(p=>`<th class="month">${esc(p.label)}</th>`).join("")}<th>⋮</th></tr></thead><tbody>`;
  sec.items.forEach(it=>h+=rowHtml(sec,it,c,pers));if(!sec.items.length)h+=`<tr><td colspan="${8+pers.length}" class="empty">No items yet – click “＋ Add Item”.</td></tr>`;
  h+=`<tr class="subtotal"><td></td><td colspan="5">Section Total (₹)</td><td>${cr(st.t)}</td>${pers.map(p=>`<td>${cr(p.idx.reduce((a,i)=>a+st.m[i],0))}</td>`).join("")}<td></td></tr></tbody></table></div>`}
 return h+"</article>"}
function cashflowHtml(c,pers){const ps=(m,p)=>p.idx.reduce((a,i)=>a+m[i],0),row=(label,m,t,cls="")=>`<tr class="${cls}"><td>${esc(label)}</td><td class="${cls==="net"&&t<0?"neg":""}">${cr(t)}</td>${pers.map(p=>{const v=ps(m,p);return`<td class="${cls==="net"&&v<0?"neg":""}">${cr(v)}</td>`}).join("")}</tr>`,grp=t=>`<tr class="grp"><td colspan="${2+pers.length}">${t}</td></tr>`;
 let b=grp("A. Cash Inflow");c.secs.filter(x=>x.sec.flow==="inflow").forEach(x=>b+=row(x.sec.name,x.m,x.t));b+=row("Total Inflow (A)",c.inf.m,c.inf.t,"subtotal");
 b+=grp("B. Cash Outflow");c.secs.filter(x=>x.sec.flow==="outflow").forEach(x=>b+=row(x.sec.name,x.m,x.t));b+=row("Total Outflow (B)",c.out.m,c.out.t,"subtotal");
 b+=row("Net Cashflow (A − B)",c.net,c.inf.t-c.out.t,"net");
 b+=`<tr class="cum"><td>Cumulative Cashflow</td><td>${cr(c.cum[c.n-1]||0)}</td>${pers.map(p=>{const v=c.cum[p.idx[p.idx.length-1]];return`<td class="${v<0?"neg":""}">${cr(v)}</td>`}).join("")}</tr>`;
 return`<article class="section"><div class="sectionhead"><div class="sectionname">Cashflow Statement</div><div class="sectotal">Net: ${cr(c.inf.t-c.out.t)}</div></div><div class="sectionbody"><table class="datatable cashflow"><thead><tr><th>Particulars</th><th>Total</th>${pers.map(p=>`<th class="month">${esc(p.label)}</th>`).join("")}</tr></thead><tbody>${b}</tbody></table></div></article>`}
function render(){const c=calc(),pers=periods(c.ms);$("duration").textContent=c.n+" Months";$("avgUnitArea").value=fmt(c.p.AVG_UNIT_AREA,2);
 renderSlabs();renderSalesSummary(c);renderTabs();
 let h="";if(S.tab!=="cashflow")h+=(S.tab==="all"?S.sections:S.sections.filter(s=>s.id===S.tab)).map(s=>sectionHtml(s,c,pers)).join("");
 if(S.tab==="cashflow"||S.tab==="all")h+=cashflowHtml(c,pers);
 if(!c.n)h=`<p class="empty">Enter a valid Project Start and End date to see the month-wise plan.</p>`+h;
 $("sections").innerHTML=h;["monthly","quarterly","annual"].forEach(v=>$(v+"Btn").classList.toggle("active",S.view===v));summary(c)}
function summary(c){const sales=c.inf.t,cost=c.out.t,margin=sales-cost;$("totalSales").textContent=cr(sales);$("totalCost").textContent=cr(cost);$("grossMargin").textContent=cr(margin);$("marginPct").textContent=(sales?margin/sales*100:0).toFixed(2)+"%"}

/* ---------------- Keep focus when re-rendering (Tab / Enter move like Excel) ---------------- */
function focusKey(el){if(!el||!el.dataset||!el.dataset.field)return null;const s=el.dataset;return{field:s.field,id:s.id||"",index:s.index??"",k:s.k||""}}
function restoreFocus(k){if(!k)return;let sel=`[data-field="${k.field}"]`;if(k.id)sel+=`[data-id="${k.id}"]`;if(k.index!=="")sel+=`[data-index="${k.index}"]`;if(k.k)sel+=`[data-k="${k.k}"]`;const el=document.querySelector(sel);if(el){el.focus();if(el.tagName==="INPUT")try{el.select()}catch(e){}}}
function scheduleRender(){clearTimeout(renderTimer);renderTimer=setTimeout(()=>{const k=focusKey(document.activeElement);render();restoreFocus(k)},0)}

/* ---------------- Actions ---------------- */
function toggleFormula(it,on){const c=calc(),r=c.R[it.id];
 if(on){it.formula=true;if(!it.expr||it.expr==="0")it.expr=String(+(+r.t).toFixed(4));if(it.phase==="manual"){if(additive(it)){it.pct=r.t?r.m.map(v=>+(v/r.t*100).toFixed(4)):evenPct(c.n);it.phase="percent"}else it.phase="formula"}}
 else{it.formula=false;it.base=+(+r.t).toFixed(4);if(it.phase==="formula"){it.monthly=r.m.map(v=>+v.toFixed(4));it.phase="manual"}}
 fixPhase(it)}
function rewriteRefs(expr,rep){return String(expr||"").replace(/[A-Za-z_][A-Za-z0-9_]*/g,w=>{const u=w.toUpperCase();return rep.has(u)&&rep.get(u)!==u?rep.get(u):w})}
function deleteItem(sec,id){const before=codeMap(),s=S.sections.find(x=>x.id===sec);s.items=s.items.filter(x=>x.id!==id);const after=codeMap(),rep=new Map;before.forEach((code,iid)=>rep.set(code,after.get(iid)||"#REF!"));rep.set(id.toUpperCase(),"#REF!");
 allItems().forEach(it=>{if(it.expr)it.expr=rewriteRefs(it.expr,rep);if(it.applyOn===id)it.applyOn=""});render();toast("Item deleted – formulas updated")}
function addItem(sec,name,unit,applyOn){const n=months().length,it={id:"item_"+Date.now()+"_"+Math.floor(Math.random()*999),name,unit,formula:false,expr:"",base:0,monthly:Array(n).fill(0),pct:Array(n).fill(0),phase:defaultPhase(unit),applyOn:unit==="%"?applyOn||"":""};
 S.sections.find(s=>s.id===sec).items.push(it);S.collapsed.delete(sec);if(S.tab!=="all")S.tab=sec;render();toast("Item added")}
function syncApplyOn(){const isP=$("newItemUnit").value==="%";$("applyOnWrap").style.display=isP?"":"none";if(isP)$("newItemApplyOn").innerHTML=targetOptions({id:"__new",applyOn:""},calc(),pending)}
function save(){try{localStorage.setItem(STORE,JSON.stringify({schema:SCHEMA,project:$("projectName").value,version:$("version").value,start:$("startDate").value,end:$("endDate").value,inputs:project(),view:S.view,slabs:S.slabs,sections:S.sections}));toast("Draft saved in this browser")}catch(e){toast("Unable to save draft")}}
function load(){try{const d=JSON.parse(localStorage.getItem(STORE)||"null");if(!d||d.schema!==SCHEMA)return false;
 if(d.start)$("startDate").value=d.start;if(d.end)$("endDate").value=d.end;const I=d.inputs||{};
 [["carpetArea","CARPET_AREA"],["saleableArea","SALEABLE_AREA"],["builtupArea","BUILTUP_AREA"],["plotArea","PLOT_AREA"],["salesUnits","SALES_UNITS"]].forEach(([id,k])=>{if(I[k]!=null)$(id).value=I[k]});
 [["projectName",d.project],["version",d.version]].forEach(([id,v])=>{if(v&&[...$(id).options].some(o=>o.value===v))$(id).value=v});
 if(Array.isArray(d.slabs)&&d.slabs.length)S.slabs=d.slabs;if(Array.isArray(d.sections)&&d.sections.length)S.sections=d.sections;if(["monthly","quarterly","annual"].includes(d.view))S.view=d.view;return true}catch(e){return false}}

/* ---------------- Excel export: ONE sheet (inputs + inflow + outflow + cashflow + summary) ---------------- */
function exportXlsx(){if(!window.XLSX){toast("Excel library did not load. Check internet and refresh.");return}
 const X=XLSX.utils,c=calc(),pers=periods(c.ms),np=pers.length,ws={},FC=7,ZM="#,##0",Z2="#,##0.00",ZP="0.00%";let r=0,maxC=FC+Math.max(np,1)-1;
 const A=(R,C)=>X.encode_cell({r:R,c:C}),put=(R,C,v,o={})=>{if(v===undefined||v===null||v==="")return;const cell=typeof v==="number"?{t:"n",v:Number.isFinite(v)?v:0}:{t:"s",v:String(v)};if(o.z)cell.z=o.z;if(o.f)cell.f=o.f;ws[A(R,C)]=cell;if(C>maxC)maxC=C};
 const zOf=it=>isMoney(it)?ZM:Z2,psum=(m,p)=>p.idx.reduce((a,i)=>a+m[i],0),sumF=R=>np?{f:`SUM(${A(R,FC)}:${A(R,FC+np-1)})`}:{};
 put(r,0,"DBOT BUSINESS PLAN");r+=2;
 put(r,0,"PROJECT DETAILS");put(r,3,"PROJECT INPUTS");put(r,6,"MSP SLABS (on cumulative area sold)");r++;const top=r,L=slabList();
 [["Project",$("projectName").value],["Version",$("version").value],["Start Date",$("startDate").value],["End Date",$("endDate").value],["Duration (Months)",c.n],["View",{monthly:"Monthly",quarterly:"Quarterly (FY)",annual:"Annual (FY)"}[S.view]]].forEach((x,i)=>{put(top+i,0,x[0]);put(top+i,1,x[1])});
 [["Carpet Area (sq.ft.)",c.p.CARPET_AREA],["Saleable Area (sq.ft.)",c.p.SALEABLE_AREA],["Built-up Area (sq.ft.)",c.p.BUILTUP_AREA],["Plot Area (sq.ft.)",c.p.PLOT_AREA],["No. of Sales Units",c.p.SALES_UNITS],["Avg. Unit Area (sq.ft.)",c.p.AVG_UNIT_AREA]].forEach((x,i)=>{put(top+i,3,x[0]);put(top+i,4,x[1],{z:Z2})});
 put(top,6,"Slab");put(top,7,"Area Range (sq.ft.)");put(top,8,"Rate (₹/sq.ft.)");L.forEach((s,i)=>{put(top+1+i,6,i+1);put(top+1+i,7,s.hi===Infinity?(i?"Above "+fmt(s.lo):"All area"):(i?fmt(s.lo+1):"0")+" – "+fmt(s.hi));put(top+1+i,8,s.rate,{z:ZM})});
 r=top+Math.max(6,L.length+1)+1;
 ["Code","Item","Unit","Input Type","Formula / Value","Phasing","Total",...pers.map(p=>p.label)].forEach((h,i)=>put(r,i,h));r++;
 const sumRows=(R,rows,vals)=>{for(let j=-1;j<np;j++){const C=FC+j;put(R,C,vals[j+1],{z:ZM,f:rows.length?rows.map(x=>A(x,C)).join("+"):"0"})}},flowRow={};
 [["inflow","A. CASH INFLOW","TOTAL CASH INFLOW (A)",c.inf],["outflow","B. CASH OUTFLOW","TOTAL CASH OUTFLOW (B)",c.out]].forEach(([fl,label,totLabel,tot])=>{put(r,0,label);r++;const subRows=[];
  S.sections.forEach((sec,si)=>{if(sec.flow!==fl)return;const st=c.secs[si],money=[];put(r,1,sec.name);r++;
   sec.items.forEach(it=>{const res=c.R[it.id],isP=it.unit==="%";
    put(r,0,c.codes.get(it.id));put(r,1,it.name);put(r,2,isP?"% of cost":it.unit);put(r,3,isP?"Percentage":it.formula?"Formula":"Manual");
    put(r,4,isP?`${+it.base||0}% of ${targetLabel(it,c)}`:it.formula?"="+it.expr:(it.phase==="manual"&&additive(it)?res.t:+it.base||0),{z:zOf(it)});put(r,5,isP?"Month-wise on base cost":PHASES[it.phase]);
    if(res.err)put(r,6,res.err);else if(res.flat)put(r,6,res.t,{z:zOf(it)});
    else{pers.forEach((p,j)=>put(r,FC+j,periodVal(it,p,c),{z:zOf(it)}));put(r,6,res.t,additive(it)?{z:zOf(it),...sumF(r)}:{z:zOf(it)});if(isMoney(it))money.push(r)}r++;
    if(!isP&&it.phase==="percent"){put(r,1,"   ↳ Phasing %");pers.forEach((p,j)=>put(r,FC+j,p.idx.reduce((a,i)=>a+(+it.pct[i]||0),0)/100,{z:ZP}));put(r,6,sum(it.pct)/100,{z:ZP,...sumF(r)});r++}});
   put(r,1,"Total – "+sec.name);sumRows(r,money,[st.t,...pers.map(p=>psum(st.m,p))]);subRows.push(r);r+=2});
  put(r,1,totLabel);sumRows(r,subRows,[tot.t,...pers.map(p=>psum(tot.m,p))]);flowRow[fl]=r;r+=2});
 const nr=r;put(r,1,"NET CASHFLOW (A − B)");for(let j=-1;j<np;j++){const C=FC+j;put(r,C,j<0?c.inf.t-c.out.t:psum(c.net,pers[j]),{z:ZM,f:`${A(flowRow.inflow,C)}-${A(flowRow.outflow,C)}`})}r++;
 put(r,1,"CUMULATIVE CASHFLOW");pers.forEach((p,j)=>{const C=FC+j;put(r,C,c.cum[p.idx[p.idx.length-1]],{z:ZM,f:j?`${A(r,C-1)}+${A(nr,C)}`:A(nr,C)})});if(np)put(r,6,c.cum[c.n-1],{z:ZM,f:A(r,FC+np-1)});r+=2;
 put(r,0,"PROJECT SUMMARY");r++;const sr=r,ms=c.inf.t-c.out.t;
 put(r,1,"Total Sales Amount (₹)");put(r,6,c.inf.t,{z:ZM,f:A(flowRow.inflow,6)});r++;put(r,1,"Total Project Cost (₹)");put(r,6,c.out.t,{z:ZM,f:A(flowRow.outflow,6)});r++;
 put(r,1,"Gross Margin (₹)");put(r,6,ms,{z:ZM,f:`${A(sr,6)}-${A(sr+1,6)}`});r++;put(r,1,"Margin %");put(r,6,c.inf.t?ms/c.inf.t:0,{z:ZP,f:`IF(${A(sr,6)}=0,0,${A(sr+2,6)}/${A(sr,6)})`});
 ws["!ref"]=X.encode_range({s:{r:0,c:0},e:{r,c:maxC}});ws["!merges"]=[{s:{r:0,c:0},e:{r:0,c:6}}];ws["!cols"]=[{wch:8},{wch:40},{wch:10},{wch:22},{wch:28},{wch:22},{wch:18},...Array(Math.max(np,2)).fill(0).map(()=>({wch:15}))];
 const wb=X.book_new();X.book_append_sheet(wb,ws,"Business Plan");XLSX.writeFile(wb,"DBOT_Business_Plan_"+new Date().toISOString().slice(0,10)+".xlsx");toast("Excel exported – single sheet")}

/* ---------------- Init ---------------- */
function init(){const restored=load();normalize();
 ["startDate","endDate"].forEach(id=>$(id).addEventListener("change",()=>{resize();render()}));["carpetArea","saleableArea","builtupArea","plotArea","salesUnits"].forEach(id=>$(id).addEventListener("input",render));
 document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>$(b.dataset.close).close()));
 $("addHeaderBtn").onclick=()=>{$("newHeaderName").value="";$("newHeaderFlow").value="outflow";$("headerDialog").showModal()};
 $("confirmHeader").onclick=e=>{e.preventDefault();let name=$("newHeaderName").value.trim();if(!name)return toast("Enter header name");const id="header_"+Date.now();S.sections.push({id,name,flow:$("newHeaderFlow").value,items:[]});S.tab=id;$("headerDialog").close();render();toast("Header added")};
 $("newItemUnit").addEventListener("change",syncApplyOn);
 $("sections").addEventListener("click",e=>{let b=e.target.closest("[data-act]");if(!b)return;let{act,sec,id}=b.dataset;
  if(act==="collapse"){S.collapsed.has(sec)?S.collapsed.delete(sec):S.collapsed.add(sec);render()}
  if(act==="add"){pending=sec;$("itemDialogSection").textContent="Add sub-heading under "+S.sections.find(s=>s.id===sec).name;$("newItemName").value="";$("newItemUnit").value="₹";syncApplyOn();$("itemDialog").showModal()}
  if(act==="even"){const it=getItem(sec,id);if(it){it.pct=evenPct(months().length);render();toast("100% spread evenly")}}
  if(act==="delete"&&confirm("Delete this item?"))deleteItem(sec,id)});
 $("confirmItem").onclick=e=>{e.preventDefault();let n=$("newItemName").value.trim();if(!n)return toast("Enter item name");const u=$("newItemUnit").value;if(u==="%"&&!$("newItemApplyOn").value)return toast("Select the cost this % applies on");addItem(pending,n,u,$("newItemApplyOn").value);$("itemDialog").close()};
 const onChange=e=>{const t=e.target,ds=t.dataset;
  if(ds.field==="slab"){const s=S.slabs[+ds.index];if(s)s[ds.k]=+t.value||0;scheduleRender();return}
  const it=getItem(ds.sec,ds.id);if(!it)return;
  if(ds.act==="formula")toggleFormula(it,t.checked);else if(ds.field==="base")it.base=+t.value||0;else if(ds.field==="month")it.monthly[+ds.index]=+t.value||0;else if(ds.field==="pct")it.pct[+ds.index]=+t.value||0;
  else if(ds.field==="expr")it.expr=t.value.trim().replace(/^=+/,"")||"0";else if(ds.field==="phase"){it.phase=t.value;if(it.phase==="percent"&&!sum(it.pct)){const c=calc(),r=c.R[it.id];it.pct=r.t?r.m.map(v=>+(v/r.t*100).toFixed(4)):evenPct(c.n);if(!it.formula)it.base=+(+r.t).toFixed(4)}}
  else if(ds.field==="applyOn")it.applyOn=t.value;else return;scheduleRender()};
 $("sections").addEventListener("change",onChange);$("slabBody").addEventListener("change",onChange);
 $("slabBody").addEventListener("click",e=>{const b=e.target.closest("[data-act='delslab']");if(b){S.slabs.splice(+b.dataset.index,1);render()}});
 $("addSlabBtn").onclick=()=>{const L=S.slabs,prev=L.length>1?+L[L.length-2].upto||0:0;L.splice(L.length-1,0,{upto:prev+15000,rate:+L[L.length-1].rate||0});render()};
 $("sections").addEventListener("keydown",e=>{const t=e.target,f=t.dataset.field;if(e.key!=="Enter")return;if(f==="expr"){e.preventDefault();t.blur();return}
  if(["month","pct","base"].includes(f)){e.preventDefault();const list=[...document.querySelectorAll(`#sections input[data-field="${f}"]`+(f==="base"?"":`[data-index="${t.dataset.index}"]`))],nx=list[list.indexOf(t)+(e.shiftKey?-1:1)];if(nx)nx.focus();else t.blur()}});
 $("tabs").onclick=e=>{let b=e.target.closest("[data-tab]");if(b){S.tab=b.dataset.tab;render()}};
 ["monthly","quarterly","annual"].forEach(v=>$(v+"Btn").onclick=()=>{S.view=v;render()});
 $("saveBtn").onclick=save;$("submitBtn").onclick=()=>{save();toast("Demo: saved locally. Connect backend for submission.")};$("exportBtn").onclick=exportXlsx;
 render();if(restored)toast("Saved draft restored")}
document.addEventListener("DOMContentLoaded",init);
})();
