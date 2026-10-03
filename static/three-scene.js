import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";

console.log("✅ Three.js loaded, revision:", THREE.REVISION);

const canvas = document.getElementById("canvas3d");
const container = document.getElementById("container");
const loadingEl = document.getElementById("loading");

// ═══════════════════════════════════════════════
// ثابت‌ها
// ═══════════════════════════════════════════════
const SCALE = 0.1;
const WALL_HEIGHT = 30;
const WALL_THICKNESS = 3;
const WALL_COLOR = 0x2c3e50;
const STAIR_COLOR = 0xe67e22;

let FLOOR_HEIGHT_CM = 300;
const CM_TO_WORLD = 0.1;
let FLOOR_HEIGHT = FLOOR_HEIGHT_CM * CM_TO_WORLD;

const FLOOR_COLORS = [0xe8f4f8, 0xfef5e7, 0xeafaf1, 0xf4ecf7, 0xfdedec, 0xfef9e7, 0xebf5fb, 0xe8f8f5];

// ═══════════════════════════════════════════════
// صحنه
// ═══════════════════════════════════════════════
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);
scene.fog = new THREE.Fog(0x1a1a2e, 300, 1500);

const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 5000);
camera.position.set(100, 120, 100);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 10;
controls.maxDistance = 2000;

// ═══════════════════════════════════════════════
// نورها
// ═══════════════════════════════════════════════
scene.add(new THREE.AmbientLight(0xffffff, 1.2));

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(100, 200, 100);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.left = -500;
dirLight.shadow.camera.right = 500;
dirLight.shadow.camera.top = 500;
dirLight.shadow.camera.bottom = -500;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 1000;
scene.add(dirLight);

const fillLight = new THREE.DirectionalLight(0xa0c0ff, 0.6);
fillLight.position.set(-100, 100, -100);
scene.add(fillLight);

// ═══════════════════════════════════════════════
// گروه‌ها
// ═══════════════════════════════════════════════
const wallsGroup = new THREE.Group();
const floorsGroup = new THREE.Group();
const roofGroup = new THREE.Group();
const stairsGroup = new THREE.Group();
scene.add(wallsGroup, floorsGroup, roofGroup, stairsGroup);

let planData = null;

// ═══════════════════════════════════════════════
// بارگذاری داده
// ═══════════════════════════════════════════════
function loadPlanData() {
	const stored = localStorage.getItem("melka-plan");

	if (!stored) {
		showMessage("⚠️ هنوز پلانی تشخیص داده نشده.<br>به صفحه‌ی قبل برگرد و اول پلان رو آپلود کن.");
		return;
	}

	try {
		planData = JSON.parse(stored);
		console.log("📦 داده بارگذاری شد:", planData);

		if (!planData.lines || planData.lines.length === 0) {
			showMessage("⚠️ خطی تشخیص داده نشده. دوباره پلان رو آپلود کن.");
			return;
		}

		buildScene();
		loadingEl.style.display = "none";
	} catch (err) {
		console.error("خطا در بارگذاری:", err);
		showMessage("❌ خطا در بارگذاری داده:<br>" + err.message);
	}
}

function showMessage(msg) {
	loadingEl.innerHTML = msg;
	loadingEl.style.background = "rgba(231, 76, 60, 0.9)";
}

