
window.onload = function () {
  toggleGraph(); // Automatically load the graph when the page opens
  revenueChart = createChart('myChart', [36.5, 44.6, 59.3, 47.4, 46.3]);
  profitChart = createChart('myChart1', [8.5, 9.5, 21.2, 11.3, 9.9]);

  document.getElementById('myChart').classList.add('active'); // Show revenue by default
};

let currentGraph = 1;

// Function to check the current theme
function getTheme() {
  return localStorage.getItem('niveshPathTheme') === 'dark' ? 'dark' : 'light';
}

function toggleGraph() {
  const container = document.getElementById("graphContainer");
  container.innerHTML = ""; // Clear previous widget

  const script = document.createElement("script");
  script.type = "text/javascript";
  script.async = true;

  const colorTheme = getTheme(); // Get current theme (dark/light)
  let widgetConfig;

  if (currentGraph === 1) {
      script.src = "https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js";
      widgetConfig = {
          "symbols": [["Goldman Sachs", "GS|1D"]],
          "chartType": "area",
          "width": "1285",
          "height": "640",
          "colorTheme": colorTheme, // Apply dark or light theme
          "showVolume": false
      };
      currentGraph = 2;
  } else {
      script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
      widgetConfig = {
          "symbol": "GS",
          "width": "1285",
          "height": "640",
          "interval": "D",
          "theme": colorTheme, // Apply dark or light theme
          "style": "1",
          "locale": "en"
      };
      currentGraph = 1;
  }

  setTimeout(() => {
      script.innerHTML = JSON.stringify(widgetConfig);
      container.appendChild(script);
      console.log("Graph Loaded");
  }, 200);
}

