// Buy/Sell for stock pages. Reads the ticker from <body data-symbol="...">.
// Buy -> Stripe Checkout for quantity x price; the trade is recorded after Stripe confirms payment.
// Sell -> checked against your holdings on the server, then recorded.
(function () {
  "use strict";
  var symbol = document.body.getAttribute("data-symbol");
  var buyBtn = document.getElementById("buyBtn");
  var sellBtn = document.getElementById("sellBtn");
  var priceEl = document.getElementById("price");
  var qtyEl = document.getElementById("quantity");
  if (!symbol || !buyBtn || !sellBtn || !priceEl || !qtyEl) return;

  var notify = function (msg, type, title) {
    if (window.NP && window.NP.toast) window.NP.toast(msg, type, title);
    else window.alert(msg);
  };

  qtyEl.setAttribute("min", "1");
  qtyEl.setAttribute("step", "1");
  qtyEl.setAttribute("inputmode", "numeric");

  function readOrder() {
    var price = parseFloat(priceEl.value);
    var quantity = parseInt(qtyEl.value, 10);
    if (!(price > 0)) {
      notify("The live price hasn't loaded yet. Please wait a moment and try again.", "info", "Price loading");
      return null;
    }
    if (!(quantity > 0)) {
      notify("Enter how many shares you want (1 or more).", "info", "Quantity needed");
      qtyEl.focus();
      return null;
    }
    return { price: price, quantity: quantity, total: Math.round(price * quantity * 100) / 100 };
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

  async function postJSON(url, body) {
    var res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    var data = {};
    try { data = await res.json(); } catch (e) {}
    return { ok: res.ok, status: res.status, data: data };
  }

  async function record(order, type) {
    return postJSON("/store-purchase", {
      name: symbol,
      price: order.price,
      quantity: order.quantity,
      total: order.total,
      transactionType: type,
    });
  }

  buyBtn.addEventListener("click", async function (e) {
    e.preventDefault();
    var order = readOrder();
    if (!order) return;
    busy(buyBtn, true, "Opening checkout…");
    try {
      var res = await postJSON("/create-checkout-session", {
        symbol: symbol,
        quantity: order.quantity,
        price: order.price,
        transactionType: "buy",
      });
      if (res.ok && res.data.url) {
        window.location.href = res.data.url;
        return;
      }
      if (res.status === 503) {
        // Payments not configured on this server: record it as a demo trade instead.
        var saved = await record(order, "buy");
        if (!saved.ok) throw new Error(saved.data.error || "Could not record the trade");
        notify("Bought " + order.quantity + " " + symbol + " (demo trade, payments are off).", "success", "Order placed");
        setTimeout(function () { window.location.href = "/transactions.html"; }, 900);
        return;
      }
      throw new Error(res.data.error || "Could not start checkout");
    } catch (err) {
      notify(err.message || "Could not start checkout", "error");
    } finally {
      busy(buyBtn, false);
    }
  });

  sellBtn.addEventListener("click", async function (e) {
    e.preventDefault();
    var order = readOrder();
    if (!order) return;
    busy(sellBtn, true, "Selling…");
    try {
      var res = await record(order, "sell");
      if (!res.ok) throw new Error(res.data.error || "Could not record the sale");
      notify("Sold " + order.quantity + " " + symbol + " for $" + order.total.toFixed(2) + ".", "success", "Order filled");
      setTimeout(function () { window.location.href = "/transactions.html"; }, 900);
    } catch (err) {
      notify(err.message, "error", "Sale not placed");
    } finally {
      busy(sellBtn, false);
    }
  });
})();
