document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const profileImage = document.getElementById('profile-image');
    const profileImageInput = document.getElementById('profile-image-input');
    const profileImageTop = document.getElementById('profile-image-top');
    const profileImageCenter = document.getElementById('profile-image-center');
    const profileName = document.getElementById('profile-name');
    const profileContact = document.getElementById('profile-contact');
    const editProfileBtn = document.getElementById('edit-profile-btn');
    const editProfileModal = document.getElementById('edit-profile-modal');
    const closeModalBtns = document.querySelectorAll('.close-modal');
    const cancelBtns = document.querySelectorAll('.cancel-btn');
    const saveBtn = document.querySelector('.save-btn');
    const editNameInput = document.getElementById('edit-name');
    const editNicknameInput = document.getElementById('edit-nickname');
    const editEmailInput = document.getElementById('edit-email');
    const editPhoneInput = document.getElementById('edit-phone');
    const editCountryInput = document.getElementById('edit-country');
    const editCityInput = document.getElementById('edit-city');
    const editAddressInput = document.getElementById('edit-address');
    const notificationToggle = document.getElementById('notification-toggle');
    const notificationStatus = document.getElementById('notification-status');
    const themeToggle = document.getElementById('theme-toggle');
    const themeStatus = document.getElementById('theme-status');
    const languageSelector = document.getElementById('language-selector');
    const languageModal = document.getElementById('language-modal');
    const selectedLanguage = document.getElementById('selected-language');
    const languageOptions = document.querySelectorAll('.language-option');
    const navItems = document.querySelectorAll('.nav-item');
    const logoutBtn = document.getElementById('logout-btn');
    
    // Language translations
    const translations = {
        English: {
            editProfile: "Edit profile information",
            notifications: "Notifications",
            language: "Language",
            security: "Security",
            theme: "Theme",
            helpSupport: "Help & Support",
            contactUs: "Contact us",
            privacyPolicy: "Privacy policy",
            home: "Home",
            portfolio: "Portfolio",
            share: "Share",
            history: "History",
            profile: "Profile",
            editProfileTitle: "Edit Profile",
            name: "Name",
            nickname: "Nickname",
            email: "Email",
            phone: "Phone",
            country: "Country",
            city: "City",
            address: "Address",
            cancel: "Cancel",
            save: "Save",
            selectLanguage: "Select Language",
            lightMode: "Light mode",
            darkMode: "Dark mode",
            on: "ON",
            off: "OFF",
            logout: "Logout"
        },
        Hindi: {
            editProfile: "प्रोफ़ाइल जानकारी संपादित करें",
            notifications: "सूचनाएं",
            language: "भाषा",
            security: "सुरक्षा",
            theme: "थीम",
            helpSupport: "सहायता और समर्थन",
            contactUs: "हमसे संपर्क करें",
            privacyPolicy: "गोपनीयता नीति",
            home: "होम",
            portfolio: "पोर्टफोलियो",
            share: "शेयर",
            history: "इतिहास",
            profile: "प्रोफाइल",
            editProfileTitle: "प्रोफ़ाइल संपादित करें",
            name: "नाम",
            nickname: "उपनाम",
            email: "ईमेल",
            phone: "फोन",
            country: "देश",
            city: "शहर",
            address: "पता",
            cancel: "रद्द करें",
            save: "सहेजें",
            selectLanguage: "भाषा चुनें",
            lightMode: "लाइट मोड",
            darkMode: "डार्क मोड",
            on: "चालू",
            off: "बंद",
            logout: "लॉग आउट"
        },
        Spanish: {
            editProfile: "Editar información de perfil",
            notifications: "Notificaciones",
            language: "Idioma",
            security: "Seguridad",
            theme: "Tema",
            helpSupport: "Ayuda y soporte",
            contactUs: "Contáctenos",
            privacyPolicy: "Política de privacidad",
            home: "Inicio",
            portfolio: "Portafolio",
            share: "Compartir",
            history: "Historial",
            profile: "Perfil",
            editProfileTitle: "Editar perfil",
            name: "Nombre",
            nickname: "Apodo",
            email: "Correo",
            phone: "Teléfono",
            country: "País",
            city: "Ciudad",
            address: "Dirección",
            cancel: "Cancelar",
            save: "Guardar",
            selectLanguage: "Seleccionar idioma",
            lightMode: "Modo claro",
            darkMode: "Modo oscuro",
            on: "ACTIVADO",
            off: "DESACTIVADO",
            logout: "Cerrar sesión"
        },
        French: {
            editProfile: "Modifier les informations du profil",
            notifications: "Notifications",
            language: "Langue",
            security: "Sécurité",
            theme: "Thème",
            helpSupport: "Aide et support",
            contactUs: "Contactez-nous",
            privacyPolicy: "Politique de confidentialité",
            home: "Accueil",
            portfolio: "Portfolio",
            share: "Partager",
            history: "Historique",
            profile: "Profil",
            editProfileTitle: "Modifier le profil",
            name: "Nom",
            nickname: "Surnom",
            email: "Email",
            phone: "Téléphone",
            country: "Pays",
            city: "Ville",
            address: "Adresse",
            cancel: "Annuler",
            save: "Enregistrer",
            selectLanguage: "Sélectionner la langue",
            lightMode: "Mode clair",
            darkMode: "Mode sombre",
            on: "ACTIVÉ",
            off: "DÉSACTIVÉ",
            logout: "Déconnexion"
        },
        German: {
            editProfile: "Profilinformationen bearbeiten",
            notifications: "Benachrichtigungen",
            language: "Sprache",
            security: "Sicherheit",
            theme: "Thema",
            helpSupport: "Hilfe & Support",
            contactUs: "Kontaktiere uns",
            privacyPolicy: "Datenschutzrichtlinie",
            home: "Startseite",
            portfolio: "Portfolio",
            share: "Teilen",
            history: "Verlauf",
            profile: "Profil",
            editProfileTitle: "Profil bearbeiten",
            name: "Name",
            nickname: "Spitzname",
            email: "E-Mail",
            phone: "Telefon",
            country: "Land",
            city: "Stadt",
            address: "Adresse",
            cancel: "Abbrechen",
            save: "Speichern",
            selectLanguage: "Sprache auswählen",
            lightMode: "Heller Modus",
            darkMode: "Dunkler Modus",
            on: "EIN",
            off: "AUS",
            logout: "Abmelden"
        },
        Chinese: {
            editProfile: "编辑个人资料",
            notifications: "通知",
            language: "语言",
            security: "安全",
            theme: "主题",
            helpSupport: "帮助与支持",
            contactUs: "联系我们",
            privacyPolicy: "隐私政策",
            home: "首页",
            portfolio: "作品集",
            share: "分享",
            history: "历史",
            profile: "个人资料",
            editProfileTitle: "编辑个人资料",
            name: "姓名",
            nickname: "昵称",
            email: "电子邮件",
            phone: "电话",
            country: "国家",
            city: "城市",
            address: "地址",
            cancel: "取消",
            save: "保存",
            selectLanguage: "选择语言",
            lightMode: "浅色模式",
            darkMode: "深色模式",
            on: "开启",
            off: "关闭",
            logout: "退出登录"
        },
        Japanese: {
            editProfile: "プロフィール情報を編集",
            notifications: "通知",
            language: "言語",
            security: "セキュリティ",
            theme: "テーマ",
            helpSupport: "ヘルプとサポート",
            contactUs: "お問い合わせ",
            privacyPolicy: "プライバシーポリシー",
            home: "ホーム",
            portfolio: "ポートフォリオ",
            share: "共有",
            history: "履歴",
            profile: "プロフィール",
            editProfileTitle: "プロフィールを編集",
            name: "名前",
            nickname: "ニックネーム",
            email: "メール",
            phone: "電話",
            country: "国",
            city: "都市",
            address: "住所",
            cancel: "キャンセル",
            save: "保存",
            selectLanguage: "言語を選択",
            lightMode: "ライトモード",
            darkMode: "ダークモード",
            on: "オン",
            off: "オフ",
            logout: "ログアウト"
        }
    };

    // Get user data from localStorage
    const userData = JSON.parse(localStorage.getItem('niveshPathUser') || '{}');
    
    // Initialize user data if available
    if (userData.isLoggedIn) {
        if (userData.name) profileName.textContent = userData.name;
        if (userData.email && userData.phone) {
            profileContact.textContent = `${userData.email} | ${userData.phone}`;
        }
        
        // Initialize form fields
        if (editNameInput) editNameInput.value = userData.name || '';
        if (editNicknameInput) editNicknameInput.value = userData.nickname || '';
        if (editEmailInput) editEmailInput.value = userData.email || '';
        if (editPhoneInput) editPhoneInput.value = userData.phone || '';
        if (editCountryInput) editCountryInput.value = userData.country || '';
        if (editCityInput) editCityInput.value = userData.city || '';
        if (editAddressInput) editAddressInput.value = userData.address || '';
    }

    // Load saved preferences
    const savedTheme = localStorage.getItem('niveshPathTheme') || 'light';
    const savedLanguage = localStorage.getItem('niveshPathLanguage') || 'English';
    const savedNotifications = localStorage.getItem('niveshPathNotifications') !== 'false';

    // Apply saved theme
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        if (themeStatus) themeStatus.textContent = translations[savedLanguage].darkMode || 'Dark mode';
        if (themeToggle && themeToggle.querySelector('.toggle-switch')) {
            themeToggle.querySelector('.toggle-switch').classList.add('active');
        }
    }

    // Apply saved language
    if (selectedLanguage) selectedLanguage.textContent = savedLanguage;
    applyTranslations(savedLanguage);

    // Apply saved notification settings
    if (!savedNotifications) {
        if (notificationStatus) notificationStatus.textContent = translations[savedLanguage].off || 'OFF';
        if (notificationStatus) notificationStatus.classList.remove('on');
        if (notificationToggle && notificationToggle.querySelector('.toggle-switch')) {
            notificationToggle.querySelector('.toggle-switch').classList.remove('active');
        }
    }

    // Profile image change
    if (profileImageInput) {
        profileImageInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    const imageUrl = event.target.result;
                    profileImageTop.src = imageUrl;
                    profileImageCenter.src = imageUrl;
    
                    // Save to localStorage
                    userData.profileImage = imageUrl;
                    localStorage.setItem('niveshPathUser', JSON.stringify(userData));
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Edit profile modal
    if (editProfileBtn) {
        editProfileBtn.addEventListener('click', function() {
            editProfileModal.classList.add('active');
        });
    }

    // Close modals
    closeModalBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            modal.classList.remove('active');
        });
    });

    cancelBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            modal.classList.remove('active');
        });
    });

    // Save profile changes
    if (saveBtn) {
        saveBtn.addEventListener('click', function() {
            // Update user data
            userData.name = editNameInput.value;
            userData.nickname = editNicknameInput.value;
            userData.email = editEmailInput.value;
            userData.phone = editPhoneInput.value;
            userData.country = editCountryInput.value;
            userData.city = editCityInput.value;
            userData.address = editAddressInput.value;
            
            // Save to localStorage
            localStorage.setItem('niveshPathUser', JSON.stringify(userData));
            
            // Update UI
            profileName.textContent = userData.name;
            profileContact.textContent = `${userData.email} | ${userData.phone}`;
            
            // Close modal
            editProfileModal.classList.remove('active');
        });
    }

    // Toggle notifications
    if (notificationToggle) {
        notificationToggle.addEventListener('click', function() {
            const toggleSwitch = this.querySelector('.toggle-switch');
            const isActive = toggleSwitch.classList.toggle('active');
            
            if (isActive) {
                notificationStatus.textContent = translations[savedLanguage].on || 'ON';
                notificationStatus.classList.add('on');
            } else {
                notificationStatus.textContent = translations[savedLanguage].off || 'OFF';
                notificationStatus.classList.remove('on');
            }
            
            // Save to localStorage
            localStorage.setItem('niveshPathNotifications', isActive);
        });
    }

    // Toggle theme
    if (themeToggle) {
        themeToggle.addEventListener('click', function() {
            const toggleSwitch = this.querySelector('.toggle-switch');
            const isActive = toggleSwitch.classList.toggle('active');
            document.body.classList.toggle('dark-mode');
            
            const currentLanguage = localStorage.getItem('niveshPathLanguage') || 'English';
            
            if (isActive) {
                themeStatus.textContent = translations[currentLanguage].darkMode || 'Dark mode';
                localStorage.setItem('niveshPathTheme', 'dark');
            } else {
                themeStatus.textContent = translations[currentLanguage].lightMode || 'Light mode';
                localStorage.setItem('niveshPathTheme', 'light');
            }
        });
    }

    // Language selection
    if (languageSelector) {
        languageSelector.addEventListener('click', function() {
            languageModal.classList.add('active');
        });
    }

    // Select language
    languageOptions.forEach(option => {
        option.addEventListener('click', function() {
            const language = this.getAttribute('data-language');
            
            // Update UI
            selectedLanguage.textContent = language;
            
            // Update selected indicator
            languageOptions.forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            
            // Save to localStorage
            localStorage.setItem('niveshPathLanguage', language);
            
            // Apply translations
            applyTranslations(language);
            
            // Close modal
            languageModal.classList.remove('active');
        });
    });

    // Apply translations based on selected language
    function applyTranslations(language) {
        const t = translations[language] || translations.English;
        
        // Update all elements with data-translate attribute
        document.querySelectorAll('[data-translate]').forEach(el => {
            const key = el.getAttribute('data-translate');
            if (t[key]) {
                el.textContent = t[key];
            }
        });
        
        // Update theme status text
        if (themeStatus) {
            const isDarkMode = document.body.classList.contains('dark-mode');
            themeStatus.textContent = isDarkMode ? t.darkMode : t.lightMode;
        }
        
        // Update notification status text
        if (notificationStatus) {
            const isActive = notificationToggle.querySelector('.toggle-switch').classList.contains('active');
            notificationStatus.textContent = isActive ? t.on : t.off;
        }
    }

    // Bottom navigation
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            navItems.forEach(nav => nav.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // Logout functionality
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            // Clear user data
            localStorage.removeItem('niveshPathUser');
            // Redirect to home page
            window.location.href = '../index.html';
        });
    }
});