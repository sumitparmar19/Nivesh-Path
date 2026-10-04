// document.addEventListener('DOMContentLoaded', function() {
//     const loginForm = document.getElementById('loginForm');
    
//     if (loginForm) {
//         loginForm.addEventListener('submit', function(e) {
//             e.preventDefault();
            
//             const mobile = document.getElementById('loginMobile').value;
//             const password = document.getElementById('loginPassword').value;
            
//             // Basic validation
//             if (!mobile || !password) {
//                 alert('Please fill in all fields');
//                 return;
//             }
            
//             // In a real application, you would send this data to a server for authentication
//             // For this demo, we'll simulate a successful login
            
//             // Store user info in localStorage (in a real app, you'd use tokens)
//             localStorage.setItem('niveshPathUser', JSON.stringify({
//                 mobile: mobile,
//                 isLoggedIn: true,
//                 name: 'Sumit Parmar',
//                 email: 'youremail@domain.com',
//                 phone: mobile,
//                 nickname: 'Sumit',
//                 country: 'India',
//                 city: 'Ahmedbad',
//                 address: 'Akbar Nagar'
//             }));
            
//             // Redirect to dashboard
//             window.location.href = 'user-dashboard.html';
//         });
//     }
    
//     // Check if user is already logged in
//     const checkLoginStatus = function() {
//         const user = JSON.parse(localStorage.getItem('niveshPathUser') || '{}');
//         if (user.isLoggedIn) {
//             window.location.href = 'user-dashboard.html';
//         }
//     };
    
//     // Check login status when page loads
//     checkLoginStatus();
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const mobile = document.getElementById('loginMobile').value;
            const password = document.getElementById('loginPassword').value;
            
            // Basic validation
            if (!mobile || !password) {
                alert('Please fill in all fields');
                return;
            }
            
            try {
                // Send login request to your MongoDB server
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        mobile,
                        password
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    // Store user info from MongoDB in localStorage
                    localStorage.setItem('niveshPathUser', JSON.stringify({
                        mobile: data.mobile,
                        isLoggedIn: true,
                        token: data.token,
                        name: data.name,
                        email: data.email,
                        phone: data.mobile,
                        nickname: data.nickname || '',
                        country: data.country || 'India',
                        city: data.city || '',
                        address: data.address || ''
                    }));
                    localStorage.setItem('token', data.token);

                    // Go back to the page that asked for login, or to the markets home
                    window.location.href = safeNext() || '/portfolio.html';
                } else {
                    alert(data.message || 'Login failed. Please check your credentials.');
                }
            } catch (error) {
                console.error('Login error:', error);
                alert('An error occurred during login. Please try again.');
            }
        });
    }
    
    // Only allow same-site relative paths as the post-login destination
    function safeNext() {
        const next = new URLSearchParams(window.location.search).get('next');
        return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
    }

    // Already logged in with a valid (unexpired) token: skip the form
    const checkLoginStatus = function() {
        if (window.NP && window.NP.isLoggedIn()) {
            window.location.href = safeNext() || '/portfolio.html';
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
// darkModeToggle.addEventListener("click", function () {
//     document.body.classList.toggle("dark-mode");

//     if (document.body.classList.contains("dark-mode")) {
//         localStorage.setItem("darkMode", "enabled");
//     } else {
//         localStorage.setItem("darkMode", "disabled");
//     }

//     // Notify all pages about dark mode change
//     window.dispatchEvent(new Event("storage"));
// });

});

// document.addEventListener('DOMContentLoaded', function() {
//     const loginForm = document.getElementById('loginForm');
    
//     if (loginForm) {
//         loginForm.addEventListener('submit', async function(e) {
//             e.preventDefault();
            
//             const mobile = document.getElementById('loginMobile').value;
//             const password = document.getElementById('loginPassword').value;
//             const name = document.getElementById('loginname').value;
//             const email = document.getElementById('loginemail').value;
            
//             // Basic validation
//             if (!mobile || !password || !name || !email) {
//                 alert('Please fill in all fields');
//                 return;
//             }
            
