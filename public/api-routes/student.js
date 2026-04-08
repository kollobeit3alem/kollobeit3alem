import { getCorsHeaders } from './utils.js';
import { verifyStudentSession } from './auth.js';

// ============================================================================
// التحسين: Two-Tier Rate Limiter (استراتيجية Gemini)
// الطبقة 1: ذاكرة الـ Worker (مجانية تماماً) — تمسك الـ Spam في 10 ثواني
// الطبقة 2: KV (مرجع مشترك بين كل الـ instances) — تطبق الحظر الفعلي
// بهذا الأسلوب: Bot يضغط 100 مرة = نمسكه من الذاكرة بدون إرسال أي طلب لـ KV
// ============================================================================
const memoryAttempts = new Map(); // الطبقة 1: ذاكرة مؤقتة سريعة ومجانية
const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 15 * 60; // 15 دقيقة
const MEMORY_WINDOW_MS = 10 * 1000; // 10 ثواني — نافذة الذاكرة المحلية

// ============================================================================
// دالة فحص Rate Limit — الطبقتين معاً
// ============================================================================
async function checkRateLimit(userId, env) {
  const now = Date.now();
  const memKey = `${userId}`;

  // --- الطبقة 1: فحص الذاكرة المحلية (مجاني تماماً) ---
  const memData = memoryAttempts.get(memKey) || { count: 0, firstAttempt: now, blocked: false };

  // لو الـ instance المحلي شايفه محظور خلال الـ 10 ثواني الأخيرة، نرفضه فوراً
  if (memData.blocked && (now - memData.blockTime) < MEMORY_WINDOW_MS) {
    return { allowed: false, source: 'memory', minutesLeft: Math.ceil(LOCKOUT_SECONDS / 60) };
  }

  // لو فات أكتر من 10 ثواني، نصفر العداد المحلي
  if ((now - memData.firstAttempt) > MEMORY_WINDOW_MS) {
    memoryAttempts.delete(memKey);
  }

  // --- الطبقة 2: فحص KV (المرجع الموثوق المشترك بين كل الـ instances) ---
  if (env.COURSES_CACHE) {
    const kvData = await env.COURSES_CACHE.get(`rate_limit:charge:${userId}`, { type: 'json' });
    if (kvData && kvData.lockoutUntil > now) {
      const minutesLeft = Math.ceil((kvData.lockoutUntil - now) / 60000);
      // نحدث الذاكرة المحلية عشان الطلبات الجاية تتمسك من الذاكرة مجاناً
      memoryAttempts.set(memKey, { count: MAX_ATTEMPTS, firstAttempt: now, blocked: true, blockTime: now });
      return { allowed: false, source: 'kv', minutesLeft };
    }
  }

  return { allowed: true };
}

// دالة تسجيل محاولة خاطئة
async function recordFailedAttempt(userId, env) {
  const now = Date.now();
  const memKey = `${userId}`;

  // تحديث الذاكرة المحلية
  const memData = memoryAttempts.get(memKey) || { count: 0, firstAttempt: now, blocked: false };
  memData.count += 1;

  // إذا تجاوز الحد في الذاكرة، نسجل في KV ونطبق الحظر الفعلي
  if (memData.count >= MAX_ATTEMPTS) {
    memData.blocked = true;
    memData.blockTime = now;
    if (env.COURSES_CACHE) {
      await env.COURSES_CACHE.put(
        `rate_limit:charge:${userId}`,
        JSON.stringify({ lockoutUntil: now + (LOCKOUT_SECONDS * 1000), count: MAX_ATTEMPTS }),
        { expirationTtl: LOCKOUT_SECONDS + 60 }
      );
    }
  }

  memoryAttempts.set(memKey, memData);
  return memData.count;
}

