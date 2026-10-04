// Lynx landing page: theme toggle, tabbed views, code tabs + copy, scroll reveals. No dependencies.
(function () {
  "use strict";

  var root = document.documentElement;
  var lightQuery = window.matchMedia("(prefers-color-scheme: light)");

  /* ---------- Theme (system / light / dark) ---------- */
  function readMode() {
    try {
      return localStorage.getItem("lynx-theme") || "system";
    } catch (e) {
      return "system";
    }
  }

  function applyMode(mode) {
    var resolved = mode === "system" ? (lightQuery.matches ? "light" : "dark") : mode;
    root.dataset.theme = resolved;
    root.dataset.mode = mode;
    document.querySelectorAll(".theme button").forEach(function (b) {
      b.setAttribute("aria-checked", String(b.dataset.mode === mode));
    });
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", resolved === "light" ? "#f7f7fb" : "#090a0f");
  }

  document.querySelectorAll(".theme button").forEach(function (b) {
    b.addEventListener("click", function () {
      try {
        localStorage.setItem("lynx-theme", b.dataset.mode);
      } catch (e) {}
      applyMode(b.dataset.mode);
    });
  });
  lightQuery.addEventListener("change", function () {
    if (readMode() === "system") applyMode("system");
  });
  applyMode(readMode());

  /* ---------- Tabs (shared by product views and code blocks) ---------- */
  function wireTabs(tablist, onSelect) {
    var tabs = Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"]'));
    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
      });
      if (focus) tab.focus();
      onSelect(tab);
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () {
        select(tab, false);
      });
      tab.addEventListener("keydown", function (e) {
        var next = null;
        if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
        if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
        if (e.key === "Home") next = tabs[0];
        if (e.key === "End") next = tabs[tabs.length - 1];
        if (next) {
          e.preventDefault();
          select(next, true);
        }
      });
    });
  }

  var viewTabs = document.querySelector(".tabs");
  var viewPanel = document.getElementById("panel-views");
  if (viewTabs && viewPanel) {
    wireTabs(viewTabs, function (tab) {
      var v = tab.dataset.view;
      viewPanel.setAttribute("aria-labelledby", tab.id);
      viewPanel.querySelectorAll("[data-view-img]").forEach(function (img) {
        img.classList.toggle("is-active", img.dataset.viewImg === v);
      });
      viewPanel.querySelectorAll("[data-caption]").forEach(function (c) {
        c.classList.toggle("is-active", c.dataset.caption === v);
      });
    });
  }

  var codeTabs = document.querySelector(".code-tabs");
  if (codeTabs) {
    wireTabs(codeTabs, function (tab) {
      document.querySelectorAll("[data-code-panel]").forEach(function (p) {
        p.classList.toggle("is-active", p.dataset.codePanel === tab.dataset.code);
      });
    });
  }

  /* ---------- Copy commands ---------- */
  var copyBtn = document.querySelector(".copy");
  if (copyBtn) {
    var label = copyBtn.querySelector("span");
    var icon = copyBtn.querySelector("i");
    var timer;
    copyBtn.addEventListener("click", function () {
      var active = document.querySelector("[data-code-panel].is-active");
      if (!active || !navigator.clipboard) return;
      navigator.clipboard.writeText(active.innerText.trim()).then(function () {
        copyBtn.classList.add("is-done");
        label.textContent = "Copied";
        icon.className = "ph ph-check";
        clearTimeout(timer);
        timer = setTimeout(function () {
          copyBtn.classList.remove("is-done");
          label.textContent = "Copy";
          icon.className = "ph ph-copy";
        }, 1800);
      });
    });
  }

  /* ---------- Nav border once the page has scrolled ---------- */
  var nav = document.querySelector(".nav");
  var sentinel = document.getElementById("nav-sentinel");
  if (nav && sentinel && "IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      nav.classList.toggle("is-scrolled", !entries[0].isIntersecting);
    }).observe(sentinel);
  }

  /* ---------- Swarm pulse: primary CTAs send a ring through the particle field ---------- */
  document.querySelectorAll(".hero .btn-primary").forEach(function (btn) {
    btn.addEventListener("pointerenter", function () {
      if (!window.lynxSwarm) return;
      var r = btn.getBoundingClientRect();
      window.lynxSwarm.pulse(r.left + r.width / 2, r.top + r.height / 2);
    });
  });

  /* ---------- Scroll reveals ---------- */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.15 }
    );
    reveals.forEach(function (el) {
      io.observe(el);
    });
  } else {
    reveals.forEach(function (el) {
      el.classList.add("is-in");
    });
  }
})();