//             try {
//                 const response = await fetch('http://localhost:5000/api/login', {
//                     method: 'POST',
//                     headers: {
//                         'Content-Type': 'application/json'
//                     },
//                     body: JSON.stringify({ mobile, password, name, email })
//                 });

//                 if (!response.ok) {
//                     const data = await response.json();
//                     alert(data.message || 'Login failed');
//                     return;
//                 }

//                 const userData = await response.json();
                
//                 // Store user info in localStorage
//                 localStorage.setItem('niveshPathUser', JSON.stringify(userData));
                
//                 // Redirect to dashboard
//                 window.location.href = 'user-dashboard.html';
//             } catch (error) {
//                 alert('An error occurred. Please try again.');
//                 console.error('Login error:', error);
//             }
//         });
//     }
    
//     // Check if user is already logged in
//     const checkLoginStatus = function() {
//         const user = JSON.parse(localStorage.getItem('niveshPathUser') || '{}');
//         if (user.isLoggedIn) {
//             window.location.href = 'user-dashboard.html';
//         }
//     };
    
//     // Check login status when page loads
//     checkLoginStatus();
// });

// document.addEventListener('DOMContentLoaded', function() {
//     const loginForm = document.getElementById('loginForm');
    
//     if (loginForm) {
//         loginForm.addEventListener('submit', async function(e) {
//             e.preventDefault();
            
//             const mobile = document.getElementById('loginMobile').value;
//             const password = document.getElementById('loginPassword').value;
//             const name = document.getElementById('loginname').value;
//             const email = document.getElementById('loginemail').value;
            
//             // Basic validation
//             if (!mobile || !password || !name || !email) {
//                 alert('Please fill in all fields');
//                 return;
//             }

//             try {
//                 // Ensure you're calling the correct route for registration
//                 const response = await fetch('http://localhost:5000/api/register', {
//                     method: 'POST',
//                     headers: {
//                         'Content-Type': 'application/json'
//                     },
//                     body: JSON.stringify({ mobile, password, name, email })
//                 });

//                 const data = await response.json();

//                 if (!response.ok) {
//                     alert(data.message || 'Registration failed');
//                     return;
//                 }

//                 alert('Registration successful! Please log in.');

//                 // Redirect to login page after registration
//                 window.location.href = 'login.html';
//             } catch (error) {
//                 alert('An error occurred. Please try again.');
//                 console.error('Registration error:', error);
//             }
//         });
//     }
// });
// document.addEventListener('DOMContentLoaded', function() {
//     const loginForm = document.getElementById('loginForm');
    
//     if (loginForm) {
//         loginForm.addEventListener('submit', async function(e) {
//             e.preventDefault();
            
//             const mobile = document.getElementById('loginMobile').value;
//             const password = document.getElementById('loginPassword').value;
//             const name = document.getElementById('loginname').value;
//             const email = document.getElementById('loginemail').value;
            
//             // Basic validation
//             if (!mobile || !password || !name || !email) {
//                 alert('Please fill in all fields');
//                 return;
//             }
            
//             try {
//                 const response = await fetch('/api/login', {
//                     method: 'POST',
//                     headers: {
//                         'Content-Type': 'application/json'
//                     },
//                     body: JSON.stringify({
//                         mobile,
//                         password,
//                         name,
//                         email
//                     })
//                 });

//                 const data = await response.json();

//                 if (response.ok) {
//                     // Store user info in localStorage
//                     localStorage.setItem('niveshPathUser', JSON.stringify({
//                         ...data,
//                         isLoggedIn: true
//                     }));
                    
//                     // Redirect to dashboard
//                     window.location.href = 'user-dashboard.html';
//                 } else {
//                     alert(data.message || 'Login failed');
//                 }
//             } catch (error) {
//                 console.error('Login error:', error);
//                 alert('An error occurred during login');
//             }
//         });
//     }
    
//     // Check if user is already logged in
//     const checkLoginStatus = function() {
//         const user = JSON.parse(localStorage.getItem('niveshPathUser') || '{}');
//         if (user.isLoggedIn) {
//             window.location.href = 'user-dashboard.html';
//         }
//     };
    
//     // Check login status when page loads
//     checkLoginStatus();
// });