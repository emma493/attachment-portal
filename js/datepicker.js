// Modern date picker — classic script, zero dependencies, works on file://.
// Enhances .dp-trigger buttons (see index.html School & Placement step).
// Stores ISO YYYY-MM-DD in the hidden input (same as native <input type=date>
// produced, so validation in wizard.js and Firestore writes are untouched)
// and shows a friendly "12 Mar 2026" label on the trigger.
(function () {
  "use strict";

  var MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  var MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var DOWS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function toISO(y, m, d) { return y + "-" + pad(m + 1) + "-" + pad(d); }
  function parseISO(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    if (!m) return null;
    var y = +m[1], mo = +m[2] - 1, d = +m[3];
    var dt = new Date(y, mo, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
    return { y: y, m: mo, d: d };
  }
  function friendly(iso) {
    var p = parseISO(iso);
    if (!p) return "";
    return p.d + " " + MONTHS_SHORT[p.m] + " " + p.y;
  }
  function hiddenInput(name) {
    var form = document.getElementById("submission-form");
    return form && form.elements ? form.elements.namedItem(name) : null;
  }
  function todayISO() {
    var t = new Date();
    return toISO(t.getFullYear(), t.getMonth(), t.getDate());
  }
  // End date must be after start date: disable days <= start for endDate.
  function minISOFor(target) {
    if (target !== "endDate") return "";
    var s = hiddenInput("startDate");
    return (s && s.value) || "";
  }

  var pop = null;
  var openFor = null;   // target field name
  var viewY = 0, viewM = 0;
  var lastTrigger = null;

  function ensurePop() {
    if (pop) return pop;
    pop = document.createElement("div");
    pop.className = "dp-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Choose a date");
    pop.hidden = true;
    document.body.appendChild(pop);
    return pop;
  }

  function clearFieldError(name) {
    var wrap = document.getElementById("f-" + name);
    var msg = document.getElementById("err-" + name);
    if (wrap) wrap.classList.remove("has-error");
    if (msg) { msg.hidden = true; msg.textContent = ""; }
    var h = hiddenInput(name);
    if (h && h.removeAttribute) h.removeAttribute("aria-invalid");
    var list = document.getElementById("error-list");
    if (list) {
      var links = list.querySelectorAll('a[href="#f-' + name + '"]');
      for (var i = 0; i < links.length; i++) {
        var li = links[i].closest("li");
        if (li) li.remove();
      }
      if (!list.children.length) {
        var sum = document.getElementById("error-summary");
        if (sum) sum.hidden = true;
        var st = document.getElementById("form-status");
        if (st && /fix the problems/i.test(st.textContent || "")) {
          st.textContent = ""; st.className = "";
        }
      }
    }
  }

  function setValue(name, iso) {
    var h = hiddenInput(name);
    if (h) {
      h.value = iso || "";
      h.dispatchEvent(new Event("change", { bubbles: true }));
    }
    var trigger = document.querySelector('.dp-trigger[data-target="' + name + '"]');
    var label = trigger ? trigger.querySelector(".dp-value") : null;
    if (label) {
      if (iso) {
        label.textContent = friendly(iso);
        label.classList.remove("is-placeholder");
      } else {
        label.textContent = "DD / MM / YYYY";
        label.classList.add("is-placeholder");
      }
    }
    // Keep end > start: choosing a start that covers the end clears the end.
    if (name === "startDate" && iso) {
      var e = hiddenInput("endDate");
      if (e && e.value && e.value <= iso) setValue("endDate", "");
    }
  }

  function close(returnFocus) {
    if (!pop || pop.hidden) return;
    pop.hidden = true;
    openFor = null;
    document.removeEventListener("pointerdown", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
    if (returnFocus && lastTrigger && lastTrigger.focus) lastTrigger.focus({ preventScroll: true });
    lastTrigger = null;
  }

  function onOutside(e) {
    if (pop && !pop.hidden && !pop.contains(e.target) && !(lastTrigger && lastTrigger.contains(e.target))) {
      close(false);
    }
  }
  function onKey(e) {
    if (!pop || pop.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); close(true); }
  }

  function position(trigger) {
    var sheet = window.matchMedia && window.matchMedia("(max-width: 720px)").matches;
    if (sheet) {
      pop.style.position = "fixed";
      pop.style.left = "12px";
      pop.style.right = "12px";
      pop.style.bottom = "12px";
      pop.style.top = "auto";
      pop.style.width = "auto";
      return;
    }
    pop.style.position = "absolute";
    pop.style.right = "auto";
    pop.style.bottom = "auto";
    pop.style.width = "";
    var r = trigger.getBoundingClientRect();
    var top = r.bottom + window.scrollY + 6;
    var left = Math.max(8 + window.scrollX,
      Math.min(r.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - 336));
    pop.style.top = top + "px";
    pop.style.left = left + "px";
  }

  function render() {
    var minISO = minISOFor(openFor);
    var cur = parseISO((hiddenInput(openFor) || {}).value || "");
    var t = todayISO();

    var html = '<div class="dp-head">' +
      '<button type="button" class="dp-nav" data-nav="-1" aria-label="Previous month">‹</button>' +
      '<div class="dp-selects">' +
      '<select class="dp-month" aria-label="Month">' +
      MONTHS.map(function (m, i) {
        return '<option value="' + i + '"' + (i === viewM ? " selected" : "") + ">" + m + "</option>";
      }).join("") + "</select>" +
      '<select class="dp-year" aria-label="Year"></select>' +
      "</div>" +
      '<button type="button" class="dp-nav" data-nav="1" aria-label="Next month">›</button>' +
      "</div>" +
      '<div class="dp-grid" role="grid" aria-label="' + MONTHS[viewM] + " " + viewY + '">';
    DOWS.forEach(function (d) { html += '<div class="dp-dow">' + d + "</div>"; });

    // Monday-first grid, always 42 cells for stable arrow-key math.
    var first = (new Date(viewY, viewM, 1).getDay() + 6) % 7;
    for (var i = 0; i < 42; i++) {
      var dt = new Date(viewY, viewM, 1 - first + i);
      var iso = toISO(dt.getFullYear(), dt.getMonth(), dt.getDate());
      var cls = "dp-day" +
        (dt.getMonth() !== viewM ? " is-outside" : "") +
        (iso === t ? " is-today" : "") +
        (cur && iso === cur.y + "-" + pad(cur.m + 1) + "-" + pad(cur.d) ? " is-selected" : "");
      var dis = (minISO && iso <= minISO) ? " disabled" : "";
      html += '<button type="button" role="gridcell" class="' + cls + '" data-iso="' + iso + '"' + dis +
        ' aria-label="' + friendly(iso) + '"' +
        (cur && iso === cur.y + "-" + pad(cur.m + 1) + "-" + pad(cur.d) ? ' aria-selected="true"' : "") +
        ">" + dt.getDate() + "</button>";
    }
    html += "</div>" +
      '<div class="dp-foot">' +
      '<button type="button" class="dp-today">Today</button>' +
      '<button type="button" class="dp-clear">Clear</button>' +
      "</div>";

    pop.innerHTML = html;

    var yearSel = pop.querySelector(".dp-year");
    var cy = new Date().getFullYear();
    var opts = "";
    for (var y = cy - 10; y <= cy + 10; y++) {
      opts += '<option value="' + y + '"' + (y === viewY ? " selected" : "") + ">" + y + "</option>";
    }
    yearSel.innerHTML = opts;

    pop.querySelectorAll("[data-nav]").forEach(function (b) {
      b.addEventListener("click", function () {
        var n = new Date(viewY, viewM + Number(b.getAttribute("data-nav")), 1);
        viewY = n.getFullYear(); viewM = n.getMonth();
        render();
      });
    });
    pop.querySelector(".dp-month").addEventListener("change", function (e) {
      viewM = Number(e.target.value);
      render();
      pop.querySelector(".dp-month").focus();
    });
    yearSel.addEventListener("change", function (e) {
      viewY = Number(e.target.value);
      render();
      pop.querySelector(".dp-year").focus();
    });

    var days = Array.prototype.slice.call(pop.querySelectorAll(".dp-day"));
    days.forEach(function (d, idx) {
      d.addEventListener("click", function () {
        if (d.disabled) return;
        setValue(openFor, d.getAttribute("data-iso"));
        clearFieldError(openFor);
        close(true);
      });
      d.addEventListener("keydown", function (e) {
        var target = null;
        if (e.key === "ArrowRight") target = days[idx + 1];
        else if (e.key === "ArrowLeft") target = days[idx - 1];
        else if (e.key === "ArrowDown") target = days[idx + 7];
        else if (e.key === "ArrowUp") target = days[idx - 7];
        else if (e.key === "Home") target = days[idx - ((idx % 7 + 7) % 7)];
        else if (e.key === "End") target = days[idx + (6 - ((idx % 7 + 7) % 7))];
        if (target) {
          e.preventDefault();
          // Skip disabled days in the direction of travel.
          var step = (target === days[idx + 1] || target === days[idx - 1]) ? (e.key === "ArrowRight" ? 1 : -1) : 0;
          while (target && target.disabled && step !== 0) {
            idx += step;
            target = days[idx + (step > 0 ? 1 : -1)] || null;
            if (target) idx += (step > 0 ? 1 : -1);
          }
          if (target && !target.disabled) target.focus();
          else d.focus();
        }
      });
    });

    pop.querySelector(".dp-today").addEventListener("click", function () {
      var p = parseISO(t);
      viewY = p.y; viewM = p.m;
      var min = minISOFor(openFor);
      if (!min || t > min) {
        setValue(openFor, t);
        clearFieldError(openFor);
        close(true);
      } else {
        render(); // today is disabled — just navigate there
      }
    });
    pop.querySelector(".dp-clear").addEventListener("click", function () {
      setValue(openFor, "");
      clearFieldError(openFor);
      close(true);
    });
  }

  function open(trigger) {
    ensurePop();
    var target = trigger.getAttribute("data-target");
    if (openFor === target && !pop.hidden) { close(true); return; }
    openFor = target;
    lastTrigger = trigger;
    var cur = parseISO((hiddenInput(target) || {}).value || "") || parseISO(todayISO());
    viewY = cur.y; viewM = cur.m;
    pop.hidden = false;
    render();
    position(trigger);
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
    // Focus selected day, else today, else first enabled day.
    var sel = pop.querySelector(".dp-day.is-selected:not(:disabled)") ||
      pop.querySelector('.dp-day[data-iso="' + todayISO() + '"]:not(:disabled)') ||
      pop.querySelector(".dp-day:not(:disabled)");
    if (sel) sel.focus({ preventScroll: true });
  }

  document.querySelectorAll(".dp-trigger").forEach(function (t) {
    t.addEventListener("click", function () { open(t); });
  });
  window.addEventListener("resize", function () {
    if (pop && !pop.hidden && lastTrigger) position(lastTrigger);
  });

  window.__datepicker = { open: open, close: close, friendly: friendly };
})();
