// Sign-up page: creates the account (/api/register), signs the user in and opens Portfolio,
// where the $100,000 of virtual cash is waiting.
(function () {
  "use strict";
  if (window.NP && window.NP.isLoggedIn()) { location.replace("/portfolio.html"); return; }
  var form = document.getElementById("signupForm");
  if (!form) return;
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var body = {
      name: document.getElementById("name").value.trim(),
      email: document.getElementById("email").value.trim(),
      mobile: document.getElementById("mobile").value.trim(),
      password: document.getElementById("password").value,
    };
    if (!body.name || !body.email || !body.mobile || !body.password) {
      window.NP.toast("Please fill in every field.", "info", "Missing details");
      return;
    }
    if (body.password.length < 6) {
      window.NP.toast("Use a password with at least 6 characters.", "info", "Password too short");
      return;
    }
    var button = form.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = "Creating account…";
    try {
      var res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.message || "Registration failed.");
      window.NP.saveSession(data.token, data.user || {});
      window.NP.toast("You have $100,000 in virtual cash to start investing.", "success", "Welcome to Nivesh-Path!");
      location.href = "/portfolio.html";
    } catch (err) {
      window.NP.toast(err.message || "Couldn't create your account. Please try again.", "error", "Sign-up failed");
      button.disabled = false;
      button.textContent = "Create account";
    }
  });
})();
