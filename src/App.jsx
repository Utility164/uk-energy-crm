import { useState, useEffect, useRef } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore, collection, onSnapshot, doc,
  setDoc, deleteDoc, query, orderBy,
} from "firebase/firestore";

// ═══════════════════════════════════════════════════════════
//  STEP 1 — PASTE YOUR FIREBASE CONFIG HERE
//  How to get it:
//  1. Go to https://console.firebase.google.com
//  2. Create a project (e.g. "uk-energy-crm")
//  3. Click "Add App" → Web → Register App
//  4. Copy the firebaseConfig object and paste below
//  5. In Firebase Console → Firestore Database → Create (test mode)
// ═══════════════════════════════════════════════════════════
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCgPlWt-rDmQcLlTtPLM9Jq-MxsquM1mpI",
  authDomain:        "uk-energy-crm.firebaseapp.com",
  projectId:         "uk-energy-crm",
  storageBucket:     "uk-energy-crm.firebasestorage.app",
  messagingSenderId: "344785535474",
  appId:             "1:344785535474:web:e052ad50cb8b8122bfab6b",
  measurementId:     "G-ZDLWK3VWXC",
};

const IS_CONFIGURED = FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY";

// ═══════════════════════════════════════════════════════════
//  DESIGN TOKENS
// ═══════════════════════════════════════════════════════════
const S = {
  navy:"#08121E", teal:"#00BFB3", tealD:"#009E93",
  tealGlow:"rgba(0,191,179,0.15)", amber:"#F59E0B", amberD:"#D97706",
  amberGlow:"rgba(245,158,11,0.15)", danger:"#EF4444",
  dangerGlow:"rgba(239,68,68,0.15)", green:"#10B981",
  greenGlow:"rgba(16,185,129,0.12)", purple:"#8B5CF6",
  purpleGlow:"rgba(139,92,246,0.12)", card:"#0F1E2E",
  cardL:"#162840", cardLL:"#1C3050", border:"#1E3448",
  muted:"#6B829A", mutedL:"#8BA0B8", off:"#D8E8F4",
  white:"#FFFFFF", slate:"#2D4A66",
};

// ═══════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════
const uid       = (p="CUS") => `${p}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
const today     = ()        => new Date().toISOString().split("T")[0];
const fmtDate   = s         => s ? new Date(s).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}) : "—";
const daysUntil = d         => d ? Math.ceil((new Date(d)-new Date())/86400000) : null;
const nearExpiry = c => {
  const vals=[c.elec1ContractEnd,c.elec2ContractEnd,c.gas1ContractEnd,c.gas2ContractEnd]
    .map(d=>daysUntil(d)).filter(d=>d!==null&&d>=0);
  return vals.length ? Math.min(...vals) : null;
};

const SUPPLIERS=[
  "British Gas","EDF Energy","E.ON","npower","Scottish Power","SSE",
  "Octopus Energy","Shell Energy","Ovo Energy","Corona Energy",
  "Total Gas & Power","Haven Power","Other"
];
const CONTRACT_TERMS=["","1 Year","2 Years","3 Years","4 Years","5 Years"];
const PAYMENT_METHODS=["Direct Debit","Cash / Cheque"];

// ═══════════════════════════════════════════════════════════
//  SEED / FALLBACK DATA
// ═══════════════════════════════════════════════════════════
const INITIAL_USERS=[
  {id:"MGR-001",username:"manager",password:"Manager@2025",role:"manager",name:"Campaign Manager",email:"manager@ukenergy.co.uk",active:true,createdAt:"2025-01-01"},
  {id:"AGT-001",username:"agent01",password:"Agent01@2025",role:"agent",  name:"Sarah Johnson",  email:"sarah@ukenergy.co.uk",  active:true,createdAt:"2025-01-01"},
  {id:"AGT-002",username:"agent02",password:"Agent02@2025",role:"agent",  name:"Omar Khan",      email:"omar@ukenergy.co.uk",   active:true,createdAt:"2025-01-01"},
];
const SEED_CUSTOMERS=[
  {id:"CUS-A1F3B2",agentId:"AGT-001",agentName:"Sarah Johnson",date:"2025-06-01",businessName:"Hartley Builders Ltd",contactPersonName:"James Hartley",telephoneNo:"0161 234 9999",landlineNo:"0161 234 5678",mobileNo:"07712 345678",supplyAddress:"14 Birchwood Close, Manchester",postcode:"M23 4PQ",commercialRes:"Commercial",companyRegNo:"12345678",elec1Supplier:"British Gas",elec1SupplyNo:"S1200000123456",elec1OfferRate:"24.5",elec1SCharge:"45",elec1Day:"24.5",elec1Night:"12.2",elec1EveWend:"18.0",elec1ContractTerm:"2 Years",elec1NameOnBill:"Hartley Builders Ltd",elec1ContractEnd:"2025-08-15",elec1MeterSerial:"E1234567",elec1AnnualConsumption:"22000",elec2Supplier:"",elec2SupplyNo:"",elec2OfferRate:"",elec2SCharge:"",elec2Day:"",elec2Night:"",elec2EveWend:"",elec2ContractTerm:"",elec2NameOnBill:"",elec2ContractEnd:"",elec2MeterSerial:"",elec2AnnualConsumption:"",gas1Supplier:"British Gas",gas1OfferedSCharge:"28",gas1UnitRate:"6.8",gas1AQ:"55000",gas1MPRN:"7812345678",gas1ContractEnd:"2025-08-15",gas1ContractStart:"2023-08-15",gas1ContractTerm:"2 Years",gas1SiteNoBG:"BG001",gas1NameOnBill:"Hartley Builders Ltd",gas1MeterRead:"12345",gas1MeterSerial:"G9876543",gas2Supplier:"",gas2OfferedSCharge:"",gas2UnitRate:"",gas2AQ:"",gas2MPRN:"",gas2ContractEnd:"",gas2ContractStart:"",gas2ContractTerm:"",gas2SiteNoBG:"",gas2NameOnBill:"",gas2MeterRead:"",gas2MeterSerial:"",bankName:"HSBC",accountTitle:"Hartley Builders Ltd",branchAddress:"45 King St, Manchester",sortCode:"40-12-34",accountNo:"12345678",billPaymentMethod:"Direct Debit",landlordName:"",directorsHomeAddress:"22 Oak Ave, Manchester M1 2AB",directorsDOB:"1975-03-14",nameOfNewCustomer:"",remarks:"Priority customer. Renewal call before August.",renewalStatus:"Pending",checkedByManager:"",checkedByEditor:"",createdAt:"2025-06-01"},
  {id:"CUS-B9D4C1",agentId:"AGT-002",agentName:"Omar Khan",    date:"2025-01-10",businessName:"Mehta Retail Group",  contactPersonName:"Priya Mehta",  telephoneNo:"0121 987 0000",landlineNo:"0121 987 6543",mobileNo:"07834 567890",supplyAddress:"7 Elm Street, Birmingham",           postcode:"B15 2TH",commercialRes:"Commercial",companyRegNo:"87654321",elec1Supplier:"EDF Energy",  elec1SupplyNo:"S2300001234567",elec1OfferRate:"22.8",elec1SCharge:"42",elec1Day:"22.8",elec1Night:"11.0",elec1EveWend:"",    elec1ContractTerm:"3 Years",elec1NameOnBill:"Mehta Retail Group",  elec1ContractEnd:"2026-01-10",elec1MeterSerial:"E2345678",elec1AnnualConsumption:"35000",elec2Supplier:"",elec2SupplyNo:"",elec2OfferRate:"",elec2SCharge:"",elec2Day:"",elec2Night:"",elec2EveWend:"",elec2ContractTerm:"",elec2NameOnBill:"",elec2ContractEnd:"",elec2MeterSerial:"",elec2AnnualConsumption:"",gas1Supplier:"EDF Energy",  gas1OfferedSCharge:"26",gas1UnitRate:"6.5",gas1AQ:"42000",gas1MPRN:"8923456789",gas1ContractEnd:"2026-01-10",gas1ContractStart:"2023-01-10",gas1ContractTerm:"3 Years",gas1SiteNoBG:"",     gas1NameOnBill:"Mehta Retail Group",  gas1MeterRead:"23456",gas1MeterSerial:"G8765432",gas2Supplier:"",gas2OfferedSCharge:"",gas2UnitRate:"",gas2AQ:"",gas2MPRN:"",gas2ContractEnd:"",gas2ContractStart:"",gas2ContractTerm:"",gas2SiteNoBG:"",gas2NameOnBill:"",gas2MeterRead:"",gas2MeterSerial:"",bankName:"Lloyds Bank",accountTitle:"Mehta Retail Group",branchAddress:"100 High St, Birmingham",sortCode:"30-98-76",accountNo:"87654321",billPaymentMethod:"Direct Debit",landlordName:"Birmingham Properties Ltd",directorsHomeAddress:"50 Maple Rd, Birmingham B1 3CD",directorsDOB:"1980-07-22",nameOfNewCustomer:"",remarks:"2 sites. Second meter to be added.",renewalStatus:"Not Due",checkedByManager:"",checkedByEditor:"",createdAt:"2025-01-10"},
];

// ═══════════════════════════════════════════════════════════
//  FIREBASE HOOK  — live Firestore sync when configured
// ═══════════════════════════════════════════════════════════
function useFirestore() {
  const [customers, setCustomers] = useState(SEED_CUSTOMERS);
  const [users,     setUsers]     = useState(INITIAL_USERS);
  const [fbReady,   setFbReady]   = useState(false);
  const [fbError,   setFbError]   = useState("");
  const unsubsRef = useRef([]);

  useEffect(()=>{
    if (!IS_CONFIGURED) return;

    const load = async () => {
      try {
        const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
        const db  = getFirestore(app);
        window._fbDb  = db;
        window._fbLib = { collection, doc, setDoc, deleteDoc, query, orderBy };

        const u1 = onSnapshot(
          query(collection(db,"customers"), orderBy("createdAt","desc")),
          async snap => {
            if (snap.empty) {
              const { doc:d2, setDoc:s2 } = window._fbLib;
              await Promise.all(SEED_CUSTOMERS.map(c => s2(d2(db,"customers",c.id), c)));
              return;
            }
            setCustomers(snap.docs.map(d=>({id:d.id,...d.data()})));
          },
          err  => setFbError(err.message)
        );
        const u2 = onSnapshot(
          collection(db,"users"),
          async snap => {
            if (snap.empty) {
              // First time setup: seed default manager + agent accounts into Firestore
              const { doc:d2, setDoc:s2 } = window._fbLib;
              await Promise.all(INITIAL_USERS.map(u => s2(d2(db,"users",u.id), u)));
              return; // onSnapshot will fire again automatically once seeded
            }
            setUsers(snap.docs.map(d=>({id:d.id,...d.data()})));
          },
          err  => setFbError(err.message)
        );
        unsubsRef.current = [u1,u2];
        setFbReady(true);
      } catch(e){ setFbError(e.message); }
    };

    load();
    return () => unsubsRef.current.forEach(u=>u());
  },[]);

  const fbSet = async (col,id,data) => {
    if (!IS_CONFIGURED || !window._fbDb) {
      if (col==="customers") setCustomers(p=>p.find(x=>x.id===id)?p.map(x=>x.id===id?data:x):[data,...p]);
      if (col==="users")     setUsers(p=>p.find(x=>x.id===id)?p.map(x=>x.id===id?data:x):[...p,data]);
      return;
    }
    const {doc,setDoc}=window._fbLib;
    await setDoc(doc(window._fbDb,col,id),data);
  };

  const fbDel = async (col,id) => {
    if (!IS_CONFIGURED || !window._fbDb) {
      if (col==="customers") setCustomers(p=>p.filter(x=>x.id!==id));
      if (col==="users")     setUsers(p=>p.filter(x=>x.id!==id));
      return;
    }
    const {doc,deleteDoc}=window._fbLib;
    await deleteDoc(doc(window._fbDb,col,id));
  };

  return { customers, users, fbReady, fbError,
    saveCustomer: c => fbSet("customers",c.id,c),
    delCustomer:  id=> fbDel("customers",id),
    saveUser:     u => fbSet("users",u.id,u),
    delUser:      id=> fbDel("users",id),
  };
}

// ═══════════════════════════════════════════════════════════
//  SHARED UI PRIMITIVES
// ═══════════════════════════════════════════════════════════
const Btn=({children,color=S.teal,onClick,disabled,sm,outline})=>(
  <button onClick={onClick} disabled={disabled} style={{
    background:outline?"transparent":disabled?S.cardLL:color,
    color:outline?color:(color===S.amber||color===S.teal)?S.navy:S.white,
    border:outline?`1.5px solid ${color}`:"none",borderRadius:8,
    padding:sm?"5px 12px":"9px 20px",fontSize:sm?12:13,fontWeight:700,
    cursor:disabled?"not-allowed":"pointer",fontFamily:"Inter,system-ui,sans-serif",
    opacity:disabled?0.45:1,
  }}>{children}</button>
);

const Badge=({label})=>{
  const col={"Not Due":S.muted,"Pending":S.amber,"Called":S.purple,"Renewed":S.green,"Declined":S.danger}[label]||S.muted;
  return <span style={{background:col+"25",color:col,fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,letterSpacing:"0.04em",textTransform:"uppercase"}}>{label}</span>;
};

const RolePill=({role})=>(
  <span style={{background:role==="manager"?S.amberGlow:S.tealGlow,color:role==="manager"?S.amber:S.teal,fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,textTransform:"uppercase",letterSpacing:"0.05em"}}>
    {role==="manager"?"👑 Manager":"🧑‍💼 Agent"}
  </span>
);

const Inp=({label,k,f,set,type="text",placeholder="",span=1})=>(
  <label style={{display:"block",gridColumn:`span ${span}`}}>
    <div style={{color:S.muted,fontSize:11,marginBottom:4,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em"}}>{label}</div>
    <input type={type} value={f[k]||""} placeholder={placeholder} onChange={e=>set(k,e.target.value)}
      style={{width:"100%",boxSizing:"border-box",background:S.cardLL,border:`1px solid ${S.border}`,borderRadius:8,padding:"8px 12px",color:S.white,fontSize:13,fontFamily:"Inter,system-ui,sans-serif",outline:"none"}}/>
  </label>
);

const Sel=({label,k,f,set,options,span=1})=>(
  <label style={{display:"block",gridColumn:`span ${span}`}}>
    <div style={{color:S.muted,fontSize:11,marginBottom:4,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em"}}>{label}</div>
    <select value={f[k]||""} onChange={e=>set(k,e.target.value)}
      style={{width:"100%",background:S.cardLL,border:`1px solid ${S.border}`,borderRadius:8,padding:"8px 12px",color:S.white,fontSize:13,fontFamily:"Inter,system-ui,sans-serif",outline:"none"}}>
      {options.map(o=><option key={o}>{o}</option>)}
    </select>
  </label>
);

const G=({cols=2,children,style={}})=>(
  <div style={{display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:12,...style}}>{children}</div>
);

const Sec=({title,color=S.teal,icon,children})=>(
  <div style={{marginBottom:24}}>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,paddingBottom:8,borderBottom:`1px solid ${color}35`}}>
      {icon&&<span style={{fontSize:16}}>{icon}</span>}
      <span style={{color,fontWeight:700,fontSize:12,textTransform:"uppercase",letterSpacing:"0.08em"}}>{title}</span>
    </div>
    {children}
  </div>
);

const DBox=({title,color=S.teal,children})=>(
  <div style={{background:S.cardL,borderRadius:12,padding:18,border:`1px solid ${color}30`}}>
    <div style={{color,fontWeight:700,fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:14}}>{title}</div>
    <div style={{display:"flex",flexDirection:"column",gap:10}}>{children}</div>
  </div>
);

const DI=({label,value,hi})=>(
  <div>
    <div style={{color:S.muted,fontSize:11,textTransform:"uppercase",letterSpacing:"0.05em"}}>{label}</div>
    <div style={{color:hi?S.teal:S.off,fontWeight:hi?600:400,fontSize:13,marginTop:2,wordBreak:"break-all"}}>{value||"—"}</div>
  </div>
);

// ═══════════════════════════════════════════════════════════
//  FIREBASE SETUP GUIDE SCREEN
// ═══════════════════════════════════════════════════════════
function FirebaseSetupGuide(){
  const steps=[
    {n:1, title:"Create Firebase Project", desc:'Go to console.firebase.google.com → "Add project" → name it (e.g. uk-energy-crm) → Continue'},
    {n:2, title:"Enable Firestore Database", desc:'In your project → Build → Firestore Database → Create database → Start in test mode → Choose region → Done'},
    {n:3, title:"Register your Web App", desc:'Project Settings (⚙️) → Your apps → Web (</) → Register app → Copy the firebaseConfig object'},
    {n:4, title:"Paste Config into the CRM", desc:'Open this file → Find FIREBASE_CONFIG at the top → Replace each "YOUR_..." value with your actual values'},
    {n:5, title:"Set Firestore Security Rules", desc:'Firestore → Rules → Replace with: allow read, write: if true; → Publish (for team use; set proper auth rules later)'},
  ];
  return(
    <div style={{minHeight:"100vh",background:S.navy,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Inter,system-ui,sans-serif",padding:24}}>
      <div style={{maxWidth:640,width:"100%"}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{fontSize:52,marginBottom:12}}>🔥</div>
          <div style={{fontSize:26,fontWeight:800,color:S.white}}>Connect Firebase</div>
          <div style={{color:S.muted,fontSize:14,marginTop:6}}>Follow these 5 steps to enable cloud storage for your CRM</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14,marginBottom:28}}>
          {steps.map(s=>(
            <div key={s.n} style={{background:S.card,borderRadius:14,padding:20,border:`1px solid ${S.border}`,display:"flex",gap:16,alignItems:"flex-start"}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:`linear-gradient(135deg,${S.teal},${S.purple})`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:16,color:S.navy,flexShrink:0}}>{s.n}</div>
              <div>
                <div style={{fontWeight:700,fontSize:15,color:S.white,marginBottom:4}}>{s.title}</div>
                <div style={{color:S.muted,fontSize:13,lineHeight:1.6}}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{background:S.cardL,borderRadius:14,padding:20,border:`1px solid ${S.teal}40`}}>
          <div style={{color:S.teal,fontWeight:700,fontSize:14,marginBottom:10}}>📋 Example FIREBASE_CONFIG</div>
          <pre style={{color:S.off,fontSize:12,lineHeight:1.8,margin:0,overflowX:"auto",fontFamily:"monospace"}}>
{`const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyABC123...",
  authDomain:        "uk-energy-crm.firebaseapp.com",
  projectId:         "uk-energy-crm",
  storageBucket:     "uk-energy-crm.appspot.com",
  messagingSenderId: "123456789012",
  appId:             "1:123456789012:web:abc123def456",
};`}
          </pre>
        </div>
        <div style={{marginTop:20,background:S.amberGlow,border:`1px solid ${S.amber}40`,borderRadius:12,padding:16,color:S.off,fontSize:13,lineHeight:1.7}}>
          <span style={{color:S.amber,fontWeight:700}}>💡 Once configured:</span> All contracts and agent accounts save instantly to Firestore. Every agent and the manager see live data — no refresh needed. Changes sync across all devices in real time.
        </div>
        <div style={{marginTop:24,textAlign:"center"}}>
          <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer"
            style={{background:`linear-gradient(135deg,${S.teal},${S.tealD})`,color:S.navy,borderRadius:10,padding:"12px 32px",fontSize:14,fontWeight:800,textDecoration:"none",display:"inline-block"}}>
            Open Firebase Console →
          </a>
          <div style={{color:S.muted,fontSize:12,marginTop:12}}>Meanwhile the CRM runs in Demo Mode with sample data below</div>
        </div>
        <div style={{marginTop:16,textAlign:"center"}}>
          <button onClick={()=>window.location.reload()} style={{background:"transparent",color:S.teal,border:`1px solid ${S.teal}`,borderRadius:8,padding:"8px 20px",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"Inter,system-ui,sans-serif"}}>
            ▶ Continue in Demo Mode
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  LOGIN SCREEN
// ═══════════════════════════════════════════════════════════
function LoginScreen({users,onLogin}){
  const [username,setUsername]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [showPass,setShowPass]=useState(false);

  const handleLogin=()=>{
    const u=users.find(u=>u.username===username.trim()&&u.password===password);
    if(!u){setError("Invalid username or password.");return;}
    if(!u.active){setError("Account deactivated. Contact your manager.");return;}
    onLogin(u);
  };

  return(
    <div style={{minHeight:"100vh",background:S.navy,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Inter,system-ui,sans-serif",padding:16}}>
      <div style={{width:"100%",maxWidth:420}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{width:68,height:68,borderRadius:18,background:`linear-gradient(135deg,${S.teal},${S.purple})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,margin:"0 auto 16px"}}>⚡</div>
          <div style={{fontSize:24,fontWeight:800,color:S.white,letterSpacing:"-0.02em"}}>UK Energy CRM</div>
          <div style={{color:S.muted,fontSize:13,marginTop:4}}>B2B Campaign Management Portal</div>
        </div>

        {/* Firebase status */}
        <div style={{background:IS_CONFIGURED?S.greenGlow:S.amberGlow,border:`1px solid ${IS_CONFIGURED?S.green:S.amber}50`,borderRadius:10,padding:"10px 14px",marginBottom:20,display:"flex",alignItems:"center",gap:8,fontSize:12}}>
          <span style={{fontSize:16}}>{IS_CONFIGURED?"🟢":"🟡"}</span>
          <span style={{color:IS_CONFIGURED?S.green:S.amber,fontWeight:600}}>
            {IS_CONFIGURED?"Firebase Connected — Data syncs to cloud in real time":"Demo Mode — Data resets on refresh. Configure Firebase to persist data."}
          </span>
        </div>

        <div style={{background:S.card,borderRadius:16,padding:28,boxShadow:`0 0 0 1px ${S.border},0 24px 60px rgba(0,0,0,0.5)`}}>
          <div style={{marginBottom:18}}>
            <div style={{color:S.mutedL,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Username</div>
            <input value={username} onChange={e=>{setUsername(e.target.value);setError("");}} placeholder="Enter username"
              onKeyDown={e=>e.key==="Enter"&&handleLogin()}
              style={{width:"100%",boxSizing:"border-box",background:S.cardL,border:`1px solid ${S.border}`,borderRadius:10,padding:"11px 14px",color:S.white,fontSize:14,fontFamily:"Inter,system-ui,sans-serif",outline:"none"}}/>
          </div>
          <div style={{marginBottom:20}}>
            <div style={{color:S.mutedL,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Password</div>
            <div style={{position:"relative"}}>
              <input type={showPass?"text":"password"} value={password} onChange={e=>{setPassword(e.target.value);setError("");}}
                placeholder="Enter password" onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                style={{width:"100%",boxSizing:"border-box",background:S.cardL,border:`1px solid ${S.border}`,borderRadius:10,padding:"11px 44px 11px 14px",color:S.white,fontSize:14,fontFamily:"Inter,system-ui,sans-serif",outline:"none"}}/>
              <button onClick={()=>setShowPass(p=>!p)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:S.muted,cursor:"pointer",fontSize:16}}>{showPass?"🙈":"👁"}</button>
            </div>
          </div>
          {error&&<div style={{background:S.dangerGlow,border:`1px solid ${S.danger}50`,borderRadius:8,padding:"10px 14px",color:S.danger,fontSize:13,marginBottom:16}}>⚠️ {error}</div>}
          <button onClick={handleLogin} style={{width:"100%",background:`linear-gradient(135deg,${S.teal},${S.tealD})`,color:S.navy,border:"none",borderRadius:10,padding:"12px",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"Inter,system-ui,sans-serif"}}>
            Sign In →
          </button>

          <div style={{marginTop:20,padding:"14px",background:S.cardL,borderRadius:10,fontSize:12,color:S.muted}}>
            <div style={{fontWeight:700,color:S.mutedL,marginBottom:6}}>Demo Credentials</div>
            <div>👑 <b style={{color:S.amber}}>manager</b> / Manager@2025</div>
            <div style={{marginTop:4}}>🧑‍💼 <b style={{color:S.teal}}>agent01</b> / Agent01@2025</div>
            <div style={{marginTop:4}}>🧑‍💼 <b style={{color:S.teal}}>agent02</b> / Agent02@2025</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  RENEWAL MODAL
// ═══════════════════════════════════════════════════════════
function RenewalModal({customers,users,onClose,onAction}){
  const [idx,setIdx]=useState(0);
  if(!customers.length)return null;
  const c=customers[idx];
  const d=nearExpiry(c);
  const agent=users.find(u=>u.id===c.agentId);
  const next=()=>idx<customers.length-1?setIdx(i=>i+1):onClose();

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.87)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000,backdropFilter:"blur(8px)"}}>
      <div style={{background:S.card,borderRadius:18,padding:32,maxWidth:560,width:"92%",boxShadow:`0 0 0 1.5px ${S.amber}60,0 32px 80px rgba(0,0,0,0.8)`,fontFamily:"Inter,system-ui,sans-serif",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:22}}>
          <div style={{width:48,height:48,borderRadius:"50%",background:`linear-gradient(135deg,${S.amber},${S.amberD})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>🔔</div>
          <div>
            <div style={{color:S.amber,fontWeight:800,fontSize:19}}>Renewal Alert — Call Required</div>
            <div style={{color:S.muted,fontSize:13}}>Ending in <span style={{color:S.amber,fontWeight:700}}>{d} days</span>{customers.length>1&&<span> · {idx+1}/{customers.length}</span>}</div>
          </div>
        </div>

        <div style={{background:S.cardL,borderRadius:12,padding:18,marginBottom:16}}>
          <div style={{color:S.white,fontWeight:800,fontSize:20}}>{c.businessName||c.contactPersonName}</div>
          <div style={{color:S.muted,fontSize:12,fontFamily:"monospace",marginBottom:12}}>{c.id}</div>
          <G cols={2}>
            <div><div style={{color:S.muted,fontSize:11,textTransform:"uppercase"}}>📞 Telephone</div><div style={{color:S.teal,fontWeight:700,fontSize:16}}>{c.telephoneNo||"—"}</div></div>
            <div><div style={{color:S.muted,fontSize:11,textTransform:"uppercase"}}>📱 Mobile</div><div style={{color:S.teal,fontWeight:700,fontSize:16}}>{c.mobileNo||"—"}</div></div>
            <div><div style={{color:S.muted,fontSize:11,textTransform:"uppercase"}}>👤 Contact</div><div style={{color:S.off,fontSize:13}}>{c.contactPersonName}</div></div>
            <div><div style={{color:S.muted,fontSize:11,textTransform:"uppercase"}}>📍 Postcode</div><div style={{color:S.off,fontSize:13}}>{c.postcode}</div></div>
          </G>
          {agent&&<div style={{marginTop:10,color:S.muted,fontSize:12}}>Agent: <span style={{color:S.teal}}>{agent.name}</span></div>}
        </div>

        {(c.elec1OfferRate||c.elec1SCharge)&&(
          <div style={{background:S.tealGlow,border:`1px solid ${S.teal}40`,borderRadius:12,padding:16,marginBottom:12}}>
            <div style={{color:S.teal,fontWeight:700,fontSize:13,marginBottom:10}}>⚡ Electricity — Quote These Prices</div>
            <G cols={2}>
              <div><div style={{color:S.muted,fontSize:11}}>UNIT RATE</div><div style={{color:S.teal,fontWeight:800,fontSize:22}}>{c.elec1OfferRate}p/kWh</div></div>
              <div><div style={{color:S.muted,fontSize:11}}>STANDING CHARGE</div><div style={{color:S.teal,fontWeight:800,fontSize:22}}>{c.elec1SCharge}p/day</div></div>
            </G>
          </div>
        )}
        {(c.gas1UnitRate||c.gas1OfferedSCharge)&&(
          <div style={{background:S.purpleGlow,border:`1px solid ${S.purple}40`,borderRadius:12,padding:16,marginBottom:18}}>
            <div style={{color:S.purple,fontWeight:700,fontSize:13,marginBottom:10}}>🔥 Gas — Quote These Prices</div>
            <G cols={2}>
              <div><div style={{color:S.muted,fontSize:11}}>UNIT RATE</div><div style={{color:S.purple,fontWeight:800,fontSize:22}}>{c.gas1UnitRate}p/kWh</div></div>
              <div><div style={{color:S.muted,fontSize:11}}>STANDING CHARGE</div><div style={{color:S.purple,fontWeight:800,fontSize:22}}>{c.gas1OfferedSCharge}p/day</div></div>
            </G>
          </div>
        )}

        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <Btn color={S.teal}  onClick={()=>{onAction(c.id,"Called");  next();}}>✅ Call Logged</Btn>
          <Btn color={S.green} onClick={()=>{onAction(c.id,"Renewed"); next();}}>🎉 Renewed</Btn>
          {customers.length>1&&idx<customers.length-1&&<Btn color={S.purple} onClick={()=>setIdx(i=>i+1)}>➡ Next</Btn>}
          <Btn color={S.slate} outline onClick={onClose}>Dismiss</Btn>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  CUSTOMER FORM
// ═══════════════════════════════════════════════════════════
const emptyCustomer=(agentId,agentName)=>({
  agentId,agentName,date:today(),businessName:"",contactPersonName:"",
  telephoneNo:"",landlineNo:"",mobileNo:"",supplyAddress:"",postcode:"",
  commercialRes:"Commercial",companyRegNo:"",
  elec1Supplier:"British Gas",elec1SupplyNo:"",elec1OfferRate:"",elec1SCharge:"",
  elec1Day:"",elec1Night:"",elec1EveWend:"",elec1ContractTerm:"",elec1NameOnBill:"",
  elec1ContractEnd:"",elec1MeterSerial:"",elec1AnnualConsumption:"",
  elec2Supplier:"",elec2SupplyNo:"",elec2OfferRate:"",elec2SCharge:"",
  elec2Day:"",elec2Night:"",elec2EveWend:"",elec2ContractTerm:"",elec2NameOnBill:"",
  elec2ContractEnd:"",elec2MeterSerial:"",elec2AnnualConsumption:"",
  gas1Supplier:"British Gas",gas1OfferedSCharge:"",gas1UnitRate:"",gas1AQ:"",
  gas1MPRN:"",gas1ContractEnd:"",gas1ContractStart:"",gas1ContractTerm:"",
  gas1SiteNoBG:"",gas1NameOnBill:"",gas1MeterRead:"",gas1MeterSerial:"",
  gas2Supplier:"",gas2OfferedSCharge:"",gas2UnitRate:"",gas2AQ:"",
  gas2MPRN:"",gas2ContractEnd:"",gas2ContractStart:"",gas2ContractTerm:"",
  gas2SiteNoBG:"",gas2NameOnBill:"",gas2MeterRead:"",gas2MeterSerial:"",
  bankName:"",accountTitle:"",branchAddress:"",sortCode:"",accountNo:"",
  billPaymentMethod:"Direct Debit",landlordName:"",directorsHomeAddress:"",
  directorsDOB:"",nameOfNewCustomer:"",remarks:"",
  renewalStatus:"Not Due",checkedByManager:"",checkedByEditor:"",
});

function CustomerForm({initial,agentId,agentName,onSave,onCancel,isManager,agents=[]}){
  const [f,setF]=useState(initial||emptyCustomer(agentId,agentName));
  const [saving,setSaving]=useState(false);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));

  const handleSave=async()=>{
    if(!f.businessName&&!f.contactPersonName){alert("Business Name or Contact Person required.");return;}
    if(!f.mobileNo&&!f.landlineNo&&!f.telephoneNo){alert("At least one phone number required.");return;}
    setSaving(true);
    await onSave({...f,id:f.id||uid("CUS"),createdAt:f.createdAt||today()});
    setSaving(false);
  };

  return(
    <div style={{background:S.card,borderRadius:16,padding:28,fontFamily:"Inter,system-ui,sans-serif"}}>
      <div style={{color:S.teal,fontWeight:800,fontSize:20,marginBottom:24}}>{f.id?"✏️ Edit Contract":"📋 New Contract Sheet"}</div>

      <Sec title="Contract Header" icon="📄">
        <G cols={3}>
          {isManager
            ?<Sel label="Assigned Agent" k="agentId" f={f} set={(k,v)=>{const ag=agents.find(a=>a.id===v);set("agentId",v);set("agentName",ag?.name||"");}} options={agents.map(a=>a.id)}/>
            :<Inp label="Agent Name" k="agentName" f={f} set={set}/>
          }
          <Inp label="Date" k="date" f={f} set={set} type="date"/>
          <Sel label="Commercial / Residential" k="commercialRes" f={f} set={set} options={["Commercial","Residential"]}/>
        </G>
        <G cols={2} style={{marginTop:12}}>
          <Inp label="Business Name *"  k="businessName"      f={f} set={set}/>
          <Inp label="Company Reg No"   k="companyRegNo"      f={f} set={set}/>
          <Inp label="Contact Person"   k="contactPersonName" f={f} set={set}/>
          <Inp label="Telephone No"     k="telephoneNo"       f={f} set={set} type="tel" placeholder="01xxx xxxxxx"/>
          <Inp label="Mobile No"        k="mobileNo"          f={f} set={set} type="tel" placeholder="07xxx xxxxxx"/>
          <Inp label="Landline No"      k="landlineNo"        f={f} set={set} type="tel" placeholder="0161 xxx xxxx"/>
          <Inp label="Supply Address"   k="supplyAddress"     f={f} set={set} span={2}/>
          <Inp label="Postcode"         k="postcode"          f={f} set={set}/>
        </G>
      </Sec>

      <Sec title="Electricity Details" color={S.teal} icon="⚡">
        {[1,2].map(m=>(
          <div key={m} style={{background:S.cardL,borderRadius:12,padding:16,marginBottom:14}}>
            <div style={{color:S.teal,fontWeight:700,fontSize:11,marginBottom:12,textTransform:"uppercase",letterSpacing:"0.06em"}}>Meter {m}</div>
            <G cols={2}>
              <Sel label="Current Supplier"        k={`elec${m}Supplier`}           f={f} set={set} options={SUPPLIERS}/>
              <Inp label="Supply No (MPAN)"         k={`elec${m}SupplyNo`}           f={f} set={set}/>
              <Inp label="Offer Rate (p/kWh)"       k={`elec${m}OfferRate`}          f={f} set={set} type="number"/>
              <Inp label="Standing Charge (p/day)"  k={`elec${m}SCharge`}            f={f} set={set} type="number"/>
              <Inp label="Day Rate (p/kWh)"         k={`elec${m}Day`}               f={f} set={set} type="number"/>
              <Inp label="Night Rate (p/kWh)"       k={`elec${m}Night`}             f={f} set={set} type="number"/>
              <Inp label="Eve/Weekend (p/kWh)"      k={`elec${m}EveWend`}           f={f} set={set} type="number"/>
              <Sel label="Contract Term"            k={`elec${m}ContractTerm`}      f={f} set={set} options={CONTRACT_TERMS}/>
              <Inp label="Contract End Date"        k={`elec${m}ContractEnd`}       f={f} set={set} type="date"/>
              <Inp label="Annual Consumption (kWh)" k={`elec${m}AnnualConsumption`} f={f} set={set} type="number"/>
              <Inp label="Meter Serial No"          k={`elec${m}MeterSerial`}       f={f} set={set}/>
              <Inp label="Name on Bill"             k={`elec${m}NameOnBill`}        f={f} set={set}/>
            </G>
          </div>
        ))}
      </Sec>

      <Sec title="Gas Details" color={S.purple} icon="🔥">
        {[1,2].map(m=>(
          <div key={m} style={{background:S.cardL,borderRadius:12,padding:16,marginBottom:14}}>
            <div style={{color:S.purple,fontWeight:700,fontSize:11,marginBottom:12,textTransform:"uppercase",letterSpacing:"0.06em"}}>Meter {m}</div>
            <G cols={2}>
              <Sel label="Current Supplier"        k={`gas${m}Supplier`}        f={f} set={set} options={SUPPLIERS}/>
              <Inp label="MPRN"                    k={`gas${m}MPRN`}           f={f} set={set}/>
              <Inp label="Standing Charge (p/day)" k={`gas${m}OfferedSCharge`} f={f} set={set} type="number"/>
              <Inp label="Unit Rate (p/kWh)"       k={`gas${m}UnitRate`}       f={f} set={set} type="number"/>
              <Inp label="AQ Consumption (kWh)"    k={`gas${m}AQ`}            f={f} set={set} type="number"/>
              <Inp label="Contract End Date"       k={`gas${m}ContractEnd`}    f={f} set={set} type="date"/>
              <Inp label="Contract Start Date"     k={`gas${m}ContractStart`}  f={f} set={set} type="date"/>
              <Sel label="Contract Term"           k={`gas${m}ContractTerm`}   f={f} set={set} options={CONTRACT_TERMS}/>
              <Inp label="Site No (British Gas)"   k={`gas${m}SiteNoBG`}      f={f} set={set}/>
              <Inp label="Name on Bill"            k={`gas${m}NameOnBill`}    f={f} set={set}/>
              <Inp label="Current Meter Read"      k={`gas${m}MeterRead`}     f={f} set={set}/>
              <Inp label="Meter Serial No"         k={`gas${m}MeterSerial`}   f={f} set={set}/>
            </G>
          </div>
        ))}
      </Sec>

      <Sec title="Bank Details" color={S.green} icon="🏦">
        <G cols={2}>
          <Inp label="Bank Name"              k="bankName"              f={f} set={set}/>
          <Inp label="Account Title"          k="accountTitle"          f={f} set={set}/>
          <Inp label="Sort Code"              k="sortCode"              f={f} set={set} placeholder="XX-XX-XX"/>
          <Inp label="Account No"             k="accountNo"             f={f} set={set}/>
          <Inp label="Branch Address"         k="branchAddress"         f={f} set={set} span={2}/>
          <Sel label="Payment Method"         k="billPaymentMethod"     f={f} set={set} options={PAYMENT_METHODS}/>
          <Inp label="Landlord Name"          k="landlordName"          f={f} set={set}/>
          <Inp label="Director Home Address"  k="directorsHomeAddress"  f={f} set={set} span={2}/>
          <Inp label="Director DOB"           k="directorsDOB"          f={f} set={set} type="date"/>
          <Inp label="Name of New Customer"   k="nameOfNewCustomer"     f={f} set={set}/>
        </G>
      </Sec>

      <Sec title="Remarks & Verification" color={S.amber} icon="📝">
        <label style={{display:"block",marginBottom:12}}>
          <div style={{color:S.muted,fontSize:11,marginBottom:4,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em"}}>Remarks</div>
          <textarea value={f.remarks||""} onChange={e=>set("remarks",e.target.value)} rows={3}
            style={{width:"100%",boxSizing:"border-box",background:S.cardLL,border:`1px solid ${S.border}`,borderRadius:8,padding:"8px 12px",color:S.white,fontSize:13,resize:"vertical",fontFamily:"Inter,system-ui,sans-serif",outline:"none"}}/>
        </label>
        <G cols={3}>
          <Sel label="Renewal Status"       k="renewalStatus"    f={f} set={set} options={["Not Due","Pending","Called","Renewed","Declined"]}/>
          <Inp label="Checked By (Manager)" k="checkedByManager" f={f} set={set}/>
          <Inp label="Checked By (Editor)"  k="checkedByEditor"  f={f} set={set}/>
        </G>
      </Sec>

      <div style={{display:"flex",gap:10}}>
        <Btn color={S.teal} onClick={handleSave} disabled={saving}>{saving?"⏳ Saving to Firebase…":"💾 Save Contract"}</Btn>
        <Btn color={S.slate} outline onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  AGENT MANAGEMENT
// ═══════════════════════════════════════════════════════════
function AgentManagement({users,saveUser,delUser}){
  const [showForm,setShowForm]=useState(false);
  const [editUser,setEditUser]=useState(null);
  const [form,setForm]=useState({name:"",username:"",password:"",email:"",role:"agent",active:true});
  const [msg,setMsg]=useState("");
  const [saving,setSaving]=useState(false);
  const setF=(k,v)=>setForm(p=>({...p,[k]:v}));

  const openNew =()=>{setForm({name:"",username:"",password:"",email:"",role:"agent",active:true});setEditUser(null);setShowForm(true);};
  const openEdit=u=>{setForm({...u});setEditUser(u);setShowForm(true);};

  const handleSave=async()=>{
    if(!form.name||!form.username||!form.password){alert("Name, username and password required.");return;}
    if(!editUser&&users.find(u=>u.username===form.username)){alert("Username already exists.");return;}
    setSaving(true);
    await saveUser({...form,id:editUser?editUser.id:uid("AGT"),createdAt:editUser?.createdAt||today()});
    setSaving(false);setShowForm(false);
    setMsg(editUser?"Agent updated.":"Agent created — credentials ready to share.");
    setTimeout(()=>setMsg(""),4000);
  };

  const agents=users.filter(u=>u.role==="agent");

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <div style={{fontSize:20,fontWeight:800}}>👥 Agent Management</div>
          <div style={{color:S.muted,fontSize:13,marginTop:2}}>Create and manage agent login credentials — {IS_CONFIGURED?"saved to Firebase":"demo mode"}</div>
        </div>
        <Btn color={S.teal} onClick={openNew}>+ Add Agent</Btn>
      </div>

      {msg&&<div style={{background:S.greenGlow,border:`1px solid ${S.green}50`,borderRadius:10,padding:"10px 16px",color:S.green,fontSize:13,marginBottom:16}}>✅ {msg}</div>}

      {showForm&&(
        <div style={{background:S.card,borderRadius:14,padding:24,marginBottom:20,border:`1px solid ${S.teal}40`}}>
          <div style={{color:S.teal,fontWeight:700,fontSize:16,marginBottom:18}}>{editUser?"✏️ Edit Agent":"➕ New Agent"}</div>
          <G cols={2}>
            {[["Full Name","name","text"],["Username","username","text"],["Password","password","text"],["Email","email","email"]].map(([l,k,t])=>(
              <label key={k} style={{display:"block"}}>
                <div style={{color:S.muted,fontSize:11,marginBottom:4,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em"}}>{l}</div>
                <input type={t} value={form[k]||""} onChange={e=>setF(k,e.target.value)}
                  style={{width:"100%",boxSizing:"border-box",background:S.cardLL,border:`1px solid ${S.border}`,borderRadius:8,padding:"8px 12px",color:S.white,fontSize:13,fontFamily:"Inter,system-ui,sans-serif",outline:"none"}}/>
              </label>
            ))}
            <div style={{display:"flex",alignItems:"center",gap:8,paddingTop:22}}>
              <input type="checkbox" checked={form.active} onChange={e=>setF("active",e.target.checked)} style={{width:16,height:16,accentColor:S.teal}}/>
              <span style={{color:S.off,fontSize:13}}>Account Active</span>
            </div>
          </G>
          <div style={{display:"flex",gap:10,marginTop:18}}>
            <Btn color={S.teal} onClick={handleSave} disabled={saving}>{saving?"⏳ Saving…":"💾 Save Agent"}</Btn>
            <Btn color={S.slate} outline onClick={()=>setShowForm(false)}>Cancel</Btn>
          </div>
        </div>
      )}

      <div style={{display:"grid",gap:12}}>
        {agents.map(u=>(
          <div key={u.id} style={{background:S.card,borderRadius:12,padding:18,border:`1px solid ${u.active?S.border:S.danger+"40"}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:42,height:42,borderRadius:"50%",background:`linear-gradient(135deg,${S.teal},${S.purple})`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:17,color:S.navy,flexShrink:0}}>{u.name.charAt(0)}</div>
                <div>
                  <div style={{fontWeight:700,fontSize:15}}>{u.name}</div>
                  <div style={{color:S.muted,fontSize:12}}>@{u.username} · {u.email||"No email"}</div>
                </div>
              </div>
              <div style={{marginTop:10,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                <span style={{fontFamily:"monospace",fontSize:11,color:S.muted,background:S.cardL,padding:"3px 8px",borderRadius:6}}>{u.id}</span>
                <span style={{fontFamily:"monospace",fontSize:11,color:S.teal,background:S.tealGlow,padding:"3px 8px",borderRadius:6}}>🔑 {u.password}</span>
                <span style={{fontSize:11,color:u.active?S.green:S.danger,fontWeight:700}}>{u.active?"● Active":"● Inactive"}</span>
                {IS_CONFIGURED&&<span style={{fontSize:11,color:S.green}}>☁️ Synced</span>}
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <Btn color={S.teal} sm onClick={()=>openEdit(u)}>✏️ Edit</Btn>
              <Btn color={u.active?S.amber:S.green} sm onClick={()=>saveUser({...u,active:!u.active})}>{u.active?"⏸ Deactivate":"▶ Activate"}</Btn>
              <Btn color={S.danger} sm onClick={()=>{if(window.confirm("Delete agent?"))delUser(u.id);}}>🗑</Btn>
            </div>
          </div>
        ))}
        {!agents.length&&<div style={{color:S.muted,textAlign:"center",padding:30}}>No agents yet. Add one above.</div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  MANAGER ANALYTICS
// ═══════════════════════════════════════════════════════════
function ManagerAnalytics({customers,users}){
  const agents=users.filter(u=>u.role==="agent");
  return(
    <div>
      <div style={{fontSize:20,fontWeight:800,marginBottom:4}}>📈 Agent Performance</div>
      <div style={{color:S.muted,fontSize:13,marginBottom:20}}>{IS_CONFIGURED?"Live data from Firebase — updates in real time":"Demo data"}</div>
      <div style={{display:"grid",gap:14}}>
        {agents.map(a=>{
          const mine=customers.filter(c=>c.agentId===a.id);
          const renewed=mine.filter(c=>c.renewalStatus==="Renewed").length;
          const pending=mine.filter(c=>c.renewalStatus==="Pending"||c.renewalStatus==="Called").length;
          const due=mine.filter(c=>{const d=nearExpiry(c);return d!==null&&d<=180&&c.renewalStatus!=="Renewed"&&c.renewalStatus!=="Declined";}).length;
          return(
            <div key={a.id} style={{background:S.card,borderRadius:14,padding:20,border:`1px solid ${S.border}`}}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
                <div style={{width:44,height:44,borderRadius:"50%",background:`linear-gradient(135deg,${S.teal},${S.purple})`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:18,color:S.navy}}>{a.name.charAt(0)}</div>
                <div>
                  <div style={{fontWeight:700,fontSize:16}}>{a.name}</div>
                  <div style={{color:S.muted,fontSize:12}}>@{a.username} · {a.id}</div>
                </div>
                <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{fontSize:11,color:a.active?S.green:S.danger,fontWeight:700}}>{a.active?"● Active":"● Inactive"}</span>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
                {[
                  {label:"Total",value:mine.length,color:S.teal},
                  {label:"Renewals Due",value:due,color:S.amber},
                  {label:"In Progress",value:pending,color:S.purple},
                  {label:"Renewed",value:renewed,color:S.green},
                ].map(k=>(
                  <div key={k.label} style={{background:S.cardL,borderRadius:10,padding:"12px 14px",textAlign:"center"}}>
                    <div style={{fontSize:24,fontWeight:800,color:k.color}}>{k.value}</div>
                    <div style={{color:S.muted,fontSize:11,marginTop:2}}>{k.label}</div>
                  </div>
                ))}
              </div>
              {mine.length>0&&(
                <div style={{marginTop:14}}>
                  <div style={{color:S.muted,fontSize:11,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Recent Contracts</div>
                  {mine.slice(0,3).map(c=>(
                    <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",background:S.cardLL,borderRadius:8,marginBottom:6}}>
                      <div>
                        <div style={{fontWeight:600,fontSize:13}}>{c.businessName||c.contactPersonName}</div>
                        <div style={{color:S.muted,fontSize:11}}>{c.postcode} · {fmtDate(c.date)}</div>
                      </div>
                      <Badge label={c.renewalStatus}/>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {!agents.length&&<div style={{color:S.muted,textAlign:"center",padding:30}}>No agents found.</div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  CUSTOMER DETAIL
// ═══════════════════════════════════════════════════════════
function CustomerDetail({customer:c,onEdit,onDelete,onStatusChange,onBack,isManager}){
  const d=nearExpiry(c);
  return(
    <div>
      <button onClick={onBack} style={{background:"transparent",color:S.teal,border:"none",cursor:"pointer",fontSize:13,fontWeight:700,marginBottom:16,padding:0}}>← Back</button>
      <div style={{background:S.card,borderRadius:16,padding:28}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12,marginBottom:22}}>
          <div>
            <div style={{fontSize:24,fontWeight:800}}>{c.businessName||c.contactPersonName}</div>
            <div style={{fontFamily:"monospace",color:S.muted,fontSize:12,marginTop:2}}>{c.id} · {fmtDate(c.createdAt)} · <span style={{color:S.teal}}>{c.agentName}</span></div>
            <div style={{marginTop:8,display:"flex",gap:8,flexWrap:"wrap"}}>
              <Badge label={c.renewalStatus}/>
              {c.commercialRes&&<span style={{background:S.tealGlow,color:S.teal,fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20}}>{c.commercialRes}</span>}
              {IS_CONFIGURED&&<span style={{background:S.greenGlow,color:S.green,fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20}}>☁️ Firebase</span>}
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <Btn color={S.teal} onClick={onEdit}>✏️ Edit</Btn>
            {isManager&&<Btn color={S.danger} onClick={onDelete}>🗑 Delete</Btn>}
          </div>
        </div>

        {d!==null&&d<=180&&c.renewalStatus!=="Renewed"&&(
          <div style={{background:S.amberGlow,border:`1px solid ${S.amber}50`,borderRadius:12,padding:"14px 18px",marginBottom:22,display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:22}}>🔔</span>
            <div>
              <div style={{color:S.amber,fontWeight:800}}>Renewal Due in {d} days — Call the customer now!</div>
              <div style={{color:S.muted,fontSize:13}}>Quote the offered electricity and gas rates shown below.</div>
            </div>
          </div>
        )}

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:16}}>
          <DBox title="📋 Contact Details" color={S.teal}>
            <DI label="Business"       value={c.businessName} hi/>
            <DI label="Contact Person" value={c.contactPersonName}/>
            <DI label="Telephone No"   value={c.telephoneNo} hi/>
            <DI label="Mobile No"      value={c.mobileNo} hi/>
            <DI label="Landline No"    value={c.landlineNo}/>
            <DI label="Address"        value={`${c.supplyAddress||""}${c.postcode?", "+c.postcode:""}`}/>
            <DI label="Company Reg"    value={c.companyRegNo}/>
          </DBox>
          <DBox title="⚡ Electricity — Meter 1" color={S.teal}>
            <DI label="Supplier"           value={c.elec1Supplier}/>
            <DI label="MPAN"               value={c.elec1SupplyNo}/>
            <DI label="Offer Rate"         value={c.elec1OfferRate?`${c.elec1OfferRate}p/kWh`:"—"} hi/>
            <DI label="Standing Charge"    value={c.elec1SCharge?`${c.elec1SCharge}p/day`:"—"} hi/>
            <DI label="Day/Night/Eve"      value={[c.elec1Day&&`D:${c.elec1Day}p`,c.elec1Night&&`N:${c.elec1Night}p`,c.elec1EveWend&&`E:${c.elec1EveWend}p`].filter(Boolean).join(" · ")||"—"}/>
            <DI label="Annual Usage"       value={c.elec1AnnualConsumption?`${Number(c.elec1AnnualConsumption).toLocaleString()} kWh`:"—"}/>
            <DI label="Contract End"       value={fmtDate(c.elec1ContractEnd)}/>
            <DI label="Meter Serial"       value={c.elec1MeterSerial}/>
          </DBox>
          <DBox title="🔥 Gas — Meter 1" color={S.purple}>
            <DI label="Supplier"       value={c.gas1Supplier}/>
            <DI label="MPRN"           value={c.gas1MPRN}/>
            <DI label="Unit Rate"      value={c.gas1UnitRate?`${c.gas1UnitRate}p/kWh`:"—"} hi/>
            <DI label="Standing"       value={c.gas1OfferedSCharge?`${c.gas1OfferedSCharge}p/day`:"—"} hi/>
            <DI label="AQ Usage"       value={c.gas1AQ?`${Number(c.gas1AQ).toLocaleString()} kWh`:"—"}/>
            <DI label="Start / End"    value={`${fmtDate(c.gas1ContractStart)} → ${fmtDate(c.gas1ContractEnd)}`}/>
            <DI label="Site No (BG)"   value={c.gas1SiteNoBG}/>
            <DI label="Meter Serial"   value={c.gas1MeterSerial}/>
          </DBox>
          <DBox title="🏦 Bank Details" color={S.green}>
            <DI label="Bank"           value={c.bankName}/>
            <DI label="Account Title"  value={c.accountTitle}/>
            <DI label="Sort Code"      value={c.sortCode}/>
            <DI label="Account No"     value={c.accountNo}/>
            <DI label="Payment"        value={c.billPaymentMethod}/>
            <DI label="Landlord"       value={c.landlordName}/>
          </DBox>
          <DBox title="👤 Director Details" color={S.amber}>
            <DI label="Home Address"   value={c.directorsHomeAddress}/>
            <DI label="Date of Birth"  value={fmtDate(c.directorsDOB)}/>
            <DI label="New Customer"   value={c.nameOfNewCustomer}/>
          </DBox>
          {c.remarks&&(
            <DBox title="📝 Remarks" color={S.amber}>
              <div style={{color:S.off,fontSize:13,lineHeight:1.6}}>{c.remarks}</div>
              {(c.checkedByManager||c.checkedByEditor)&&<>
                <DI label="Checked (Manager)" value={c.checkedByManager}/>
                <DI label="Checked (Editor)"  value={c.checkedByEditor}/>
              </>}
            </DBox>
          )}
        </div>

        <div style={{marginTop:20,display:"flex",gap:10,flexWrap:"wrap"}}>
          <Btn color={S.teal}   onClick={()=>onStatusChange(c.id,"Called")}>📞 Log Call</Btn>
          <Btn color={S.green}  onClick={()=>onStatusChange(c.id,"Renewed")}>✅ Renewed</Btn>
          <Btn color={S.amber}  onClick={()=>onStatusChange(c.id,"Pending")}>⏳ Pending</Btn>
          <Btn color={S.danger} outline onClick={()=>onStatusChange(c.id,"Declined")}>✖ Declined</Btn>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  CUSTOMER LIST
// ═══════════════════════════════════════════════════════════
function CustomerList({customers,onSelect,onAdd,agentFilter}){
  const [search,setSearch]=useState("");
  const [filterStatus,setFilterStatus]=useState("All");
  const filtered=customers
    .filter(c=>agentFilter?c.agentId===agentFilter:true)
    .filter(c=>{
      const q=search.toLowerCase();
      const ms=!q||`${c.businessName} ${c.contactPersonName} ${c.id} ${c.mobileNo} ${c.telephoneNo} ${c.landlineNo} ${c.postcode} ${c.supplyAddress}`.toLowerCase().includes(q);
      return ms&&(filterStatus==="All"||c.renewalStatus===filterStatus);
    });
  return(
    <div>
      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <input placeholder="🔍 Search business, name, phone, postcode…" value={search} onChange={e=>setSearch(e.target.value)}
          style={{flex:1,minWidth:200,background:S.card,border:`1px solid ${S.border}`,borderRadius:8,padding:"8px 14px",color:S.white,fontSize:13,fontFamily:"Inter,system-ui,sans-serif",outline:"none"}}/>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
          style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:8,padding:"8px 14px",color:S.white,fontSize:13,fontFamily:"Inter,system-ui,sans-serif",outline:"none"}}>
          {["All","Not Due","Pending","Called","Renewed","Declined"].map(s=><option key={s}>{s}</option>)}
        </select>
        {onAdd&&<Btn color={S.teal} onClick={onAdd}>+ New Contract</Btn>}
      </div>
      <div style={{color:S.muted,fontSize:12,marginBottom:12}}>{filtered.length} contract{filtered.length!==1?"s":""}{IS_CONFIGURED&&<span style={{color:S.green}}> · ☁️ Firebase live</span>}</div>
      {filtered.map(c=>{
        const d=nearExpiry(c);
        const ne=d!==null&&d<=180&&c.renewalStatus!=="Renewed";
        return(
          <div key={c.id} onClick={()=>onSelect(c)} style={{background:S.card,borderRadius:12,padding:16,marginBottom:10,border:`1px solid ${ne?S.amber+"50":S.border}`,cursor:"pointer",boxShadow:ne?`0 0 16px ${S.amber}12`:"none"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontWeight:700,fontSize:15}}>{c.businessName||c.contactPersonName}
                  <span style={{fontFamily:"monospace",fontSize:11,color:S.muted,background:S.cardL,padding:"2px 8px",borderRadius:6,marginLeft:8}}>{c.id}</span>
                </div>
                <div style={{color:S.muted,fontSize:12,marginTop:3}}>📞 {c.telephoneNo||c.mobileNo||c.landlineNo||"—"} · 📍 {c.supplyAddress} {c.postcode}</div>
                <div style={{color:S.muted,fontSize:12,marginTop:2}}>
                  ⚡ {c.elec1Supplier||"—"} · 🔥 {c.gas1Supplier||"—"} · Agent: <span style={{color:S.tealD}}>{c.agentName||"—"}</span>
                  {d!==null&&<span style={{color:d<=30?S.danger:d<=60?S.amber:S.green,fontWeight:700}}> · {d}d</span>}
                </div>
              </div>
              <Badge label={c.renewalStatus}/>
            </div>
          </div>
        );
      })}
      {!filtered.length&&<div style={{color:S.muted,textAlign:"center",padding:40}}>No contracts found.</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  ROOT APP
// ═══════════════════════════════════════════════════════════
export default function App(){
  const {customers,users,fbReady,fbError,saveCustomer,delCustomer,saveUser,delUser}=useFirestore();
  const [currentUser,setCurrentUser]=useState(null);
  const [view,setView]=useState("dashboard");
  const [selected,setSelected]=useState(null);
  const [alertQueue,setAlertQueue]=useState([]);
  const [showAlert,setShowAlert]=useState(false);
  const [showSetup,setShowSetup]=useState(!IS_CONFIGURED);
  const alertChecked=useRef(false);

  useEffect(()=>{
    if(!currentUser||alertChecked.current)return;
    alertChecked.current=true;
    const mine=currentUser.role==="manager"?customers:customers.filter(c=>c.agentId===currentUser.id);
    const due=mine.filter(c=>{const d=nearExpiry(c);return d!==null&&d<=180&&c.renewalStatus!=="Renewed"&&c.renewalStatus!=="Declined";})
                  .sort((a,b)=>(nearExpiry(a)??9999)-(nearExpiry(b)??9999));
    if(due.length){setAlertQueue(due);setShowAlert(true);}
  },[currentUser,customers]);

  const handleLogin=u=>{alertChecked.current=false;setCurrentUser(u);setView("dashboard");setShowSetup(false);};
  const handleLogout=()=>{setCurrentUser(null);setView("dashboard");setSelected(null);};

  const handleSaveCustomer=async c=>{await saveCustomer(c);setSelected(c);setView("detail");};
  const handleStatusChange=async(id,status)=>{
    const c=customers.find(x=>x.id===id);
    if(!c)return;
    await saveCustomer({...c,renewalStatus:status});
    if(selected?.id===id)setSelected(p=>({...p,renewalStatus:status}));
  };
  const handleDeleteCustomer=async id=>{
    if(!window.confirm("Delete this contract?"))return;
    await delCustomer(id);setView("contracts");
  };

  // Show Firebase setup guide first time (non-configured)
  if(showSetup)return <FirebaseSetupGuide/>;

  if(!currentUser)return <LoginScreen users={users} onLogin={handleLogin}/>;

  const isManager=currentUser.role==="manager";
  const myCustomers=isManager?customers:customers.filter(c=>c.agentId===currentUser.id);
  const agents=users.filter(u=>u.role==="agent");
  const renewalDue=myCustomers.filter(c=>{const d=nearExpiry(c);return d!==null&&d<=180&&c.renewalStatus!=="Renewed"&&c.renewalStatus!=="Declined";}).length;

  const navItems=[
    {id:"dashboard",label:"📊 Dashboard"},
    {id:"contracts",label:"📋 Contracts"},
    ...(isManager?[{id:"agents",label:"👥 Agents"},{id:"analytics",label:"📈 Analytics"}]:[]),
  ];

  return(
    <div style={{minHeight:"100vh",background:S.navy,fontFamily:"Inter,system-ui,sans-serif",color:S.white}}>
      {showAlert&&<RenewalModal customers={alertQueue} users={users} onClose={()=>setShowAlert(false)} onAction={handleStatusChange}/>}

      {/* NAV */}
      <nav style={{background:S.card,borderBottom:`1px solid ${S.border}`,padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"space-between",height:58,position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:34,height:34,borderRadius:8,background:`linear-gradient(135deg,${S.teal},${S.purple})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>⚡</div>
          <div>
            <div style={{fontWeight:800,fontSize:14}}>UK Energy CRM</div>
            <div style={{fontSize:10,marginTop:-1,color:IS_CONFIGURED?S.green:S.amber}}>
              {IS_CONFIGURED?"🟢 Firebase Live — Cloud Sync Active":"🟡 Demo Mode"}
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
          {navItems.map(n=>(
            <button key={n.id} onClick={()=>setView(n.id)} style={{background:view===n.id?S.teal:"transparent",color:view===n.id?S.navy:S.muted,border:"none",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"Inter,system-ui,sans-serif"}}>{n.label}</button>
          ))}
          <button onClick={()=>{setSelected(null);setView("add");}} style={{background:S.teal,color:S.navy,border:"none",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"Inter,system-ui,sans-serif"}}>+ New</button>
          {renewalDue>0&&(
            <button onClick={()=>{
              const mine=isManager?customers:customers.filter(c=>c.agentId===currentUser.id);
              const due=mine.filter(c=>{const d=nearExpiry(c);return d!==null&&d<=180&&c.renewalStatus!=="Renewed"&&c.renewalStatus!=="Declined";}).sort((a,b)=>(nearExpiry(a)??9999)-(nearExpiry(b)??9999));
              setAlertQueue(due);setShowAlert(true);
            }} style={{background:S.amber,color:S.navy,border:"none",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"Inter,system-ui,sans-serif"}}>
              🔔 {renewalDue}
            </button>
          )}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:13,fontWeight:700}}>{currentUser.name}</div>
            <div style={{display:"flex",justifyContent:"flex-end"}}><RolePill role={currentUser.role}/></div>
          </div>
          <button onClick={handleLogout} style={{background:S.cardL,color:S.muted,border:`1px solid ${S.border}`,borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,system-ui,sans-serif"}}>Sign Out</button>
        </div>
      </nav>

      <div style={{maxWidth:1100,margin:"0 auto",padding:"24px 16px"}}>

        {/* Firebase error */}
        {fbError&&(
          <div style={{background:S.dangerGlow,border:`1px solid ${S.danger}50`,borderRadius:12,padding:"12px 18px",marginBottom:20,color:S.danger,fontSize:13}}>
            ⚠️ Firebase Error: {fbError}
          </div>
        )}

        {/* DASHBOARD */}
        {view==="dashboard"&&(
          <div>
            <h1 style={{fontSize:22,fontWeight:800,marginBottom:2}}>{isManager?"Manager Dashboard 👑":`Welcome, ${currentUser.name} 👋`}</h1>
            <p style={{color:S.muted,marginBottom:24,fontSize:13}}>{isManager?"Full campaign overview — all agents":"Your contracts and renewal tasks"}</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(175px,1fr))",gap:14,marginBottom:28}}>
              {[
                {icon:"📋",label:"Total Contracts",value:myCustomers.length,color:S.teal},
                {icon:"🔔",label:"Renewals Due",value:renewalDue,color:S.amber,glow:renewalDue>0},
                {icon:"🎉",label:"Renewed",value:myCustomers.filter(c=>c.renewalStatus==="Renewed").length,color:S.green},
                {icon:"📞",label:"Called",value:myCustomers.filter(c=>c.renewalStatus==="Called").length,color:S.purple},
                ...(isManager?[{icon:"👥",label:"Active Agents",value:users.filter(u=>u.role==="agent"&&u.active).length,color:S.teal}]:[]),
              ].map(k=>(
                <div key={k.label} style={{background:S.card,borderRadius:12,padding:18,border:`1px solid ${k.glow?S.amber+"60":S.border}`,boxShadow:k.glow?`0 0 20px ${S.amber}20`:"none"}}>
                  <div style={{fontSize:26,marginBottom:8}}>{k.icon}</div>
                  <div style={{fontSize:28,fontWeight:800,color:k.color}}>{k.value}</div>
                  <div style={{color:S.muted,fontSize:12,marginTop:2}}>{k.label}</div>
                </div>
              ))}
            </div>
            <div style={{background:S.card,borderRadius:12,padding:20}}>
              <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>⏰ Upcoming Renewals — Next 180 Days</div>
              {myCustomers.filter(c=>{const d=nearExpiry(c);return d!==null&&d<=180;})
                .sort((a,b)=>(nearExpiry(a)??9999)-(nearExpiry(b)??9999))
                .map(c=>{
                  const d=nearExpiry(c),urg=d<=30?S.danger:d<=60?S.amber:S.green;
                  return(
                    <div key={c.id} onClick={()=>{setSelected(c);setView("detail");}} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",borderRadius:10,background:S.cardL,marginBottom:8,cursor:"pointer",flexWrap:"wrap",gap:8,border:`1px solid ${urg}25`}}>
                      <div>
                        <div style={{fontWeight:700}}>{c.businessName||c.contactPersonName}</div>
                        <div style={{color:S.muted,fontSize:12}}>{c.telephoneNo||c.mobileNo} · {c.postcode}{isManager&&<span style={{color:S.tealD}}> · {c.agentName}</span>}</div>
                      </div>
                      <div style={{display:"flex",gap:10,alignItems:"center"}}>
                        <div style={{textAlign:"right"}}>
                          <div style={{color:urg,fontWeight:800,fontSize:15}}>{d} days</div>
                          <div style={{color:S.muted,fontSize:11}}>{fmtDate(c.elec1ContractEnd||c.gas1ContractEnd)}</div>
                        </div>
                        <Badge label={c.renewalStatus}/>
                      </div>
                    </div>
                  );
                })}
              {!myCustomers.filter(c=>{const d=nearExpiry(c);return d!==null&&d<=180;}).length&&(
                <div style={{color:S.muted,textAlign:"center",padding:24}}>No renewals due in the next 180 days.</div>
              )}
            </div>
          </div>
        )}

        {view==="contracts"&&<CustomerList customers={customers} agentFilter={isManager?null:currentUser.id} onSelect={c=>{setSelected(c);setView("detail");}} onAdd={()=>{setSelected(null);setView("add");}}/>}

        {(view==="add"||view==="edit")&&<CustomerForm initial={view==="edit"?selected:null} agentId={currentUser.id} agentName={currentUser.name} isManager={isManager} agents={agents} onSave={handleSaveCustomer} onCancel={()=>setView(selected?"detail":"contracts")}/>}

        {view==="detail"&&selected&&<CustomerDetail customer={customers.find(x=>x.id===selected.id)||selected} isManager={isManager} onEdit={()=>setView("edit")} onDelete={()=>handleDeleteCustomer(selected.id)} onStatusChange={handleStatusChange} onBack={()=>setView("contracts")}/>}

        {view==="agents"&&isManager&&<AgentManagement users={users} saveUser={saveUser} delUser={delUser}/>}

        {view==="analytics"&&isManager&&<ManagerAnalytics customers={customers} users={users}/>}

        {(view==="agents"||view==="analytics")&&!isManager&&(
          <div style={{textAlign:"center",padding:60}}>
            <div style={{fontSize:48,marginBottom:16}}>🔒</div>
            <div style={{fontSize:20,fontWeight:800,color:S.danger}}>Access Denied</div>
            <div style={{color:S.muted,marginTop:8}}>This area is restricted to managers only.</div>
          </div>
        )}
      </div>
    </div>
  );
}
