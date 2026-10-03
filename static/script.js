// ═══════════════════════════════════════════════
// المان‌های اصلی
// ═══════════════════════════════════════════════
const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const detectBtn = document.getElementById("detectBtn");
const uploadStatus = document.getElementById("uploadStatus");
const preview = document.getElementById("preview");

let uploadedFilename = null;

// ⭐ ابعاد اصلی عکسی که AI روش کار کرده (برای رندر مجدد ثابت بمونه)
let planImageWidth = 1000;
let planImageHeight = 700;

// ⭐ بازیابی از localStorage اگه قبلاً ذخیره شده
try {
	const stored = localStorage.getItem("melka-plan");
	if (stored) {
		const parsed = JSON.parse(stored);
		if (parsed.imageWidth) planImageWidth = parsed.imageWidth;
		if (parsed.imageHeight) planImageHeight = parsed.imageHeight;
	}
} catch (e) {
	console.warn("خطا در خواندن localStorage:", e);
}

// ═══════════════════════════════════════════════
// آپلود
// ═══════════════════════════════════════════════
uploadBtn.addEventListener("click", async () => {
	const file = fileInput.files[0];
	if (!file) return (uploadStatus.textContent = "❌ اول یه عکس انتخاب کن");

	const formData = new FormData();
	formData.append("floorPlan", file);
	uploadStatus.textContent = "⏳ در حال آپلود...";

	try {
		const res = await fetch("/api/upload", { method: "POST", body: formData });
		const data = await res.json();
		if (data.success) {
			uploadStatus.textContent = "✅ آپلود شد";
			uploadedFilename = data.filename;
			detectBtn.disabled = false;
			preview.innerHTML = `<img src="${data.url}" alt="پلان" />`;
		} else {
			uploadStatus.textContent = "❌ " + (data.detail || data.error);
		}
	} catch (err) {
		uploadStatus.textContent = "❌ خطای شبکه: " + err.message;
	}
});

// ═══════════════════════════════════════════════
// تشخیص AI
// ═══════════════════════════════════════════════
detectBtn.addEventListener("click", async () => {
	if (!uploadedFilename) return;
	detectBtn.disabled = true;
	uploadStatus.textContent = "🤖 در حال تشخیص خطوط و پله‌ها...";

	try {
		const res = await fetch("/api/detect-lines", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ filename: uploadedFilename }),
		});
		const data = await res.json();

		if (data.success) {
			const stairCount = data.stairs ? data.stairs.length : 0;
			uploadStatus.textContent = `✅ ${data.lines.length} خط و ${stairCount} پله تشخیص داده شد (${data.elapsed} میلی‌ثانیه)`;
			console.log("نتیجه AI:", data);

			walls = data.lines.map((l) => ({
				x1: l.x1,
				y1: l.y1,
				x2: l.x2,
				y2: l.y2,
			}));
			detectedStairs = data.stairs || [];

			// ⭐ ذخیره‌ی ابعاد اصلی عکس (برای رندر مجدد)
			planImageWidth = data.imageWidth || 1000;
			planImageHeight = data.imageHeight || 700;

			// ⭐ نقشه رو به اندازه‌ی canvas فیت کن
			fitToScreen();

			localStorage.setItem(
				"melka-plan",
				JSON.stringify({
					lines: data.lines,
					imageWidth: planImageWidth,
					imageHeight: planImageHeight,
					stairs: data.stairs || [],
				}),
			);

			document.getElementById("threeDBtn").style.display = "inline-block";
			showSettingsPanel();

			if (data.renderedUrl) {
				const renderedDiv = document.getElementById("renderedPlan");
				renderedDiv.innerHTML = `
                    <h2>🎨 نقشه نهایی</h2>
                    <img src="${data.renderedUrl}" alt="نقشه نهایی" style="max-width:100%;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1);" />
                    <div style="margin-top:12px;">
                        <a href="${data.renderedUrl}" download="plan.png" style="display:inline-block;padding:10px 18px;background:#27ae60;color:#fff;text-decoration:none;border-radius:8px;font-weight:500;">
                            💾 دانلود نقشه
                        </a>
                    </div>
                `;
				renderedDiv.style.display = "block";
			}
		} else {
			uploadStatus.textContent = "❌ " + (data.detail || data.error);
		}
	} catch (err) {
		uploadStatus.textContent = "❌ خطای شبکه: " + err.message;
	} finally {
		detectBtn.disabled = false;
	}
});

// ═══════════════════════════════════════════════
// Canvas و Viewport (زوم و پن)
// ═══════════════════════════════════════════════
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let view = {
	scale: 1,
	offsetX: 0,
	offsetY: 0,
};

function screenToWorld(screenX, screenY) {
	return {
		x: (screenX - view.offsetX) / view.scale,
		y: (screenY - view.offsetY) / view.scale,
	};
}

