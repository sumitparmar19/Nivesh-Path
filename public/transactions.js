async function fetchTransactions() {
    try {
        const response = await fetch("http://localhost:3000/transactions");
        const data = await response.json();

        const tableBody = document.getElementById("transactionTable");
        tableBody.innerHTML = ""; // Clear previous data

        data.forEach(transaction => {
            const row = `<tr>
                <td>${transaction.name}</td>
                <td>${transaction.price}</td>
                <td>${transaction.quantity}</td>
                <td>${transaction.total}</td>
                <td>${transaction.transactionType}</td>
                <td>${new Date(transaction.timestamp).toLocaleString()}</td>
            </tr>`;
            tableBody.innerHTML += row;
        });
        updateWalletBalance(data);
    } catch (error) {
        console.error("Error fetching transactions:", error);
    }
}
let balance = 100000; // Initial wallet balance

function updateWalletBalance(transactions) {

    transactions.forEach(transaction => {
        if (transaction.transactionType === "buy") {
            balance -= transaction.total; // Deduct for buy transactions
        } else if (transaction.transactionType === "sell") { // ✅ Fixed property name
            balance += transaction.total; // Add for sell transactions
        }
    });

    console.log("Updated Wallet Balance:", balance);

    document.getElementById("wallet").innerText = balance.toFixed(2);
}

// Fetch transactions on page load
fetchTransactions();