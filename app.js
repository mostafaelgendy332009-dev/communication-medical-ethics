import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, query, orderBy, onSnapshot, updateDoc, deleteDoc, serverTimestamp, where, limit } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const GROUP_ID = "communication-medical-ethics";
const $ = id => document.getElementById(id);
const statusEl = $("connectionState");
let auth, db, uid = null, memberName = "", memberUnsubs = [], data = {tasks:[],votes:[],members:[],meetings:[],resources:[],activity:[],messages:[]};
let replyTarget = null, chatFirstLoad = true;
const groupRef = () => doc(db,"groups",GROUP_ID);
const col = name => collection(db,"groups",GROUP_ID,name);
const memberRef = id => doc(db,"groups",GROUP_ID,"members",id);
const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const statusLabel = s => ({Pending:"لم تبدأ","In Progress":"قيد التنفيذ","Under Review":"تحت المراجعة",Completed:"مكتملة"}[s]||s);
const statusClass = s => ({Pending:"", "In Progress":"progress","Under Review":"review",Completed:"done"}[s]||"");
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2600)}
function showLogin(msg=""){ $("loginMessage").textContent=msg; $("loginView").classList.remove("hidden");$("workspaceView").classList.add("hidden");$("logoutBtn").classList.add("hidden"); }
function showWorkspace(){ $("loginView").classList.add("hidden");$("workspaceView").classList.remove("hidden");$("logoutBtn").classList.remove("hidden");$("currentMember").textContent=memberName; }
function openDialog(id){$(id).showModal()}
function closeDialog(id){$(id).close()}
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>closeDialog(b.dataset.close)));
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.view)));
document.querySelectorAll("[data-goto]").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.goto)));
function switchView(v){document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.view===v));document.querySelectorAll(".panel-view").forEach(p=>p.classList.add("hidden"));$(v+"Panel").classList.remove("hidden");if(v==="chat")setTimeout(()=>{const box=$("chatMessages");box.scrollTop=box.scrollHeight},60)}
function cleanup(){memberUnsubs.forEach(u=>u());memberUnsubs=[]}
function listen(name,orderField,callback){let qy=orderField?query(col(name),orderBy(orderField,"desc")):col(name);let unsub=onSnapshot(qy,s=>callback(s.docs.map(d=>({id:d.id,...d.data()}))),e=>toast("تعذر تحديث "+name));memberUnsubs.push(unsub)}
async function logActivity(text){try{await addDoc(col("activity"),{text,by:memberName,createdAt:serverTimestamp()})}catch(e){console.warn(e)}}
function startListeners(){
 cleanup();
 listen("tasks","createdAt",v=>{data.tasks=v;renderTasks();renderOverview()});
 listen("votes","createdAt",v=>{data.votes=v;renderVotes();renderOverview()});
 listen("members","joinedAt",v=>{data.members=v;renderMembers();populateAssignees()});
 listen("meetings","createdAt",v=>{data.meetings=v;renderMeetings()});
 listen("resources","createdAt",v=>{data.resources=v;renderResources()});
 listen("activity","createdAt",v=>{data.activity=v;renderActivity()});
 const chatQuery=query(col("messages"),orderBy("createdAt","desc"),limit(100));
 const chatUnsub=onSnapshot(chatQuery,snap=>{
   const box=$("chatMessages"),wasNearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<130;
   data.messages=snap.docs.map(d=>({id:d.id,...d.data()})).reverse();
   renderChat();
   if(chatFirstLoad||wasNearBottom){box.scrollTop=box.scrollHeight;chatFirstLoad=false;}
 },err=>{console.warn(err);toast("تعذر تحميل رسائل الشات")});
 memberUnsubs.push(chatUnsub);
}
async function join(name,code){
 const ref=memberRef(uid), existing=await getDoc(ref);
 if(existing.exists()){
   const old=existing.data(); memberName=name; await updateDoc(ref,{name,onlineAt:serverTimestamp()}); showWorkspace(); startListeners(); return;
 }
 // يتحقق Firestore Rules من الكود على الخادم؛ لا نقرأ مستند الكود من المتصفح.
 memberName=name;
 await setDoc(ref,{name,uid,joinedAt:serverTimestamp(),joinCode:code.trim()});
 await updateDoc(ref,{joinCode:null});
 showWorkspace(); await logActivity("انضم "+name+" إلى مساحة الفريق"); startListeners();
}
$("joinForm").addEventListener("submit",async e=>{e.preventDefault();const name=$("memberName").value.trim(),code=$("groupCode").value.trim();if(!name||!code)return; $("loginMessage").textContent="جارٍ التحقق من كود الجروب...";try{await join(name,code)}catch(err){$("loginMessage").textContent=err.message||"حدث خطأ أثناء الدخول."}});
$("logoutBtn").addEventListener("click",()=>{cleanup();memberName="";showLogin("تم تسجيل الخروج من واجهة الجروب. جلسة الدخول المجهولة محفوظة على هذا المتصفح.");});
$("addTaskBtn").addEventListener("click",()=>{ $("taskForm").reset();$("taskId").value="";$("taskModalTitle").textContent="إضافة مهمة جديدة";populateAssignees();openDialog("taskDialog")});
$("taskForm").addEventListener("submit",async e=>{e.preventDefault();const id=$("taskId").value,payload={title:$("taskTitle").value.trim(),description:$("taskDescription").value.trim(),assignee:$("taskAssignee").value,dueDate:$("taskDue").value,status:$("taskStatus").value,updatedAt:serverTimestamp()};try{if(id){await updateDoc(doc(db,"groups",GROUP_ID,"tasks",id),payload);await logActivity("تم تعديل المهمة: "+payload.title)}else{await addDoc(col("tasks"),{...payload,createdBy:memberName,createdAt:serverTimestamp()});await logActivity("أضيفت مهمة جديدة: "+payload.title)}closeDialog("taskDialog");toast("تم حفظ المهمة")}catch(err){toast("تعذر حفظ المهمة: "+err.message)}});
$("addVoteBtn").addEventListener("click",()=>{ $("voteForm").reset();$("voteOptions").innerHTML='<input class="vote-option" required placeholder="الاختيار الأول"><input class="vote-option" required placeholder="الاختيار الثاني">';openDialog("voteDialog")});
$("addOptionBtn").addEventListener("click",()=>{if($("voteOptions").children.length>=8)return toast("الحد الأقصى 8 اختيارات");const i=document.createElement("input");i.className="vote-option";i.placeholder="اختيار إضافي";i.maxLength=80;$("voteOptions").append(i)});
$("voteForm").addEventListener("submit",async e=>{e.preventDefault();const options=[...document.querySelectorAll(".vote-option")].map(x=>x.value.trim()).filter(Boolean);if(options.length<2)return toast("أضف اختيارين على الأقل");try{await addDoc(col("votes"),{title:$("voteTitle").value.trim(),options, type:$("voteType").value,deadline:$("voteDeadline").value, votes:{},closed:false,createdBy:memberName,createdAt:serverTimestamp()});await logActivity("تم إنشاء تصويت: "+$("voteTitle").value);closeDialog("voteDialog");toast("تم نشر التصويت")}catch(err){toast("تعذر إنشاء التصويت")}});
$("addMeetingBtn").addEventListener("click",()=>{ $("meetingForm").reset();openDialog("meetingDialog")});
$("meetingForm").addEventListener("submit",async e=>{e.preventDefault();try{await addDoc(col("meetings"),{title:$("meetingTitle").value.trim(),date:$("meetingDate").value,notes:$("meetingNotes").value.trim(),createdBy:memberName,createdAt:serverTimestamp()});await logActivity("تمت إضافة اجتماع: "+$("meetingTitle").value);closeDialog("meetingDialog");toast("تم حفظ الاجتماع")}catch(e){toast("تعذر حفظ الاجتماع")}});
$("addResourceBtn").addEventListener("click",()=>{ $("resourceForm").reset();openDialog("resourceDialog")});
$("resourceForm").addEventListener("submit",async e=>{e.preventDefault();try{await addDoc(col("resources"),{title:$("resourceTitle").value.trim(),url:$("resourceUrl").value.trim(),note:$("resourceNote").value.trim(),createdBy:memberName,createdAt:serverTimestamp()});await logActivity("تمت إضافة مصدر: "+$("resourceTitle").value);closeDialog("resourceDialog");toast("تم حفظ المصدر")}catch(e){toast("تعذر حفظ المصدر")}});
$("taskSearch").addEventListener("input",renderTasks);$("taskFilter").addEventListener("change",renderTasks);
function populateAssignees(){const s=$("taskAssignee"),v=s.value;s.innerHTML='<option value="">لم يُحدد بعد</option>'+data.members.map(m=>`<option value="${esc(m.name)}">${esc(m.name)}</option>`).join("");s.value=v}
function renderOverview(){
 const t=data.tasks;$("totalTasks").textContent=t.length;$("activeTasks").textContent=t.filter(x=>x.status==="In Progress").length;$("doneTasks").textContent=t.filter(x=>x.status==="Completed").length;$("openVotes").textContent=data.votes.filter(x=>!x.closed).length;$("taskTabCount").textContent=t.length;
 const recent=[...t].slice(0,5);$("recentTasks").className="item-list"+(recent.length?"":" empty-state");$("recentTasks").innerHTML=recent.length?recent.map(x=>`<div class="task-row"><div><b>${esc(x.title)}</b><small>${esc(x.assignee||"غير مسندة")} ${x.dueDate?" • "+esc(x.dueDate):""}</small></div><span class="pill ${statusClass(x.status)}">${statusLabel(x.status)}</span></div>`).join(""):"لا توجد مهام بعد. أضيفوا أول مهمة للفريق.";
}
function renderTasks(){const q=($("taskSearch").value||"").toLowerCase(),f=$("taskFilter").value;const arr=data.tasks.filter(t=>(f==="all"||t.status===f)&&(`${t.title} ${t.description} ${t.assignee}`.toLowerCase().includes(q)));const el=$("tasksList");el.className=arr.length?"task-grid":"task-grid empty-state";el.innerHTML=arr.length?arr.map(t=>`<article class="task-card"><div class="section-heading"><span class="pill ${statusClass(t.status)}">${statusLabel(t.status)}</span><button class="small-btn" data-edit-task="${t.id}">تعديل</button></div><h3>${esc(t.title)}</h3><p>${esc(t.description||"لا توجد تفاصيل إضافية.")}</p><div class="task-meta"><span>👤 ${esc(t.assignee||"غير مسندة")}</span><span>◷ ${esc(t.dueDate||"لا يوجد موعد")}</span></div><div class="card-actions"><button class="small-btn" data-next-task="${t.id}">تغيير الحالة</button><button class="small-btn danger" data-delete-task="${t.id}">حذف</button></div></article>`).join(""):"لا توجد مهام مطابقة.";
 el.querySelectorAll("[data-edit-task]").forEach(b=>b.onclick=()=>editTask(b.dataset.editTask));el.querySelectorAll("[data-next-task]").forEach(b=>b.onclick=()=>nextTask(b.dataset.nextTask));el.querySelectorAll("[data-delete-task]").forEach(b=>b.onclick=()=>removeItem("tasks",b.dataset.deleteTask,"المهمة"));
}
function editTask(id){const t=data.tasks.find(x=>x.id===id);if(!t)return;$("taskId").value=id;$("taskTitle").value=t.title;$("taskDescription").value=t.description||"";populateAssignees();$("taskAssignee").value=t.assignee||"";$("taskDue").value=t.dueDate||"";$("taskStatus").value=t.status||"Pending";$("taskModalTitle").textContent="تعديل المهمة";openDialog("taskDialog")}
async function nextTask(id){const t=data.tasks.find(x=>x.id===id);const states=["Pending","In Progress","Under Review","Completed"];const next=states[(states.indexOf(t.status)+1)%states.length];try{await updateDoc(doc(db,"groups",GROUP_ID,"tasks",id),{status:next,updatedAt:serverTimestamp()});await logActivity("تم تحديث حالة المهمة "+t.title+" إلى "+statusLabel(next))}catch(e){toast("تعذر تحديث الحالة")}}
async function removeItem(type,id,label){if(!confirm("هل تريد حذف "+label+"؟"))return;try{await deleteDoc(doc(db,"groups",GROUP_ID,type,id));await logActivity("تم حذف "+label)}catch(e){toast("تعذر الحذف")}}
function renderVotes(){const el=$("votesList"),arr=data.votes;el.className=arr.length?"card-grid":"card-grid empty-state";el.innerHTML=arr.length?arr.map(v=>{const votes=v.votes||{},counts=v.options.map((o,i)=>Object.values(votes).filter(x=>x===i).length),total=Object.keys(votes).length,closed=v.closed||false;return `<article class="mini-card"><div class="section-heading"><span class="pill ${closed?"":"progress"}">${closed?"مغلق":"مفتوح"}</span><small class="muted">${v.type==="secret"?"تصويت سري":"تصويت علني"}</small></div><h3>${esc(v.title)}</h3><p>بواسطة ${esc(v.createdBy||"عضو")} ${v.deadline?" • ينتهي "+esc(v.deadline):""}</p>${v.options.map((o,i)=>`<label class="vote-choice"><span>${esc(o)} <small>(${counts[i]})</small></span><input type="radio" name="vote-${v.id}" value="${i}" ${votes[uid]===i?"checked":""} ${closed?"disabled":""}></label><div class="vote-bar"><span style="width:${total?counts[i]/total*100:0}%"></span></div>`).join("")}<div class="task-meta"><span>${total} صوت</span></div><div class="card-actions">${!closed?`<button class="small-btn" data-cast-vote="${v.id}">تأكيد تصويتي</button>`:""}<button class="small-btn" data-close-vote="${v.id}">${closed?"التصويت مغلق":"إغلاق التصويت"}</button></div></article>`}).join(""):"لا توجد تصويتات حاليًا.";
 el.querySelectorAll("[data-cast-vote]").forEach(b=>b.onclick=()=>castVote(b.dataset.castVote));el.querySelectorAll("[data-close-vote]").forEach(b=>b.onclick=()=>closeVote(b.dataset.closeVote));
}
async function castVote(id){const v=data.votes.find(x=>x.id===id),chosen=document.querySelector(`input[name="vote-${id}"]:checked`);if(!chosen)return toast("اختر إجابة أولًا");try{const updated={...(v.votes||{}),[uid]:Number(chosen.value)};await updateDoc(doc(db,"groups",GROUP_ID,"votes",id),{votes:updated});toast("تم تسجيل صوتك")}catch(e){toast("تعذر تسجيل التصويت")}}
async function closeVote(id){const v=data.votes.find(x=>x.id===id);if(!confirm(v.closed?"إعادة فتح التصويت؟":"إغلاق التصويت؟"))return;try{await updateDoc(doc(db,"groups",GROUP_ID,"votes",id),{closed:!v.closed});toast("تم تحديث حالة التصويت")}catch(e){toast("تعذر تحديث التصويت")}}
function renderMembers(){$("chatMemberCount").textContent=data.members.length;const el=$("membersList");el.className=data.members.length?"card-grid":"card-grid empty-state";el.innerHTML=data.members.length?data.members.map(m=>`<article class="mini-card"><div class="member-line"><span class="member-avatar">${esc((m.name||"?").trim().charAt(0))}</span><div><h3>${esc(m.name)}</h3><small>عضو في الفريق</small></div></div><div class="task-meta"><span>${data.tasks.filter(t=>t.assignee===m.name).length} مهمة مسندة</span></div></article>`).join(""):"لا يوجد أعضاء بعد."}
function renderMeetings(){const el=$("meetingsList");el.className=data.meetings.length?"card-grid":"card-grid empty-state";el.innerHTML=data.meetings.length?data.meetings.map(m=>`<article class="mini-card"><h3>${esc(m.title)}</h3><p>📅 ${esc((m.date||"").replace("T"," "))}</p><p>${esc(m.notes||"لا توجد ملاحظات.")}</p><div class="task-meta">أضافه ${esc(m.createdBy)}</div><div class="card-actions"><button class="small-btn danger" data-del-meeting="${m.id}">حذف</button></div></article>`).join(""):"لا توجد اجتماعات مسجلة.";el.querySelectorAll("[data-del-meeting]").forEach(b=>b.onclick=()=>removeItem("meetings",b.dataset.delMeeting,"الاجتماع"))}
function renderResources(){const el=$("resourcesList");el.className=data.resources.length?"card-grid":"card-grid empty-state";el.innerHTML=data.resources.length?data.resources.map(r=>`<article class="mini-card"><h3>${esc(r.title)}</h3><p>${esc(r.note||"")}</p><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" class="text-btn">فتح المصدر ↗</a><div class="card-actions"><button class="small-btn danger" data-del-resource="${r.id}">حذف</button></div></article>`).join(""):"لا توجد مصادر مضافة.";el.querySelectorAll("[data-del-resource]").forEach(b=>b.onclick=()=>removeItem("resources",b.dataset.delResource,"المصدر"))}
function renderActivity(){const el=$("activityList"),arr=data.activity.slice(0,8);el.className="item-list"+(arr.length?"":" empty-state");el.innerHTML=arr.length?arr.map(a=>`<div class="task-row"><div><b>${esc(a.text)}</b><small>${esc(a.by||"عضو")}</small></div></div>`).join(""):"ستظهر الأنشطة الجديدة هنا."}
function chatTime(value){const d=value?.toDate?value.toDate():new Date();return new Intl.DateTimeFormat("ar-EG",{hour:"2-digit",minute:"2-digit"}).format(d)}
function chatDay(value){const d=value?.toDate?value.toDate():new Date();return d.toLocaleDateString("ar-EG",{weekday:"long",day:"numeric",month:"long"})}
function chatDayKey(value){const d=value?.toDate?value.toDate():new Date();return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`}
function renderChat(){
 const el=$("chatMessages"),messages=data.messages||[];
 if(!messages.length){el.innerHTML='<div class="chat-welcome"><div class="chat-welcome-icon">✦</div><b>أهلًا بيكم في مساحة الكلام</b><p>ابدأوا المحادثة، وخلّوا الأفكار تتحرك.</p></div>';return;}
 let lastDay="";
 el.innerHTML=messages.map(m=>{
   const day=chatDayKey(m.createdAt),divider=day!==lastDay?`<div class="chat-day-divider"><span>${esc(chatDay(m.createdAt))}</span></div>`:"";lastDay=day;
   const mine=m.authorUid===uid,initial=(m.senderName||"ع").trim().charAt(0)||"ع";
   const quote=m.replyToText?`<div class="chat-reply-quote"><b>${esc(m.replyToName||"عضو")}</b>${esc(m.replyToText)}</div>`:"";
   const actions=`<div class="chat-message-actions"><button class="chat-action" data-reply-message="${m.id}">رد</button>${mine?`<button class="chat-action danger" data-delete-message="${m.id}">حذف</button>`:""}</div>`;
   return `${divider}<article class="chat-message ${mine?"mine":""}"><span class="chat-avatar">${esc(initial)}</span><div class="chat-bubble">${mine?"":`<div class="chat-sender">${esc(m.senderName||"عضو")}</div>`}${quote}<div class="chat-text">${esc(m.text||"")}</div><div class="chat-meta"><span>${chatTime(m.createdAt)}</span>${actions}</div></div></article>`;
 }).join("");
 el.querySelectorAll("[data-reply-message]").forEach(b=>b.onclick=()=>setChatReply(b.dataset.replyMessage));
 el.querySelectorAll("[data-delete-message]").forEach(b=>b.onclick=()=>deleteChatMessage(b.dataset.deleteMessage));
}
function setChatReply(id){const m=data.messages.find(x=>x.id===id);if(!m)return;replyTarget=m;const p=$("chatReplyPreview");p.classList.remove("hidden");p.innerHTML=`<button type="button" id="cancelChatReply" aria-label="إلغاء الرد">×</button><b>الرد على ${esc(m.senderName||"عضو")}</b>${esc((m.text||"").slice(0,120))}`;$("cancelChatReply").onclick=clearChatReply;$("chatInput").focus()}
function clearChatReply(){replyTarget=null;$("chatReplyPreview").classList.add("hidden");$("chatReplyPreview").innerHTML=""}
async function deleteChatMessage(id){const m=data.messages.find(x=>x.id===id);if(!m||m.authorUid!==uid)return;if(!confirm("هل تريد حذف رسالتك؟"))return;try{await deleteDoc(doc(db,"groups",GROUP_ID,"messages",id));toast("تم حذف الرسالة")}catch(e){toast("تعذر حذف الرسالة")}}
$("chatInput").addEventListener("input",()=>{$("chatCharCount").textContent=`${$("chatInput").value.length} / 1000`;$("chatInput").style.height="auto";$("chatInput").style.height=Math.min($("chatInput").scrollHeight,130)+"px"});
$("chatInput").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("chatForm").requestSubmit()}});
$("chatForm").addEventListener("submit",async e=>{
 e.preventDefault();const input=$("chatInput"),textValue=input.value.trim();if(!textValue)return;
 const btn=$("sendChatBtn");btn.disabled=true;
 const payload={text:textValue,authorUid:uid,senderName:memberName,createdAt:serverTimestamp()};
 if(replyTarget){payload.replyToId=replyTarget.id;payload.replyToName=replyTarget.senderName||"عضو";payload.replyToText=(replyTarget.text||"").slice(0,180)}
 try{await addDoc(col("messages"),payload);input.value="";input.style.height="auto";$("chatCharCount").textContent="0 / 1000";clearChatReply();$("chatMessages").scrollTop=$("chatMessages").scrollHeight}
 catch(err){console.error(err);toast("تعذر إرسال الرسالة. تأكد من تحديث قواعد Firestore")}
 finally{btn.disabled=false;input.focus()}
});

async function init(){
 try{
  const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);
  onAuthStateChanged(auth,async user=>{if(!user){try{await signInAnonymously(auth)}catch(e){showLogin("تعذر الاتصال. تأكد من إعداد Firebase وتفعيل Anonymous Authentication.");statusEl.classList.remove("online");}return}
   uid=user.uid;statusEl.innerHTML="<i></i> متصل";statusEl.classList.add("online");
   const profile=await getDoc(memberRef(uid));if(profile.exists()){memberName=profile.data().name||"عضو";showWorkspace();startListeners()}
  });
 }catch(e){console.error(e);showLogin("لم يتم إعداد Firebase بعد. اتبع ملف README لإكمال الإعداد.");}
}
init();
