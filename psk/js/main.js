
document.addEventListener('DOMContentLoaded', function() {
    const container = document.getElementById('testimonialsContainer');
    
    function scrollTestimonials() {
        if (container.scrollLeft >= container.scrollWidth - container.clientWidth) {
            container.scrollLeft = 0;
        } else {
            container.scrollLeft += 1;
        }
    }

    setInterval(scrollTestimonials, 30);
});

document.addEventListener('DOMContentLoaded', function() {
    // Check if user is logged in
    const user = JSON.parse(localStorage.getItem('niveshPathUser') || '{}');
    const loginLink = document.getElementById('login-link');
    const dashboardLink = document.getElementById('dashboard-link');
    const signupLinks = document.querySelectorAll('a[href="pages/signup.html"]');
    const ctaButton = document.querySelector('.cta-button');
    
    // Apply saved theme
    const savedTheme = localStorage.getItem('niveshPathTheme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
    }
    // Apply saved language
    const savedLanguage = localStorage.getItem('niveshPathLanguage') || 'English';
    applyTranslations(savedLanguage);
    
    if (user.isLoggedIn) {
        // Show dashboard link, hide login link
        if (loginLink) loginLink.style.display = 'none';
        if (dashboardLink) dashboardLink.style.display = 'inline-block';
        
        // Update signup links to point to dashboard
        signupLinks.forEach(link => {
            link.href = 'pages/user-dashboard.html';
            link.textContent = 'Dashboard';
        });
        
        // Update CTA button
        if (ctaButton) {
            ctaButton.textContent = 'Go to Dashboard';
            ctaButton.onclick = function() {
                window.location.href = 'pages/user-dashboard.html';
            };
        }
    } else {
        // Show login link, hide dashboard link
        if (loginLink) loginLink.style.display = 'inline-block';
        if (dashboardLink) dashboardLink.style.display = 'none';
    }

    // Function to apply translations
    function applyTranslations(language) {
        // This would be expanded to include translations for all pages
        // For now, we're just saving the preference
        localStorage.setItem('niveshPathLanguage', language);
    }
  
   
});