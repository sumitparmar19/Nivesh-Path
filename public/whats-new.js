// What's new page: fills the live system-status card from the public /api/status endpoint
// and swaps the sign-up button for "Ask the advisor" when the visitor is already logged in.
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  function set(id, text, state) {
    const el = $(id);
    const dot = state === "ok" ? "np-dot--ok" : state === "warn" ? "np-dot--warn" : state === "bad" ? "np-dot--bad" : "";
    el.innerHTML = `<span class="np-dot ${dot}"></span>`;
    el.appendChild(document.createTextNode(text));
  }

  const INDEX = {
    ok: (i) => [`Done · ${i.transactions} trades for ${i.users} user${i.users === 1 ? "" : "s"} in ${Number(i.seconds).toFixed(1)}s`, "ok"],
    running: () => ["Rebuilding now…", "warn"],
    pending: () => ["Starting…", "warn"],
    failed: () => ["Failed - advisor runs without history", "bad"],
    disabled: () => ["Not configured (no database link)", "warn"],
  };

  async function check() {
    let s;
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      if (!res.ok) throw new Error();
      s = await res.json();
    } catch (err) {
      ["stWeb", "stDb", "stAi", "stLlm", "stIndex"].forEach((id) => set(id, "Unknown", "bad"));
      $("overall").className = "np-pill np-pill--red";
      $("overall").innerHTML = '<span class="np-dot np-dot--bad"></span>Unreachable';
      return;
    }
    set("stWeb", "Online", "ok");
    set("stDb", s.db === "connected" ? "Connected" : "Disconnected", s.db === "connected" ? "ok" : "bad");
    const ai = s.ai || {};
    set("stAi", ai.reachable ? "Online" : "Offline", ai.reachable ? "ok" : "bad");
    if (ai.reachable) {
      set("stLlm", ai.llmConfigured ? ai.model || "Configured" : "Rule-based fallback", ai.llmConfigured ? "ok" : "warn");
      const idx = ai.vectorIndex;
      const [text, state] = idx && INDEX[idx.status] ? INDEX[idx.status](idx) : ["Unknown", "warn"];
      set("stIndex", text, state);
    } else {
      set("stLlm", "Unavailable", "bad");
      set("stIndex", "Unavailable", "bad");
    }
    const healthy = s.db === "connected" && ai.reachable && ai.llmConfigured && ai.vectorIndex && ai.vectorIndex.status === "ok";
    $("overall").className = `np-pill ${healthy ? "" : "np-pill--amber"}`;
    $("overall").innerHTML = `<span class="np-dot ${healthy ? "np-dot--ok" : "np-dot--warn"}"></span>${healthy ? "All systems go" : "Partly degraded"}`;
    $("stChecked").textContent = `Checked ${new Date(s.checkedAt || Date.now()).toLocaleTimeString()} · refreshes every 30 seconds`;
  }

  if (window.NP && window.NP.isLoggedIn()) {
    const btn = $("heroSignup");
    btn.href = "/advisor.html";
    btn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> Ask the AI advisor';
  }
  check();
  setInterval(check, 30000);
})();