function getPos(e) {
	const rect = canvas.getBoundingClientRect();
	const scaleX = canvas.width / rect.width;
	const scaleY = canvas.height / rect.height;
	const clientX = e.touches ? e.touches[0].clientX : e.clientX;
	const clientY = e.touches ? e.touches[0].clientY : e.clientY;
	const screenX = (clientX - rect.left) * scaleX;
	const screenY = (clientY - rect.top) * scaleY;
	return screenToWorld(screenX, screenY);
}

// ⭐ فیت کردن نقشه به صفحه (فقط نمایش، داده دست‌نخورده می‌مونه)
function fitToScreen() {
	let minX = Infinity,
		minY = Infinity;
	let maxX = -Infinity,
		maxY = -Infinity;

	const allPoints = [];
	walls.forEach((w) => {
		allPoints.push({ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 });
	});
	doors.forEach((d) => {
		allPoints.push({ x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 });
	});
	windows.forEach((w) => {
		allPoints.push({ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 });
	});
	rooms.forEach((r) => {
		allPoints.push({ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h });
	});
	detectedStairs.forEach((s) => {
		allPoints.push({ x: s.x, y: s.y }, { x: s.x + s.width, y: s.y + s.height });
	});

	if (allPoints.length === 0) {
		view.scale = 1;
		view.offsetX = 0;
		view.offsetY = 0;
		redraw();
		return;
	}

	allPoints.forEach((p) => {
		minX = Math.min(minX, p.x);
		minY = Math.min(minY, p.y);
		maxX = Math.max(maxX, p.x);
		maxY = Math.max(maxY, p.y);
	});

	const mapW = maxX - minX;
	const mapH = maxY - minY;

	if (mapW === 0 || mapH === 0) {
		view.scale = 1;
		view.offsetX = 0;
		view.offsetY = 0;
		redraw();
		return;
	}

	const padding = 0.95;
	const scaleX = (canvas.width * padding) / mapW;
	const scaleY = (canvas.height * padding) / mapH;
	const newScale = Math.min(scaleX, scaleY);

	view.scale = newScale;
	view.offsetX = (canvas.width - mapW * newScale) / 2 - minX * newScale;
	view.offsetY = (canvas.height - mapH * newScale) / 2 - minY * newScale;

	redraw();
}

function resetView() {
	view.scale = 1;
	view.offsetX = 0;
	view.offsetY = 0;
	redraw();
}

function zoomAt(screenX, screenY, delta) {
	const oldScale = view.scale;
	const zoomFactor = delta > 0 ? 1.1 : 1 / 1.1;
	const newScale = Math.max(0.1, Math.min(20, oldScale * zoomFactor));

	view.offsetX = screenX - (screenX - view.offsetX) * (newScale / oldScale);
	view.offsetY = screenY - (screenY - view.offsetY) * (newScale / oldScale);
	view.scale = newScale;

	redraw();
}

// ═══════════════════════════════════════════════
// حالت‌ها
// ═══════════════════════════════════════════════
const drawWallBtn = document.getElementById("drawWall");
const drawRoomBtn = document.getElementById("drawRoom");
const drawDoorBtn = document.getElementById("drawDoor");
const drawWindowBtn = document.getElementById("drawWindow");
const labelRoomBtn = document.getElementById("labelRoom");
const clearBtn = document.getElementById("clearCanvas");
const savePlanBtn = document.getElementById("savePlan");
const roomCountEl = document.getElementById("roomCount");

let mode = "wall";
let walls = [];
let rooms = [];
let doors = [];
let windows = [];
let isDrawing = false;
let startPoint = null;
let currentPoint = null;
let detectedStairs = [];

let isPanning = false;
let panStart = { x: 0, y: 0, offsetX: 0, offsetY: 0 };

let mapSettings = {
	style: "modern",
	compass: { x: 700, y: 420, size: 40, direction: "north" },
	title: "",
	layers: {
		walls: true,
		rooms: true,
		roomLabels: true,
		stairs: true,
		doors: true,
		windows: true,
		compass: true,
		grid: false,
	},
};

function setMode(newMode, activeBtn) {
	mode = newMode;
	[drawWallBtn, drawRoomBtn, drawDoorBtn, drawWindowBtn, labelRoomBtn].forEach((b) => b.classList.remove("active"));
	if (activeBtn) activeBtn.classList.add("active");
}

drawWallBtn.onclick = () => setMode("wall", drawWallBtn);
drawRoomBtn.onclick = () => setMode("room", drawRoomBtn);
drawDoorBtn.onclick = () => setMode("door", drawDoorBtn);
drawWindowBtn.onclick = () => setMode("window", drawWindowBtn);
labelRoomBtn.onclick = () => setMode("label", labelRoomBtn);

