import React, { useState } from 'react';
import { User } from '../types';
import {
  Phone,
  Lock,
  User as UserIcon,
  LogIn,
  UserPlus,
  Video,
  ShieldCheck,
  Shield,
  AtSign,
  KeyRound,
  AlertCircle,
} from 'lucide-react';
import { loginWithFirebase, registerWithFirebase, loginWithGoogle } from '../lib/authService';

interface AuthScreenProps {
  onLoginSuccess: (user: User) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdminPrompt, setShowAdminPrompt] = useState(false);

  const handleGoogleLogin = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const user = await loginWithGoogle();
      onLoginSuccess(user);
    } catch (err: unknown) {
      console.error('Google login error:', err);
      if (err instanceof Error) {
        if (err.message.includes('auth/popup-closed-by-user')) {
          setError('تم إغلاق نافذة تسجيل الدخول قبل إتمام العملية');
        } else if (err.message.includes('auth/cancelled-popup-request')) {
          // Ignored
        } else {
          setError(err.message || 'حدث خطأ أثناء تسجيل الدخول عبر Google');
        }
      } else {
        setError('تعذر إتمام الدخول بحساب Google');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!phone.trim() || !password.trim()) {
      setError('يرجى كتابة رقم الهاتف/اسم المستخدم وكلمة المرور');
      return;
    }

    if (mode === 'register' && !name.trim()) {
      setError('يرجى إدخال اسمك أو الاسم المعروض');
      return;
    }

    setLoading(true);
    try {
      let user: User;
      if (mode === 'register') {
        user = await registerWithFirebase({
          phone: phone.trim(),
          name: name.trim(),
          password: password.trim(),
          username: username.trim(),
        });
      } else {
        user = await loginWithFirebase(phone.trim(), password.trim());
      }

      onLoginSuccess(user);
    } catch (err: unknown) {
      console.error('Auth error:', err);
      if (err instanceof Error) {
        if (err.message.includes('auth/wrong-password') || err.message.includes('auth/invalid-credential')) {
          setError('رقم الهاتف أو كلمة المرور غير صحيحة');
        } else if (err.message.includes('auth/email-already-in-use')) {
          setError('هذا الحساب مسجل مسبقاً، يرجى تسجيل الدخول');
        } else {
          setError(err.message || 'حدث خطأ أثناء المصادقة مع Firebase');
        }
      } else {
        setError('تعذر إتمام المصادقة');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAccount = async (targetPhone: string, targetPass: string) => {
    setPhone(targetPhone);
    setPassword(targetPass);
    setLoading(true);
    setError(null);

    try {
      const user = await loginWithFirebase(targetPhone, targetPass);
      onLoginSuccess(user);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSecretAdminLogin = () => {
    setPhone('1007363904');
    setPassword('139213');
    setShowAdminPrompt(false);
  };

  return (
    <div className="min-h-screen bg-[#F0F2F5] flex items-center justify-center p-4 sm:p-6 lg:p-12 font-sans overflow-x-hidden" dir="rtl">
      {/* Main Dual-Pane Card */}
      <div className="w-full max-w-5xl min-h-[620px] bg-white rounded-3xl shadow-2xl shadow-slate-200/80 flex flex-col lg:flex-row overflow-hidden border border-gray-100">
        
        {/* Left / Top Branding Panel with Professional Green-Teal Gradient */}
        <div className="w-full lg:w-1/2 bg-gradient-to-br from-[#25D366] to-[#128C7E] p-8 sm:p-12 flex flex-col justify-between text-white relative overflow-hidden">
          {/* Subtle Ambient blur blobs */}
          <div className="absolute top-[-80px] right-[-80px] w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-[-60px] left-[-60px] w-80 h-80 bg-black/15 rounded-full blur-3xl pointer-events-none" />

          <div className="z-10">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-6 shadow-inner border border-white/20">
              <Video className="w-9 h-9 text-white stroke-[2.2]" />
            </div>

            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/20 backdrop-blur-md border border-white/30 text-xs font-bold mb-4">
              <Shield className="w-3.5 h-3.5 text-white" />
              <span>Firebase Auth + ZEGOCLOUD WebRTC Engine</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-4 tracking-tight leading-tight font-mono">
              SNNS
            </h1>
            <p className="text-base sm:text-lg text-white/90 leading-relaxed max-w-md">
              اتصال فيديو وصوت عالي الدقة بهوية موحدة وبث مباشر فائق السرعة عبر ZEGOCLOUD.
            </p>
          </div>

          <div className="z-10 mt-8 pt-6 border-t border-white/20 text-xs text-white/80 flex items-center justify-between">
            <span>محمي بـ Firebase Authentication & Firestore</span>
            <span>بث مباشر عبر ZEGOCLOUD</span>
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="w-full lg:w-1/2 p-6 sm:p-10 lg:p-14 flex flex-col justify-center bg-white">
          <div className="max-w-md mx-auto w-full">
            
            {/* Header & Mode Switcher */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
                  {mode === 'login' ? (
                    <>
                      <LogIn className="w-7 h-7 text-[#128C7E]" />
                      <span>تسجيل الدخول</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-7 h-7 text-[#25D366]" />
                      <span>تسجيل مستخدم جديد</span>
                    </>
                  )}
                </h2>

                {/* Primary User Register Icon/Button */}
                <div className="flex bg-gray-100 p-1 rounded-2xl border border-gray-200">
                  <button
                    type="button"
                    id="switch-login-btn"
                    onClick={() => { setMode('login'); setError(null); }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                      mode === 'login' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>دخول</span>
                  </button>
                  <button
                    type="button"
                    id="switch-register-btn"
                    onClick={() => { setMode('register'); setError(null); }}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                      mode === 'register' ? 'bg-[#25D366] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>تسجيل جديد</span>
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                اختر تسجيل الدخول المباشر بحساب Google بنقرة واحدة أو المتابعة بالبيانات
              </p>
            </div>

            {/* Google One-Click Sign In (Fully supported in Firebase Auth) */}
            <div className="mb-4">
              <button
                type="button"
                id="google-signin-btn"
                onClick={handleGoogleLogin}
                disabled={googleLoading || loading}
                className="w-full py-3 px-4 bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-gray-300 rounded-xl text-xs sm:text-sm font-bold text-gray-800 flex items-center justify-center gap-3 transition-all shadow-sm active:scale-[0.99] disabled:opacity-60"
              >
                {googleLoading ? (
                  <span className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                )}
                <span>تسجيل الدخول السريع عبر Google (موصى به)</span>
              </button>

              <div className="relative flex py-3 items-center">
                <div className="flex-grow border-t border-gray-200"></div>
                <span className="flex-shrink mx-3 text-[11px] font-semibold text-gray-400">أو المتابعة برقم الهاتف / المعرّف</span>
                <div className="flex-grow border-t border-gray-200"></div>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">
                  <span>{error}</span>
                </div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === 'register' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      الاسم الشخصي المعروض (Display Name)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        id="reg-name-input"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="مثال: يوسف أحمد"
                        className="w-full pl-4 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#25D366] focus:border-transparent outline-none transition-all text-xs text-gray-900 placeholder-gray-400 font-semibold"
                      />
                      <UserIcon className="w-4 h-4 text-gray-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      اسم المستخدم الخاص (Username)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        id="reg-username-input"
                        dir="ltr"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="yousef_vip"
                        className="w-full pl-4 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#25D366] focus:border-transparent outline-none transition-all text-xs font-mono text-gray-900 placeholder-gray-400 text-left font-bold"
                      />
                      <AtSign className="w-4 h-4 text-gray-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  {mode === 'login' ? 'رقم الهاتف أو اسم المستخدم' : 'رقم الهاتف / معرّف الاتصال'}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    id="auth-phone-input"
                    dir="ltr"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={mode === 'login' ? '05XXXXXXXX أو اسم المستخدم' : '05XXXXXXXX'}
                    className="w-full pl-4 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#25D366] focus:border-transparent outline-none transition-all text-xs font-mono text-gray-900 placeholder-gray-400 text-left font-bold"
                  />
                  <Phone className="w-4 h-4 text-gray-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  كلمة المرور
                </label>
                <div className="relative">
                  <input
                    type="password"
                    id="auth-pass-input"
                    dir="ltr"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-4 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#25D366] focus:border-transparent outline-none transition-all text-xs font-mono text-gray-900 placeholder-gray-400 text-left font-bold"
                  />
                  <Lock className="w-4 h-4 text-gray-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <button
                type="submit"
                id="auth-submit-btn"
                disabled={loading || googleLoading}
                className="w-full bg-[#25D366] hover:bg-[#1ebd5e] text-white font-bold py-3 rounded-xl shadow-md shadow-green-200/80 transition-all transform active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-2 text-xs sm:text-sm"
              >
                {loading ? (
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : mode === 'login' ? (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>تسجيل الدخول بالبيانات</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>تسجيل الحساب في Firebase</span>
                  </>
                )}
              </button>
            </form>

            {/* Quick Demo Access Trigger */}
            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-600">
                  حسابات سريعة / الوضع المخفي:
                </span>
                
                {/* Hidden / Discreet Admin trigger */}
                <button
                  type="button"
                  onClick={() => setShowAdminPrompt(!showAdminPrompt)}
                  className="text-[10px] text-gray-300 hover:text-gray-500 transition flex items-center gap-1"
                  title="الوضع المخفي"
                >
                  <KeyRound className="w-3 h-3" />
                </button>
              </div>

              {showAdminPrompt && (
                <div className="mb-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between animate-in fade-in">
                  <span className="text-xs font-bold text-amber-900">دخول الإدارة المخفي:</span>
                  <button
                    type="button"
                    onClick={handleSecretAdminLogin}
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition"
                  >
                    تعبئة بيانات الآدمن
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  id="quick-demo-139213"
                  onClick={() => handleQuickAccount('139213', '139213')}
                  disabled={loading || googleLoading}
                  className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-right transition flex flex-col text-xs text-emerald-900 font-bold"
                >
                  <span>حساب تجريبي (139213)</span>
                  <span className="font-mono text-[10px] text-emerald-600 dir-ltr text-left">
                    Pass: 139213
                  </span>
                </button>

                <button
                  type="button"
                  id="quick-create-new"
                  onClick={() => { setMode('register'); setError(null); }}
                  className="p-2 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200 text-right transition flex flex-col text-xs text-gray-700 font-bold"
                >
                  <span>إنشاء حساب مخصص</span>
                  <span className="text-[10px] text-gray-400">انضم كعضو جديد</span>
                </button>
              </div>
            </div>

            {/* Footer encryption badge */}
            <div className="mt-4 flex items-center justify-center gap-3 text-gray-400">
              <div className="h-px bg-gray-200 flex-1" />
              <span className="text-[11px] font-bold text-gray-500 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#128C7E]" />
                <span>نظام اتصال مؤمّن ومشفّر بالكامل</span>
              </span>
              <div className="h-px bg-gray-200 flex-1" />
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};

