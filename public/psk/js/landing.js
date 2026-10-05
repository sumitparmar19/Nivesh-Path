// Landing page: live price strip from our own cached quotes, and the main button for logged-in visitors.
(function () {
  "use strict";
  var NP = window.NP;
  if (NP && NP.isLoggedIn()) {
    var cta = document.getElementById("heroCta");
    cta.href = "/portfolio.html";
    cta.textContent = "Open my portfolio";
  }
  var strip = document.getElementById("marketStrip");
  fetch("/search", { headers: { Accept: "application/json" } })
    .then(function (res) { if (!res.ok) throw new Error(); return res.json(); })
    .then(function (quotes) {
      strip.innerHTML = NP.stocks.filter(function (s) { return quotes[s.symbol]; }).map(function (s) {
        var q = quotes[s.symbol];
        return '<a href="' + s.url + '"><strong>' + s.symbol + "</strong><span>$" + Number(q.c).toFixed(2) + '</span><small class="' +
          (q.dp >= 0 ? "np-up" : "np-down") + '">' + (q.dp >= 0 ? "+" : "") + Number(q.dp).toFixed(2) + "%</small></a>";
      }).join("");
    })
    .catch(function () { strip.hidden = true; });
})();
