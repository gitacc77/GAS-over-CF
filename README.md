# GAS-over-CF

<div dir="rtl">
  این اسکریپت ورژن بهبود یافته به همراه کمی خلاقیت بیشتر از پروژه https://github.com/masterking32/MasterHttpRelayVPN هست.
</div>

---
ایده کلی:

<img width="5546" height="456" alt="Image" src="https://github.com/user-attachments/assets/34e47d7f-f64d-4fd0-b84f-8b5242eea936" />


در این مدل:
سرویس Google Apps Script به عنوان یک رله واسط عمل می‌کند و از دامین فرانتینگ www.google.com برای عبور از فیلتر استفاده می‌کند.

سرویس Cloudflare Worker به موتور پردازش اصلی تبدیل می‌شود که سرعت و محدودیت‌های بسیار بهتری دارد.

کلاینت هم با یک تغییر کوچک، وظایف را به این زنجیره می‌سپارد.
در تیجه در نهایت کلاینت آیپی ورکر کلودفلر را دریافت میکند.

---
