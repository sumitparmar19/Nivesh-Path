// Login page: email or mobile + password -> /api/login, then store the session and the user's saved settings
// (theme) and return to the page that asked for login (?next=), or to Portfolio.
(function () {
  "use strict";
  function safeNext() {
    var next = new URLSearchParams(location.search).get("next");
    return next && next.charAt(0) === "/" && next.charAt(1) !== "/" ? next : null;
  }
  // Already logged in with a valid token: skip the form.
  if (window.NP && window.NP.isLoggedIn()) { location.replace(safeNext() || "/portfolio.html"); return; }

  var form = document.getElementById("loginForm");
  if (!form) return;
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var login = document.getElementById("loginId").value.trim();
    var password = document.getElementById("loginPassword").value;
    var button = form.querySelector("button[type=submit]");
    if (!login || !password) { window.NP.toast("Enter your email or mobile number and your password.", "info", "Missing details"); return; }
    button.disabled = true;
    button.textContent = "Logging in…";
    try {
      var res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(login.indexOf("@") >= 0 ? { email: login, password: password } : { mobile: login, password: password }),
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.message || "Login failed. Please check your details.");
      window.NP.saveSession(data.token, data.user || data);
      location.href = safeNext() || "/portfolio.html";
    } catch (err) {
      window.NP.toast(err.message || "Couldn't log in. Please try again.", "error", "Login failed");
      button.disabled = false;
      button.textContent = "Log in";
    }
  });
})();