clearBtn.onclick = () => {
	if (!confirm("مطمئنی می‌خوای همه‌چیز رو پاک کنی؟")) return;
	walls = [];
	rooms = [];
	doors = [];
	windows = [];
	detectedStairs = [];
	updateRoomCount();
	resetView();
};

// ═══════════════════════════════════════════════
// رویدادهای ماوس
// ═══════════════════════════════════════════════
function startDraw(e) {
	if (e.button === 1 || e.button === 2 || e.shiftKey) {
		e.preventDefault();
		isPanning = true;
		const rect = canvas.getBoundingClientRect();
		panStart.x = e.clientX - rect.left;
		panStart.y = e.clientY - rect.top;
		panStart.offsetX = view.offsetX;
		panStart.offsetY = view.offsetY;
		canvas.style.cursor = "grabbing";
		return;
	}

	e.preventDefault();
	isDrawing = true;
	startPoint = getPos(e);
	currentPoint = startPoint;
}

function moveDraw(e) {
	if (isPanning) {
		e.preventDefault();
		const rect = canvas.getBoundingClientRect();
		const dx = e.clientX - rect.left - panStart.x;
		const dy = e.clientY - rect.top - panStart.y;
		view.offsetX = panStart.offsetX + dx;
		view.offsetY = panStart.offsetY + dy;
		redraw();
		return;
	}

	if (!isDrawing) return;
	e.preventDefault();
	currentPoint = getPos(e);
	redraw();
	drawPreview();
}

function endDraw(e) {
	if (isPanning) {
		isPanning = false;
		canvas.style.cursor = "crosshair";
		return;
	}

	if (!isDrawing) return;
	e.preventDefault();
	isDrawing = false;
	const end = getPos(e);

	if (mode === "wall") {
		walls.push({ x1: startPoint.x, y1: startPoint.y, x2: end.x, y2: end.y });
	} else if (mode === "room") {
		rooms.push({
			x: Math.min(startPoint.x, end.x),
			y: Math.min(startPoint.y, end.y),
			w: Math.abs(end.x - startPoint.x),
			h: Math.abs(end.y - startPoint.y),
			name: "",
			type: "unknown",
		});
		updateRoomCount();
	} else if (mode === "door") {
		doors.push({
			x1: startPoint.x,
			y1: startPoint.y,
			x2: end.x,
			y2: end.y,
		});
	} else if (mode === "window") {
		windows.push({
			x1: startPoint.x,
			y1: startPoint.y,
			x2: end.x,
			y2: end.y,
		});
	} else if (mode === "label") {
		const idx = findRoomAtPoint(end);
		if (idx >= 0) {
			openLabelDialog(idx);
		} else {
			alert("❌ روی یه اتاق کلیک کن");
		}
	}

	startPoint = null;
	currentPoint = null;
	redraw();
}

// ⭐ زوم با چرخ ماوس
canvas.addEventListener(
	"wheel",
	(e) => {
		e.preventDefault();
		const rect = canvas.getBoundingClientRect();
		const scaleX = canvas.width / rect.width;
		const scaleY = canvas.height / rect.height;
		const mx = (e.clientX - rect.left) * scaleX;
		const my = (e.clientY - rect.top) * scaleY;

		zoomAt(mx, my, e.deltaY);
	},
	{ passive: false },
);

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// ⭐ دکمه‌های زوم
const zoomInBtn = document.getElementById("zoomIn");
const zoomOutBtn = document.getElementById("zoomOut");
const zoomResetBtn = document.getElementById("zoomReset");
const zoomFitBtn = document.getElementById("zoomFit");

if (zoomInBtn) {
	zoomInBtn.onclick = () => {
		zoomAt(canvas.width / 2, canvas.height / 2, -1);
	};
}
if (zoomOutBtn) {
	zoomOutBtn.onclick = () => {
		zoomAt(canvas.width / 2, canvas.height / 2, 1);
	};
}
if (zoomResetBtn) {
	zoomResetBtn.onclick = () => resetView();
}
if (zoomFitBtn) {
	zoomFitBtn.onclick = () => fitToScreen();
}

// ⭐ کیبورد
document.addEventListener("keydown", (e) => {
	if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;

	if (e.key === "+" || e.key === "=") {
		zoomAt(canvas.width / 2, canvas.height / 2, -1);
	} else if (e.key === "-" || e.key === "_") {
		zoomAt(canvas.width / 2, canvas.height / 2, 1);
	} else if (e.key === "0") {
		resetView();
	} else if (e.key === "f" || e.key === "F") {
		fitToScreen();
	}
});

