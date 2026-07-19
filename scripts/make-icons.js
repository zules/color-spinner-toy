// Generate the app icon set by drawing the spinner wheel with CanvasKit —
// the same Skia the app renders with, so the icon matches the toy exactly.
// Outputs: icon.png (1024, dark bg), android-icon-foreground.png (1024,
// transparent, adaptive safe zone), android-icon-monochrome.png (1024, white
// silhouette), splash-icon.png (512, transparent).
// Run with: node scripts/make-icons.js
const fs = require("fs");
const path = require("path");

const projectRoot = path.join(__dirname, "..");
const outDir = path.join(projectRoot, "assets", "images");
const ckDir = path.join(projectRoot, "node_modules", "canvaskit-wasm", "bin");
const CanvasKitInit = require(path.join(ckDir, "canvaskit.js"));

const SLICE_STARTS = [270, 30, 150];
const SLICE_COLORS = ["#8B4513", "#00BFFF", "#00FF7F"]; // starter trio
const CHROME = ["#fdfdfd", "#9a9a9a", "#ffffff", "#3f3f3f", "#8f8f8f"];
const CHROME_STOPS = [0, 0.32, 0.45, 0.7, 1];

CanvasKitInit({ locateFile: (f) => path.join(ckDir, f) }).then((CK) => {
  const col = (s) => CK.parseColorString(s);

  // This canvaskit build exposes only immutable Paths — build via SVG data.
  function prongPath(cx, cy, R) {
    const outerR = R * 1.05;
    const shoulderR = R * 0.9;
    const tipR = R * 0.78;
    const halfW = R * 0.06;
    return CK.Path.MakeFromSVGString(
      `M ${cx - halfW} ${cy - outerR} L ${cx + halfW} ${cy - outerR} ` +
        `L ${cx + halfW} ${cy - shoulderR} L ${cx} ${cy - tipR} ` +
        `L ${cx - halfW} ${cy - shoulderR} Z`,
    );
  }

  // Full-color wheel: glow halo, 3 slices, rim, chrome prongs.
  function drawWheel(canvas, cx, cy, R) {
    const halo = new CK.Paint();
    halo.setAntiAlias(true);
    halo.setColor(col("rgba(255,255,255,0.16)"));
    halo.setMaskFilter(
      CK.MaskFilter.MakeBlur(CK.BlurStyle.Normal, R * 0.12, true),
    );
    canvas.drawCircle(cx, cy, R * 1.08, halo);

    const oval = CK.XYWHRect(cx - R, cy - R, R * 2, R * 2);
    SLICE_STARTS.forEach((start, i) => {
      const paint = new CK.Paint();
      paint.setAntiAlias(true);
      paint.setColor(col(SLICE_COLORS[i]));
      canvas.drawArc(oval, start, 120, true, paint); // useCenter → pie wedge
    });

    const rim = new CK.Paint();
    rim.setAntiAlias(true);
    rim.setStyle(CK.PaintStyle.Stroke);
    rim.setStrokeWidth(R * 0.02);
    rim.setColor(col("rgba(0,0,0,0.45)"));
    canvas.drawCircle(cx, cy, R, rim);

    for (let i = 0; i < 3; i++) {
      canvas.save();
      canvas.rotate(i * 120, cx, cy);
      const p = prongPath(cx, cy, R);
      const paint = new CK.Paint();
      paint.setAntiAlias(true);
      paint.setShader(
        CK.Shader.MakeLinearGradient(
          [cx, cy - R * 1.05],
          [cx, cy - R * 0.78],
          CHROME.map(col),
          CHROME_STOPS,
          CK.TileMode.Clamp,
        ),
      );
      canvas.drawPath(p, paint);
      const edge = new CK.Paint();
      edge.setAntiAlias(true);
      edge.setStyle(CK.PaintStyle.Stroke);
      edge.setStrokeWidth(R * 0.012);
      edge.setColor(col("#3a3a3a"));
      canvas.drawPath(p, edge);
      canvas.restore();
    }
  }

  // Monochrome silhouette: white disc with punched-out grooves and prongs.
  function drawMono(canvas, cx, cy, R) {
    const white = new CK.Paint();
    white.setAntiAlias(true);
    white.setColor(col("#ffffff"));
    canvas.drawCircle(cx, cy, R, white);

    const clearLine = new CK.Paint();
    clearLine.setAntiAlias(true);
    clearLine.setStyle(CK.PaintStyle.Stroke);
    clearLine.setStrokeWidth(R * 0.07);
    clearLine.setBlendMode(CK.BlendMode.Clear);
    SLICE_STARTS.forEach((start) => {
      const rad = (start * Math.PI) / 180;
      const p = CK.Path.MakeFromSVGString(
        `M ${cx} ${cy} L ${cx + R * Math.cos(rad)} ${cy + R * Math.sin(rad)}`,
      );
      canvas.drawPath(p, clearLine);
    });

    for (let i = 0; i < 3; i++) {
      canvas.save();
      canvas.rotate(i * 120, cx, cy);
      const p = prongPath(cx, cy, R);
      const punch = new CK.Paint();
      punch.setAntiAlias(true);
      punch.setStyle(CK.PaintStyle.Stroke);
      punch.setStrokeWidth(R * 0.06);
      punch.setBlendMode(CK.BlendMode.Clear);
      canvas.drawPath(p, punch); // gap so the prong reads against the disc
      canvas.drawPath(p, white);
      canvas.restore();
    }
  }

  function render(size, bg, drawFn, R, file) {
    const surface = CK.MakeSurface(size, size);
    const canvas = surface.getCanvas();
    canvas.clear(CK.TRANSPARENT);
    if (bg) {
      const paint = new CK.Paint();
      paint.setColor(col(bg));
      canvas.drawRect(CK.XYWHRect(0, 0, size, size), paint);
    }
    drawFn(canvas, size / 2, size / 2, R);
    surface.flush();
    const img = surface.makeImageSnapshot();
    const bytes = img.encodeToBytes();
    fs.writeFileSync(path.join(outDir, file), Buffer.from(bytes));
    console.log(`${file}: ${bytes.length} bytes`);
  }

  // Main icon: full-bleed square, no mask — fill it (artwork spans ~82%).
  // Adaptive foreground/monochrome: the 108dp canvas shows at most a 72dp
  // circle through the mask, so max extent 1.05R must stay <= 33.3% of the
  // canvas from centre (341px at 1024). R=324 fills a circular mask exactly;
  // prongs sit at 12/4/8 o'clock, the directions a squircle mask clips least.
  // Splash: transparent, sized on screen by app.json imageWidth.
  render(1024, "#f7bf26", drawWheel, 400, "icon.png");
  render(1024, null, drawWheel, 324, "android-icon-foreground.png");
  // Mono runs a hair smaller: its prong punch-out stroke is centred on the
  // path, so the silhouette bulges half a stroke (R*0.03) past 1.05R.
  render(1024, null, drawMono, 315, "android-icon-monochrome.png");
  render(512, null, drawWheel, 170, "splash-icon.png");
});
