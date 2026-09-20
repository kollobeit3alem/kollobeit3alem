import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, apiCall, publicApiCall } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { Course, Lesson, QuizQuestion } from '@/types';
import { SiteHeader, PageFooter, KbModal, Spinner, EmptyState } from '@/components/kb/shared';

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

  // 🎯 حالة العلامة المائية المتحركة
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
    vTotal: 0,
  });

  const courseId = searchParams.get('id');

  // معالجة الأخطاء وتنفيذ تسجيل الخروج الفوري عند اكتشاف جهاز آخر
  const handleApiError = useCallback(
    (error: any) => {
      const errorMsg = error?.message || '';
      if (
        errorMsg.includes('جهاز آخر') ||
        errorMsg.includes('Session') ||
        errorMsg.includes('Unauthorized') ||
        errorMsg.includes('Invalid Token')
      ) {
        if (token) {
          logout();
          setIsUserEnrolled(false);
          toast.error('تم فتح حسابك من جهاز آخر. تم تسجيل الخروج لحماية حسابك.');
        }
      } else {
        console.error(error);
      }
    },
    [token, logout],
  );

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
        lessonsData.map(async lesson => {
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
        }),
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

  // 🎯 تشغيل محرك تحريك العلامة المائية عند فتح الفيديو
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
      }, 1500);
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
      setIsControlsVisible(true);
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
    } catch (err: any) {
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
      const response = (await apiCall('/api/paymob/init', token, 'POST', {
        course_id: course.id,
        method: method,
      })) as any;

      if (method === 'card' && response.iframe_url) {
        window.location.href = response.iframe_url;
      } else if (method === 'kiosk' && response.bill_reference) {
        setPaymentReference(response.bill_reference);
        setShowPaymentModal(true);
      } else {
        throw new Error('لم يتم إرجاع بيانات الدفع من الخادم.');
      }
    } catch (err: any) {
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
      try {
        playerRef.current.destroy();
      } catch (e) {}
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
        origin: window.location.origin,
      },
      events: {
        onReady: event => {
          event.target.playVideo();
          event.target.setPlaybackRate(1);
        },
        onStateChange: event => handlePlayerStateChange(event.data),
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
      videoKey: videoKey,
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

          if (duration > 0 && current > 0 && duration - current <= 10) {
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
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
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
        colors: ['#10b981', '#015669', '#f59e0b', '#38bdf8'],
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
      try {
        playerRef.current.stopVideo();
        playerRef.current.destroy();
      } catch (e) {}
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
  const nextQuestion = () => {
    if (currentQIndex < quizQuestions.length - 1) setCurrentQIndex(prev => prev + 1);
  };
  const prevQuestion = () => {
    if (currentQIndex > 0) setCurrentQIndex(prev => prev - 1);
  };

  const submitExam = async () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    setIsGrading(true);

    const formattedAnswers = quizQuestions.map((q, index) => ({
      question_id: q.id,
      chosen_option: userAnswers[index] || null,
    }));

    if (token && activeExamLesson) {
      try {
        const response = (await apiCall('/api/progress/quiz', token, 'POST', {
          lessonId: activeExamLesson.id,
          answers: formattedAnswers,
        })) as any;

        if (response.status === 'queued') {
          toast.success(
            response.message || 'استلمنا إجاباتك ⏱️. نظراً للضغط الحالي، جاري تصحيح ورقتك وسجلناها في النظام. النتيجة هتظهر في ملفك الشخصي خلال دقايق.',
            {
              duration: 8000,
            },
          );
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
      const duration = 3000;
      const end = Date.now() + duration;
      const frame = () => {
        confetti.default({
          particleCount: 6,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: ['#10b981', '#015669', '#f59e0b'],
        });
        confetti.default({
          particleCount: 6,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: ['#10b981', '#015669', '#f59e0b'],
        });
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
  } catch (e) {}

  const displayHeroBadge =
    courseSettings.badge !== undefined && courseSettings.badge !== null && courseSettings.badge !== '';

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-page)]" id="top-section" dir="rtl" onContextMenu={e => e.preventDefault()}>
      {/* SEO structured data للكورس */}
      {course && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Course',
              name: course.title,
              description: course.description || 'كورس أونلاين مكتمل على منصة كله بيتعلم',
              provider: {
                '@type': 'Organization',
                name: 'كله بيتعلم',
                url: 'https://kollobeit3alem.pages.dev',
              },
              isAccessibleForFree: course.is_free === 1,
            }),
          }}
        />
      )}

      <SiteHeader user={user} loggedIn={isAuthenticated} />

      {/* ============================================================ */}
      {/* Hero الكورس — تركيبة تحريرية غير متماثلة                       */}
      {/* ============================================================ */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-[1400px] px-[5%] pt-6 md:pt-9">
          <div className="relative overflow-hidden rounded-[28px] bg-[var(--grad-brand-deep)] text-white md:rounded-[32px]" style={{ boxShadow: '0 30px 80px -20px rgba(1,86,105,0.5)' }}>
            {/* خلفية بنقش شبكة نقاط */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage: 'radial-gradient(rgba(255,255,255,0.13) 1px, transparent 1px)',
                backgroundSize: '22px 22px',
                maskImage: 'linear-gradient(180deg, black, transparent 85%)',
              }}
              aria-hidden="true"
            />
            {/* توهج كهرماني كلمسة ثانية */}
            <div
              className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-amber-400/15 blur-3xl"
              aria-hidden="true"
            />

            <div className="relative flex flex-col gap-10 p-7 md:p-12 lg:flex-row lg:items-center lg:gap-12 lg:p-16">
              {/* المحتوى النصي (يمين في RTL) */}
              <div className="flex-1 text-center lg:text-right">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-4 py-1.5 text-[13px] font-bold backdrop-blur">
                  <i className="fas fa-graduation-cap text-[11px]" />
                  {courseSettings.level || 'كورس أونلاين للمنصة'}
                </span>

                <h1 className="mt-5 text-[30px] leading-tight font-extrabold md:text-[38px] lg:text-[42px]">
                  {course?.title || 'جاري تحميل بيانات الكورس...'}
                </h1>

                <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-white/85 md:text-lg lg:mx-0">
                  {course?.description || 'دورة تدريبية متميزة'}
                </p>

                {/* الشارات (Tags) */}
                {(courseSettings.level || courseSettings.language || displayHeroBadge) && (
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5 lg:justify-start">
                    {courseSettings.level && (
                      <span className="kb-chip border border-white/25 bg-white/15 text-white backdrop-blur">
                        <i className="fas fa-layer-group text-[10px]" /> {courseSettings.level}
                      </span>
                    )}
                    {courseSettings.language && (
                      <span className="kb-chip border border-white/25 bg-white/15 text-white backdrop-blur">
                        <i className="fas fa-language text-[10px]" /> {courseSettings.language}
                      </span>
                    )}
                    {displayHeroBadge && (
                      <span className="kb-chip bg-orange-500 text-white shadow-[0_5px_18px_rgba(249,115,22,0.4)]">
                        <i className="fas fa-star text-[10px]" /> {courseSettings.badge}
                      </span>
                    )}
                  </div>
                )}

                {/* أزرار الاشتراك والتواصل */}
                <div className="mt-8 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
                  {isUserEnrolled ? (
                    <div className="inline-flex items-center gap-2.5 rounded-full border border-white/25 bg-white/15 px-7 py-3.5 text-base font-extrabold backdrop-blur">
                      <i className="fas fa-check-circle text-emerald-300" /> أنت مشترك في هذا الكورس
                    </div>
                  ) : (
                    <button
                      onClick={handleEnrollClick}
                      disabled={isEnrolling}
                      className="inline-flex cursor-pointer items-center gap-2.5 rounded-full bg-white px-9 py-4 text-lg font-extrabold text-[var(--primary-color)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ boxShadow: '0 18px 45px -10px rgba(0,0,0,0.35)' }}
                    >
                      {isEnrolling ? <i className="fas fa-circle-notch fa-spin" /> : <i className="fas fa-cart-plus" />}
                      {isEnrolling ? 'جاري التجهيز...' : `اشترك الآن ${course?.is_free === 1 ? '(مجاناً)' : `(${course?.price || 0} ج.م)`}`}
                    </button>
                  )}

                  {course?.instructor_contact ? (
                    isUserEnrolled ? (
                      <a
                        href={course.instructor_contact}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="تواصل مع المحاضر للاستفسارات"
                        className="inline-flex cursor-pointer items-center gap-2.5 rounded-full bg-[#25D366] px-9 py-4 text-lg font-bold text-white no-underline transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#1ebe57]"
                        style={{ boxShadow: '0 18px 45px -10px rgba(0,0,0,0.3)' }}
                      >
                        <i className="fab fa-whatsapp text-xl" /> تواصل مع المحاضر
                      </a>
                    ) : (
                      <button
                        onClick={() => toast.info('يجب الاشتراك في الكورس أولاً لتتمكن من التواصل مع المحاضر.')}
                        title="مغلق للمشتركين فقط"
                        className="inline-flex cursor-not-allowed items-center gap-2.5 rounded-full border border-white/20 bg-white/10 px-9 py-4 text-lg font-bold text-white/40 backdrop-blur"
                      >
                        <i className="fas fa-lock" /> تواصل مع المحاضر
                      </button>
                    )
                  ) : null}
                </div>
              </div>

              {/* الصورة (يسار في RTL) */}
              <div className="flex justify-center lg:w-[38%]">
                <div className="relative w-full max-w-[420px]">
                  <div className="rotate-[1.5deg] overflow-hidden rounded-2xl border-4 border-white/25 bg-white shadow-[0_30px_70px_rgba(0,0,0,0.35)]">
                    <div className="aspect-[4/3] overflow-hidden">
                      <img
                        src={course?.image_url || 'https://via.placeholder.com/1200x400/015669/ffffff?text=جاري+التحميل...'}
                        className="h-full w-full object-cover"
                        alt="غلاف الكورس"
                      />
                    </div>
                  </div>
                  <div className="absolute -bottom-5 right-3 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_15px_40px_rgba(0,0,0,0.22)]">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary-light)] text-base text-[var(--primary-color)]">
                      <i className="fas fa-layer-group" />
                    </span>
                    <div>
                      <p className="text-sm font-extrabold leading-none text-slate-800">
                        {lessons.length > 0 ? `${lessons.length} محاضرة` : 'جاري التجهيز'}
                      </p>
                      <p className="mt-1 text-[11px] font-bold text-[var(--text-muted)]">فيديوهات + امتحانات</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* شريط "كيف تكمل الكورس" — لحظة قراءة ثانية                        */}
      {/* ============================================================ */}
      <section className="mx-auto w-full max-w-[1400px] px-[5%] pt-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { icon: 'fa-user-plus', text: 'اشترك في الكورس' },
            { icon: 'fa-circle-play', text: 'شاهد فيديو الشرح' },
            { icon: 'fa-file-pen', text: 'حل امتحان المحاضرة' },
            { icon: 'fa-trophy', text: 'افتح اللي بعدها' },
          ].map(step => (
            <div key={step.text} className="kb-surface flex items-center gap-3 p-4">
              <span className="kb-stat-tile h-10 w-10 rounded-xl text-base">
                <i className={`fas ${step.icon}`} />
              </span>
              <span className="text-[13px] font-bold leading-snug text-slate-700">{step.text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ============================================================ */}
      {/* مشغل الفيديو — محتوى حقيقي بدون قص                            */}
      {/* ============================================================ */}
      {activeLessonId !== null && (
        <div id="video-player-section" className="mx-auto mb-14 mt-10 flex w-full max-w-[1400px] justify-center px-[5%] scroll-mt-20">
          <div
            ref={videoContainerRef}
            className={`group relative flex w-full flex-col overflow-hidden rounded-[24px] bg-black shadow-[0_35px_80px_rgba(0,0,0,0.45)] ${isFullscreen ? '!h-full !w-full !max-w-none !rounded-none !border-none' : 'max-w-[1000px] border border-slate-800'}`}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={handleMouseMove}
          >
            {/* زر الإغلاق */}
            {!isFullscreen && (
              <button
                onClick={closeVideo}
                title="إغلاق الفيديو"
                className={`absolute top-5 right-5 z-[40] flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-black/60 text-xl text-white backdrop-blur-md transition-all duration-300 hover:bg-red-600 ${
                  isControlsVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-4 opacity-0'
                }`}
              >
                <i className="fas fa-xmark" />
              </button>
            )}

            <div className={`relative flex w-full items-center justify-center overflow-hidden bg-black ${isFullscreen ? 'h-full' : 'aspect-video'}`}>
              {/* الفيديو بحجمه الطبيعي */}
              <div
                key={`${activeLessonId}-${activeVideoIndex}`}
                id="player"
                className="pointer-events-none absolute inset-0 h-full w-full"
              ></div>

              {/* 🛡️ العلامة المائية */}
              <div
                className="pointer-events-none absolute z-[15] select-none whitespace-nowrap text-sm font-bold text-red-500/20 transition-all ease-in-out md:text-base lg:text-lg"
                style={{ top: `${watermarkPos.top}%`, left: `${watermarkPos.left}%`, textShadow: '1px 1px 2px rgba(0,0,0,0.1)', transitionDuration: '4000ms' }}
              >
                {user?.email || 'زائر'}
              </div>

              {/* طبقة حماية قوية تمنع التفاعل مع يوتيوب من خلفها */}
              <div className="absolute inset-0 z-20 h-full w-full cursor-pointer" onClick={togglePlayPause}></div>

              {/* شريط التحكم المخصص */}
              <div
                className={`absolute inset-x-0 bottom-0 z-30 flex flex-col gap-4 bg-gradient-to-t from-black/95 via-black/60 to-transparent px-6 pb-6 pt-24 transition-all duration-500 ease-in-out md:px-8 ${
                  isControlsVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
                }`}
              >
                <div
                  className="relative h-2 w-full cursor-pointer overflow-hidden rounded-full bg-white/20 transition-all hover:h-3"
                  onClick={seekVideo}
                >
                  <div
                    className="pointer-events-none h-full rounded-full bg-[var(--primary-color)] transition-all duration-150"
                    style={{ width: `${videoDuration ? (currentTime / videoDuration) * 100 : 0}%` }}
                  />
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <button
                      onClick={() => skipVideo(-10)}
                      className="flex cursor-pointer items-center justify-center border-none bg-transparent text-2xl text-white transition-transform hover:scale-110"
                      title="تأخير 10 ثواني"
                    >
                      <i className="fas fa-backward-step"></i>
                    </button>
                    <button
                      onClick={togglePlayPause}
                      className="flex cursor-pointer items-center justify-center border-none bg-transparent text-[36px] text-[var(--primary-color)] transition-transform hover:scale-110"
                      title="تشغيل / إيقاف"
                    >
                      <i className={`fas ${isVideoPlaying ? 'fa-circle-pause' : 'fa-circle-play'}`}></i>
                    </button>
                    <button
                      onClick={() => skipVideo(10)}
                      className="flex cursor-pointer items-center justify-center border-none bg-transparent text-2xl text-white transition-transform hover:scale-110"
                      title="تقديم 10 ثواني"
                    >
                      <i className="fas fa-forward-step"></i>
                    </button>
                  </div>

                  <div className="flex items-center gap-5">
                    <button
                      onClick={cyclePlaybackRate}
                      className="cursor-pointer rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-bold text-white transition-all hover:bg-white hover:text-black"
                      title="سرعة التشغيل"
                    >
                      {playbackRate}x
                    </button>
                    <div className="font-mono text-[14px] font-bold tracking-wide text-slate-200" dir="ltr">
                      <span>{formatTime(currentTime)}</span> / <span>{formatTime(videoDuration)}</span>
                    </div>
                    <button
                      onClick={toggleFullscreen}
                      className="ml-2 flex cursor-pointer items-center justify-center border-none bg-transparent text-xl text-white transition-transform hover:scale-110"
                      title="ملء الشاشة"
                    >
                      <i className={`fas ${isFullscreen ? 'fa-compress' : 'fa-expand'}`}></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* محتوى الكورس — المحاضرات                                      */}
      {/* ============================================================ */}
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-[5%] py-10 md:py-14">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--primary-light)] text-xl text-[var(--primary-color)]">
            <i className="fas fa-book-open" />
          </span>
          <div className="flex items-center gap-3">
            <h2 className="text-[26px] font-extrabold text-[#1e293b] md:text-[30px]">محتوى الكورس</h2>
            {lessons.length > 0 && (
              <span className="kb-chip-blue">
                <i className="fas fa-layer-group text-[10px]" /> {lessons.length} محاضرة
              </span>
            )}
          </div>
        </div>

        {/* شريط تقدم الطالب */}
        {isUserEnrolled && lessons.length > 0 && (
          <div className="kb-surface mb-6 flex items-center gap-4 p-4 md:p-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-lg text-emerald-700">
              <i className="fas fa-flag-checkered" />
            </span>
            <div className="flex-1">
              <div className="mb-2 flex items-center justify-between gap-4">
                <p className="text-[13px] font-bold text-[var(--text-muted)]">تقدمك في الكورس</p>
                <p className="text-[13px] font-extrabold text-slate-800">
                  {completedLessons.size} / {lessons.length} محاضرة مكتملة
                </p>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="progress-bar-fill h-full rounded-full bg-[var(--success)]"
                  style={{ width: `${Math.round((completedLessons.size / lessons.length) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="kb-surface py-12">
            <Spinner size="lg" />
            <p className="pb-6 text-center text-[15px] font-bold text-[var(--text-muted)]">جاري تحميل المحاضرات...</p>
          </div>
        ) : lessons.length === 0 ? (
          <EmptyState
            icon="fa-folder-open"
            title="المحتوى قيد التجهيز"
            description="سيتم إضافة المحاضرات قريباً، تابعنا!"
            cta={{ to: '/courses', label: 'العودة للكورسات' }}
          />
        ) : (
          <div className="flex flex-col gap-5">
            {lessons.map((lesson, index) => {
              const { locked, message } = isLessonLocked(lesson, index);
              const isCompleted = completedLessons.has(lesson.id);
              const isExpanded = expandedLesson === lesson.id;

              const displayVideoUrls = lesson.video_url ? lesson.video_url.split(/[,|\s]+/).filter(url => url.trim() !== '') : [];

              return (
                <div
                  key={lesson.id}
                  className={`kb-surface overflow-hidden transition-all duration-300 ${
                    isCompleted
                      ? 'border-2 border-emerald-200'
                      : locked && isUserEnrolled
                        ? 'border-2 border-slate-200/70 opacity-80'
                        : 'border-2 border-transparent hover:border-[var(--primary-color)]/30'
                  }`}
                >
                  {/* رأس المحاضرة */}
                  <div
                    onClick={() => toggleAccordion(lesson.id, index)}
                    className={`flex cursor-pointer select-none items-center justify-between gap-4 p-5 md:p-6 ${
                      locked && isUserEnrolled ? 'cursor-not-allowed' : ''
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-4 md:gap-5">
                      <span
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-black md:h-12 md:w-12 ${
                          isCompleted
                            ? 'bg-emerald-100 text-emerald-700'
                            : locked && isUserEnrolled
                              ? 'bg-slate-100 text-slate-400'
                              : 'bg-[var(--primary-light)] text-[var(--primary-color)]'
                        }`}
                      >
                        {isCompleted ? <i className="fas fa-check text-lg" /> : String(index + 1).padStart(2, '0')}
                      </span>

                      <div className="min-w-0">
                        <h3 className="flex items-center gap-2.5 text-lg font-extrabold text-slate-800 md:text-xl">
                          <span className="truncate">{lesson.title}</span>
                          {locked && isUserEnrolled && <i className="fas fa-lock text-xs text-slate-400"></i>}
                          {isCompleted && <i className="fas fa-circle-check text-l text-[var(--success)]"></i>}
                        </h3>
                        <p className="mt-0.5 text-[13px] text-[var(--text-muted)] md:text-sm">
                          {locked && isUserEnrolled
                            ? lesson.is_admin_locked === 1
                              ? 'هذه المحاضرة مغلقة مؤقتاً من الإدارة.'
                              : 'يجب إنهاء المحاضرة السابقة أولاً.'
                            : 'شاهد الفيديوهات، استوعب الشرح، ثم اختبر نفسك لتأكيد الفهم.'}
                        </p>
                      </div>
                    </div>

                    <div className={`text-2xl text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-[var(--primary-color)]' : ''}`}>
                      <i className="fas fa-chevron-down"></i>
                    </div>
                  </div>

                  {/* محتوى المحاضرة */}
                  <div className={`overflow-hidden transition-all duration-400 ease-in-out ${isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                    <div className="flex flex-col gap-3 p-5 pt-0 md:p-6 md:pt-0">
                      <div className="mb-1.5 h-px w-full bg-slate-100"></div>

                      {displayVideoUrls.length === 0 && !lesson.hasQuiz && (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center font-bold text-slate-400">
                          <i className="fas fa-person-digging mb-3 block text-3xl text-slate-300"></i>
                          جاري تجهيز محتوى هذه المحاضرة
                        </div>
                      )}

                      {displayVideoUrls.map((vUrl, vIdx) => {
                        const isVideoCompleted = isUserEnrolled && (completedVideos.has(`${lesson.id}_${vIdx}`) || isCompleted);
                        const isActiveVideo = isUserEnrolled && ytDataRef.current.lesson?.id === lesson.id && ytDataRef.current.vIdx === vIdx && activeLessonId !== null;

                        return (
                          <div
                            key={vIdx}
                            onClick={() =>
                              !isAuthenticated
                                ? toast.info('يرجى تسجيل الدخول والاشتراك لمشاهدة المحاضرات.')
                                : !isUserEnrolled
                                  ? toast.warning('يرجى الاشتراك في الكورس لمشاهدة المحاضرات.')
                                  : locked
                                    ? toast.warning(message)
                                    : openVideo(lesson, vUrl, vIdx, displayVideoUrls.length)
                            }
                            className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl p-3.5 font-bold transition-all hover:-translate-x-0.5 md:p-4 ${
                              !isUserEnrolled
                                ? 'border border-slate-200 bg-slate-50 text-slate-400'
                                : isVideoCompleted
                                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : isActiveVideo
                                    ? 'border border-[var(--primary-color)]/40 bg-[var(--primary-light)] text-[var(--primary-color)] shadow-[0_5px_15px_rgba(1,86,105,0.12)]'
                                    : 'border border-amber-200/70 bg-amber-50 text-amber-700'
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-3.5">
                              <i
                                className={`${
                                  !isUserEnrolled ? 'fas fa-lock' : isVideoCompleted ? 'fas fa-circle-check' : isActiveVideo ? 'fas fa-circle-play fa-fade' : 'fas fa-video'
                                } text-xl`}
                              ></i>
                              <span className="truncate text-[15px] md:text-base">
                                جزء الشرح والتدريبات{displayVideoUrls.length > 1 ? ` (الجزء ${vIdx + 1})` : ''}
                              </span>
                            </div>
                            <span className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-bold text-[var(--text-main)] shadow-sm">
                              {!isUserEnrolled ? 'مغلق للمشتركين' : isVideoCompleted ? 'تمت المشاهدة' : isActiveVideo ? 'يتم العرض الآن' : 'مشاهدة الفيديو'}
                              {isUserEnrolled && !isVideoCompleted && <i className="fas fa-play mr-1.5 text-[10px]"></i>}
                            </span>
                          </div>
                        );
                      })}

                      {lesson.hasQuiz && (
                        <div
                          onClick={() =>
                            !isAuthenticated
                              ? toast.info('يرجى تسجيل الدخول والاشتراك لفتح الامتحان.')
                              : !isUserEnrolled
                                ? toast.warning('يرجى الاشتراك في الكورس لفتح الامتحان.')
                                : locked
                                  ? toast.warning(message)
                                  : openExam(lesson)
                          }
                          className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl p-3.5 font-bold transition-all hover:-translate-x-0.5 md:p-4 ${
                            !isUserEnrolled
                              ? 'border border-slate-200 bg-slate-50 text-slate-400'
                              : isCompleted
                                ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border border-rose-200/70 bg-rose-50 text-rose-700 hover:shadow-[0_5px_15px_rgba(239,68,68,0.1)]'
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-3.5">
                            <i className={`${!isUserEnrolled ? 'fas fa-lock' : isCompleted ? 'fas fa-circle-check' : 'fas fa-file-pen'} text-xl`}></i>
                            <span className="truncate text-[15px] md:text-base">امتحان المحاضرة</span>
                          </div>
                          <span className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-bold text-[var(--text-main)] shadow-sm">
                            {!isUserEnrolled ? 'مغلق للمشتركين' : isCompleted ? 'مكتمل' : 'دخول الامتحان'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ============================================================ */}
      {/* 🛡️ Modal تأكيد الاشتراك (للكورسات المجانية فقط)                */}
      {/* ============================================================ */}
      <KbModal open={showEnrollConfirmModal} onClose={() => setShowEnrollConfirmModal(false)} accent="teal">
        <div className="flex flex-col items-center text-center">
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--primary-light)] text-[28px] text-[var(--primary-color)]">
            <i className="fas fa-shopping-cart" />
          </span>
          <h2 className="mb-2 text-[22px] font-extrabold text-slate-800">تأكيد الاشتراك المجاني</h2>
          <p className="mb-7 text-[15px] leading-relaxed text-[var(--text-muted)]">
            هل أنت متأكد من رغبتك في الاشتراك في هذا الكورس مجاناً؟
          </p>
          <div className="flex w-full gap-3">
            <button
              onClick={() => setShowEnrollConfirmModal(false)}
              className="kb-btn-ghost flex-1 cursor-pointer"
            >
              إلغاء
            </button>
            <button
              onClick={confirmFreeEnrollment}
              disabled={isEnrolling}
              className="kb-btn-primary flex-1 cursor-pointer"
            >
              {isEnrolling ? 'جاري...' : 'تأكيد'}
            </button>
          </div>
        </div>
      </KbModal>

      {/* ============================================================ */}
      {/* 🛡️ Modal اختيار طريقة الدفع (للكورسات المدفوعة)                */}
      {/* ============================================================ */}
      <KbModal open={showPaymentMethodModal} onClose={() => setShowPaymentMethodModal(false)} accent="teal" maxWidth="max-w-[460px]">
        <div className="flex flex-col items-center text-center">
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--primary-light)] text-[28px] text-[var(--primary-color)]">
            <i className="fas fa-money-bill-wave" />
          </span>
          <h2 className="mb-2 text-[22px] font-extrabold text-slate-800">اختر طريقة الدفع</h2>
          <p className="mb-7 text-[15px] leading-relaxed text-[var(--text-muted)]">
            للاشتراك في الكورس بقيمة <strong className="text-[var(--primary-color)]">{course?.price} ج.م</strong>
            ، يرجى اختيار الطريقة الأنسب لك:
          </p>

          <div className="flex w-full flex-col gap-3.5">
            <button
              onClick={() => proceedToPayment('card')}
              disabled={isEnrolling}
              className="kb-btn w-full cursor-pointer py-4 !text-lg disabled:opacity-50"
            >
              <i className="fas fa-credit-card text-xl" /> الدفع بالبطاقة (فيزا / ماستركارد)
            </button>

            <button
              onClick={() => proceedToPayment('kiosk')}
              disabled={isEnrolling}
              className="kb-btn w-full cursor-pointer bg-[var(--warning)] py-4 !text-lg text-white transition-all hover:bg-[var(--amber-deep)] disabled:opacity-50"
            >
              <i className="fas fa-store text-xl" /> الدفع كاش (فوري / أمان / محافظ)
            </button>

            <button onClick={() => setShowPaymentMethodModal(false)} disabled={isEnrolling} className="kb-btn-ghost mt-1 w-full cursor-pointer">
              إلغاء
            </button>
          </div>
        </div>
      </KbModal>

      {/* ============================================================ */}
      {/* 🛡️ Modal عرض كود فوري (بعد اختيار الدفع الكاش)                  */}
      {/* ============================================================ */}
      <KbModal open={showPaymentModal} onClose={() => setShowPaymentModal(false)} accent="amber" maxWidth="max-w-[480px]">
        <div className="flex flex-col items-center text-center">
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-[28px] text-amber-500">
            <i className="fas fa-file-invoice-dollar" />
          </span>
          <h2 className="mb-2 text-[24px] font-extrabold text-slate-800">كود الدفع (بيموب / فوري)</h2>
          <p className="mb-6 text-[15px] leading-relaxed text-[var(--text-muted)]">
            يرجى التوجه لأي منفذ فوري أو أمان واطلب الدفع لخدمة (بيموب / Paymob) باستخدام هذا الكود المرجعي.
          </p>

          <div className="mb-6 w-full rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-5">
            <span className="text-4xl font-black tracking-widest text-[var(--primary-color)]" dir="ltr">
              {paymentReference}
            </span>
          </div>

          <div className="mb-7 flex w-full flex-col gap-3 text-right">
            <div className="flex items-start gap-3 rounded-xl border border-sky-100 bg-sky-50 p-4 text-sm font-bold text-sky-700">
              <i className="fas fa-info-circle mt-1 flex-shrink-0 text-lg" />
              <p className="leading-relaxed">
                الكود صالح لمدة 24 ساعة فقط. يمكنك الدفع عبر أي ماكينة فوري، أمان، مصاري، أو من خلال المحافظ الإلكترونية (كود خدمة بيموب).
              </p>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50 p-4 text-[13px] font-bold text-amber-700">
              <i className="fas fa-clock mt-0.5 flex-shrink-0 text-base" />
              <p className="leading-relaxed">
                ملاحظة هامة: بعد إتمام الدفع، قد تستغرق العملية من 5 إلى 30 دقيقة لتسميع البيانات في سيرفراتنا. بمجرد التأكيد، سيتحول الكورس إلى
                "تم الاشتراك بنجاح" ويمكنك متابعة التعلم فوراً عند تحديث الصفحة.
              </p>
            </div>
          </div>

          <button onClick={() => setShowPaymentModal(false)} className="kb-btn-primary w-full cursor-pointer py-4 !text-lg">
            حسناً، فهمت
          </button>
        </div>
      </KbModal>

      {/* ============================================================ */}
      {/* Exam Modal — شاشة كاملة مع مضاد الغش والتايمر                  */}
      {/* ============================================================ */}
      {showExamModal && activeExamLesson && isUserEnrolled && (
        <div className="exam-modal-overlay">
          <div
            id="anti-cheat-overlay"
            className="absolute top-0 left-0 z-[3000] hidden h-full w-full flex-col items-center justify-center bg-black p-5 text-center text-white"
            onClick={e => {
              (e.currentTarget as HTMLDivElement).style.display = 'none';
            }}
          >
            <i className="fas fa-shield-halved mb-5 text-[80px] text-red-500"></i>
            <p className="text-2xl font-bold">تنبيه أمني!</p>
            <p className="mt-2.5 text-base font-normal leading-relaxed">
              تم إخفاء الامتحان لأنك قمت بالخروج من النافذة أو محاولة التقاط الشاشة.
              <br />
              يرجى النقر هنا للعودة للامتحان.
            </p>
          </div>

          <div className="flex items-center justify-between border-b border-slate-200 bg-white px-[5%] py-5 shadow-[0_4px_15px_rgba(0,0,0,0.02)]">
            <h2 className="flex items-center gap-2.5 text-[20px] font-bold text-[var(--primary-color)] md:text-[22px]">
              <i className="fas fa-pen-to-square"></i> اختبار: {activeExamLesson.title}
            </h2>
            <button
              onClick={closeExam}
              disabled={isGrading}
              className="kb-table-action cursor-pointer bg-slate-100 text-slate-600 hover:bg-slate-200"
            >
              <i className="fas fa-xmark"></i> إغلاق مؤقت
            </button>
          </div>

          <div className="flex flex-1 flex-col items-center overflow-y-auto px-[5%] py-8">
            {isGrading ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <i className="fas fa-circle-notch fa-spin mb-4 text-6xl text-[var(--primary-color)]"></i>
                <h3 className="text-2xl font-bold text-[var(--text-main)]">جاري تصحيح إجاباتك...</h3>
                <p className="mt-2 text-[var(--text-muted)]">يرجى الانتظار لحظات</p>
              </div>
            ) : !examFinished ? (
              <>
                <div
                  className={`mb-5 flex items-center gap-2.5 rounded-[30px] px-6 py-2.5 text-xl font-bold shadow-[0_5px_15px_rgba(239,68,68,0.3)] ${
                    timeRemaining < 30 ? 'border-2 border-red-500 bg-red-50 text-red-500' : 'bg-red-500 text-white'
                  }`}
                >
                  <i className="fas fa-stopwatch"></i>
                  <span>
                    {Math.floor(timeRemaining / 60)
                      .toString()
                      .padStart(2, '0')}
                    :{(timeRemaining % 60).toString().padStart(2, '0')}
                  </span>
                </div>

                <h3 className="mb-6 text-lg text-[var(--text-muted)]">
                  السؤال <span className="text-[22px] font-bold text-[var(--primary-color)]">{currentQIndex + 1}</span> من{' '}
                  <span>{quizQuestions.length}</span>
                </h3>

                {quizQuestions[currentQIndex]?.image_url && (
                  <img
                    src={quizQuestions[currentQIndex].image_url}
                    alt="سؤال الامتحان"
                    className="pointer-events-none mb-8 max-h-[300px] max-w-full rounded-xl border-2 border-slate-200"
                  />
                )}

                <div className="grid w-full max-w-[600px] grid-cols-1 gap-4">
                  {(() => {
                    const currentQ = quizQuestions[currentQIndex];
                    const isTrueFalse = (currentQ as any)?.type === 'true_false' || (!currentQ?.option_c && !currentQ?.option_d);
                    const optionsList = isTrueFalse ? ['A', 'B'] : ['A', 'B', 'C', 'D'];

                    return optionsList.map(option => (
                      <button
                        key={option}
                        onClick={() => chooseAnswer(option)}
                        className={`flex cursor-pointer items-center gap-4 rounded-2xl border-2 px-5 py-4 text-right text-lg font-bold transition-all ${
                          userAnswers[currentQIndex] === option
                            ? 'border-[var(--primary-color)] bg-[var(--primary-light)] text-[var(--text-main)] shadow-[0_8px_20px_rgba(1,86,105,0.15)]'
                            : 'border-slate-200 bg-white text-[var(--text-main)] shadow-[0_4px_10px_rgba(0,0,0,0.02)] hover:border-[var(--primary-color)]'
                        }`}
                      >
                        <span
                          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-xl ${
                            userAnswers[currentQIndex] === option ? 'bg-[var(--primary-color)] text-white' : 'bg-[var(--bg-page)] text-[var(--primary-color)]'
                          }`}
                        >
                          {option === 'A' ? 'أ' : option === 'B' ? 'ب' : option === 'C' ? 'ج' : 'د'}
                        </span>
                        <span>{quizQuestions[currentQIndex]?.[`option_${option.toLowerCase()}` as keyof QuizQuestion] as string}</span>
                      </button>
                    ));
                  })()}
                </div>

                <div className="mt-10 flex w-full max-w-[600px] items-center justify-between">
                  <button
                    onClick={prevQuestion}
                    disabled={currentQIndex === 0}
                    className="kb-btn-ghost cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <i className="fas fa-arrow-right-long"></i> السابق
                  </button>

                  {currentQIndex === quizQuestions.length - 1 ? (
                    <button onClick={submitExam} className="kb-btn-success cursor-pointer !py-4 !text-lg">
                      إنهاء وتصحيح <i className="fas fa-check-double"></i>
                    </button>
                  ) : (
                    <button onClick={nextQuestion} className="kb-btn-ghost cursor-pointer">
                      التالي <i className="fas fa-arrow-left-long"></i>
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div
                  className={`mb-5 flex h-[150px] w-[150px] items-center justify-center rounded-full text-[50px] font-bold text-white shadow-[0_10px_30px_rgba(0,0,0,0.1)] ${
                    examScore >= 50 ? 'bg-[var(--success)]' : 'bg-red-500'
                  }`}
                >
                  {examScore}%
                </div>
                <div className={`mb-2.5 text-[32px] font-bold ${examScore >= 50 ? 'text-[var(--success)]' : 'text-red-500'}`}>
                  {examScore >= 50 ? 'ممتاز! لقد اجتزت الاختبار بنجاح' : 'للأسف، لم تجتز الاختبار'}
                </div>
                <div className="mb-10 text-xl text-[var(--text-muted)]">
                  أجبت بشكل صحيح على {Math.round((examScore / 100) * quizQuestions.length)} من أصل {quizQuestions.length} أسئلة
                </div>
                <button onClick={closeExam} className="kb-btn-primary cursor-pointer !py-4 !text-lg">
                  <i className="fas fa-rotate-left"></i> العودة للمحاضرات
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <PageFooter />
    </div>
  );
}