// ⭐ رویدادهای canvas
canvas.addEventListener("mousedown", startDraw);
canvas.addEventListener("mousemove", moveDraw);
canvas.addEventListener("mouseup", endDraw);
canvas.addEventListener("mouseleave", () => {
	isDrawing = false;
	isPanning = false;
	canvas.style.cursor = "crosshair";
});

// ⭐ لمسی
let touchState = {
	active: false,
	startDist: 0,
	startScale: 1,
	startMid: { x: 0, y: 0 },
	startOffset: { x: 0, y: 0 },
};

canvas.addEventListener(
	"touchstart",
	(e) => {
		if (e.touches.length === 2) {
			e.preventDefault();
			isDrawing = false;

			const t1 = e.touches[0];
			const t2 = e.touches[1];
			const rect = canvas.getBoundingClientRect();
			const scaleX = canvas.width / rect.width;
			const scaleY = canvas.height / rect.height;

			touchState.active = true;
			touchState.startDist = Math.hypot((t2.clientX - t1.clientX) * scaleX, (t2.clientY - t1.clientY) * scaleY);
			touchState.startScale = view.scale;
			touchState.startMid = {
				x: ((t1.clientX + t2.clientX) / 2 - rect.left) * scaleX,
				y: ((t1.clientY + t2.clientY) / 2 - rect.top) * scaleY,
			};
			touchState.startOffset = { x: view.offsetX, y: view.offsetY };
		} else {
			startDraw(e);
		}
	},
	{ passive: false },
);

canvas.addEventListener(
	"touchmove",
	(e) => {
		if (e.touches.length === 2 && touchState.active) {
			e.preventDefault();

			const t1 = e.touches[0];
			const t2 = e.touches[1];
			const rect = canvas.getBoundingClientRect();
			const scaleX = canvas.width / rect.width;
			const scaleY = canvas.height / rect.height;

			const newDist = Math.hypot((t2.clientX - t1.clientX) * scaleX, (t2.clientY - t1.clientY) * scaleY);
			const newScale = touchState.startScale * (newDist / touchState.startDist);

			const mid = {
				x: ((t1.clientX + t2.clientX) / 2 - rect.left) * scaleX,
				y: ((t1.clientY + t2.clientY) / 2 - rect.top) * scaleY,
			};

			view.offsetX = mid.x - (touchState.startMid.x - touchState.startOffset.x) * (newScale / touchState.startScale);
			view.offsetY = mid.y - (touchState.startMid.y - touchState.startOffset.y) * (newScale / touchState.startScale);
			view.scale = Math.max(0.1, Math.min(20, newScale));

			redraw();
		} else {
			moveDraw(e);
		}
	},
	{ passive: false },
);

canvas.addEventListener(
	"touchend",
	(e) => {
		if (touchState.active && e.touches.length < 2) {
			touchState.active = false;
			return;
		}
		endDraw(e);
	},
	{ passive: false },
);

// ═══════════════════════════════════════════════
// توابع کمکی
// ═══════════════════════════════════════════════
function findRoomAtPoint(pt) {
	for (let i = 0; i < rooms.length; i++) {
		const r = rooms[i];
		if (pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h) {
			return i;
		}
	}
	return -1;
}

function openLabelDialog(roomIdx) {
	const room = rooms[roomIdx];
	const name = prompt("اسم این اتاق چیه؟\n(آشپزخانه، اتاق خواب، پذیرایی، سرویس، ...)", room.name || "");
	if (name === null) return;
	rooms[roomIdx].name = name;
	rooms[roomIdx].type = detectRoomType(name);
	redraw();
}

function detectRoomType(name) {
	if (!name) return "unknown";
	const n = name.trim();
	const map = {
		"اتاق خواب": "bedroom",
		خواب: "bedroom",
		مستر: "master_bedroom",
		کودک: "kids_room",
		مهمان: "guest_room",
		پذیرایی: "living_room",
		نشیمن: "living_room",
		هال: "living_room",
		آشپزخانه: "kitchen",
		آشپز: "kitchen",
		اپن: "open_kitchen",
		حمام: "bathroom",
		دستشویی: "wc",
		سرویس: "wc",
		بالکن: "balcony",
		تراس: "terrace",
		انباری: "storage",
		انبار: "storage",
		پارکینگ: "parking",
		راهرو: "corridor",
		ورودی: "entrance",
		مطالعه: "study",
		دفتر: "office",
	};
	for (const key in map) {
		if (n.includes(key)) return map[key];
	}
	return "unknown";
}

