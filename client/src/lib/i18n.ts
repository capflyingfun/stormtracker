export type Language =
  | 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'nl' | 'ru' | 'zh' | 'ja'
  | 'ko' | 'ar' | 'hi' | 'pl' | 'sv' | 'no' | 'da' | 'fi' | 'tr' | 'uk';

export interface LanguageInfo {
  code: Language;
  name: string;
  nativeName: string;
  flag: string;
}

export const LANGUAGES: LanguageInfo[] = [
  { code: 'en', name: 'English',    nativeName: 'English',    flag: '🇺🇸' },
  { code: 'es', name: 'Spanish',    nativeName: 'Español',    flag: '🇪🇸' },
  { code: 'fr', name: 'French',     nativeName: 'Français',   flag: '🇫🇷' },
  { code: 'de', name: 'German',     nativeName: 'Deutsch',    flag: '🇩🇪' },
  { code: 'it', name: 'Italian',    nativeName: 'Italiano',   flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português',  flag: '🇧🇷' },
  { code: 'nl', name: 'Dutch',      nativeName: 'Nederlands', flag: '🇳🇱' },
  { code: 'ru', name: 'Russian',    nativeName: 'Русский',    flag: '🇷🇺' },
  { code: 'zh', name: 'Chinese',    nativeName: '中文',        flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese',   nativeName: '日本語',      flag: '🇯🇵' },
  { code: 'ko', name: 'Korean',     nativeName: '한국어',      flag: '🇰🇷' },
  { code: 'ar', name: 'Arabic',     nativeName: 'العربية',    flag: '🇸🇦' },
  { code: 'hi', name: 'Hindi',      nativeName: 'हिन्दी',      flag: '🇮🇳' },
  { code: 'pl', name: 'Polish',     nativeName: 'Polski',     flag: '🇵🇱' },
  { code: 'sv', name: 'Swedish',    nativeName: 'Svenska',    flag: '🇸🇪' },
  { code: 'no', name: 'Norwegian',  nativeName: 'Norsk',      flag: '🇳🇴' },
  { code: 'da', name: 'Danish',     nativeName: 'Dansk',      flag: '🇩🇰' },
  { code: 'fi', name: 'Finnish',    nativeName: 'Suomi',      flag: '🇫🇮' },
  { code: 'tr', name: 'Turkish',    nativeName: 'Türkçe',     flag: '🇹🇷' },
  { code: 'uk', name: 'Ukrainian',  nativeName: 'Українська', flag: '🇺🇦' },
];

export type Translations = typeof en;

export const en = {
  // Header / general
  realTimeStorm: 'Real-Time Storm Detection',
  language: 'Language',
  ready: 'Ready',
  loading: 'Loading…',
  settings: 'Settings',
  search: 'Search',
  cancel: 'Cancel',
  map: 'Map',
  gps: 'GPS',

  // Navigation tabs
  weather: 'Weather',
  messages: 'Messages',

  // Location
  setYourLocation: 'Set Your Location',
  chooseLocation: 'Choose Location',
  enterAddress: 'Enter an address or city…',
  almostReady: 'Almost Ready',

  // Loading states
  loadingStormData: 'Loading storm data…',
  loadingDataTimer: 'Fetching weather data…',
  loadingDataHoldOn: 'Loading data, hold on…',
  loadingMessages: 'Loading messages…',
  scanningRadar: 'Scanning radar…',
  recheckingStorm: 'Rechecking storm…',
  analyzing: 'Analyzing…',
  monitoring: 'Monitoring',

  // Weather conditions
  temperature: 'Temperature',
  feelsLike: 'Feels Like',
  humidity: 'Humidity',
  dewPoint: 'Dew Point',
  wind: 'Wind',
  pressure: 'Pressure',
  visibility: 'Visibility',
  cloudCover: 'Cloud Cover',
  precip: 'Precipitation',
  uvIndex: 'UV Index',
  airQuality: 'Air Quality',
  ozone: 'Ozone',
  pollenAllergens: 'Pollen & Allergens',

  // Forecast
  forecast: 'Forecast',
  today: 'Today',
  day: 'Day',
  night: 'Night',
  maxTemp: 'High',
  minTemp: 'Low',
  sunriseSunset: 'Sunrise / Sunset',

  // Storm data
  storms: 'Storms',
  activeThreats: 'Active Threats',
  detectionRange: 'Detection Range',
  detectionRadius: 'Detection Radius',
  stormIntensity: 'Storm Intensity',
  stormSummary: 'Storm Summary',
  stormStats: 'Storm Stats',
  stormTracks: 'Storm Tracks',
  stormCluster: 'Storm Cluster',
  stormAlertMessages: 'Storm Alert Messages',
  stormAlertNotifications: 'Storm Alert Notifications',
  closestStorm: 'Closest Storm',
  closest: 'Closest',
  strongestStorm: 'Strongest Storm',
  distance: 'Distance',
  eta: 'ETA',
  movement: 'Movement',
  movementDir: 'Direction',
  movementSpeed: 'Speed',
  movingAt: 'Moving at',
  severity: 'Severity',
  impact: 'Impact',
  impactChance: 'Impact Chance',
  chanceDirectImpact: 'Chance of Direct Impact',
  detected: 'Detected',
  showAllStorms: 'Show All Storms',
  noImpact: 'No Impact',
  strongImpact: 'Strong Impact',
  radarDerived: 'Radar-derived',
  radarInfo: 'Radar Info',
  source: 'Source',
  range: 'Range',

  // View modes
  viewMode: 'View Mode',
  mapView: 'Map View',
  sonarView: 'Sonar View',
  sonar: 'Sonar',
  radar: 'Radar',
  threeD: '3D',
  threeDView: '3D View',
  layout: 'Layout',
  showTracks: 'Show Tracks',
  hideTracks: 'Hide Tracks',
  showTimeLabels: 'Show Time Labels',
  hideTimeLabels: 'Hide Time Labels',
  showLightning: 'Show Lightning',
  hideLightning: 'Hide Lightning',
  movementProjectionCones: 'Movement Cones',

  // Alerts
  advisory: 'Advisory',
  areaDesc: 'Affected Area',
  areas: 'Areas',
  instruction: 'Instructions',
  safetyInstructions: 'Safety Instructions',
  viewAllAlerts: 'View All Alerts',
  alertRadiusFreq: 'Alert Radius & Frequency',
  alertsSent: 'Alerts Sent',
  alertMessagesAppear: 'Alert messages appear here',

  // Settings
  units: 'Units',
  imperial: 'Imperial',
  metric: 'Metric',
  hybrid: 'Hybrid',
  tone: 'Tone',
  professional: 'Professional',
  friendly: 'Friendly',
  fun: 'Fun',
  saveSettings: 'Save Settings',
  settingsNotifications: 'Notifications',
  soundAlerts: 'Sound Alerts',
  visualAlerts: 'Visual Alerts',
  minimumDbz: 'Minimum dBZ',
  minimumInterval: 'Minimum Interval',
  impactThreshold: 'Impact Threshold',
  minImpactToShow: 'Min Impact to Show',
  showDetailedAnalysis: 'Show Detailed Analysis',

  // AI
  aiWeatherAssistant: 'AI Weather Assistant',
  analyzeWeather: 'Analyze Weather',
  getAIAnalysis: 'Get AI Analysis',
  askWeatherQuestions: 'Ask weather questions…',
  chatPlaceholder: 'Ask about current conditions…',
  showChat: 'Show Chat',
  hideChat: 'Hide Chat',
  showDetails: 'Show Details',
  showMore: 'Show More',
  showLess: 'Show Less',
  riskAssessment: 'Risk Assessment',
  dataStatus: 'Data Status',

  // Start / stop
  startMonitoring: 'Start Monitoring',
  stopMonitoring: 'Stop Monitoring',
  changeLocation: 'Change Location',

  // Misc
  lastCheck: 'Last Check',
  perSourceReadings: 'Per-Source Readings',
  unifiedSystem: 'Unified System',

  // Feedback
  didStormHit: 'Did the storm hit your area?',
  yesStormHit: 'Yes',
  noStormMissed: 'No / Missed',
  unsureUnable: 'Unsure',
  thanksFeedback: 'Thanks for the feedback!',
  predictionAccurate: 'Prediction was accurate',
  predictionAdjusted: 'Prediction adjusted',

  // Storm proximity phrases
  stormStillApproaching: 'Storm still approaching',
  stormMovedAway: 'Storm moved away',
  ofYou: 'of you',
  to: 'to',
  delete: 'Delete',
  none: 'None',
  quickActions: 'Quick Actions',

  // Rain types
  heavyRain: 'Heavy Rain',
  intenseRain: 'Intense Rain',
  moderateRain: 'Moderate Rain',
  extremeHail: 'Extreme Hail',

  // Misc continued
  severityColor: 'Severity Color',
  impactColor: 'Impact Color',
  noMessagesYet: 'No messages yet',
};

// Minimal fallback translations — all other languages fall back to English
// In production these would be populated with real translations
const minimal = (overrides: Partial<Translations>): Translations => ({ ...en, ...overrides });

/**
 * translateWeatherText — translates common NWS weather strings to the
 * target language. For now returns the text unchanged; a real implementation
 * would map known phrases via a lookup table or AI.
 */
export function translateWeatherText(text: string, _language: Language): string {
  return text;
}

export const translations: Record<Language, Translations> = {
  en,
  es: minimal({ realTimeStorm: 'Detección de Tormentas en Tiempo Real', language: 'Idioma', loading: 'Cargando…', ready: 'Listo', weather: 'Clima', radar: 'Radar', storms: 'Tormentas', alerts: 'Alertas', settings: 'Ajustes', search: 'Buscar', cancel: 'Cancelar' }),
  fr: minimal({ realTimeStorm: 'Détection d\'Orages en Temps Réel', language: 'Langue', loading: 'Chargement…', ready: 'Prêt', weather: 'Météo', radar: 'Radar', storms: 'Orages', alerts: 'Alertes', settings: 'Paramètres', search: 'Rechercher', cancel: 'Annuler' }),
  de: minimal({ realTimeStorm: 'Echtzeit-Sturmerkennung', language: 'Sprache', loading: 'Laden…', ready: 'Bereit', weather: 'Wetter', radar: 'Radar', storms: 'Stürme', alerts: 'Warnungen', settings: 'Einstellungen', search: 'Suchen', cancel: 'Abbrechen' }),
  it: minimal({ realTimeStorm: 'Rilevamento Tempeste in Tempo Reale', language: 'Lingua', loading: 'Caricamento…', ready: 'Pronto', weather: 'Meteo', radar: 'Radar', storms: 'Tempeste', alerts: 'Allerte', settings: 'Impostazioni', search: 'Cerca', cancel: 'Annulla' }),
  pt: minimal({ realTimeStorm: 'Detecção de Tempestades em Tempo Real', language: 'Idioma', loading: 'Carregando…', ready: 'Pronto', weather: 'Clima', radar: 'Radar', storms: 'Tempestades', alerts: 'Alertas', settings: 'Configurações', search: 'Pesquisar', cancel: 'Cancelar' }),
  nl: minimal({ realTimeStorm: 'Realtime Stormsdetectie', language: 'Taal', loading: 'Laden…', ready: 'Klaar', weather: 'Weer', radar: 'Radar', storms: 'Stormen', alerts: 'Waarschuwingen', settings: 'Instellingen', search: 'Zoeken', cancel: 'Annuleren' }),
  ru: minimal({ realTimeStorm: 'Обнаружение Бурь в Реальном Времени', language: 'Язык', loading: 'Загрузка…', ready: 'Готово', weather: 'Погода', radar: 'Радар', storms: 'Бури', alerts: 'Оповещения', settings: 'Настройки', search: 'Поиск', cancel: 'Отмена' }),
  zh: minimal({ realTimeStorm: '实时风暴探测', language: '语言', loading: '加载中…', ready: '就绪', weather: '天气', radar: '雷达', storms: '风暴', alerts: '警报', settings: '设置', search: '搜索', cancel: '取消' }),
  ja: minimal({ realTimeStorm: 'リアルタイム嵐検知', language: '言語', loading: '読込中…', ready: '準備完了', weather: '天気', radar: 'レーダー', storms: '嵐', alerts: '警報', settings: '設定', search: '検索', cancel: 'キャンセル' }),
  ko: minimal({ realTimeStorm: '실시간 폭풍 감지', language: '언어', loading: '로딩 중…', ready: '준비됨', weather: '날씨', radar: '레이더', storms: '폭풍', alerts: '경보', settings: '설정', search: '검색', cancel: '취소' }),
  ar: minimal({ realTimeStorm: 'الكشف عن العواصف في الوقت الفعلي', language: 'اللغة', loading: 'جار التحميل…', ready: 'جاهز', weather: 'الطقس', radar: 'الرادار', storms: 'العواصف', alerts: 'التنبيهات', settings: 'الإعدادات', search: 'بحث', cancel: 'إلغاء' }),
  hi: minimal({ realTimeStorm: 'रियल-टाइम तूफ़ान डिटेक्शन', language: 'भाषा', loading: 'लोड हो रहा है…', ready: 'तैयार', weather: 'मौसम', radar: 'रडार', storms: 'तूफ़ान', alerts: 'अलर्ट', settings: 'सेटिंग्स', search: 'खोजें', cancel: 'रद्द करें' }),
  pl: minimal({ realTimeStorm: 'Wykrywanie Burz w Czasie Rzeczywistym', language: 'Język', loading: 'Ładowanie…', ready: 'Gotowy', weather: 'Pogoda', radar: 'Radar', storms: 'Burze', alerts: 'Ostrzeżenia', settings: 'Ustawienia', search: 'Szukaj', cancel: 'Anuluj' }),
  sv: minimal({ realTimeStorm: 'Realtids Stormdetektering', language: 'Språk', loading: 'Laddar…', ready: 'Redo', weather: 'Väder', radar: 'Radar', storms: 'Stormar', alerts: 'Varningar', settings: 'Inställningar', search: 'Sök', cancel: 'Avbryt' }),
  no: minimal({ realTimeStorm: 'Sanntids Stormgjenkjenning', language: 'Språk', loading: 'Laster…', ready: 'Klar', weather: 'Vær', radar: 'Radar', storms: 'Stormer', alerts: 'Varsler', settings: 'Innstillinger', search: 'Søk', cancel: 'Avbryt' }),
  da: minimal({ realTimeStorm: 'Realtids Stormregistrering', language: 'Sprog', loading: 'Indlæser…', ready: 'Klar', weather: 'Vejr', radar: 'Radar', storms: 'Storme', alerts: 'Advarsler', settings: 'Indstillinger', search: 'Søg', cancel: 'Annuller' }),
  fi: minimal({ realTimeStorm: 'Reaaliaikainen Myrskyhavainto', language: 'Kieli', loading: 'Ladataan…', ready: 'Valmis', weather: 'Sää', radar: 'Tutka', storms: 'Myrskyt', alerts: 'Varoitukset', settings: 'Asetukset', search: 'Hae', cancel: 'Peruuta' }),
  tr: minimal({ realTimeStorm: 'Gerçek Zamanlı Fırtına Tespiti', language: 'Dil', loading: 'Yükleniyor…', ready: 'Hazır', weather: 'Hava', radar: 'Radar', storms: 'Fırtınalar', alerts: 'Uyarılar', settings: 'Ayarlar', search: 'Ara', cancel: 'İptal' }),
  uk: minimal({ realTimeStorm: 'Виявлення Бур в Реальному Часі', language: 'Мова', loading: 'Завантаження…', ready: 'Готово', weather: 'Погода', radar: 'Радар', storms: 'Бурі', alerts: 'Сповіщення', settings: 'Налаштування', search: 'Пошук', cancel: 'Скасувати' }),
};
