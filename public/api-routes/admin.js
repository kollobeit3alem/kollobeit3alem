import { corsHeaders } from './utils.js';

export async function handleAdminRoutes(request, env, path, url, adminUser) {
  
  // 1. جلب كل المستخدمين (طلاب وفريق عمل)
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
    }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // 2. حذف وتعديل المستخدمين
  if (path.match(/^\/api\/admin\/users\/\d+$/) && request.method === "DELETE") {
    const userId = path.split("/")[4];
    
    // التعديل هنا: مسح جميع سجلات الطالب المرتبطة قبل مسح حسابه لتفادي خطأ Foreign Key
    await env.DB.prepare("DELETE FROM enrollments WHERE user_id = ?").bind(userId).run();
    await env.DB.prepare("DELETE FROM student_progress WHERE user_id = ?").bind(userId).run();
    await env.DB.prepare("DELETE FROM student_video_progress WHERE user_id = ?").bind(userId).run();
    await env.DB.prepare("DELETE FROM quiz_attempts WHERE user_id = ?").bind(userId).run();
    
    // بعد مسح السجلات، يتم مسح المستخدم بأمان
    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
    
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  if (path.match(/^\/api\/admin\/users\/\d+$/) && request.method === "PUT") {
    const userId = path.split("/")[4];
    const body = await request.json();
    
    // جلب الرتبة الحالية للمستخدم قبل التعديل
    const currentUser = await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(userId).first();

    // تحديث بيانات المستخدم
    await env.DB.prepare("UPDATE users SET name = ?, role = ?, phone = ? WHERE id = ?")
          .bind(body.name, body.role, body.phone || null, userId).run();
          
    // التعديل هنا: إذا تمت الترقية من "طالب" إلى رتبة أخرى، نقوم بمسح سجلاته التعليمية
    if (currentUser && currentUser.role === 'student' && body.role !== 'student') {
      await env.DB.prepare("DELETE FROM enrollments WHERE user_id = ?").bind(userId).run();
      await env.DB.prepare("DELETE FROM student_progress WHERE user_id = ?").bind(userId).run();
      await env.DB.prepare("DELETE FROM student_video_progress WHERE user_id = ?").bind(userId).run();
      await env.DB.prepare("DELETE FROM quiz_attempts WHERE user_id = ?").bind(userId).run();
    }

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // 3. ترقية وتغيير رتب المستخدمين (بواسطة الإيميل)
  if (path === "/api/admin/users/role" && request.method === "PUT") {
    const body = await request.json();
    
    const currentUser = await env.DB.prepare("SELECT id, role FROM users WHERE email = ?").bind(body.email).first();
    
    if (!currentUser) {
       return new Response(JSON.stringify({ error: "المستخدم غير موجود" }), { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }
    
    await env.DB.prepare("UPDATE users SET role = ? WHERE email = ?").bind(body.role, body.email).run();
    
    // التعديل هنا: تصفير السجلات إذا تمت ترقية الطالب
    if (currentUser.role === 'student' && body.role !== 'student') {
      const userId = currentUser.id;
      await env.DB.prepare("DELETE FROM enrollments WHERE user_id = ?").bind(userId).run();
      await env.DB.prepare("DELETE FROM student_progress WHERE user_id = ?").bind(userId).run();
      await env.DB.prepare("DELETE FROM student_video_progress WHERE user_id = ?").bind(userId).run();
      await env.DB.prepare("DELETE FROM quiz_attempts WHERE user_id = ?").bind(userId).run();
    }

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // 4. تقارير الطلاب الشاملة (+ الامتحانات)
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

    return new Response(JSON.stringify({ enrollments, progress, quizzes }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // 5. التحكم المطلق في الكورسات (إضافة/تعديل/مسح)
  if (path === "/api/admin/courses" && request.method === "POST") {
    const body = await request.json();
    const isFree = body.is_free !== undefined ? body.is_free : 1;
    // التأكد من أن السعر رقم
    const price = parseFloat(body.price) || 0;

    // التعديل الأمني: سد ثغرة السعر السالب
    if (price < 0) {
      return new Response(JSON.stringify({ error: "السعر لا يمكن أن يكون قيمة سالبة" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }
    
    // التعديل هنا: إضافة عمود metadata للـ INSERT
    await env.DB.prepare(
      "INSERT INTO courses (title, description, image_url, instructor_contact, is_free, price, instructor_id, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(body.title, body.description, body.image_url, body.instructor_contact || "", isFree, price, adminUser.id, body.metadata || null).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  if (path.match(/^\/api\/admin\/courses\/\d+$/) && request.method === "DELETE") {
    const courseId = path.split("/")[4];
    await env.DB.prepare("DELETE FROM courses WHERE id = ?").bind(courseId).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  if (path.match(/^\/api\/admin\/courses\/\d+$/) && request.method === "PUT") {
    const courseId = path.split("/")[4];
    const body = await request.json();
    const isFree = body.is_free !== undefined ? body.is_free : 1;
    // التأكد من أن السعر رقم
    const price = parseFloat(body.price) || 0;

    // التعديل الأمني: سد ثغرة السعر السالب
    if (price < 0) {
      return new Response(JSON.stringify({ error: "السعر لا يمكن أن يكون قيمة سالبة" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    // التعديل هنا: تحديث عمود metadata في الـ UPDATE
    await env.DB.prepare(
      "UPDATE courses SET title = ?, description = ?, image_url = ?, is_free = ?, price = ?, metadata = ? WHERE id = ?"
    ).bind(body.title, body.description, body.image_url, isFree, price, body.metadata || null, courseId).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // 6. التحكم المطلق في المحاضرات
  if (path === "/api/admin/lessons" && request.method === "POST") {
    const body = await request.json();
    await env.DB.prepare(
      "INSERT INTO lessons (course_id, title, video_url, order_num) VALUES (?, ?, ?, ?)"
    ).bind(body.course_id, body.title, body.video_url, body.order_num).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  if (path.match(/^\/api\/admin\/lessons\/\d+$/) && request.method === "DELETE") {
    const lessonId = path.split("/")[4];
    await env.DB.prepare("DELETE FROM lessons WHERE id = ?").bind(lessonId).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  if (path.match(/^\/api\/admin\/lessons\/\d+$/) && request.method === "PUT") {
    const lessonId = path.split("/")[4];
    const body = await request.json();
    await env.DB.prepare(
      "UPDATE lessons SET title = ?, video_url = ?, order_num = ? WHERE id = ?"
    ).bind(body.title, body.video_url, body.order_num, lessonId).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  if (path.match(/^\/api\/admin\/lessons\/\d+\/lock$/) && request.method === "PUT") {
    const lessonId = path.split("/")[4];
    const body = await request.json();
    await env.DB.prepare(
      "UPDATE lessons SET is_admin_locked = ? WHERE id = ?"
    ).bind(body.is_locked, lessonId).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // 7. التحكم المطلق في الامتحانات
  if (path === "/api/admin/quizzes" && request.method === "POST") {
    const body = await request.json();
    await env.DB.prepare(
      "INSERT INTO quizzes (lesson_id, image_url, option_a, option_b, option_c, option_d, correct_option) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(body.lesson_id, body.image_url, body.option_a, body.option_b, body.option_c, body.option_d, body.correct_option).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  if (path.match(/^\/api\/admin\/quizzes\/\d+$/) && request.method === "DELETE") {
    const quizId = path.split("/")[4];
    await env.DB.prepare("DELETE FROM quizzes WHERE id = ?").bind(quizId).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // 8. توليد وإدارة أكواد التفعيل (نظام المحفظة الجديد)
  if (path === "/api/admin/codes" && request.method === "POST") {
    const body = await request.json();
    
    // التعديل هنا: جلب قيمة الكود المادية بدلاً من ربطه بكورس كأرقام صحيحة
    const amount = parseFloat(body.amount) || 0;
    const count = parseInt(body.count) || 1;

    // التعديل الأمني: سد ثغرة القيم السالبة أو الصفرية لأكواد المحفظة
    if (amount <= 0) {
      return new Response(JSON.stringify({ error: "قيمة الشحن يجب أن تكون رقماً موجباً أكبر من الصفر" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }
    // حماية إضافية ضد توليد عدد أكواد بالسالب أو عدد مهول يوقع الداتا بيز
    if (count <= 0 || count > 1000) {
      return new Response(JSON.stringify({ error: "عدد الأكواد يجب أن يكون رقم صحيح موجب (بحد أقصى 1000 كود في المرة)" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    const codes = [];
    
    for (let i = 0; i < count; i++) {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      // يتم إدراج الكود بالقيمة المالية، والـ course_id نضعه بصفر أو نتجاهله
      await env.DB.prepare("INSERT INTO activation_codes (code, course_id, amount) VALUES (?, 0, ?)").bind(code, amount).run();
      codes.push(code);
    }
    return new Response(JSON.stringify({ success: true, codes }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // التعديل هنا: جلب الأكواد بغض النظر عن الـ course_id لأن النظام أصبح محفظة عامة
  if (path.match(/^\/api\/admin\/codes(\/\d+)?$/) && request.method === "GET") {
    const codes = await env.DB.prepare("SELECT * FROM activation_codes ORDER BY id DESC").all();
    return new Response(JSON.stringify(codes.results), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  return null;
}
