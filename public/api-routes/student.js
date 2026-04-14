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

  // ============================================================================
  // 💡 مسار Paymob 1: إنشاء أوردر وجلب الكود المرجعي لفوري
  // ============================================================================
  if (path === "/api/paymob/init" && request.method === "POST") {
    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...ch } });

    const userId = authCheck.userId;
    const body = await request.json();
    const courseId = body.course_id;

    if (!courseId) return new Response(JSON.stringify({ error: "بيانات الكورس مطلوبة" }), { status: 400, headers: { "Content-Type": "application/json", ...ch } });

    try {
      // 1. التحقق من الكورس وقيمته
      const course = await env.DB.prepare("SELECT * FROM courses WHERE id = ?").bind(courseId).first();
      if (!course) return new Response(JSON.stringify({ error: "الكورس غير موجود" }), { status: 404, headers: { "Content-Type": "application/json", ...ch } });
      if (course.is_free === 1 || course.price <= 0) {
        return new Response(JSON.stringify({ error: "هذا الكورس مجاني، لا يحتاج للدفع ويمكنك الاشتراك مباشرة" }), { status: 400, headers: { "Content-Type": "application/json", ...ch } });
      }

      const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();

      // 2. Authentication مع Paymob
      const authRes = await fetch("https://accept.paymob.com/api/auth/tokens", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: env.PAYMOB_API_KEY })
      });
      const authData = await authRes.json();
      const token = authData.token;

      // 3. إنشاء أوردر (Order Registration)
      // هندمج رقم الطالب والكورس في الـ merchant_order_id عشان نرجع نستخدمهم في الويب هوك
      const merchantOrderId = `U${userId}_C${courseId}_${Date.now()}`;
      const amountCents = Math.round(course.price * 100).toString(); // السعر بالقروش
      
      const orderRes = await fetch("https://accept.paymob.com/api/ecommerce/orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auth_token: token,
          delivery_needed: "false",
          amount_cents: amountCents,
          currency: "EGP",
          merchant_order_id: merchantOrderId,
          items: []
        })
      });
      const orderData = await orderRes.json();
      const paymobOrderId = orderData.id;

      // 4. طلب مفتاح الدفع (Payment Key Request) الخاص بـ Kiosk
      const keyRes = await fetch("https://accept.paymob.com/api/acceptance/payment_keys", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auth_token: token,
          amount_cents: amountCents,
          expiration: 3600 * 24, // الكود هيفضل صالح لمدة 24 ساعة
          order_id: paymobOrderId,
          billing_data: {
            apartment: "NA", email: user.email || "test@test.com", floor: "NA", first_name: user.name?.split(" ")[0] || "Student",
            street: "NA", building: "NA", phone_number: user.phone || "01000000000", shipping_method: "NA",
            postal_code: "NA", city: "NA", country: "NA", last_name: user.name?.split(" ")[1] || "NA", state: "NA"
          },
          currency: "EGP",
          integration_id: parseInt(env.PAYMOB_INTEGRATION_ID) // المتغير الخاص برقم دمج فوري
        })
      });
      const keyData = await keyRes.json();
      const paymentToken = keyData.token;

      // 5. استخراج الكود المرجعي لفوري (Kiosk Pay Request)
      const kioskRes = await fetch("https://accept.paymob.com/api/acceptance/payments/pay", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: { identifier: "AGGREGATOR", subtype: "AGGREGATOR" },
          payment_token: paymentToken
        })
      });
      const kioskData = await kioskRes.json();
      const billReference = kioskData.data?.bill_reference;

      if (!billReference) throw new Error("فشل في استخراج الكود المرجعي من بيموب");

      // 6. تسجيل العملية كـ "قيد الانتظار" في قاعدة البيانات
      await env.DB.prepare(
        "INSERT INTO transactions (user_id, course_id, paymob_order_id, amount, status) VALUES (?, ?, ?, ?, 'pending')"
      ).bind(userId, courseId, paymobOrderId.toString(), course.price).run();

      return new Response(JSON.stringify({ success: true, bill_reference: billReference }), { headers: { "Content-Type": "application/json", ...ch } });

    } catch (error) {
      console.error("Paymob Init Error:", error);
      return new Response(JSON.stringify({ error: "تعذر إنشاء كود الدفع حالياً، يرجى المحاولة لاحقاً." }), { status: 500, headers: { "Content-Type": "application/json", ...ch } });
    }
  }

  // ============================================================================
  // 💡 مسار Paymob 2: الـ Webhook (يستقبل التأكيد من بيموب لتفعيل الكورس)
  // ============================================================================
  if (path === "/api/paymob/webhook" && request.method === "POST") {
    try {
      const bodyText = await request.text();
      const body = JSON.parse(bodyText);
      
      // جلب הـ hmac من الرابط (بيموب ترسله في الـ Query Parameters)
      const urlParams = new URL(request.url).searchParams;
      const receivedHmac = urlParams.get("hmac");

      if (body.type === "TRANSACTION") {
        const obj = body.obj;
        
        // بناء نص الـ HMAC بناءً على توثيق Paymob للتأكد من الموثوقية
        const fields = [
          'amount_cents', 'created_at', 'currency', 'error_occured',
          'has_parent_transaction', 'id', 'integration_id', 'is_3d_secure',
          'is_auth', 'is_capture', 'is_refunded', 'is_standalone_payment',
          'is_voided', 'order.id', 'owner', 'pending', 'source_data.pan',
          'source_data.sub_type', 'source_data.type', 'success'
        ];
        
        const getValue = (obj, path) => path.split('.').reduce((acc, part) => acc && acc[part], obj);
        
        let hmacString = '';
        fields.forEach(field => {
          let val = getValue(obj, field);
          if (typeof val === 'boolean') val = val.toString().toLowerCase(); // تحويل البوليان لنص לפי توثيق بيموب
          hmacString += (val !== undefined && val !== null) ? val.toString() : '';
        });

        // تشفير النص باستخدام الـ HMAC Secret بتاعنا
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            "raw", encoder.encode(env.PAYMOB_HMAC_SECRET),
            { name: "HMAC", hash: "SHA-512" }, false, ["sign"]
        );
        const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(hmacString));
        const hashArray = Array.from(new Uint8Array(signature));
        const calculatedHmac = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // التحقق من أن الرسالة أصلية من بيموب ولم يتم التلاعب بها
        if (calculatedHmac !== receivedHmac) {
          console.error("Webhook: Invalid HMAC signature!");
          return new Response("Invalid HMAC", { status: 401 });
        }

        // إذا كانت العملية ناجحة (تم الدفع الفعلي)
        if (obj.success === true && obj.pending === false) {
          const paymobOrderId = obj.order.id.toString();
          const merchantOrderId = obj.order.merchant_order_id; // مثال: U5_C10_1612345678
          
          // استخراج رقم الطالب والكورس من الـ merchant_order_id
          const parts = merchantOrderId.split('_');
          const userId = parseInt(parts[0].substring(1));
          const courseId = parseInt(parts[1].substring(1));

          // التأكد من أن العملية موجودة في جدولنا ومعلقة (لم يتم تفعيلها مسبقاً)
          const tx = await env.DB.prepare("SELECT * FROM transactions WHERE paymob_order_id = ?").bind(paymobOrderId).first();
          
          if (tx && tx.status === 'pending') {
            // 1. تحديث حالة الفاتورة لـ "success"
            await env.DB.prepare("UPDATE transactions SET status = 'success', updated_at = CURRENT_TIMESTAMP WHERE paymob_order_id = ?").bind(paymobOrderId).run();
            
            // 2. تفعيل الكورس للطالب أوتوماتيكياً (إضافته لجدول الاشتراكات)
            try {
              await env.DB.prepare("INSERT INTO enrollments (user_id, course_id) VALUES (?, ?)").bind(userId, courseId).run();
            } catch(e) {
              // لو الطالب مشترك مسبقاً بطريقة ما نتجاهل الخطأ
            }
          }
        }
      }
      // لازم نرد بـ 200 OK عشان بيموب تعرف إننا استلمنا الإشعار ومتبعتوش تاني
      return new Response("OK", { status: 200 }); 
    } catch (error) {
      console.error("Webhook Internal Error:", error);
      return new Response("Server Error", { status: 500 });
    }
  }

  // ============================================================================
  // الاشتراك المباشر في الكورس (الآن يعمل للكورسات المجانية فقط)
  // ============================================================================
  if (path === "/api/enroll" && request.method === "POST") {
    const authCheck = await verifyStudentSession(request, env);
    if (authCheck.error) return new Response(JSON.stringify({ error: authCheck.error, invalidSession: authCheck.invalidSession }), { status: authCheck.status, headers: { "Content-Type": "application/json", ...ch } });

    // منع المعلمين أو الإدارة من الاشتراك
    if (authCheck.role !== 'student') {
      return new Response(JSON.stringify({ error: "عذراً، غير مسموح للمعلمين أو الإدارة بالاشتراك في الدورات." }), { status: 403, headers: { "Content-Type": "application/json", ...ch } });
    }

    const userId = authCheck.userId;
    const body = await request.json();
    const course_id = body.course_id;

    const course = await env.DB.prepare("SELECT is_free, price FROM courses WHERE id = ?").bind(course_id).first();
    if (!course) return new Response(JSON.stringify({ error: "الكورس غير موجود" }), { status: 404, headers: { "Content-Type": "application/json", ...ch } });

    if (course.is_free === 1) {
      // الكورس مجاني -> اشترك مباشرة
      try {
        await env.DB.prepare("INSERT INTO enrollments (user_id, course_id) VALUES (?, ?)").bind(userId, course_id).run();
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...ch } });
      } catch (e) {
        return new Response(JSON.stringify({ error: "أنت مشترك بالفعل في هذا الكورس" }), { status: 400, headers: { "Content-Type": "application/json", ...ch } });
      }
    } else {
      // الكورس مدفوع -> امنعه من الاشتراك المباشر ووجهه للدفع
      return new Response(JSON.stringify({ error: "هذا الكورس مدفوع. يرجى إتمام عملية الدفع للحصول على الكورس." }), { status: 402, headers: { "Content-Type": "application/json", ...ch } });
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