function drawPreview() {
	if (!startPoint || !currentPoint) return;
	ctx.save();

	ctx.translate(view.offsetX, view.offsetY);
	ctx.scale(view.scale, view.scale);

	ctx.setLineDash([5 / view.scale, 5 / view.scale]);
	ctx.strokeStyle = mode === "wall" ? "#e74c3c" : mode === "room" ? "#3498db" : mode === "door" ? "#8B4513" : mode === "window" ? "#3498DB" : "#888";
	ctx.lineWidth = 2 / view.scale;

	if (mode === "room") {
		const x = Math.min(startPoint.x, currentPoint.x);
		const y = Math.min(startPoint.y, currentPoint.y);
		const w = Math.abs(currentPoint.x - startPoint.x);
		const h = Math.abs(currentPoint.y - startPoint.y);
		ctx.strokeRect(x, y, w, h);
	} else {
		ctx.beginPath();
		ctx.moveTo(startPoint.x, startPoint.y);
		ctx.lineTo(currentPoint.x, currentPoint.y);
		ctx.stroke();
	}
	ctx.restore();
}

// ═══════════════════════════════════════════════
// رسم کامل
// ═══════════════════════════════════════════════
function redraw() {
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = "#fafbfc";
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	ctx.save();
	ctx.translate(view.offsetX, view.offsetY);
	ctx.scale(view.scale, view.scale);

	const layers = mapSettings.layers;

	if (layers.grid) drawGrid();

	if (layers.rooms) {
		const detectedRooms = findRooms(walls);
		detectedRooms.forEach((room, i) => drawRoomFill(room, i));
	}

	if (layers.walls) drawWalls(walls);
	if (layers.windows) drawWindows(windows);
	if (layers.doors) drawDoors(doors);
	if (layers.stairs) drawStairs(detectedStairs);

	if (layers.roomLabels) {
		const detectedRooms = findRooms(walls);
		detectedRooms.forEach((room, i) => drawRoomLabel(room, i));
	}

	rooms.forEach((r) => {
		ctx.fillStyle = "rgba(52, 152, 219, 0.10)";
		ctx.fillRect(r.x, r.y, r.w, r.h);
		ctx.strokeStyle = "#3498db";
		ctx.lineWidth = 2 / view.scale;
		ctx.strokeRect(r.x, r.y, r.w, r.h);
		if (layers.roomLabels && r.name) {
			ctx.fillStyle = "#2c3e50";
			ctx.font = `bold ${14 / view.scale}px Tahoma`;
			ctx.textAlign = "center";
			ctx.fillText(r.name, r.x + r.w / 2, r.y + r.h / 2);
		}
	});

	ctx.restore();

	if (layers.compass) drawCompassOnCanvas();

	drawZoomIndicator();
}

function drawZoomIndicator() {
	const text = `🔍 ${Math.round(view.scale * 100)}%`;
	ctx.save();
	ctx.font = "bold 12px Tahoma";
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	const padding = 6;
	const metrics = ctx.measureText(text);
	const w = metrics.width + padding * 2;
	const h = 22;

	ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
	roundRect(ctx, 10, 10, w, h, 6);
	ctx.fill();
	ctx.strokeStyle = "#dfe6e9";
	ctx.lineWidth = 1;
	ctx.stroke();

	ctx.fillStyle = "#2c3e50";
	ctx.fillText(text, 10 + padding, 10 + 5);
	ctx.restore();
}

function drawDoors(doors) {
	if (!doors || doors.length === 0) return;
	ctx.save();

	doors.forEach((d) => {
		const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1);
		if (len < 3) return;

		ctx.strokeStyle = "#fafbfc";
		ctx.lineWidth = 8 / view.scale;
		ctx.beginPath();
		ctx.moveTo(d.x1, d.y1);
		ctx.lineTo(d.x2, d.y2);
		ctx.stroke();

		ctx.strokeStyle = "#8B4513";
		ctx.lineWidth = 3 / view.scale;
		const angle = Math.atan2(d.y2 - d.y1, d.x2 - d.x1);
		const doorAngle = angle - Math.PI / 2;
		const dx = d.x1 + Math.cos(doorAngle) * len;
		const dy = d.y1 + Math.sin(doorAngle) * len;
		ctx.beginPath();
		ctx.moveTo(d.x1, d.y1);
		ctx.lineTo(dx, dy);
		ctx.stroke();

		ctx.beginPath();
		ctx.arc(d.x1, d.y1, len, angle, doorAngle, angle > doorAngle);
		ctx.stroke();
	});
	ctx.restore();
}

