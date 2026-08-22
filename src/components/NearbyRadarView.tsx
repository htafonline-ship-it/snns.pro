import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { User, CallType } from '../types';
import {
  Radar,
  Radio,
  Eye,
  EyeOff,
  Video,
  Phone,
  MessageSquare,
  UserPlus,
  Compass,
  MapPin,
  Smartphone,
  Laptop,
  Globe,
  Wifi,
  RefreshCw,
  Search,
  Check,
  Shield,
  ShieldCheck,
  Zap,
  Lock,
} from 'lucide-react';
import { toggleStealthMode, updateUserLocation, addContact } from '../lib/firestoreService';

interface NearbyRadarViewProps {
  currentUser: User;
  allUsers: User[];
  onlineUids: string[];
  onStartCall: (targetUser: User, callType: CallType) => void;
  onOpenChat: (targetUser: User) => void;
  onUserUpdate: (updatedUser: Partial<User>) => void;
}

interface NearbyDevice {
  user: User;
  distanceMeters: number;
  distanceText: string;
  signalStrength: 'excellent' | 'good' | 'fair';
  angle: number; // For radar plotting (0 - 360 deg)
  isOnline: boolean;
}

// Calculate Haversine distance between two coordinates in meters
function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// Deterministic angle & proximity hash for consistent radar visualization
function pseudoHashAngle(uid: string): number {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = (hash << 5) - hash + uid.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash % 360);
}

function pseudoHashDistance(uid: string): number {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = (hash * 31 + uid.charCodeAt(i)) & 0xffffffff;
  }
  // Range between 15m and 850m
  return 15 + Math.abs(hash % 835);
}

