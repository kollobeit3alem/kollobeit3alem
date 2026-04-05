import { corsHeaders } from './utils.js';

export async function handleAdminRoutes(request, env, path, url, adminUser) {
  
  // جلب المستخدمين مع نظام البحث والصفحات وفلترة (الطلاب / فريق العمل)
  if (path === "/api/admin/users" && request.method === "GET") {
    const page = parseInt(url.searchParams.get("page")) || 1;
    const limit = parseInt(url.searchParams.get("limit")) || 50;
    const search = url.searchParams.get("search") || "";
    const type = url.searchParams.get("type") || "all"; // 'students' | 'staff' | 'all'
    const offset = (page - 1) * limit;

    let query = "";
    let countQuery = "";
    let params = [];
    let countParams = [];

    if (adminUser.role === 'instructor') {
      // المعلم يرى طلابه فقط
      let baseWhere = `FROM users u JOIN enrollments e ON u.id = e.user_id JOIN courses c ON e.course_id = c.id WHERE c.instructor_id = ? AND u.role = 'student'`;
      params.push(adminUser.id);
      countParams.push(adminUser.id);

      if (search) {
        baseWhere += ` AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      query = `SELECT DISTINCT u.id, u.name, u.email, u.phone, u.role, u.created_at ${baseWhere} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
      countQuery = `SELECT COUNT(DISTINCT u.id) as total ${baseWhere}`;
      params.push(limit, offset);
    } else {
      // المدير والمتابع
      let baseWhere = `FROM users`;
      let whereClauses = [];

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
      
      query = `SELECT id, name, email, phone, role, created_at ${baseWhere} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      countQuery = `SELECT COUNT(*) as total ${baseWhere}`;
      params.push(limit, offset);
    }

    const usersList = await env.DB.prepare(query).bind(...params).all();
    const countRes = await env.DB.prepare(countQuery).bind(...countParams).first();

    return new Response(JSON.stringify({
      users: usersList.results,
      total: countRes.total,
      page: page,
      limit: limit
    }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // حذف مستخدم (للمدير فقط، ومحمية بالأعلى)
  if (path.match(/^\/api\/admin\/users\/\d+$/) && request.method === "DELETE") {
    const userId = path.split("/")[4];
    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // تعديل بيانات مستخدم (للمدير فقط، ومحمية بالأعلى، وتم إضافة تحديث التليفون)
  if (path.match(/^\/api\/admin\/users\/\d+$/) && request.method === "PUT") {
    const userId = path.split("/")[4];
    const body = await request.json();
    await env.DB.prepare("UPDATE users SET name = ?, role = ?, phone = ? WHERE id = ?")
          .bind(body.name, body.role, body.phone || null, userId).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // جلب تقرير شامل للطالب (مفصول ومحصن لتجنب أخطاء قواعد البيانات)
  if (path.match(/^\/api\/admin\/reports\/\d+$/) && request.method === "GET") {
    const studentId = parseInt(path.split("/")[4], 10);
    
    let enrollments = [];
    let progress = [];

    // 1. جلب الدورات المشترك بها بأمان
    try {
      if (adminUser.role === 'instructor') {
        const eRes = await env.DB.prepare(
          "SELECT c.title, e.* FROM enrollments e JOIN courses c ON e.course_id = c.id WHERE e.user_id = ? AND c.instructor_id = ?"
        ).bind(studentId, adminUser.id).all();
        enrollments = eRes.results;
      } else {
        const eRes = await env.DB.prepare(
          "SELECT c.title, e.* FROM enrollments e JOIN courses c ON e.course_id = c.id WHERE e.user_id = ?"
        ).bind(studentId).all();
        enrollments = eRes.results;
      }
    } catch (e) {
      console.error("Enrollments Fetch Error:", e);
    }

    // 2. جلب المحاضرات المكتملة بأمان
    try {
      if (adminUser.role === 'instructor') {
        const pRes = await env.DB.prepare(
          "SELECT l.title as lesson_title, c.title as course_title, p.* FROM student_progress p JOIN lessons l ON p.lesson_id = l.id JOIN courses c ON l.course_id = c.id WHERE p.user_id = ? AND c.instructor_id = ?"
        ).bind(studentId, adminUser.id).all();
        progress = pRes.results;
      } else {
        const pRes = await env.DB.prepare(
          "SELECT l.title as lesson_title, c.title as course_title, p.* FROM student_progress p JOIN lessons l ON p.lesson_id = l.id JOIN courses c ON l.course_id = c.id WHERE p.user_id = ?"
        ).bind(studentId).all();
        progress = pRes.results;
      }
    } catch (e) {
       console.error("Progress Fetch Error:", e);
    }
    
    return new Response(JSON.stringify({ enrollments, progress }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // --- إدارة الكورسات (مع عزل المعلمين) ---

  // إضافة دورة
  if (path === "/api/admin/courses" && request.method === "POST") {
    const body = await request.json();
    const isFree = body.is_free !== undefined ? body.is_free : 1;
    const price = body.price || 0;
    
    // نربط الكورس بالـ ID الخاص بمن قام بإنشائه
    await env.DB.prepare(
      "INSERT INTO courses (title, description, image_url, instructor_contact, is_free, price, instructor_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(body.title, body.description, body.image_url, body.instructor_contact || "", isFree, price, adminUser.id).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // حذف دورة
  if (path.match(/^\/api\/admin\/courses\/\d+$/) && request.method === "DELETE") {
    const courseId = path.split("/")[4];
    
    // حماية: إذا كان معلم، نمنعه من حذف كورسات غيره
    if (adminUser.role === 'instructor') {
      const check = await env.DB.prepare("SELECT instructor_id FROM courses WHERE id = ?").bind(courseId).first();
      if (!check || check.instructor_id !== adminUser.id) return new Response(JSON.stringify({ error: "Access Denied" }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    await env.DB.prepare("DELETE FROM courses WHERE id = ?").bind(courseId).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // تعديل دورة
  if (path.match(/^\/api\/admin\/courses\/\d+$/) && request.method === "PUT") {
    const courseId = path.split("/")[4];
    
    if (adminUser.role === 'instructor') {
      const check = await env.DB.prepare("SELECT instructor_id FROM courses WHERE id = ?").bind(courseId).first();
      if (!check || check.instructor_id !== adminUser.id) return new Response(JSON.stringify({ error: "Access Denied" }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    const body = await request.json();
    const isFree = body.is_free !== undefined ? body.is_free : 1;
    const price = body.price || 0;

    await env.DB.prepare(
      "UPDATE courses SET title = ?, description = ?, image_url = ?, is_free = ?, price = ? WHERE id = ?"
    ).bind(body.title, body.description, body.image_url, isFree, price, courseId).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // --- إدارة الأكواد (للمدير فقط) ---
  if (path === "/api/admin/codes" && request.method === "POST") {
    const body = await request.json();
    const course_id = body.course_id;
    const count = body.count || 1;
    const codes = [];
    
    for (let i = 0; i < count; i++) {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      await env.DB.prepare("INSERT INTO activation_codes (code, course_id) VALUES (?, ?)").bind(code, course_id).run();
      codes.push(code);
    }
    return new Response(JSON.stringify({ success: true, codes }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  if (path.match(/^\/api\/admin\/codes\/\d+$/) && request.method === "GET") {
    const courseId = path.split("/")[4];
    const codes = await env.DB.prepare("SELECT * FROM activation_codes WHERE course_id = ? ORDER BY id DESC").bind(courseId).all();
    return new Response(JSON.stringify(codes.results), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // --- إدارة المحاضرات (مع حماية ملكية المعلم) ---

  // إضافة محاضرة
  if (path === "/api/admin/lessons" && request.method === "POST") {
    const body = await request.json();
    
    if (adminUser.role === 'instructor') {
      const check = await env.DB.prepare("SELECT instructor_id FROM courses WHERE id = ?").bind(body.course_id).first();
      if (!check || check.instructor_id !== adminUser.id) return new Response(JSON.stringify({ error: "Access Denied" }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    await env.DB.prepare(
      "INSERT INTO lessons (course_id, title, video_url, order_num) VALUES (?, ?, ?, ?)"
    ).bind(body.course_id, body.title, body.video_url, body.order_num).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // حذف محاضرة
  if (path.match(/^\/api\/admin\/lessons\/\d+$/) && request.method === "DELETE") {
    const lessonId = path.split("/")[4];
    
    if (adminUser.role === 'instructor') {
      const lesson = await env.DB.prepare("SELECT course_id FROM lessons WHERE id = ?").bind(lessonId).first();
      const check = await env.DB.prepare("SELECT instructor_id FROM courses WHERE id = ?").bind(lesson?.course_id).first();
      if (!check || check.instructor_id !== adminUser.id) return new Response(JSON.stringify({ error: "Access Denied" }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    await env.DB.prepare("DELETE FROM lessons WHERE id = ?").bind(lessonId).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // تعديل محاضرة
  if (path.match(/^\/api\/admin\/lessons\/\d+$/) && request.method === "PUT") {
    const lessonId = path.split("/")[4];
    
    if (adminUser.role === 'instructor') {
      const lesson = await env.DB.prepare("SELECT course_id FROM lessons WHERE id = ?").bind(lessonId).first();
      const check = await env.DB.prepare("SELECT instructor_id FROM courses WHERE id = ?").bind(lesson?.course_id).first();
      if (!check || check.instructor_id !== adminUser.id) return new Response(JSON.stringify({ error: "Access Denied" }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    const body = await request.json();
    await env.DB.prepare(
      "UPDATE lessons SET title = ?, video_url = ?, order_num = ? WHERE id = ?"
    ).bind(body.title, body.video_url, body.order_num, lessonId).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // قفل/فتح محاضرة
  if (path.match(/^\/api\/admin\/lessons\/\d+\/lock$/) && request.method === "PUT") {
    const lessonId = path.split("/")[4];
    const body = await request.json();
    await env.DB.prepare(
      "UPDATE lessons SET is_admin_locked = ? WHERE id = ?"
    ).bind(body.is_locked, lessonId).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // إضافة امتحان
  if (path === "/api/admin/quizzes" && request.method === "POST") {
    const body = await request.json();
    
    if (adminUser.role === 'instructor') {
      const lesson = await env.DB.prepare("SELECT course_id FROM lessons WHERE id = ?").bind(body.lesson_id).first();
      const check = await env.DB.prepare("SELECT instructor_id FROM courses WHERE id = ?").bind(lesson?.course_id).first();
      if (!check || check.instructor_id !== adminUser.id) return new Response(JSON.stringify({ error: "Access Denied" }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    await env.DB.prepare(
      "INSERT INTO quizzes (lesson_id, image_url, option_a, option_b, option_c, option_d, correct_option) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(body.lesson_id, body.image_url, body.option_a, body.option_b, body.option_c, body.option_d, body.correct_option).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // --- مسار حذف الأسئلة ---
  if (path.match(/^\/api\/admin\/quizzes\/\d+$/) && request.method === "DELETE") {
    const quizId = path.split("/")[4];
    
    // حماية ملكية المعلم: التأكد من أن السؤال تابع لدورة تخص المعلم
    if (adminUser.role === 'instructor') {
      const quiz = await env.DB.prepare("SELECT lesson_id FROM quizzes WHERE id = ?").bind(quizId).first();
      if (quiz) {
         const lesson = await env.DB.prepare("SELECT course_id FROM lessons WHERE id = ?").bind(quiz.lesson_id).first();
         const check = await env.DB.prepare("SELECT instructor_id FROM courses WHERE id = ?").bind(lesson?.course_id).first();
         if (!check || check.instructor_id !== adminUser.id) {
           return new Response(JSON.stringify({ error: "Access Denied" }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
         }
      }
    }

    await env.DB.prepare("DELETE FROM quizzes WHERE id = ?").bind(quizId).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // تعديل رتبة مستخدم 
  if (path === "/api/admin/users/role" && request.method === "PUT") {
    const body = await request.json();
    const result = await env.DB.prepare("UPDATE users SET role = ? WHERE email = ?").bind(body.role, body.email).run();
    if (result.meta.changes === 0) {
       return new Response(JSON.stringify({ error: "المستخدم غير موجود" }), { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // في حالة عدم تطابق أي مسار
  return null;
}
