// Buy/Sell for stock pages, against the user's $100k virtual cash wallet (paper trading).
// Reads the ticker from <body data-symbol="...">; the server prices the order and checks cash/holdings.
(function () {
  "use strict";
  var symbol = document.body.getAttribute("data-symbol");
  var buyBtn = document.getElementById("buyBtn");
  var sellBtn = document.getElementById("sellBtn");
  var priceEl = document.getElementById("price");
  var qtyEl = document.getElementById("quantity");
  if (!symbol || !buyBtn || !sellBtn || !priceEl || !qtyEl || !window.NP) return;

  var NP = window.NP;
  var money = function (n) { return Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD" }); };

  qtyEl.setAttribute("min", "1");
  qtyEl.setAttribute("step", "1");
  qtyEl.setAttribute("inputmode", "numeric");

  // Show the cash available (or a login prompt) under the Buy/Sell buttons.
  var note = document.querySelector(".np-trade-note");
  function showCash(balance) {
    if (note) note.innerHTML = 'Cash available: <strong>' + money(balance) + "</strong> · virtual paper-trading money";
  }
  if (note) {
    if (NP.isLoggedIn()) {
      NP.authFetch("/api/portfolio/cash-balance")
        .then(function (res) { return res.json(); })
        .then(function (data) { if (data && typeof data.cashBalance === "number") showCash(data.cashBalance); })
        .catch(function () {});
    } else {
      note.innerHTML = '<a href="' + NP.loginUrl() + '">Log in</a> to trade with $100,000 in virtual cash.';
    }
  }

  function readOrder() {
    var price = parseFloat(priceEl.value);
    var quantity = parseInt(qtyEl.value, 10);
    if (!(price > 0)) {
      NP.toast("The live price hasn't loaded yet. Please wait a moment and try again.", "info", "Price loading");
      return null;
    }
    if (!(quantity > 0)) {
      NP.toast("Enter how many shares you want (1 or more).", "info", "Quantity needed");
      qtyEl.focus();
      return null;
    }
    return { price: price, quantity: quantity };
  }

  function busy(btn, on, label) {
    if (on) {
      btn.dataset.label = btn.textContent;
      btn.textContent = label;
      btn.disabled = true;
    } else {
      btn.textContent = btn.dataset.label || btn.textContent;
      btn.disabled = false;
    }
  }

  async function place(type, btn) {
    var order = readOrder();
    if (!order) return;
    busy(btn, true, type === "BUY" ? "Buying…" : "Selling…");
    try {
      var res = await NP.authFetch("/api/store-purchase", {
        method: "POST",
        body: JSON.stringify({ symbol: symbol, quantity: order.quantity, price: order.price, type: type }),
      });
      var data = {};
      try { data = await res.json(); } catch (e) {}
      if (!res.ok) throw new Error(data.error || "Could not place the order");
      var tx = data.transaction || {};
      NP.toast(
        (type === "BUY" ? "Bought " : "Sold ") + tx.quantity + " " + symbol + " at " + money(tx.price) +
          ". Cash left: " + money(data.newBalance) + ".",
        "success",
        "Order filled"
      );
      showCash(data.newBalance);
      qtyEl.value = "";
    } catch (err) {
      NP.toast(err.message, "error", "Order not placed");
    } finally {
      busy(btn, false);
    }
  }

  buyBtn.addEventListener("click", function (e) { e.preventDefault(); place("BUY", buyBtn); });
  sellBtn.addEventListener("click", function (e) { e.preventDefault(); place("SELL", sellBtn); });
})();
