import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            element: HTMLElement,
            options: {
              type: string;
              shape: string;
              theme: string;
              text: string;
              size: string;
              logo_alignment: string;
            }
          ) => void;
        };
      };
    };
  }
}

export default function Login() {
  const navigate = useNavigate();
  const { user, isAuthenticated, login } = useAuth();
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      // توجيه كل رتبة إلى صفحتها المستقلة
      if (user.role === 'admin') navigate('/admin');
      else if (user.role === 'instructor') navigate('/instructor');
      else if (user.role === 'assistant') navigate('/assistant');
      else navigate('/courses');
    }
  }, [isAuthenticated, user, navigate]);

  const handleGoogleLogin = useCallback(async (response: { credential: string }) => {
    try {
      await login(response.credential);
      // Navigation will happen automatically via useEffect
    } catch (error) {
      toast.error('فشل تسجيل الدخول. يرجى المحاولة مرة أخرى.');
      console.error('Login error:', error);
    }
  }, [login]);

  useEffect(() => {
    if (initialized.current || !googleButtonRef.current) return;
    
    const initGoogle = () => {
      if (window.google && googleButtonRef.current) {
        initialized.current = true;
        
        window.google.accounts.id.initialize({
          client_id: '543687035134-d64j2ncr5bcfuv7s9e61psp7qb2dj276.apps.googleusercontent.com',
          callback: handleGoogleLogin,
        });

        window.google.accounts.id.renderButton(googleButtonRef.current, {
          type: 'standard',
          shape: 'pill',
          theme: 'outline',
          text: 'signin_with',
          size: 'large',
          logo_alignment: 'center',
        });
      }
    };

    // Wait for Google script to load
    if (window.google) {
      initGoogle();
    } else {
      const checkInterval = setInterval(() => {
        if (window.google) {
          clearInterval(checkInterval);
          initGoogle();
        }
      }, 100);

      // Cleanup after 10 seconds
      setTimeout(() => clearInterval(checkInterval), 10000);
    }
  }, [handleGoogleLogin]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#fdfbfb] to-[#ebedee] flex flex-col justify-between items-center">
      {/* Login Wrapper */}
      <div className="flex-1 flex justify-center items-center w-full p-5">
        <div className="bg-white rounded-[28px] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.08)] w-full max-w-[450px] p-12 px-10 text-center flex flex-col items-center gap-5 border border-black/[0.03] border-t-[6px] border-t-primary relative overflow-hidden">
          {/* Background Glow */}
          <div className="absolute -top-[60px] left-1/2 -translate-x-1/2 w-[180px] h-[180px] bg-primary/10 blur-[45px] rounded-full z-0" />
          
          {/* Platform Identity */}
          <div className="flex flex-col items-center gap-4 z-[1]">
            <img 
              src="/logo.png" 
              alt="شعار كله بيتعلم" 
              className="max-w-[150px] h-auto rounded-[20px] shadow-[0_10px_20px_rgba(0,0,0,0.05)] transition-transform duration-300 hover:scale-[1.03]"
            />
            <h1 className="text-[28px] font-bold text-primary mb-[-5px]">
              كله بيتعلم لتعلم المهارات
            </h1>
          </div>

          <p className="text-[15px] text-text-muted z-[1] leading-relaxed mb-2">
            منصتك الشبابية المتكاملة لإتقان المهارات العملية بيسر.
          </p>
          
          {/* Separator */}
          <div className="w-full h-px bg-slate-200 my-4 relative">
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-4 text-primary text-[13px] font-bold">
              ابدأ التعلم الآن
            </span>
          </div>

          {/* Google Sign In Button */}
          <div 
            ref={googleButtonRef}
            className="w-full flex justify-center z-[1] mt-2"
          />
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full p-6 text-center text-text-muted text-sm bg-white/60 backdrop-blur-md border-t border-black/[0.04]">
        جميع الحقوق محفوظة لمنصة كله بيتعلم &copy; 2026 
        <span className="mx-2">|</span>
        <a 
          href="https://adham-protofoilo.vercel.app" 
          className="text-primary font-bold mx-1 hover:underline transition-colors"
          target="_blank"
          rel="noopener noreferrer"
        >
           أدهم عطية سالم
        </a>
      </footer>
    </div>
  );
}
