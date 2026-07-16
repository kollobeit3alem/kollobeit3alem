import { getCorsHeaders } from './utils.js';
import { invalidateCoursesCache } from './courses.js';

export async function handleAdminRoutes(request, env, path, url, adminUser) {
  const ch = getCorsHeaders(request, env);

  // 1. جلب كل المستخدمين
  if (path === "/api/admin/users" && request.method === "GET") {
    const page = parseInt(url.searchParams.get("page")) || 1;
    const limit = parseInt(url.searchParams.get("limit")) || 50;
    const search = url.searchParams.get("search") || "";
    const type = url.searchParams.get("type") || "all";
    const offset = (page - 1) * limit;

    let baseWhere = `FROM users`;
    let whereClauses = [];
    let params = [];
    let countParams = [];

    if (type === 'students') {
      whereClauses.push(`role = 'student'`);
    } else if (type === 'staff') {
      whereClauses.push(`role IN ('admin', 'instructor', 'assistant')`);
    }

    if (search) {
      whereClauses.push(`(name LIKE ? OR email LIKE ? OR phone LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (whereClauses.length > 0) {
      baseWhere += ` WHERE ` + whereClauses.join(' AND ');
    }

    const query = `SELECT id, name, email, phone, role, created_at ${baseWhere} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const countQuery = `SELECT COUNT(*) as total ${baseWhere}`;
    params.push(limit, offset);

    const usersList = await env.DB.prepare(query).bind(...params).all();
    const countRes = await env.DB.prepare(countQuery).bind(...countParams).first();

    return new Response(JSON.stringify({
      users: usersList.results,
      total: countRes.total,
      page: page,
      limit: limit
    }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // 2. حذف مستخدم
  if (path.match(/^\/api\/admin\/users\/\d+$/) && request.method === "DELETE") {
    const userId = path.split("/")[4];

    await env.DB.prepare("DELETE FROM enrollments WHERE user_id = ?").bind(userId).run();
    await env.DB.prepare("DELETE FROM student_progress WHERE user_id = ?").bind(userId).run();
    await env.DB.prepare("DELETE FROM student_video_progress WHERE user_id = ?").bind(userId).run();
    await env.DB.prepare("DELETE FROM quiz_attempts WHERE user_id = ?").bind(userId).run();
    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();

    // مسح session الطالب من KV
    if (env.COURSES_CACHE) {
      await env.COURSES_CACHE.delete(`session:${userId}`);
    }

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // تعديل مستخدم
  if (path.match(/^\/api\/admin\/users\/\d+$/) && request.method === "PUT") {
    const userId = path.split("/")[4];
    const body = await request.json();

    const currentUser = await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(userId).first();

    await env.DB.prepare("UPDATE users SET name = ?, role = ?, phone = ? WHERE id = ?")
      .bind(body.name, body.role, body.phone || null, userId).run();

    if (currentUser && currentUser.role === 'student' && body.role !== 'student') {
      await env.DB.prepare("DELETE FROM enrollments WHERE user_id = ?").bind(userId).run();
      await env.DB.prepare("DELETE FROM student_progress WHERE user_id = ?").bind(userId).run();
      await env.DB.prepare("DELETE FROM student_video_progress WHERE user_id = ?").bind(userId).run();
      await env.DB.prepare("DELETE FROM quiz_attempts WHERE user_id = ?").bind(userId).run();
    }

    // تحديث الـ session في KV بالرتبة الجديدة
    if (env.COURSES_CACHE) {
      const existingSession = await env.COURSES_CACHE.get(`session:${userId}`, { type: 'json' });
      if (existingSession) {
        await env.COURSES_CACHE.put(
          `session:${userId}`,
          JSON.stringify({ sessionId: existingSession.sessionId, role: body.role }),
          { expirationTtl: 86400 }
        );
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // 3. ترقية رتبة المستخدم بالإيميل
  if (path === "/api/admin/users/role" && request.method === "PUT") {
    const body = await request.json();

    const currentUser = await env.DB.prepare("SELECT id, role FROM users WHERE email = ?").bind(body.email).first();

    if (!currentUser) {
      return new Response(JSON.stringify({ error: "المستخدم غير موجود" }), { status: 404, headers: { "Content-Type": "application/json", ...ch } });
    }

    await env.DB.prepare("UPDATE users SET role = ? WHERE email = ?").bind(body.role, body.email).run();

    if (currentUser.role === 'student' && body.role !== 'student') {
      const userId = currentUser.id;
      await env.DB.prepare("DELETE FROM enrollments WHERE user_id = ?").bind(userId).run();
      await env.DB.prepare("DELETE FROM student_progress WHERE user_id = ?").bind(userId).run();
      await env.DB.prepare("DELETE FROM student_video_progress WHERE user_id = ?").bind(userId).run();
      await env.DB.prepare("DELETE FROM quiz_attempts WHERE user_id = ?").bind(userId).run();
    }

    // تحديث الـ session في KV بالرتبة الجديدة
    if (env.COURSES_CACHE) {
      const existingSession = await env.COURSES_CACHE.get(`session:${currentUser.id}`, { type: 'json' });
      if (existingSession) {
        await env.COURSES_CACHE.put(
          `session:${currentUser.id}`,
          JSON.stringify({ sessionId: existingSession.sessionId, role: body.role }),
          { expirationTtl: 86400 }
        );
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // 4. تقارير الطلاب الشاملة
  if (path.match(/^\/api\/admin\/reports\/\d+$/) && request.method === "GET") {
    const studentId = parseInt(path.split("/")[4], 10);
    let enrollments = [];
    let progress = [];
    let quizzes = [];

    try {
      const eRes = await env.DB.prepare(
        "SELECT c.title, e.* FROM enrollments e JOIN courses c ON e.course_id = c.id WHERE e.user_id = ?"
      ).bind(studentId).all();
      enrollments = eRes.results;
    } catch (e) { console.error(e); }

    try {
      const pRes = await env.DB.prepare(
        "SELECT l.title as lesson_title, c.title as course_title, p.* FROM student_progress p JOIN lessons l ON p.lesson_id = l.id JOIN courses c ON l.course_id = c.id WHERE p.user_id = ?"
      ).bind(studentId).all();
      progress = pRes.results;
    } catch (e) { console.error(e); }

    try {
      const qRes = await env.DB.prepare(
        "SELECT q.score, q.attempted_at, l.title as lesson_title, c.title as course_title FROM quiz_attempts q JOIN lessons l ON q.lesson_id = l.id JOIN courses c ON l.course_id = c.id WHERE q.user_id = ? ORDER BY q.attempted_at DESC"
      ).bind(studentId).all();
      quizzes = qRes.results;
    } catch (e) { console.error(e); }

    return new Response(JSON.stringify({ enrollments, progress, quizzes }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // 5. إضافة كورس جديد
  if (path === "/api/admin/courses" && request.method === "POST") {
    const body = await request.json();
    const isFree = body.is_free !== undefined ? body.is_free : 1;
    const price = parseFloat(body.price) || 0;

    if (price < 0) {
      return new Response(JSON.stringify({ error: "السعر لا يمكن أن يكون قيمة سالبة" }), { status: 400, headers: { "Content-Type": "application/json", ...ch } });
    }

    await env.DB.prepare(
      "INSERT INTO courses (title, description, image_url, instructor_contact, is_free, price, instructor_id, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(body.title, body.description, body.image_url, body.instructor_contact || "", isFree, price, adminUser.id, body.metadata || null).run();

    // التحسين: مسح كاش الكورسات فوراً
    await invalidateCoursesCache(env);

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // حذف كورس
  if (path.match(/^\/api\/admin\/courses\/\d+$/) && request.method === "DELETE") {
    const courseId = path.split("/")[4];

    // الخطوة 1: مسح سجلات الدفع المرتبطة بالكورس أولاً
    // لأن جدول transactions مش عنده CASCADE فلازم نمسحه يدوياً
    await env.DB.prepare("DELETE FROM transactions WHERE course_id = ?").bind(courseId).run();

    // الخطوة 2: مسح الكورس نفسه
    // الباقي (enrollments, lessons, quizzes, progress, video_progress) هيتمسح أوتوماتيك بالـ CASCADE
    await env.DB.prepare("DELETE FROM courses WHERE id = ?").bind(courseId).run();

    // التحسين: مسح كاش الكورسات فوراً
    await invalidateCoursesCache(env);

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // تعديل كورس
  if (path.match(/^\/api\/admin\/courses\/\d+$/) && request.method === "PUT") {
    const courseId = path.split("/")[4];
    const body = await request.json();
    const isFree = body.is_free !== undefined ? body.is_free : 1;
    const price = parseFloat(body.price) || 0;

    if (price < 0) {
      return new Response(JSON.stringify({ error: "السعر لا يمكن أن يكون قيمة سالبة" }), { status: 400, headers: { "Content-Type": "application/json", ...ch } });
    }

    await env.DB.prepare(
      "UPDATE courses SET title = ?, description = ?, image_url = ?, is_free = ?, price = ?, metadata = ? WHERE id = ?"
    ).bind(body.title, body.description, body.image_url, isFree, price, body.metadata || null, courseId).run();

    // التحسين: مسح كاش الكورسات فوراً
    await invalidateCoursesCache(env);

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // 6. إدارة المحاضرات — إضافة
  if (path === "/api/admin/lessons" && request.method === "POST") {
    const body = await request.json();
    await env.DB.prepare(
      "INSERT INTO lessons (course_id, title, video_url, order_num) VALUES (?, ?, ?, ?)"
    ).bind(body.course_id, body.title, body.video_url, body.order_num).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // حذف محاضرة
  if (path.match(/^\/api\/admin\/lessons\/\d+$/) && request.method === "DELETE") {
    const lessonId = path.split("/")[4];
    await env.DB.prepare("DELETE FROM lessons WHERE id = ?").bind(lessonId).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // تعديل محاضرة
  if (path.match(/^\/api\/admin\/lessons\/\d+$/) && request.method === "PUT") {
    const lessonId = path.split("/")[4];
    const body = await request.json();
    await env.DB.prepare(
      "UPDATE lessons SET title = ?, video_url = ?, order_num = ? WHERE id = ?"
    ).bind(body.title, body.video_url, body.order_num, lessonId).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // قفل/فتح محاضرة
  if (path.match(/^\/api\/admin\/lessons\/\d+\/lock$/) && request.method === "PUT") {
    const lessonId = path.split("/")[4];
    const body = await request.json();
    await env.DB.prepare(
      "UPDATE lessons SET is_admin_locked = ? WHERE id = ?"
    ).bind(body.is_locked, lessonId).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // 7. إدارة الامتحانات — إضافة
  if (path === "/api/admin/quizzes" && request.method === "POST") {
    const body = await request.json();
    await env.DB.prepare(
      "INSERT INTO quizzes (lesson_id, image_url, option_a, option_b, option_c, option_d, correct_option) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(body.lesson_id, body.image_url, body.option_a, body.option_b, body.option_c, body.option_d, body.correct_option).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // حذف امتحان
  if (path.match(/^\/api\/admin\/quizzes\/\d+$/) && request.method === "DELETE") {
    const quizId = path.split("/")[4];
    await env.DB.prepare("DELETE FROM quizzes WHERE id = ?").bind(quizId).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...ch } });
  }

  // 8. 💡 جلب إحصائيات المبيعات (التقارير المالية المجمعة للرسم البياني)
  if (path === "/api/admin/transactions/stats" && request.method === "GET") {
    try {
      const stats = await env.DB.prepare(`
        SELECT 
          c.title as course_title,
          c.price,
          COUNT(CASE WHEN t.status = 'success' THEN 1 END) as successful_sales,
          COUNT(CASE WHEN t.status = 'pending' THEN 1 END) as pending_sales,
          SUM(CASE WHEN t.status = 'success' THEN CAST(t.amount AS DECIMAL) ELSE 0 END) as total_revenue
        FROM courses c
        LEFT JOIN transactions t ON c.id = t.course_id
        WHERE c.is_free = 0
        GROUP BY c.id, c.title, c.price
        ORDER BY total_revenue DESC
      `).all();

      return new Response(JSON.stringify(stats.results), { headers: { "Content-Type": "application/json", ...ch } });
    } catch (e) {
      console.error(e);
      return new Response(JSON.stringify({ error: "خطأ في جلب إحصائيات المبيعات" }), { status: 500, headers: { "Content-Type": "application/json", ...ch } });
    }
  }

  // 9. جلب الامتحانات المعلقة
  if (path === "/api/admin/failed-exams" && request.method === "GET") {
    try {
      const failed = await env.DB.prepare(`
        SELECT f.*, u.name as student_name, u.phone, l.title as lesson_title 
        FROM failed_exams f
        LEFT JOIN users u ON f.user_id = u.id
        LEFT JOIN lessons l ON f.lesson_id = l.id
        ORDER BY f.failed_at DESC
      `).all();

      return new Response(JSON.stringify(failed.results), { headers: { "Content-Type": "application/json", ...ch } });
    } catch (e) {
      return new Response(JSON.stringify({ error: "خطأ في جلب الامتحانات المعلقة" }), { status: 500, headers: { "Content-Type": "application/json", ...ch } });
    }
  }

  return null;
}
