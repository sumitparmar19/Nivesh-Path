// public/demo.js (client-side code)
// Do not include any "require" statements here!
// async function fetchStockPrice() {
//     try {
//       const response = await fetch("/demo");
//       const data = await response.json();
//       console.log("Stock Price Data:", data);
  
//       document.getElementById("current-price").innerText = `$${data.c.toFixed(2)}`;
//       document.getElementById("price-change").innerText = `${data.d.toFixed(2)} (${data.dp.toFixed(2)}%)`;
//     } catch (error) {
//       console.error("Error fetching stock price:", error);
//       document.getElementById("current-price").innerText = "Error loading price";
//       document.getElementById("price-change").innerText = "Error loading price";
//     }
//   }
  
//   fetchStockPrice();
//   setInterval(fetchStockPrice, 60000);
// const apiKey = process.env.FINNHUB_API_KEY;
// async function fetchStockData(symbol) {
//   const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`;
//   try {
//     const response = await fetch(url);
//     const data = await response.json();
//     console.log(data); // Check if data is correct

//     if (data.c && data.l && data.h) {
//       updateBar(data.c, data.l, data.h);
//     }
//   } catch (error) {
//     console.error("Error:", error);
//   }
// }

// function updateBar(current, low, high) {
//   const percentage = ((current - low) / (high - low)) * 100;
//   console.log("Percentage:", percentage); // Debug Percentage
//   const bar = document.getElementById("barFill");

//   if (bar) {
//     bar.style.width = `${percentage}%`;
//   } else {
//     console.error("Bar element not found");
//   }
// }

// fetchStockData("AAPL");
// setInterval(() => fetchStockData("AAPL"), 3000); // Refresh Every 3 Sec

// async function fetchStockData(symbol) {
//   const response = await fetch(`http://localhost:3000/stock/${symbol}`);
//   const data = await response.json();
//   console.log(data); // Debugging

//   if (data.c) {
//     document.getElementById("dayLow").innerText = data.l;
//     document.getElementById("dayHigh").innerText = data.h;
//     document.getElementById("livePrice").innerText = data.c;

//     const percent = ((data.c - data.l) / (data.h - data.l)) * 100;
//     document.getElementById("ticker").style.left = `${percent}%`;

//     const openPercent = ((data.o - data.l) / (data.h - data.l)) * 100;
//     document.getElementById("openMarker").style.left = `${openPercent}%`;
//   } else {
//     console.error("Invalid data received:", data);
//   }

//   setTimeout(() => fetchStockData(symbol), 2000);
// }
// fetchStockData("AAPL");
async function fetchStockData(symbol) {
  try {
    const response = await fetch(`http://localhost:3000/stock/${symbol}`);
    const data = await response.json();
    console.log(data); // Debugging

    if (data.c && data.l && data.h && data.o) {
      // Set Day Low, Day High, and Live Price
      document.getElementById("dayLow").innerText = data.l;
      document.getElementById("dayHigh").innerText = data.h;
      document.getElementById("livePrice").innerText = data.c;

      // Calculate Ticker Position
      const range = data.h - data.l;
      if (range > 0) {
        const percent = ((data.c - data.l) / range) * 100;
        document.getElementById("ticker").style.left = `${Math.min(Math.max(percent, 0), 100)}%`;

        // Calculate Open Price Position
        const openPercent = ((data.o - data.l) / range) * 100;
        document.getElementById("openMarker").style.left = `${Math.min(Math.max(openPercent, 0), 100)}%`;
      }
    } else {
      console.error("Invalid data received:", data);
    }
  } catch (error) {
    console.error("Error fetching stock data:", error);
  }

  // Refresh the data every 2 seconds
  setTimeout(() => fetchStockData(symbol), 2000);
}

fetchStockData("AAPL");


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
  const symbol = "AAPL";

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

const ctx = document.getElementById('myChart');

new Chart(ctx, {
  type: 'bar',
  data: {
    labels: ['Red', 'Blue', 'Yellow', 'Green', 'Purple'], // X-axis labels
    datasets: [{
      label: 'all values in million',
      data: [21454,24318,23329,24927,23350],
      backgroundColor: '#04ad83', // Bar color
      barThickness: 40,
      borderWidth: 1
    }]
  },
  options: {
    scales: {
      y: {
        display: false, // Removes Y-axis
        grid: {
          display: false // Removes grid lines from Y-axis
        }
      },
      x: {
        ticks: {
          color: '#333', // X-axis label color
          font: {
            weight: 'bold',
            size: 12
          }
        },
        grid: {
          display: false // Removes grid lines from X-axis
        }
      }
    },
    plugins: {
      legend: {
        labels: {
          font: {
            size: 14
          }
        }
      },
      tooltip: {
        enabled: true
      },
      datalabels: {
        anchor: 'end',
        align: 'end',
        color: '#333',
        font: {
          weight: 'bold',
          size: 12
        },
        formatter: function(value) {
          return value; // Display the data value
        }
      }
    },
    animation: {
      onComplete: function() {
        const chartInstance = this;
        const ctx = chartInstance.ctx;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#333';
        ctx.font = 'bold 12px Arial';
        chartInstance.data.datasets.forEach(function(dataset, i) {
          const meta = chartInstance.getDatasetMeta(i);
          meta.data.forEach(function(bar, index) {
            const data = dataset.data[index];
            ctx.fillText(data, bar.x, bar.y - 5);
          });
        });
      }
    }
  }
});

const API_KEY = "YOUR_FINNHUB_API_KEY";  
const stockSymbols = ["AAPL", "TSLA", "NVDA", "MSFT"]; // Add more stock symbols

async function fetchStockData(symbol) {
    const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${API_KEY}`);
    return response.json();
}

async function loadStocks() {
    const wrapper = document.getElementById("stock-wrapper");

    for (const symbol of stockSymbols) {
        const stockData = await fetchStockData(symbol);
        const price = stockData.c;  // Current price
        const change = stockData.d; // Price change

        const stockCard = document.createElement("div");
        stockCard.classList.add("stock-card");

        const changeClass = change >= 0 ? "green" : "red";
        
        stockCard.innerHTML = `
            <h3>${symbol}</h3>
            <p>Price: $<span class="price">${price.toFixed(2)}</span></p>
            <p class="${changeClass}">Change: ${change.toFixed(2)}</p>
            <label>Quantity:</label>
            <input type="number" class="quantity" min="1" value="1">
            <p>Total: $<span class="total">${price.toFixed(2)}</span></p>
        `;

        wrapper.appendChild(stockCard);

        // Attach event listener to quantity input
        const quantityInput = stockCard.querySelector(".quantity");
        const totalSpan = stockCard.querySelector(".total");

        quantityInput.addEventListener("input", () => {
            const quantity = parseInt(quantityInput.value) || 1;
            totalSpan.textContent = (price * quantity).toFixed(2);
        });
    }
}

loadStocks();

mongoose.connect("mongodb+srv://dhrumil:dhrumil7pat@niveshpathcluster.egrir.mongodb.net/Nivesh?retryWrites=true&w=majority&appName=NiveshPathCluster")
const PriceSchema = {
  price: Number,
  quantity: Number,
  total: Number
}
const Price = mongoose.model("Price", PriceSchema);

app.get("/", function(req, res) {
  res.sendFile((__dirname + "success.html"));
})

app.post("/", function(req, res){
  let newPrice = new Price({
    price: req.body.price,
    quantity: req.body.quantity,
    total: req.body.total
  })
  newPrice.save()
    .then(() => res.send("Data saved successfully!"))
    .catch((err) => res.status(500).send("Error saving data"));
});

