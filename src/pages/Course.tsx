import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth, apiCall } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { Course, Lesson, QuizQuestion } from '@/types';

declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string,
        options: {
          videoId: string;
          playerVars?: Record<string, number>;
          events?: {
            onReady?: (event: { target: YTPlayer }) => void;
            onStateChange?: (event: { data: number; target: YTPlayer }) => void;
          };
        }
      ) => YTPlayer;
      PlayerState: {
        PLAYING: number;
        PAUSED: number;
        ENDED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  destroy: () => void;
  loadVideoById: (videoId: string) => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  setPlaybackRate: (suggestedRate: number) => void;
  getPlaybackRate: () => number;
  getAvailablePlaybackRates: () => number[];
}

export default function Course() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, token, isAuthenticated } = useAuth();
  
  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [completedLessons, setCompletedLessons] = useState<Set<number>>(new Set());
  const [completedVideos, setCompletedVideos] = useState<Set<string>>(new Set()); 
  const [expandedLesson, setExpandedLesson] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Session Expiry State
  const [sessionExpired, setSessionExpired] = useState(false);

  // Video Inline State
  const [activeLessonId, setActiveLessonId] = useState<number | null>(null);
  const [activeVideoIndex, setActiveVideoIndex] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Exam Modal State
  const [showExamModal, setShowExamModal] = useState(false);
  const [activeExamLesson, setActiveExamLesson] = useState<Lesson | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [examFinished, setExamFinished] = useState(false);
  const [examScore, setExamScore] = useState(0);
  
  const playerRef = useRef<YTPlayer | null>(null);
  const videoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  
  const isVideoEndingRef = useRef(false);
  const videoSavedRef = useRef(false);
  const celebrationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // الخزنة الحية لمنع تجمد المتغيرات وقت انتهاء الفيديو
  const ytDataRef = useRef<{ lesson: Lesson | null; vIdx: number; vTotal: number }>({
    lesson: null,
    vIdx: 0,
    vTotal: 0
  });
  
  const courseId = searchParams.get('id');

  const handleApiError = useCallback((error: any) => {
    const errorMsg = error?.message || '';
    if (errorMsg.includes('جهاز آخر') || errorMsg.includes('Session') || errorMsg.includes('Unauthorized')) {
      setSessionExpired(true);
    } else {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    const verifyAndLoadProgress = async () => {
      if (user && token && courseId) {
        try {
          if (user.role !== 'admin' && user.role !== 'instructor') {
            const enrolledIds = (await apiCall('/api/my-enrollments', token)) as number[];
            if (!enrolledIds.includes(parseInt(courseId as string))) {
              toast.error('غير مصرح لك بمشاهدة المحتوى! يرجى الاشتراك في الكورس أولاً.');
              navigate('/courses');
              return;
            }
          }

          const savedVideoProgress = localStorage.getItem(`video_progress_${user.id}`);
          if (savedVideoProgress) setCompletedVideos(new Set(JSON.parse(savedVideoProgress)));

          const savedLessonProgress = localStorage.getItem(`progress_${user.id}`);
          if (savedLessonProgress) setCompletedLessons(new Set(JSON.parse(savedLessonProgress)));

          const data: any = await apiCall(`/api/courses/${courseId}/progress`, token);
          if (data && data.completedLessons && Array.isArray(data.completedLessons)) {
            setCompletedLessons(prev => {
              const merged = new Set([...prev, ...data.completedLessons]);
              localStorage.setItem(`progress_${user.id}`, JSON.stringify(Array.from(merged)));
              return merged;
            });
          }
          if (data && data.completedVideos && Array.isArray(data.completedVideos)) {
            setCompletedVideos(prev => {
              const merged = new Set([...prev, ...data.completedVideos]);
              localStorage.setItem(`video_progress_${user.id}`, JSON.stringify(Array.from(merged)));
              return merged;
            });
          }
        } catch (error) {
          handleApiError(error);
        }
      }
    };
    verifyAndLoadProgress();
  }, [user, token, courseId, navigate, handleApiError]);

  const saveProgressLocally = useCallback(() => {
    if (user) {
      localStorage.setItem(`progress_${user.id}`, JSON.stringify(Array.from(completedLessons)));
      localStorage.setItem(`video_progress_${user.id}`, JSON.stringify(Array.from(completedVideos)));
    }
  }, [completedLessons, completedVideos, user]);

  useEffect(() => {
    saveProgressLocally();
  }, [completedLessons, completedVideos, saveProgressLocally]);

  const fetchCourseDetails = useCallback(async () => {
    if (!token || !courseId) return;
    try {
      const courses = (await apiCall('/api/courses', token)) as Course[];
      const foundCourse = courses.find(c => c.id === parseInt(courseId as string));
      if (foundCourse) setCourse(foundCourse);
    } catch (error) {
      handleApiError(error);
    }
  }, [token, courseId, handleApiError]);

  const fetchLessons = useCallback(async () => {
    if (!token || !courseId) return;
    try {
      const lessonsData = (await apiCall(`/api/courses/${courseId}/lessons`, token)) as Lesson[];
      
      const lessonsWithQuiz = await Promise.all(
        lessonsData.map(async (lesson) => {
          try {
            const quizData = (await apiCall(`/api/lessons/${lesson.id}/quiz`, token)) as QuizQuestion[];
            return { ...lesson, hasQuiz: quizData.length > 0, quizData };
          } catch {
            return { ...lesson, hasQuiz: false, quizData: [] };
          }
        })
      );
      setLessons(lessonsWithQuiz);
    } catch (error) {
      handleApiError(error);
    } finally {
      setIsLoading(false);
    }
  }, [token, courseId, handleApiError]);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
      return;
    }
    if (courseId && !sessionExpired) {
      fetchCourseDetails();
      fetchLessons();
    }
  }, [isAuthenticated, courseId, navigate, fetchCourseDetails, fetchLessons, sessionExpired]);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const isLessonLocked = (lesson: Lesson, index: number): { locked: boolean; message: string } => {
    if (lesson.is_admin_locked === 1) return { locked: true, message: 'هذه المحاضرة مغلقة حالياً من الإدارة.' };
    if (index > 0) {
      const prevLesson = lessons[index - 1];
      if (!completedLessons.has(prevLesson.id)) {
        return { locked: true, message: 'عذراً، يجب إتمام المحاضرة السابقة أولاً لتتمكن من فتح هذه المحاضرة.' };
      }
    }
    return { locked: false, message: '' };
  };

  const toggleAccordion = (lessonId: number, index: number) => {
    const lesson = lessons.find(l => l.id === lessonId);
    if (!lesson) return;
    const { locked } = isLessonLocked(lesson, index);
    if (locked) return;
    setExpandedLesson(expandedLesson === lessonId ? null : lessonId);
  };

  const extractVideoID = (url: string): string => {
    if (!url) return '';
    if (url.includes('v=')) return url.split('v=')[1].split('&')[0];
    if (url.includes('youtu.be/')) return url.split('youtu.be/')[1].split('?')[0];
    return url;
  };

  const openVideo = (lesson: Lesson, videoUrl: string, vIdx: number, vTotal: number) => {
    ytDataRef.current = { lesson, vIdx, vTotal };
    
    setActiveLessonId(lesson.id);
    setActiveVideoIndex(vIdx);
    setPlaybackRate(1);
    
    isVideoEndingRef.current = false;
    videoSavedRef.current = false;
    if (celebrationTimeoutRef.current) {
      clearTimeout(celebrationTimeoutRef.current);
      celebrationTimeoutRef.current = null;
    }
    
    setTimeout(() => {
      document.getElementById('video-player-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    
    const videoId = extractVideoID(videoUrl);
    
    setTimeout(() => {
      if (!window.YT) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
        window.onYouTubeIframeAPIReady = () => initPlayer(videoId);
      } else {
        initPlayer(videoId);
      }
    }, 50);
  };

  const initPlayer = (videoId: string) => {
    if (playerRef.current && typeof playerRef.current.destroy === 'function') {
      try { playerRef.current.destroy(); } catch (e) {}
    }

    playerRef.current = new window.YT.Player('player', {
      videoId,
      playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0, showinfo: 0, origin: window.location.origin },
      events: {
        onReady: (event) => { event.target.playVideo(); event.target.setPlaybackRate(1); },
        onStateChange: (event) => handlePlayerStateChange(event.data),
      },
    });
  };

  const silentSaveVideoProgress = () => {
    const { lesson, vIdx } = ytDataRef.current;
    if (!lesson || !token || !courseId) return;
    const videoKey = `${lesson.id}_${vIdx}`;
    
    apiCall('/api/progress/video', token, 'POST', { 
      courseId: parseInt(courseId as string), 
      lessonId: lesson.id, 
      videoKey: videoKey 
    }).catch(e => console.log(e));
  };

  const handlePlayerStateChange = (state: number) => {
    if (state === window.YT.PlayerState.PLAYING) {
      setIsVideoPlaying(true);
      if (playerRef.current) setVideoDuration(playerRef.current.getDuration());
      
      if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = setInterval(() => {
        if (playerRef.current) {
          const current = playerRef.current.getCurrentTime();
          const duration = playerRef.current.getDuration();
          setCurrentTime(current);

          // الحفظ الصامت قبل 10 ثواني، ثم الاحتفال بعد 11 ثانية لضمان المشاهدة الكاملة
          if (duration > 0 && current > 0 && (duration - current <= 10)) {
            if (!videoSavedRef.current) {
              videoSavedRef.current = true;
              silentSaveVideoProgress();
              
              celebrationTimeoutRef.current = setTimeout(() => {
                handleVideoCelebration();
              }, 11000); // 11 ثانية بدلاً من 10 لضمان انتهاء الفيديو تماماً
            }
          }
        }
      }, 500);
    } else {
      setIsVideoPlaying(false);
      if (videoIntervalRef.current) {
        clearInterval(videoIntervalRef.current);
        videoIntervalRef.current = null;
      }
      
      // إذا وصل يوتيوب للنهاية الطبيعية قبل الـ 11 ثانية، سيتم الاحتفال فوراً
      if (state === window.YT.PlayerState.ENDED) {
        if (celebrationTimeoutRef.current) clearTimeout(celebrationTimeoutRef.current);
        handleVideoCelebration();
      }
    }
  };

  const togglePlayPause = () => {
    if (!playerRef.current) return;
    if (isVideoPlaying) playerRef.current.pauseVideo();
    else playerRef.current.playVideo();
  };

  const seekVideo = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!playerRef.current || !videoDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    let seekTime = percent * videoDuration;
    playerRef.current.seekTo(seekTime, true);
    setCurrentTime(seekTime);
  };

  const skipVideo = (seconds: number) => {
    if (!playerRef.current || !videoDuration) return;
    const current = playerRef.current.getCurrentTime();
    let newTime = current + seconds;
    if (newTime < 0) newTime = 0;
    if (newTime > videoDuration) newTime = videoDuration;
    playerRef.current.seekTo(newTime, true);
  };

  const cyclePlaybackRate = () => {
    const rates = [0.5, 1, 1.25, 1.5, 2];
    const currentIndex = rates.indexOf(playbackRate);
    const nextRate = rates[(currentIndex + 1) % rates.length];
    setPlaybackRate(nextRate);
    if (playerRef.current) playerRef.current.setPlaybackRate(nextRate);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      if (videoContainerRef.current) videoContainerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  };

  const formatTime = (seconds: number): string => {
    if (!seconds) return '00:00';
    const m = Math.floor(seconds / 60); const s = Math.floor(seconds % 60);
    return `${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
  };

  const handleVideoCelebration = () => {
    if (isVideoEndingRef.current) return;
    isVideoEndingRef.current = true;

    const { lesson, vIdx, vTotal } = ytDataRef.current;
    if (!lesson) return;
    
    const videoKey = `${lesson.id}_${vIdx}`;

    setCompletedVideos(prev => {
      const newSet = new Set(prev);
      newSet.add(videoKey);
      return newSet;
    });

    import('canvas-confetti').then(confetti => {
      confetti.default({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#10b981', '#015669', '#f59e0b', '#38bdf8']
      });
    });

    if (vIdx < vTotal - 1) {
      toast.success('تم إنهاء هذا الجزء بنجاح! يرجى تشغيل الجزء التالي من الشرح.');
      closeVideo();
    } else {
      let alreadyCompleted = false;
      setCompletedLessons(prev => {
        alreadyCompleted = prev.has(lesson.id);
        return prev; 
      });

      if (!alreadyCompleted) {
        if (lesson.hasQuiz) {
          toast.success('ممتاز! لقد أكملت جميع الفيديوهات، يرجى فتح الامتحان لإتمام المحاضرة.');
        } else {
          toast.success('تهانينا! لقد أنهيت المحاضرة بنجاح.');
          markLessonCompleted(lesson.id);
        }
      } else {
        toast.success('تم إنهاء هذا الجزء بنجاح!');
      }
      closeVideo();
    }
  };

  const closeVideo = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    
    if (playerRef.current) {
      try { playerRef.current.stopVideo(); playerRef.current.destroy(); } catch(e) {}
      playerRef.current = null;
    }
    
    if (videoIntervalRef.current) {
      clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }

    if (celebrationTimeoutRef.current) {
      clearTimeout(celebrationTimeoutRef.current);
      celebrationTimeoutRef.current = null;
    }
    
    setActiveLessonId(null);
  };

  const openExam = (lesson: Lesson) => {
    if (completedLessons.has(lesson.id)) {
      toast.info('لقد اجتزت هذا الاختبار مسبقاً بنجاح!');
      return;
    }

    const videoUrls = lesson.video_url.split(/[,|\s]+/).filter(url => url.trim() !== '');
    let allVideosWatched = true;
    for (let i = 0; i < videoUrls.length; i++) {
      if (!completedVideos.has(`${lesson.id}_${i}`)) {
        allVideosWatched = false;
        break;
      }
    }

    if (!allVideosWatched) {
      toast.error('تنبيه! لا يمكنك الدخول للامتحان قبل الانتهاء من مشاهدة جميع أجزاء فيديوهات الشرح للمحاضرة.');
      return;
    }
    
    setActiveExamLesson(lesson);
    setQuizQuestions(lesson.quizData || []);
    setCurrentQIndex(0);
    setUserAnswers({});
    setTimeRemaining((lesson.quizData?.length || 0) * 60);
    setExamFinished(false);
    setExamScore(0);
    setShowExamModal(true);
    
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) { submitExam(); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const closeExam = () => {
    setShowExamModal(false);
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  const chooseAnswer = (option: string) => setUserAnswers(prev => ({ ...prev, [currentQIndex]: option }));
  const nextQuestion = () => { if (currentQIndex < quizQuestions.length - 1) setCurrentQIndex(prev => prev + 1); };
  const prevQuestion = () => { if (currentQIndex > 0) setCurrentQIndex(prev => prev - 1); };

  const submitExam = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    
    let score = 0;
    for (let i = 0; i < quizQuestions.length; i++) {
      if (userAnswers[i] === quizQuestions[i].correct_option) score++;
    }
    
    const percentage = Math.round((score / quizQuestions.length) * 100);
    setExamScore(percentage);
    setExamFinished(true);
    
    if (percentage >= 50 && activeExamLesson) {
      markLessonCompleted(activeExamLesson.id);
    }
  };

  const markLessonCompleted = async (lessonId: number) => {
    if (completedLessons.has(lessonId)) return;
    
    if (!token) return;
    
    import('canvas-confetti').then(confetti => {
      const duration = 3000; const end = Date.now() + duration;
      const frame = () => {
        confetti.default({ particleCount: 6, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#10b981', '#015669', '#f59e0b'] });
        confetti.default({ particleCount: 6, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#10b981', '#015669', '#f59e0b'] });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();
    });
    
    setCompletedLessons(prev => {
      const newSet = new Set(prev);
      newSet.add(lessonId);
      return newSet;
    });

    try {
      await apiCall('/api/progress', token, 'POST', { lessonId });
    } catch (error) {
      handleApiError(error);
    }
  };

  const handleForceLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_info');
    navigate('/');
    window.location.reload();
  };

  useEffect(() => {
    return () => {
      if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (celebrationTimeoutRef.current) clearTimeout(celebrationTimeoutRef.current);
    };
  }, []);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-page-bg flex flex-col relative" id="top-section" onContextMenu={(e) => e.preventDefault()}>
      
      {/* مودال انتهاء الصلاحية الأنيق */}
      {sessionExpired && (
        <div className="fixed top-0 left-0 w-full h-full bg-slate-900/60 flex justify-center items-center z-[9999] backdrop-blur-sm">
          <div className="bg-white p-8 rounded-3xl w-[90%] max-w-[420px] text-center shadow-[0_20px_60px_rgba(0,0,0,0.2)] animate-fade-in border border-border">
            <div className="w-24 h-24 rounded-full border-[5px] border-orange-100 bg-orange-50 flex items-center justify-center mx-auto mb-6">
              <span className="text-orange-400 text-5xl font-bold">!</span>
            </div>
            <h2 className="text-[22px] text-slate-800 font-bold mb-3">تم انتهاء صلاحية تسجيل دخولك</h2>
            <p className="text-slate-500 mb-8 text-[15px] leading-relaxed">
              في حد دخل على حسابك من جهاز تاني، أو انتهت جلستك. يرجى إعادة تسجيل الدخول لمتابعة التعلم.
            </p>
            <button
              onClick={handleForceLogout}
              className="bg-[#38bdf8] text-white border-none py-3.5 px-8 rounded-xl font-bold text-lg cursor-pointer w-full hover:bg-[#0284c7] transition-all shadow-[0_5px_15px_rgba(56,189,248,0.3)] hover:-translate-y-0.5"
            >
              تسجيل الدخول مجدداً
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white py-4 px-[5%] flex justify-between items-center shadow-[0_4px_20px_rgba(0,0,0,0.04)] sticky top-0 z-[100] border-b-[3px] border-b-primary">
        <Link to="/courses" className="flex items-center gap-2.5 no-underline">
          <img src="/logo.png" alt="شعار المنصة" className="h-10 rounded-lg" />
          <h1 className="text-xl text-primary font-bold">كله بيتعلم</h1>
        </Link>
        <div className="flex items-center gap-2.5 font-bold text-text-main bg-page-bg py-1.5 px-4 pl-1.5 rounded-[30px] border border-border">
          <span>{user.name.split(' ')[0]}</span>
          {user.avatar_url && (
            <img src={user.avatar_url} alt="الصورة الشخصية" className="w-9 h-9 rounded-full border-2 border-primary object-cover" />
          )}
        </div>
      </header>

      {/* Course Hero - دائماً ظاهر */}
      <div className="mx-[5%] my-5 relative">
        <div className="bg-white rounded-2xl overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.03)] flex flex-col relative border border-border">
          <img 
            src={course?.image_url || 'https://via.placeholder.com/1200x400/015669/ffffff?text=جاري+التحميل...'} 
            className="w-full h-[250px] object-cover bg-slate-200"
            alt="غلاف الكورس"
          />
          <div className="p-6 text-center">
            <h2 className="text-[26px] text-primary mb-2.5 font-bold">{course?.title || 'جاري تحميل بيانات الكورس...'}</h2>
            <p className="text-text-muted text-base mb-5">{course?.description || 'دورة تدريبية متميزة'}</p>
            <div className="bg-primary text-white border-none py-3 px-8 rounded-xl text-base font-bold inline-block">
              <i className="fas fa-graduation-cap ml-2"></i> أنت مشترك في هذا الكورس
            </div>
          </div>
        </div>
      </div>

      {/* مشغل الفيديو: يظهر بحجم 16:9 قياسي، ويتحول لتجربة يوتيوب الكاملة في وضع ملء الشاشة */}
      {activeLessonId !== null && (
        <div id="video-player-section" className="mx-[5%] mb-10 flex justify-center animate-fade-in scroll-mt-6">
          <div ref={videoContainerRef} className={`group bg-black rounded-2xl overflow-hidden relative shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex flex-col w-full max-w-[854px] border border-slate-700 ${isFullscreen ? '!max-w-none !w-full !h-full !rounded-none !border-none' : ''}`}>
            
            {/* زر إغلاق الفيديو في الوضع العادي */}
            {!isFullscreen && (
              <button 
                onClick={closeVideo}
                className="absolute top-4 right-4 bg-black/40 hover:bg-red-600 text-white border-none w-[40px] h-[40px] rounded-full text-xl cursor-pointer transition-all z-[30] flex items-center justify-center backdrop-blur-sm"
                title="إغلاق الفيديو"
              >
                <i className="fas fa-xmark"></i>
              </button>
            )}

            {/* منطقة الفيديو 16:9 */}
            <div className={`relative w-full ${isFullscreen ? 'flex-1 h-full' : 'aspect-video'} bg-black flex items-center justify-center`}>
              <div id="player" className="absolute inset-0 w-full h-full pointer-events-none"></div>
              {/* طبقة حماية شفافة لالتقاط نقرات التشغيل/الإيقاف وحماية الفيديو من السرقة */}
              <div className="absolute inset-0 w-full h-full z-10 cursor-pointer" onClick={togglePlayPause}></div>
            </div>
            
            {/* شريط التحكم (يظهر دائمًا في الوضع العادي، ويختفي/يظهر في ملء الشاشة زي يوتيوب) */}
            <div className={`${isFullscreen ? `absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/95 via-black/60 to-transparent pb-6 pt-16 px-8 transition-opacity duration-300 ${isVideoPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}` : 'bg-[#0f172a] p-4 px-6 border-t border-slate-700'} flex flex-col gap-4 flex-shrink-0 z-20`}>
              {/* شريط التقدم */}
              <div className="w-full h-2.5 bg-white/20 rounded-md cursor-pointer relative overflow-hidden transition-all hover:h-3.5" onClick={seekVideo}>
                <div className="h-full bg-primary pointer-events-none transition-all" style={{ width: `${videoDuration ? (currentTime / videoDuration) * 100 : 0}%` }} />
              </div>
              
              {/* أزرار التحكم */}
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-6">
                  <button onClick={() => skipVideo(-10)} className="bg-transparent text-white border-none text-2xl cursor-pointer transition-all hover:text-primary-light hover:scale-110 flex items-center justify-center" title="تأخير 10 ثواني"><i className="fas fa-backward-step"></i></button>
                  <button onClick={togglePlayPause} className="bg-transparent text-primary-light border-none text-[32px] cursor-pointer transition-all hover:scale-110 flex items-center justify-center" title="تشغيل / إيقاف"><i className={`fas ${isVideoPlaying ? 'fa-circle-pause' : 'fa-circle-play'}`}></i></button>
                  <button onClick={() => skipVideo(10)} className="bg-transparent text-white border-none text-2xl cursor-pointer transition-all hover:text-primary-light hover:scale-110 flex items-center justify-center" title="تقديم 10 ثواني"><i className="fas fa-forward-step"></i></button>
                </div>
                
                <div className="flex items-center gap-5">
                  <button onClick={cyclePlaybackRate} className="bg-transparent text-white border border-slate-600 px-3 py-1.5 rounded-lg text-sm font-bold cursor-pointer transition-all hover:bg-slate-700 hover:text-primary-light" title="سرعة التشغيل">{playbackRate}x</button>
                  <div className="text-slate-300 font-bold text-[14px] font-mono tracking-wide" dir="ltr"><span>{formatTime(currentTime)}</span> / <span>{formatTime(videoDuration)}</span></div>
                  <button onClick={toggleFullscreen} className="bg-transparent text-white border-none text-xl cursor-pointer transition-all hover:text-primary-light hover:scale-110 flex items-center justify-center ml-2" title="ملء الشاشة"><i className={`fas ${isFullscreen ? 'fa-compress' : 'fa-expand'}`}></i></button>
                  {isFullscreen && (
                     <button onClick={closeVideo} className="bg-transparent text-red-500 border-none text-2xl cursor-pointer transition-all hover:scale-110 flex items-center justify-center ml-2" title="إغلاق الفيديو"><i className="fas fa-xmark"></i></button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section Header */}
      <div className="text-center my-6 mb-4">
        <h3 className="text-[30px] text-primary relative inline-block font-bold after:content-[''] after:absolute after:-bottom-2.5 after:left-1/2 after:-translate-x-1/2 after:w-[60%] after:h-1 after:bg-border after:rounded-sm">محتوى الكورس</h3>
      </div>

      {/* Accordion Container */}
      <div className="max-w-[800px] mx-auto mb-12 px-[5%] flex flex-col gap-5 w-full">
        {isLoading ? (
          <div className="text-center py-10 text-text-muted">
            <i className="fas fa-circle-notch fa-spin text-[40px] mb-4 block"></i>
            <p>جاري تحميل المحاضرات...</p>
          </div>
        ) : lessons.length === 0 ? (
          <div className="text-center py-10">
            <i className="fas fa-folder-open text-[50px] text-slate-300 mb-4 block"></i>
            <p className="text-lg text-text-muted">المحتوى قيد التجهيز، سيتم إضافة المحاضرات قريباً.</p>
          </div>
        ) : (
          lessons.map((lesson, index) => {
            const { locked, message } = isLessonLocked(lesson, index);
            const isCompleted = completedLessons.has(lesson.id);
            const isExpanded = expandedLesson === lesson.id;
            
            const videoUrls = lesson.video_url.split(/[,|\s]+/).filter(url => url.trim() !== '');
            
            return (
              <div 
                key={lesson.id}
                className={`bg-white rounded-2xl shadow-[0_4px_15px_rgba(0,0,0,0.05)] overflow-hidden transition-all border-2 ${
                  isCompleted ? 'border-success' : locked ? 'border-slate-300 opacity-70' : 'border-transparent hover:-translate-y-0.5 hover:shadow-[0_8px_25px_rgba(0,0,0,0.08)]'
                }`}
              >
                <div 
                  className={`p-6 flex justify-between items-center cursor-pointer transition-all select-none ${
                    isCompleted ? 'bg-success/5' : locked ? 'bg-slate-50 cursor-not-allowed' : 'bg-white'
                  }`}
                  onClick={() => toggleAccordion(lesson.id, index)}
                >
                  <div className="flex flex-col gap-1.5 flex-1 pl-4">
                    <div className="text-2xl font-bold text-text-main flex items-center gap-2.5">
                      <i className={`${locked ? 'fas fa-lock' : 'fas fa-border-all'} ${isCompleted ? 'text-success' : locked ? 'text-text-muted' : 'text-red-500'} text-[35px] ml-4 opacity-80`}></i>
                      المحاضرة {index + 1} {locked && <span className="text-danger text-sm">({lesson.is_admin_locked === 1 ? 'مغلقة من الإدارة' : 'مقفولة تتابعياً'})</span>}
                    </div>
                    <div className="text-[15px] text-text-muted leading-relaxed">{lesson.title}</div>
                  </div>
                  <div className={`bg-page-bg w-10 h-10 rounded-full flex justify-center items-center text-lg text-text-main transition-all ${isExpanded ? 'rotate-180 bg-primary text-white' : ''}`}>
                    <i className="fas fa-chevron-down"></i>
                  </div>
                </div>
                
                <div className={`overflow-hidden transition-all duration-400 ${isExpanded ? 'max-h-[1000px]' : 'max-h-0'}`}>
                  <div className="p-5 flex flex-col gap-4 bg-[#fdfdfd] border-t border-border">
                    {videoUrls.map((vUrl, vIdx) => {
                      const isVideoCompleted = completedVideos.has(`${lesson.id}_${vIdx}`) || isCompleted;
                      const isActiveVideo = activeLessonId === lesson.id && activeVideoIndex === vIdx;
                      
                      return (
                        <div 
                          key={vIdx}
                          onClick={() => locked ? toast.warning(message) : openVideo(lesson, vUrl, vIdx, videoUrls.length)}
                          className={`p-4 px-6 rounded-xl flex justify-between items-center cursor-pointer transition-all hover:-translate-x-1 font-bold text-lg ${
                            isVideoCompleted 
                              ? 'bg-success/10 border border-success/30 text-success' 
                              : isActiveVideo 
                                ? 'bg-primary/10 border border-primary text-primary shadow-[0_5px_15px_rgba(1,86,105,0.15)]'
                                : 'bg-warning/10 border border-warning/30 hover:shadow-[0_5px_15px_rgba(245,158,11,0.15)] text-red-500'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <i className={`${isVideoCompleted ? 'fas fa-circle-check' : isActiveVideo ? 'fas fa-circle-play fa-fade' : 'fas fa-video'} text-2xl`}></i>
                            <span>جزء الشرح والتدريبات{videoUrls.length > 1 ? ` (الجزء ${vIdx + 1})` : ''}</span>
                          </div>
                          <span className="text-sm text-text-main bg-white py-1.5 px-3 rounded-lg border border-border flex items-center gap-1.5">
                            {isVideoCompleted ? 'تمت المشاهدة' : isActiveVideo ? 'يتم العرض الآن' : 'مشاهدة الفيديو'} {isVideoCompleted ? '' : <i className="fas fa-play text-xs"></i>}
                          </span>
                        </div>
                      );
                    })}
                    
                    {lesson.hasQuiz && (
                      <div 
                        onClick={() => locked ? toast.warning(message) : openExam(lesson)}
                        className={`bg-danger/10 border border-danger/30 p-4 px-6 rounded-xl flex justify-between items-center cursor-pointer transition-all hover:-translate-x-1 hover:shadow-[0_5px_15px_rgba(239,68,68,0.15)] font-bold text-red-500 text-lg ${isCompleted ? 'bg-success/10 border-success/30 text-success' : ''}`}
                      >
                        <div className="flex items-center gap-4">
                          <i className={`${isCompleted ? 'fas fa-circle-check' : 'fas fa-file-pen'} text-2xl`}></i>
                          <span>امتحان المحاضرة</span>
                        </div>
                        <span className="text-sm text-text-main bg-white py-1.5 px-3 rounded-lg border border-border flex items-center gap-1.5">
                          {isCompleted ? 'مكتمل' : 'دخول الامتحان'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Exam Modal */}
      {showExamModal && activeExamLesson && (
        <div className="fixed top-0 left-0 w-full h-full bg-slate-50/95 z-[2000] flex flex-col overflow-hidden select-none">
          <div id="anti-cheat-overlay" className="absolute top-0 left-0 w-full h-full bg-black text-white z-[3000] hidden flex-col justify-center items-center text-center p-5" onClick={(e) => { (e.currentTarget as HTMLDivElement).style.display = 'none'; }}>
            <i className="fas fa-shield-halved text-[80px] text-red-500 mb-5"></i>
            <p className="text-2xl font-bold">تنبيه أمني!</p>
            <p className="text-base font-normal mt-2.5 leading-relaxed">تم إخفاء الامتحان لأنك قمت بالخروج من النافذة أو محاولة التقاط الشاشة.<br />يرجى النقر هنا للعودة للامتحان.</p>
          </div>

          <div className="bg-white py-5 px-[5%] flex justify-between items-center border-b border-border shadow-[0_4px_15px_rgba(0,0,0,0.02)]">
            <h2 className="text-primary text-[22px] font-bold"><i className="fas fa-pen-to-square ml-2"></i> اختبار: {activeExamLesson.title}</h2>
            <button onClick={closeExam} className="bg-red-50 text-red-500 border-none py-2.5 px-5 rounded-xl font-bold cursor-pointer flex items-center gap-2 hover:bg-red-500 hover:text-white transition-all"><i className="fas fa-xmark"></i> إغلاق مؤقت</button>
          </div>

          <div className="flex-1 overflow-y-auto py-8 px-[5%] flex flex-col items-center">
            {!examFinished ? (
              <>
                <div className={`text-white py-2.5 px-6 rounded-[30px] font-bold text-xl mb-5 flex items-center gap-2.5 shadow-[0_5px_15px_rgba(239,68,68,0.3)] ${timeRemaining < 30 ? 'bg-red-50 text-red-500 border-2 border-red-500' : 'bg-red-500'}`}>
                  <i className="fas fa-stopwatch"></i> 
                  <span>{Math.floor(timeRemaining / 60).toString().padStart(2, '0')}:{(timeRemaining % 60).toString().padStart(2, '0')}</span>
                </div>
                
                <h3 className="text-text-muted mb-6 text-lg">السؤال <span className="text-primary font-bold text-[22px]">{currentQIndex + 1}</span> من <span>{quizQuestions.length}</span></h3>

                {quizQuestions[currentQIndex]?.image_url && (
                  <img src={quizQuestions[currentQIndex].image_url} alt="سؤال الامتحان" className="max-w-full max-h-[300px] rounded-xl border-2 border-border mb-8 pointer-events-none" />
                )}
                
                <div className="grid grid-cols-1 gap-4 w-full max-w-[600px]">
                  {['A', 'B', 'C', 'D'].map((option) => (
                    <button key={option} onClick={() => chooseAnswer(option)} className={`bg-white border-2 border-border py-4 px-5 rounded-2xl text-lg font-bold cursor-pointer text-right flex items-center gap-4 transition-all text-text-main shadow-[0_4px_10px_rgba(0,0,0,0.02)] hover:border-primary ${userAnswers[currentQIndex] === option ? 'border-primary bg-primary/5 shadow-[0_8px_20px_rgba(1,86,105,0.15)] -translate-y-0.5' : ''}`}>
                      <span className={`w-10 h-10 rounded-full flex justify-center items-center text-primary text-xl flex-shrink-0 ${userAnswers[currentQIndex] === option ? 'bg-primary text-white' : 'bg-page-bg'}`}>
                        {option === 'A' ? 'أ' : option === 'B' ? 'ب' : option === 'C' ? 'ج' : 'د'}
                      </span>
                      <span>{quizQuestions[currentQIndex]?.[`option_${option.toLowerCase()}` as keyof QuizQuestion] as string}</span>
                    </button>
                  ))}
                </div>

                <div className="w-full max-w-[600px] mt-10 flex justify-between">
                  <button onClick={prevQuestion} disabled={currentQIndex === 0} className="bg-white text-text-main border border-border py-4 px-8 rounded-xl font-bold text-base cursor-pointer transition-all flex items-center gap-2.5 shadow-[0_4px_10px_rgba(0,0,0,0.02)] hover:bg-primary/5 hover:text-primary hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed">
                    <i className="fas fa-arrow-right-long"></i> السابق
                  </button>
                  
                  {currentQIndex === quizQuestions.length - 1 ? (
                    <button onClick={submitExam} className="bg-success text-white border-none py-4 px-10 rounded-xl font-bold text-lg cursor-pointer flex items-center gap-2.5 shadow-[0_5px_20px_rgba(16,185,129,0.3)] hover:bg-emerald-600 hover:-translate-y-0.5 transition-all">
                      إنهاء وتصحيح <i className="fas fa-check-double"></i>
                    </button>
                  ) : (
                    <button onClick={nextQuestion} className="bg-white text-text-main border border-border py-4 px-8 rounded-xl font-bold text-base cursor-pointer transition-all flex items-center gap-2.5 shadow-[0_4px_10px_rgba(0,0,0,0.02)] hover:bg-primary/5 hover:text-primary hover:border-primary">
                      التالي <i className="fas fa-arrow-left-long"></i>
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className={`w-[150px] h-[150px] rounded-full flex items-center justify-center text-[50px] font-bold text-white mb-5 shadow-[0_10px_30px_rgba(0,0,0,0.1)] ${examScore >= 50 ? 'bg-success' : 'bg-red-500'}`}>
                  {examScore}%
                </div>
                <div className={`text-[32px] font-bold mb-2.5 ${examScore >= 50 ? 'text-success' : 'text-red-500'}`}>
                  {examScore >= 50 ? 'ممتاز! لقد اجتزت الاختبار بنجاح' : 'للأسف، لم تجتز الاختبار'}
                </div>
                <div className="text-xl text-text-muted mb-10">
                  أجبت بشكل صحيح على {Math.round((examScore / 100) * quizQuestions.length)} من أصل {quizQuestions.length} أسئلة
                </div>
                <button onClick={closeExam} className="bg-primary text-white py-4 px-10 border-none rounded-xl text-lg font-bold cursor-pointer flex items-center gap-2.5 hover:bg-primary/90 transition-all">
                  <i className="fas fa-rotate-left"></i> العودة للمحاضرات
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
