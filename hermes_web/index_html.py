# -*- coding: utf-8 -*-
"""The single-page chat UI, served as-is by server.py."""

INDEX_HTML = r"""<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark light">
<title>Hermes چت</title>
<style>
  :root{
    --bg:#0f1115; --panel:#161a21; --panel-2:#1b2129; --border:#262c36;
    --text:#e7ecf3; --muted:#9aa4b2; --accent:#4f8cff; --accent-2:#2f6ae0;
    --user:#1f2a3d; --user-border:#2b3a55; --bot:#171c24; --bot-border:#242b36;
    --danger:#ff5c6c; --ok:#3ecf8e; --code:#0c0f14;
    --radius:16px; --maxw:900px;
  }
  @media (prefers-color-scheme: light){
    :root{
      --bg:#f4f6fb; --panel:#ffffff; --panel-2:#f0f3f9; --border:#e2e7f0;
      --text:#12161d; --muted:#5b6472; --user:#e7efff; --user-border:#cfe0ff;
      --bot:#ffffff; --bot-border:#e6ebf3; --code:#f2f4f8;
    }
  }
  *{box-sizing:border-box}
  html,body{height:100%}
  body{
    margin:0; background:var(--bg); color:var(--text);
    font-family:'Vazirmatn','Segoe UI','Tahoma','Iranian Sans',system-ui,-apple-system,sans-serif;
    font-size:16px; line-height:1.75;
    display:flex; flex-direction:column; height:100dvh;
    -webkit-tap-highlight-color:transparent;
  }
  header{
    display:flex; gap:10px; align-items:center; flex-wrap:wrap;
    padding:10px max(12px, env(safe-area-inset-right)) 10px max(12px, env(safe-area-inset-left));
    background:var(--panel); border-bottom:1px solid var(--border); position:sticky; top:0; z-index:5;
  }
  .brand{font-weight:700; font-size:1.05rem; letter-spacing:.2px; margin-inline-end:auto; display:flex; align-items:center; gap:8px}
  .brand .dot{width:9px;height:9px;border-radius:50%;background:var(--ok);box-shadow:0 0 10px var(--ok)}
  .brand .dot.off{background:var(--danger);box-shadow:0 0 10px var(--danger)}
  select, button, textarea{font-family:inherit; font-size:1rem; color:var(--text)}
  select{
    background:var(--panel-2); border:1px solid var(--border); border-radius:10px;
    padding:8px 10px; max-width:46vw; outline:none;
  }
  .btn{
    background:var(--panel-2); border:1px solid var(--border); border-radius:10px;
    padding:8px 12px; cursor:pointer; white-space:nowrap; transition:.15s;
  }
  .btn:hover{border-color:var(--accent)}
  .btn.icon{padding:8px 10px}
  main{
    flex:1; overflow-y:auto; overflow-x:hidden;
    padding:18px max(12px, env(safe-area-inset-right)) 8px max(12px, env(safe-area-inset-left));
    scroll-behavior:smooth;
  }
  .thread{max-width:var(--maxw); margin:0 auto; display:flex; flex-direction:column; gap:14px}
  .msg{display:flex; gap:10px; align-items:flex-start}
  .msg .avatar{
    flex:0 0 auto; width:30px; height:30px; border-radius:9px; display:grid; place-items:center;
    font-size:.85rem; font-weight:700; margin-top:2px;
  }
  .msg.user .avatar{background:var(--user-border); color:#dbe7ff}
  .msg.bot .avatar{background:#243447; color:#bfe3ff}
  .bubble{
    flex:1 1 auto; min-width:0; border-radius:var(--radius); padding:12px 14px;
    border:1px solid var(--bot-border); background:var(--bot);
    unicode-bidi:plaintext; overflow-wrap:anywhere; word-break:break-word;
  }
  .msg.user .bubble{background:var(--user); border-color:var(--user-border)}
  .bubble p{margin:.2em 0}
  .bubble p:first-child{margin-top:0}
  .bubble p:last-child{margin-bottom:0}
  .bubble pre{
    background:var(--code); border:1px solid var(--border); border-radius:12px;
    padding:12px; overflow:auto; direction:ltr; text-align:left; margin:.5em 0;
  }
  .bubble code{font-family:ui-monospace,'SFMono-Regular',Menlo,Consolas,monospace; font-size:.92em}
  .bubble :not(pre) > code{background:var(--code); border:1px solid var(--border); padding:1px 5px; border-radius:6px; direction:ltr; unicode-bidi:embed}
  .bubble pre code{background:none; border:none; padding:0}
  .meta{display:flex; justify-content:flex-start; gap:8px; margin-top:6px}
  .meta .mbtn{font-size:.8rem; color:var(--muted); background:none; border:none; cursor:pointer; padding:2px 4px}
  .meta .mbtn:hover{color:var(--accent)}
  .cursor::after{content:'▍'; color:var(--accent); animation:blink 1s steps(2) infinite}
  @keyframes blink{50%{opacity:0}}
  .empty{max-width:var(--maxw); margin:8vh auto 0; text-align:center; color:var(--muted); padding:0 16px}
  .empty h2{color:var(--text); font-weight:700; margin-bottom:6px}
  .chips{display:flex; gap:8px; flex-wrap:wrap; justify-content:center; margin-top:16px}
  .chip{background:var(--panel-2); border:1px solid var(--border); border-radius:999px; padding:8px 14px; cursor:pointer; color:var(--text); font-size:.92rem}
  .chip:hover{border-color:var(--accent)}
  footer{
    background:var(--panel); border-top:1px solid var(--border);
    padding:10px max(12px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
  }
  .composer{max-width:var(--maxw); margin:0 auto; display:flex; gap:8px; align-items:flex-end}
  textarea{
    flex:1; resize:none; background:var(--panel-2); border:1px solid var(--border);
    border-radius:14px; padding:12px 14px; max-height:40vh; min-height:24px; outline:none; line-height:1.7;
  }
  textarea:focus{border-color:var(--accent)}
  .send{
    background:var(--accent); border:1px solid var(--accent-2); color:#fff; border-radius:14px;
    padding:0 16px; height:46px; min-width:64px; cursor:pointer; font-weight:600;
  }
  .send:disabled{opacity:.5; cursor:default}
  .send.stop{background:var(--danger); border-color:var(--danger)}
  .hint{max-width:var(--maxw); margin:6px auto 0; color:var(--muted); font-size:.78rem; text-align:center}
  .toast{
    position:fixed; bottom:calc(80px + env(safe-area-inset-bottom)); left:50%; transform:translateX(-50%);
    background:#000; color:#fff; padding:8px 14px; border-radius:10px; opacity:0; transition:.2s; pointer-events:none; z-index:20; font-size:.9rem;
  }
  .toast.show{opacity:.92}
  @media (max-width:560px){
    header{gap:6px} select{max-width:38vw; padding:7px 8px} .brand{font-size:.98rem}
    body{font-size:15.5px}
  }
</style>
</head>
<body>
<header>
  <div class="brand"><span class="dot off" id="statusDot"></span> Hermes</div>
  <select id="profileSel" title="پروفایل"></select>
  <select id="modelSel" title="مدل"></select>
  <button class="btn icon" id="newChat" title="گفتگوی جدید">＋ جدید</button>
</header>

<main id="main">
  <div id="thread" class="thread"></div>
  <div id="empty" class="empty">
    <h2>سلام 👋</h2>
    <div>یه پروفایل انتخاب کن و شروع کن به نوشتن. فارسی اینجا درست و تمیز نمایش داده میشه.</div>
    <div class="chips" id="chips">
      <div class="chip">سلام، معرفی کوتاه از خودت بده</div>
      <div class="chip">یه ایمیل رسمی فارسی برام بنویس</div>
      <div class="chip">این متن رو خلاصه کن</div>
    </div>
  </div>
</main>

<footer>
  <div class="composer">
    <textarea id="input" rows="1" placeholder="پیامت رو بنویس…  (Enter برای ارسال، Shift+Enter خط جدید)"></textarea>
    <button class="send" id="send">ارسال</button>
  </div>
  <div class="hint" id="hint"></div>
</footer>

<div class="toast" id="toast"></div>

<script>
(function(){
  "use strict";
  var $ = function(s){ return document.querySelector(s); };
  var profileSel = $("#profileSel"), modelSel = $("#modelSel");
  var thread = $("#thread"), main = $("#main"), empty = $("#empty");
  var input = $("#input"), sendBtn = $("#send"), newChatBtn = $("#newChat");
  var statusDot = $("#statusDot"), hint = $("#hint"), toastEl = $("#toast");

  var TOKEN = new URLSearchParams(location.search).get("token") ||
              localStorage.getItem("hermes_token") || "";
  if (TOKEN) localStorage.setItem("hermes_token", TOKEN);

  var state = { profile:"", model:"", messages:[], streaming:false, controller:null };

  function api(path, opts){
    opts = opts || {};
    opts.headers = opts.headers || {};
    if (TOKEN) opts.headers["X-Access-Token"] = TOKEN;
    return fetch(path, opts);
  }
  function toast(msg){
    toastEl.textContent = msg; toastEl.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(function(){ toastEl.classList.remove("show"); }, 2200);
  }
  function storeKey(){ return "hermes_chat_" + (state.profile || "default"); }
  function saveChat(){ try{ localStorage.setItem(storeKey(), JSON.stringify(state.messages)); }catch(e){} }
  function loadChat(){
    try{ state.messages = JSON.parse(localStorage.getItem(storeKey()) || "[]") || []; }
    catch(e){ state.messages = []; }
  }

  // ---- tiny, safe markdown (escape first, then a few rules) ----
  function esc(s){ return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  function renderMarkdown(text){
    var out = [], parts = text.split(/```/);
    for (var i=0;i<parts.length;i++){
      if (i % 2 === 1){ // fenced code block
        var body = parts[i].replace(/^[a-zA-Z0-9_-]*\n/, "");
        out.push('<pre><code>' + esc(body.replace(/\n$/,"")) + '</code></pre>');
      } else {
        var seg = esc(parts[i]);
        seg = seg.replace(/`([^`\n]+)`/g, function(_,c){ return '<code>'+c+'</code>'; });
        seg = seg.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        seg = seg.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
        seg = seg.split(/\n{2,}/).map(function(p){
          return '<p>' + p.replace(/\n/g,'<br>') + '</p>';
        }).join("");
        out.push(seg);
      }
    }
    return out.join("");
  }

  function el(tag, cls){ var e=document.createElement(tag); if(cls) e.className=cls; return e; }

  function addMessageNode(role, content){
    var wrap = el("div", "msg " + (role==="user"?"user":"bot"));
    var av = el("div","avatar"); av.textContent = role==="user" ? "شما" : "H";
    var col = el("div"); col.style.flex = "1 1 auto"; col.style.minWidth = "0";
    var bubble = el("div","bubble"); bubble.setAttribute("dir","auto");
    bubble.innerHTML = renderMarkdown(content || "");
    col.appendChild(bubble);
    var meta = el("div","meta");
    var copy = el("button","mbtn"); copy.textContent="کپی";
    copy.onclick = function(){ navigator.clipboard.writeText(content).then(function(){toast("کپی شد");}); };
    meta.appendChild(copy);
    col.appendChild(meta);
    wrap.appendChild(av); wrap.appendChild(col);
    thread.appendChild(wrap);
    return { bubble: bubble, meta: meta, copyBtn: copy, wrap: wrap };
  }

  function renderAll(){
    thread.innerHTML = "";
    empty.style.display = state.messages.length ? "none" : "block";
    for (var i=0;i<state.messages.length;i++){
      var m = state.messages[i];
      var node = addMessageNode(m.role, m.content);
      node.copyBtn.onclick = (function(text){ return function(){ navigator.clipboard.writeText(text).then(function(){toast("کپی شد");}); }; })(m.content);
    }
    scrollToBottom();
  }
  function scrollToBottom(){ main.scrollTop = main.scrollHeight; }

  function autoGrow(){ input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, window.innerHeight*0.4) + "px"; }
  input.addEventListener("input", autoGrow);

  function setStreaming(on){
    state.streaming = on;
    if (on){ sendBtn.textContent="توقف"; sendBtn.classList.add("stop"); }
    else { sendBtn.textContent="ارسال"; sendBtn.classList.remove("stop"); }
  }

  async function loadConfig(){
    try{
      var r = await api("/api/config");
      if (r.status === 401){ hint.textContent = "توکن دسترسی لازمه — صفحه رو با ?token=... باز کن."; statusDot.classList.add("off"); return; }
      var cfg = await r.json();
      profileSel.innerHTML = "";
      (cfg.profiles||[]).forEach(function(p){
        var o = document.createElement("option");
        o.value = p.name; o.textContent = p.label; o.dataset.model = p.model || "";
        profileSel.appendChild(o);
      });
      var saved = localStorage.getItem("hermes_last_profile");
      state.profile = (saved && [].some.call(profileSel.options,function(o){return o.value===saved;}))
                      ? saved : (cfg.default_profile || (cfg.profiles[0]&&cfg.profiles[0].name) || "");
      profileSel.value = state.profile;
      statusDot.classList.remove("off");
      await onProfileChange();
    }catch(e){
      hint.textContent = "اتصال به سرور برقرار نشد.";
      statusDot.classList.add("off");
    }
  }

  async function loadModels(){
    modelSel.innerHTML = "";
    var fallback = profileSel.options[profileSel.selectedIndex] ? profileSel.options[profileSel.selectedIndex].dataset.model : "";
    try{
      var r = await api("/api/models?profile=" + encodeURIComponent(state.profile));
      var d = await r.json();
      var models = (d.models||[]);
      if (!models.length && fallback) models = [fallback];
      models.forEach(function(m){
        var o=document.createElement("option"); o.value=m; o.textContent=m; modelSel.appendChild(o);
      });
      if (!models.length){ var o=document.createElement("option"); o.value=""; o.textContent="(پیش‌فرض)"; modelSel.appendChild(o); }
      var savedM = localStorage.getItem("hermes_model_" + state.profile);
      if (savedM && [].some.call(modelSel.options,function(o){return o.value===savedM;})) modelSel.value = savedM;
      state.model = modelSel.value;
    }catch(e){
      if (fallback){ var o=document.createElement("option"); o.value=fallback; o.textContent=fallback; modelSel.appendChild(o); state.model=fallback; }
    }
  }

  async function onProfileChange(){
    state.profile = profileSel.value;
    localStorage.setItem("hermes_last_profile", state.profile);
    loadChat();
    renderAll();
    await loadModels();
  }

  profileSel.addEventListener("change", onProfileChange);
  modelSel.addEventListener("change", function(){
    state.model = modelSel.value;
    localStorage.setItem("hermes_model_" + state.profile, state.model);
  });

  newChatBtn.addEventListener("click", function(){
    if (state.streaming) return;
    state.messages = []; saveChat(); renderAll(); input.focus();
  });

  Array.prototype.forEach.call(document.querySelectorAll("#chips .chip"), function(c){
    c.addEventListener("click", function(){ input.value = c.textContent; autoGrow(); input.focus(); });
  });

  async function send(){
    if (state.streaming){ if (state.controller) state.controller.abort(); return; }
    var text = input.value.trim();
    if (!text) return;
    input.value = ""; autoGrow();

    state.messages.push({ role:"user", content:text });
    empty.style.display = "none";
    var uNode = addMessageNode("user", text);
    uNode.copyBtn.onclick = (function(t){ return function(){ navigator.clipboard.writeText(t).then(function(){toast("کپی شد");}); }; })(text);
    saveChat(); scrollToBottom();

    var botNode = addMessageNode("bot", "");
    botNode.bubble.classList.add("cursor");
    scrollToBottom();

    setStreaming(true);
    state.controller = new AbortController();
    var acc = "";
    try{
      var resp = await api("/api/chat", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ profile: state.profile, model: state.model, messages: state.messages }),
        signal: state.controller.signal
      });
      if (!resp.ok || !resp.body){ throw new Error("HTTP " + resp.status); }
      var reader = resp.body.getReader();
      var dec = new TextDecoder();
      var buf = "";
      while (true){
        var chunk = await reader.read();
        if (chunk.done) break;
        buf += dec.decode(chunk.value, {stream:true});
        var events = buf.split("\n\n");
        buf = events.pop();
        for (var i=0;i<events.length;i++){
          var line = events[i].trim();
          if (!line.startsWith("data:")) continue;
          var payload = line.slice(5).trim();
          if (!payload) continue;
          var obj;
          try{ obj = JSON.parse(payload); }catch(e){ continue; }
          if (obj.error){ acc += (acc?"\n\n":"") + "⚠️ خطا: " + obj.error; }
          else if (obj.delta){ acc += obj.delta; }
          if (obj.done){ /* end */ }
          botNode.bubble.innerHTML = renderMarkdown(acc);
          scrollToBottom();
        }
      }
    }catch(e){
      if (e.name === "AbortError"){ acc += (acc?" ":"") + " ⏹"; }
      else { acc += (acc?"\n\n":"") + "⚠️ خطا در ارتباط: " + e.message; }
    }
    botNode.bubble.classList.remove("cursor");
    botNode.bubble.innerHTML = renderMarkdown(acc || "(پاسخی دریافت نشد)");
    botNode.copyBtn.onclick = (function(t){ return function(){ navigator.clipboard.writeText(t).then(function(){toast("کپی شد");}); }; })(acc);
    state.messages.push({ role:"assistant", content: acc });
    saveChat();
    setStreaming(false);
    state.controller = null;
    input.focus();
  }

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", function(e){
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing){ e.preventDefault(); send(); }
  });

  loadConfig();
  autoGrow();
})();
</script>
</body>
</html>
"""
