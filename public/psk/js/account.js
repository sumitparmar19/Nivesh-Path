// Account page: loads the profile from /api/me and saves every change back to MongoDB
// (profile, theme, password), plus paper-account reset and account deletion behind a typed confirmation.
(function () {
  "use strict";
  var NP = window.NP;
  var $ = function (id) { return document.getElementById(id); };
  if (!NP.isLoggedIn()) { NP.authFetch("/api/me"); return; } // redirects to login

  var profileForm = $("profileForm");
  var passwordForm = $("passwordForm");

  async function call(url, method, body) {
    var res = await NP.authFetch(url, { method: method, body: body ? JSON.stringify(body) : undefined });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || data.message || "Something went wrong. Please try again.");
    return data;
  }
  function busy(btn, on, label) {
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
  }

  // ---------- Profile ----------
  function showUser(u) {
    $("accountName").textContent = u.name || "Your account";
    var since = u.createdAt ? " · member since " + new Date(u.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "";
    $("accountMeta").textContent = (u.email || "") + since;
    ["name", "nickname", "email", "mobile", "country", "city", "address"].forEach(function (f) {
      if (profileForm.elements[f]) profileForm.elements[f].value = u[f] || "";
    });
    loadAvatar();
    setTheme((u.settings && u.settings.theme) || "light", false);
    // Keep the navbar's cached name in sync with the database.
    try {
      var cached = JSON.parse(localStorage.getItem("niveshPathUser") || "{}");
      cached.name = u.name; cached.email = u.email; cached.mobile = u.mobile;
      localStorage.setItem("niveshPathUser", JSON.stringify(cached));
    } catch (e) {}
  }
  async function loadAvatar() {
    try {
      var res = await NP.authFetch("/api/me/avatar");
      if (!res.ok) return;
      var url = URL.createObjectURL(await res.blob());
      $("avatar").src = url;
    } catch (e) {}
  }
  profileForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var btn = profileForm.querySelector("button[type=submit]");
    var body = {};
    ["name", "nickname", "email", "mobile", "country", "city", "address"].forEach(function (f) { body[f] = profileForm.elements[f].value; });
    busy(btn, true, "Saving…");
    try {
      showUser(await call("/api/me", "PATCH", body));
      $("profileSaved").textContent = "Saved " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      NP.toast("Your profile is saved to your account.", "success", "Profile updated");
    } catch (err) {
      NP.toast(err.message, "error", "Profile not saved");
    } finally {
      busy(btn, false);
    }
  });

  // ---------- Theme (saved to the account + applied now) ----------
  function setTheme(theme, save) {
    document.body.classList.toggle("dark-mode", theme === "dark");
    try { localStorage.setItem("niveshPathTheme", theme); } catch (e) {}
    document.querySelectorAll("#themeSwitch button").forEach(function (b) {
      var on = b.getAttribute("data-theme") === theme;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-checked", String(on));
    });
    if (save) {
      call("/api/me/settings", "PATCH", { theme: theme })
        .then(function () { NP.toast("Theme saved to your account.", "success", theme === "dark" ? "Dark mode" : "Light mode"); })
        .catch(function (err) { NP.toast(err.message, "error"); });
    }
  }
  $("themeSwitch").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-theme]");
    if (b) setTheme(b.getAttribute("data-theme"), true);
  });

  // ---------- Password ----------
  passwordForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var f = passwordForm.elements;
    if (f.newPassword.value.length < 6) { NP.toast("Use at least 6 characters for the new password.", "info"); return; }
    if (f.newPassword.value !== f.confirmPassword.value) { NP.toast("The two new passwords don't match.", "info"); return; }
    var btn = passwordForm.querySelector("button[type=submit]");
    busy(btn, true, "Changing…");
    try {
      await call("/api/me/password", "POST", { currentPassword: f.currentPassword.value, newPassword: f.newPassword.value });
      passwordForm.reset();
      NP.toast("Use your new password next time you log in.", "success", "Password changed");
    } catch (err) {
      NP.toast(err.message, "error", "Password not changed");
    } finally {
      busy(btn, false);
    }
  });

  // ---------- Typed confirmation dialog (reset / delete) ----------
  var dialog = $("confirmDialog");
  var pending = null;
  function confirmAction(opts) {
    pending = opts;
    $("confirmTitle").textContent = opts.title;
    $("confirmText").textContent = opts.text;
    $("confirmWord").textContent = opts.word;
    $("confirmPasswordLabel").hidden = !opts.password;
    $("confirmPassword").value = "";
    $("confirmInput").value = "";
    $("confirmOk").disabled = true;
    $("confirmOk").textContent = opts.button;
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "");
    $("confirmInput").focus();
  }
  function closeDialog() { if (dialog.close) dialog.close(); else dialog.removeAttribute("open"); }
  $("confirmInput").addEventListener("input", function () {
    $("confirmOk").disabled = $("confirmInput").value.trim().toUpperCase() !== pending.word;
  });
  $("confirmCancel").addEventListener("click", closeDialog);
  $("confirmForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!pending) return;
    $("confirmOk").disabled = true;
    try {
      await pending.run($("confirmPassword").value);
      closeDialog();
    } catch (err) {
      NP.toast(err.message, "error");
      $("confirmOk").disabled = false;
    }
  });

  $("resetBtn").addEventListener("click", function () {
    confirmAction({
      title: "Reset your paper account?",
      text: "All your trades will be deleted and your cash goes back to $100,000.",
      word: "RESET", button: "Reset account", password: false,
      run: async function () {
        var r = await call("/api/portfolio/reset", "POST", { confirm: "RESET" });
        NP.toast("Removed " + r.tradesRemoved + " trade" + (r.tradesRemoved === 1 ? "" : "s") + ". You have $100,000 again.", "success", "Account reset");
      },
    });
  });
  $("deleteBtn").addEventListener("click", function () {
    confirmAction({
      title: "Delete your account for good?",
      text: "Your profile, trades, watchlist, analyses and AI memory will be removed permanently.",
      word: "DELETE", button: "Delete account", password: true,
      run: async function (password) {
        await call("/api/me", "DELETE", { password: password, confirm: "DELETE" });
        try { localStorage.removeItem("token"); localStorage.removeItem("niveshPathUser"); } catch (e) {}
        NP.toast("Your account and all its data were deleted.", "info", "Account deleted");
        location.href = "/";
      },
    });
  });

  $("logoutBtn").addEventListener("click", function () { NP.logout(); });

  call("/api/me", "GET").then(showUser).catch(function (err) { NP.toast(err.message, "error"); });
})();
