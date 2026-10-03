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
        label.textContent = "Pick a date";
        label.classList.add("is-placeholder");
      }
    }
    // Keep end > start: choosing a start that covers the end clears the end.
    if (name === "startDate" && iso) {
      var e = hiddenInput("endDate");
      if (e && e.value && e.value <= iso) setValue("endDate", "");
    }
    if (window.__wizard && window.__wizard.updateDuration) {
      try { window.__wizard.updateDuration(); } catch (err) { /* noop */ }
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
    if (e.key === "Escape") {
      e.preventDefault();
      var openList = pop.querySelector(".dp-dd-list:not([hidden])");
      if (openList) {
        var dd = openList.closest(".dp-dd");
        openList.hidden = true;
        if (dd) {
          dd.classList.remove("is-open");
          var b = dd.querySelector(".dp-dd-btn");
          if (b) { b.setAttribute("aria-expanded", "false"); b.focus(); }
        }
        return;
      }
      close(true);
    }
  }

  function position(trigger) {
    var sheet = window.matchMedia && window.matchMedia("(max-width: 720px)").matches;
    if (sheet) {
      pop.style.position = "fixed";
      pop.style.left = "12px";
      pop.style.right = "12px";
      pop.style.bottom = "calc(12px + env(safe-area-inset-bottom, 0px))";
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

    var CHEV = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
    var cy0 = new Date().getFullYear();
    var yearHtml = "";
    for (var yy = cy0 - 10; yy <= cy0 + 10; yy++) {
      yearHtml += '<button type="button" role="option" class="dp-dd-opt' + (yy === viewY ? " is-selected" : "") + '" data-value="' + yy + '"' +
        (yy === viewY ? ' aria-selected="true"' : "") + ">" + yy + "</button>";
    }

    var html = '<div class="dp-head">' +
      '<button type="button" class="dp-nav" data-nav="-1" aria-label="Previous month">‹</button>' +
      '<div class="dp-selects">' +
      '<div class="dp-dd" data-dd="month">' +
      '<button type="button" class="dp-dd-btn" aria-haspopup="listbox" aria-expanded="false" aria-label="Month, ' + MONTHS[viewM] + '">' +
      "<span>" + MONTHS[viewM] + "</span>" + CHEV +
      "</button>" +
      '<div class="dp-dd-list" role="listbox" aria-label="Month" hidden>' +
      MONTHS.map(function (m, i) {
        return '<button type="button" role="option" class="dp-dd-opt' + (i === viewM ? " is-selected" : "") + '" data-value="' + i + '"' +
          (i === viewM ? ' aria-selected="true"' : "") + ">" + m + "</button>";
      }).join("") +
      "</div></div>" +
      '<div class="dp-dd" data-dd="year">' +
      '<button type="button" class="dp-dd-btn" aria-haspopup="listbox" aria-expanded="false" aria-label="Year, ' + viewY + '">' +
      "<span>" + viewY + "</span>" + CHEV +
      "</button>" +
      '<div class="dp-dd-list" role="listbox" aria-label="Year" hidden>' + yearHtml + "</div>" +
      "</div>" +
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

    function closeDD() {
      pop.querySelectorAll(".dp-dd-list").forEach(function (l) { l.hidden = true; });
      pop.querySelectorAll(".dp-dd").forEach(function (d) {
        d.classList.remove("is-open");
        d.querySelector(".dp-dd-btn").setAttribute("aria-expanded", "false");
      });
    }

    pop.querySelectorAll(".dp-dd").forEach(function (dd) {
      var btn = dd.querySelector(".dp-dd-btn");
      var list = dd.querySelector(".dp-dd-list");
      var kind = dd.getAttribute("data-dd");
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var willOpen = list.hidden;
        closeDD();
        if (willOpen) {
          list.hidden = false;
          dd.classList.add("is-open");
          btn.setAttribute("aria-expanded", "true");
          var sel = list.querySelector(".is-selected") || list.querySelector(".dp-dd-opt");
          if (sel) {
            try { sel.scrollIntoView({ block: "nearest" }); } catch (err) { /* older browsers */ }
            sel.focus();
          }
        }
      });
      list.querySelectorAll(".dp-dd-opt").forEach(function (opt) {
        opt.addEventListener("click", function () {
          var v = Number(opt.getAttribute("data-value"));
          if (kind === "month") viewM = v; else viewY = v;
          render();
          var nb = pop.querySelector('.dp-dd[data-dd="' + kind + '"] .dp-dd-btn');
          if (nb) nb.focus();
        });
        opt.addEventListener("keydown", function (e) {
          var opts = Array.prototype.slice.call(list.querySelectorAll(".dp-dd-opt"));
          var i = opts.indexOf(opt);
          var cols = kind === "month" ? 2 : 3;
          var n2 = null;
          if (e.key === "ArrowRight") n2 = i + 1;
          else if (e.key === "ArrowLeft") n2 = i - 1;
          else if (e.key === "ArrowDown") n2 = i + cols;
          else if (e.key === "ArrowUp") n2 = i - cols;
          else if (e.key === "Escape") { e.preventDefault(); closeDD(); btn.focus(); return; }
          else if (e.key === "Tab") { closeDD(); return; }
          else return;
          e.preventDefault();
          if (opts[n2]) opts[n2].focus();
        });
      });
      dd.addEventListener("focusout", function (e) {
        if (!dd.contains(e.relatedTarget)) {
          list.hidden = true;
          dd.classList.remove("is-open");
          btn.setAttribute("aria-expanded", "false");
        }
      });
    });

    pop.querySelectorAll("[data-nav]").forEach(function (b) {
      b.addEventListener("click", function () {
        var dir = b.getAttribute("data-nav");
        var n = new Date(viewY, viewM + Number(dir), 1);
        viewY = n.getFullYear(); viewM = n.getMonth();
        render();
        var nb2 = pop.querySelector('[data-nav="' + dir + '"]');
        if (nb2) nb2.focus();
      });
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
        var n = null;
        if (e.key === "ArrowRight") n = idx + 1;
        else if (e.key === "ArrowLeft") n = idx - 1;
        else if (e.key === "ArrowDown") n = idx + 7;
        else if (e.key === "ArrowUp") n = idx - 7;
        else if (e.key === "Home") n = idx - (idx % 7);
        else if (e.key === "End") n = idx + (6 - (idx % 7));
        else return;
        e.preventDefault();
        // Skip disabled days, continuing in the same direction.
        var dir = 0;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") dir = e.key === "ArrowRight" ? 1 : 7;
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") dir = e.key === "ArrowLeft" ? -1 : -7;
        while (n >= 0 && n < days.length && days[n].disabled && dir !== 0) n += dir;
        var t2 = days[n];
        if (t2 && !t2.disabled) t2.focus();
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