function drawWindows(windows) {
	if (!windows || windows.length === 0) return;
	ctx.save();

	windows.forEach((w) => {
		const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
		if (len < 3) return;

		ctx.strokeStyle = "#fafbfc";
		ctx.lineWidth = 8 / view.scale;
		ctx.beginPath();
		ctx.moveTo(w.x1, w.y1);
		ctx.lineTo(w.x2, w.y2);
		ctx.stroke();

		const angle = Math.atan2(w.y2 - w.y1, w.x2 - w.x1);
		const perp = angle + Math.PI / 2;
		const offset = 3;

		ctx.strokeStyle = "#3498DB";
		ctx.lineWidth = 2 / view.scale;
		for (const sign of [-1, 1]) {
			const ox = Math.cos(perp) * offset * sign;
			const oy = Math.sin(perp) * offset * sign;
			ctx.beginPath();
			ctx.moveTo(w.x1 + ox, w.y1 + oy);
			ctx.lineTo(w.x2 + ox, w.y2 + oy);
			ctx.stroke();
		}
	});
	ctx.restore();
}

function drawCompassOnCanvas() {
	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);

	const c = mapSettings.compass;
	const r = c.size;
	const cx = c.x;
	const cy = c.y;

	ctx.strokeStyle = "#2c3e50";
	ctx.lineWidth = 2;

	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.stroke();

	const dirs = {
		north: -Math.PI / 2,
		south: Math.PI / 2,
		east: 0,
		west: Math.PI,
	};
	const baseAngle = dirs[c.direction] ?? -Math.PI / 2;
	const tipX = cx + Math.cos(baseAngle) * (r - 8);
	const tipY = cy + Math.sin(baseAngle) * (r - 8);

	ctx.fillStyle = "#E74C3C";
	ctx.beginPath();
	ctx.moveTo(tipX, tipY);
	ctx.lineTo(cx + Math.cos(baseAngle - 0.4) * (r - 14), cy + Math.sin(baseAngle - 0.4) * (r - 14));
	ctx.lineTo(cx + Math.cos(baseAngle + 0.4) * (r - 14), cy + Math.sin(baseAngle + 0.4) * (r - 14));
	ctx.closePath();
	ctx.fill();

	ctx.fillStyle = "#2c3e50";
	ctx.font = `bold ${Math.floor(r * 0.6)}px Tahoma`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText("N", cx, cy - r - 12);

	ctx.restore();
}

function drawStairs(stairs) {
	if (!stairs || stairs.length === 0) return;

	stairs.forEach((stair) => {
		ctx.strokeStyle = "#e67e22";
		ctx.lineWidth = 2 / view.scale;
		ctx.lineCap = "round";

		if (stair.lines && Array.isArray(stair.lines)) {
			stair.lines.forEach((line) => {
				ctx.beginPath();
				ctx.moveTo(line.x1, line.y1);
				ctx.lineTo(line.x2, line.y2);
				ctx.stroke();
			});
		}

		ctx.strokeStyle = "#d35400";
		ctx.lineWidth = 2 / view.scale;
		ctx.setLineDash([6 / view.scale, 4 / view.scale]);
		ctx.strokeRect(stair.x, stair.y, stair.width, stair.height);
		ctx.setLineDash([]);

		const cx = stair.x + stair.width / 2;
		const cy = stair.y + stair.height / 2;

		const label = `🪜 ${stair.step_count}`;
		ctx.font = `bold ${12 / view.scale}px Tahoma`;
		const textWidth = ctx.measureText(label).width;
		const padding = 4 / view.scale;

		ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
		ctx.strokeStyle = "#d35400";
		ctx.lineWidth = 1.5 / view.scale;
		roundRect(ctx, cx - textWidth / 2 - padding, cy - 9 / view.scale - padding, textWidth + padding * 2, 18 / view.scale + padding * 2, 6 / view.scale);
		ctx.fill();
		ctx.stroke();

		ctx.fillStyle = "#d35400";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(label, cx, cy);
	});
}

function drawWalls(lines) {
	ctx.strokeStyle = "#2c3e50";
	ctx.lineWidth = 4 / view.scale;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	lines.forEach((w) => {
		ctx.beginPath();
		ctx.moveTo(w.x1, w.y1);
		ctx.lineTo(w.x2, w.y2);
		ctx.stroke();
	});
}

function drawRoomFill(room, index) {
	const colors = ["#e8f4f8", "#fef5e7", "#eafaf1", "#f4ecf7", "#fdedec", "#fef9e7", "#ebf5fb", "#e8f8f5"];
	const color = colors[index % colors.length];
	ctx.fillStyle = color;
	roundRect(ctx, room.x + 3 / view.scale, room.y + 3 / view.scale, room.w - 6 / view.scale, room.h - 6 / view.scale, 8 / view.scale);
	ctx.fill();
}

function drawRoomLabel(room, index) {
	const areaM2 = ((room.w * room.h) / 10000).toFixed(1);
	ctx.fillStyle = "#2c3e50";
	ctx.font = `bold ${15 / view.scale}px Tahoma`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(`اتاق ${index + 1}`, room.x + room.w / 2, room.y + room.h / 2 - 10 / view.scale);
	ctx.fillStyle = "#7f8c8d";
	ctx.font = `${12 / view.scale}px Tahoma`;
	ctx.fillText(`${areaM2} m²`, room.x + room.w / 2, room.y + room.h / 2 + 12 / view.scale);
}