// ═══════════════════════════════════════════════
// ✅ فیلتر هوشمند خطوط پله
// ═══════════════════════════════════════════════
function filterStairLines(lines, stairs, tol = 6) {
	if (!stairs || stairs.length === 0) return lines;

	return lines.filter((line) => {
		const lineLen = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);

		for (const stair of stairs) {
			const sx1 = stair.x - tol;
			const sy1 = stair.y - tol;
			const sx2 = stair.x + stair.width + tol;
			const sy2 = stair.y + stair.height + tol;

			const p1In = line.x1 >= sx1 && line.x1 <= sx2 && line.y1 >= sy1 && line.y1 <= sy2;
			const p2In = line.x2 >= sx1 && line.x2 <= sx2 && line.y2 >= sy1 && line.y2 <= sy2;

			if (!(p1In && p2In)) continue;

			const stairW = stair.width;
			const stairH = stair.height;

			// خطی که طولش ≈ عرض یا ارتفاع پله است → خط داخلی پله
			if (Math.abs(lineLen - stairW) < tol * 4 || Math.abs(lineLen - stairH) < tol * 4) {
				return false;
			}

			// خط کوتاه‌تر از ابعاد پله → خط پله
			if (lineLen < Math.min(stairW, stairH) * 0.95) {
				return false;
			}
		}
		return true;
	});
}

