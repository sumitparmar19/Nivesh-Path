// Contact page: sends the form to /api/contact (saved to MongoDB, emailed to the owner) and pre-fills
// the name and email of a logged-in user.
(function () {
  "use strict";
  var NP = window.NP;
  var form = document.getElementById("contactForm");
  try {
    var me = JSON.parse(localStorage.getItem("niveshPathUser") || "{}");
    if (me.name) form.elements.name.value = me.name;
    if (me.email) form.elements.email.value = me.email;
  } catch (e) {}

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var body = {
      name: form.elements.name.value.trim(),
      email: form.elements.email.value.trim(),
      subject: form.elements.subject.value,
      message: form.elements.message.value.trim(),
    };
    if (!body.name || !body.email || !body.message) {
      NP.toast("Please add your name, email and a message.", "info", "Missing details");
      return;
    }
    var btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      var headers = { "Content-Type": "application/json" };
      var token = NP.getToken();
      if (token) headers.Authorization = "Bearer " + token;
      var res = await fetch("/api/contact", { method: "POST", headers: headers, body: JSON.stringify(body) });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || "Your message couldn't be sent.");
      form.elements.message.value = "";
      NP.toast("Thanks! Your message was received and Sumit will reply by email.", "success", "Message sent");
    } catch (err) {
      NP.toast(err.message, "error", "Not sent");
    } finally {
      btn.disabled = false;
    }
  });
})();