function roundRect(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.lineTo(x + w - r, y);
	ctx.quadraticCurveTo(x + w, y, x + w, y + r);
	ctx.lineTo(x + w, y + h - r);
	ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
	ctx.lineTo(x + r, y + h);
	ctx.quadraticCurveTo(x, y + h, x, y + h - r);
	ctx.lineTo(x, y + r);
	ctx.quadraticCurveTo(x, y, x + r, y);
	ctx.closePath();
}

function drawGrid() {
	const baseStep = 25;
	const startX = Math.floor(-view.offsetX / view.scale / baseStep) * baseStep;
	const startY = Math.floor(-view.offsetY / view.scale / baseStep) * baseStep;

	const endX = startX + canvas.width / view.scale + baseStep;
	const endY = startY + canvas.height / view.scale + baseStep;

	ctx.fillStyle = "#dfe6e9";
	for (let x = startX; x < endX; x += baseStep) {
		for (let y = startY; y < endY; y += baseStep) {
			ctx.beginPath();
			ctx.arc(x, y, 0.8 / view.scale, 0, Math.PI * 2);
			ctx.fill();
		}
	}
}

function updateRoomCount() {
	roomCountEl.textContent = `تعداد اتاق: ${rooms.length}`;
}

// ═══════════════════════════════════════════════
// پیدا کردن اتاق‌ها
// ═══════════════════════════════════════════════
function findRooms(lines) {
	if (lines.length < 4) return [];
	const h = lines.filter((l) => Math.abs(l.y1 - l.y2) < 2);
	const v = lines.filter((l) => Math.abs(l.x1 - l.x2) < 2);
	if (h.length < 2 || v.length < 2) return [];

	const corners = [];
	h.forEach((hl) => {
		v.forEach((vl) => {
			const x = vl.x1;
			const y = hl.y1;
			const onH = x >= Math.min(hl.x1, hl.x2) - 10 && x <= Math.max(hl.x1, hl.x2) + 10;
			const onV = y >= Math.min(vl.y1, vl.y2) - 10 && y <= Math.max(vl.y1, vl.y2) + 10;
			if (onH && onV) {
				if (!corners.some((c) => Math.abs(c.x - x) < 5 && Math.abs(c.y - y) < 5)) {
					corners.push({ x, y });
				}
			}
		});
	});

	if (corners.length < 4) return [];

	const detected = [];
	const used = new Set();

	for (let i = 0; i < corners.length; i++) {
		if (used.has(i)) continue;
		const c1 = corners[i];
		for (let j = i + 1; j < corners.length; j++) {
			if (used.has(j)) continue;
			const c2 = corners[j];
			if (Math.abs(c1.y - c2.y) > 5) continue;
			if (c2.x <= c1.x + 30) continue;
			for (let k = i + 1; k < corners.length; k++) {
				if (used.has(k) || k === j) continue;
				const c3 = corners[k];
				if (Math.abs(c1.x - c3.x) > 5) continue;
				if (c3.y <= c1.y + 30) continue;
				for (let l = k + 1; l < corners.length; l++) {
					if (used.has(l) || l === j) continue;
					const c4 = corners[l];
					if (Math.abs(c2.x - c4.x) > 5) continue;
					if (Math.abs(c3.y - c4.y) > 5) continue;
					const w = c2.x - c1.x;
					const hh = c3.y - c1.y;
					if (w < 40 || hh < 40) continue;
					detected.push({ x: c1.x, y: c1.y, w, h: hh, area: w * hh });
					used.add(i);
					used.add(j);
					used.add(k);
					used.add(l);
					break;
				}
				if (used.has(i)) break;
			}
			if (used.has(i)) break;
		}
	}

	const filtered = [];
	for (const r of detected) {
		let isInside = false;
		for (const other of detected) {
			if (r === other) continue;
			if (r.x >= other.x && r.y >= other.y && r.x + r.w <= other.x + other.w && r.y + r.h <= other.y + other.h) {
				isInside = true;
				break;
			}
		}
		if (!isInside) filtered.push(r);
	}
	return filtered;
}

// ═══════════════════════════════════════════════
// ذخیره پلان
// ═══════════════════════════════════════════════
savePlanBtn.onclick = async () => {
	if (walls.length === 0 && rooms.length === 0) return alert("نقشه خالیه!");
	try {
		const res = await fetch("/api/plans", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				walls,
				rooms,
				stairs: detectedStairs,
				doors,
				windows,
				compass: mapSettings.compass,
				layers: mapSettings.layers,
				style: mapSettings.style,
				title: mapSettings.title,
				imageWidth: planImageWidth,
				imageHeight: planImageHeight,
			}),
		});
		const data = await res.json();
		if (data.success) {
			alert("✅ نقشه ذخیره شد");
			loadPlans();
		}
	} catch (err) {
		alert("❌ خطا: " + err.message);
	}
};

