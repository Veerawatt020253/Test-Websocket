# Frontend — Realtime Pose Classifier (test UI)

หน้าเว็บ HTML/CSS/JS ธรรมดา ไว้ทดสอบ/แสดงผล (ไม่เน้นสวย) เปิดกล้อง → ส่งเฟรมไป backend →
วาดโครงกระดูก + class ที่ AI ทำนายแบบ realtime

## วิธีใช้
ต้องเปิดผ่าน http server (กล้องใช้กับ `file://` ไม่ได้):
```bash
# ในโฟลเดอร์ frontend/
python -m http.server 5500
```
เปิด http://localhost:5500 → ใส่ URL ของ backend (ค่าเริ่มต้น `ws://localhost:8000/ws`)
→ กด **Connect** → กด **Start Camera**

> กล้องเบราว์เซอร์ทำงานเฉพาะบน `localhost` หรือ `https://` เท่านั้น
> ถ้า host จริง ต้องเสิร์ฟหน้านี้ผ่าน HTTPS และ backend ผ่าน `wss://`

## Hesitation Test (biomarker)
กด **Hesitation Test** → รอสุ่ม 1-2 วิ → ขึ้นท่าให้ทำ (เช่น "DO: ArmUp") → ระบบจับเวลา
ตั้งแต่ขึ้นท่าจนเริ่มขยับจริง = **Hesitation Score (ms)** บ่งชี้ motor planning delay
(วัดแม่นกว่าใน desktop app เพราะไม่มี network)

## ไฟล์
- `index.html` — โครงหน้า
- `style.css` — สไตล์เรียบ ๆ
- `app.js` — เปิดกล้อง, WebSocket, วาดผลลัพธ์

## ตั้งค่า
- URL ของ backend แก้ได้ในช่อง input บนหน้าเว็บ (เริ่มต้นอิงจากโฮสต์ที่เปิดหน้า)
- ขนาดเฟรมที่ส่ง: ตัวแปร `SEND_W` ใน `app.js` (เริ่มต้น 480px — เล็กลง = เร็วขึ้น)
# Test-Websocket
