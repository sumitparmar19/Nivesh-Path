document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const mobile = document.getElementById('loginMobile').value;
            const password = document.getElementById('loginPassword').value;
            
            // Basic validation
            if (!mobile || !password) {
                alert('Please fill in all fields');
                return;
            }
            
            // In a real application, you would send this data to a server for authentication
            // For this demo, we'll simulate a successful login
            
            // Store user info in localStorage (in a real app, you'd use tokens)
            localStorage.setItem('niveshPathUser', JSON.stringify({
                mobile: mobile,
                isLoggedIn: true,
                name: 'Puerto Rico',
                email: 'youremail@domain.com',
                phone: mobile,
                nickname: 'Rico',
                country: 'India',
                city: 'Mumbai',
                address: '123 Main Street'
            }));
            
            // Redirect to dashboard
            window.location.href = 'user-dashboard.html';
        });
    }
    
    // Check if user is already logged in
    const checkLoginStatus = function() {
        const user = JSON.parse(localStorage.getItem('niveshPathUser') || '{}');
        if (user.isLoggedIn) {
            window.location.href = 'user-dashboard.html';
        }
    };
    
    // Check login status when page loads
    checkLoginStatus();
    
    // Apply theme if saved
    const savedTheme = localStorage.getItem('niveshPathTheme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
    }

    //home 
    const darkModeToggle = document.getElementById("dark-mode-toggle");

// Check if dark mode is saved in localStorage
if (localStorage.getItem("darkMode") === "enabled") {
    document.body.classList.add("dark-mode");
}

// Toggle dark mode and save setting
darkModeToggle.addEventListener("click", function () {
    document.body.classList.toggle("dark-mode");

    if (document.body.classList.contains("dark-mode")) {
        localStorage.setItem("darkMode", "enabled");
    } else {
        localStorage.setItem("darkMode", "disabled");
    }

    // Notify all pages about dark mode change
    window.dispatchEvent(new Event("storage"));
});

});