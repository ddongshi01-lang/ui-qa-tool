// Visual QA Inspector
(function () {
  if (window.__visualQAInspectorFinal__) {
    window.__visualQAInspectorFinal__.destroy();
    return;
  }

  var CONFIG = {
    offsetX: 15,
    offsetY: 15,
    zIndexHighlight: 999998,
    zIndexTooltip: 999999,
    zIndexMeasure: 1000001,
    zIndexSpacing: 1000002,
    zIndexSelection: 1000000,
    colors: {
      highlight: "#2F7BFF",
      frozen: "#FF8A00",
      selectA: "#FFB020",
      selectB: "#14D19B",
      padding: "#55A8FF",
      margin: "#FFB45C",
      parentGap: "#3ED598",
      measureX: "#FFB020",
      measureY: "#14D19B",
      panelBg: "rgba(17,18,22,.97)",
      panelBorder: "rgba(255,255,255,.08)",
      text: "#F5F7FA",
      muted: "#8FA1B3"
    },
    hotkeys: {
      measure: "m",
      freeze: "f",
      clear: "c",
      pin: "p",
      exit: "escape"
    }
  };

  var state = {
    hoverEl: null,
    frozenEl: null,
    isFrozen: false,
    measureMode: false,
    measureA: null,
    measureB: null,
    mouseX: 0,
    mouseY: 0,
    panelPinned: false,
    panelX: null,
    panelY: null,
    dragging: false,
    dragOffsetX: 0,
    dragOffsetY: 0,
    spacingSide: "top",
    rafId: null
  };

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function px(v) {
    if (v == null || v === "") return "";
    if (v === "normal") return "normal";
    var n = parseFloat(v);
    return isNaN(n) ? String(v) : Math.round(n * 100) / 100 + "px";
  }

  function num(v) {
    var n = parseFloat(v);
    return isNaN(n) ? 0 : Math.round(n);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (m) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[m];
    });
  }

  function toHexColor(c) {
    if (!c || c === "transparent" || c === "rgba(0, 0, 0, 0)") return "";
    if (c[0] === "#") return c.toUpperCase();
    var m = c.match(/rgba?\(([^)]+)\)/i);
    if (!m) return c;
    var p = m[1].split(",").map(function (x) {
      return x.trim();
    });
    var r = parseFloat(p[0]) || 0;
    var g = parseFloat(p[1]) || 0;
    var b = parseFloat(p[2]) || 0;
    function hex(n) {
      var h = Math.round(n).toString(16).toUpperCase();
      return h.length === 1 ? "0" + h : h;
    }
    return "#" + hex(r) + hex(g) + hex(b);
  }

  function make(tag, css) {
    var el = document.createElement(tag);
    el.style.cssText = css;
    document.body.appendChild(el);
    return el;
  }

  function row(k, v) {
    if (v == null || v === "") return "";
    return (
      '<div style="display:grid;grid-template-columns:84px 1fr;gap:8px;">' +
      '<div style="color:' +
      CONFIG.colors.muted +
      ';">' +
      esc(k) +
      "</div>" +
      '<div style="color:' +
      CONFIG.colors.text +
      ';word-break:break-word;">' +
      esc(v) +
      "</div>" +
      "</div>"
    );
  }

  function section(title, rows, color) {
    rows = rows.filter(Boolean);
    if (!rows.length) return "";
    return (
      '<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.08);">' +
      '<div style="margin-bottom:6px;font-size:11px;font-weight:700;color:' +
      (color || "#67A3FF") +
      ';">' +
      esc(title) +
      "</div>" +
      rows.join("") +
      "</div>"
    );
  }

  function label(el) {
    if (!el || !el.tagName) return "unknown";
    var s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    if (el.classList && el.classList.length) {
      s +=
        "." +
        Array.prototype.slice.call(el.classList).slice(0, 2).join(".");
    }
    return s;
  }

  function isTextLike(el) {
    if (!el || !el.tagName) return false;
    var tag = el.tagName.toLowerCase();
    if (/^(input|textarea|button|a|label|span|p|h1|h2|h3|h4|h5|h6|small|strong|em|b|i)$/.test(tag)) return true;
    var text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    return !!text;
  }

  function cleanFontFamily(v) {
    return String(v || "").replace(/\s*,\s*/g, ", ");
  }

  function boxValues(style, prefix) {
    return {
      t: num(style[prefix + "Top"]),
      r: num(style[prefix + "Right"]),
      b: num(style[prefix + "Bottom"]),
      l: num(style[prefix + "Left"])
    };
  }

  function boxText(box) {
    if (!box) return "";
    return "上 " + box.t + " / 右 " + box.r + " / 下 " + box.b + " / 左 " + box.l + " px";
  }

  function getParentGap(el) {
    var p = el && el.parentElement;
    if (!p) return null;
    var pr = p.getBoundingClientRect();
    var r = el.getBoundingClientRect();
    return {
      t: Math.max(0, Math.round(r.top - pr.top)),
      r: Math.max(0, Math.round(pr.right - r.right)),
      b: Math.max(0, Math.round(pr.bottom - r.bottom)),
      l: Math.max(0, Math.round(r.left - pr.left))
    };
  }

  function nearestSide(el, x, y) {
    var r = el.getBoundingClientRect();
    var d = {
      top: Math.abs(y - r.top),
      right: Math.abs(x - r.right),
      bottom: Math.abs(y - r.bottom),
      left: Math.abs(x - r.left)
    };
    var side = "top";
    var min = d.top;
    ["right", "bottom", "left"].forEach(function (k) {
      if (d[k] < min) {
        min = d[k];
        side = k;
      }
    });
    return side;
  }

  function getActiveEl() {
    return state.isFrozen ? state.frozenEl : state.hoverEl;
  }

  function getMeasureData(aEl, bEl) {
    if (!aEl || !bEl) return null;
    var a = aEl.getBoundingClientRect();
    var b = bEl.getBoundingClientRect();
    var horizontal = null;
    var vertical = null;
    var ax = 0, ay = 0, bx = 0, by = 0;

    if (a.right <= b.left) {
      horizontal = Math.round(b.left - a.right);
      ax = a.right;
      bx = b.left;
    } else if (b.right <= a.left) {
      horizontal = Math.round(a.left - b.right);
      ax = a.left;
      bx = b.right;
    }

    if (a.bottom <= b.top) {
      vertical = Math.round(b.top - a.bottom);
      ay = a.bottom;
      by = b.top;
    } else if (b.bottom <= a.top) {
      vertical = Math.round(a.top - b.bottom);
      ay = a.top;
      by = b.bottom;
    }

    var overlapTop = Math.max(a.top, b.top);
    var overlapBottom = Math.min(a.bottom, b.bottom);
    var overlapLeft = Math.max(a.left, b.left);
    var overlapRight = Math.min(a.right, b.right);

    if (horizontal !== null) {
      ay = by = Math.round(
        overlapTop < overlapBottom
          ? (overlapTop + overlapBottom) / 2
          : (a.top + a.bottom + b.top + b.bottom) / 4
      );
    }

    if (vertical !== null) {
      ax = bx = Math.round(
        overlapLeft < overlapRight
          ? (overlapLeft + overlapRight) / 2
          : (a.left + a.right + b.left + b.right) / 4
      );
    }

    return {
      horizontal: horizontal,
      vertical: vertical,
      ax: ax,
      ay: ay,
      bx: bx,
      by: by
    };
  }

  var highlight = make(
    "div",
    "position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:" +
      CONFIG.zIndexHighlight +
      ";border:2px solid " +
      CONFIG.colors.highlight +
      ";background:rgba(47,123,255,.14);box-shadow:0 0 0 1px rgba(255,255,255,.72) inset;transition:transform .04s ease,width .04s ease,height .04s ease;"
  );

  var selectA = make(
    "div",
    "position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:" +
      CONFIG.zIndexSelection +
      ";border:2px solid " +
      CONFIG.colors.selectA +
      ";background:rgba(255,176,32,.08);box-shadow:0 0 0 1px rgba(255,255,255,.35) inset;display:none;"
  );

  var selectB = make(
    "div",
    "position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:" +
      CONFIG.zIndexSelection +
      ";border:2px solid " +
      CONFIG.colors.selectB +
      ";background:rgba(20,209,155,.08);box-shadow:0 0 0 1px rgba(255,255,255,.35) inset;display:none;"
  );

  var tooltip = make(
    "div",
    "position:fixed;left:0;top:0;max-width:340px;min-width:290px;z-index:" +
      CONFIG.zIndexTooltip +
      ";padding:0;background:" +
      CONFIG.colors.panelBg +
      ";backdrop-filter:blur(10px);color:" +
      CONFIG.colors.text +
      ";font:12px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;border:1px solid " +
      CONFIG.colors.panelBorder +
      ";border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.32);overflow:hidden;"
  );

  var spacingLayer = make(
    "div",
    "position:fixed;inset:0;pointer-events:none;z-index:" +
      CONFIG.zIndexSpacing +
      ";"
  );

  var measureLayer = make(
    "div",
    "position:fixed;inset:0;pointer-events:none;z-index:" +
      CONFIG.zIndexMeasure +
      ";"
  );

  tooltip.innerHTML =
    '<div id="vqa-head" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,0));cursor:move;user-select:none;">' +
    '<div style="font-weight:700;color:#FFF;">视觉走查</div>' +
    '<div style="display:flex;gap:6px;">' +
    '<button id="vqa-measure" style="border:0;background:#1F6BFF;color:#FFF;border-radius:999px;padding:4px 10px;font:inherit;cursor:pointer;">测距：关</button>' +
    '<button id="vqa-pin" style="border:0;background:rgba(255,255,255,.08);color:#FFF;border-radius:999px;padding:4px 10px;font:inherit;cursor:pointer;">固定</button>' +
    '<button id="vqa-close" style="border:0;background:rgba(255,255,255,.08);color:#FFF;border-radius:999px;padding:4px 10px;font:inherit;cursor:pointer;">关闭</button>' +
    "</div>" +
    "</div>" +
    '<div id="vqa-body" style="padding:12px 14px;"></div>';

  var body = tooltip.querySelector("#vqa-body");
  var head = tooltip.querySelector("#vqa-head");
  var btnMeasure = tooltip.querySelector("#vqa-measure");
  var btnPin = tooltip.querySelector("#vqa-pin");
  var btnClose = tooltip.querySelector("#vqa-close");

  function clearLayer(layer) {
    layer.innerHTML = "";
  }

  function getPanelRect() {
    return tooltip.getBoundingClientRect();
  }

  function safeTagPos(x, y, w, h) {
    var panel = getPanelRect();
    var tx = x;
    var ty = y;
    if (tx < panel.right && tx + w > panel.left && ty < panel.bottom && ty + h > panel.top) {
      ty = panel.bottom + 8;
      if (ty + h > window.innerHeight - 8) ty = panel.top - h - 8;
    }
    tx = clamp(tx, 8, window.innerWidth - w - 8);
    ty = clamp(ty, 8, window.innerHeight - h - 8);
    return { x: tx, y: ty };
  }

  function addTick(layer, x, y, horizontal, color) {
    var t = document.createElement("div");
    t.style.position = "fixed";
    t.style.pointerEvents = "none";
    t.style.background = color;
    if (horizontal) {
      t.style.left = x - 1 + "px";
      t.style.top = y - 5 + "px";
      t.style.width = "2px";
      t.style.height = "10px";
    } else {
      t.style.left = x - 5 + "px";
      t.style.top = y - 1 + "px";
      t.style.width = "10px";
      t.style.height = "2px";
    }
    layer.appendChild(t);
  }

  function addTag(layer, x, y, text, color, horizontal) {
    var tag = document.createElement("div");
    tag.textContent = text;
    tag.style.position = "fixed";
    tag.style.pointerEvents = "none";
    tag.style.padding = "3px 7px";
    tag.style.borderRadius = "999px";
    tag.style.background = color;
    tag.style.color = "#111216";
    tag.style.font = "11px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
    tag.style.fontWeight = "700";
    tag.style.boxShadow = "0 2px 10px rgba(0,0,0,.18)";
    tag.style.whiteSpace = "nowrap";
    layer.appendChild(tag);
    var tx = horizontal ? x - 18 : x + 10;
    var ty = horizontal ? y - 22 : y - 9;
    var pos = safeTagPos(tx, ty, 56, 24);
    tag.style.left = pos.x + "px";
    tag.style.top = pos.y + "px";
  }

  function addMarkedLine(layer, x1, y1, x2, y2, color, text) {
    var horizontal = Math.abs(y1 - y2) <= 1;
    var line = document.createElement("div");
    line.style.position = "fixed";
    line.style.pointerEvents = "none";
    line.style.background = color;

    if (horizontal) {
      line.style.left = Math.min(x1, x2) + "px";
      line.style.top = y1 + "px";
      line.style.width = Math.abs(x2 - x1) + "px";
      line.style.height = "2px";
    } else {
      line.style.left = x1 + "px";
      line.style.top = Math.min(y1, y2) + "px";
      line.style.width = "2px";
      line.style.height = Math.abs(y2 - y1) + "px";
    }

    layer.appendChild(line);
    addTick(layer, x1, y1, horizontal, color);
    addTick(layer, x2, y2, horizontal, color);

    if (text) {
      var mx = horizontal ? Math.min(x1, x2) + Math.abs(x2 - x1) / 2 : x1;
      var my = horizontal ? y1 : Math.min(y1, y2) + Math.abs(y2 - y1) / 2;
      addTag(layer, mx, my, text, color, horizontal);
    }
  }

  function updateBox(box, el) {
    if (!el) {
      box.style.display = "none";
      box.style.width = "0";
      box.style.height = "0";
      return;
    }
    var r = el.getBoundingClientRect();
    box.style.display = "block";
    box.style.transform = "translate(" + r.left + "px," + r.top + "px)";
    box.style.width = r.width + "px";
    box.style.height = r.height + "px";
  }

  function addSpacingGuides(el) {
    clearLayer(spacingLayer);
    if (!state.isFrozen || !el || state.measureMode) return;

    var style = getComputedStyle(el);
    var rect = el.getBoundingClientRect();
    var parent = el.parentElement ? el.parentElement.getBoundingClientRect() : null;
    var padding = boxValues(style, "padding");
    var margin = boxValues(style, "margin");
    var parentGap = getParentGap(el);
    var side = state.spacingSide;
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;

    if (side === "top") {
      if (padding.t > 0) addMarkedLine(spacingLayer, cx, rect.top, cx, rect.top + padding.t, CONFIG.colors.padding, padding.t + "px");
      if (margin.t > 0) addMarkedLine(spacingLayer, rect.left - 12, rect.top, rect.left - 12, rect.top - margin.t, CONFIG.colors.margin, margin.t + "px");
      if (parent && parentGap && parentGap.t > 0) addMarkedLine(spacingLayer, rect.right + 12, parent.top, rect.right + 12, rect.top, CONFIG.colors.parentGap, parentGap.t + "px");
    } else if (side === "right") {
      if (padding.r > 0) addMarkedLine(spacingLayer, rect.right, cy, rect.right - padding.r, cy, CONFIG.colors.padding, padding.r + "px");
      if (margin.r > 0) addMarkedLine(spacingLayer, rect.right, rect.top - 12, rect.right + margin.r, rect.top - 12, CONFIG.colors.margin, margin.r + "px");
      if (parent && parentGap && parentGap.r > 0) addMarkedLine(spacingLayer, rect.right, rect.bottom + 12, parent.right, rect.bottom + 12, CONFIG.colors.parentGap, parentGap.r + "px");
    } else if (side === "bottom") {
      if (padding.b > 0) addMarkedLine(spacingLayer, cx, rect.bottom, cx, rect.bottom - padding.b, CONFIG.colors.padding, padding.b + "px");
      if (margin.b > 0) addMarkedLine(spacingLayer, rect.right + 12, rect.bottom, rect.right + 12, rect.bottom + margin.b, CONFIG.colors.margin, margin.b + "px");
      if (parent && parentGap && parentGap.b > 0) addMarkedLine(spacingLayer, rect.left - 12, rect.bottom, rect.left - 12, parent.bottom, CONFIG.colors.parentGap, parentGap.b + "px");
    } else if (side === "left") {
      if (padding.l > 0) addMarkedLine(spacingLayer, rect.left, cy, rect.left + padding.l, cy, CONFIG.colors.padding, padding.l + "px");
      if (margin.l > 0) addMarkedLine(spacingLayer, rect.left, rect.bottom + 12, rect.left - margin.l, rect.bottom + 12, CONFIG.colors.margin, margin.l + "px");
      if (parent && parentGap && parentGap.l > 0) addMarkedLine(spacingLayer, parent.left, rect.top - 12, rect.left, rect.top - 12, CONFIG.colors.parentGap, parentGap.l + "px");
    }
  }

  function addMeasureGuides() {
    clearLayer(measureLayer);
    if (!(state.measureA && state.measureB)) return;
    var m = getMeasureData(state.measureA, state.measureB);
    if (!m) return;
    if (m.horizontal !== null) addMarkedLine(measureLayer, m.ax, m.ay, m.bx, m.by, CONFIG.colors.measureX, m.horizontal + "px");
    if (m.vertical !== null) addMarkedLine(measureLayer, m.ax, m.ay, m.bx, m.by, CONFIG.colors.measureY, m.vertical + "px");
  }

  function updateHighlight(el) {
    if (!el) {
      highlight.style.width = "0";
      highlight.style.height = "0";
      return;
    }
    var r = el.getBoundingClientRect();
    highlight.style.transform = "translate(" + r.left + "px," + r.top + "px)";
    highlight.style.width = r.width + "px";
    highlight.style.height = r.height + "px";
    highlight.style.borderColor = state.isFrozen ? CONFIG.colors.frozen : CONFIG.colors.highlight;
    highlight.style.background = state.isFrozen ? "rgba(255,138,0,.14)" : "rgba(47,123,255,.14)";
  }

  function renderMeasureSection() {
    if (!state.measureMode) return "";
    if (!state.measureA && !state.measureB)
      return '<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.08);font-size:11px;color:#8FA1B3;">测距模式：点击第 1 个元素作为 A。</div>';
    if (state.measureA && !state.measureB)
      return '<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.08);font-size:11px;color:#8FA1B3;">已选 A：点击第 2 个元素作为 B。</div>';
    var m = getMeasureData(state.measureA, state.measureB);
    return section(
      "元素测距",
      [
        row("元素 A", label(state.measureA)),
        row("元素 B", label(state.measureB)),
        row("水平距离", m && m.horizontal !== null ? m.horizontal + "px" : "无"),
        row("垂直距离", m && m.vertical !== null ? m.vertical + "px" : "无")
      ],
      "#FFB45C"
    );
  }

  function renderTooltip(el) {
    if (!el) {
      body.innerHTML =
        '<div style="color:#8FA1B3;">移动到页面元素上开始走查</div>' +
        renderMeasureSection();
      return;
    }
    var style = getComputedStyle(el);
    var textLike = isTextLike(el);
    var padding = boxValues(style, "padding");
    var margin = boxValues(style, "margin");
    var parentGap = getParentGap(el);

    body.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px;">' +
      '<div style="font-weight:700;font-size:12px;color:#FFF;word-break:break-all;">' +
      esc(label(el)) +
      "</div>" +
      '<div style="font-size:11px;color:' +
      (state.isFrozen ? "#FFB45C" : "#8FA1B3") +
      ';">' +
      (state.isFrozen ? "已冻结" : "实时") +
      "</div>" +
      "</div>" +
      section("尺寸", [row("宽", px(style.width)), row("高", px(style.height))]) +
      section(
        "字体",
        textLike
          ? [
              row("字号", px(style.fontSize)),
              row("行高", px(style.lineHeight)),
              row("字重", style.fontWeight),
              row("字族", cleanFontFamily(style.fontFamily)),
              row("文字色", toHexColor(style.color))
            ]
          : []
      ) +
      section("间距", [
        row("内边距", boxText(padding)),
        row("外边距", boxText(margin)),
        row("父级间距", parentGap ? boxText(parentGap) : ""),
        row("当前侧", state.spacingSide)
      ]) +
      section("样式", [row("背景", toHexColor(style.backgroundColor)), row("圆角", px(style.borderRadius))]) +
      renderMeasureSection() +
      '<div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,.08);font-size:11px;color:#8FA1B3;">冻结后边距仍跟随鼠标变化。快捷键：M 测距 | F 冻结 | C 清空测距 | P 固定面板 | ESC 退出</div>';
  }

  function positionTooltip() {
    if (state.dragging) return;
    if (state.panelPinned && state.panelX != null && state.panelY != null) {
      tooltip.style.transform = "translate(" + state.panelX + "px," + state.panelY + "px)";
      return;
    }
    var x = state.mouseX + CONFIG.offsetX;
    var y = state.mouseY + CONFIG.offsetY;
    var rect = tooltip.getBoundingClientRect();
    if (x + rect.width + 12 > window.innerWidth) x = state.mouseX - rect.width - CONFIG.offsetX;
    if (y + rect.height + 12 > window.innerHeight) y = state.mouseY - rect.height - CONFIG.offsetY;
    x = clamp(x, 8, window.innerWidth - rect.width - 8);
    y = clamp(y, 8, window.innerHeight - rect.height - 8);
    tooltip.style.transform = "translate(" + x + "px," + y + "px)";
  }

  function refresh() {
    var el = getActiveEl();
    updateHighlight(el);
    updateBox(selectA, state.measureMode ? state.measureA : null);
    updateBox(selectB, state.measureMode ? state.measureB : null);
    renderTooltip(el);
    positionTooltip();
    addMeasureGuides();
    addSpacingGuides(el);
    btnMeasure.textContent = "测距：" + (state.measureMode ? "开" : "关");
    btnMeasure.style.background = state.measureMode ? "#FF8A00" : "#1F6BFF";
    btnPin.textContent = state.panelPinned ? "已固定" : "固定";
    btnPin.style.background = state.panelPinned ? "#2C8CFF" : "rgba(255,255,255,.08)";
  }

  function schedule() {
    if (state.rafId) return;
    state.rafId = requestAnimationFrame(function () {
      state.rafId = null;
      refresh();
    });
  }

  function fromPoint(x, y) {
    var el = document.elementFromPoint(x, y);
    if (!el || tooltip.contains(el) || el === highlight || el === selectA || el === selectB || el === spacingLayer || el === measureLayer) return null;
    return el;
  }

  function onMouseMove(e) {
    state.mouseX = e.clientX;
    state.mouseY = e.clientY;

    if (state.dragging) {
      state.panelX = clamp(e.clientX - state.dragOffsetX, 8, window.innerWidth - tooltip.offsetWidth - 8);
      state.panelY = clamp(e.clientY - state.dragOffsetY, 8, window.innerHeight - tooltip.offsetHeight - 8);
      tooltip.style.transform = "translate(" + state.panelX + "px," + state.panelY + "px)";
      return;
    }

    var el = fromPoint(e.clientX, e.clientY);
    if (el) state.hoverEl = el;

    if (state.isFrozen && state.frozenEl && !state.measureMode) {
      state.spacingSide = nearestSide(state.frozenEl, e.clientX, e.clientY);
    } else if (el) {
      state.spacingSide = nearestSide(el, e.clientX, e.clientY);
    }

    if (state.isFrozen && !state.measureMode && !state.panelPinned) positionTooltip();
    schedule();
  }

  function onClick(e) {
    if (tooltip.contains(e.target)) return;
    var el = fromPoint(e.clientX, e.clientY);
    if (!el) return;

    if (state.measureMode) {
      if (!state.measureA || (state.measureA && state.measureB)) {
        state.measureA = el;
        state.measureB = null;
      } else if (el !== state.measureA) {
        state.measureB = el;
      }
      state.isFrozen = true;
      state.frozenEl = el;
      schedule();
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (state.isFrozen && state.frozenEl === el) {
      state.isFrozen = false;
      state.frozenEl = null;
      clearLayer(spacingLayer);
    } else {
      state.isFrozen = true;
      state.frozenEl = el;
      state.spacingSide = nearestSide(el, e.clientX, e.clientY);
    }
    schedule();
    e.preventDefault();
    e.stopPropagation();
  }

  function toggleMeasure() {
    state.measureMode = !state.measureMode;
    state.measureA = null;
    state.measureB = null;
    if (state.measureMode) {
      state.isFrozen = true;
      state.frozenEl = state.hoverEl || state.frozenEl;
    }
    schedule();
  }

  function toggleFreeze() {
    var el = state.hoverEl || state.frozenEl;
    if (!el) return;
    state.isFrozen = !state.isFrozen;
    state.frozenEl = state.isFrozen ? el : null;
    if (!state.isFrozen) clearLayer(spacingLayer);
    schedule();
  }

  function togglePin() {
    state.panelPinned = !state.panelPinned;
    var r = tooltip.getBoundingClientRect();
    state.panelX = r.left;
    state.panelY = r.top;
    schedule();
  }

  function clearMeasure() {
    state.measureA = null;
    state.measureB = null;
    clearLayer(measureLayer);
    schedule();
  }

  function onKeyDown(e) {
    var key = (e.key || "").toLowerCase();
    var active = document.activeElement;
    if (active && (active.isContentEditable || /input|textarea|select/.test((active.tagName || "").toLowerCase()))) return;

    if (key === CONFIG.hotkeys.exit || key === "esc") {
      destroy();
    } else if (key === CONFIG.hotkeys.measure) {
      toggleMeasure();
      e.preventDefault();
    } else if (key === CONFIG.hotkeys.freeze) {
      toggleFreeze();
      e.preventDefault();
    } else if (key === CONFIG.hotkeys.clear) {
      clearMeasure();
      e.preventDefault();
    } else if (key === CONFIG.hotkeys.pin) {
      togglePin();
      e.preventDefault();
    }
  }

  function startDrag(e) {
    state.dragging = true;
    state.panelPinned = true;
    var r = tooltip.getBoundingClientRect();
    state.panelX = r.left;
    state.panelY = r.top;
    state.dragOffsetX = e.clientX - r.left;
    state.dragOffsetY = e.clientY - r.top;
    e.preventDefault();
  }

  function stopDrag() {
    state.dragging = false;
  }

  function destroy() {
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("mouseup", stopDrag, true);
    window.removeEventListener("resize", schedule, true);
    window.removeEventListener("scroll", schedule, true);
    head.removeEventListener("mousedown", startDrag, true);
    btnMeasure.removeEventListener("click", onMeasureClick, true);
    btnPin.removeEventListener("click", onPinClick, true);
    btnClose.removeEventListener("click", destroy, true);
    [highlight, selectA, selectB, tooltip, spacingLayer, measureLayer].forEach(function (el) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    if (state.rafId) cancelAnimationFrame(state.rafId);
    delete window.__visualQAInspectorFinal__;
  }

  function onMeasureClick(e) {
    toggleMeasure();
    e.preventDefault();
    e.stopPropagation();
  }

  function onPinClick(e) {
    togglePin();
    e.preventDefault();
    e.stopPropagation();
  }

  btnMeasure.addEventListener("click", onMeasureClick, true);
  btnPin.addEventListener("click", onPinClick, true);
  btnClose.addEventListener("click", destroy, true);
  head.addEventListener("mousedown", startDrag, true);
  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("mouseup", stopDrag, true);
  window.addEventListener("resize", schedule, true);
  window.addEventListener("scroll", schedule, true);

  window.__visualQAInspectorFinal__ = { destroy: destroy };
  refresh();
})();
