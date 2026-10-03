// ═══════════════════════════════════════════════
// المان‌ها
// ═══════════════════════════════════════════════
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const wrapper = document.getElementById("canvasWrapper");
const toolbar = document.getElementById("toolbar");
const properties = document.getElementById("properties");
const textInput = document.getElementById("textInput");
const toolHint = document.getElementById("toolHint");
const zoomIndicator = document.getElementById("zoomIndicator");
const selectionInfo = document.getElementById("selectionInfo");
const deleteBtn = document.getElementById("deleteBtn");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");

const propColor = document.getElementById("propColor");
const propWidth = document.getElementById("propWidth");
const propFill = document.getElementById("propFill");
const propFontSize = document.getElementById("propFontSize");
const fontRow = document.getElementById("fontRow");
const fillRow = document.getElementById("fillRow");

// ═══════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════
let objects = []; // همه‌ی شیءها
let selectedId = null; // شیء انتخاب‌شده
let currentTool = "select"; // ابزار فعال
let history = []; // برای Undo
let redoStack = []; // برای Redo
let isDrawing = false;
let startPoint = null;
let currentPoint = null;
let draggingObject = null;
let dragOffset = { x: 0, y: 0 };
let isPanning = false;
let panStart = { x: 0, y: 0, ox: 0, oy: 0 };

// viewport
let view = { scale: 1, offsetX: 0, offsetY: 0 };

// ابعاد اصلی عکس AI
let planImageWidth = 1000;
let planImageHeight = 700;

// نقشه‌ی AI
let detectedStairs = [];
let baseWalls = []; // خطوط دیوار از AI (فقط برای فیت کردن)

let mapSettings = {
	style: "modern",
	compass: { x: 700, y: 420, size: 40, direction: "north" },
	title: "",
};

// رنگ‌های پیش‌فرض
const DEFAULT_STYLE = {
	wall: { color: "#2c3e50", width: 4 },
	door: { color: "#8B4513", width: 3 },
	window: { color: "#3498DB", width: 3 },
	text: { color: "#2c3e50", fontSize: 20, bg: "#ffffff" },
	arrow: { color: "#e74c3c", width: 3 },
	rect: { color: "#3498db", width: 2, fill: "transparent" },
	circle: { color: "#9b59b6", width: 2, fill: "transparent" },
	room: { color: "#3498db", width: 2 },
};