export const NearbyRadarView: React.FC<NearbyRadarViewProps> = ({
  currentUser,
  allUsers,
  onlineUids,
  onStartCall,
  onOpenChat,
  onUserUpdate,
}) => {
  const [isStealth, setIsStealth] = useState<boolean>(Boolean(currentUser.isStealth));
  const [isTogglingStealth, setIsTogglingStealth] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [distanceFilter, setDistanceFilter] = useState<'all' | '100m' | '500m' | '5km'>('all');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(
    currentUser.latitude && currentUser.longitude
      ? { lat: currentUser.latitude, lon: currentUser.longitude }
      : null
  );
  const [locationStatus, setLocationStatus] = useState<'granted' | 'prompt' | 'denied' | 'simulated'>('simulated');
  const [addedContactUids, setAddedContactUids] = useState<string[]>([]);
  const [radarHoveredDevice, setRadarHoveredDevice] = useState<NearbyDevice | null>(null);

  // Sync stealth state if currentUser changes
  useEffect(() => {
    setIsStealth(Boolean(currentUser.isStealth));
  }, [currentUser.isStealth]);

  // Request & Watch Geolocation for real-time proximity
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus('simulated');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setUserLocation({ lat, lon });
        setLocationStatus('granted');
        updateUserLocation(currentUser.uid, lat, lon);
        onUserUpdate({ latitude: lat, longitude: lon });
      },
      () => {
        setLocationStatus('simulated');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [currentUser.uid, onUserUpdate]);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  // Handle manual rescan
  const handleRescan = () => {
    setIsScanning(true);
    requestLocation();
    setTimeout(() => {
      setIsScanning(false);
    }, 1200);
  };

  // Toggle Ghost / Stealth Mode
  const handleToggleStealth = async () => {
    if (isTogglingStealth) return;
    setIsTogglingStealth(true);
    const newStealthState = !isStealth;
    setIsStealth(newStealthState);

    try {
      await toggleStealthMode(currentUser.uid, newStealthState);
      onUserUpdate({ isStealth: newStealthState });
    } catch (err) {
      console.error('Failed to toggle stealth mode:', err);
      // Revert on failure
      setIsStealth(!newStealthState);
    } finally {
      setIsTogglingStealth(false);
    }
  };

  // Add discovered user to contacts
  const handleAddContact = async (targetUser: User) => {
    try {
      await addContact(currentUser.uid, targetUser.uid, {
        name: targetUser.name,
        phone: targetUser.phone,
        username: targetUser.username,
        avatarColor: targetUser.avatarColor,
      });
      setAddedContactUids((prev) => [...prev, targetUser.uid]);
    } catch (err) {
      console.error('Failed to add contact:', err);
    }
  };

  // Filter and process nearby devices that have Ghost Mode DISABLED (!isStealth)
  const nearbyDevices = useMemo<NearbyDevice[]>(() => {
    return allUsers
      .filter((user) => {
        // Exclude self
        if (user.uid === currentUser.uid) return false;

        // STRICT REQUIREMENT: Only users who DO NOT have Ghost mode enabled
        // (غير مفعلين وضع الشبح)
        if (Boolean(user.isStealth)) {
          return false;
        }

        // Online filter if active
        const isOnline = onlineUids.includes(user.uid) || user.status === 'online';
        if (onlineOnly && !isOnline) {
          return false;
        }

        // Search query filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchName = user.name.toLowerCase().includes(q);
          const matchPhone = user.phone.includes(q);
          const matchUser = user.username && user.username.toLowerCase().includes(q);
          if (!matchName && !matchPhone && !matchUser) return false;
        }

        return true;
      })
      .map((user) => {
        const isOnline = onlineUids.includes(user.uid) || user.status === 'online';

        // Calculate distance
        let distanceMeters = 0;
        if (
          userLocation &&
          typeof user.latitude === 'number' &&
          typeof user.longitude === 'number'
        ) {
          distanceMeters = calculateDistanceMeters(
            userLocation.lat,
            userLocation.lon,
            user.latitude,
            user.longitude
          );
        } else {
          // Reliable simulated proximity
          distanceMeters = pseudoHashDistance(user.uid);
        }

        let distanceText = '';
        if (distanceMeters < 1000) {
          distanceText = `${distanceMeters} م`;
        } else {
          distanceText = `${(distanceMeters / 1000).toFixed(1)} كم`;
        }

        let signalStrength: 'excellent' | 'good' | 'fair' = 'fair';
        if (distanceMeters <= 100) signalStrength = 'excellent';
        else if (distanceMeters <= 500) signalStrength = 'good';

        const angle = pseudoHashAngle(user.uid);

        return {
          user,
          distanceMeters,
          distanceText,
          signalStrength,
          angle,
          isOnline,
        };
      })
      .filter((device) => {
        // Distance filter
        if (distanceFilter === '100m' && device.distanceMeters > 100) return false;
        if (distanceFilter === '500m' && device.distanceMeters > 500) return false;
        if (distanceFilter === '5km' && device.distanceMeters > 5000) return false;
        return true;
      })
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }, [allUsers, currentUser.uid, onlineUids, onlineOnly, searchQuery, userLocation, distanceFilter]);

  return (
    <div className="space-y-6">
      
      {/* 1. Header Banner & Ghost Mode Control */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5 sm:p-7 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          
          {/* Left: Title & Explanatory Details */}
          <div className="space-y-1.5 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-[#128C7E] text-xs font-bold border border-emerald-200/60">
              <Radar className="w-3.5 h-3.5 text-[#25D366] animate-pulse" />
              <span>رادار الاستكشاف القريب (Nearby Radar)</span>
            </div>
            
            <h2 className="text-xl sm:text-2xl font-black text-gray-900 flex items-center gap-2.5">
              <span>البحث عن الأجهزة القريبة</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                {nearbyDevices.length} متاح
              </span>
            </h2>
            
            <p className="text-xs sm:text-sm text-gray-500 leading-relaxed font-medium">
              استكشف وتواصل فورياً مع المستخدمين القريبين منك الذين قاموا{' '}
              <strong className="text-emerald-700 font-bold">بتعطيل وضع الشبح</strong> ومتاحين للاتصال المرئي والصوتي المباشر.
            </p>
          </div>

          {/* Right: My Personal Ghost Mode Switch */}
          <div className="w-full lg:w-auto bg-slate-50 border border-slate-200/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between lg:justify-end gap-4 shadow-xs">
            <div className="space-y-0.5 text-right">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-gray-900">
                  حالة وضع الشبح الخاص بي:
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    isStealth
                      ? 'bg-rose-100 text-rose-800 border border-rose-200'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  }`}
                >
                  {isStealth ? (
                    <>
                      <EyeOff className="w-3 h-3 text-rose-600" />
                      <span>وضع الشبح مفعّل (مخفي)</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3 h-3 text-emerald-600" />
                      <span>مرئي للأجهزة القريبة</span>
                    </>
                  )}
                </span>
              </div>
              <p className="text-[11px] text-gray-500 font-medium">
                {isStealth
                  ? 'أنت مخفي تماماً ولن تظهر على رادار الأجهزة الأخرى.'
                  : 'أنت ظاهر الآن في رادار الأجهزة القريبة ويمكنهم التواصل معك.'}
              </p>
            </div>

            <button
              type="button"
              id="toggle-ghost-mode-btn"
              disabled={isTogglingStealth}
              onClick={handleToggleStealth}
              className={`shrink-0 px-4 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-sm ${
                isStealth
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200'
                  : 'bg-slate-800 hover:bg-slate-900 text-white shadow-slate-300'
              }`}
            >
              {isTogglingStealth ? (
                <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : isStealth ? (
                <>
                  <Eye className="w-4 h-4" />
                  <span>إلغاء وضع الشبح (الظهور)</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-4 h-4" />
                  <span>تفعيل وضع الشبح (التخفي)</span>
                </>
              )}
            </button>
          </div>

        </div>
      </div>

      {/* 2. Interactive Visual Radar Scanner + Filter Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left 5 Cols: Visual Sonar / Radar Canvas */}
        <div className="lg:col-span-5 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 rounded-3xl p-6 text-white shadow-xl border border-slate-800 flex flex-col items-center justify-between relative overflow-hidden min-h-[420px]">
          
          {/* Top radar header */}
          <div className="w-full flex items-center justify-between z-10 mb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
              <Radio className="w-4 h-4 animate-pulse" />
              <span>ماسح الترددات الحية</span>
            </div>
            
            <button
              type="button"
              onClick={handleRescan}
              disabled={isScanning}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
              title="إعادة المسح"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-emerald-400' : ''}`} />
              <span className="text-[11px]">تحديث الرادار</span>
            </button>
          </div>

          {/* Radar Screen Area */}
          <div className="relative w-64 h-64 sm:w-72 sm:h-72 my-3 flex items-center justify-center">
            
            {/* Concentric distance circles */}
            <div className="absolute inset-0 rounded-full border border-emerald-500/20" />
            <div className="absolute inset-8 rounded-full border border-emerald-500/25" />
            <div className="absolute inset-16 rounded-full border border-emerald-500/30" />
            <div className="absolute inset-24 rounded-full border border-emerald-500/40" />

            {/* Radar Crosshairs */}
            <div className="absolute inset-x-0 top-1/2 h-[1px] bg-emerald-500/20" />
            <div className="absolute inset-y-0 left-1/2 w-[1px] bg-emerald-500/20" />

            {/* Sonar Rotating Sweep */}
            <div
              className={`absolute inset-0 rounded-full pointer-events-none ${
                isScanning ? 'animate-spin' : ''
              }`}
              style={{
                background:
                  'conic-gradient(from 0deg at 50% 50%, rgba(37, 211, 102, 0.35) 0deg, rgba(37, 211, 102, 0.05) 60deg, transparent 90deg)',
                animationDuration: '3s',
                animationIterationCount: 'infinite',
                animationTimingFunction: 'linear',
              }}
            />

            {/* Center: Current User (ME) */}
            <div className="relative z-20 flex flex-col items-center">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center font-bold text-sm shadow-lg shadow-emerald-500/50 border-2 border-white ring-4 ring-emerald-400/20">
                {currentUser.name.charAt(0)}
              </div>
              <span className="text-[10px] font-bold text-emerald-300 mt-1 bg-slate-900/80 px-2 py-0.5 rounded-full border border-emerald-500/30">
                موقعك
              </span>
            </div>

            {/* Discovered Device Blips plotted on Radar */}
            {nearbyDevices.map((item, idx) => {
              // Calculate coordinate percentage from angle and distance
              const radiusPercent = Math.min(42, Math.max(12, (item.distanceMeters / 600) * 35));
              const rad = (item.angle * Math.PI) / 180;
              const topPos = 50 - radiusPercent * Math.cos(rad);
              const leftPos = 50 + radiusPercent * Math.sin(rad);

              return (
                <div
                  key={item.user.uid}
                  className="absolute z-20 -translate-x-1/2 -translate-y-1/2 group cursor-pointer"
                  style={{ top: `${topPos}%`, left: `${leftPos}%` }}
                  onMouseEnter={() => setRadarHoveredDevice(item)}
                  onMouseLeave={() => setRadarHoveredDevice(null)}
                  onClick={() => onStartCall(item.user, 'video')}
                >
                  {/* Pulsing Ripple */}
                  <span className="absolute -inset-2 rounded-full bg-[#25D366]/30 animate-ping" />
                  
                  {/* Blip Avatar */}
                  <div
                    className={`w-7 h-7 rounded-xl ${
                      item.user.avatarColor || 'bg-emerald-600'
                    } text-white flex items-center justify-center text-xs font-bold shadow-md border border-white/80 transition-transform group-hover:scale-125 group-hover:ring-2 group-hover:ring-emerald-400`}
                  >
                    {item.user.name.charAt(0)}
                  </div>

                  {/* Tooltip on Hover */}
                  <div className="absolute bottom-full right-1/2 translate-x-1/2 mb-1 hidden group-hover:flex flex-col items-center bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded-lg border border-slate-700 shadow-xl whitespace-nowrap pointer-events-none z-30">
                    <span>{item.user.name}</span>
                    <span className="text-emerald-400 font-mono text-[9px]">{item.distanceText}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Radar Footnote */}
          <div className="w-full text-center z-10 pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>نطاق المسح: 10 م - 5 كم</span>
            </span>
            <span className="text-slate-300 font-mono">
              {nearbyDevices.length} أجهزة غير مخفية
            </span>
          </div>

        </div>

        {/* Right 7 Cols: Discovered Devices List & Filter Toolbar */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* Search and Distance Filter Bar */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-3">
            
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-gray-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  id="nearby-search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="البحث في الأجهزة القريبة بالاسم أو المعرف..."
                  className="w-full pr-10 pl-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs sm:text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                />
              </div>

              <button
                type="button"
                onClick={() => setOnlineOnly(!onlineOnly)}
                className={`px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shrink-0 ${
                  onlineOnly
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${onlineOnly ? 'bg-white' : 'bg-emerald-500'}`} />
                <span>المتصلون الآن</span>
              </button>
            </div>

            {/* Distance Pills */}
            <div className="flex items-center gap-2 text-xs pt-1 border-t border-gray-100 overflow-x-auto pb-1">
              <span className="text-gray-400 font-bold shrink-0 ml-1">النطاق:</span>
              
              {(
                [
                  { id: 'all', label: 'كافة المسافات' },
                  { id: '100m', label: 'أقل من 100م' },
                  { id: '500m', label: 'أقل من 500م' },
                  { id: '5km', label: 'أقل من 5 كم' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setDistanceFilter(f.id)}
                  className={`px-3 py-1 rounded-xl font-bold text-xs transition ${
                    distanceFilter === f.id
                      ? 'bg-[#128C7E] text-white shadow-xs'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

          </div>

          {/* List of Visible Devices */}
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5 space-y-3">
            
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                <Compass className="w-4 h-4 text-[#128C7E]" />
                <span>الأجهزة القريبة المتاحة (وضع الشبح: معطّل)</span>
              </h3>
              
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                {nearbyDevices.length} جهاز مرئي
              </span>
            </div>

            {nearbyDevices.length === 0 ? (
              <div className="py-16 text-center flex flex-col items-center justify-center space-y-3">
                <div className="w-16 h-16 rounded-3xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400">
                  <Radar className="w-8 h-8 text-slate-300" />
                </div>
                
                <div className="space-y-1">
                  <h4 className="font-black text-gray-800 text-sm">
                    لا توجد أجهزة قريبة غير مفعلة لوضع الشبح حالياً
                  </h4>
                  <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
                    جميع الأجهزة الأخرى إما غير متصلة أو قامت بتفعيل وضع الشبح 👻 للتخفي.
                    يمكنك مشاركة الرابط لفتح جهاز آخر لتجربة الاكتشاف الحي!
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleRescan}
                  className="px-4 py-2 bg-[#128C7E] text-white rounded-xl text-xs font-bold hover:bg-[#0e6e63] transition active:scale-95 shadow-sm"
                >
                  إعادة مسح النطاق الآن
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {nearbyDevices.map((item) => {
                  const isAdded = addedContactUids.includes(item.user.uid);

                  return (
                    <div
                      key={item.user.uid}
                      className="p-4 rounded-2xl border border-gray-100 bg-gray-50/70 hover:bg-white hover:border-emerald-300 hover:shadow-md transition-all duration-150 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                    >
                      {/* User & Device Info */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          <div
                            className={`w-12 h-12 rounded-2xl ${
                              item.user.avatarColor || 'bg-emerald-600'
                            } flex items-center justify-center text-white text-lg font-black shadow-sm`}
                          >
                            {item.user.name.charAt(0)}
                          </div>
                          <span
                            className={`absolute -bottom-1 -left-1 w-3.5 h-3.5 rounded-full border-2 border-white ${
                              item.isOnline ? 'bg-[#25D366]' : 'bg-gray-400'
                            }`}
                            title={item.isOnline ? 'متصل الآن' : 'غير متصل'}
                          />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-black text-sm text-gray-900 truncate">
                              {item.user.name}
                            </h4>
                            
                            {item.user.isCallLocked && (
                              <span className="p-0.5 bg-rose-100 text-rose-600 rounded text-[10px]" title="مكالمات مقفلة">
                                <Lock className="w-3 h-3" />
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 mt-0.5 text-xs">
                            {item.user.username && (
                              <span className="font-bold text-[#128C7E]" dir="ltr">
                                @{item.user.username}
                              </span>
                            )}
                            <span className="text-gray-300">•</span>
                            <span className="text-gray-500 font-mono text-[11px]" dir="ltr">
                              {item.user.phone}
                            </span>
                          </div>

                          {/* Proximity & Ghost-Free Badge */}
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-[10px] font-bold border border-emerald-200/60">
                              <MapPin className="w-3 h-3 text-emerald-600" />
                              <span>المسافة: {item.distanceText}</span>
                            </span>

                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold">
                              <Zap className="w-3 h-3 text-amber-500" />
                              <span>
                                {item.signalStrength === 'excellent'
                                  ? 'إشارة قوية جداً'
                                  : item.signalStrength === 'good'
                                  ? 'إشارة جيدة'
                                  : 'نطاق متوسط'}
                              </span>
                            </span>

                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 text-[10px] font-bold">
                              <Eye className="w-3 h-3 text-teal-600" />
                              <span>وضع الشبح معطل</span>
                            </span>
                          </div>

                        </div>
                      </div>

                      {/* Direct Call & Action Buttons */}
                      <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 border-gray-200/70">
                        
                        {/* Chat Button */}
                        <button
                          type="button"
                          onClick={() => onOpenChat(item.user)}
                          className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition active:scale-95 flex items-center gap-1"
                          title="مراسلة فورية"
                        >
                          <MessageSquare className="w-4 h-4 text-[#128C7E]" />
                        </button>

                        {/* Audio Call */}
                        <button
                          type="button"
                          disabled={Boolean(item.user.isCallLocked)}
                          onClick={() => onStartCall(item.user, 'audio')}
                          className="flex-1 sm:flex-initial px-3 py-2.5 rounded-xl bg-[#128C7E] hover:bg-[#0e7166] disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition active:scale-95"
                          title="مكالمة صوتية فائقة الوضوح"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>صوتي</span>
                        </button>

                        {/* Video Call */}
                        <button
                          type="button"
                          disabled={Boolean(item.user.isCallLocked)}
                          onClick={() => onStartCall(item.user, 'video')}
                          className="flex-1 sm:flex-initial px-3.5 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#1fbd5c] disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-200 transition active:scale-95"
                          title="مكالمة فيديو Daily HD"
                        >
                          <Video className="w-3.5 h-3.5" />
                          <span>فيديو</span>
                        </button>

                        {/* Add Contact */}
                        <button
                          type="button"
                          onClick={() => handleAddContact(item.user)}
                          disabled={isAdded}
                          className={`p-2.5 rounded-xl text-xs font-bold transition active:scale-95 ${
                            isAdded
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                          }`}
                          title={isAdded ? 'تمت الإضافة لجهات الاتصال' : 'إضافة لجهات الاتصال'}
                        >
                          {isAdded ? <Check className="w-4 h-4 text-emerald-600" /> : <UserPlus className="w-4 h-4" />}
                        </button>

                      </div>

                    </div>
                  );
                })}
              </div>
            )}

          </div>

        </div>

      </div>

    </div>
  );
};
