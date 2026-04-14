import { getCorsHeaders } from './utils.js';
import { verifyStudentSession } from './auth.js';

// ============================================================================
// دوال Cache API المجانية (استراتيجية Gemini)
// Cloudflare Cache API = CDN كاش مجاني تماماً على كل الـ edge nodes
// مناسبة للبيانات العامة التي يراها الجميع
// ============================================================================
async function getCacheAPI(cacheKey) {
  try {
    const cache = caches.default;
    const cached = await cache.match(new Request(`https://cache.internal${cacheKey}`));
    if (cached) return cached.clone();
    return null;
  } catch (e) {
    return null;
  }
}

async function putCacheAPI(cacheKey, jsonData, ttlSeconds) {
  try {
    const cache = caches.default;
    const response = new Response(JSON.stringify(jsonData), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${ttlSeconds}`,
      }
    });
    await cache.put(new Request(`https://cache.internal${cacheKey}`), response);
  } catch (e) {}
}

async function deleteCacheAPI(cacheKey) {
  try {
    const cache = caches.default;
    await cache.delete(new Request(`https://cache.internal${cacheKey}`));
  } catch (e) {}
}

// ============================================================================
// handleCourseRoutes — كل مسارات الكورسات
// ============================================================================
export async function handleCourseRoutes(request, env, path, url) {
  const ch = getCorsHeaders(request, env);

  // جلب الكورسات — نظام كاش متعدد الطبقات
  if (path === "/api/courses" && request.method === "GET") {
    let isInstructor = false;
    let instId = null;

    const authH = request.headers.get("Authorization");
    if (authH && authH.startsWith("Bearer ")) {
      try {
        const token = authH.split(" ")[1];
        const sessionData = JSON.parse(atob(token));
        const u = await env.DB.prepare("SELECT id, role FROM users WHERE id = ?").bind(sessionData.userId).first();
        if (u && u.role === 'instructor') {
          isInstructor = true;
          instId = u.id;
        }
      } catch (e) {}
    }

    if (isInstructor) {
      // المدرس يرى كورساته من DB مباشرة (يحتاج البيانات اللحظية)
      const courses = await env.DB.prepare(`
        SELECT c.*, u.name as instructor_name 
        FROM courses c 
        LEFT JOIN users u ON c.instructor_id = u.id 
        WHERE c.instructor_id = ? 
        ORDER BY c.id DESC
      `).bind(instId).all();

      return new Response(JSON.stringify(courses.results), { headers: { "Content-Type": "application/json", ...ch } });

    } else {
      // الطلاب والزوار: نظام كاش ثلاثي الطبقات

      // الطبقة 1: Cache API (مجانية تماماً — أسرع طبقة)
      const apiCacheKey = `/api/courses/all`;
      const cacheAPIResult = await getCacheAPI(apiCacheKey);
      if (cacheAPIResult) {
        const data = await cacheAPIResult.text();
        return new Response(data, { headers: { "Content-Type": "application/json", ...ch } });
      }

      // الطبقة 2: KV Cache (مدفوعة لكن مشتركة بين كل الـ instances)
      if (env.COURSES_CACHE) {
        const cachedCourses = await env.COURSES_CACHE.get("all_courses");
        if (cachedCourses) {
          // نملأ الـ Cache API أيضاً لتخفيف قراءات KV
          await putCacheAPI(apiCacheKey, JSON.parse(cachedCourses), 300);
          return new Response(cachedCourses, { headers: { "Content-Type": "application/json", ...ch } });
        }
      }

      // الطبقة 3: D1 Database (المصدر الحقيقي)
      const courses = await env.DB.prepare(`
        SELECT c.*, u.name as instructor_name 
        FROM courses c 
        LEFT JOIN users u ON c.instructor_id = u.id 
        ORDER BY c.id DESC
      `).all();

      const coursesJson = JSON.stringify(courses.results);

      // نحفظ في KV لمدة 24 ساعة
      if (env.COURSES_CACHE) {
        await env.COURSES_CACHE.put("all_courses", coursesJson, { expirationTtl: 86400 });
      }

      // ونحفظ في Cache API لمدة 5 دقائق (مجاناً)
      await putCacheAPI(apiCacheKey, courses.results, 300);

      return new Response(coursesJson, { headers: { "Content-Type": "application/json", ...ch } });
    }
  }

  // 🛡️ التعديل هنا: جدار الحماية للمحاضرات (Data Masking بدلاً من الحظر الكامل)
  if (path.match(/^\/api\/courses\/\d+\/lessons$/) && request.method === "GET") {
    const courseId = path.split("/")[3];

    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...ch } });

    let hasFullAccess = true;

    // فحص ما إذا كان للمستخدم حق الوصول الكامل للروابط
    if (authCheck.role === 'student') {
      const isEnrolled = await env.DB.prepare("SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?").bind(authCheck.userId, courseId).first();
      if (!isEnrolled) {
        hasFullAccess = false; // الطالب غير مشترك: نمنع الروابط ونكتفي بالعناوين
      }
    } else if (authCheck.role === 'instructor') {
      const isOwner = await env.DB.prepare("SELECT id FROM courses WHERE id = ? AND instructor_id = ?").bind(courseId, authCheck.userId).first();
      if (!isOwner) {
        hasFullAccess = false; // المدرس لا يملك الكورس: نمنع الروابط ونكتفي بالعناوين
      }
    }

    const lessons = await env.DB.prepare(
      "SELECT * FROM lessons WHERE course_id = ? ORDER BY order_num ASC"
    ).bind(courseId).all();

    let results = lessons.results;

    // حجب البيانات الحساسة (Data Masking)
    if (!hasFullAccess) {
      results = results.map(lesson => ({
        ...lesson,
        video_url: "" // تفريغ رابط الفيديو لضمان حمايته وعدم وصوله لمتصفح المستخدم إطلاقاً
      }));
    }

    return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // 🛡️ التعديل هنا: جدار الحماية للامتحانات (Data Masking بدلاً من الحظر الكامل)
  if (path.match(/^\/api\/lessons\/\d+\/quiz$/) && request.method === "GET") {
    const lessonId = path.split("/")[3];

    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...ch } });

    const lesson = await env.DB.prepare("SELECT course_id FROM lessons WHERE id = ?").bind(lessonId).first();
    if (!lesson) return new Response(JSON.stringify([])), { headers: { "Content-Type": "application/json", ...ch } };

    let hasFullAccess = true;

    if (authCheck.role === 'student') {
      const isEnrolled = await env.DB.prepare("SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?").bind(authCheck.userId, lesson.course_id).first();
      if (!isEnrolled) {
        hasFullAccess = false; // الطالب غير مشترك: نمنع أسئلة الامتحان الحقيقية
      }
    } else if (authCheck.role === 'instructor') {
      const isOwner = await env.DB.prepare("SELECT id FROM courses WHERE id = ? AND instructor_id = ?").bind(lesson.course_id, authCheck.userId).first();
      if (!isOwner) {
        hasFullAccess = false; // المدرس لا يملك الكورس: نمنع أسئلة الامتحان الحقيقية
      }
    }

    const quiz = await env.DB.prepare(
      "SELECT * FROM quizzes WHERE lesson_id = ?"
    ).bind(lessonId).all();

    let results = quiz.results || [];

    // حجب البيانات الحساسة (Data Masking)
    if (!hasFullAccess) {
      // نرسل فقط الـ id لإعلام الواجهة الأمامية بأن هناك أسئلة (ليظهر زر الامتحان)، لكن بدون النص والإجابات
      results = results.map(q => ({
        id: q.id
      }));
    }

    return new Response(JSON.stringify(results), {
      headers: { "Content-Type": "application/json", ...ch }
    });
  }

  return null;
}

// ============================================================================
// دالة مساعدة: تُستدعى من instructor.js و admin.js عند أي تعديل على الكورسات
// تمسح كل طبقات الكاش لضمان أن الطلاب يرون البيانات المحدّثة
// ============================================================================
export async function invalidateCoursesCache(env) {
  try {
    if (env.COURSES_CACHE) {
      await env.COURSES_CACHE.delete("all_courses");
    }
    await deleteCacheAPI('/api/courses/all');
  } catch (e) {
    console.warn("Cache invalidation failed:", e.message);
  }
}