// ═══════════════════════════════════════════════
// پیدا کردن اتاق‌ها
// ═══════════════════════════════════════════════
function findRooms(lines) {
	const h = lines.filter((l) => Math.abs(l.y1 - l.y2) < 3);
	const v = lines.filter((l) => Math.abs(l.x1 - l.x2) < 3);

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
			if (c2.x <= c1.x + 20) continue;

			for (let k = i + 1; k < corners.length; k++) {
				if (used.has(k) || k === j) continue;
				const c3 = corners[k];
				if (Math.abs(c1.x - c3.x) > 5) continue;
				if (c3.y <= c1.y + 20) continue;

				for (let l = k + 1; l < corners.length; l++) {
					if (used.has(l) || l === j) continue;
					const c4 = corners[l];
					if (Math.abs(c2.x - c4.x) > 5) continue;
					if (Math.abs(c3.y - c4.y) > 5) continue;

					const w = c2.x - c1.x;
					const hh = c3.y - c1.y;
					if (w < 30 || hh < 30) continue;

					detected.push({ x: c1.x, y: c1.y, w, h: hh });
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
// ساخت پله‌های سه‌بعدی
// ═══════════════════════════════════════════════
function buildStairs(stairs, centerX, centerY, scale) {
	if (!stairs || stairs.length === 0) {
		console.log("🪜 پله‌ای برای ساخت وجود ندارد");
		return;
	}

	console.log(`🪜 در حال ساخت ${stairs.length} پله...`);

	stairs.forEach((stair, stairIdx) => {
		const stepCount = Math.max(3, stair.step_count || 5);
		const isHorizontal = stair.orientation === "h";

		const stepRise = FLOOR_HEIGHT / stepCount;

		const stepRunWorld = isHorizontal ? (stair.height / stepCount) * scale : (stair.width / stepCount) * scale;

		const stairWidthWorld = isHorizontal ? stair.width * scale * 0.92 : stair.height * scale * 0.92;

		for (let i = 0; i < stepCount; i++) {
			const stepHeight = stepRise * (i + 1);

			const geo = new THREE.BoxGeometry(isHorizontal ? stairWidthWorld : stepRunWorld * 0.85, stepHeight, isHorizontal ? stepRunWorld * 0.85 : stairWidthWorld);

			const mat = new THREE.MeshStandardMaterial({
				color: STAIR_COLOR,
				roughness: 0.6,
				metalness: 0.15,
			});

			const step = new THREE.Mesh(geo, mat);

			if (isHorizontal) {
				const px = (stair.x + stair.width / 2 - centerX) * scale;
				const py = (stair.y + i * (stair.height / stepCount) + stair.height / stepCount / 2 - centerY) * scale;
				step.position.set(px, stepHeight / 2, py);
			} else {
				const px = (stair.x + i * (stair.width / stepCount) + stair.width / stepCount / 2 - centerX) * scale;
				const py = (stair.y + stair.height / 2 - centerY) * scale;
				step.position.set(px, stepHeight / 2, py);
			}

			step.castShadow = true;
			step.receiveShadow = true;
			stairsGroup.add(step);
		}

		// کادر شفاف
		const boxGeo = new THREE.BoxGeometry(stair.width * scale * 1.05, FLOOR_HEIGHT + 1, stair.height * scale * 1.05);
		const boxMat = new THREE.MeshBasicMaterial({
			color: STAIR_COLOR,
			transparent: true,
			opacity: 0.08,
			depthWrite: false,
		});
		const box = new THREE.Mesh(boxGeo, boxMat);
		box.position.set((stair.x + stair.width / 2 - centerX) * scale, (FLOOR_HEIGHT + 1) / 2, (stair.y + stair.height / 2 - centerY) * scale);
		stairsGroup.add(box);

		console.log(`  ✅ پله ${stairIdx + 1}: ${stepCount} پله`);
	});
}

// ═══════════════════════════════════════════════
// ساخت صحنه
// ═══════════════════════════════════════════════
function buildScene() {
	if (!planData || !planData.lines) return;

	while (wallsGroup.children.length) wallsGroup.remove(wallsGroup.children[0]);
	while (floorsGroup.children.length) floorsGroup.remove(floorsGroup.children[0]);
	while (roofGroup.children.length) roofGroup.remove(roofGroup.children[0]);
	while (stairsGroup.children.length) stairsGroup.remove(stairsGroup.children[0]);

	const lines = planData.lines;
	const stairsData = planData.stairs || [];

	// ✅ فیلتر هوشمند خطوط پله از دیوارها
	const wallLines = filterStairLines(lines, stairsData, 6);

	console.log(`🧱 ${lines.length} خط ورودی → ${wallLines.length} خط دیوار`);

	const scale = SCALE;

	let minX = Infinity,
		maxX = -Infinity;
	let minY = Infinity,
		maxY = -Infinity;

	wallLines.forEach((l) => {
		minX = Math.min(minX, l.x1, l.x2);
		maxX = Math.max(maxX, l.x1, l.x2);
		minY = Math.min(minY, l.y1, l.y2);
		maxY = Math.max(maxY, l.y1, l.y2);
	});

	if (!isFinite(minX)) {
		console.warn("خط دیواری وجود ندارد");
		return;
	}

	const centerX = (minX + maxX) / 2;
	const centerY = (minY + maxY) / 2;

	const rooms = findRooms(wallLines);
	console.log(`🏠 ${rooms.length} اتاق شناسایی شد`);

	// کف اتاق‌ها
	rooms.forEach((room, i) => {
		const color = FLOOR_COLORS[i % FLOOR_COLORS.length];
		const floorGeo = new THREE.BoxGeometry(room.w * scale, 2, room.h * scale);
		const floorMat = new THREE.MeshStandardMaterial({
			color: color,
			roughness: 0.7,
			metalness: 0.05,
		});
		const floor = new THREE.Mesh(floorGeo, floorMat);
		const cx = (room.x + room.w / 2 - centerX) * scale;
		const cy = (room.y + room.h / 2 - centerY) * scale;
		floor.position.set(cx, 1, cy);
		floor.receiveShadow = true;
		floor.castShadow = true;
		floorsGroup.add(floor);
	});

	// دیوارها
	wallLines.forEach((line) => {
		const x1 = (line.x1 - centerX) * scale;
		const y1 = (line.y1 - centerY) * scale;
		const x2 = (line.x2 - centerX) * scale;
		const y2 = (line.y2 - centerY) * scale;

		const dx = x2 - x1;
		const dz = y2 - y1;
		const length = Math.sqrt(dx * dx + dz * dz);

		if (length < 0.5) return;

		const wallGeo = new THREE.BoxGeometry(length, WALL_HEIGHT, WALL_THICKNESS);
		const wallMat = new THREE.MeshStandardMaterial({
			color: WALL_COLOR,
			roughness: 0.5,
			metalness: 0.1,
		});
		const wall = new THREE.Mesh(wallGeo, wallMat);

		wall.position.set((x1 + x2) / 2, WALL_HEIGHT / 2, (y1 + y2) / 2);

		const angle = Math.atan2(dz, dx);
		wall.rotation.y = -angle;

		wall.castShadow = true;
		wall.receiveShadow = true;
		wallsGroup.add(wall);
	});

	// پله‌ها
	buildStairs(stairsData, centerX, centerY, scale);

	// سقف‌ها
	rooms.forEach((room) => {
		const roofGeo = new THREE.BoxGeometry(room.w * scale, 2, room.h * scale);
		const roofMat = new THREE.MeshStandardMaterial({
			color: 0xffffff,
			roughness: 0.9,
			transparent: true,
			opacity: 0.7,
		});
		const roof = new THREE.Mesh(roofGeo, roofMat);
		const cx = (room.x + room.w / 2 - centerX) * scale;
		const cy = (room.y + room.h / 2 - centerY) * scale;
		roof.position.set(cx, WALL_HEIGHT + 1, cy);
		roof.castShadow = true;
		roofGroup.add(roof);
	});

	roofGroup.visible = false;

	// دوربین
	const mapSize = Math.max(maxX - minX, maxY - minY) * scale;
	const dist = Math.max(mapSize * 1.2, 50);

	camera.position.set(dist, dist, dist);
	camera.lookAt(0, 0, 0);
	controls.target.set(0, 0, 0);
	controls.minDistance = 5;
	controls.maxDistance = mapSize * 10;
	controls.update();

	// آمار
	const statLinesEl = document.getElementById("statLines");
	const statRoomsEl = document.getElementById("statRooms");
	const statStairsEl = document.getElementById("statStairs");
	if (statLinesEl) statLinesEl.textContent = wallLines.length;
	if (statRoomsEl) statRoomsEl.textContent = rooms.length;
	if (statStairsEl) statStairsEl.textContent = stairsData.length;

	console.log(`✅ نقشه: ${mapSize.toFixed(1)} واحد | ${wallLines.length} دیوار | ${rooms.length} اتاق | ${stairsData.length} پله`);
}

// ═══════════════════════════════════════════════
// UI
// ═══════════════════════════════════════════════
document.getElementById("toggleWalls").onclick = (e) => {
	wallsGroup.visible = !wallsGroup.visible;
	e.target.classList.toggle("active", wallsGroup.visible);
};

document.getElementById("toggleFloors").onclick = (e) => {
	floorsGroup.visible = !floorsGroup.visible;
	e.target.classList.toggle("active", floorsGroup.visible);
};

document.getElementById("toggleStairs").onclick = (e) => {
	stairsGroup.visible = !stairsGroup.visible;
	e.target.classList.toggle("active", stairsGroup.visible);
};

document.getElementById("toggleRoof").onclick = (e) => {
	roofGroup.visible = !roofGroup.visible;
	e.target.classList.toggle("active", roofGroup.visible);
};

document.getElementById("resetView").onclick = () => {
	const mapSize = 100;
	camera.position.set(mapSize, mapSize, mapSize);
	camera.lookAt(0, 0, 0);
	controls.target.set(0, 0, 0);
	controls.update();
};

const floorHeightInput = document.getElementById("floorHeight");
if (floorHeightInput) {
	floorHeightInput.addEventListener("change", (e) => {
		const v = parseInt(e.target.value);
		if (v >= 200 && v <= 400) {
			FLOOR_HEIGHT_CM = v;
			FLOOR_HEIGHT = FLOOR_HEIGHT_CM * CM_TO_WORLD;
			console.log(`🏢 ارتفاع طبقه: ${FLOOR_HEIGHT_CM}cm → ${FLOOR_HEIGHT} واحد`);
			buildScene();
		}
	});
}

window.addEventListener("resize", () => {
	const w = container.clientWidth;
	const h = container.clientHeight;
	camera.aspect = w / h;
	camera.updateProjectionMatrix();
	renderer.setSize(w, h);
});

function animate() {
	requestAnimationFrame(animate);
	controls.update();
	renderer.render(scene, camera);
}
animate();

loadPlanData();
