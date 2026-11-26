TeamSpace - Communication & Medical Ethics

ملفات الموقع الكاملة:
- index.html
- style.css
- app.js
- firebase-config.js
- firestore.rules

طريقة الاستبدال:
1) احتفظ بنسخة احتياطية من مستودع GitHub الحالي ولا تحذف المشروع كله.
2) فك ضغط هذا الملف على جهازك.
3) ارفع الملفات الستة الموجودة داخل مجلد TeamSpace_Complete مباشرة إلى جذر المستودع بجانب بعضها، وليس داخل مجلد فرعي.
4) وافق على استبدال الملفات التي تحمل الأسماء نفسها، ثم Commit changes.
5) بعد رفع ملفات الموقع، افتح Firebase Console > Firestore Database > Rules.
6) استبدل القواعد الحالية بمحتوى firestore.rules واضغط Publish.
7) تأكد أن Authentication > Sign-in method > Anonymous مفعّل.
8) تأكد من وجود المسار groups/communication-medical-ethics/joinCodes/CME2026TEAM وأن الحقل active قيمته Boolean true.
9) افتح موقع GitHub Pages وانتظر دقيقة أو دقيقتين بعد Commit.

ملاحظات:
- لا ترفع ملف ZIP نفسه إلى GitHub Pages؛ ارفع الملفات بعد فك الضغط.
- لا ترفع مجلد TeamSpace_Complete كملف فرعي. ارفع محتوياته في جذر المستودع.
- إعدادات Firebase الموجودة في firebase-config.js هي إعدادات تطبيق الويب الذي زودتني بها.
- لا تشارك أي مفاتيح إدارية أو Service Account.
