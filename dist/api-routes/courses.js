import { getCorsHeaders } from './utils.js';
import { verifyStudentSession } from './auth.js';

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

export async function handleCourseRoutes(request, env, path, url) {
  const ch = getCorsHeaders(request, env);

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
      const courses = await env.DB.prepare(`
        SELECT c.*, u.name as instructor_name 
        FROM courses c 
        LEFT JOIN users u ON c.instructor_id = u.id 
        WHERE c.instructor_id = ? 
        ORDER BY c.id DESC
      `).bind(instId).all();

      return new Response(JSON.stringify(courses.results), { headers: { "Content-Type": "application/json", ...ch } });

    } else {
      const apiCacheKey = `/api/courses/all`;
      const cacheAPIResult = await getCacheAPI(apiCacheKey);
      if (cacheAPIResult) {
        const data = await cacheAPIResult.text();
        return new Response(data, { headers: { "Content-Type": "application/json", ...ch } });
      }

      if (env.COURSES_CACHE) {
        const cachedCourses = await env.COURSES_CACHE.get("all_courses");
        if (cachedCourses) {
          await putCacheAPI(apiCacheKey, JSON.parse(cachedCourses), 300);
          return new Response(cachedCourses, { headers: { "Content-Type": "application/json", ...ch } });
        }
      }

      // ✅ استخدام الفهرس idx_courses_is_published بشكل صحيح
      const courses = await env.DB.prepare(`
        SELECT c.*, u.name as instructor_name 
        FROM courses c 
        LEFT JOIN users u ON c.instructor_id = u.id 
        WHERE c.is_published = 1
        ORDER BY c.id DESC
      `).all();

      const coursesJson = JSON.stringify(courses.results);

      if (env.COURSES_CACHE) {
        await env.COURSES_CACHE.put("all_courses", coursesJson, { expirationTtl: 86400 });
      }

      await putCacheAPI(apiCacheKey, courses.results, 300);

      return new Response(coursesJson, { headers: { "Content-Type": "application/json", ...ch } });
    }
  }

  if (path.match(/^\/api\/courses\/\d+\/lessons$/) && request.method === "GET") {
    const courseId = path.split("/")[3];

    let authCheck = null;
    const authH = request.headers.get("Authorization");
    if (authH && authH.startsWith("Bearer ")) {
       authCheck = await verifyStudentSession(request, env);
    }

    let hasFullAccess = false;

    if (authCheck && !authCheck.error) {

      // الأدمن يحصل على كامل البيانات دائماً بدون أي قيود
      if (authCheck.role === 'admin') {
        hasFullAccess = true;

      // المدرس يشوف الفيديوهات بس لو هو صاحب الكورس ده
      } else if (authCheck.role === 'instructor') {
        const isOwner = await env.DB.prepare("SELECT id FROM courses WHERE id = ? AND instructor_id = ?").bind(courseId, authCheck.userId).first();
        if (isOwner) {
          hasFullAccess = true;
        }

      // الطالب: لازم يكون مشترك في الكورس عشان يشوف الروابط
      } else if (authCheck.role === 'student') {
        const isEnrolled = await env.DB.prepare("SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?").bind(authCheck.userId, courseId).first();
        if (isEnrolled) {
          hasFullAccess = true;
        }
      }
    }

    // ✅ استخدام الفهرس idx_lessons_course_id و idx_lessons_order
    const lessons = await env.DB.prepare(
      "SELECT * FROM lessons WHERE course_id = ? ORDER BY order_num ASC"
    ).bind(courseId).all();

    let results = lessons.results;

    if (!hasFullAccess) {
      results = results.map(lesson => {
        let dummyUrls = "";
        // إذا كان هناك فيديو بالفعل في قاعدة البيانات، نقوم بحساب عدده ونستبدل كل رابط بكلمة LOCKED
        if (lesson.video_url) {
          const videoCount = lesson.video_url.split(/[,|\s]+/).filter(url => url.trim() !== '').length;
          dummyUrls = Array(videoCount).fill("LOCKED").join(",");
        }
        return {
          ...lesson,
          video_url: dummyUrls
        };
      });
    }

    return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json", ...ch } });
  }

  if (path.match(/^\/api\/lessons\/\d+\/quiz$/) && request.method === "GET") {
    const lessonId = path.split("/")[3];

    let authCheck = null;
    const authH = request.headers.get("Authorization");
    if (authH && authH.startsWith("Bearer ")) {
       authCheck = await verifyStudentSession(request, env);
    }

    const lesson = await env.DB.prepare("SELECT course_id FROM lessons WHERE id = ?").bind(lessonId).first();
    if (!lesson) return new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json", ...ch } });

    let hasFullAccess = false;

    if (authCheck && !authCheck.error) {

      // الأدمن يشوف كل الامتحانات بدون قيود
      if (authCheck.role === 'admin') {
        hasFullAccess = true;

      // الطالب: لازم يكون مشترك في الكورس
      } else if (authCheck.role === 'student') {
        const isEnrolled = await env.DB.prepare("SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?").bind(authCheck.userId, lesson.course_id).first();
        if (isEnrolled) {
          hasFullAccess = true;
        }

      // المدرس: بس لو هو صاحب الكورس ده
      } else if (authCheck.role === 'instructor') {
        const isOwner = await env.DB.prepare("SELECT id FROM courses WHERE id = ? AND instructor_id = ?").bind(lesson.course_id, authCheck.userId).first();
        if (isOwner) {
          hasFullAccess = true;
        }
      }
    }

    // ✅ استخدام الفهرس idx_quizzes_lesson_id
    const quiz = await env.DB.prepare(
      "SELECT * FROM quizzes WHERE lesson_id = ?"
    ).bind(lessonId).all();

    let results = quiz.results || [];

    if (!hasFullAccess) {
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
