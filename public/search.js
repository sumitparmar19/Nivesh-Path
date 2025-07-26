document.addEventListener("DOMContentLoaded", function () {
    const searchBox = document.getElementById("box");
    const resultBox = document.getElementById("result-box");

    // Sample data for autocomplete suggestions
    const suggestions = ["Apple", "Nvidia", "Amazon", "Microsoft", "Google", "Netflix", "Tesla", "Uber", "Starbucks", "Oracle", "Goldman Sachs"];

    // Function to filter and show suggestions
    searchBox.addEventListener("input", function () {
        const query = this.value.toLowerCase().trim();
        resultBox.innerHTML = ""; // Clear previous results

        if (query.length === 0) {
            resultBox.style.display = "none";
            return;
        }

        const filtered = suggestions.filter(item => item.toLowerCase().includes(query));

        if (filtered.length > 0) {
            const ul = document.createElement("ul");
            filtered.forEach(item => {
                const li = document.createElement("li");
                li.textContent = item;
                li.addEventListener("click", function () {
                    searchBox.value = item; // Fill input with selected value
                    resultBox.style.display = "none"; // Hide suggestions
                });
                ul.appendChild(li);
            });
            resultBox.appendChild(ul);
            resultBox.style.display = "block"; // Show the results
        } else {
            resultBox.style.display = "none";
        }
    });

    // Hide results when clicking outside
    document.addEventListener("click", function (e) {
        if (!searchBox.contains(e.target) && !resultBox.contains(e.target)) {
            resultBox.style.display = "none";
        }
    });
});
const search = () =>{
    const searchbox = document.getElementById('box').value.toUpperCase();
    const storeitems = document.getElementById('result');
    const products = document.querySelectorAll('.slow');
    const pname = storeitems.getElementsByTagName("p");

    for (var i=0; i<pname.length; i++){
        let match = products[i].getElementsByTagName('p')[0];

        if(match){
            let textvalue = match.textContent || match.innerHTML;

            if(textvalue.toUpperCase().indexOf(searchbox) > -1){
                products[i].style.display = "";
            } else{
                products[i].style.display = "none";
            }
        }
    }
}
//toggel small widget

function loadTradingViewWidgets() {
    // Get the current theme (dark or light)
    const savedTheme = localStorage.getItem('niveshPathTheme');
    const colorTheme = savedTheme === 'dark' ? 'dark' : 'light';

    // Define all widget containers and their symbols
    const widgets = [
        { container: "cont", symbol: "NASDAQ:AAPL" },
        { container: "cont1", symbol: "NASDAQ:NVDA" },
        { container: "cont2", symbol: "NASDAQ:TSLA" },
        { container: "cont3", symbol: "NASDAQ:MSFT" },
        { container: "cont4", symbol: "NASDAQ:AMZN" },
        { container: "cont5", symbol: "NYSE:WMT" }
    ];

    // Loop through all widgets and create the correct TradingView widget
    widgets.forEach(widget => {
        let container = document.querySelector(`.${widget.container}`);
        if (container) {
            container.innerHTML = ""; // Clear existing content

            // Create new TradingView container
            let tvContainer = document.createElement("div");
            tvContainer.classList.add("tradingview-widget-container");

            let widgetDiv = document.createElement("div");
            widgetDiv.classList.add("tradingview-widget-container__widget");

            let copyrightDiv = document.createElement("div");
            copyrightDiv.classList.add("tradingview-widget-copyright");
            copyrightDiv.innerHTML = `<a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank"><span class="blue-text">Track all markets on TradingView</span></a>`;

            let script = document.createElement("script");
            script.type = "text/javascript";
            script.src = "https://s3.tradingview.com/external-embedding/embed-widget-single-quote.js";
            script.async = true;

            script.innerHTML = `
            {
                "symbol": "${widget.symbol}",
                "width": 350,
                "isTransparent": false,
                "colorTheme": "${colorTheme}",
                "locale": "en"
            }`;

            // Append elements to the container
            tvContainer.appendChild(widgetDiv);
            tvContainer.appendChild(copyrightDiv);
            tvContainer.appendChild(script);
            container.appendChild(tvContainer);
        }
    });
}

// Load widgets on page load
loadTradingViewWidgets();

// Listen for theme changes (in case dark mode is toggled)
window.addEventListener("storage", function(event) {
    if (event.key === "niveshPathTheme") {
        loadTradingViewWidgets();
    }
});