// Listen for dark mode changes and reload graph
window.addEventListener("storage", function(event) {
  if (event.key === "niveshPathTheme") {
      toggleGraph(); // Reload graph when dark mode changes
  }
});

  async function fetchStockData(symbol) {
    try {
      const response = await fetch(`http://localhost:3000/stock/${symbol}`);
      const data = await response.json();
      console.log("Stock Data:", data); // Debugging
  
      if (!data || !data.c) {
        console.error("Invalid stock data:", data);
        return;
      }
  
      // Update main UI elements
      document.getElementById("dayLow").innerText = data.l || 0;
      document.getElementById("dayHigh").innerText = data.h || 0;
      document.getElementById("livePrice").innerText = data.c || 0;
      document.getElementById("price").value = data.c || 0;
  
      // Update ticker position
      const tickerEl = document.getElementById("ticker");
      const openMarkerEl = document.getElementById("openMarker");
  
      if (!tickerEl || !openMarkerEl) {
        console.error("Ticker or Open Marker element missing in HTML!");
        return;
      }
  
      const range = data.h - data.l;
      if (range > 0) {
        const percent = ((data.c - data.l) / range) * 100;
        tickerEl.style.left = `${Math.min(Math.max(percent, 0), 100)}%`;
        console.log(`Ticker Position: ${percent}%`);
  
        const openPercent = ((data.o - data.l) / range) * 100;
        openMarkerEl.style.left = `${Math.min(Math.max(openPercent, 0), 100)}%`;
        console.log(`Open Price Position: ${openPercent}%`);
      }
    } catch (error) {
      console.error("Error fetching stock data:", error);
    }
  
    // Auto-refresh every 2 seconds
    setTimeout(() => fetchStockData(symbol), 2000);
  }
  

  fetchStockData("GS");
  
  
  async function fetchAPIKey() {
    try {
      const response = await fetch("/api/get-api-key"); // Your API route
      const { apiKey } = await response.json();
      return apiKey;
    } catch (error) {
      console.error("Failed to fetch API Key:", error);
    }
  }
  
  
  async function fetchAppleStock() {
    const finnhubApiKey = await fetchAPIKey(); // Finnhub API Key
    const yahooUrl = 'http://localhost:3000/yahoo'; // Proxy Server Yahoo API
    const symbol = "WMT";
  
    if (!finnhubApiKey) {
      console.error("Finnhub API Key not found");
      return;
    }
  
    try {
      // Fetch Finnhub API
      const finnhubUrl = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${finnhubApiKey}`;
      const finnhubResponse = await fetch(finnhubUrl);
      const finnhubData = await finnhubResponse.json();
  
      console.log("Finnhub API Response:", finnhubData);
      document.getElementById("open").innerText = finnhubData.o.toFixed(2);
      document.getElementById("prevClose").innerText = finnhubData.pc.toFixed(2);
      document.getElementById("upperCircuit").innerText = (finnhubData.pc * 1.2).toFixed(2);
      document.getElementById("lowerCircuit").innerText = (finnhubData.pc * 0.8).toFixed(2);
  
      // Fetch Yahoo Finance Volume
      const yahooResponse = await fetch(yahooUrl);
      const yahooData = await yahooResponse.json();
      console.log("Yahoo Finance API Response:", yahooData);
  
      const yahooVolume = yahooData.chart.result[0].indicators.quote[0].volume[0];
      document.getElementById("volume").innerText = yahooVolume.toLocaleString();
  
    } catch (error) {
      console.error("Error fetching stock data:", error);
    }
  }
  
  fetchAppleStock();
  setInterval(fetchAppleStock, 3000);
  
  let revenueChart, profitChart;
  
  function createChart(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    canvas.width = 255; // Set canvas width
    canvas.height = 150; // Set canvas height\
    canvas.style.display = 'block'; // Ensure canvas is block-level element
    canvas.style.margin = '0'; // Remove any margins
    canvas.style.textAlign = 'left'; // Align content to left (for parent container)
    
  
    const ctx = document.getElementById(canvasId).getContext('2d');
    return new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['2020', '2021', '2022', '2023', '2024'],
        datasets: [{
          label: 'All values in million',
          data: data,
          backgroundColor: '#04ad83',
          barThickness: 40,
  
        }]
      },
      options: {
        animation: {
          duration: 1200,
          easing: 'easeInOutCubic'
        },
        scales: {
          y: { display: false },
          x: {
            grid: { display: false },
            ticks: {
              color: '#333',
              font: { weight: 'bold', size: 12 }
              
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true }
        }
      }
    });
  }
  
  
  
  function setActive(button, type) {
    document.querySelectorAll('.butt button').forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
  
    const revenueCanvas = document.getElementById('myChart');
    const profitCanvas = document.getElementById('myChart1');
  
    if (type === 'revenue') {
      revenueCanvas.classList.add('active');
      profitCanvas.classList.remove('active');
      revenueChart.reset();
      revenueChart.update();
    } else {
      profitCanvas.classList.add('active');
      revenueCanvas.classList.remove('active');
      profitChart.reset();
      profitChart.update();
    }
  }
  
  async function fetchStockPrices() {
    try {
        const response = await fetch("/search");  
        const data = await response.json();
        console.log("Stock Price Data:", data);
  
        if (data.error) {
            console.error("API Error:", data.error);
            return; // Stops here, preventing stale data
        }
  
        updateStockUI("AAPL", data.AAPL);
        updateStockUI("NVDA", data.NVDA);
        updateStockUI("TSLA", data.TSLA);
        updateStockUI("MSFT", data.MSFT);
        updateStockUI("AMZN", data.AMZN);
        updateStockUI("WMT", data.WMT);
        updateStockUI("NKE", data.NKE);
        updateStockUI("UBER", data.UBER);
        updateStockUI("SBUX", data.SBUX);
        updateStockUI("NFLX", data.NFLX);
        // updateStockUI("GS", data.GS);
        updateStockUI("ORCL", data.ORCL);
  
    } catch (error) {
        console.error("❌ Error fetching stock prices:", error);
    }
  }
  
  // Helper function to update UI
  function updateStockUI(symbol, stockData) {
    if (!stockData) {
        console.warn(`No data for ${symbol}`);
        return;
    }
  
    const priceEl = document.getElementById(`current-price-${symbol.toLowerCase()}`);
    const changeEl = document.getElementById(`price-change-${symbol.toLowerCase()}`);
    const openEl = document.getElementById(`open-price-${symbol.toLowerCase()}`); 
  
    if (priceEl && changeEl && openEl) {
        priceEl.innerText = `$${stockData.c.toFixed(2)}`;
        changeEl.innerText = `${(stockData.c - stockData.pc).toFixed(2)} (${((stockData.c - stockData.pc) / stockData.pc * 100).toFixed(2)}%)`;
        changeEl.style.color = (stockData.c - stockData.pc) >= 0 ? "#04ad83" : "red";
  
        openEl.innerText = `$${stockData.o.toFixed(2)}`; //Only the value now
    } else {
        console.error(`Missing HTML elements for ${symbol}`);
    }
  }
  
  
  // Fetch prices immediately and update every 60 seconds
  fetchStockPrices();
  setInterval(fetchStockPrices, 60000);
  window.addEventListener("scroll", function () {
    let buyBox = document.getElementById("buyBox"); // Buy/Sell Box
    let graph = document.querySelector(".graph-container"); // Graph Container
    let graphBottom = graph.offsetTop + graph.offsetHeight; // Bottom position of Graph
    
    if (window.scrollY > graphBottom) {
        buyBox.style.position = "fixed";
        buyBox.style.top = "20px"; // Adjust distance from top
        buyBox.style.right = "20px"; // Keep it on the right
    } else {
        buyBox.style.position = "absolute";
        buyBox.style.top = graphBottom + "px"; // Ensure it stays below graph
    }
  });
  // function calculateTotal() {
  //   let buy = parseFloat(document.getElementById("price").value) || 0;
  //   let quantity = parseFloat(document.getElementById("quantity").value) || 0;
  //   // let changes = parseFloat(document.getElementById("changes").value) || 0;
  
  //   let total = (buy * quantity); // Adjusted formula to include changes
  
  //   document.getElementById("total").value = total.toFixed(2); // Format to 2 decimal places
  // }
  function calculateTotal() {
    let buy = parseFloat(document.getElementById("price").value) || 0;
    let quantity = parseFloat(document.getElementById("quantity").value) || 0;
    let total = buy * quantity;
  
    document.getElementById("total").value = total.toFixed(2); // Format to 2 decimal places
    return total.toFixed(2);
  }
  // async function fetchStockData() {
  //   try {
  //       const response = await fetch('/stock?symbol=NVDA');
  //       const data = await response.json();
  
  //       console.log("Finnhub API Response:", data);
  
  //       if (!data || !data.c) {
  //           console.error("Invalid API response.");
  //           return;
  //       }
  
  //       document.getElementById("price").value = data.c;
  //       // document.getElementById("changes").value = data.d;
  //   } catch (error) {
  //       console.error("Error fetching stock data:", error);
  //   }
  // }
  
  const stripe = Stripe("pk_test_51Pp474P12x31ZwKIU3ian8k4DPSItSboee9oQujst9DgmNpfALIcz9pj7giVL8B0WsuiAXli1KwGeHMq48HoO45R00Gw2sVO6d"); // ✅ Replace with actual publishable key
  
  async function handlePayment(amount) {
    try {
        const response = await fetch("http://localhost:3000/create-checkout-session-goldman", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount })
        });
  
        const data = await response.json();
        
        if (!data.id) { // ✅ Corrected session ID check
            console.error("Error: No session ID received from backend", data);
            return;
        }
  
        const { error } = await stripe.redirectToCheckout({ sessionId: data.id }); // ✅ Use correct ID
  
        if (error) console.error("Stripe Checkout Error:", error);
    } catch (error) {
        console.error("Payment Error:", error);
    }
  }
  
  // Button Click Handlers
  document.getElementById("buyBtn").addEventListener("click", () => handlePayment(5000)); // $50
  document.getElementById("buyBtn").addEventListener("click", async function () {
    let total = calculateTotal(); // Get the latest total value
    const response = await fetch("/create-checkout-session-goldman", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: total }) // Send total amount to the server
    });
  
    const session = await response.json();
    if (session.url) {
        window.location.href = session.url; // Redirect to Stripe checkout page
    } else {
        alert("Error creating checkout session");
    }
  });
  document.getElementById("sellBtn").addEventListener("click", () => handlePayment(3000)); // $30
  
  // document.getElementById("buyBtn").addEventListener("click", async function () {
  //   handleTransaction("buy");
  // });
  
  // document.getElementById("sellBtn").addEventListener("click", async function () {
  //   handleTransaction("sell");
  // });
  
  // async function handleTransaction(type) {
  //   let total = calculateTotal(); // Get the latest total value
  //   const response = await fetch("/create-checkout-session", {
  //       method: "POST",
  //       headers: { "Content-Type": "application/json" },
  //       body: JSON.stringify({ amount: total, transactionType: type }) // Send type of transaction
  //   });
  
  //   const session = await response.json();
  //   if (session.url) {
  //       window.location.href = session.url; // Redirect to Stripe checkout
  //   } else {
  //       alert("Error processing transaction");
  //   }
  // }
  // const handlePaymentSuccess = async (price, quantity, total) => {
  //   try {
  //       const response = await fetch("http://localhost:3000/store-purchase", {
  //           method: "POST",
  //           headers: {
  //               "Content-Type": "application/json",
  //           },
  //           body: JSON.stringify({ price, quantity, total }),
  //       });
  
  //       const data = await response.json();
  //       console.log("Purchase stored:", data);
  //   } catch (error) {
  //       console.error("Error storing purchase:", error);
  //   }
  // };
  // fetch("http://localhost:3000/api/store-purchase", {
  //   method: "POST",
  //   headers: {
  //       "Content-Type": "application/json",
  //   },
  //   body: JSON.stringify({
  //       price: 150,
  //       quantity: 5,
  //       total: 300
  //   }),
  // })
  // .then(response => response.json())
  // .then(data => console.log("✅ Purchase stored:", data))
  // .catch(error => console.error("❌ Error storing purchase:", error));
  // const handlePaymentSuccess = async () => {
  //   try {
  //       // Fetch values from input fields on the website
  //       const price = parseFloat(document.getElementById("price").value) || 0;
  //       const quantity = parseInt(document.getElementById("quantity").value) || 0;
  //       const total = price * quantity; // Calculate total
  
  //       // Ensure valid values
  //       if (price === 0 || quantity === 0) {
  //           alert("Invalid price or quantity. Please enter valid values.");
  //           return;
  //       }
  
  //       // Send data to the backend
  //       const response = await fetch("http://localhost:3000/store-purchase", {
  //           method: "POST",
  //           headers: { "Content-Type": "application/json" },
  //           body: JSON.stringify({ price, quantity, total ,transactionType}),
  //       });
  
  //       const data = await response.json();
  //       console.log("✅ Purchase stored:", data);
  //       alert("Purchase stored successfully!");
  //   } catch (error) {
  //       console.error("❌ Error storing purchase:", error);
  //       alert("Error storing purchase. Please try again.");
  //   }
  // };
  // const handlePaymentSuccess = async (transactionType) => { // Accept transactionType
  //   try {
  //       // Fetch values from input fields
  //       const price = parseFloat(document.getElementById("price").value) || 0;
  //       const quantity = parseInt(document.getElementById("quantity").value) || 0;
  //       const total = price * quantity; // Calculate total
  
  //       // Ensure valid values
  //       if (price === 0 || quantity === 0) {
  //           alert("Invalid price or quantity. Please enter valid values.");
  //           return;
  //       }
  
  //       console.log("Sending Data:", { price, quantity, total, transactionType }); // Debugging
  
  //       // Send data to the backend
  //       const response = await fetch("http://localhost:3000/store-purchase", {
  //           method: "POST",
  //           headers: { "Content-Type": "application/json" },
  //           body: JSON.stringify({ price, quantity, total, transactionType }),
  //       });
  
  //       const data = await response.json();
  
  //       if (!response.ok) {
  //           throw new Error(data.error || "Failed to store purchase");
  //       }
  
  //       console.log("✅ Purchase stored:", data);
  //       alert("Purchase stored successfully!");
  //   } catch (error) {
  //       console.error("❌ Error storing purchase:", error);
  //       alert("Error storing purchase. Please try again.");
  //   }
  // };
  
  // // Attach event listeners to buttons
  // document.getElementById("buyBtn").addEventListener("click", () => handlePaymentSuccess("buy"));
  // document.getElementById("sellBtn").addEventListener("click", () => handlePaymentSuccess("sell"));
  const handlePaymentSuccess = async (transactionType) => {
    try {
        const name = "Goldman Sachs";
        const price = parseFloat(document.getElementById("price").value) || 0;
        const quantity = parseInt(document.getElementById("quantity").value) || 0;
        const total = price * quantity;
  
        if (price === 0 || quantity === 0) {
            alert("Invalid price or quantity. Please enter valid values.");
            return;
        }
  
        // Send purchase data to backend
        const response = await fetch("http://localhost:3000/store-purchase", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({name, price, quantity, total, transactionType }), // Ensure transactionType is sent
        });
  
        const data = await response.json();
        console.log("✅ Purchase stored:", data);
        alert("Purchase stored successfully!");
    } catch (error) {
        console.error("❌ Error storing purchase:", error);
        alert("Error storing purchase. Please try again.");
    }
  };
  
  // Attach event listeners for Buy and Sell buttons
  document.getElementById("buyBtn").addEventListener("click", () => handlePaymentSuccess("buy"));
  document.getElementById("sellBtn").addEventListener("click", () => handlePaymentSuccess("sell"));
  
  // Attach event listener to a button (assuming you have a button with id 'submitBtn')
  // document.getElementById("buyBtn").addEventListener("click", () => handlePaymentSuccess("buy"));
  // document.getElementById("sellBtn").addEventListener("click", () => handlePaymentSuccess("sell"));
  
  console.log("Sending data:", { name, price, quantity, total, transactionType });
  
  console.log("Saving transaction:", transaction);
  console.log("Saving stock data to MongoDB:", stockData);
  
  