// ═══════════════════════════════════════════════
// Helper: تولید ID
// ═══════════════════════════════════════════════
function uid() {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ═══════════════════════════════════════════════
// History (Undo/Redo)
// ═══════════════════════════════════════════════
function pushHistory() {
	history.push(JSON.stringify(objects));
	if (history.length > 50) history.shift();
	redoStack = [];
	updateUndoRedo();
}

function updateUndoRedo() {
	undoBtn.disabled = history.length <= 1;
	redoBtn.disabled = redoStack.length === 0;
}

function undo() {
	if (history.length <= 1) return;
	const current = history.pop();
	redoStack.push(current);
	objects = JSON.parse(history[history.length - 1]);
	selectedId = null;
	updateSelectionUI();
	redraw();
	updateUndoRedo();
}

function redo() {
	if (redoStack.length === 0) return;
	const state = redoStack.pop();
	history.push(state);
	objects = JSON.parse(state);
	selectedId = null;
	updateSelectionUI();
	redraw();
	updateUndoRedo();
}

undoBtn.onclick = undo;
redoBtn.onclick = redo;

// تاریخچه‌ی اولیه
history.push(JSON.stringify(objects));

// ═══════════════════════════════════════════════
// ابزارها
// ═══════════════════════════════════════════════
const toolHints = {
	select: "👆 روی اشیاء بزن تا انتخاب بشن | بکش تا جابجا کنی",
	wall: "🧱 بکش تا دیوار رسم کنی",
	room: "📐 بکش تا اتاق رسم کنی",
	door: "🚪 بکش تا در رسم کنی",
	window: "🪟 بکش تا پنجره رسم کنی",
	text: "🏷️ روی نقشه بزن، متن رو بنویس، Enter بزن",
	arrow: "➡️ بکش تا فلش رسم کنی",
	rect: "⬛ بکش تا مستطیل رسم کنی",
	circle: "⭕ بکش تا دایره رسم کنی",
	eraser: "🧽 روی هر شیء بزن تا پاک بشه",
};

document.querySelectorAll(".tool-btn").forEach((btn) => {
	btn.addEventListener("click", () => {
		const tool = btn.dataset.tool;

		// اگه ابزار text بود و یه input باز بود، ببندش
		if (textInput.style.display !== "none") {
			commitTextInput();
		}

		document.querySelectorAll(".tool-btn").forEach((b) => b.classList.remove("active"));
		btn.classList.add("active");
		currentTool = tool;
		toolHint.textContent = toolHints[tool] || "";
		selectedId = null;
		updateSelectionUI();
		redraw();
	});
});

// ═══════════════════════════════════════════════
// تبدیل مختصات
// ═══════════════════════════════════════════════
function screenToWorld(clientX, clientY) {
	const rect = wrapper.getBoundingClientRect();
	const localX = clientX - rect.left;
	const localY = clientY - rect.top;
	return {
		x: (localX - view.offsetX) / view.scale,
		y: (localY - view.offsetY) / view.scale,
	};
}

function worldToScreen(wx, wy) {
	const rect = wrapper.getBoundingClientRect();
	return {
		x: wx * view.scale + view.offsetX,
		y: wy * view.scale + view.offsetY,
	};
}

// ═══════════════════════════════════════════════
// فیت کردن نقشه (بعد از AI)
// ═══════════════════════════════════════════════
function fitToScreen() {
	// مرزهای همه‌ی اشیاء
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;

	function addPoint(x, y) {
		minX = Math.min(minX, x);
		minY = Math.min(minY, y);
		maxX = Math.max(maxX, x);
		maxY = Math.max(maxY, y);
	}

	objects.forEach((o) => {
		if (o.type === "wall" || o.type === "door" || o.type === "window" || o.type === "arrow") {
			addPoint(o.x1, o.y1);
			addPoint(o.x2, o.y2);
		} else if (o.type === "rect" || o.type === "room") {
			addPoint(o.x, o.y);
			addPoint(o.x + o.w, o.y + o.h);
		} else if (o.type === "circle") {
			addPoint(o.x - o.r, o.y - o.r);
			addPoint(o.x + o.r, o.y + o.r);
		} else if (o.type === "text") {
			addPoint(o.x, o.y);
			addPoint(o.x + 100, o.y + 30);
		}
	});

	if (!isFinite(minX)) {
		view = { scale: 1, offsetX: 0, offsetY: 0 };
		redraw();
		return;
	}

	const mapW = maxX - minX;
	const mapH = maxY - minY;
	if (mapW === 0 || mapH === 0) return;

	const cw = wrapper.clientWidth;
	const ch = wrapper.clientHeight;
	const padding = 0.9;
	const sx = (cw * padding) / mapW;
	const sy = (ch * padding) / mapH;
	const newScale = Math.min(sx, sy);

	view.scale = newScale;
	view.offsetX = (cw - mapW * newScale) / 2 - minX * newScale;
	view.offsetY = (ch - mapH * newScale) / 2 - minY * newScale;
	redraw();
}

function resetView() {
	view = { scale: 1, offsetX: 0, offsetY: 0 };
	redraw();
}

function zoomAt(screenX, screenY, factor) {
	const oldScale = view.scale;
	const newScale = Math.max(0.1, Math.min(20, oldScale * factor));
	view.offsetX = screenX - (screenX - view.offsetX) * (newScale / oldScale);
	view.offsetY = screenY - (screenY - view.offsetY) * (newScale / oldScale);
	view.scale = newScale;
	redraw();
}

// ═══════════════════════════════════════════════
// Resize canvas
// ═══════════════════════════════════════════════
function resizeCanvas() {
	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	const w = wrapper.clientWidth;
	const h = wrapper.clientHeight;
	canvas.width = w * dpr;
	canvas.height = h * dpr;
	canvas.style.width = w + "px";
	canvas.style.height = h + "px";
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	redraw();
}

window.addEventListener("resize", resizeCanvas);

// ═══════════════════════════════════════════════
// رسم اصلی
// ═══════════════════════════════════════════════
function redraw() {
	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	const w = wrapper.clientWidth;
	const h = wrapper.clientHeight;

	ctx.save();
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.fillStyle = "#fafbfc";
	ctx.fillRect(0, 0, w, h);
	ctx.restore();

	ctx.save();
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.translate(view.offsetX, view.offsetY);
	ctx.scale(view.scale, view.scale);

	// پله‌های AI (قبل از همه)
	drawStairsAI(detectedStairs);

	// همه‌ی اشیاء
	objects.forEach((o) => drawObject(o));

	// پیش‌نمایش رسم
	if (isDrawing && startPoint && currentPoint) {
		drawPreview();
	}

	// انتخاب
	if (selectedId) {
		const sel = objects.find((o) => o.id === selectedId);
		if (sel) drawSelectionIndicator(sel);
	}

	ctx.restore();

	// نمایشگر زوم
	zoomIndicator.textContent = `${Math.round(view.scale * 100)}%`;
}

function drawPreview() {
	const s = startPoint;
	const c = currentPoint;

	ctx.save();
	ctx.setLineDash([6 / view.scale, 4 / view.scale]);
	ctx.strokeStyle = "#3498db";
	ctx.lineWidth = 2 / view.scale;

	if (currentTool === "wall" || currentTool === "door" || currentTool === "window" || currentTool === "arrow") {
		ctx.beginPath();
		ctx.moveTo(s.x, s.y);
		ctx.lineTo(c.x, c.y);
		ctx.stroke();
	} else if (currentTool === "rect" || currentTool === "room") {
		const x = Math.min(s.x, c.x);
		const y = Math.min(s.y, c.y);
		const w = Math.abs(c.x - s.x);
		const h = Math.abs(c.y - s.y);
		ctx.strokeRect(x, y, w, h);
	} else if (currentTool === "circle") {
		const r = Math.hypot(c.x - s.x, c.y - s.y);
		ctx.beginPath();
		ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
		ctx.stroke();
	}
	ctx.restore();
}

function drawObject(o) {
	ctx.save();

	if (o.type === "wall") {
		ctx.strokeStyle = o.color || DEFAULT_STYLE.wall.color;
		ctx.lineWidth = (o.width || DEFAULT_STYLE.wall.width) / view.scale;
		ctx.lineCap = "round";
		ctx.beginPath();
		ctx.moveTo(o.x1, o.y1);
		ctx.lineTo(o.x2, o.y2);
		ctx.stroke();
	} else if (o.type === "door") {
		drawDoor(o);
	} else if (o.type === "window") {
		drawWindow(o);
	} else if (o.type === "room") {
		ctx.strokeStyle = o.color || DEFAULT_STYLE.room.color;
		ctx.lineWidth = 2 / view.scale;
		ctx.setLineDash([6 / view.scale, 4 / view.scale]);
		ctx.strokeRect(o.x, o.y, o.w, o.h);
		ctx.setLineDash([]);
		ctx.fillStyle = "rgba(52, 152, 219, 0.1)";
		ctx.fillRect(o.x, o.y, o.w, o.h);
	} else if (o.type === "rect") {
		ctx.strokeStyle = o.color || DEFAULT_STYLE.rect.color;
		ctx.lineWidth = (o.width || DEFAULT_STYLE.rect.width) / view.scale;
		if (o.fill && o.fill !== "transparent") {
			ctx.fillStyle = o.fill;
			ctx.fillRect(o.x, o.y, o.w, o.h);
		}
		ctx.strokeRect(o.x, o.y, o.w, o.h);
	} else if (o.type === "circle") {
		ctx.strokeStyle = o.color || DEFAULT_STYLE.circle.color;
		ctx.lineWidth = (o.width || DEFAULT_STYLE.circle.width) / view.scale;
		ctx.beginPath();
		ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
		if (o.fill && o.fill !== "transparent") {
			ctx.fillStyle = o.fill;
			ctx.fill();
		}
		ctx.stroke();
	} else if (o.type === "arrow") {
		drawArrow(o);
	} else if (o.type === "text") {
		drawText(o);
	}

	ctx.restore();
}

function drawDoor(o) {
	const len = Math.hypot(o.x2 - o.x1, o.y2 - o.y1);
	if (len < 3) return;

	ctx.strokeStyle = "#fafbfc";
	ctx.lineWidth = 8 / view.scale;
	ctx.beginPath();
	ctx.moveTo(o.x1, o.y1);
	ctx.lineTo(o.x2, o.y2);
	ctx.stroke();

	ctx.strokeStyle = o.color || DEFAULT_STYLE.door.color;
	ctx.lineWidth = 3 / view.scale;

	const angle = Math.atan2(o.y2 - o.y1, o.x2 - o.x1);
	const doorAngle = angle - Math.PI / 2;
	const dx = o.x1 + Math.cos(doorAngle) * len;
	const dy = o.y1 + Math.sin(doorAngle) * len;

	ctx.beginPath();
	ctx.moveTo(o.x1, o.y1);
	ctx.lineTo(dx, dy);
	ctx.stroke();

	ctx.beginPath();
	ctx.arc(o.x1, o.y1, len, angle, doorAngle, angle > doorAngle);
	ctx.stroke();
}

function drawWindow(o) {
	const len = Math.hypot(o.x2 - o.x1, o.y2 - o.y1);
	if (len < 3) return;

	ctx.strokeStyle = "#fafbfc";
	ctx.lineWidth = 8 / view.scale;
	ctx.beginPath();
	ctx.moveTo(o.x1, o.y1);
	ctx.lineTo(o.x2, o.y2);
	ctx.stroke();

	const angle = Math.atan2(o.y2 - o.y1, o.x2 - o.x1);
	const perp = angle + Math.PI / 2;
	const offset = 3 / view.scale;

	ctx.strokeStyle = o.color || DEFAULT_STYLE.window.color;
	ctx.lineWidth = 2 / view.scale;
	for (const sign of [-1, 1]) {
		const ox = Math.cos(perp) * offset * sign;
		const oy = Math.sin(perp) * offset * sign;
		ctx.beginPath();
		ctx.moveTo(o.x1 + ox, o.y1 + oy);
		ctx.lineTo(o.x2 + ox, o.y2 + oy);
		ctx.stroke();
	}
}

function drawArrow(o) {
	const angle = Math.atan2(o.y2 - o.y1, o.x2 - o.x1);
	const len = Math.hypot(o.x2 - o.x1, o.y2 - o.y1);
	const headLen = Math.min(20, len * 0.3) / view.scale;

	ctx.strokeStyle = o.color || DEFAULT_STYLE.arrow.color;
	ctx.fillStyle = o.color || DEFAULT_STYLE.arrow.color;
	ctx.lineWidth = (o.width || DEFAULT_STYLE.arrow.width) / view.scale;
	ctx.lineCap = "round";

	// خط
	ctx.beginPath();
	ctx.moveTo(o.x1, o.y1);
	ctx.lineTo(o.x2, o.y2);
	ctx.stroke();

	// سر فلش
	const ax = o.x2 - Math.cos(angle) * headLen;
	const ay = o.y2 - Math.sin(angle) * headLen;
	const perp = angle + Math.PI / 2;
	const w = headLen * 0.5;

	ctx.beginPath();
	ctx.moveTo(o.x2, o.y2);
	ctx.lineTo(ax + Math.cos(perp) * w, ay + Math.sin(perp) * w);
	ctx.lineTo(ax - Math.cos(perp) * w, ay - Math.sin(perp) * w);
	ctx.closePath();
	ctx.fill();
}

function drawText(o) {
	const fontSize = o.fontSize || DEFAULT_STYLE.text.fontSize;
	ctx.font = `bold ${fontSize}px Tahoma, sans-serif`;
	ctx.textAlign = "right";
	ctx.textBaseline = "top";

	const metrics = ctx.measureText(o.text || "");
	const tw = metrics.width;
	const th = fontSize * 1.2;

	// پس‌زمینه
	if (o.bg && o.bg !== "transparent") {
		ctx.fillStyle = o.bg;
		const pad = 6;
		roundRect(ctx, o.x - tw - pad, o.y - pad, tw + pad * 2, th + pad * 2, 6);
		ctx.fill();
	}

	ctx.fillStyle = o.color || DEFAULT_STYLE.text.color;
	ctx.fillText(o.text, o.x, o.y);
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

function drawStairsAI(stairs) {
	if (!stairs || stairs.length === 0) return;

	stairs.forEach((stair) => {
		ctx.save();
		ctx.strokeStyle = "#e67e22";
		ctx.lineWidth = 1.5 / view.scale;

		if (stair.lines) {
			stair.lines.forEach((line) => {
				ctx.beginPath();
				ctx.moveTo(line.x1, line.y1);
				ctx.lineTo(line.x2, line.y2);
				ctx.stroke();
			});
		}

		ctx.strokeStyle = "#d35400";
		ctx.setLineDash([5 / view.scale, 3 / view.scale]);
		ctx.strokeRect(stair.x, stair.y, stair.width, stair.height);
		ctx.setLineDash([]);

		const cx = stair.x + stair.width / 2;
		const cy = stair.y + stair.height / 2;

		ctx.fillStyle = "rgba(230, 126, 34, 0.15)";
		ctx.fillRect(stair.x, stair.y, stair.width, stair.height);

		ctx.fillStyle = "#d35400";
		ctx.font = `bold ${12 / view.scale}px Tahoma`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(`🪜${stair.step_count}`, cx, cy);

		ctx.restore();
	});
}

function drawSelectionIndicator(o) {
	ctx.save();
	ctx.strokeStyle = "#3498db";
	ctx.lineWidth = 2 / view.scale;
	ctx.setLineDash([4 / view.scale, 3 / view.scale]);

	const b = getObjectBounds(o);
	if (b) {
		ctx.strokeRect(b.x - 4 / view.scale, b.y - 4 / view.scale, b.w + 8 / view.scale, b.h + 8 / view.scale);
	}
	ctx.restore();
}

function getObjectBounds(o) {
	if (o.type === "wall" || o.type === "door" || o.type === "window" || o.type === "arrow") {
		return {
			x: Math.min(o.x1, o.x2),
			y: Math.min(o.y1, o.y2),
			w: Math.abs(o.x2 - o.x1),
			h: Math.abs(o.y2 - o.y1),
		};
	} else if (o.type === "rect" || o.type === "room") {
		return { x: o.x, y: o.y, w: o.w, h: o.h };
	} else if (o.type === "circle") {
		return { x: o.x - o.r, y: o.y - o.r, w: o.r * 2, h: o.r * 2 };
	} else if (o.type === "text") {
		const fontSize = o.fontSize || 20;
		ctx.save();
		ctx.font = `bold ${fontSize}px Tahoma, sans-serif`;
		const tw = ctx.measureText(o.text || "").width;
		ctx.restore();
		return { x: o.x - tw, y: o.y, w: tw, h: fontSize * 1.2 };
	}
	return null;
}

// ═══════════════════════════════════════════════
// برخورد (Hit test)
// ═══════════════════════════════════════════════
function hitTest(pt) {
	// از آخر به اول (آخرین شیء بالاتره)
	for (let i = objects.length - 1; i >= 0; i--) {
		const o = objects[i];
		if (isPointInObject(pt, o)) return o;
	}
	return null;
}

function isPointInObject(pt, o) {
	const tol = 12 / view.scale;

	if (o.type === "wall" || o.type === "door" || o.type === "window" || o.type === "arrow") {
		return pointToSegmentDist(pt.x, pt.y, o.x1, o.y1, o.x2, o.y2) < tol;
	} else if (o.type === "rect" || o.type === "room") {
		return pt.x >= o.x - tol && pt.x <= o.x + o.w + tol && pt.y >= o.y - tol && pt.y <= o.y + o.h + tol;
	} else if (o.type === "circle") {
		const d = Math.hypot(pt.x - o.x, pt.y - o.y);
		return d <= o.r + tol;
	} else if (o.type === "text") {
		const b = getObjectBounds(o);
		if (!b) return false;
		return pt.x >= b.x - tol && pt.x <= b.x + b.w + tol && pt.y >= b.y - tol && pt.y <= b.y + b.h + tol;
	}
	return false;
}

function pointToSegmentDist(px, py, x1, y1, x2, y2) {
	const dx = x2 - x1;
	const dy = y2 - y1;
	const lenSq = dx * dx + dy * dy;
	if (lenSq === 0) return Math.hypot(px - x1, py - y1);
	let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
	t = Math.max(0, Math.min(1, t));
	const cx = x1 + t * dx;
	const cy = y1 + t * dy;
	return Math.hypot(px - cx, py - cy);
}

// ═══════════════════════════════════════════════
// رویدادهای Pointer (پشتیبانی کامل موبایل + دسکتاپ)
// ═══════════════════════════════════════════════
let pointers = new Map(); // برای multipointer
let pinchStart = null;

canvas.addEventListener("pointerdown", (e) => {
	canvas.setPointerCapture(e.pointerId);
	pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

	// دو انگشت → زوم/پن
	if (pointers.size === 2) {
		isDrawing = false;
		const pts = Array.from(pointers.values());
		const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
		const mid = {
			x: (pts[0].x + pts[1].x) / 2,
			y: (pts[0].y + pts[1].y) / 2,
		};
		const rect = wrapper.getBoundingClientRect();
		pinchStart = {
			dist,
			scale: view.scale,
			midLocal: { x: mid.x - rect.left, y: mid.y - rect.top },
			offsetX: view.offsetX,
			offsetY: view.offsetY,
		};
		return;
	}

	// راست‌کلیک یا shift → پن
	if (e.button === 2 || e.shiftKey) {
		isPanning = true;
		panStart = {
			x: e.clientX,
			y: e.clientY,
			ox: view.offsetX,
			oy: view.offsetY,
		};
		canvas.style.cursor = "grabbing";
		return;
	}

	const pt = screenToWorld(e.clientX, e.clientY);

	if (currentTool === "select") {
		const hit = hitTest(pt);
		if (hit) {
			selectedId = hit.id;
			updateSelectionUI();
			draggingObject = hit;
			dragOffset = { x: pt.x, y: pt.y };
			canvas.style.cursor = "move";
		} else {
			selectedId = null;
			updateSelectionUI();
		}
		redraw();
		return;
	}

	if (currentTool === "eraser") {
		const hit = hitTest(pt);
		if (hit) {
			pushHistory();
			objects = objects.filter((o) => o.id !== hit.id);
			redraw();
		}
		return;
	}

	if (currentTool === "text") {
		// نمایش input شناور
		showTextInput(e.clientX, e.clientY);
		return;
	}

	// بقیه ابزارها → شروع رسم
	isDrawing = true;
	startPoint = pt;
	currentPoint = pt;
});

canvas.addEventListener("pointermove", (e) => {
	if (pointers.has(e.pointerId)) {
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
	}

	// دو انگشت → زوم/پن
	if (pointers.size === 2 && pinchStart) {
		const pts = Array.from(pointers.values());
		const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
		const mid = {
			x: (pts[0].x + pts[1].x) / 2,
			y: (pts[0].y + pts[1].y) / 2,
		};
		const rect = wrapper.getBoundingClientRect();
		const midLocal = { x: mid.x - rect.left, y: mid.y - rect.top };

		const newScale = Math.max(0.1, Math.min(20, pinchStart.scale * (dist / pinchStart.dist)));
		const ratio = newScale / pinchStart.scale;

		view.scale = newScale;
		view.offsetX = midLocal.x - (pinchStart.midLocal.x - pinchStart.offsetX) * ratio;
		view.offsetY = midLocal.y - (pinchStart.midLocal.y - pinchStart.offsetY) * ratio;
		redraw();
		return;
	}

	// پن
	if (isPanning) {
		const dx = e.clientX - panStart.x;
		const dy = e.clientY - panStart.y;
		view.offsetX = panStart.ox + dx;
		view.offsetY = panStart.oy + dy;
		redraw();
		return;
	}

	// درگ کردن شیء انتخاب‌شده
	if (draggingObject) {
		const pt = screenToWorld(e.clientX, e.clientY);
		const dx = pt.x - dragOffset.x;
		const dy = pt.y - dragOffset.y;
		moveObject(draggingObject, dx, dy);
		dragOffset = { x: pt.x, y: pt.y };
		redraw();
		return;
	}

	// رسم
	if (isDrawing) {
		currentPoint = screenToWorld(e.clientX, e.clientY);
		redraw();
	}
});

canvas.addEventListener("pointerup", (e) => {
	pointers.delete(e.pointerId);
	if (pointers.size < 2) pinchStart = null;

	if (isPanning) {
		isPanning = false;
		canvas.style.cursor = currentTool === "select" ? "default" : "crosshair";
		return;
	}

	if (draggingObject) {
		pushHistory();
		draggingObject = null;
		canvas.style.cursor = "default";
		return;
	}

	if (!isDrawing) return;
	isDrawing = false;

	if (startPoint && currentPoint) {
		const dist = Math.hypot(currentPoint.x - startPoint.x, currentPoint.y - startPoint.y);
		if (dist > 5) {
			pushHistory();
			createObject(currentTool, startPoint, currentPoint);
		}
	}

	startPoint = null;
	currentPoint = null;
	redraw();
});

canvas.addEventListener("pointercancel", (e) => {
	pointers.delete(e.pointerId);
	isDrawing = false;
	isPanning = false;
	draggingObject = null;
	pinchStart = null;
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// ═══════════════════════════════════════════════
// ساخت شیء
// ═══════════════════════════════════════════════
function createObject(tool, s, c) {
	const id = uid();
	let obj = null;

	if (tool === "wall") {
		obj = { id, type: "wall", x1: s.x, y1: s.y, x2: c.x, y2: c.y, ...DEFAULT_STYLE.wall };
	} else if (tool === "door") {
		obj = { id, type: "door", x1: s.x, y1: s.y, x2: c.x, y2: c.y, ...DEFAULT_STYLE.door };
	} else if (tool === "window") {
		obj = { id, type: "window", x1: s.x, y1: s.y, x2: c.x, y2: c.y, ...DEFAULT_STYLE.window };
	} else if (tool === "arrow") {
		obj = { id, type: "arrow", x1: s.x, y1: s.y, x2: c.x, y2: c.y, ...DEFAULT_STYLE.arrow };
	} else if (tool === "rect") {
		obj = {
			id,
			type: "rect",
			x: Math.min(s.x, c.x),
			y: Math.min(s.y, c.y),
			w: Math.abs(c.x - s.x),
			h: Math.abs(c.y - s.y),
			...DEFAULT_STYLE.rect,
		};
	} else if (tool === "room") {
		obj = {
			id,
			type: "room",
			x: Math.min(s.x, c.x),
			y: Math.min(s.y, c.y),
			w: Math.abs(c.x - s.x),
			h: Math.abs(c.y - s.y),
			color: DEFAULT_STYLE.room.color,
		};
	} else if (tool === "circle") {
		obj = {
			id,
			type: "circle",
			x: s.x,
			y: s.y,
			r: Math.hypot(c.x - s.x, c.y - s.y),
			...DEFAULT_STYLE.circle,
		};
	}

	if (obj) {
		objects.push(obj);
		selectedId = obj.id;
		updateSelectionUI();
	}
}

// ═══════════════════════════════════════════════
// جابجایی شیء
// ═══════════════════════════════════════════════
function moveObject(o, dx, dy) {
	if (o.type === "wall" || o.type === "door" || o.type === "window" || o.type === "arrow") {
		o.x1 += dx;
		o.y1 += dy;
		o.x2 += dx;
		o.y2 += dy;
	} else if (o.type === "rect" || o.type === "room" || o.type === "text") {
		o.x += dx;
		o.y += dy;
	} else if (o.type === "circle") {
		o.x += dx;
		o.y += dy;
	}
}

// ═══════════════════════════════════════════════
// Input متن شناور
// ═══════════════════════════════════════════════
let pendingTextPos = null;

function showTextInput(clientX, clientY) {
	const rect = wrapper.getBoundingClientRect();
	const localX = clientX - rect.left;
	const localY = clientY - rect.top;

	textInput.style.display = "block";
	textInput.style.left = Math.max(10, localX - 150) + "px";
	textInput.style.top = localY - 20 + "px";
	textInput.value = "";
	textInput.focus();

	pendingTextPos = screenToWorld(clientX, clientY);
}

function commitTextInput() {
	const val = textInput.value.trim();
	textInput.style.display = "none";
	textInput.value = "";

	if (!val || !pendingTextPos) {
		pendingTextPos = null;
		return;
	}

	pushHistory();
	const id = uid();
	objects.push({
		id,
		type: "text",
		x: pendingTextPos.x,
		y: pendingTextPos.y,
		text: val,
		color: DEFAULT_STYLE.text.color,
		fontSize: DEFAULT_STYLE.text.fontSize,
		bg: DEFAULT_STYLE.text.bg,
	});
	pendingTextPos = null;
	redraw();
}

textInput.addEventListener("keydown", (e) => {
	if (e.key === "Enter") {
		e.preventDefault();
		commitTextInput();
	} else if (e.key === "Escape") {
		textInput.style.display = "none";
		textInput.value = "";
		pendingTextPos = null;
	}
});

textInput.addEventListener("blur", () => {
	if (textInput.style.display !== "none" && textInput.value.trim()) {
		commitTextInput();
	} else {
		textInput.style.display = "none";
		pendingTextPos = null;
	}
});

// ═══════════════════════════════════════════════
// پنل خصوصیات
// ═══════════════════════════════════════════════
function updateSelectionUI() {
	if (!selectedId) {
		selectionInfo.textContent = "هیچ‌چیز انتخاب نشده";
		deleteBtn.style.display = "none";
		return;
	}

	const o = objects.find((x) => x.id === selectedId);
	if (!o) return;

	selectionInfo.textContent = `انتخاب: ${objectTypeName(o.type)}`;
	deleteBtn.style.display = "block";

	// رنگ
	if (o.color) propColor.value = o.color;

	// ضخامت
	if (o.width !== undefined) {
		propWidth.value = o.width;
		propWidth.parentElement.style.display = "flex";
	} else {
		propWidth.parentElement.style.display = "none";
	}

	// فونت
	if (o.type === "text") {
		fontRow.style.display = "flex";
		propFontSize.value = o.fontSize || 20;
	} else {
		fontRow.style.display = "none";
	}

	// پرکردن
	if (o.type === "rect" || o.type === "circle") {
		fillRow.style.display = "flex";
		propFill.value = o.fill && o.fill !== "transparent" ? o.fill : "#ffffff";
	} else {
		fillRow.style.display = "none";
	}
}

function objectTypeName(t) {
	return (
		{
			wall: "دیوار",
			door: "در",
			window: "پنجره",
			room: "اتاق",
			rect: "مستطیل",
			circle: "دایره",
			arrow: "فلش",
			text: "متن",
		}[t] || t
	);
}

deleteBtn.onclick = () => {
	if (!selectedId) return;
	pushHistory();
	objects = objects.filter((o) => o.id !== selectedId);
	selectedId = null;
	updateSelectionUI();
	redraw();
};

propColor.addEventListener("input", (e) => {
	if (!selectedId) return;
	const o = objects.find((x) => x.id === selectedId);
	if (o) {
		o.color = e.target.value;
		redraw();
	}
});

propColor.addEventListener("change", () => {
	if (selectedId) pushHistory();
});

propWidth.addEventListener("input", (e) => {
	if (!selectedId) return;
	const o = objects.find((x) => x.id === selectedId);
	if (o && o.width !== undefined) {
		o.width = parseInt(e.target.value);
		redraw();
	}
});

propWidth.addEventListener("change", () => {
	if (selectedId) pushHistory();
});

propFill.addEventListener("input", (e) => {
	if (!selectedId) return;
	const o = objects.find((x) => x.id === selectedId);
	if (o) {
		o.fill = e.target.value;
		redraw();
	}
});

propFill.addEventListener("change", () => {
	if (selectedId) pushHistory();
});

propFontSize.addEventListener("input", (e) => {
	if (!selectedId) return;
	const o = objects.find((x) => x.id === selectedId);
	if (o && o.type === "text") {
		o.fontSize = parseInt(e.target.value);
		redraw();
	}
});

propFontSize.addEventListener("change", () => {
	if (selectedId) pushHistory();
});

// دوبار کلیک روی متن → ویرایش
canvas.addEventListener("dblclick", (e) => {
	const pt = screenToWorld(e.clientX, e.clientY);
	const hit = hitTest(pt);
	if (hit && hit.type === "text") {
		const newText = prompt("متن جدید:", hit.text);
		if (newText !== null && newText.trim()) {
			pushHistory();
			hit.text = newText.trim();
			redraw();
		}
	}
});

// ═══════════════════════════════════════════════
// دکمه‌های زوم
// ═══════════════════════════════════════════════
document.getElementById("zoomIn").onclick = () => {
	const cx = wrapper.clientWidth / 2;
	const cy = wrapper.clientHeight / 2;
	zoomAt(cx, cy, 1.2);
};
document.getElementById("zoomOut").onclick = () => {
	const cx = wrapper.clientWidth / 2;
	const cy = wrapper.clientHeight / 2;
	zoomAt(cx, cy, 1 / 1.2);
};
document.getElementById("zoomFit").onclick = () => fitToScreen();
document.getElementById("zoomReset").onclick = () => resetView();

// ═══════════════════════════════════════════════
// کیبورد
// ═══════════════════════════════════════════════
document.addEventListener("keydown", (e) => {
	if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;

	if (e.key === "Delete" || e.key === "Backspace") {
		if (selectedId) {
			e.preventDefault();
			deleteBtn.click();
		}
	} else if (e.key === "Escape") {
		selectedId = null;
		updateSelectionUI();
		redraw();
	} else if ((e.ctrlKey || e.metaKey) && e.key === "z") {
		e.preventDefault();
		if (e.shiftKey) redo();
		else undo();
	}
});

// ═══════════════════════════════════════════════
// آپلود و تشخیص AI
// ═══════════════════════════════════════════════
const fileInput = document.getElementById("fileInput");
const detectBtn = document.getElementById("detectBtn");
const uploadStatus = document.getElementById("uploadStatus");
let uploadedFilename = null;

fileInput.addEventListener("change", async (e) => {
	const file = e.target.files[0];
	if (!file) return;

	uploadStatus.textContent = "⏳ در حال آپلود...";

	const fd = new FormData();
	fd.append("floorPlan", file);

	try {
		const res = await fetch("/api/upload", { method: "POST", body: fd });
		const data = await res.json();
		if (data.success) {
			uploadStatus.textContent = "✅ آپلود شد";
			uploadedFilename = data.filename;
			detectBtn.disabled = false;
		} else {
			uploadStatus.textContent = "❌ " + (data.detail || "خطا");
		}
	} catch (err) {
		uploadStatus.textContent = "❌ " + err.message;
	}
});

detectBtn.addEventListener("click", async () => {
	if (!uploadedFilename) return;
	detectBtn.disabled = true;
	uploadStatus.textContent = "🤖 در حال تشخیص...";

	try {
		const res = await fetch("/api/detect-lines", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ filename: uploadedFilename }),
		});
		const data = await res.json();

		if (data.success) {
			planImageWidth = data.imageWidth || 1000;
			planImageHeight = data.imageHeight || 700;
			detectedStairs = data.stairs || [];

			// اضافه کردن دیوارها به عنوان شیء
			pushHistory();
			const newWalls = (data.lines || []).map((l) => ({
				id: uid(),
				type: "wall",
				x1: l.x1,
				y1: l.y1,
				x2: l.x2,
				y2: l.y2,
				color: DEFAULT_STYLE.wall.color,
				width: DEFAULT_STYLE.wall.width,
			}));

			objects.push(...newWalls);

			uploadStatus.textContent = `✅ ${data.lines.length} خط و ${data.stairs?.length || 0} پله`;
			fitToScreen();
		} else {
			uploadStatus.textContent = "❌ " + (data.detail || "خطا");
		}
	} catch (err) {
		uploadStatus.textContent = "❌ " + err.message;
	} finally {
		detectBtn.disabled = false;
	}
});

// ═══════════════════════════════════════════════
// رندر نهایی
// ═══════════════════════════════════════════════
const reRenderBtn = document.getElementById("reRender");
const styleSelect = document.getElementById("styleSelect");
const compassDirection = document.getElementById("compassDirection");
const planTitle = document.getElementById("planTitle");
const clearBtn = document.getElementById("clearCanvas");

styleSelect.addEventListener("change", (e) => (mapSettings.style = e.target.value));
compassDirection.addEventListener("change", (e) => (mapSettings.compass.direction = e.target.value));
planTitle.addEventListener("input", (e) => (mapSettings.title = e.target.value));

clearBtn.onclick = () => {
	if (!confirm("همه‌چیز پاک بشه؟")) return;
	pushHistory();
	objects = [];
	detectedStairs = [];
	selectedId = null;
	updateSelectionUI();
	redraw();
};

reRenderBtn.addEventListener("click", async () => {
	if (objects.length === 0) return alert("اول یه چیزی بکش");

	reRenderBtn.disabled = true;
	reRenderBtn.textContent = "⏳...";

	try {
		// جدا کردن اشیاء برای بک‌اند
		const walls = objects
			.filter((o) => o.type === "wall")
			.map((o) => ({
				x1: o.x1,
				y1: o.y1,
				x2: o.x2,
				y2: o.y2,
				length: Math.hypot(o.x2 - o.x1, o.y2 - o.y1),
				orientation: Math.abs(o.y1 - o.y2) < Math.abs(o.x1 - o.x2) ? "h" : "v",
				color: o.color,
				width: o.width,
			}));
		const doors = objects
			.filter((o) => o.type === "door")
			.map((o) => ({
				x1: o.x1,
				y1: o.y1,
				x2: o.x2,
				y2: o.y2,
				color: o.color,
			}));
		const windows = objects
			.filter((o) => o.type === "window")
			.map((o) => ({
				x1: o.x1,
				y1: o.y1,
				x2: o.x2,
				y2: o.y2,
				color: o.color,
			}));
		const rooms = objects
			.filter((o) => o.type === "room")
			.map((o) => ({
				x: o.x,
				y: o.y,
				w: o.w,
				h: o.h,
			}));
		const texts = objects
			.filter((o) => o.type === "text")
			.map((o) => ({
				x: o.x,
				y: o.y,
				text: o.text,
				color: o.color,
				fontSize: o.fontSize,
				bg: o.bg,
			}));
		const arrows = objects
			.filter((o) => o.type === "arrow")
			.map((o) => ({
				x1: o.x1,
				y1: o.y1,
				x2: o.x2,
				y2: o.y2,
				color: o.color,
				width: o.width,
			}));
		const rects = objects
			.filter((o) => o.type === "rect")
			.map((o) => ({
				x: o.x,
				y: o.y,
				w: o.w,
				h: o.h,
				color: o.color,
				width: o.width,
				fill: o.fill,
			}));
		const circles = objects
			.filter((o) => o.type === "circle")
			.map((o) => ({
				x: o.x,
				y: o.y,
				r: o.r,
				color: o.color,
				width: o.width,
				fill: o.fill,
			}));

		const res = await fetch("/api/render", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				lines: walls,
				stairs: detectedStairs,
				rooms,
				doors,
				windows,
				texts,
				arrows,
				rects,
				circles,
				compass: mapSettings.compass,
				style: mapSettings.style,
				title: mapSettings.title,
				imageWidth: planImageWidth,
				imageHeight: planImageHeight,
			}),
		});

		const data = await res.json();
		if (data.success) {
			const panel = document.getElementById("renderedPlan");
			panel.innerHTML = `
                <img src="${data.renderedUrl}" alt="نقشه" />
                <div class="actions">
                    <a href="${data.renderedUrl}" download="plan.png">💾 دانلود</a>
                    <button id="closeRendered">✖ بستن</button>
                </div>
            `;
			panel.style.display = "flex";
			document.getElementById("closeRendered").onclick = () => {
				panel.style.display = "none";
			};
		} else {
			alert("خطا: " + (data.detail || "ناشناخته"));
		}
	} catch (err) {
		alert("خطای شبکه: " + err.message);
	} finally {
		reRenderBtn.disabled = false;
		reRenderBtn.textContent = "🎨 رندر نهایی";
	}
});

// ═══════════════════════════════════════════════
// شروع
// ═══════════════════════════════════════════════
resizeCanvas();
toolHint.textContent = toolHints.select;
