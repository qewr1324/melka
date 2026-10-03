// ═══════════════════════════════════════════════
// المان‌ها
// ═══════════════════════════════════════════════
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const wrapper = document.getElementById("canvasWrapper");
const textInput = document.getElementById("textInput");
const toolHint = document.getElementById("toolHint");
const zoomIndicator = document.getElementById("zoomIndicator");
const selectionInfo = document.getElementById("selectionInfo");
const deleteBtn = document.getElementById("deleteBtn");
const editTextBtn = document.getElementById("editTextBtn");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const propSheet = document.getElementById("propSheet");
const closePropSheet = document.getElementById("closePropSheet");

const propWidth = document.getElementById("propWidth");
const propFontSize = document.getElementById("propFontSize");
const propColor = document.getElementById("propColor");
const widthValue = document.getElementById("widthValue");
const fontValue = document.getElementById("fontValue");
const widthRow = document.getElementById("widthRow");
const fontRow = document.getElementById("fontRow");
const colorRow = document.getElementById("colorRow");

// ═══════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════
let objects = [];
let selectedId = null;
let currentTool = "select";
let history = [];
let redoStack = [];
let draggingObject = null;
let dragOffset = { x: 0, y: 0 };
let isPanning = false;
let panStart = { x: 0, y: 0, ox: 0, oy: 0 };

let view = { scale: 1, offsetX: 0, offsetY: 0 };

let planImageWidth = 1000;
let planImageHeight = 700;

let detectedStairs = [];

let mapSettings = {
	style: "modern",
	compass: { x: 0, y: 0, size: 40, direction: "north" },
	title: "",
};

function updateCompassPosition() {
	const margin = 80;
	mapSettings.compass.x = planImageWidth - margin;
	mapSettings.compass.y = planImageHeight - margin;
}

updateCompassPosition();

const DEFAULT_STYLE = {
	wall: { color: "#2c3e50", width: 6 },
	door: { color: "#8B4513", width: 4 },
	window: { color: "#3498DB", width: 3 },
	text: { color: "#2c3e50", fontSize: 24, bg: "#ffffff" },
	arrow: { color: "#e74c3c", width: 4 },
	rect: { color: "#3498db", width: 3, fill: "transparent" },
	circle: { color: "#9b59b6", width: 3, fill: "transparent" },
	room: { color: "#3498db", width: 3 },
};

function uid() {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ═══════════════════════════════════════════════
// ⭐ حالت ویرایش متن
// ═══════════════════════════════════════════════
let textEditing = {
	active: false,
	id: null,
	worldPos: null,
	value: "",
};

// ═══════════════════════════════════════════════
// History
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
	closeSheet();
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
	closeSheet();
	redraw();
	updateUndoRedo();
}

undoBtn.onclick = undo;
redoBtn.onclick = redo;

history.push(JSON.stringify(objects));
updateUndoRedo();

// ═══════════════════════════════════════════════
// ابزارها
// ═══════════════════════════════════════════════
const toolHints = {
	select: "👆 روی متن بزن | بکش تا جابجا کنی | دوبار بزن تا ویرایش",
	text: "🏷️ روی نقشه بزن تا متن بنویسی",
	eraser: "🗑️ روی شیء بزن تا پاک بشه",
};

document.querySelectorAll(".tool-btn").forEach((btn) => {
	btn.addEventListener("click", () => {
		const tool = btn.dataset.tool;
		if (textEditing.active) commitText();

		document.querySelectorAll(".tool-btn").forEach((b) => b.classList.remove("active"));
		btn.classList.add("active");
		currentTool = tool;
		toolHint.textContent = toolHints[tool] || "";
		selectedId = null;
		updateSelectionUI();
		closeSheet();
		redraw();
	});
});

function setTool(tool) {
	currentTool = tool;
	document.querySelectorAll(".tool-btn").forEach((b) => {
		b.classList.toggle("active", b.dataset.tool === tool);
	});
	toolHint.textContent = toolHints[tool] || "";
}

// ═══════════════════════════════════════════════
// Sheet
// ═══════════════════════════════════════════════
function openSheet() {
	propSheet.classList.add("open");
}
function closeSheet() {
	propSheet.classList.remove("open");
}
closePropSheet.onclick = closeSheet;

// ═══════════════════════════════════════════════
// مختصات
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
	return {
		x: wx * view.scale + view.offsetX,
		y: wy * view.scale + view.offsetY,
	};
}

