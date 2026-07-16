import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth, apiCall, publicApiCall } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { Course, Lesson, QuizQuestion } from '@/types';

declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string,
        options: {
          videoId: string;
          host?: string;
          playerVars?: Record<string, any>;
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
  const { user, token, isAuthenticated, logout } = useAuth();
  
  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [completedLessons, setCompletedLessons] = useState<Set<number>>(new Set());
  const [completedVideos, setCompletedVideos] = useState<Set<string>>(new Set()); 
  const [expandedLesson, setExpandedLesson] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isUserEnrolled, setIsUserEnrolled] = useState(false);

  // حالات مودال الدفع والاشتراك
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [showEnrollConfirmModal, setShowEnrollConfirmModal] = useState(false);
  const [showPaymentMethodModal, setShowPaymentMethodModal] = useState(false); 
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentReference, setPaymentReference] = useState('');

  // Video Inline State
  const [activeLessonId, setActiveLessonId] = useState<number | null>(null);
  const [activeVideoIndex, setActiveVideoIndex] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // 🛡️ حالة العلامة المائية المتحركة
  const [watermarkPos, setWatermarkPos] = useState({ top: 10, left: 10 });
  
  // 🎛️ حالة شريط التحكم المخصص
  const [isControlsVisible, setIsControlsVisible] = useState(true);

  // Exam Modal State
  const [showExamModal, setShowExamModal] = useState(false);
  const [activeExamLesson, setActiveExamLesson] = useState<Lesson | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [examFinished, setExamFinished] = useState(false);
  const [examScore, setExamScore] = useState(0);
  const [isGrading, setIsGrading] = useState(false); 
  
  const playerRef = useRef<YTPlayer | null>(null);
  const videoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  
  const isVideoEndingRef = useRef(false);
  const videoSavedRef = useRef(false);
  const celebrationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isInitialMount = useRef(true);

  const ytDataRef = useRef<{ lesson: Lesson | null; vIdx: number; vTotal: number }>({
    lesson: null,
    vIdx: 0,
    vTotal: 0
  });
  
  const courseId = searchParams.get('id');

  // معالجة الأخطاء وتنفيذ تسجيل الخروج الفوري عند اكتشاف جهاز آخر
  const handleApiError = useCallback((error: any) => {
    const errorMsg = error?.message || '';
    if (errorMsg.includes('جهاز آخر') || errorMsg.includes('Session') || errorMsg.includes('Unauthorized') || errorMsg.includes('Invalid Token')) {
      if (token) {
        logout();
        setIsUserEnrolled(false);
        toast.error("تم فتح حسابك من جهاز آخر. تم تسجيل الخروج لحماية حسابك.");
      }
    } else {
      console.error(error);
    }
  }, [token, logout]);

  useEffect(() => {
    const verifyAndLoadProgress = async () => {
      if (user && token && courseId) {
        try {
          let enrolled = true;
          if (user.role !== 'admin' && user.role !== 'instructor') {
            const enrolledIds = (await apiCall('/api/my-enrollments', token)) as number[];
            enrolled = enrolledIds.includes(parseInt(courseId as string));
          }
          
          setIsUserEnrolled(enrolled);

          if (enrolled) {
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
          }
        } catch (error) {
          handleApiError(error);
        }
      } else {
        setIsUserEnrolled(false);
      }
    };
    verifyAndLoadProgress();
  }, [user, token, courseId, handleApiError]);

  const saveProgressLocally = useCallback(() => {
    if (user && isUserEnrolled) {
      localStorage.setItem(`progress_${user.id}`, JSON.stringify(Array.from(completedLessons)));
      localStorage.setItem(`video_progress_${user.id}`, JSON.stringify(Array.from(completedVideos)));
    }
  }, [completedLessons, completedVideos, user, isUserEnrolled]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    saveProgressLocally();
  }, [completedLessons, completedVideos, saveProgressLocally]);

  const fetchCourseDetails = useCallback(async () => {
    if (!courseId) return;
    try {
      const courses = (await publicApiCall('/api/courses')) as Course[];
      const foundCourse = courses.find(c => c.id === parseInt(courseId as string));
      if (foundCourse) setCourse(foundCourse);
    } catch (error) {
      handleApiError(error);
    }
  }, [courseId, handleApiError]);

  const fetchLessons = useCallback(async () => {
    if (!courseId) return;
    try {
      const fetcher = token ? (url: string) => apiCall(url, token) : publicApiCall;
      const lessonsData = (await fetcher(`/api/courses/${courseId}/lessons`)) as Lesson[];
      
      const lessonsWithQuiz = await Promise.all(
        lessonsData.map(async (lesson) => {
          try {
            if (token) {
              const quizData = (await apiCall(`/api/lessons/${lesson.id}/quiz`, token)) as QuizQuestion[];
              return { ...lesson, hasQuiz: quizData.length > 0, quizData };
            } else {
              return { ...lesson, hasQuiz: true, quizData: [] };
            }
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
  }, [courseId, token, handleApiError]);

  useEffect(() => {
    if (courseId) {
      fetchCourseDetails();
      fetchLessons();
    }
  }, [courseId, fetchCourseDetails, fetchLessons]);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // 🛡️ تشغيل محرك تحريك العلامة المائية عند فتح الفيديو
  useEffect(() => {
    if (activeLessonId !== null) {
      const interval = setInterval(() => {
        setWatermarkPos({
          top: Math.floor(Math.random() * 80) + 10, 
          left: Math.floor(Math.random() * 70) + 10, 
        });
      }, 4000); 
      return () => clearInterval(interval);
    }
  }, [activeLessonId]);

  // 🎛️ إدارة ظهور واختفاء شريط التحكم
  const handleMouseMove = useCallback(() => {
    setIsControlsVisible(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    
    if (isVideoPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setIsControlsVisible(false);
      }, 1500); // يختفي بعد ثانية ونصف من عدم الحركة
    }
  }, [isVideoPlaying]);

  const handleMouseLeave = useCallback(() => {
    if (isVideoPlaying) {
      setIsControlsVisible(false);
    }
  }, [isVideoPlaying]);

  useEffect(() => {
    if (isVideoPlaying) {
      handleMouseMove();
    } else {
      setIsControlsVisible(true); // يظهر دائماً عند الإيقاف المؤقت
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    }
  }, [isVideoPlaying, handleMouseMove]);

  const handleEnrollClick = () => {
    if (!isAuthenticated) {
      toast.info('يرجى تسجيل الدخول أولاً للاشتراك في هذه الدورة.');
      navigate('/login');
      return;
    }
    if (!token || !course) return;

    if (course.is_free === 1) {
      setShowEnrollConfirmModal(true);
    } else {
      setShowPaymentMethodModal(true);
    }
  };

  const confirmFreeEnrollment = async () => {
    if (!token || !course) return;
    setShowEnrollConfirmModal(false);
    setIsEnrolling(true);

    try {
      await apiCall('/api/enroll', token, 'POST', { course_id: course.id });
      toast.success('تم الاشتراك بنجاح! جاري تحميل المحتوى...');
      setIsUserEnrolled(true);
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch(err: any) {
      toast.error(err.message || 'حدث خطأ أثناء الاشتراك.');
    } finally {
      setIsEnrolling(false);
    }
  };

  const proceedToPayment = async (method: 'card' | 'kiosk') => {
    if (!token || !course) return;
    setShowPaymentMethodModal(false);
    setIsEnrolling(true);

    try {
      const response = await apiCall('/api/paymob/init', token, 'POST', { 
        course_id: course.id,
        method: method 
      }) as any;

      if (method === 'card' && response.iframe_url) {
        window.location.href = response.iframe_url;
      } else if (method === 'kiosk' && response.bill_reference) {
        setPaymentReference(response.bill_reference);
        setShowPaymentModal(true);
      } else {
        throw new Error("لم يتم إرجاع بيانات الدفع من الخادم.");
      }
    } catch(err: any) {
      const errorMsg = err.message || 'حدث خطأ أثناء الاتصال بخدمة الدفع. يرجى المحاولة لاحقاً.';
      toast.error(errorMsg);
    } finally {
      setIsEnrolling(false);
    }
  };

  const isLessonLocked = (lesson: Lesson, index: number): { locked: boolean; message: string } => {
    if (!isAuthenticated || !isUserEnrolled) return { locked: false, message: '' };
    
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
    if (!isAuthenticated) {
      toast.info('يرجى تسجيل الدخول والاشتراك في الكورس لمشاهدة المحاضرات.');
      navigate('/login');
      return;
    }
    if (!isUserEnrolled) {
      toast.error('يرجى الاشتراك في الكورس أولاً لتتمكن من مشاهدة الفيديوهات.');
      return;
    }

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
      host: 'https://www.youtube.com',
      playerVars: { 
        autoplay: 1, 
        controls: 0, 
        disablekb: 1, 
        fs: 0, 
        modestbranding: 1, 
        rel: 0, 
        showinfo: 0, 
        iv_load_policy: 3,
        playsinline: 1,
        origin: window.location.origin 
      },
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

          if (duration > 0 && current > 0 && (duration - current <= 10)) {
            if (!videoSavedRef.current) {
              videoSavedRef.current = true;
              silentSaveVideoProgress();
              
              celebrationTimeoutRef.current = setTimeout(() => {
                handleVideoCelebration();
              }, 11000);
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
    if (!isAuthenticated) {
      toast.info('يرجى تسجيل الدخول والاشتراك في الكورس لفتح الامتحان.');
      navigate('/login');
      return;
    }
    if (!isUserEnrolled) {
      toast.error('يرجى الاشتراك في الكورس أولاً لفتح الامتحان.');
      return;
    }

    if (completedLessons.has(lesson.id)) {
      toast.info('لقد اجتزت هذا الاختبار مسبقاً بنجاح!');
      return;
    }

    const videoUrls = lesson.video_url ? lesson.video_url.split(/[,|\s]+/).filter(url => url.trim() !== '') : [];
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
    setTimeRemaining((lesson.quizData?.length || 0) * 180);
    setExamFinished(false);
    setExamScore(0);
    setIsGrading(false);
    setShowExamModal(true);
    
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setTimeRemaining(prev => (prev > 0 ? prev - 1 : 0));
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

  const submitExam = async () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    
    setIsGrading(true);

    const formattedAnswers = quizQuestions.map((q, index) => ({
      question_id: q.id,
      chosen_option: userAnswers[index] || null
    }));

    if (token && activeExamLesson) {
      try {
        const response = await apiCall('/api/progress/quiz', token, 'POST', {
          lessonId: activeExamLesson.id,
          answers: formattedAnswers
        }) as any;

        if (response.status === 'queued') {
          toast.success(response.message || 'استلمنا إجاباتك ⏱️. نظراً للضغط الحالي، جاري تصحيح ورقتك وسجلناها في النظام. النتيجة هتظهر في ملفك الشخصي خلال دقايق.', {
            duration: 8000,
          });
          closeExam(); 
          return; 
        }

        const serverScore = response.score || 0;
        setExamScore(serverScore);
        setExamFinished(true);

        if (serverScore >= 50) {
          markLessonCompleted(activeExamLesson.id);
        }
      } catch (error) {
        console.error('Failed to submit quiz:', error);
        toast.error('حدث خطأ أثناء تصحيح الامتحان. يرجى المحاولة مرة أخرى.');
        closeExam(); 
      } finally {
        setIsGrading(false);
      }
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

  useEffect(() => {
    return () => {
      if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      if (celebrationTimeoutRef.current) clearTimeout(celebrationTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (showExamModal && !examFinished && timeRemaining === 0 && !isGrading) {
      submitExam();
    }
  }, [timeRemaining, showExamModal, examFinished, isGrading]);

  useEffect(() => {
    const handleBlur = () => {
      if (showExamModal && !examFinished) {
        const overlay = document.getElementById('anti-cheat-overlay');
        if (overlay) overlay.style.display = 'flex';
      }
    };
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [showExamModal, examFinished]);

  // 💡 استخراج البيانات الديناميكية (Metadata) من الكورس إن وجدت لعرضها كشارات
  let courseSettings: any = {};
  try {
    if ((course as any)?.metadata) {
      courseSettings = JSON.parse((course as any).metadata);
    }
  } catch (e) {
  }

  return (
    <div className="min-h-screen bg-white flex flex-col relative" id="top-section" onContextMenu={(e) => e.preventDefault()}>

      {/* Header */}
      <header className="bg-white py-4 px-[5%] flex justify-between items-center shadow-[0_4px_20px_rgba(0,0,0,0.04)] sticky top-0 z-[100] border-b-[3px] border-b-primary">
        <Link to="/courses" className="flex items-center gap-2.5 no-underline">
          <img src="/logo.png" alt="شعار المنصة" className="h-10 rounded-lg" />
          <h1 className="text-xl text-primary font-bold">كله بيتعلم</h1>
        </Link>
        <div className="flex items-center gap-3 md:gap-4">
          {isAuthenticated && user ? (
            <div className="flex items-center gap-2.5 font-bold text-text-main bg-slate-50 py-1.5 px-4 pl-1.5 rounded-[30px] border border-border">
              <span>{user.name.split(' ')[0]}</span>
              {user.avatar_url && (
                <img src={user.avatar_url} alt="الصورة الشخصية" className="w-9 h-9 rounded-full border-2 border-primary object-cover" />
              )}
            </div>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="bg-primary text-white py-2 px-6 rounded-xl font-bold transition-all hover:bg-primary/90 flex items-center gap-2"
            >
              <i className="fas fa-sign-in-alt" /> سجّل دخولك
            </button>
          )}
        </div>
      </header>

      {/* Course Hero - تم تحويل الخلفية لتأخذ اللون الأساسي (Primary) */}
      <div className="mx-[5%] my-8 relative">
        <div className="bg-primary rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row relative border-0 min-h-[350px]">
          
          {/* خلفية بنقش خفيف */}
          <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.5) 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>

          {/* قسم النصوص (يظهر على اليمين في الشاشات الكبيرة) */}
          <div className="p-8 md:p-12 lg:p-16 flex-1 text-center md:text-right flex flex-col justify-center text-white z-10 order-2 md:order-1">
            <h2 className="text-[28px] md:text-[40px] font-extrabold mb-4 drop-shadow-sm">{course?.title || 'جاري تحميل بيانات الكورس...'}</h2>
            <p className="text-white/90 text-lg md:text-xl mb-8 leading-relaxed max-w-2xl">{course?.description || 'دورة تدريبية متميزة'}</p>
            
            {/* الشارات (Tags) */}
            {(courseSettings.level || courseSettings.language || courseSettings.badge) && (
              <div className="flex flex-wrap justify-center md:justify-start items-center gap-3 mb-8">
                {courseSettings.level && (
                   <span className="bg-white/20 text-white backdrop-blur-sm border border-white/30 px-4 py-1.5 rounded-lg text-sm font-bold">
                     <i className="fas fa-layer-group ml-1.5"></i> {courseSettings.level}
                   </span>
                )}
                {courseSettings.language && (
                   <span className="bg-white/20 text-white backdrop-blur-sm border border-white/30 px-4 py-1.5 rounded-lg text-sm font-bold">
                     <i className="fas fa-language ml-1.5"></i> {courseSettings.language}
                   </span>
                )}
                {courseSettings.badge && (
                   <span className="bg-orange-500 text-white border border-orange-400 px-4 py-1.5 rounded-lg text-sm font-bold animate-pulse shadow-md">
                     <i className="fas fa-star ml-1.5"></i> {courseSettings.badge}
                   </span>
                )}
              </div>
            )}

            <div className="flex flex-wrap justify-center md:justify-start items-center gap-4">
              {/* زر الاشتراك أو الشراء إذا لم يكن مشتركاً */}
              {isUserEnrolled ? (
                <div className="bg-white/20 text-white backdrop-blur-sm border border-white/30 py-3.5 px-8 rounded-xl text-lg font-bold inline-block shadow-lg">
                  <i className="fas fa-graduation-cap ml-2"></i> أنت مشترك في هذا الكورس
                </div>
              ) : (
                <button 
                  onClick={handleEnrollClick}
                  disabled={isEnrolling}
                  className="bg-white text-primary border-none py-3.5 px-10 rounded-xl text-lg font-extrabold inline-flex items-center gap-2 cursor-pointer hover:bg-gray-50 transition-all shadow-xl hover:-translate-y-1 disabled:opacity-50"
                >
                  {isEnrolling ? <i className="fas fa-circle-notch fa-spin" /> : <i className="fas fa-cart-plus" />} 
                  {isEnrolling ? 'جاري التجهيز...' : `اشترك الآن ${course?.is_free === 1 ? '(مجاناً)' : `(${course?.price || 0} ج.م)`}`}
                </button>
              )}
              
              {/* زر التواصل مع المحاضر */}
              {course?.instructor_contact && (
                isUserEnrolled ? (
                  <a 
                    href={course.instructor_contact} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="bg-[#25D366] text-white border-none py-3.5 px-8 rounded-xl text-lg font-bold inline-flex items-center gap-2 transition-all hover:bg-[#1ebe57] hover:-translate-y-1 shadow-lg no-underline"
                    title="تواصل مع المحاضر للاستفسارات"
                  >
                    <i className="fab fa-whatsapp text-xl"></i> تواصل مع المحاضر
                  </a>
                ) : (
                  <button 
                    onClick={() => toast.info('يجب الاشتراك في الكورس أولاً لتتمكن من التواصل مع المحاضر.')}
                    className="bg-white/10 text-white/50 border border-white/20 py-3.5 px-8 rounded-xl text-lg font-bold inline-flex items-center gap-2 transition-all cursor-not-allowed"
                    title="مغلق للمشتركين فقط"
                  >
                    <i className="fas fa-lock text-xl"></i> تواصل مع المحاضر
                  </button>
                )
              )}
            </div>
          </div>

          {/* قسم الصورة (يظهر على اليسار في الشاشات الكبيرة) */}
          <div className="w-full md:w-[45%] lg:w-[40%] p-6 md:p-8 flex items-center justify-center order-1 md:order-2 z-10">
            <div className="relative w-full max-w-[450px] aspect-[4/3] rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.3)] border-4 border-white/30 transform hover:scale-105 transition-transform duration-500 bg-white">
              <img 
                src={course?.image_url || 'https://via.placeholder.com/1200x400/015669/ffffff?text=جاري+التحميل...'} 
                className="w-full h-full object-cover absolute inset-0"
                alt="غلاف الكورس"
              />
            </div>
          </div>

        </div>
      </div>

      {/* مشغل الفيديو - عرض الفيديو بحجمه الطبيعي بدون قص */}
      {activeLessonId !== null && (
        <div id="video-player-section" className="mx-[5%] mb-12 flex justify-center animate-fade-in scroll-mt-20">
          <div 
            ref={videoContainerRef} 
            className={`group bg-black rounded-3xl overflow-hidden relative shadow-[0_30px_60px_rgba(0,0,0,0.4)] flex flex-col w-full max-w-[1000px] border border-slate-800 ${isFullscreen ? '!max-w-none !w-full !h-full !rounded-none !border-none' : ''}`}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={handleMouseMove}
          >
            
            {/* زر الإغلاق المدمج مع شريط التحكم للظهور والاختفاء معاً */}
            {!isFullscreen && (
              <button 
                onClick={closeVideo}
                className={`absolute top-5 right-5 bg-black/50 hover:bg-red-600 text-white border-none w-11 h-11 rounded-full text-xl cursor-pointer transition-all duration-300 z-[40] flex items-center justify-center backdrop-blur-md ${isControlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}`}
                title="إغلاق الفيديو"
              >
                <i className="fas fa-xmark"></i>
              </button>
            )}

            <div className={`relative w-full ${isFullscreen ? 'h-full' : 'aspect-video'} bg-black flex items-center justify-center overflow-hidden`}>
              {/* عرض الفيديو بحجمه الطبيعي بدون قص أو تكبير */}
              <div key={`${activeLessonId}-${activeVideoIndex}`} id="player" className="absolute inset-0 w-full h-full pointer-events-none"></div>
              
              {/* 🛡️ العلامة المائية */}
              <div 
                className="absolute text-red-500/20 text-sm md:text-base lg:text-lg font-bold pointer-events-none select-none z-[15] transition-all duration-[4000ms] ease-in-out whitespace-nowrap"
                style={{ top: `${watermarkPos.top}%`, left: `${watermarkPos.left}%`, textShadow: '1px 1px 2px rgba(0,0,0,0.1)' }}
              >
                {user?.email || 'زائر'}
              </div>

              {/* طبقة حماية قوية جداً (pointer-events-auto) تمنع نهائياً التفاعل مع يوتيوب من خلفها */}
              <div className="absolute inset-0 w-full h-full z-20 cursor-pointer" onClick={togglePlayPause}></div>

              {/* شريط التحكم المخصص (Overlay) */}
              <div className={`absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/95 via-black/60 to-transparent pb-6 pt-24 px-6 md:px-8 flex flex-col gap-4 z-30 transition-all duration-500 ease-in-out ${isControlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
                
                <div className="w-full h-2 bg-white/20 rounded-full cursor-pointer relative overflow-hidden transition-all hover:h-3" onClick={seekVideo}>
                  <div className="h-full bg-primary rounded-full pointer-events-none transition-all duration-150" style={{ width: `${videoDuration ? (currentTime / videoDuration) * 100 : 0}%` }} />
                </div>
                
                <div className="flex justify-between items-center mt-2">
                  <div className="flex items-center gap-6">
                    <button onClick={() => skipVideo(-10)} className="bg-transparent text-white border-none text-2xl cursor-pointer transition-transform hover:scale-110 flex items-center justify-center" title="تأخير 10 ثواني"><i className="fas fa-backward-step"></i></button>
                    <button onClick={togglePlayPause} className="bg-transparent text-white border-none text-[36px] cursor-pointer transition-transform hover:scale-110 flex items-center justify-center text-primary" title="تشغيل / إيقاف"><i className={`fas ${isVideoPlaying ? 'fa-circle-pause' : 'fa-circle-play'}`}></i></button>
                    <button onClick={() => skipVideo(10)} className="bg-transparent text-white border-none text-2xl cursor-pointer transition-transform hover:scale-110 flex items-center justify-center" title="تقديم 10 ثواني"><i className="fas fa-forward-step"></i></button>
                  </div>
                  
                  <div className="flex items-center gap-5">
                    <button onClick={cyclePlaybackRate} className="bg-white/10 text-white border border-white/20 px-3 py-1.5 rounded-lg text-sm font-bold cursor-pointer transition-all hover:bg-white hover:text-black" title="سرعة التشغيل">{playbackRate}x</button>
                    <div className="text-slate-200 font-bold text-[14px] font-mono tracking-wide" dir="ltr"><span>{formatTime(currentTime)}</span> / <span>{formatTime(videoDuration)}</span></div>
                    <button onClick={toggleFullscreen} className="bg-transparent text-white border-none text-xl cursor-pointer transition-transform hover:scale-110 flex items-center justify-center ml-2" title="ملء الشاشة"><i className={`fas ${isFullscreen ? 'fa-compress' : 'fa-expand'}`}></i></button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section Header */}
      <div className="text-center my-6 mb-8">
        <h3 className="text-[34px] text-primary relative inline-block font-extrabold after:content-[''] after:absolute after:-bottom-3 after:left-1/2 after:-translate-x-1/2 after:w-[60%] after:h-1.5 after:bg-border after:rounded-full">محتوى الكورس</h3>
      </div>

      {/* Accordion Container - تم تعريض مساحته بالكامل ليكون بعرض الصفحة على الكمبيوتر واللابتوب */}
      <div className="w-full max-w-[1200px] mx-auto mb-16 px-[5%] flex flex-col gap-5">
        {isLoading ? (
          <div className="text-center py-12 text-text-muted">
            <i className="fas fa-circle-notch fa-spin text-[50px] mb-4 block text-primary/50"></i>
            <p className="text-lg">جاري تحميل المحاضرات...</p>
          </div>
        ) : lessons.length === 0 ? (
          <div className="text-center py-12">
            <i className="fas fa-folder-open text-[60px] text-slate-300 mb-4 block"></i>
            <p className="text-xl text-text-muted">المحتوى قيد التجهيز، سيتم إضافة المحاضرات قريباً.</p>
          </div>
        ) : (
          lessons.map((lesson, index) => {
            const { locked, message } = isLessonLocked(lesson, index);
            const isCompleted = completedLessons.has(lesson.id);
            const isExpanded = expandedLesson === lesson.id;
            
            const displayVideoUrls = lesson.video_url ? lesson.video_url.split(/[,|\s]+/).filter(url => url.trim() !== '') : [];
            
            return (
              <div 
                key={lesson.id}
                className={`bg-white rounded-2xl shadow-sm transition-all duration-300 overflow-hidden border-2 ${
                  isCompleted ? 'border-success' : locked && isUserEnrolled ? 'border-slate-200 opacity-75' : 'border-primary'
                }`}
              >
                <div 
                  className={`p-6 md:p-8 flex justify-between items-center cursor-pointer select-none ${
                    isCompleted ? 'bg-success/5' : locked && isUserEnrolled ? 'bg-slate-50 cursor-not-allowed' : 'bg-white'
                  }`}
                  onClick={() => toggleAccordion(lesson.id, index)}
                >
                  <div className="flex items-center gap-5 md:gap-6 flex-1">
                    <div className="hidden md:flex text-red-500/90 text-[38px]">
                       <i className="fas fa-border-all"></i>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <h3 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-3 m-0">
                        {lesson.title} {locked && isUserEnrolled && <i className="fas fa-lock text-sm text-slate-400"></i>} {isCompleted && <i className="fas fa-circle-check text-success text-xl"></i>}
                      </h3>
                      <p className="text-sm md:text-base text-slate-500 m-0">
                        {locked && isUserEnrolled ? (lesson.is_admin_locked === 1 ? 'هذه المحاضرة مغلقة مؤقتاً من الإدارة.' : 'يجب إنهاء المحاضرة السابقة أولاً.') : 'شاهد الفيديوهات، استوعب الشرح، ثم اختبر نفسك لتأكيد الفهم.'}
                      </p>
                    </div>
                  </div>
                  <div className={`text-2xl text-slate-400 transition-transform duration-300 ml-2 ${isExpanded ? 'rotate-180 text-primary' : ''}`}>
                    <i className="fas fa-chevron-down"></i>
                  </div>
                </div>
                
                <div className={`overflow-hidden transition-all duration-400 ease-in-out ${isExpanded ? 'max-h-[1500px] opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="p-6 md:p-8 pt-0 flex flex-col gap-4">
                    
                    {/* فاصل جمالي */}
                    <div className="w-full h-px bg-slate-100 mb-2"></div>

                    {displayVideoUrls.length === 0 && !lesson.hasQuiz && (
                      <div className="text-center py-8 text-slate-400 font-bold bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        <i className="fas fa-person-digging text-3xl mb-3 block text-slate-300"></i>
                        جاري تجهيز محتوى هذه المحاضرة
                      </div>
                    )}

                    {displayVideoUrls.map((vUrl, vIdx) => {
                      const isVideoCompleted = isUserEnrolled && (completedVideos.has(`${lesson.id}_${vIdx}`) || isCompleted);
                      const isActiveVideo = isUserEnrolled && (ytDataRef.current.lesson?.id === lesson.id && ytDataRef.current.vIdx === vIdx && activeLessonId !== null);
                      
                      return (
                        <div 
                          key={vIdx}
                          onClick={() => !isAuthenticated ? toast.info('يرجى تسجيل الدخول والاشتراك لمشاهدة المحاضرات.') : !isUserEnrolled ? toast.warning('يرجى الاشتراك في الكورس لمشاهدة المحاضرات.') : locked ? toast.warning(message) : openVideo(lesson, vUrl, vIdx, displayVideoUrls.length)}
                          className={`p-4 px-6 rounded-xl flex justify-between items-center cursor-pointer transition-all hover:-translate-x-1 font-bold text-lg ${
                            !isUserEnrolled 
                              ? 'bg-slate-100 border border-slate-200 text-slate-500'
                              : isVideoCompleted 
                                ? 'bg-success/10 border border-success/30 text-success' 
                                : isActiveVideo 
                                  ? 'bg-primary/10 border border-primary text-primary shadow-[0_5px_15px_rgba(1,86,105,0.15)]'
                                  : 'bg-warning/10 border border-warning/30 hover:shadow-[0_5px_15px_rgba(245,158,11,0.15)] text-red-500'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <i className={`${!isUserEnrolled ? 'fas fa-lock' : isVideoCompleted ? 'fas fa-circle-check' : isActiveVideo ? 'fas fa-circle-play fa-fade' : 'fas fa-video'} text-2xl`}></i>
                            <span>جزء الشرح والتدريبات{displayVideoUrls.length > 1 ? ` (الجزء ${vIdx + 1})` : ''}</span>
                          </div>
                          <span className="text-sm text-text-main bg-white py-1.5 px-3 rounded-lg border border-border flex items-center gap-1.5 shadow-sm">
                            {!isUserEnrolled ? 'مغلق للمشتركين' : isVideoCompleted ? 'تمت المشاهدة' : isActiveVideo ? 'يتم العرض الآن' : 'مشاهدة الفيديو'} 
                            {isUserEnrolled && !isVideoCompleted && <i className="fas fa-play text-xs"></i>}
                          </span>
                        </div>
                      );
                    })}
                    
                    {lesson.hasQuiz && (
                      <div 
                        onClick={() => !isAuthenticated ? toast.info('يرجى تسجيل الدخول والاشتراك لفتح الامتحان.') : !isUserEnrolled ? toast.warning('يرجى الاشتراك في الكورس لفتح الامتحان.') : locked ? toast.warning(message) : openExam(lesson)}
                        className={`p-4 px-6 rounded-xl flex justify-between items-center cursor-pointer transition-all hover:-translate-x-1 font-bold text-lg ${
                          !isUserEnrolled ? 'bg-slate-100 border border-slate-200 text-slate-500' :
                          isCompleted ? 'bg-success/10 border border-success/30 text-success' :
                          'bg-danger/10 border border-danger/30 hover:shadow-[0_5px_15px_rgba(239,68,68,0.15)] text-red-500'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <i className={`${!isUserEnrolled ? 'fas fa-lock' : isCompleted ? 'fas fa-circle-check' : 'fas fa-file-pen'} text-2xl`}></i>
                          <span>امتحان المحاضرة</span>
                        </div>
                        <span className="text-sm text-text-main bg-white py-1.5 px-3 rounded-lg border border-border flex items-center gap-1.5 shadow-sm">
                          {!isUserEnrolled ? 'مغلق للمشتركين' : isCompleted ? 'مكتمل' : 'دخول الامتحان'}
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

      {/* ============================================================ */}
      {/* 🛡️ Modal تأكيد الاشتراك (للكورسات المجانية فقط)                */}
      {/* ============================================================ */}
      {showEnrollConfirmModal && course && (
        <div className="fixed inset-0 bg-slate-900/60 flex justify-center items-center z-[9999] backdrop-blur-sm px-4">
          <div className="bg-white p-8 rounded-[24px] w-full max-w-[400px] text-center shadow-[0_20px_60px_rgba(0,0,0,0.2)] animate-fade-in border border-border relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-primary" />
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-5 text-primary text-[32px]">
              <i className="fas fa-shopping-cart" />
            </div>
            <h2 className="text-[22px] text-slate-800 font-bold mb-3">تأكيد الاشتراك المجاني</h2>
            <p className="text-text-muted mb-8 text-[15px] leading-relaxed px-2">
              هل أنت متأكد من رغبتك في الاشتراك في هذا الكورس مجاناً؟
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setShowEnrollConfirmModal(false)}
                className="flex-1 bg-slate-100 text-slate-700 py-3.5 rounded-xl font-bold text-base cursor-pointer hover:bg-slate-200 transition-all"
              >
                إلغاء
              </button>
              <button
                onClick={confirmFreeEnrollment}
                disabled={isEnrolling}
                className="flex-1 bg-primary text-white border-none py-3.5 rounded-xl font-bold text-base cursor-pointer hover:bg-primary/90 transition-all shadow-[0_5px_15px_rgba(1,86,105,0.2)] hover:-translate-y-0.5 disabled:opacity-50"
              >
                {isEnrolling ? 'جاري...' : 'تأكيد'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 🛡️ Modal اختيار طريقة الدفع (للكورسات المدفوعة)                */}
      {/* ============================================================ */}
      {showPaymentMethodModal && course && (
        <div className="fixed inset-0 bg-slate-900/60 flex justify-center items-center z-[9999] backdrop-blur-sm px-4">
          <div className="bg-white p-8 rounded-[24px] w-full max-w-[450px] text-center shadow-[0_20px_60px_rgba(0,0,0,0.2)] animate-fade-in border border-border relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-primary" />
            <h2 className="text-[22px] text-slate-800 font-bold mb-3">اختر طريقة الدفع</h2>
            <p className="text-text-muted mb-8 text-[15px] leading-relaxed px-2">
              للاشتراك في الكورس بقيمة <strong className="text-primary">{course.price} ج.م</strong>، يرجى اختيار الطريقة الأنسب لك:
            </p>
            
            <div className="flex flex-col gap-4">
              <button 
                onClick={() => proceedToPayment('card')} 
                disabled={isEnrolling}
                className="w-full bg-[#015669] text-white border-none py-4 rounded-xl font-bold text-lg cursor-pointer hover:bg-[#014150] transition-all flex items-center justify-center gap-3 shadow-md hover:-translate-y-0.5 disabled:opacity-50"
              >
                <i className="fas fa-credit-card text-2xl" /> الدفع بالبطاقة (فيزا / ماستركارد)
              </button>
              
              <button 
                onClick={() => proceedToPayment('kiosk')} 
                disabled={isEnrolling}
                className="w-full bg-[#f59e0b] text-white border-none py-4 rounded-xl font-bold text-lg cursor-pointer hover:bg-[#d97706] transition-all flex items-center justify-center gap-3 shadow-md hover:-translate-y-0.5 disabled:opacity-50"
              >
                <i className="fas fa-store text-2xl" /> الدفع كاش (فوري / أمان / محافظ)
              </button>
              
              <button 
                onClick={() => setShowPaymentMethodModal(false)} 
                disabled={isEnrolling}
                className="w-full bg-slate-100 text-slate-700 mt-2 py-3 rounded-xl font-bold text-base cursor-pointer hover:bg-slate-200 transition-all disabled:opacity-50"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 🛡️ Modal عرض كود فوري (بعد اختيار الدفع الكاش)                  */}
      {/* ============================================================ */}
      {showPaymentModal && paymentReference && (
        <div className="fixed inset-0 bg-slate-900/60 flex justify-center items-center z-[9999] backdrop-blur-sm px-4">
          <div className="bg-white p-8 rounded-[24px] w-full max-w-[480px] text-center shadow-[0_20px_60px_rgba(0,0,0,0.2)] animate-fade-in border border-border relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-amber-500" />
            <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-5 text-amber-500 text-[32px]">
              <i className="fas fa-file-invoice-dollar" />
            </div>
            <h2 className="text-[24px] text-slate-800 font-bold mb-2">كود الدفع (بيموب / فوري)</h2>
            <p className="text-text-muted mb-6 text-[15px]">يرجى التوجه لأي منفذ فوري أو أمان واطلب الدفع لخدمة (بيموب / Paymob) باستخدام هذا الكود المرجعي.</p>
            
            <div className="bg-slate-100 border-2 border-dashed border-slate-300 rounded-2xl p-5 mb-6">
              <span className="text-4xl font-black text-primary tracking-widest">{paymentReference}</span>
            </div>

            <div className="flex flex-col gap-3 mb-8 text-right">
              <div className="bg-blue-50 text-blue-700 p-4 rounded-xl text-sm font-bold flex items-start gap-3 border border-blue-100">
                <i className="fas fa-info-circle mt-1 text-lg flex-shrink-0" />
                <p className="m-0 leading-relaxed">
                  الكود صالح لمدة 24 ساعة فقط. يمكنك الدفع عبر أي ماكينة فوري، أمان، مصاري، أو من خلال المحافظ الإلكترونية (كود خدمة بيموب).
                </p>
              </div>
              <div className="bg-amber-50 text-amber-700 p-4 rounded-xl text-[13px] font-bold flex items-start gap-3 border border-amber-100">
                 <i className="fas fa-clock mt-0.5 text-base flex-shrink-0" />
                 <p className="m-0 leading-relaxed">
                   ملاحظة هامة: بعد إتمام الدفع، قد تستغرق العملية من 5 إلى 30 دقيقة لتسميع البيانات في سيرفراتنا. بمجرد التأكيد، سيتحول الكورس إلى "تم الاشتراك بنجاح" ويمكنك متابعة التعلم فوراً عند تحديث الصفحة.
                 </p>
              </div>
            </div>

            <button
              onClick={() => setShowPaymentModal(false)}
              className="w-full bg-primary text-white border-none py-4 rounded-xl font-bold text-lg cursor-pointer hover:bg-primary/90 transition-all shadow-[0_5px_15px_rgba(1,86,105,0.2)] hover:-translate-y-0.5"
            >
              حسناً، فهمت
            </button>
          </div>
        </div>
      )}

      {/* Exam Modal */}
      {showExamModal && activeExamLesson && isUserEnrolled && (
        <div className="fixed top-0 left-0 w-full h-full bg-slate-50/95 z-[2000] flex flex-col overflow-hidden select-none">
          <div id="anti-cheat-overlay" className="absolute top-0 left-0 w-full h-full bg-black text-white z-[3000] hidden flex-col justify-center items-center text-center p-5" onClick={(e) => { (e.currentTarget as HTMLDivElement).style.display = 'none'; }}>
            <i className="fas fa-shield-halved text-[80px] text-red-500 mb-5"></i>
            <p className="text-2xl font-bold">تنبيه أمني!</p>
            <p className="text-base font-normal mt-2.5 leading-relaxed">تم إخفاء الامتحان لأنك قمت بالخروج من النافذة أو محاولة التقاط الشاشة.<br />يرجى النقر هنا للعودة للامتحان.</p>
          </div>

          <div className="bg-white py-5 px-[5%] flex justify-between items-center border-b border-border shadow-[0_4px_15px_rgba(0,0,0,0.02)]">
            <h2 className="text-primary text-[22px] font-bold"><i className="fas fa-pen-to-square ml-2"></i> اختبار: {activeExamLesson.title}</h2>
            <button onClick={closeExam} disabled={isGrading} className="bg-red-50 text-red-500 border-none py-2.5 px-5 rounded-xl font-bold cursor-pointer flex items-center gap-2 hover:bg-red-50 hover:text-white transition-all disabled:opacity-50"><i className="fas fa-xmark"></i> إغلاق مؤقت</button>
          </div>

          <div className="flex-1 overflow-y-auto py-8 px-[5%] flex flex-col items-center">
            {isGrading ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <i className="fas fa-spinner fa-spin text-6xl text-primary mb-4"></i>
                <h3 className="text-2xl font-bold text-text-main">جاري تصحيح إجاباتك...</h3>
                <p className="text-text-muted mt-2">يرجى الانتظار لحظات</p>
              </div>
            ) : !examFinished ? (
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
                  {(() => {
                    const currentQ = quizQuestions[currentQIndex];
                    const isTrueFalse = (currentQ as any)?.type === 'true_false' || (!currentQ?.option_c && !currentQ?.option_d);
                    const optionsList = isTrueFalse ? ['A', 'B'] : ['A', 'B', 'C', 'D'];

                    return optionsList.map((option) => (
                      <button key={option} onClick={() => chooseAnswer(option)} className={`bg-white border-2 border-border py-4 px-5 rounded-2xl text-lg font-bold cursor-pointer text-right flex items-center gap-4 transition-all text-text-main shadow-[0_4px_10px_rgba(0,0,0,0.02)] hover:border-primary ${userAnswers[currentQIndex] === option ? 'border-primary bg-primary/5 shadow-[0_8px_20px_rgba(1,86,105,0.15)] -translate-y-0.5' : ''}`}>
                        <span className={`w-10 h-10 rounded-full flex justify-center items-center text-primary text-xl flex-shrink-0 ${userAnswers[currentQIndex] === option ? 'bg-primary text-white' : 'bg-page-bg'}`}>
                          {option === 'A' ? 'أ' : option === 'B' ? 'ب' : option === 'C' ? 'ج' : 'د'}
                        </span>
                        <span>{quizQuestions[currentQIndex]?.[`option_${option.toLowerCase()}` as keyof QuizQuestion] as string}</span>
                      </button>
                    ));
                  })()}
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