//toggel graph 
function loadTradingViewWidget() {
    // Get the saved theme from localStorage
    const savedTheme = localStorage.getItem('niveshPathTheme');

    // Set the correct color theme
    const colorTheme = savedTheme === 'dark' ? 'dark' : 'light';

    // Remove any existing widget
    document.getElementById("tradingview-widget-container").innerHTML = "";

    // Create a new TradingView widget
    let script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js";
    script.async = true;

    script.innerHTML = `
    {
        "symbols": [
            ["Apple", "AAPL|1D"],
            ["NASDAQ:NVDA|1D"],
            ["NASDAQ:TSLA|1D"],
            ["NASDAQ:MSFT|1D"],
            ["NASDAQ:AMZN|1D"],
            ["NYSE:WMT|1D"]
        ],
        "chartOnly": false,
        "width": "540",
        "height": "387",
        "locale": "en",
        "colorTheme": "${colorTheme}",
        "autosize": false,
        "showVolume": false,
        "showMA": false,
        "hideDateRanges": false,
        "hideMarketStatus": false,
        "hideSymbolLogo": false,
        "scalePosition": "right",
        "scaleMode": "Normal",
        "fontFamily": "-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif",
        "fontSize": "10",
        "noTimeScale": false,
        "valuesTracking": "1",
        "changeMode": "price-and-percent",
        "chartType": "area",
        "maLineColor": "#2962FF",
        "maLineWidth": 1,
        "maLength": 9,
        "headerFontSize": "medium",
        "lineWidth": 2,
        "lineType": 0,
        "dateRanges": [
            "1d|1",
            "1m|30",
            "3m|60",
            "12m|1D",
            "60m|1W",
            "all|1M"
        ]
    }`;

    // Append the new widget
    document.getElementById("tradingview-widget-container").appendChild(script);
}

// Load the correct widget when the page loads
loadTradingViewWidget();

// Listen for theme changes (in case dark mode is toggled)
window.addEventListener("storage", function(event) {
    if (event.key === "niveshPathTheme") {
        loadTradingViewWidget();
    }
});


// public/demo.js (client-side code)
// Do not include any "require" statements here!
// async function fetchStockPrice() {
//     try {
//       const response = await fetch("/search");
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
// async function fetchStockPrices() {
//     const stocks = [
//         { symbol: "AAPL", priceId: "current-price-aapl", changeId: "price-change-aapl" },
//         { symbol: "NVDA", priceId: "current-price-nvda", changeId: "price-change-nvda" }
//     ];

//     for (const stock of stocks) {
//         try {
//             const response = await fetch(`/search?symbol=${stock.symbol}`);
//             const data = await response.json();
//             console.log(`Stock Price Data for ${stock.symbol}:`, data);

//             if (data.c !== undefined && data.pc !== undefined) {
//                 document.getElementById(stock.priceId).innerText = `$${data.c.toFixed(2)}`;
//                 const change = (data.c - data.pc).toFixed(2);
//                 const percentageChange = ((data.c - data.pc) / data.pc * 100).toFixed(2);
//                 document.getElementById(stock.changeId).innerText = `${change} (${percentageChange}%)`;
//                 document.getElementById(stock.changeId).style.color = change >= 0 ? "green" : "red";
//             } else {
//                 console.error(`Invalid data received for ${stock.symbol}:`, data);
//             }
//         } catch (error) {
//             console.error(`Error fetching ${stock.symbol} stock price:`, error);
//             document.getElementById(stock.priceId).innerText = "Error loading price";
//             document.getElementById(stock.changeId).innerText = "Error loading price";
//         }
//     }
// }
// 90.00,
//     "pc": 685.50,
//     "t": 1708982400
//   }
// }
// 🔹 Frontend JavaScript to Display Both Stock Prices
// Now update your search.js file to handle both stocks correctly.

// javascript
// Copy
// Edit
async function fetchStockPrices() {
    try {
        const response = await fetch("/search");  
        const data = await response.json();
        console.log("Stock Price Data:", data);

        if (data.error) {
            console.error("API Error:", data.error);
            return; // Stops here, causing the previous data to remain
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
        updateStockUI("GS", data.GS);
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
    const upperCircuitEl = document.getElementById(`upper-circuit-${symbol.toLowerCase()}`);
    const lowerCircuitEl = document.getElementById(`lower-circuit-${symbol.toLowerCase()}`);
  
    if (priceEl && changeEl && openEl && upperCircuitEl && lowerCircuitEl) {
        priceEl.innerText = `$${stockData.c.toFixed(2)}`;
        changeEl.innerText = `${(stockData.c - stockData.pc).toFixed(2)} (${((stockData.c - stockData.pc) / stockData.pc * 100).toFixed(2)}%)`;
        changeEl.style.color = (stockData.c - stockData.pc) >= 0 ? "#04ad83" : "red";
  
        openEl.innerText = `$${stockData.o.toFixed(2)}`;

        // Calculate upper and lower circuit limits (assuming a 10% limit)
        const upperCircuit = stockData.pc * 1.10;
        const lowerCircuit = stockData.pc * 0.90;

        upperCircuitEl.innerText = `$${upperCircuit.toFixed(2)}`;
        lowerCircuitEl.innerText = `$${lowerCircuit.toFixed(2)}`;
    } else {
        console.error(`Missing HTML elements for ${symbol}`);
    }
}

// Fetch prices immediately and update every 60 seconds
fetchStockPrices();
setInterval(fetchStockPrices, 60000);

  // Get the canvas element
const ctx = document.getElementById('myChart').getContext('2d');

// Create a gradient fill for the background
const gradient = ctx.createLinearGradient(0, 0, 0, 150);
gradient.addColorStop(0, 'rgb(255, 62, 62)');  // Strong blue at the top
gradient.addColorStop(1, 'rgba(62, 81, 255, 0)');  // Transparent at the bottom

// Define the chart
new Chart(ctx, {
    type: 'line',  // Line chart
    data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], // X-axis labels
        datasets: [{
            data: [15, 10, 4, 12, 7, 5, 1], // Y-axis values (modify for your data)
            borderColor: 'red',  // Line color
            backgroundColor: gradient, // Gradient fill
            fill: true,  // Fill under the line
            tension: 0.4, // Creates the smooth, wavy curve effect
            borderWidth: 2, // Line thickness
            pointRadius: 0 // Hide data points
        }]
    },
    options: {
        plugins: { legend: { display: false } }, // Hide the legend
        scales: {
            x: { display: false }, // Hide X-axis
            y: { display: false }  // Hide Y-axis
        },
        elements: { point: { radius: 0 } } // Hide points on the line
    }
});
// document.addEventListener("DOMContentLoaded", async function () {
//     // Define stocks to fetch
//     const stocks = [
//         { symbol: "AAPL", priceId: "current-price-aapl", changeId: "price-change-aapl" },
//         { symbol: "NVDA", priceId: "current-price-nvda", changeId: "price-change-nvda" }
//     ];

