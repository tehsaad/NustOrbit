/**
 * JavaScript injected into the Qalam WebView on demand (when the student taps
 * "Pull page"). It runs inside the student's own logged-in Qalam session, reads
 * the tables on the page they're viewing, normalizes them to Orbit's columns,
 * and posts the result back to the app. It never touches the password, makes no
 * network requests, and only reads the page already on screen — the on-device
 * analog of signing into Qalam in a browser and copying your own data.
 *
 * Column aliases are best-effort until calibrated against real Qalam HTML; the
 * app shows what was detected before it sends, so a wrong guess is visible.
 */
export const SCRAPE_JS = `
(function(){
  try {
    var COLUMNS = {
      marks: ["course","assessment","category","obtained","max","weight","class_average"],
      attendance: ["course","date","time","status","sessions"],
      timetable: ["course","day","start","end","room","instructor","kind"],
      results: ["term","course","credit_hours","grade","grade_points"],
      deadlines: ["course","title","due","max","weight","url"]
    };
    var ALIASES = {
      course:["course","subject","course code","course title","course name","code"],
      assessment:["assessment","item","activity","component","quiz","exam","name","title"],
      category:["category","type","kind","assessment type"],
      obtained:["obtained","obtained marks","marks obtained","score","secured","achieved","your marks"],
      max:["max","max marks","total","total marks","out of"],
      weight:["weight","weightage","absolute weightage","percentage","wtg"],
      class_average:["class average","average","avg","class avg"],
      date:["date","class date","lecture date"],
      time:["time","slot","start time"],
      status:["status","attendance","remarks","present absent"],
      sessions:["sessions","contact hours","credit hour","duration","hours"],
      day:["day","weekday"], start:["start","from","start time"], end:["end","to","end time"],
      room:["room","venue","location","class room"], instructor:["instructor","teacher","faculty"],
      term:["term","semester","session"], credit_hours:["credit hours","credits","cr hrs","ch"],
      grade:["grade","letter grade","gr"], grade_points:["grade points","gp","points","quality points"],
      title:["title","assignment","task","name"], due:["due","due date","deadline","submission date"], url:["url","link"]
    };
    function norm(s){ return String(s==null?"":s).toLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\\s+/g," "); }
    function match(h,col){ var a=ALIASES[col]||[col]; h=norm(h); if(!h) return 0; var i; for(i=0;i<a.length;i++) if(h===a[i]) return 3; for(i=0;i<a.length;i++) if(a[i].length>=3&&h.length>=3&&(h.indexOf(a[i])===0||a[i].indexOf(h)===0)) return 2; for(i=0;i<a.length;i++) if(a[i].length>=3&&h.length>=3&&h.indexOf(a[i])>=0) return 1; return 0; }
    function mapCols(headers,kind){ var cols=COLUMNS[kind],m={},used={},c,i; for(c=0;c<cols.length;c++){ var best=-1,bs=0; for(i=0;i<headers.length;i++){ if(used[i]) continue; var s=match(headers[i],cols[c]); if(s>bs){bs=s;best=i;} } if(best>=0){ m[cols[c]]=best; used[best]=1; } } return m; }
    function normTables(tables,kind){ var cols=COLUMNS[kind]; var empty={kind:kind,rows:[],mapping:{},unmatched:[],matched:[]}; if(!cols) return empty; var chosen=-1,cmap={},cscore=-1,i; for(i=0;i<tables.length;i++){ var t=tables[i]; if(!t||!t.headers||!t.rows||!t.rows.length) continue; var m=mapCols(t.headers,kind); var score=Object.keys(m).length; var anchor=("course" in m)||(kind==="results"&&("term" in m)); if(anchor&&score>cscore){cscore=score;chosen=i;cmap=m;} } if(chosen<0) return empty; var table=tables[chosen],mapping={},keys=Object.keys(cmap),k; for(k=0;k<keys.length;k++) mapping[keys[k]]=table.headers[cmap[keys[k]]]; var usedIdx={}; for(k=0;k<keys.length;k++) usedIdx[cmap[keys[k]]]=1; var unmatched=[],h; for(h=0;h<table.headers.length;h++) if(!usedIdx[h]&&String(table.headers[h]).trim()) unmatched.push(String(table.headers[h]).trim()); var rows=[],r; for(r=0;r<table.rows.length;r++){ var row=table.rows[r],any=false,x; for(x=0;x<row.length;x++) if(String(row[x]).trim()!==""){any=true;break;} if(!any) continue; var out={}; for(k=0;k<keys.length;k++){ var v=row[cmap[keys[k]]]; out[keys[k]]=v==null?"":String(v).trim(); } rows.push(out); } return {kind:kind,rows:rows,mapping:mapping,unmatched:unmatched,matched:keys}; }
    function detectKind(tables){ var best=null,bs=1,ks=Object.keys(COLUMNS),i; for(i=0;i<ks.length;i++){ var res=normTables(tables,ks[i]); if(res.matched.length>bs){bs=res.matched.length;best=ks[i];} } return best; }
    function cell(el){ return (el.textContent||"").replace(/\\s+/g," ").trim(); }
    function readTables(){ var out=[],ts=document.querySelectorAll("table"),i; for(i=0;i<ts.length;i++){ var trs=ts[i].querySelectorAll("tr"); if(!trs.length) continue; var hi=0,j; for(j=0;j<trs.length;j++){ if(trs[j].querySelector("th")){hi=j;break;} } var headers=[],hc=trs[hi].children,c; for(c=0;c<hc.length;c++) headers.push(cell(hc[c])); var rows=[],r; for(r=hi+1;r<trs.length;r++){ var rc=trs[r].children,row=[],c2; for(c2=0;c2<rc.length;c2++) row.push(cell(rc[c2])); rows.push(row); } if(headers.length&&rows.length) out.push({headers:headers,rows:rows}); } return out; }
    var tables=readTables();
    var kind=detectKind(tables);
    var res=kind?normTables(tables,kind):{kind:null,rows:[],mapping:{},unmatched:[]};
    window.ReactNativeWebView.postMessage(JSON.stringify({type:"scrape",url:location.href,loggedIn:!document.querySelector('input[type=password]'),tableCount:tables.length,kind:res.kind,rows:res.rows,mapping:res.mapping,unmatched:res.unmatched}));
  } catch(e){ window.ReactNativeWebView.postMessage(JSON.stringify({type:"error",error:String(e&&e.message||e)})); }
  true;
})();
`;
