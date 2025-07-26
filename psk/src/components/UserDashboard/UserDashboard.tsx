import React, { useState } from 'react';
import { Bell, Clock, MoreVertical, Edit2, Bell as BellIcon, Languages, Shield, Palette, HelpCircle, MessageSquare, Lock, Home, FolderOpen, Share2, History, User, X } from 'lucide-react';

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
    off: "关闭"
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
    off: "オフ"
  }
};

const UserDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('profile');
  const [profileName, setProfileName] = useState('Puerto Rico');
  const [profileNickname, setProfileNickname] = useState('Rico');
  const [profileEmail, setProfileEmail] = useState('youremail@domain.com');
  const [profilePhone, setProfilePhone] = useState('+01 234 567 89');
  const [profileCountry, setProfileCountry] = useState('United States');
  const [profileCity, setProfileCity] = useState('New York');
  const [profileAddress, setProfileAddress] = useState('123 Main Street');
  const [profileImage, setProfileImage] = useState('https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?ixlib=rb-1.2.1&auto=format&fit=crop&w=200&q=80');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [language, setLanguage] = useState('English');
  const [theme, setTheme] = useState('Light mode');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [tempProfileData, setTempProfileData] = useState({
    name: profileName,
    nickname: profileNickname,
    email: profileEmail,
    phone: profilePhone,
    country: profileCountry,
    city: profileCity,
    address: profileAddress
  });

  // Get current language translations
  const t = translations[language as keyof typeof translations] || translations.English;

  const toggleTheme = () => {
    setTheme(theme === 'Light mode' ? 'Dark mode' : 'Light mode');
  };

  const toggleNotifications = () => {
    setNotificationsEnabled(!notificationsEnabled);
  };

  const handleProfileUpdate = () => {
    setProfileName(tempProfileData.name);
    setProfileNickname(tempProfileData.nickname);
    setProfileEmail(tempProfileData.email);
    setProfilePhone(tempProfileData.phone);
    setProfileCountry(tempProfileData.country);
    setProfileCity(tempProfileData.city);
    setProfileAddress(tempProfileData.address);
    setShowEditModal(false);
  };

  const handleProfileImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const selectLanguage = (lang: string) => {
    setLanguage(lang);
    setShowLanguageModal(false);
  };

  return (
    <div className={`max-w-4xl mx-auto ${theme === 'Dark mode' ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-800'} min-h-screen flex flex-col transition-colors duration-300`}>
      {/* Header */}
      <header className={`p-4 flex justify-between items-center ${theme === 'Dark mode' ? 'border-gray-700' : 'border-gray-200'} border-b`}>
        <Bell className="w-6 h-6" />
        <div className="flex items-center gap-4">
          <Clock className="w-6 h-6" />
          <MoreVertical className="w-6 h-6" />
        </div>
      </header>

      {/* Profile Section */}
      <div className="flex flex-col items-center pt-8 pb-4 relative">
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center overflow-hidden">
            <img 
              src={profileImage} 
              alt="Profile" 
              className="w-full h-full object-cover"
            />
          </div>
          <label className="absolute bottom-0 right-0 bg-white p-1 rounded-full border cursor-pointer">
            <Edit2 className="w-4 h-4" />
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              onChange={handleProfileImageChange}
            />
          </label>
        </div>
        <h1 className="text-xl font-bold mt-4">{profileName}</h1>
        <p className={`text-sm ${theme === 'Dark mode' ? 'text-gray-300' : 'text-gray-600'}`}>
          {profileEmail} | {profilePhone}
        </p>
      </div>

      {/* Settings Sections */}
      <div className="px-4 py-2">
        <div className={`${theme === 'Dark mode' ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-sm mb-4`}>
          <div 
            className={`p-3 flex items-center justify-between ${theme === 'Dark mode' ? 'border-gray-700' : 'border-gray-200'} border-b cursor-pointer`}
            onClick={() => setShowEditModal(true)}
          >
            <div className="flex items-center gap-3">
              <Edit2 className="w-5 h-5" />
              <span>{t.editProfile}</span>
            </div>
          </div>
          
          <div 
            className={`p-3 flex items-center justify-between ${theme === 'Dark mode' ? 'border-gray-700' : 'border-gray-200'} border-b cursor-pointer`}
            onClick={toggleNotifications}
          >
            <div className="flex items-center gap-3">
              <BellIcon className="w-5 h-5" />
              <span>{t.notifications}</span>
            </div>
            <div className="flex items-center">
              <span className={notificationsEnabled ? 'text-blue-500' : 'text-gray-500'}>
                {notificationsEnabled ? t.on : t.off}
              </span>
              <div className={`ml-2 w-10 h-5 flex items-center ${notificationsEnabled ? 'bg-blue-500' : 'bg-gray-300'} rounded-full p-1 transition-colors duration-300`}>
                <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${notificationsEnabled ? 'translate-x-5' : 'translate-x-0'}`}></div>
              </div>
            </div>
          </div>
          
          <div 
            className="p-3 flex items-center justify-between cursor-pointer"
            onClick={() => setShowLanguageModal(true)}
          >
            <div className="flex items-center gap-3">
              <Languages className="w-5 h-5" />
              <span>{t.language}</span>
            </div>
            <span className="text-blue-500">{language}</span>
          </div>
        </div>

        <div className={`${theme === 'Dark mode' ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-sm mb-4`}>
          <div className={`p-3 flex items-center justify-between ${theme === 'Dark mode' ? 'border-gray-700' : 'border-gray-200'} border-b`}>
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5" />
              <span>{t.security}</span>
            </div>
          </div>
          
          <div 
            className="p-3 flex items-center justify-between cursor-pointer"
            onClick={toggleTheme}
          >
            <div className="flex items-center gap-3">
              <Palette className="w-5 h-5" />
              <span>{t.theme}</span>
            </div>
            <div className="flex items-center">
              <span className="text-blue-500">{theme === 'Light mode' ? t.lightMode : t.darkMode}</span>
              <div className={`ml-2 w-10 h-5 flex items-center ${theme === 'Dark mode' ? 'bg-blue-500' : 'bg-gray-300'} rounded-full p-1 transition-colors duration-300`}>
                <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${theme === 'Dark mode' ? 'translate-x-5' : 'translate-x-0'}`}></div>
              </div>
            </div>
          </div>
        </div>

        <div className={`${theme === 'Dark mode' ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-sm mb-4`}>
          <div className={`p-3 flex items-center justify-between ${theme === 'Dark mode' ? 'border-gray-700' : 'border-gray-200'} border-b`}>
            <div className="flex items-center gap-3">
              <HelpCircle className="w-5 h-5" />
              <span>{t.helpSupport}</span>
            </div>
          </div>
          
          <div className={`p-3 flex items-center justify-between ${theme === 'Dark mode' ? 'border-gray-700' : 'border-gray-200'} border-b`}>
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5" />
              <span>{t.contactUs}</span>
            </div>
          </div>
          
          <div className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Lock className="w-5 h-5" />
              <span>{t.privacyPolicy}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className={`mt-auto ${theme === 'Dark mode' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-t`}>
        <div className="flex justify-between px-2">
          <button 
            className={`flex flex-col items-center p-3 ${activeTab === 'home' ? 'text-blue-500' : theme === 'Dark mode' ? 'text-gray-400' : 'text-gray-600'}`}
            onClick={() => setActiveTab('home')}
          >
            <Home className="w-5 h-5" />
            <span className="text-xs mt-1">{t.home}</span>
          </button>
          
          <button 
            className={`flex flex-col items-center p-3 ${activeTab === 'portfolio' ? 'text-blue-500' : theme === 'Dark mode' ? 'text-gray-400' : 'text-gray-600'}`}
            onClick={() => setActiveTab('portfolio')}
          >
            <FolderOpen className="w-5 h-5" />
            <span className="text-xs mt-1">{t.portfolio}</span>
          </button>
          
          <button 
            className={`flex flex-col items-center p-3 ${activeTab === 'share' ? 'text-blue-500' : theme === 'Dark mode' ? 'text-gray-400' : 'text-gray-600'}`}
            onClick={() => setActiveTab('share')}
          >
            <Share2 className="w-5 h-5" />
            <span className="text-xs mt-1">{t.share}</span>
          </button>
          
          <button 
            className={`flex flex-col items-center p-3 ${activeTab === 'history' ? 'text-blue-500' : theme === 'Dark mode' ? 'text-gray-400' : 'text-gray-600'}`}
            onClick={() => setActiveTab('history')}
          >
            <History className="w-5 h-5" />
            <span className="text-xs mt-1">{t.history}</span>
          </button>
          
          <button 
            className={`flex flex-col items-center p-3 ${activeTab === 'profile' ? 'text-blue-500' : theme === 'Dark mode' ? 'text-gray-400' : 'text-gray-600'}`}
            onClick={() => setActiveTab('profile')}
          >
            <User className="w-5 h-5" />
            <span className="text-xs mt-1">{t.profile}</span>
          </button>
        </div>
      </div>

      {/* Edit Profile Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`${theme === 'Dark mode' ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">{t.editProfileTitle}</h2>
              <button onClick={() => setShowEditModal(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium ${theme === 'Dark mode' ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                  {t.name}
                </label>
                <input
                  type="text"
                  value={tempProfileData.name}
                  onChange={(e) => setTempProfileData({...tempProfileData, name: e.target.value})}
                  className={`w-full px-3 py-2 border ${theme === 'Dark mode' ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
              </div>
              
              <div>
                <label className={`block text-sm font-medium ${theme === 'Dark mode' ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                  {t.nickname}
                </label>
                <input
                  type="text"
                  value={tempProfileData.nickname}
                  onChange={(e) => setTempProfileData({...tempProfileData, nickname: e.target.value})}
                  className={`w-full px-3 py-2 border ${theme === 'Dark mode' ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
              </div>
              
              <div>
                <label className={`block text-sm font-medium ${theme === 'Dark mode' ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                  {t.email}
                </label>
                <input
                  type="email"
                  value={tempProfileData.email}
                  onChange={(e) => setTempProfileData({...tempProfileData, email: e.target.value})}
                  className={`w-full px-3 py-2 border ${theme === 'Dark mode' ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
              </div>
              
              <div>
                <label className={`block text-sm font-medium ${theme === 'Dark mode' ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                  {t.phone}
                </label>
                <input
                  type="tel"
                  value={tempProfileData.phone}
                  onChange={(e) => setTempProfileData({...tempProfileData, phone: e.target.value})}
                  className={`w-full px-3 py-2 border ${theme === 'Dark mode' ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
              </div>
              
              <div>
                <label className={`block text-sm font-medium ${theme === 'Dark mode' ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                  {t.country}
                </label>
                <input
                  type="text"
                  value={tempProfileData.country}
                  onChange={(e) => setTempProfileData({...tempProfileData, country: e.target.value})}
                  className={`w-full px-3 py-2 border ${theme === 'Dark mode' ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
              </div>
              
              <div>
                <label className={`block text-sm font-medium ${theme === 'Dark mode' ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                  {t.city}
                </label>
                <input
                  type="text"
                  value={tempProfileData.city}
                  onChange={(e) => setTempProfileData({...tempProfileData, city: e.target.value})}
                  className={`w-full px-3 py-2 border ${theme === 'Dark mode' ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
              </div>
              
              <div>
                <label className={`block text-sm font-medium ${theme === 'Dark mode' ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                  {t.address}
                </label>
                <input
                  type="text"
                  value={tempProfileData.address}
                  onChange={(e) => setTempProfileData({...tempProfileData, address: e.target.value})}
                  className={`w-full px-3 py-2 border ${theme === 'Dark mode' ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
              </div>
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowEditModal(false)}
                className={`px-4 py-2 border ${theme === 'Dark mode' ? 'border-gray-600 text-gray-300' : 'border-gray-300 text-gray-700'} rounded-md`}
              >
                {t.cancel}
              </button>
              <button
                onClick={handleProfileUpdate}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
              >
                {t.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Language Selection Modal */}
      {showLanguageModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`${theme === 'Dark mode' ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 w-full max-w-md mx-4`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">{t.selectLanguage}</h2>
              <button onClick={() => setShowLanguageModal(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-2">
              {['English', 'Hindi', 'Spanish', 'French', 'German', 'Chinese', 'Japanese'].map((lang) => (
                <div 
                  key={lang}
                  onClick={() => selectLanguage(lang)}
                  className={`p-3 rounded-md cursor-pointer flex items-center justify-between ${
                    language === lang 
                      ? 'bg-blue-100 text-blue-700' 
                      : theme === 'Dark mode' ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                  }`}
                >
                  <span>{lang}</span>
                  {language === lang && (
                    <div className="w-4 h-4 rounded-full bg-blue-500"></div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserDashboard;