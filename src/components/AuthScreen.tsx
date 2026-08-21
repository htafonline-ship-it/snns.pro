import React, { useState } from 'react';
import { User } from '../types';
import {
  LogIn,
  UserPlus,
  Phone,
  Lock,
  User as UserIcon,
  AtSign,
  Video,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';

import {
  loginWithFirebase,
  registerWithFirebase,
  loginWithGoogle,
} from '../lib/authService';

interface AuthScreenProps {
  onLoginSuccess: (user: User) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onLoginSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');

  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setError(null);
    setGoogleLoading(true);

    try {
      const user = await loginWithGoogle();
      onLoginSuccess(user);
    } catch (err: unknown) {
      console.error(err);

      if (err instanceof Error) {
        if (err.message.includes('auth/popup-closed-by-user')) {
          setError('تم إغلاق نافذة تسجيل الدخول');
        } else {
          setError(err.message || 'تعذر تسجيل الدخول عبر Google');
        }
      } else {
        setError('تعذر تسجيل الدخول عبر Google');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!phone.trim() || !password.trim()) {
      setError('أدخل رقم الهاتف أو اسم المستخدم وكلمة المرور');
      return;
    }

    if (mode === 'register' && !name.trim()) {
      setError('أدخل الاسم المعروض');
      return;
    }

    setLoading(true);

    try {
      let user: User;

      if (mode === 'register') {
        user = await registerWithFirebase({
          phone: phone.trim(),
          name: name.trim(),
          username: username.trim(),
          password: password.trim(),
        });
      } else {
        user = await loginWithFirebase(
          phone.trim(),
          password.trim()
        );
      }

      onLoginSuccess(user);
    } catch (err: unknown) {
      console.error(err);

      if (err instanceof Error) {
        if (
          err.message.includes('auth/wrong-password') ||
          err.message.includes('auth/invalid-credential')
        ) {
          setError('بيانات الدخول غير صحيحة');
        } else if (
          err.message.includes('auth/email-already-in-use')
        ) {
          setError('الحساب موجود مسبقًا');
        } else {
          setError(err.message || 'تعذر تسجيل الدخول');
        }
      } else {
        setError('تعذر تسجيل الدخول');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[#f6f8f7] flex items-center justify-center px-4 py-8"
    >
      <div className="w-full max-w-[430px]">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto rounded-[22px] bg-[#08a977] shadow-lg shadow-emerald-200 flex items-center justify-center mb-4">
            <Video className="w-8 h-8 text-white" />
          </div>

          <h1 className="text-3xl font-black text-slate-900">
            SNNS
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            تواصل بسهولة وخصوصية
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-[28px] border border-slate-200/70 shadow-xl shadow-slate-200/50 p-6 sm:p-8">

          {/* Switch */}
          <div className="grid grid-cols-2 bg-slate-100 rounded-2xl p-1 mb-7">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`h-11 rounded-xl font-bold text-sm transition ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              تسجيل الدخول
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`h-11 rounded-xl font-bold text-sm transition ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              حساب جديد
            </button>
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-black text-slate-900">
              {mode === 'login'
                ? 'مرحبًا بعودتك'
                : 'إنشاء حساب SNNS'}
            </h2>

            <p className="text-xs text-slate-500 mt-1">
              {mode === 'login'
                ? 'سجّل الدخول للمتابعة'
                : 'أدخل بياناتك لإنشاء حساب جديد'}
            </p>
          </div>

          {/* Google */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading || googleLoading}
            className="w-full h-12 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition flex items-center justify-center gap-3 font-bold text-sm text-slate-700 disabled:opacity-50"
          >
            {googleLoading ? (
              <span className="w-5 h-5 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin" />
            ) : (
              <>
                <svg
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                >
                  <path
                    fill="#4285F4"
                    d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.27-2.09 3.56-5.17 3.56-8.65Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3a7.19 7.19 0 0 1-10.7-3.79h-4v3.09A12 12 0 0 0 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.37 14.3A7.22 7.22 0 0 1 5 12c0-.8.14-1.58.37-2.3V6.61h-4A12 12 0 0 0 0 12c0 1.94.47 3.78 1.37 5.39l4-3.09Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.77c1.77 0 3.36.61 4.61 1.8l3.44-3.45A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.37 6.61l4 3.09A7.17 7.17 0 0 1 12 4.77Z"
                  />
                </svg>

                <span>المتابعة باستخدام Google</span>
              </>
            )}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="h-px bg-slate-200 flex-1" />
            <span className="text-[11px] text-slate-400">
              أو باستخدام البيانات
            </span>
            <div className="h-px bg-slate-200 flex-1" />
          </div>

          {/* Error */}
          {error && (
            <div className="mb-5 px-4 py-3 bg-red-50 border border-red-100 rounded-2xl text-xs font-bold text-red-600 flex gap-2 items-center">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">

            {mode === 'register' && (
              <>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-2">
                    الاسم
                  </label>

                  <div className="relative">
                    <UserIcon className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="الاسم المعروض"
                      className="w-full h-12 rounded-2xl bg-slate-50 border border-slate-200 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50 pr-11 pl-4 text-sm font-semibold transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-2">
                    اسم المستخدم
                  </label>

                  <div className="relative">
                    <AtSign className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

                    <input
                      dir="ltr"
                      value={username}
                      onChange={(e) =>
                        setUsername(e.target.value)
                      }
                      placeholder="username"
                      className="w-full h-12 rounded-2xl bg-slate-50 border border-slate-200 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50 pr-11 pl-4 text-sm font-semibold text-left transition"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="text-xs font-bold text-slate-600 block mb-2">
                رقم الهاتف أو اسم المستخدم
              </label>

              <div className="relative">
                <Phone className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

                <input
                  dir="ltr"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="05XXXXXXXX"
                  className="w-full h-12 rounded-2xl bg-slate-50 border border-slate-200 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50 pr-11 pl-4 text-sm font-semibold text-left transition"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 block mb-2">
                كلمة المرور
              </label>

              <div className="relative">
                <Lock className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

                <input
                  dir="ltr"
                  type="password"
                  value={password}
                  onChange={(e) =>
                    setPassword(e.target.value)
                  }
                  placeholder="••••••••"
                  className="w-full h-12 rounded-2xl bg-slate-50 border border-slate-200 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50 pr-11 pl-4 text-sm font-semibold text-left transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full h-12 rounded-2xl bg-[#08a977] hover:bg-[#079468] text-white font-black text-sm transition shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <span className="w-5 h-5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              ) : mode === 'login' ? (
                <>
                  <LogIn className="w-4 h-4" />
                  دخول
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  إنشاء الحساب
                </>
              )}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>دخول آمن ومحمي</span>
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-400 mt-5">
          SNNS • تواصل ببساطة
        </p>
      </div>
    </div>
  );
};