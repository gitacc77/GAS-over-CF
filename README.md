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


🧠 ساختار پروژه
<pre><span>GAS-over-CF/</span>
<span>├── apps_script/</span>
<span>│   └── Code.gs              # کد Google Apps Script (رله و فانکشن&zwnj;های کمکی)</span>
<span>├── src/                     # ماژول&zwnj;های پایتون کلاینت</span>
<span>│   ├── proxy_server.py      # پروکسی HTTP/SOCKS5 محلی</span>
<span>│   ├── domain_fronter.py    # موتور Domain Fronting اصلی</span>
<span>│   ├── mitm.py              # رهگیر MITM برای HTTPS</span>
<span>│   ├── cert_installer.py    # نصب خودکار گواهی CA</span>
<span>│   ├── google_ip_scanner.py # اسکنر IPهای گوگل</span>
<span>│   ├── h2_transport.py      # انتقال HTTP/2</span>
<span>│   ├── codec.py             # رمزگشا/رمزگذار پروتکل</span>
<span>│   ├── lan_utils.py         # ابزارهای شبکه محلی</span>
<span>│   └── logging_utils.py     # لاگینگ و بنر</span>
<span>├── main.py                  # نقطه ورود اصلی کلاینت</span>
<span>├── worker.js                # Cloudflare Worker</span>
<span>├── config.example.json      # نمونه فایل کانفیگ</span>
<span>├── setup.py                 # جادوگر راه&zwnj;اندازی تعاملی</span>
<span>├── start.bat / start.sh     # اسکریپت&zwnj;های راه&zwnj;اندازی سریع</span>
<span>└── requirements.txt         # وابستگی&zwnj;های پایتون</span></pre>