function fitToScreen() {
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
			const b = getObjectBounds(o);
			if (b) {
				addPoint(b.x, b.y);
				addPoint(b.x + b.w, b.y + b.h);
			}
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

function zoomAt(screenX, screenY, factor) {
	const oldScale = view.scale;
	const newScale = Math.max(0.1, Math.min(20, oldScale * factor));
	view.offsetX = screenX - (screenX - view.offsetX) * (newScale / oldScale);
	view.offsetY = screenY - (screenY - view.offsetY) * (newScale / oldScale);
	view.scale = newScale;
	redraw();
}

// ═══════════════════════════════════════════════
// Resize
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
// رسم
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

	drawStairsAI(detectedStairs);
	objects.forEach((o) => drawObject(o));

	if (selectedId) {
		const sel = objects.find((o) => o.id === selectedId);
		if (sel) drawSelectionIndicator(sel);
	}

	ctx.restore();

	drawCompassOnCanvas();

	zoomIndicator.textContent = `${Math.round(view.scale * 100)}%`;
}

function drawCompassOnCanvas() {
	const c = mapSettings.compass;
	const size = c.size;
	const screenPos = worldToScreen(c.x, c.y);
	const cx = screenPos.x;
	const cy = screenPos.y;

	if (cx < -100 || cy < -100 || cx > wrapper.clientWidth + 100 || cy > wrapper.clientHeight + 100) {
		return;
	}

	ctx.save();
	ctx.strokeStyle = "#2c3e50";
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.arc(cx, cy, size, 0, Math.PI * 2);
	ctx.stroke();

	const dirs = { north: -Math.PI / 2, south: Math.PI / 2, east: 0, west: Math.PI };
	const baseAngle = dirs[c.direction] ?? -Math.PI / 2;
	const tipX = cx + Math.cos(baseAngle) * (size - 8);
	const tipY = cy + Math.sin(baseAngle) * (size - 8);

	ctx.fillStyle = "#E74C3C";
	ctx.beginPath();
	ctx.moveTo(tipX, tipY);
	ctx.lineTo(cx + Math.cos(baseAngle - 0.4) * (size - 14), cy + Math.sin(baseAngle - 0.4) * (size - 14));
	ctx.lineTo(cx + Math.cos(baseAngle + 0.4) * (size - 14), cy + Math.sin(baseAngle + 0.4) * (size - 14));
	ctx.closePath();
	ctx.fill();

	ctx.fillStyle = "#2c3e50";
	ctx.font = `bold ${Math.floor(size * 0.6)}px Tahoma`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText("N", cx, cy - size - 12);
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
		ctx.lineWidth = (o.width || DEFAULT_STYLE.room.width) / view.scale;
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
		if (textEditing.active && textEditing.id === o.id) {
			ctx.restore();
			return;
		}
		drawText(o);
	}

	ctx.restore();
}

function drawDoor(o) {
	const len = Math.hypot(o.x2 - o.x1, o.y2 - o.y1);
	if (len < 3) return;

	ctx.strokeStyle = "#fafbfc";
	ctx.lineWidth = 10 / view.scale;
	ctx.beginPath();
	ctx.moveTo(o.x1, o.y1);
	ctx.lineTo(o.x2, o.y2);
	ctx.stroke();

	ctx.strokeStyle = o.color || DEFAULT_STYLE.door.color;
	ctx.lineWidth = (o.width || DEFAULT_STYLE.door.width) / view.scale;

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
	ctx.lineWidth = 10 / view.scale;
	ctx.beginPath();
	ctx.moveTo(o.x1, o.y1);
	ctx.lineTo(o.x2, o.y2);
	ctx.stroke();

	const angle = Math.atan2(o.y2 - o.y1, o.x2 - o.x1);
	const perp = angle + Math.PI / 2;
	const offset = 4 / view.scale;

	ctx.strokeStyle = o.color || DEFAULT_STYLE.window.color;
	ctx.lineWidth = (o.width || DEFAULT_STYLE.window.width) / view.scale;
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
	const headLen = Math.min(24, len * 0.35) / view.scale;

	ctx.strokeStyle = o.color || DEFAULT_STYLE.arrow.color;
	ctx.fillStyle = o.color || DEFAULT_STYLE.arrow.color;
	ctx.lineWidth = (o.width || DEFAULT_STYLE.arrow.width) / view.scale;
	ctx.lineCap = "round";

	ctx.beginPath();
	ctx.moveTo(o.x1, o.y1);
	ctx.lineTo(o.x2, o.y2);
	ctx.stroke();

	const ax = o.x2 - Math.cos(angle) * headLen;
	const ay = o.y2 - Math.sin(angle) * headLen;
	const perp = angle + Math.PI / 2;
	const w = headLen * 0.55;

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
		ctx.lineWidth = 2 / view.scale;

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
		ctx.strokeRect(b.x - 6 / view.scale, b.y - 6 / view.scale, b.w + 12 / view.scale, b.h + 12 / view.scale);
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
		const fontSize = o.fontSize || DEFAULT_STYLE.text.fontSize;
		ctx.save();
		ctx.font = `bold ${fontSize}px Tahoma, sans-serif`;
		const tw = ctx.measureText(o.text || "").width;
		ctx.restore();
		return { x: o.x - tw, y: o.y, w: tw, h: fontSize * 1.2 };
	}
	return null;
}

// ═══════════════════════════════════════════════
// Hit test
// ═══════════════════════════════════════════════
function hitTest(pt) {
	for (let i = objects.length - 1; i >= 0; i--) {
		const o = objects[i];
		if (isPointInObject(pt, o)) return o;
	}
	return null;
}

function isPointInObject(pt, o) {
	const tol = 16 / view.scale;

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
// ⭐ شروع ویرایش متن — input واقعی روی صفحه
// ═══════════════════════════════════════════════
function startTextEdit(worldPos, existingText = null) {
	textEditing.active = true;
	textEditing.worldPos = { x: worldPos.x, y: worldPos.y };
	textEditing.value = existingText ? existingText.text : "";
	textEditing.id = existingText ? existingText.id : null;

	// ⭐ موقعیت input رو دقیقاً روی نقطه‌ی کلیک بذار
	const screenPos = worldToScreen(worldPos.x, worldPos.y);
	const rect = wrapper.getBoundingClientRect();

	// نمایش input به شکل واقعی
	textInput.style.display = "block";
	textInput.style.opacity = "1";
	textInput.style.pointerEvents = "auto";
	textInput.style.position = "absolute";
	textInput.style.width = "180px";
	textInput.style.height = "40px";
	textInput.style.fontSize = "16px";
	textInput.style.padding = "6px 10px";

	// موقعیت: کمی بالاتر از نقطه‌ی کلیک
	const left = Math.max(10, Math.min(screenPos.x - 180, wrapper.clientWidth - 190));
	const top = Math.max(10, screenPos.y - 20);

	textInput.style.left = left + "px";
	textInput.style.top = top + "px";

	textInput.value = textEditing.value;

	// ⭐ focus فوری (بدون تاخیر) — برای موبایل حیاتی
	textInput.focus();
	textInput.setSelectionRange(textInput.value.length, textInput.value.length);

	// یه بار دیگه با تاخیر هم focus کن (برای iOS)
	setTimeout(() => {
		textInput.focus();
	}, 100);

	redraw();
}

function commitText() {
	if (!textEditing.active) return;

	const val = textInput.value.trim();

	if (!val) {
		if (textEditing.id) {
			pushHistory();
			objects = objects.filter((o) => o.id !== textEditing.id);
		}
		resetTextEdit();
		return;
	}

	if (textEditing.id) {
		const o = objects.find((x) => x.id === textEditing.id);
		if (o && o.text !== val) {
			pushHistory();
			o.text = val;
		}
	} else {
		pushHistory();
		const id = uid();
		objects.push({
			id,
			type: "text",
			x: textEditing.worldPos.x,
			y: textEditing.worldPos.y,
			text: val,
			color: DEFAULT_STYLE.text.color,
			fontSize: DEFAULT_STYLE.text.fontSize,
			bg: DEFAULT_STYLE.text.bg,
		});
	}

	resetTextEdit();
	setTool("select");
}

function resetTextEdit() {
	textEditing.active = false;
	textEditing.id = null;
	textEditing.worldPos = null;
	textEditing.value = "";
	textInput.value = "";
	textInput.style.display = "none";
	textInput.blur();
	redraw();
}

function cancelText() {
	resetTextEdit();
}

// ═══════════════════════════════════════════════
// رویدادهای input
// ═══════════════════════════════════════════════
textInput.addEventListener("input", () => {
	if (!textEditing.active) return;
	textEditing.value = textInput.value;
	// نیازی به redraw نیست چون input واقعی دیده می‌شه
});

textInput.addEventListener("keydown", (e) => {
	// ⭐ Enter = ثبت
	if (e.key === "Enter" || e.key === "NumpadEnter") {
		e.preventDefault();
		e.stopPropagation();
		commitText();
	} else if (e.key === "Escape") {
		e.preventDefault();
		cancelText();
	}
});

// ⭐ blur با تاخیر بررسی می‌شه
let blurTimeout = null;
textInput.addEventListener("blur", () => {
	if (blurTimeout) clearTimeout(blurTimeout);
	blurTimeout = setTimeout(() => {
		if (textEditing.active && document.activeElement !== textInput) {
			commitText();
		}
	}, 250);
});

// ⭐ روی موبایل، دکمه‌ی Enter شاید نیاد، پس یه دکمه‌ی تایید هم بذاریم روی input
// این کار رو با یه لایه‌ی اضافه انجام نمی‌دیم، فقط از طریق blur

// ═══════════════════════════════════════════════
// Pointer events
// ═══════════════════════════════════════════════
let pointers = new Map();
let pinchStart = null;
let lastTapTime = 0;
let lastTapPos = null;

canvas.addEventListener("pointerdown", (e) => {
	// اگه روی input هستیم، کاری نکن
	if (e.target === textInput) return;

	canvas.setPointerCapture(e.pointerId);
	pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

	if (pointers.size === 2) {
		const pts = Array.from(pointers.values());
		const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
		const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
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

	if (e.button === 2 || e.shiftKey) {
		isPanning = true;
		panStart = { x: e.clientX, y: e.clientY, ox: view.offsetX, oy: view.offsetY };
		return;
	}

	// اگه در حال ویرایش متنیم و بیرون کلیک شد → commit
	if (textEditing.active) {
		commitText();
		return;
	}

	const pt = screenToWorld(e.clientX, e.clientY);

	if (currentTool === "select") {
		const hit = hitTest(pt);
		if (hit) {
			const now = Date.now();
			// double-tap روی متن
			if (hit.type === "text" && now - lastTapTime < 350 && lastTapPos && Math.hypot(pt.x - lastTapPos.x, pt.y - lastTapPos.y) < 30 / view.scale) {
				startTextEdit({ x: hit.x, y: hit.y }, hit);
				lastTapTime = 0;
				lastTapPos = null;
				return;
			}

			lastTapTime = now;
			lastTapPos = pt;

			selectedId = hit.id;
			updateSelectionUI();
			openSheet();
			draggingObject = hit;
			dragOffset = { x: pt.x, y: pt.y };
		} else {
			selectedId = null;
			updateSelectionUI();
			closeSheet();
		}
		redraw();
		return;
	}

	if (currentTool === "eraser") {
		const hit = hitTest(pt);
		if (hit) {
			pushHistory();
			objects = objects.filter((o) => o.id !== hit.id);
			selectedId = null;
			updateSelectionUI();
			closeSheet();
			redraw();
		}
		return;
	}

	if (currentTool === "text") {
		// ⭐ شروع ویرایش متن جدید
		startTextEdit(pt, null);
		return;
	}

	return;
});

canvas.addEventListener("pointermove", (e) => {
	if (e.target === textInput) return;

	if (pointers.has(e.pointerId)) {
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
	}

	if (pointers.size === 2 && pinchStart) {
		const pts = Array.from(pointers.values());
		const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
		const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
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

	if (isPanning) {
		const dx = e.clientX - panStart.x;
		const dy = e.clientY - panStart.y;
		view.offsetX = panStart.ox + dx;
		view.offsetY = panStart.oy + dy;
		redraw();
		return;
	}

	if (draggingObject) {
		const pt = screenToWorld(e.clientX, e.clientY);
		const dx = pt.x - dragOffset.x;
		const dy = pt.y - dragOffset.y;
		moveObject(draggingObject, dx, dy);
		dragOffset = { x: pt.x, y: pt.y };
		redraw();
		return;
	}
});

canvas.addEventListener("pointerup", (e) => {
	if (e.target === textInput) return;

	pointers.delete(e.pointerId);
	if (pointers.size < 2) pinchStart = null;

	if (isPanning) {
		isPanning = false;
		return;
	}

	if (draggingObject) {
		pushHistory();
		draggingObject = null;
		return;
	}
});

canvas.addEventListener("pointercancel", (e) => {
	pointers.delete(e.pointerId);
	isPanning = false;
	draggingObject = null;
	pinchStart = null;
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener(
	"touchstart",
	(e) => {
		if (e.touches.length > 1) e.preventDefault();
	},
	{ passive: false },
);

// ═══════════════════════════════════════════════
// Selection UI
// ═══════════════════════════════════════════════
function updateSelectionUI() {
	if (!selectedId) {
		selectionInfo.textContent = "هیچ‌چیز انتخاب نشده";
		return;
	}

	const o = objects.find((x) => x.id === selectedId);
	if (!o) return;

	selectionInfo.textContent = `انتخاب: ${objectTypeName(o.type)}`;

	if (o.width !== undefined) {
		widthRow.style.display = "flex";
		propWidth.value = o.width;
		widthValue.textContent = o.width;
	} else {
		widthRow.style.display = "none";
	}

	if (o.type === "text") {
		fontRow.style.display = "flex";
		editTextBtn.style.display = "flex";
		propFontSize.value = o.fontSize || 24;
		fontValue.textContent = o.fontSize || 24;
	} else {
		fontRow.style.display = "none";
		editTextBtn.style.display = "none";
	}

	colorRow.style.display = "flex";
	if (o.color) propColor.value = o.color;
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
	closeSheet();
	redraw();
};

editTextBtn.onclick = () => {
	if (!selectedId) return;
	const o = objects.find((x) => x.id === selectedId);
	if (!o || o.type !== "text") return;
	closeSheet();
	startTextEdit({ x: o.x, y: o.y }, o);
};

// ═══════════════════════════════════════════════
// Properties
// ═══════════════════════════════════════════════
propWidth.addEventListener("input", (e) => {
	if (!selectedId) return;
	const o = objects.find((x) => x.id === selectedId);
	if (o && o.width !== undefined) {
		o.width = parseInt(e.target.value);
		widthValue.textContent = o.width;
		redraw();
	}
});

propWidth.addEventListener("change", () => {
	if (selectedId) pushHistory();
});

propFontSize.addEventListener("input", (e) => {
	if (!selectedId) return;
	const o = objects.find((x) => x.id === selectedId);
	if (o && o.type === "text") {
		o.fontSize = parseInt(e.target.value);
		fontValue.textContent = o.fontSize;
		redraw();
	}
});

propFontSize.addEventListener("change", () => {
	if (selectedId) pushHistory();
});

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

// ═══════════════════════════════════════════════
// Zoom
// ═══════════════════════════════════════════════
document.getElementById("zoomIn").onclick = () => {
	zoomAt(wrapper.clientWidth / 2, wrapper.clientHeight / 2, 1.2);
};
document.getElementById("zoomOut").onclick = () => {
	zoomAt(wrapper.clientWidth / 2, wrapper.clientHeight / 2, 1 / 1.2);
};
document.getElementById("zoomFit").onclick = () => fitToScreen();

// ═══════════════════════════════════════════════
// Keyboard
// ═══════════════════════════════════════════════
document.addEventListener("keydown", (e) => {
	if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;

	if (e.key === "Delete" || e.key === "Backspace") {
		if (selectedId) {
			e.preventDefault();
			deleteBtn.click();
		}
	} else if ((e.ctrlKey || e.metaKey) && e.key === "z") {
		e.preventDefault();
		if (e.shiftKey) redo();
		else undo();
	}
});

// ═══════════════════════════════════════════════
// Upload & Detect
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
			uploadStatus.textContent = "✅ آماده";
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
	uploadStatus.textContent = "🤖 تشخیص...";

	try {
		const res = await fetch("/api/detect-lines", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ filename: uploadedFilename, twoPass: true }),
		});
		const data = await res.json();

		if (data.success) {
			planImageWidth = data.imageWidth || 1000;
			planImageHeight = data.imageHeight || 700;
			updateCompassPosition();

			detectedStairs = data.stairs || [];

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

			uploadStatus.textContent = `✅ ${data.lines.length} خط`;
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
// Render
// ═══════════════════════════════════════════════
const reRenderBtn = document.getElementById("reRender");
const styleSelect = document.getElementById("styleSelect");
const compassDirection = document.getElementById("compassDirection");

styleSelect.addEventListener("change", (e) => {
	mapSettings.style = e.target.value;
	redraw();
});

compassDirection.addEventListener("change", (e) => {
	mapSettings.compass.direction = e.target.value;
	redraw();
});

reRenderBtn.addEventListener("click", async () => {
	if (textEditing.active) commitText();
	if (objects.length === 0) return alert("اول یه چیزی بذار");

	reRenderBtn.disabled = true;
	reRenderBtn.textContent = "⏳...";

	try {
		updateCompassPosition();

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
				width: o.width,
			}));
		const windows = objects
			.filter((o) => o.type === "window")
			.map((o) => ({
				x1: o.x1,
				y1: o.y1,
				x2: o.x2,
				y2: o.y2,
				color: o.color,
				width: o.width,
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
				title: "",
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
		reRenderBtn.textContent = "🎨 رندر";
	}
});

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
// شروع
// ═══════════════════════════════════════════════
resizeCanvas();
toolHint.textContent = toolHints.select;
