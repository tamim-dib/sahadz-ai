import express from "express";
import fetch from "node-fetch";
import mysql from "mysql2/promise";

const GEMINI_API_KEY = "AIzaSyAWUHMtESFvMrzUDGLUy9SARBO4fkXzuAE";

const app = express();
app.use(express.json());
app.use(express.static("public"));

// الاتصال بقاعدة البيانات
const db = await mysql.createPool({
  host: "sql7.freesqldatabase.com",
  user: "sql7814603",
  password: "n93W4SHhPD",
  database: "sql7814603"
});

// نقطة الشات
app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message;

    if (!userMessage) {
      return res.status(400).json({ error: "الرجاء كتابة رسالة" });
    }

    // جلب المنتجات
    const [products] = await db.query(
      "SELECT id, name, brand, barcode, product_type, price, description, ingredients, warning, image FROM products"
    );

    const productsText = products.map(p =>
      `ID: ${p.id}
المنتج: ${p.name}
الماركة: ${p.brand}
النوع: ${p.product_type}
السعر: ${p.price} DZD
الوصف: ${p.description || "غير مذكور"}
المكونات: ${p.ingredients || "غير مذكورة"}
التحذيرات: ${p.warning || "لا يوجد"}
الصورة: ${p.image || ""}
---`
    ).join("\n");

    // إرسال الطلب إلى Gemini
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are a smart shopping assistant for SahaDZ healthy store.

🌍 MULTI-LANGUAGE SUPPORT:
You MUST speak in the SAME language as the user:
- If user writes in Arabic → Reply in Arabic
- If user writes in French → Reply in French  
- If user writes in English → Reply in English
- If user asks "تكلم بالإنجليزية" or "parle français" → Switch to that language and confirm

🎯 YOUR MAIN TASK:
Understand the user's request first, then decide: Do they need product suggestions or not?

📋 WHEN TO SUGGEST PRODUCTS:
✅ "أريد منتجات لمرضى السكري" / "I want products for diabetics" / "Je veux des produits pour diabétiques"
✅ "أبحث عن حليب صحي" / "I'm looking for healthy milk" / "Je cherche du lait sain"
✅ "ما هو أفضل بسكويت" / "What's the best biscuit" / "Quel est le meilleur biscuit"
✅ "اقترح لي شيء" / "Suggest something" / "Suggère-moi quelque chose"

📋 WHEN NOT TO SUGGEST PRODUCTS:
❌ Greetings: "مرحبا" / "Hello" / "Bonjour" / "Hi" / "Salut"
❌ Thanks: "شكراً" / "Thank you" / "Merci"
❌ Language requests: "تكلم بالفرنسية" / "Speak English" / "Parle en arabe"
❌ General questions without purchase intent

🔹 HOW TO RESPOND:

**If just a greeting (Arabic example):**
"أهلاً بك! 👋 أنا هنا لمساعدتك في اختيار منتجات صحية. ما الذي تبحث عنه؟"

**If just a greeting (French example):**
"Bienvenue! 👋 Je suis là pour vous aider à choisir des produits sains. Que cherchez-vous?"

**If just a greeting (English example):**
"Welcome! 👋 I'm here to help you choose healthy products. What are you looking for?"

**If language switch request (e.g., "تكلم بالإنجليزية"):**
"Sure! I can speak English now. How can I help you today?"

**If real product request:**
1. Analyze request (health condition, constraints, purpose)
2. Suggest 1-3 products only
3. Use: <product id="product_number"></product>
4. Write 2 lines max about why it's suitable

Example (Arabic):
"لمريض السكري، أقترح:
<product id="1"></product>
خالٍ من السكر المضاف وغني بالألياف."

Example (French):
"Pour un diabétique, je suggère:
<product id="1"></product>
Sans sucre ajouté et riche en fibres."

Example (English):
"For a diabetic, I suggest:
<product id="1"></product>
No added sugar and rich in fiber."

⚠️ STRICT RULES:
- ALWAYS reply in the SAME language as the user
- Don't suggest products unless explicitly requested
- Maximum 3 lines response
- Don't mention prices (the card shows them)
- Be friendly but concise

Available products:
${productsText}

User request:
${userMessage}

Respond intelligently and concisely in the SAME LANGUAGE as the user:`
                }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    let reply =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "لم يتم توليد رد.";

    // استخراج معرفات المنتجات من الرد
    const productMatches = reply.matchAll(/<product id="(\d+)"><\/product>/g);
    const productIds = [...productMatches].map(match => parseInt(match[1]));

    // جلب بيانات المنتجات المقترحة
    let productCards = [];
    if (productIds.length > 0) {
      const [selectedProducts] = await db.query(
        "SELECT id, name, brand, product_type, price, description, image FROM products WHERE id IN (?)",
        [productIds]
      );

      productCards = selectedProducts;
    }

    // إزالة تاغات <product> من الرد النصي
    reply = reply.replace(/<product id="\d+"><\/product>/g, '').trim();

    res.json({ 
      reply,
      products: productCards 
    });

  } catch (error) {
    console.error('❌ خطأ:', error);
    res.status(500).json({ error: error.message });
  }
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});
