import { corsHeaders } from './utils.js';
import { verifyStudentSession } from './auth.js';

// ============================================================================
// نظام حماية ضد التخمين (Rate Limiter) لكروت الشحن في ذاكرة السيرفر
// ============================================================================
const chargeAttempts = new Map();
const MAX_ATTEMPTS = 5; // أقصى عدد للمحاولات الخاطئة
const LOCKOUT_TIME = 15 * 60 * 1000; // مدة الحظر: 15 دقيقة بالمللي ثانية

export async function handleStudentRoutes(request, env, path, url) {
  
  // مسار تحديث الملف الشخصي (إضافة رقم التليفون للطلاب)
  if (path === "/api/my-profile" && request.method === "PUT") {
    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...corsHeaders } });
    
    const body = await request.json();
    if (body.phone !== undefined) {
      await env.DB.prepare("UPDATE users SET phone = ? WHERE id = ?").bind(body.phone, authCheck.userId).run();
    }
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // جلب سجل امتحانات الطالب (للعرض في صفحة البروفايل)
  if (path === "/api/my-quizzes" && request.method === "GET") {
    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...corsHeaders } });

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
      
      return new Response(JSON.stringify(attempts.results), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    } catch (e) {
      return new Response(JSON.stringify({ error: "فشل جلب سجل الامتحانات" }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }
  }

  // جلب تقدم الطالب في كورس معين
  if (path.match(/^\/api\/courses\/\d+\/progress$/) && request.method === "GET") {
    const courseId = path.split("/")[3];
    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...corsHeaders } });
    
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
    } catch (e) {
    }

    return new Response(JSON.stringify({ completedLessons, completedVideos }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // جلب معرفات الكورسات التي اشترك فيها الطالب
  if (path === "/api/my-enrollments" && request.method === "GET") {
    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...corsHeaders } });
    
    const enrollments = await env.DB.prepare("SELECT course_id FROM enrollments WHERE user_id = ?").bind(authCheck.userId).all();
    const enrolledCourseIds = enrollments.results.map(e => e.course_id);
    
    return new Response(JSON.stringify(enrolledCourseIds), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // جلب بيانات لوحة تحكم الطالب (Profile Dashboard)
  if (path === "/api/my-dashboard" && request.method === "GET") {
    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...corsHeaders } });
    
    const userId = authCheck.userId;

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

    return new Response(JSON.stringify({
      stats: { totalCourses, completedLessons, walletBalance }, 
      enrolledCourses: enrolledCourses.results
    }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // ميزة شحن المحفظة بالأكواد + الحماية ضد التخمين (Rate Limiting) 🔒
  if (path === "/api/wallet/charge" && request.method === "POST") {
    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...corsHeaders } });
    
    const userId = authCheck.userId;
    const now = Date.now();
    
    // التحقق من حالة الحظر للطالب
    const userAttempts = chargeAttempts.get(userId) || { count: 0, lockoutUntil: 0 };
    if (userAttempts.lockoutUntil > now) {
      const minutesLeft = Math.ceil((userAttempts.lockoutUntil - now) / 60000);
      return new Response(JSON.stringify({ error: `لقد تجاوزت الحد الأقصى للمحاولات الخاطئة. يرجى المحاولة بعد ${minutesLeft} دقيقة.` }), { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    const body = await request.json();
    const code = body.code;

    if (!code) return new Response(JSON.stringify({ error: "كود الشحن مطلوب" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
    
    const activationCode = await env.DB.prepare("SELECT * FROM activation_codes WHERE code = ? AND is_used = 0").bind(code).first();
    
    if (!activationCode) {
      // تسجيل المحاولة الخاطئة
      userAttempts.count += 1;
      if (userAttempts.count >= MAX_ATTEMPTS) {
        userAttempts.lockoutUntil = now + LOCKOUT_TIME;
        userAttempts.count = 0; // تصفير العداد بعد تطبيق الحظر ليبدأ من جديد بعد انتهائه
      }
      chargeAttempts.set(userId, userAttempts);
      
      const remainingAttempts = MAX_ATTEMPTS - userAttempts.count;
      const errorMsg = userAttempts.lockoutUntil > now 
        ? `تم حظر ميزة الشحن لمدة 15 دقيقة بسبب كثرة المحاولات الخاطئة.`
        : `الكود غير صحيح أو تم استخدامه مسبقاً. (يتبقى لك ${remainingAttempts} محاولات)`;
        
      return new Response(JSON.stringify({ error: errorMsg }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    // الكود صحيح: تصفير عداد المحاولات الخاطئة
    chargeAttempts.delete(userId);

    // تحديث رصيد الطالب وحرق الكود
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?").bind(activationCode.amount, userId),
      env.DB.prepare("UPDATE activation_codes SET is_used = 1, used_by = ?, used_at = CURRENT_TIMESTAMP WHERE id = ?").bind(userId, activationCode.id)
    ]);
    
    const updatedUser = await env.DB.prepare("SELECT wallet_balance FROM users WHERE id = ?").bind(userId).first();

    return new Response(JSON.stringify({ success: true, newBalance: updatedUser.wallet_balance, addedAmount: activationCode.amount }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // الاشتراك في الكورس بالدفع من المحفظة
  if (path === "/api/enroll" && request.method === "POST") {
    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...corsHeaders } });
    
    const userId = authCheck.userId;
    const body = await request.json();
    const course_id = body.course_id;

    const course = await env.DB.prepare("SELECT is_free, price FROM courses WHERE id = ?").bind(course_id).first();
    if (!course) return new Response(JSON.stringify({ error: "الكورس غير موجود" }), { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } });

    if (course.is_free === 1) {
      try {
        await env.DB.prepare("INSERT INTO enrollments (user_id, course_id) VALUES (?, ?)").bind(userId, course_id).run();
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
      } catch (e) {
        return new Response(JSON.stringify({ error: "أنت مشترك بالفعل في هذا الكورس" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    } else {
      const user = await env.DB.prepare("SELECT wallet_balance FROM users WHERE id = ?").bind(userId).first();
      
      if (user.wallet_balance < course.price) {
        return new Response(JSON.stringify({ error: "رصيد المحفظة غير كافٍ. يرجى شحن رصيدك أولاً من صفحة حسابك." }), { status: 402, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }

      try {
        await env.DB.batch([
          env.DB.prepare("UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?").bind(course.price, userId),
          env.DB.prepare("INSERT INTO enrollments (user_id, course_id) VALUES (?, ?)").bind(userId, course_id)
        ]);
        
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
      } catch (e) {
        return new Response(JSON.stringify({ error: "أنت مشترك بالفعل في هذا الكورس" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    }
  }

  // حفظ تقدم الطالب (إنهاء المحاضرة) - محمية أمنياً 🔒
  if (path === "/api/progress" && request.method === "POST") {
    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...corsHeaders } });
    
    const body = await request.json();
    const lessonId = body.lessonId;
    const userId = authCheck.userId;

    // حماية: التأكد أن الطالب مشترك فعلاً
    const lesson = await env.DB.prepare("SELECT course_id FROM lessons WHERE id = ?").bind(lessonId).first();
    if (!lesson) return new Response(JSON.stringify({ error: "المحاضرة غير موجودة" }), { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } });
    
    const isEnrolled = await env.DB.prepare("SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?").bind(userId, lesson.course_id).first();
    if (!isEnrolled) return new Response(JSON.stringify({ error: "غير مصرح لك. يجب الاشتراك أولاً." }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });

    const existingProgress = await env.DB.prepare(
      "SELECT id FROM student_progress WHERE user_id = ? AND lesson_id = ?"
    ).bind(userId, lessonId).first();

    if (!existingProgress) {
      await env.DB.prepare(
        "INSERT INTO student_progress (user_id, lesson_id, is_completed, completed_at) VALUES (?, ?, 1, CURRENT_TIMESTAMP)"
      ).bind(userId, lessonId).run();
    }

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // حفظ تقدم فيديو معين - محمية أمنياً 🔒
  if (path === "/api/progress/video" && request.method === "POST") {
    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...corsHeaders } });

    const body = await request.json();
    const { courseId, lessonId, videoKey } = body;
    const userId = authCheck.userId;

    // حماية: التأكد أن الطالب مشترك
    const isEnrolled = await env.DB.prepare("SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?").bind(userId, courseId).first();
    if (!isEnrolled) return new Response(JSON.stringify({ error: "غير مصرح لك." }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });

    try {
      const existingProgress = await env.DB.prepare(
        "SELECT id FROM student_video_progress WHERE user_id = ? AND video_key = ?"
      ).bind(userId, videoKey).first();

      if (!existingProgress) {
        await env.DB.prepare(
          "INSERT INTO student_video_progress (user_id, course_id, lesson_id, video_key, completed_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)"
        ).bind(userId, courseId, lessonId, videoKey).run();
      }
    } catch (e) {
    }

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // تصحيح وحفظ نتيجة امتحان الطالب - معاد بناءها بالكامل أمنياً 🔒
  if (path === "/api/progress/quiz" && request.method === "POST") {
    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...corsHeaders } });

    const body = await request.json();
    // السيرفر يستقبل فقط إجابات الطالب، ولن يثق بدرجة الـ score القادمة من المتصفح
    const { lessonId, answers } = body; 
    const userId = authCheck.userId;

    try {
      // 1. التأكد أن الطالب مشترك في الكورس التابع له هذا الامتحان
      const lesson = await env.DB.prepare("SELECT course_id FROM lessons WHERE id = ?").bind(lessonId).first();
      if (!lesson) return new Response(JSON.stringify({ error: "المحاضرة غير موجودة" }), { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } });

      const isEnrolled = await env.DB.prepare("SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?").bind(userId, lesson.course_id).first();
      if (!isEnrolled) {
        return new Response(JSON.stringify({ error: "غير مصرح لك. يجب الاشتراك أولاً." }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }

      // 2. جلب الأسئلة وإجاباتها الصحيحة من السيرفر (سراً)
      const dbQuestions = await env.DB.prepare("SELECT id, correct_option FROM quizzes WHERE lesson_id = ?").bind(lessonId).all();
      
      if (!dbQuestions.results || dbQuestions.results.length === 0) {
        return new Response(JSON.stringify({ error: "لا يوجد امتحان متاح" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }

      let correctCount = 0;
      let finalAnswers = [];

      // 3. مطابقة إجابات الطالب بالإجابات الصحيحة وحساب الدرجة
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

      // حساب النسبة المئوية
      const actualScore = Math.round((correctCount / dbQuestions.results.length) * 100);

      // 4. حفظ النتيجة المصححة في قاعدة البيانات
      await env.DB.prepare(
        "INSERT INTO quiz_attempts (user_id, lesson_id, score, answers_json) VALUES (?, ?, ?, ?)"
      ).bind(userId, lessonId, actualScore, JSON.stringify(finalAnswers)).run();
      
      return new Response(JSON.stringify({ success: true, score: actualScore, gradedAnswers: finalAnswers }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    } catch (e) {
      return new Response(JSON.stringify({ error: "حدث خطأ أثناء تصحيح الامتحان" }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }
  }

  return null;
}
