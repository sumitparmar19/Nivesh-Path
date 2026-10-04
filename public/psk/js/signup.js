document.addEventListener('DOMContentLoaded', function() {
    const signupForm = document.getElementById('signupForm');
    
    if (signupForm) {
        signupForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const mobile = document.getElementById('mobile').value;
            const password = document.getElementById('password').value;
            
            // Basic validation
            if (!mobile || !password) {
                alert('Please fill in all fields');
                return;
            }
            
            
        }
        )
    }
}
)

document.addEventListener('DOMContentLoaded', function() {
    const signupForm = document.getElementById('signupForm');
    
    if (signupForm) {
        signupForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const mobile = document.getElementById('mobile').value;
            const password = document.getElementById('password').value;
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            
            // Basic validation
            if (!mobile || !password || !name || !email) {
                alert('Please fill in all fields');
                return;
            }
            
            try {
                const response = await fetch('/api/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        mobile,
                        password,
                        name,
                        email
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    // Registration returns a token, so sign the new user straight in
                    const u = data.user || {};
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('niveshPathUser', JSON.stringify({
                        isLoggedIn: true, token: data.token, name: u.name, email: u.email,
                        mobile: u.mobile, phone: u.mobile, country: u.country || 'India'
                    }));
                    alert('Welcome to Nivesh-Path! You have $100,000 in virtual cash to start investing.');
                    window.location.href = '/portfolio.html';
                } else {
                    alert(data.message || 'Registration failed');
                }
            } catch (error) {
                console.error('Registration error:', error);
                alert('An error occurred during registration');
            }
        });
    }
});