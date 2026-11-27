<!-- 1. زر تشغيل المستشار (ضعه في الهيدر أو قسم البانر الرئيسي) -->
<button id="open-quiz-btn" class="ld-quiz-trigger">
  ✨ لا تعرفين ما يناسبك؟ اكتشفي روتينك في 30 ثانية
</button>

<!-- 2. شريط المقارنة السفلي العائم -->
<div id="ld-compare-bar" class="ld-compare-bar hidden">
  <span id="ld-compare-count">تم اختيار 0 منتجات للمقارنة</span>
  <div class="ld-compare-actions">
    <button id="ld-open-compare-modal" class="ld-btn-primary">قارن الآن</button>
    <button id="ld-clear-compare" class="ld-btn-ghost">مسح</button>
  </div>
</div>

<!-- 3. نافذة الاختبار والمقارنة المنبثقة (Modal) -->
<div id="ld-guide-modal" class="ld-modal hidden" dir="rtl">
  <div class="ld-modal-content">
    <button id="ld-close-modal" class="ld-close">&times;</button>
    <div id="ld-modal-body"></div>
  </div>
</div>

<style>
  .ld-quiz-trigger {
    background: linear-gradient(135deg, #d63384, #9b2c68);
    color: #fff;
    border: none;
    padding: 12px 20px;
    border-radius: 30px;
    font-weight: bold;
    cursor: pointer;
    box-shadow: 0 4px 15px rgba(214, 51, 132, 0.3);
    transition: transform 0.2s;
  }
  .ld-quiz-trigger:hover { transform: translateY(-2px); }

  .ld-compare-bar {
    position: fixed;
    bottom: 15px;
    left: 50%;
    transform: translateX(-50%);
    background: #222;
    color: #fff;
    padding: 12px 20px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    gap: 15px;
    z-index: 999;
    box-shadow: 0 8px 25px rgba(0,0,0,0.25);
  }
  .hidden { display: none !important; }

  .ld-modal {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 15px;
  }
  .ld-modal-content {
    background: #fff;
    width: 100%;
    max-width: 550px;
    border-radius: 16px;
    padding: 24px;
    position: relative;
    max-height: 85vh;
    overflow-y: auto;
  }
  .ld-close {
    position: absolute;
    top: 12px;
    left: 15px;
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
  }
  .ld-options-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 15px;
  }
  .ld-option-btn {
    padding: 14px;
    border: 2px solid #eee;
    border-radius: 10px;
    background: #fafafa;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s;
  }
  .ld-option-btn:hover {
    border-color: #d63384;
    background: #fff0f6;
  }
  .ld-compare-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 15px;
    font-size: 14px;
  }
  .ld-compare-table th, .ld-compare-table td {
    border: 1px solid #eee;
    padding: 10px;
    text-align: center;
  }
  .ld-btn-primary {
    background: #d63384;
    color: #fff;
    border: none;
    padding: 8px 14px;
    border-radius: 8px;
    cursor: pointer;
  }
  .ld-btn-ghost {
    background: transparent;
    color: #ccc;
    border: 1px solid #555;
    padding: 8px 12px;
    border-radius: 8px;
    cursor: pointer;
  }
</style>

