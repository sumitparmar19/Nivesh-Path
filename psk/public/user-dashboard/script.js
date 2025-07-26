document.addEventListener('DOMContentLoaded', function() {
  // DOM Elements
  const profileImage = document.getElementById('profile-image');
  const profileImageInput = document.getElementById('profile-image-input');
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
      off: "OFF"
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
      off: "बंद"
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
      off: "DESACTIVADO"
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
      off: "DÉSACTIVÉ"
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
      off: "AUS"
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
      history: " <boltArtifact id="enhanced-user-profile" title="Enhanced User Profile with Additional Fields and Language Support">
    }
  }
}
)