// دالة مسح محاولات المستخدم بعد نجاح الشحن
async function clearRateLimit(userId, env) {
  memoryAttempts.delete(`${userId}`);
  if (env.COURSES_CACHE) {
    await env.COURSES_CACHE.delete(`rate_limit:charge:${userId}`);
  }
}

// ============================================================================
// دالة مساعدة: Cache API (استراتيجية Gemini) — لكاش البيانات العامة مجاناً
// Cloudflare Cache API مجانية تماماً وتعمل على كل الـ CDN nodes
// ============================================================================
async function getCacheAPIResponse(cacheKey) {
  try {
    const cache = caches.default;
    const cachedResponse = await cache.match(new Request(cacheKey));
    if (cachedResponse) {
      return cachedResponse.clone();
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function putCacheAPIResponse(cacheKey, data, ttlSeconds) {
  try {
    const cache = caches.default;
    const response = new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${ttlSeconds}`,
      }
    });
    await cache.put(new Request(cacheKey), response);
  } catch (e) {
    // Cache API قد تفشل في بعض البيئات — مش مشكلة
  }
}

// ============================================================================
// handleStudentRoutes — كل مسارات الطالب
// ============================================================================
export async function handleStudentRoutes(request, env, path, url) {
  const ch = getCorsHeaders(request, env);

  // مسار تحديث الملف الشخصي
  if (path === "/api/my-profile" && request.method === "PUT") {
    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...ch } });

    const body = await request.json();
    if (body.phone !== undefined) {
      await env.DB.prepare("UPDATE users SET phone = ? WHERE id = ?").bind(body.phone, authCheck.userId).run();
    }
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // جلب سجل امتحانات الطالب
  if (path === "/api/my-quizzes" && request.method === "GET") {
    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...ch } });

    const userId = authCheck.userId;

    try {
      const query = `
        SELECT q.id, q.score, q.answers_json, q.attempted_at, l.title as lesson_title, c.title as course_title
        FROM quiz_attempts q
        JOIN lessons l ON q.lesson_id = l.id
        JOIN courses c ON l.course_id = c.id
        WHERE q.user_id = ?
        ORDER BY q.attempted_at DESC
      `;
      const attempts = await env.DB.prepare(query).bind(userId).all();

      return new Response(JSON.stringify(attempts.results), { headers: { "Content-Type": "application/json", ...ch } });
    } catch (e) {
      return new Response(JSON.stringify({ error: "فشل جلب سجل الامتحانات" }), { status: 500, headers: { "Content-Type": "application/json", ...ch } });
    }
  }

  // جلب تقدم الطالب في كورس معين
  if (path.match(/^\/api\/courses\/\d+\/progress$/) && request.method === "GET") {
    const courseId = path.split("/")[3];
    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...ch } });

    const userId = authCheck.userId;

    const completedLessonsQuery = await env.DB.prepare(`
      SELECT p.lesson_id 
      FROM student_progress p 
      JOIN lessons l ON p.lesson_id = l.id 
      WHERE p.user_id = ? AND l.course_id = ?
    `).bind(userId, courseId).all();
    const completedLessons = completedLessonsQuery.results.map(row => row.lesson_id);

    let completedVideos = [];
    try {
      const completedVideosQuery = await env.DB.prepare(
        "SELECT video_key FROM student_video_progress WHERE user_id = ? AND course_id = ?"
      ).bind(userId, courseId).all();
      completedVideos = completedVideosQuery.results.map(row => row.video_key);
    } catch (e) {}

    return new Response(JSON.stringify({ completedLessons, completedVideos }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // جلب معرفات الكورسات التي اشترك فيها الطالب
  if (path === "/api/my-enrollments" && request.method === "GET") {
    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...ch } });

    const enrollments = await env.DB.prepare("SELECT course_id FROM enrollments WHERE user_id = ?").bind(authCheck.userId).all();
    const enrolledCourseIds = enrollments.results.map(e => e.course_id);

    return new Response(JSON.stringify(enrolledCourseIds), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // جلب بيانات لوحة تحكم الطالب
  if (path === "/api/my-dashboard" && request.method === "GET") {
    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...ch } });

    const userId = authCheck.userId;

    // التحسين: Cache API للـ dashboard (بيانات شخصية لا تتغير كثيراً)
    const dashCacheKey = `https://cache.internal/dashboard/${userId}`;
    const cachedDash = await getCacheAPIResponse(dashCacheKey);
    if (cachedDash) {
      const data = await cachedDash.json();
      return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...ch } });
    }

    const userRecord = await env.DB.prepare("SELECT wallet_balance FROM users WHERE id = ?").bind(userId).first();
    const walletBalance = userRecord ? userRecord.wallet_balance : 0;

    const enrollments = await env.DB.prepare("SELECT course_id FROM enrollments WHERE user_id = ?").bind(userId).all();
    const totalCourses = enrollments.results.length;

    const completed = await env.DB.prepare("SELECT COUNT(*) as count FROM student_progress WHERE user_id = ?").bind(userId).first();
    const completedLessons = completed.count;

    const coursesQuery = `
      SELECT c.id, c.title, c.image_url,
             (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) as total_lessons,
             (SELECT COUNT(*) FROM student_progress p JOIN lessons l ON p.lesson_id = l.id WHERE l.course_id = c.id AND p.user_id = e.user_id) as completed_lessons
      FROM courses c
      JOIN enrollments e ON c.id = e.course_id
      WHERE e.user_id = ?
    `;
    const enrolledCourses = await env.DB.prepare(coursesQuery).bind(userId).all();

    const dashData = {
      stats: { totalCourses, completedLessons, walletBalance },
      enrolledCourses: enrolledCourses.results
    };

    // كاش الـ dashboard لمدة 2 دقيقة (120 ثانية) — مجاناً عبر Cache API
    await putCacheAPIResponse(dashCacheKey, dashData, 120);

    return new Response(JSON.stringify(dashData), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // ============================================================================
  // شحن المحفظة بالأكواد — محمي بـ Two-Tier Rate Limiter
  // ============================================================================
  if (path === "/api/wallet/charge" && request.method === "POST") {
    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...ch } });

    const userId = authCheck.userId;

    // فحص الـ Rate Limit بالطبقتين
    const rateCheck = await checkRateLimit(userId, env);
    if (!rateCheck.allowed) {
      return new Response(JSON.stringify({
        error: `لقد تجاوزت الحد الأقصى للمحاولات الخاطئة. يرجى المحاولة بعد ${rateCheck.minutesLeft} دقيقة.`
      }), { status: 429, headers: { "Content-Type": "application/json", ...ch } });
    }

    const body = await request.json();
    const code = body.code;

    if (!code) return new Response(JSON.stringify({ error: "كود الشحن مطلوب" }), { status: 400, headers: { "Content-Type": "application/json", ...ch } });

    // Atomic Update — يحمي من Race Condition
    const activationCode = await env.DB.prepare(`
      UPDATE activation_codes 
      SET is_used = 1, used_by = ?, used_at = CURRENT_TIMESTAMP 
      WHERE code = ? AND is_used = 0 
      RETURNING id, amount
    `).bind(userId, code).first();

    if (!activationCode) {
      const attemptCount = await recordFailedAttempt(userId, env);
      const remaining = Math.max(0, MAX_ATTEMPTS - attemptCount);
      const errorMsg = remaining === 0
        ? `تم حظر ميزة الشحن لمدة 15 دقيقة بسبب كثرة المحاولات الخاطئة.`
        : `الكود غير صحيح أو تم استخدامه مسبقاً. (يتبقى لك ${remaining} محاولات)`;

      return new Response(JSON.stringify({ error: errorMsg }), { status: 400, headers: { "Content-Type": "application/json", ...ch } });
    }

    // نجاح: تصفير عداد المحاولات
    await clearRateLimit(userId, env);

    await env.DB.prepare(
      "UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?"
    ).bind(activationCode.amount, userId).run();

    const updatedUser = await env.DB.prepare("SELECT wallet_balance FROM users WHERE id = ?").bind(userId).first();

    return new Response(JSON.stringify({ success: true, newBalance: updatedUser.wallet_balance, addedAmount: activationCode.amount }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // الاشتراك في الكورس
  if (path === "/api/enroll" && request.method === "POST") {
    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...ch } });

    const userId = authCheck.userId;
    const body = await request.json();
    const course_id = body.course_id;

    const course = await env.DB.prepare("SELECT is_free, price FROM courses WHERE id = ?").bind(course_id).first();
    if (!course) return new Response(JSON.stringify({ error: "الكورس غير موجود" }), { status: 404, headers: { "Content-Type": "application/json", ...ch } });

    if (course.is_free === 1) {
      try {
        await env.DB.prepare("INSERT INTO enrollments (user_id, course_id) VALUES (?, ?)").bind(userId, course_id).run();
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...ch } });
      } catch (e) {
        return new Response(JSON.stringify({ error: "أنت مشترك بالفعل في هذا الكورس" }), { status: 400, headers: { "Content-Type": "application/json", ...ch } });
      }
    } else {
      const user = await env.DB.prepare("SELECT wallet_balance FROM users WHERE id = ?").bind(userId).first();

      if (user.wallet_balance < course.price) {
        return new Response(JSON.stringify({ error: "رصيد المحفظة غير كافٍ. يرجى شحن رصيدك أولاً من صفحة حسابك." }), { status: 402, headers: { "Content-Type": "application/json", ...ch } });
      }

      try {
        await env.DB.batch([
          env.DB.prepare("UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?").bind(course.price, userId),
          env.DB.prepare("INSERT INTO enrollments (user_id, course_id) VALUES (?, ?)").bind(userId, course_id)
        ]);

        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...ch } });
      } catch (e) {
        return new Response(JSON.stringify({ error: "أنت مشترك بالفعل في هذا الكورس" }), { status: 400, headers: { "Content-Type": "application/json", ...ch } });
      }
    }
  }

  // حفظ تقدم الطالب (إنهاء المحاضرة)
  if (path === "/api/progress" && request.method === "POST") {
    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...ch } });

    const body = await request.json();
    const lessonId = body.lessonId;
    const userId = authCheck.userId;

    const lesson = await env.DB.prepare("SELECT course_id FROM lessons WHERE id = ?").bind(lessonId).first();
    if (!lesson) return new Response(JSON.stringify({ error: "المحاضرة غير موجودة" }), { status: 404, headers: { "Content-Type": "application/json", ...ch } });

    const isEnrolled = await env.DB.prepare("SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?").bind(userId, lesson.course_id).first();
    if (!isEnrolled) return new Response(JSON.stringify({ error: "غير مصرح لك. يجب الاشتراك أولاً." }), { status: 403, headers: { "Content-Type": "application/json", ...ch } });

    const existingProgress = await env.DB.prepare(
      "SELECT id FROM student_progress WHERE user_id = ? AND lesson_id = ?"
    ).bind(userId, lessonId).first();

    if (!existingProgress) {
      await env.DB.prepare(
        "INSERT INTO student_progress (user_id, lesson_id, is_completed, completed_at) VALUES (?, ?, 1, CURRENT_TIMESTAMP)"
      ).bind(userId, lessonId).run();
    }

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // حفظ تقدم فيديو معين
  if (path === "/api/progress/video" && request.method === "POST") {
    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...ch } });

    const body = await request.json();
    const { courseId, lessonId, videoKey } = body;
    const userId = authCheck.userId;

    const isEnrolled = await env.DB.prepare("SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?").bind(userId, courseId).first();
    if (!isEnrolled) return new Response(JSON.stringify({ error: "غير مصرح لك." }), { status: 403, headers: { "Content-Type": "application/json", ...ch } });

    try {
      const existingProgress = await env.DB.prepare(
        "SELECT id FROM student_video_progress WHERE user_id = ? AND video_key = ?"
      ).bind(userId, videoKey).first();

      if (!existingProgress) {
        await env.DB.prepare(
          "INSERT INTO student_video_progress (user_id, course_id, lesson_id, video_key, completed_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)"
        ).bind(userId, courseId, lessonId, videoKey).run();
      }
    } catch (e) {}

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // تصحيح وحفظ نتيجة امتحان الطالب
  if (path === "/api/progress/quiz" && request.method === "POST") {
    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...ch } });

    const body = await request.json();
    const { lessonId, answers } = body;
    const userId = authCheck.userId;

    try {
      const lesson = await env.DB.prepare("SELECT course_id FROM lessons WHERE id = ?").bind(lessonId).first();
      if (!lesson) return new Response(JSON.stringify({ error: "المحاضرة غير موجودة" }), { status: 404, headers: { "Content-Type": "application/json", ...ch } });

      const isEnrolled = await env.DB.prepare("SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?").bind(userId, lesson.course_id).first();
      if (!isEnrolled) {
        return new Response(JSON.stringify({ error: "غير مصرح لك. يجب الاشتراك أولاً." }), { status: 403, headers: { "Content-Type": "application/json", ...ch } });
      }

      const dbQuestions = await env.DB.prepare("SELECT id, correct_option FROM quizzes WHERE lesson_id = ?").bind(lessonId).all();

      if (!dbQuestions.results || dbQuestions.results.length === 0) {
        return new Response(JSON.stringify({ error: "لا يوجد امتحان متاح" }), { status: 400, headers: { "Content-Type": "application/json", ...ch } });
      }

      let correctCount = 0;
      let finalAnswers = [];

      for (const q of dbQuestions.results) {
        let chosen = null;
        if (Array.isArray(answers)) {
          const ansObj = answers.find(a => a.question_id === q.id || a.id === q.id);
          chosen = ansObj ? (ansObj.chosen_option || ansObj.answer) : null;
        } else if (answers && typeof answers === 'object') {
          chosen = answers[q.id] || answers[q.id.toString()] || null;
        }

        const isCorrect = chosen === q.correct_option;
        if (isCorrect) correctCount++;

        finalAnswers.push({
          question_id: q.id,
          chosen_option: chosen,
          is_correct: isCorrect,
          correct_option: q.correct_option
        });
      }

      const actualScore = Math.round((correctCount / dbQuestions.results.length) * 100);

      await env.DB.prepare(
        "INSERT INTO quiz_attempts (user_id, lesson_id, score, answers_json) VALUES (?, ?, ?, ?)"
      ).bind(userId, lessonId, actualScore, JSON.stringify(finalAnswers)).run();

      return new Response(JSON.stringify({ success: true, score: actualScore, gradedAnswers: finalAnswers }), { headers: { "Content-Type": "application/json", ...ch } });
    } catch (e) {
      // Circuit Breaker: عند ضغط الـ DB نحول للطابور
      if (env.EXAMS_QUEUE) {
        try {
          await env.EXAMS_QUEUE.send({
            userId: userId,
            lessonId: lessonId,
            answers: answers,
            timestamp: Date.now()
          });
          return new Response(JSON.stringify({
            status: "queued",
            message: "نظراً للضغط الحالي، تم استلام إجاباتك بنجاح وجاري تصحيحها. ستظهر النتيجة في ملفك الشخصي قريباً."
          }), { headers: { "Content-Type": "application/json", ...ch } });
        } catch (queueError) {}
      }

      return new Response(JSON.stringify({ error: "حدث خطأ أثناء تصحيح الامتحان" }), { status: 500, headers: { "Content-Type": "application/json", ...ch } });
    }
  }

  return null;
}