<script>
  // --- 1. منطق مستشار الجمال (Product Quiz) ---
  const quizSteps = [
    {
      question: "ما هو القسم الذي تبحثين فيه؟",
      key: "category",
      options: ["العناية بالبشرة", "العناية بالشعر", "المكياج", "العطور"]
    },
    {
      question: "ما هو احتياجك الأساسي حالياً؟",
      key: "need",
      options: ["ترطيب عميق", "تفتيح ونضارة", "علاج وتغذية", "ثبات يدوم طويلاً"]
    },
    {
      question: "ما هي الميزانية المفضلة؟",
      key: "budget",
      options: ["اقتصادية (أقل من 15,000)", "متوسطة (15,000 - 35,000)", "مفتوحة"]
    }
  ];

  let currentStep = 0;
  let userAnswers = {};

  const modal = document.getElementById("ld-guide-modal");
  const modalBody = document.getElementById("ld-modal-body");

  document.getElementById("open-quiz-btn").onclick = () => {
    currentStep = 0;
    userAnswers = {};
    renderQuizStep();
    modal.classList.remove("hidden");
  };

  document.getElementById("ld-close-modal").onclick = () => modal.classList.add("hidden");

  function renderQuizStep() {
    if (currentStep < quizSteps.length) {
      const step = quizSteps[currentStep];
      modalBody.innerHTML = `
        <small style="color:#888">الخطوة ${currentStep + 1} من ${quizSteps.length}</small>
        <h3 style="margin:8px 0">${step.question}</h3>
        <div class="ld-options-grid">
          ${step.options.map(opt => `
            <button class="ld-option-btn" onclick="selectQuizOption('${step.key}', '${opt}')">${opt}</button>
          `).join("")}
        </div>
      `;
    } else {
      showQuizResults();
    }
  }

  window.selectQuizOption = (key, value) => {
    userAnswers[key] = value;
    currentStep++;
    renderQuizStep();
  };

  function showQuizResults() {
    // اربط هذه الدالة بمصفوفة منتجاتك الحقيقية (مثلاً window.products)
    const allProducts = window.products || [];
    const matched = allProducts.filter(p =>
      (!p.category || p.category.includes(userAnswers.category))
    ).slice(0, 3);

    modalBody.innerHTML = `
      <h3>✨ ترشيحاتنا المناسبة لكِ</h3>
      <p style="color:#666; font-size:14px">بناءً على اختيارك: ${userAnswers.category} • ${userAnswers.need}</p>
      <div style="margin-top:15px; display:flex; flex-direction:column; gap:10px;">
        ${matched.length ? matched.map(p => `
          <div style="display:flex; justify-content:space-between; align-items:center; border:1px solid #eee; padding:10px; border-radius:10px;">
            <div>
              <strong>${p.name}</strong>
              <div style="color:#d63384; font-size:14px">${p.price} د.ع</div>
            </div>
            <button class="ld-btn-primary" onclick="addToCart('${p.id}')">أضف للسلة</button>
          </div>
        `).join("") : `<p>استكشفي تشكيلتنا المميزة في قسم <strong>${userAnswers.category}</strong>.</p>`}
      </div>
    `;
  }

  // --- 2. منطق مقارنة المنتجات (Product Compare) ---
  let compareList = [];

  // استدعِ هذه الدالة من زر المقارنة الموجود على كل بطاقة منتج: toggleCompare(productObj)
  window.toggleCompare = (product) => {
    const exists = compareList.findIndex(item => item.id === product.id);
    if (exists > -1) {
      compareList.splice(exists, 1);
    } else {
      if (compareList.length >= 3) {
        alert("يمكنك مقارنة 3 منتجات كحد أقصى في نفس الوقت.");
        return;
      }
      compareList.push(product);
    }
    updateCompareBar();
  };

  function updateCompareBar() {
    const bar = document.getElementById("ld-compare-bar");
    const count = document.getElementById("ld-compare-count");
    if (compareList.length > 0) {
      bar.classList.remove("hidden");
      count.textContent = `تم اختيار ${compareList.length} منتجات للمقارنة`;
    } else {
      bar.classList.add("hidden");
    }
  }

  document.getElementById("ld-clear-compare").onclick = () => {
    compareList = [];
    updateCompareBar();
  };

  document.getElementById("ld-open-compare-modal").onclick = () => {
    if (compareList.length < 2) {
      alert("اختر منتجين على الأقل للمقارنة.");
      return;
    }
    modalBody.innerHTML = `
      <h3>⚖️ مقارنة المنتجات</h3>
      <table class="ld-compare-table">
        <tr>
          <th>الميزة</th>
          ${compareList.map(p => `<th>${p.name}</th>`).join("")}
        </tr>
        <tr>
          <td>السعر</td>
          ${compareList.map(p => `<td><strong>${p.price} د.ع</strong></td>`).join("")}
        </tr>
        <tr>
          <td>الفئة</td>
          ${compareList.map(p => `<td>${p.category || "-"}</td>`).join("")}
        </tr>
        <tr>
          <td>الوصف / الفائدة</td>
          ${compareList.map(p => `<td>${p.description || "مناسب للاستخدام اليومي"}</td>`).join("")}
        </tr>
        <tr>
          <td>الإجراء</td>
          ${compareList.map(p => `<td><button class="ld-btn-primary" onclick="addToCart('${p.id}')">أضف للسلة</button></td>`).join("")}
        </tr>
      </table>
    `;
    modal.classList.remove("hidden");
  };
</script>