//     async function fetchStockPrice(symbol) {
//         try {
//             const response = await fetch(`/search?symbol=${symbol}`);
//             const data = await response.json();

//             if (data && data.c !== undefined) {
//                 return { price: data.c, change: (data.c - data.pc).toFixed(2) };
//             }
//         } catch (error) {
//             console.error(`Error fetching ${symbol} stock price:`, error);
//         }
//         return { price: "N/A", change: "N/A" };
//     }

//     async function updateStockPrices() {
//         for (const stock of stocks) {
//             const { price, change } = await fetchStockPrice(stock.symbol);

//             const priceElement = document.getElementById(stock.priceId);
//             const changeElement = document.getElementById(stock.changeId);

//             if (priceElement) {
//                 priceElement.textContent = `$${price}`;
//             } else {
//                 console.error(`Element with ID ${stock.priceId} not found!`);
//             }

//             if (changeElement) {
//                 changeElement.textContent = change > 0 ? `+${change}` : change;
//                 changeElement.style.color = change >= 0 ? "green" : "red"; // Color for positive/negative change
//             } else {
//                 console.error(`Element with ID ${stock.changeId} not found!`);
//             }
//         }
//     }

//     updateStockPrices();
// });
const ctx1 = document.getElementById('myChart1').getContext('2d');
const gradient1 = ctx1.createLinearGradient(0, 0, 0, 150);
gradient1.addColorStop(0, 'rgb(91, 255, 62)');  // Strong blue at the top
gradient1.addColorStop(1, 'rgba(62, 81, 255, 0)');  // Transparent at the bottom

// Define the chart
new Chart(ctx1, {
    type: 'line',  // Line chart
    data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], // X-axis labels
        datasets: [{
            data: [1, 5, 7,10, 15, 5], // Y-axis values (modify for your data)
            borderColor: 'green',  // Line color
            backgroundColor: gradient1, // Gradient fill
            fill: true,  // Fill under the line
            tension: 0.4, // Creates the smooth, wavy curve effect
            borderWidth: 2, // Line thickness
            pointRadius: 0 // Hide data points
        }]
    },
    options: {
        plugins: { legend: { display: false } }, // Hide the legend
        scales: {
            x: { display: false }, // Hide X-axis
            y: { display: false }  // Hide Y-axis
        },
        elements: { point: { radius: 0 } } // Hide points on the line
    }
});
const ctx2 = document.getElementById('myChart2').getContext('2d');

// Create a gradient fill for the background
const gradient2 = ctx.createLinearGradient(0, 0, 0, 150);
gradient2.addColorStop(0, 'rgb(255, 62, 62)');  // Strong blue at the top
gradient2.addColorStop(1, 'rgba(62, 81, 255, 0)');  // Transparent at the bottom

// Define the chart
new Chart(ctx2, {
    type: 'line',  // Line chart
    data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], // X-axis labels
        datasets: [{
            data: [15, 5, 9, 7, 5, 1], // Y-axis values (modify for your data)
            borderColor: 'red',  // Line color
            backgroundColor: gradient2, // Gradient fill
            fill: true,  // Fill under the line
            tension: 0.4, // Creates the smooth, wavy curve effect
            borderWidth: 2, // Line thickness
            pointRadius: 0 // Hide data points
        }]
    },
    options: {
        plugins: { legend: { display: false } }, // Hide the legend
        scales: {
            x: { display: false }, // Hide X-axis
            y: { display: false }  // Hide Y-axis
        },
        elements: { point: { radius: 0 } } // Hide points on the line
    }
});