// ═══════════════════════════════════════════════
// لیست پلان‌ها
// ═══════════════════════════════════════════════
async function loadPlans() {
	const res = await fetch("/api/plans");
	const plans = await res.json();
	const list = document.getElementById("plansList");
	if (plans.length === 0) {
		list.textContent = "هنوز نقشه‌ای ذخیره نشده";
		return;
	}
	list.innerHTML = plans
		.map(
			(p) => `
    <div style="padding:10px;border-bottom:1px solid #eee;">
      <strong>نقشه #${p.id}</strong> — 
      ${p.walls?.length || 0} دیوار، 
      ${p.rooms?.length || 0} اتاق،
      ${p.stairs?.length || 0} پله
      ${p.doors?.length ? `، ${p.doors.length} در` : ""}
      ${p.windows?.length ? `، ${p.windows.length} پنجره` : ""}
    </div>
  `,
		)
		.join("");
}

// ═══════════════════════════════════════════════
// پنل تنظیمات
// ═══════════════════════════════════════════════
const settingsPanel = document.getElementById("settingsPanel");
const reRenderBtn = document.getElementById("reRender");
const styleSelect = document.getElementById("styleSelect");
const compassDirection = document.getElementById("compassDirection");
const planTitle = document.getElementById("planTitle");

function showSettingsPanel() {
	settingsPanel.style.display = "block";
}

if (styleSelect) {
	styleSelect.addEventListener("change", (e) => {
		mapSettings.style = e.target.value;
		redraw();
	});
}

if (compassDirection) {
	compassDirection.addEventListener("change", (e) => {
		mapSettings.compass.direction = e.target.value;
		redraw();
	});
}

if (planTitle) {
	planTitle.addEventListener("input", (e) => {
		mapSettings.title = e.target.value;
	});
}

const layerMap = {
	layerWalls: "walls",
	layerRooms: "rooms",
	layerLabels: "roomLabels",
	layerStairs: "stairs",
	layerDoors: "doors",
	layerWindows: "windows",
	layerCompass: "compass",
	layerGrid: "grid",
};

Object.keys(layerMap).forEach((id) => {
	const el = document.getElementById(id);
	if (!el) return;
	el.addEventListener("change", (e) => {
		mapSettings.layers[layerMap[id]] = e.target.checked;
		redraw();
	});
});

reRenderBtn.addEventListener("click", async () => {
	if (walls.length === 0 && rooms.length === 0) {
		return alert("اول یه نقشه بکش");
	}

	reRenderBtn.disabled = true;
	reRenderBtn.textContent = "⏳ در حال رندر...";

	try {
		const res = await fetch("/api/render", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				lines: walls.map((w) => ({
					x1: w.x1,
					y1: w.y1,
					x2: w.x2,
					y2: w.y2,
					length: Math.hypot(w.x2 - w.x1, w.y2 - w.y1),
					orientation: Math.abs(w.y1 - w.y2) < Math.abs(w.x1 - w.x2) ? "h" : "v",
				})),
				stairs: detectedStairs,
				rooms: rooms,
				doors: doors,
				windows: windows,
				compass: mapSettings.compass,
				layers: mapSettings.layers,
				style: mapSettings.style,
				title: mapSettings.title,
				imageWidth: planImageWidth,
				imageHeight: planImageHeight,
			}),
		});

		const data = await res.json();
		if (data.success) {
			const renderedDiv = document.getElementById("renderedPlan");
			renderedDiv.innerHTML = `
                <h2>🎨 نقشه‌ی نهایی</h2>
                <img src="${data.renderedUrl}" alt="نقشه" style="max-width:100%;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1);" />
                <div style="margin-top:12px;">
                    <a href="${data.renderedUrl}" download="plan.png" style="display:inline-block;padding:10px 18px;background:#27ae60;color:#fff;text-decoration:none;border-radius:8px;font-weight:500;">
                        💾 دانلود
                    </a>
                </div>
            `;
			renderedDiv.style.display = "block";
			renderedDiv.scrollIntoView({ behavior: "smooth" });
		} else {
			alert("خطا: " + (data.detail || "ناشناخته"));
		}
	} catch (err) {
		alert("خطای شبکه: " + err.message);
	} finally {
		reRenderBtn.disabled = false;
		reRenderBtn.textContent = "🎨 رندر مجدد";
	}
});

// ═══════════════════════════════════════════════
// شروع
// ═══════════════════════════════════════════════
redraw();
loadPlans();
